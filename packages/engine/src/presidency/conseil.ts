import {
  postOfDomain,
  type CouncilReport,
  type GameState,
  type MemberRef,
  type MinisterTrack,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { proximity } from '../ai/relations';
import { proposalsById } from '../campaign/programme';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import {
  presidentOf,
  proposeReplacement,
  requestMinisterDecision,
  wasPromised,
} from './government';
import { memberInCharge, memberName, memberTraits } from './members';

// Conseil des ministres (phase 15 ; Constitution, art. 9 : le président préside le Conseil des
// ministres ; rythme hebdomadaire : usage). Chaque membre du gouvernement a une popularité prêtée
// (centièmes ; hypothèse du jeu, jamais un sondage) et une loyauté envers le président (0 à 100),
// qui évoluent chaque semaine par des facteurs nommés : usure au poste, retour vers leur valeur
// de référence, popularité du président, crises, urgences et textes de leur domaine. Sous des
// seuils, un départ simulé devient possible (motif neutre, aucun propos ni scandale prêtés) ; le
// Premier ministre propose aussitôt un remplaçant. Le compte rendu de la semaine reprend tout.

type TrackFactor = { label: string; value: number };
type Facts = { faits: string[]; popularite: TrackFactor[]; loyaute: TrackFactor[] };
type Departure = CouncilReport['departs'][number];

/** Faits de la semaine relevés pour chaque membre du gouvernement, et départs. */
export class CouncilBook {
  private readonly facts = new Map<string, Facts>();
  readonly departs: Departure[] = [];

  /** Fait de la semaine pour un membre, avec ses effets sur sa popularité prêtée et sa loyauté. */
  note(ref: string, fait: string, effects: { popularite?: number; loyaute?: number } = {}): void {
    let entry = this.facts.get(ref);
    if (!entry) {
      entry = { faits: [], popularite: [], loyaute: [] };
      this.facts.set(ref, entry);
    }
    entry.faits.push(fait);
    if (effects.popularite) entry.popularite.push({ label: fait, value: effects.popularite });
    if (effects.loyaute) entry.loyaute.push({ label: fait, value: effects.loyaute });
  }

  of(ref: string): Facts {
    return this.facts.get(ref) ?? { faits: [], popularite: [], loyaute: [] };
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Membres du gouvernement en place : le Premier ministre (poste null), puis les ministres. */
function members(state: GameState): { member: MemberRef; posteId: string | null }[] {
  const government = state.quinquennat?.gouvernement;
  if (!government) return [];
  return [
    { member: government.premierMinistre, posteId: null },
    ...government.ministres.map((m) => ({ member: m, posteId: m.posteId })),
  ];
}

/**
 * Loyauté de référence d'un membre (hypothèses) : base, plus le poids de sa proximité avec le
 * président au-dessus de 50/100, plus le bonus du Premier ministre ; entre 0 et 100.
 */
export function loyaltyReference(
  state: GameState,
  ruleset: Ruleset,
  member: MemberRef,
  primeMinister: boolean,
): number {
  const rules = ruleset.quinquennat.suivi.loyaute;
  const president = presidentOf(state);
  const position = memberTraits(state, ruleset, member).position;
  const closeness = proximity(president, {
    id: member.ref,
    candidate: { positionnement: position },
  });
  return clamp(
    Math.round(
      rules.base +
        rules.poidsProximite * (closeness - 50) +
        (primeMinister ? rules.premierMinistre : 0),
    ),
    0,
    100,
  );
}

/**
 * Suivi des membres du gouvernement : chaque nouveau membre reçoit sa popularité prêtée et sa
 * loyauté de départ (plus le bonus d'un ministère promis pendant la campagne) ; les anciens
 * membres sortent du suivi. Appelé à chaque Conseil (parties migrées comprises).
 */
export function syncTracks(state: GameState, ruleset: Ruleset): void {
  const quinquennat = state.quinquennat;
  if (!quinquennat) return;
  const current = members(state);
  const refs = new Set(current.map((m) => m.member.ref));
  for (const ref of Object.keys(quinquennat.suivi))
    if (!refs.has(ref)) delete quinquennat.suivi[ref];
  for (const { member, posteId } of current) {
    if (quinquennat.suivi[member.ref]) continue;
    const promise = wasPromised(state, member) ? ruleset.negociations.loyautePromesse : 0;
    quinquennat.suivi[member.ref] = {
      popularite: memberTraits(state, ruleset, member).popularite,
      loyaute: clamp(loyaltyReference(state, ruleset, member, posteId === null) + promise, 0, 100),
      depuis: state.meta.week,
    };
  }
}

/** Applique des facteurs à une valeur bornée ; l'écrêtement est un facteur nommé (somme exacte). */
function applyFactors(before: number, factors: TrackFactor[], min: number, max: number) {
  const kept = factors.filter((f) => f.value !== 0);
  const raw = before + kept.reduce((sum, f) => sum + f.value, 0);
  const after = clamp(raw, min, max);
  if (after !== raw)
    kept.push({
      label: after === max ? 'Plafond atteint' : 'Plancher atteint',
      value: after - raw,
    });
  return { avant: before, apres: after, facteurs: kept };
}

/** Textes de la semaine adoptés ou rejetés, par ministère du domaine (faits du Conseil). */
function billFacts(state: GameState, ruleset: Ruleset, book: CouncilBook): void {
  const week = state.meta.week;
  const weight = ruleset.quinquennat.suivi.popularite.texte;
  const proposals = proposalsById(ruleset);
  for (const bill of state.parlement?.textes ?? []) {
    if (bill.issue?.semaine !== week || (bill.etape !== 'adopte' && bill.etape !== 'rejete'))
      continue;
    const proposal = proposals.get(bill.propositionId);
    if (!proposal) continue;
    const member = memberInCharge(state, postOfDomain(ruleset, proposal.domaine));
    if (!member) continue;
    const adopted = bill.etape === 'adopte';
    book.note(member.ref, `Texte ${adopted ? 'adopté' : 'rejeté'} : ${proposal.libelle}`, {
      popularite: adopted ? weight : -weight,
    });
  }
}

export type CouncilContext = {
  state: GameState;
  ruleset: Ruleset;
  ledger: Ledger;
  book: CouncilBook;
  playerPresides: boolean;
  step: number;
};

/**
 * Départ d'un ministre (départ simulé ou remaniement ciblé) : il quitte le gouvernement, ne
 * peut y revenir avant le délai qui suit un refus, et le Premier ministre propose aussitôt un
 * remplaçant ; le président joueur confirme ou nomme une autre personnalité (décision). Renvoie
 * l'événement du bilan.
 */
export function replaceMinister(
  context: CouncilContext,
  posteId: string,
  motif: string,
  remaniement: boolean,
): ReportEvent | null {
  const { state, ruleset, ledger, book, playerPresides, step } = context;
  const quinquennat = state.quinquennat;
  const government = quinquennat?.gouvernement;
  const index = government?.ministres.findIndex((m) => m.posteId === posteId) ?? -1;
  if (!quinquennat || !government || index < 0) return null;
  const current = government.ministres[index]!;
  const name = memberName(state, ruleset, current);
  const poste = ruleset.quinquennat.postes.find((p) => p.id === posteId)?.libelle ?? posteId;
  const president = presidentOf(state);
  // Ministère promis retiré par le président au premier gouvernement : promesse non tenue.
  if (remaniement && wasPromised(state, current)) {
    ledger.apply(president.id, 'popularite', [
      {
        label: `Promesse de ministère non tenue : ${name} (hypothèse de jeu)`,
        value: -ruleset.negociations.promesseNonTenue,
        source: 'decision',
        step,
      },
    ]);
  }
  quinquennat.refus.push({ acteurId: current.ref, semaine: state.meta.week, posteId });
  book.departs.push({ nature: current.nature, ref: current.ref, posteId, motif });
  const replacement = proposeReplacement(state, ruleset, posteId);
  government.ministres[index] = { ...replacement, posteId };
  delete quinquennat.suivi[current.ref];
  syncTracks(state, ruleset);
  const successor = memberName(state, ruleset, replacement);
  if (playerPresides)
    requestMinisterDecision(
      state,
      ruleset,
      posteId,
      `${name} a quitté le ministère « ${poste} » (${motif}). `,
    );
  return {
    id: `depart-${state.meta.week}-${current.ref}`,
    kind: 'evenement',
    refId: 'gouvernement',
    label: remaniement
      ? `Remaniement ciblé : ${name} quitte le ministère « ${poste} »`
      : `${name} quitte le gouvernement (départ simulé)`,
    description: `${motif.charAt(0).toUpperCase()}${motif.slice(1)}. Le Premier ministre propose ${successor} pour lui succéder${playerPresides ? ' : confirmez ou nommez une autre personnalité' : ''}. Aucun propos n’est attribué.`,
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}

/** Variation de la popularité du président dans la semaine, d'après le registre. */
function presidentShift(ledger: Ledger, presidentId: string): number {
  const change = ledger
    .list()
    .find((c) => c.actorId === presidentId && c.ressource === 'popularite');
  return change ? change.after - change.before : 0;
}

/**
 * Conseil des ministres de la semaine (fin de l'étape 6) : évolution de la popularité prêtée et
 * de la loyauté de chaque membre avec leurs facteurs, faits de la semaine, au plus un départ
 * simulé de ministre sous les seuils, alertes. Renvoie le compte rendu et les événements.
 */
export function holdCouncil(context: CouncilContext): {
  report: CouncilReport | null;
  events: ReportEvent[];
} {
  const { state, ruleset, ledger, book } = context;
  const quinquennat = state.quinquennat;
  if (!quinquennat?.gouvernement) return { report: null, events: [] };
  syncTracks(state, ruleset);
  billFacts(state, ruleset, book);
  const rules = ruleset.quinquennat.suivi;
  const week = state.meta.week;
  const president = presidentOf(state);
  const reference = ruleset.jeu.opinion.popularite.reference;
  const shift = presidentShift(ledger, president.id);
  const loyaltyFromPresident = Math.round(
    (rules.loyaute.poidsPopularitePresident * (president.resources.popularite - reference)) / 100,
  );
  const ministres: CouncilReport['ministres'] = [];
  for (const { member, posteId } of members(state)) {
    const track = quinquennat.suivi[member.ref]!;
    const facts = book.of(member.ref);
    const lent = memberTraits(state, ruleset, member).popularite;
    const popularite = applyFactors(
      track.popularite,
      [
        { label: 'Usure au poste (hypothèse de jeu)', value: -rules.popularite.usureHebdomadaire },
        {
          label: 'Retour vers sa popularité prêtée de référence',
          value: -Math.round(rules.popularite.rappel * (track.popularite - lent)),
        },
        {
          label: 'Popularité du président cette semaine',
          value: Math.round(rules.popularite.poidsPresident * shift),
        },
        ...facts.popularite,
      ],
      0,
      10_000,
    );
    const inPost = week - track.depuis;
    const loyaute = applyFactors(
      track.loyaute,
      [
        {
          label: 'Retour vers sa loyauté de référence',
          value: -Math.round(
            rules.loyaute.rappel *
              (track.loyaute - loyaltyReference(state, ruleset, member, posteId === null)),
          ),
        },
        { label: 'Popularité du président (hypothèse de jeu)', value: loyaltyFromPresident },
        {
          label: 'Usure au poste (hypothèse de jeu)',
          value: inPost > 0 && inPost % rules.loyaute.usureSemaines === 0 ? -1 : 0,
        },
        ...facts.loyaute,
      ],
      0,
      100,
    );
    quinquennat.suivi[member.ref] = {
      popularite: popularite.apres,
      loyaute: loyaute.apres,
      depuis: track.depuis,
    } satisfies MinisterTrack;
    ministres.push({
      nature: member.nature,
      ref: member.ref,
      posteId,
      popularite,
      loyaute,
      faits: facts.faits,
    });
  }
  const events = departures(context);
  const alertes = ministres
    .filter((m) => quinquennat.suivi[m.ref])
    .flatMap((m) => {
      const track = quinquennat.suivi[m.ref]!;
      const name = memberName(state, ruleset, m);
      const notes: string[] = [];
      if (track.loyaute <= rules.depart.loyauteMax + 10)
        notes.push(`${name} : loyauté fragile (${track.loyaute}/100)`);
      if (track.popularite <= rules.depart.populariteMax + 500)
        notes.push(
          `${name} : popularité prêtée faible (${Math.round(track.popularite / 100)} %, hypothèse)`,
        );
      return notes;
    });
  return { report: { ministres, departs: book.departs, alertes }, events };
}

/**
 * Au plus un départ simulé par semaine : parmi les ministres en poste depuis assez longtemps et
 * sous un seuil (loyauté ou popularité prêtée), dans l'ordre des postes, chacun avec la
 * probabilité du jeu de règles. Le président voit sa popularité baisser (registre).
 */
function departures(context: CouncilContext): ReportEvent[] {
  const { state, ruleset, ledger, step } = context;
  const quinquennat = state.quinquennat!;
  const rules = ruleset.quinquennat.suivi.depart;
  const week = state.meta.week;
  const ministres = [...quinquennat.gouvernement!.ministres].sort((a, b) =>
    compareStrings(a.posteId, b.posteId),
  );
  for (const minister of ministres) {
    const track = quinquennat.suivi[minister.ref];
    if (!track || week - track.depuis < rules.semainesMin) continue;
    const disloyal = track.loyaute <= rules.loyauteMax;
    const worn = track.popularite <= rules.populariteMax;
    if (!disloyal && !worn) continue;
    if (stream(state.meta.seed, week, 'depart', minister.ref).nextFloat() >= rules.probabilite)
      continue;
    const name = memberName(state, ruleset, minister);
    const motif = disloyal
      ? `loyauté envers le président au plus bas, ${track.loyaute}/100 (départ simulé)`
      : `usure au poste, popularité prêtée ${Math.round(track.popularite / 100)} % (départ simulé)`;
    ledger.apply(presidentOf(state).id, 'popularite', [
      {
        label: `Départ de ${name} du gouvernement (simulé, hypothèse de jeu)`,
        value: -rules.effetPresident,
        source: 'evenement',
        step,
      },
    ]);
    const event = replaceMinister(context, minister.posteId, motif, false);
    return event ? [event] : [];
  }
  return [];
}
