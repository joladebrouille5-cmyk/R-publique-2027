import type { GameState, QuinquennatReview, Ruleset, UtilityFactor } from '@r2027/shared';

// Présidentielle suivante (phase 23) : décision de candidature du joueur, candidatures simulées
// des autres candidats, entrants et poids du bilan du quinquennat sur les intentions de vote.
// Paramètres : bloc `succession` du jeu de règles (hypothèses). Tirages par la graine de la
// partie ; aucun propos n'est prêté à une personne réelle : les annonces décrivent des faits de
// jeu, avec leur motif chiffré.

/** Libellé du facteur d'utilité du bilan, dans « Pourquoi ça bouge ? » et le détail. */
export const RECORD_FACTOR_LABEL = 'Bilan du quinquennat';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Arrondi au dix-millième : valeur stable une fois enregistrée dans l'état. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Score du bilan du quinquennat (spec §5) : popularité finale du président au-dessus ou en
 * dessous du pivot, note du mandat sur 20 autour de 10 (10 sans objectifs fixés) et variation du
 * chômage en points (une baisse compte en faveur du sortant), borné à ± `bilan.max`.
 */
export function recordScore(review: QuinquennatReview, ruleset: Ruleset): number {
  const params = ruleset.succession.bilan;
  const popularity = review.fin.popularite ?? params.pivotPopularite;
  const grade = review.note?.valeur ?? 10;
  const start = review.debut.indicateurs?.chomage;
  const end = review.fin.indicateurs?.chomage;
  const unemployment = start !== undefined && end !== undefined ? (end - start) / 100 : 0;
  const raw =
    (params.poidsPopularite * (popularity - params.pivotPopularite)) / 10_000 +
    (params.poidsNote * (grade - 10)) / 10 -
    params.poidsChomage * unemployment;
  return round4(clamp(raw, -params.max, params.max));
}

/**
 * Facteur « Bilan du quinquennat » d'un candidat pendant la campagne qui suit le quinquennat
 * (arrêté à l'ouverture de la campagne) ; aucun facteur hors de cette campagne.
 */
export function recordFactors(state: GameState, contenderId: string): UtilityFactor[] {
  const succession = state.succession;
  if (!succession || state.meta.phase !== 'campagne' || succession.annee !== state.cycle.annee)
    return [];
  const entry = succession.bilan[contenderId];
  return entry ? [{ label: RECORD_FACTOR_LABEL, value: entry.facteur }] : [];
}
