import {
  candidateName,
  daysFromCivil,
  parseIsoDate,
  sumPerDepartement,
  type Actor,
  type GameState,
  type ParrainageChange,
  type ParrainagesState,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { largestRemainder } from '../election/apportion';
import { payAdvance, stochasticRound, type FinanceBook } from './finances';

// Parrainages (§6) : promesses d'élus → intentions confirmées → présentations reçues par le
// Conseil constitutionnel → présentations validées. Règle officielle (jeu de règles) : 500
// présentations d'au moins 30 départements, au plus un dixième d'un même département.

type Stage = 'promesses' | 'intentions' | 'recues' | 'validees';
const STAGES: Stage[] = ['promesses', 'intentions', 'recues', 'validees'];

export function emptyParrainages(): ParrainagesState {
  return { promesses: {}, intentions: {}, recues: {}, validees: {}, invalides: {} };
}

const ACTIVE = new Set(['candidat', 'qualifie']);

const DEPARTEMENTS = new WeakMap<Ruleset, readonly string[]>();

/** Départements du réservoir, dans un ordre stable (calculé une fois par jeu de règles). */
export function departements(ruleset: Ruleset): readonly string[] {
  let list = DEPARTEMENTS.get(ruleset);
  if (!list) {
    list = Object.keys(ruleset.parrainages.reservoir.departements).sort(compareStrings);
    DEPARTEMENTS.set(ruleset, list);
  }
  return list;
}

/** Élus mobilisables dans un département (part du réservoir, hypothèse de jeu). */
export function pool(ruleset: Ruleset, dep: string): number {
  const entry = ruleset.parrainages.reservoir.departements[dep];
  return entry ? Math.floor(entry.elus * ruleset.parrainages.dynamique.partMobilisable) : 0;
}

/** Élus d'un département déjà engagés auprès d'un candidat (un élu ne parraine qu'une fois). */
export function committed(state: GameState, dep: string): number {
  let total = 0;
  for (const actor of Object.values(state.actors)) {
    const p = actor.parrainages;
    total += (p.promesses[dep] ?? 0) + (p.intentions[dep] ?? 0) + (p.recues[dep] ?? 0);
  }
  return total;
}

/** Élus engagés, pour tous les départements à la fois. */
export function committedByDepartement(state: GameState): Map<string, number> {
  const totals = new Map<string, number>();
  for (const actor of Object.values(state.actors)) {
    const p = actor.parrainages;
    for (const counts of [p.promesses, p.intentions, p.recues]) {
      for (const [dep, n] of Object.entries(counts)) totals.set(dep, (totals.get(dep) ?? 0) + n);
    }
  }
  return totals;
}

/**
 * Élus encore libres dans un département. `engaged` (facultatif) évite de recompter les
 * engagements quand on examine beaucoup de départements à la fois.
 */
export function available(
  state: GameState,
  ruleset: Ruleset,
  dep: string,
  engaged?: ReadonlyMap<string, number>,
): number {
  const used = engaged ? (engaged.get(dep) ?? 0) : committed(state, dep);
  return Math.max(0, pool(ruleset, dep) - used);
}

/** Nombre maximal de présentations comptées par département (un dixième du seuil). */
export function perDepartementCap(ruleset: Ruleset): number {
  const { seuil, partMaxParDepartement } = ruleset.parrainages;
  return Math.floor(seuil * partMaxParDepartement);
}

/**
 * Présentations validées qui comptent pour le seuil (au plus un dixième par département) et
 * nombre de départements représentés. Les présentations invalidées ne comptent jamais.
 */
export function countedPresentations(parrainages: ParrainagesState, ruleset: Ruleset) {
  const cap = perDepartementCap(ruleset);
  let counted = 0;
  let deps = 0;
  for (const n of Object.values(parrainages.validees)) {
    if (n <= 0) continue;
    counted += Math.min(n, cap);
    deps += 1;
  }
  return { counted, departements: deps, cap };
}

export function meetsThreshold(parrainages: ParrainagesState, ruleset: Ruleset): boolean {
  const { counted, departements: deps } = countedPresentations(parrainages, ruleset);
  return counted >= ruleset.parrainages.seuil && deps >= ruleset.parrainages.departementsMin;
}

/**
 * Projection prudente pour l'IA et l'interface : présentations validées, plus celles en cours
 * d'envoi, plus les intentions et une partie des promesses, au plus un dixième par département.
 */
export function projectedPresentations(actor: Actor, ruleset: Ruleset) {
  const cap = perDepartementCap(ruleset);
  const p = actor.parrainages;
  const valid = 1 - ruleset.parrainages.dynamique.tauxInvalidite;
  let counted = 0;
  let deps = 0;
  for (const dep of departements(ruleset)) {
    const expected =
      (p.validees[dep] ?? 0) + valid * ((p.intentions[dep] ?? 0) + 0.5 * (p.promesses[dep] ?? 0));
    if (expected <= 0) continue;
    counted += Math.min(expected, cap);
    deps += 1;
  }
  return { counted: Math.floor(counted), departements: deps };
}

/**
 * Promesses de départ d'un candidat : une part dans ses régions d'implantation, le reste dans
 * tout le pays, au prorata des élus de chaque département et dans la limite des élus encore
 * disponibles (les candidats sont servis dans l'ordre de leur identifiant).
 */
export function initialPromises(
  state: GameState,
  ruleset: Ruleset,
  total: number,
  implantation: readonly string[],
): Record<string, number> {
  const deps = departements(ruleset);
  const reservoir = ruleset.parrainages.reservoir.departements;
  const local = deps.filter((d) => implantation.includes(reservoir[d]!.region));
  const localShare = local.length ? ruleset.parrainages.dynamique.partImplantation : 0;
  const localTotal = Math.round(total * localShare);
  const result: Record<string, number> = {};
  const engaged = committedByDepartement(state);
  const spread = (targets: readonly string[], amount: number) => {
    if (amount <= 0 || targets.length === 0) return;
    const parts = largestRemainder(
      amount,
      targets.map((d) => reservoir[d]!.elus),
    );
    targets.forEach((d, i) => {
      const room = available(state, ruleset, d, engaged) - (result[d] ?? 0);
      const n = Math.min(parts[i]!, Math.max(0, room));
      if (n > 0) result[d] = (result[d] ?? 0) + n;
    });
  };
  spread(local, localTotal);
  spread(deps, total - localTotal);
  return result;
}

/** Collecte des variations de parrainages de la semaine (bilan), par acteur. */
export class ParrainageBook {
  private readonly changes = new Map<string, ParrainageChange>();

  record(actorId: string, stage: Stage | 'invalides', value: number, label: string): void {
    if (value === 0) return;
    let change = this.changes.get(actorId);
    if (!change) {
      change = {
        actorId,
        promesses: 0,
        intentions: 0,
        recues: 0,
        validees: 0,
        invalides: 0,
        facteurs: [],
      };
      this.changes.set(actorId, change);
    }
    change[stage] += value;
    const factor = change.facteurs.find((f) => f.label === label);
    if (factor) factor.value += value;
    else change.facteurs.push({ label, value });
  }

  list(): ParrainageChange[] {
    return [...this.changes.values()].sort((a, b) => compareStrings(a.actorId, b.actorId));
  }
}

const add = (counts: Record<string, number>, dep: string, n: number) => {
  const value = (counts[dep] ?? 0) + n;
  if (value === 0) delete counts[dep];
  else counts[dep] = value;
};

/**
 * Promesses obtenues par une action dans un département, dans la limite des élus encore libres.
 * Renvoie le nombre de promesses effectivement obtenues.
 */
export function gainPromises(
  state: GameState,
  ruleset: Ruleset,
  book: ParrainageBook,
  actorId: string,
  dep: string,
  wanted: number,
  label: string,
): number {
  const n = Math.min(Math.max(0, wanted), available(state, ruleset, dep));
  if (n > 0) {
    add(state.actors[actorId]!.parrainages.promesses, dep, n);
    book.record(actorId, 'promesses', n, label);
  }
  return n;
}

function echeanceDate(ruleset: Ruleset, id: string): string {
  const echeance = ruleset.calendrier.echeances.find((e) => e.id === id);
  if (!echeance) throw new Error(`Échéance inconnue : ${id}`);
  return echeance.date;
}

/** Jours entre deux dates ISO (calendrier civil, sans horloge). */
function daysBetween(from: string, to: string): number {
  return daysFromCivil(parseIsoDate(to)!) - daysFromCivil(parseIsoDate(from)!);
}

/** Situation de la semaine commençant le lundi `weekStart` vis-à-vis de l'envoi des présentations. */
export function presentationWindow(weekStart: string, ruleset: Ruleset) {
  const opening = echeanceDate(ruleset, ruleset.parrainages.ouvertureEcheanceId);
  const closing = echeanceDate(ruleset, ruleset.parrainages.clotureEcheanceId);
  const toOpening = daysBetween(weekStart, opening);
  const toClosing = daysBetween(weekStart, closing);
  return {
    opening,
    closing,
    open: toOpening <= 6 && toClosing >= 0,
    closingWeek: toClosing >= 0 && toClosing <= 6,
    closed: toClosing < 0,
  };
}

/**
 * Étape 9 : progression hebdomadaire des parrainages de chaque candidat en lice (conversion
 * des promesses, renoncements, envois pendant la période de présentation, contrôle par le
 * Conseil constitutionnel), puis, la semaine de la clôture, liste des candidats retenus :
 * ceux qui n'atteignent pas le seuil sont écartés du premier tour ; les autres reçoivent
 * l'avance forfaitaire.
 */
export function weeklyParrainages(
  state: GameState,
  ruleset: Ruleset,
  book: ParrainageBook,
  finances: FinanceBook,
  step: number,
): ReportEvent[] {
  if (state.campagne.parrainages !== 'modelise' || state.meta.phase !== 'campagne') return [];
  const window = presentationWindow(state.meta.date, ruleset);
  if (window.closed) return [];
  const { dynamique } = ruleset.parrainages;
  const week = state.meta.week;
  const actors = Object.values(state.actors)
    .filter((a) => ACTIVE.has(a.status))
    .sort((a, b) => compareStrings(a.id, b.id));

  for (const actor of actors) {
    const p = actor.parrainages;
    const conversion = Math.min(
      0.95,
      dynamique.conversionHebdo *
        Math.min(
          1.5,
          Math.max(0.25, 0.5 + (actor.resources.popularite - 2000) / 4000 + (actor.equipe - 0.5)),
        ),
    );
    // Un flux d'aléa par candidat, tiré département par département dans l'ordre des codes.
    const rng = stream(state.meta.seed, week, 'parrainages', actor.id);
    for (const dep of departements(ruleset)) {
      const promesses = p.promesses[dep] ?? 0;
      const intentions = p.intentions[dep] ?? 0;
      if (promesses === 0 && intentions === 0) continue;
      const lost = Math.min(
        promesses,
        stochasticRound(promesses * dynamique.renoncementHebdo, rng),
      );
      const converted = Math.min(
        promesses - lost,
        stochasticRound((promesses - lost) * conversion, rng),
      );
      if (lost) {
        add(p.promesses, dep, -lost);
        book.record(actor.id, 'promesses', -lost, 'Promesses abandonnées par des élus');
      }
      if (converted) {
        add(p.promesses, dep, -converted);
        add(p.intentions, dep, converted);
        book.record(actor.id, 'promesses', -converted, 'Promesses confirmées');
        book.record(actor.id, 'intentions', converted, 'Promesses confirmées');
      }
      if (!window.open) continue;
      const ready = p.intentions[dep] ?? 0;
      const sent = window.closingWeek ? ready : stochasticRound(ready * dynamique.envoiHebdo, rng);
      if (sent === 0) continue;
      const invalid = Math.min(sent, stochasticRound(sent * dynamique.tauxInvalidite, rng));
      add(p.intentions, dep, -sent);
      add(p.recues, dep, sent);
      add(p.validees, dep, sent - invalid);
      book.record(
        actor.id,
        'intentions',
        -sent,
        'Présentations envoyées au Conseil constitutionnel',
      );
      book.record(actor.id, 'recues', sent, 'Présentations reçues par le Conseil constitutionnel');
      book.record(actor.id, 'validees', sent - invalid, 'Présentations validées');
      if (invalid) {
        p.invalides.formulaire_irregulier = (p.invalides.formulaire_irregulier ?? 0) + invalid;
        book.record(
          actor.id,
          'invalides',
          invalid,
          'Présentations invalidées (formulaire irrégulier)',
        );
      }
    }
  }
  return window.closingWeek ? closeNominations(state, ruleset, finances, step) : [];
}

/**
 * Clôture des présentations : seuls les candidats ayant le nombre requis de présentations
 * valides, réparties comme la loi l'exige, figurent au premier tour. Règle de secours du jeu
 * (hypothèse) : s'il en restait moins de deux, les deux mieux pourvus sont retenus.
 */
function closeNominations(
  state: GameState,
  ruleset: Ruleset,
  finances: FinanceBook,
  step: number,
): ReportEvent[] {
  const week = state.meta.week;
  const contenders = Object.values(state.actors)
    .filter((a) => a.status === 'candidat')
    .sort((a, b) => compareStrings(a.id, b.id));
  const counted = new Map(
    contenders.map((a) => [a.id, countedPresentations(a.parrainages, ruleset)] as const),
  );
  let retained = new Set(
    contenders.filter((a) => meetsThreshold(a.parrainages, ruleset)).map((a) => a.id),
  );
  const fallback = retained.size < 2;
  if (fallback) {
    retained = new Set(
      [...contenders]
        .sort(
          (a, b) =>
            counted.get(b.id)!.counted - counted.get(a.id)!.counted || compareStrings(a.id, b.id),
        )
        .slice(0, 2)
        .map((a) => a.id),
    );
  }
  const events: ReportEvent[] = [];
  const { seuil, departementsMin } = ruleset.parrainages;
  for (const actor of contenders) {
    const c = counted.get(actor.id)!;
    const name = candidateName(actor.candidate);
    if (retained.has(actor.id)) {
      payAdvance(finances, ruleset, actor, step);
      continue;
    }
    actor.status = 'ecarte';
    events.push({
      id: `parrainages-${week}-${actor.id}`,
      kind: 'evenement',
      refId: 'cloture-parrainages',
      label: `${name} n’est pas candidat(e) : présentations insuffisantes`,
      description: `${c.counted} présentations valides comptées sur ${seuil} requises, dans ${c.departements} départements sur ${departementsMin} requis (au plus ${c.cap} comptées par département).`,
      nature: 'simule',
      majeur: actor.id === state.player.actorId,
      decisionId: null,
    });
  }
  events.unshift({
    id: `liste-candidats-${week}`,
    kind: 'evenement',
    refId: 'liste-des-candidats',
    label: `Liste des candidats arrêtée : ${retained.size} candidat(e)s au premier tour`,
    description: fallback
      ? 'Moins de deux candidats atteignaient le seuil : règle de secours du jeu (hypothèse), les deux candidats ayant le plus de présentations valides sont retenus.'
      : `Présentations closes ; chaque candidat retenu a au moins ${seuil} présentations valides de ${departementsMin} départements. Avance forfaitaire versée aux candidats retenus.`,
    nature: 'simule',
    majeur: true,
    decisionId: null,
  });
  return events;
}

/** Total d'une étape des parrainages, tous départements confondus. */
export function stageTotal(parrainages: ParrainagesState, stage: Stage): number {
  return sumPerDepartement(parrainages[stage]);
}
export { STAGES };
