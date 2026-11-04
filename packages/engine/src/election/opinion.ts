import type { GameState, Ruleset } from '@r2027/shared';
import { formatPercent } from '../core/effects';
import { compareStrings, type Ledger } from '../core/ledger';

/**
 * Étape 6 : dynamique hebdomadaire de l'opinion et de l'équipe, sans action du joueur :
 * érosion de la notoriété, retour de la popularité vers une valeur de référence, attrition
 * des militants, usure de l'écho chez les jeunes et retombée du buzz (phase 9). Paramètres de
 * jeu (hypothèses) du jeu de règles.
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
    // Réseaux et nouveaux médias (phase 9) : l'écho chez les jeunes s'use, le buzz retombe.
    const { erosionJeunesse, retombeeDynamique } = ruleset.numerique;
    const jeunesse = ledger.current(actorId, 'jeunesse');
    ledger.apply(actorId, 'jeunesse', [
      {
        label: `Érosion hebdomadaire de l'écho chez les 18-34 ans (${pct(erosionJeunesse)})`,
        value: -Math.round(jeunesse * erosionJeunesse),
        source: 'opinion',
        step,
      },
    ]);
    const dynamique = ledger.current(actorId, 'dynamique');
    ledger.apply(actorId, 'dynamique', [
      {
        label: `Retombée du buzz (${pct(retombeeDynamique)})`,
        value: -Math.round(dynamique * retombeeDynamique),
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
