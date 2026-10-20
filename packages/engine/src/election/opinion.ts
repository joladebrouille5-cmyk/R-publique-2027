import type { GameState, Ruleset } from '@r2027/shared';
import { formatPercent } from '../core/effects';
import { compareStrings, type Ledger } from '../core/ledger';

/**
 * Étape 6 : dynamique hebdomadaire de l'opinion et de l'équipe, sans action du joueur :
 * érosion de la notoriété, retour de la popularité vers une valeur de référence, attrition
 * des militants. Paramètres de jeu (hypothèses) du jeu de règles. Les médias seront
 * modélisés en phase 5.
 */
export function weeklyDrift(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  step: number,
): void {
  const { erosionNotoriete, popularite, attritionMilitants } = ruleset.jeu.opinion;
  const pct = (fraction: number) => `${Math.round(fraction * 100)} %`;
  for (const actorId of Object.keys(state.actors).sort(compareStrings)) {
    const notoriete = ledger.current(actorId, 'notoriete');
    ledger.apply(actorId, 'notoriete', [
      {
        label: `Érosion hebdomadaire de la notoriété (${pct(erosionNotoriete)})`,
        value: -Math.round(notoriete * erosionNotoriete),
        source: 'opinion',
        step,
      },
    ]);
    const pop = ledger.current(actorId, 'popularite');
    ledger.apply(actorId, 'popularite', [
      {
        label: `Retour progressif vers ${formatPercent(popularite.reference)} (${pct(popularite.rappel)} de l'écart)`,
        value: -Math.round((pop - popularite.reference) * popularite.rappel),
        source: 'opinion',
        step,
      },
    ]);
    const militants = ledger.current(actorId, 'militants');
    ledger.apply(actorId, 'militants', [
      {
        label: `Attrition des militants (${pct(attritionMilitants)})`,
        value: -Math.round(militants * attritionMilitants),
        source: 'opinion',
        step,
      },
    ]);
  }
}
