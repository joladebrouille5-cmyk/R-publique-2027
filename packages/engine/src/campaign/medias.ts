import type {
  Actor,
  Coverage,
  GameState,
  Interview,
  MediaState,
  PoliticalShow,
  RealOutlet,
  Ruleset,
} from '@r2027/shared';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import type { ValidatedAction } from './actions';
import { credibility } from './programme';

// Médias réels (§8, phase 5 ter) : chaînes de télévision et de radio suivies par l'Arcom,
// presse quotidienne mesurée par l'ACPM, émissions politiques réelles. Chaque semaine, chaque
// organe expose les candidats selon leur notoriété et leurs actions ; sur une chaîne ou une
// station, l'exposition d'un candidat est modulée par la propension mesurée pour son parti
// (temps de parole de l'Arcom, estimation) ; la presse écrite traite tous les candidats de la
// même façon. La tonalité ne dépend que des facteurs du jeu (popularité, crédibilité du
// programme, aléa, incidents) : aucune ligne éditoriale n'est prêtée à un média réel.

const ACTIVE = new Set(['candidat', 'qualifie']);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Part de l'exposition répartie selon la notoriété (le reste vient des actions). */
const NOTORIETY_SHARE = 6_000;
const INCIDENT_TONE = 30;

/** Poids d'audience d'un organe : part mesurée dans son type × poids du type (hypothèse). */
export function outletAudience(ruleset: Ruleset, outlet: RealOutlet): number {
  return ruleset.medias.poidsParType[outlet.type] * outlet.audience.partDuType;
}

/** Parti des relevés de l'Arcom rattaché au candidat (personnalité réelle), sinon null. */
export function arcomParty(ruleset: Ruleset, actor: Pick<Actor, 'candidate'>): string | null {
  const id = actor.candidate.personnaliteId;
  if (!id) return null;
  return ruleset.mediasReels.rattachements.find((r) => r.personnaliteId === id)?.partiArcom ?? null;
}

/**
 * Propension d'exposition d'un parti sur un organe, bornée par le jeu de règles : 1 pour la
 * presse écrite, pour un candidat sans parti suivi ou pour un parti sans relevé sur l'organe.
 */
export function propensity(ruleset: Ruleset, outlet: RealOutlet, party: string | null): number {
  const value = party === null ? undefined : outlet.tempsDeParole?.propension[party];
  if (value === undefined) return 1;
  return clamp(value, ruleset.medias.propension.min, ruleset.medias.propension.max);
}

export function showsById(ruleset: Ruleset): ReadonlyMap<string, PoliticalShow> {
  return new Map(ruleset.mediasReels.emissions.map((e) => [e.id, e]));
}

/** Exposition ajoutée sur un organe par une action de la semaine. */
function actionExposure(
  ruleset: Ruleset,
  shows: ReadonlyMap<string, PoliticalShow>,
  outlet: RealOutlet,
  action: ValidatedAction,
): number {
  const bonus = action.definition.campagne?.exposition ?? 0;
  if (bonus === 0) return 0;
  switch (action.definition.cible) {
    case 'media':
      return action.cible === outlet.id ? bonus : 0;
    case 'emission': {
      const show = action.cible ? shows.get(action.cible) : undefined;
      if (!show) return 0;
      if (show.organeId === outlet.id) return bonus;
      return show.autresOrganes.includes(outlet.id)
        ? Math.round(bonus * ruleset.medias.partCodiffusion)
        : 0;
    }
    default: {
      const national = action.definition.portee === 'nationale';
      return national === (outlet.portee === 'nationale') ? Math.round(bonus / 3) : 0;
    }
  }
}

/**
 * Étape 6 : couverture de la semaine par chaque organe réel, indice médiatique de chaque
 * candidat (−1 à +1), interviews tenues dans les émissions politiques et gain de notoriété
 * proportionnel à l'audience touchée (inscrit au registre avec son facteur).
 */
export function updateMedia(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  actions: readonly ValidatedAction[],
  incidents: ReadonlySet<string>,
  step: number,
): MediaState | null {
  const actors = Object.values(state.actors)
    .filter((a) => ACTIVE.has(a.status))
    .sort((a, b) => compareStrings(a.id, b.id));
  if (actors.length === 0) return null;
  const week = state.meta.week;
  const shows = showsById(ruleset);
  const attention = actors.map((a) => Math.pow(Math.max(a.resources.notoriete, 100) / 10_000, 1.5));
  const totalAttention = attention.reduce((sum, v) => sum + v, 0);
  const parties = actors.map((a) => arcomParty(ruleset, a));
  // Aucun programme n'est prêté à une personnalité réelle adverse : facteur neutre.
  const tones = actors.map((a) =>
    clamp(
      (a.resources.popularite - 3_000) / 40 +
        (a.candidate.nature === 'reel' && a.kind === 'adversaire'
          ? 0
          : credibility(a.programme, ruleset).value * 30 * ruleset.medias.credibilite) -
        (incidents.has(a.id) ? INCIDENT_TONE : 0),
      -100,
      100,
    ),
  );

  const couverture: MediaState['couverture'] = {};
  const weighted = new Map<string, number>(actors.map((a) => [a.id, 0]));
  const reach = new Map<string, number>(actors.map((a) => [a.id, 0]));
  let totalWeight = 0;
  for (const outlet of ruleset.mediasReels.organes) {
    const audience = outletAudience(ruleset, outlet);
    const weight = audience * ruleset.medias.credibilite;
    totalWeight += weight;
    couverture[outlet.id] = {};
    // Un flux d'aléa par organe, tiré candidat par candidat dans l'ordre des identifiants.
    const rng = stream(state.meta.seed, week, 'medias', outlet.id);
    actors.forEach((actor, i) => {
      let exposure = Math.round(
        ((NOTORIETY_SHARE * attention[i]!) / totalAttention) *
          propensity(ruleset, outlet, parties[i]!),
      );
      for (const action of actions)
        if (action.actorId === actor.id) exposure += actionExposure(ruleset, shows, outlet, action);
      exposure = clamp(exposure, 0, 10_000);
      const alea = rng.nextFloat() * 50 - 25;
      const tone = Math.round(clamp(tones[i]! + alea, -100, 100));
      const coverage: Coverage = { exposition: exposure, tonalite: tone + 0 };
      couverture[outlet.id]![actor.id] = coverage;
      weighted.set(actor.id, weighted.get(actor.id)! + (weight * exposure * tone) / 1_000_000);
      reach.set(actor.id, reach.get(actor.id)! + audience * exposure);
    });
  }

  const indice: MediaState['indice'] = {};
  for (const actor of actors) {
    indice[actor.id] = Math.round((weighted.get(actor.id)! / totalWeight) * 1000) / 1000 + 0;
    const gain = Math.round(ruleset.medias.notorieteParExposition * reach.get(actor.id)!);
    ledger.apply(actor.id, 'notoriete', [
      { label: 'Couverture médiatique de la semaine', value: gain, source: 'opinion', step },
    ]);
  }
  const interviews: Interview[] = actions
    .filter((a) => a.definition.cible === 'emission' && a.cible !== null && shows.has(a.cible))
    .map((a) => ({ emissionId: a.cible!, acteurId: a.actorId }))
    .sort(
      (a, b) =>
        compareStrings(a.acteurId, b.acteurId) || compareStrings(a.emissionId, b.emissionId),
    );
  return { semaine: week, couverture, indice, interviews };
}
