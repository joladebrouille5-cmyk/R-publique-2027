import type { GameState, Ruleset, UtilityFactor } from '@r2027/shared';

/** Socle électoral « Sondages actuels » (phase 24) : facteur d'utilité, voir `socle.ts`. */

const frDate = (iso: string) => iso.split('-').reverse().join('/');

export const socleLabel = (date: string) => `Socle électoral (sondages au ${frDate(date)})`;

// Quatre décimales suffisent et gardent l'état stable à l'aller-retour JSON.
export const round4 = (value: number) => Math.round(value * 10_000) / 10_000 + 0;

/** Facteur d'utilité du socle pour un candidat et un tour (vide hors départ « Sondages actuels »). */
export function socleFactors(
  state: GameState,
  ruleset: Ruleset,
  contenderId: string,
  round: 1 | 2,
): UtilityFactor[] {
  const socle = state.socle;
  if (!socle || state.cycle.annee !== ruleset.departSondages.cycle) return [];
  const offset = (round === 1 ? socle.t1 : socle.t2)[contenderId];
  if (offset === undefined) return [];
  const { decroissance, decroissanceSecondTour } = ruleset.departSondages;
  const decay = (round === 1 ? decroissance : decroissanceSecondTour) ** state.meta.week;
  return [{ label: socleLabel(socle.date), value: round4(offset * decay) }];
}
