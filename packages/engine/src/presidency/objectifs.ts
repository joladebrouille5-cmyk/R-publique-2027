import {
  mandateGrade,
  objectiveMeasure,
  type GameState,
  type MandateGrade,
  type Ruleset,
} from '@r2027/shared';
import { proposalsById } from '../campaign/programme';

// Objectifs de mandat et note finale (phase 15, idée I2). À la formation du premier gouvernement
// du mandat (ou au premier Conseil d'une partie migrée), quatre objectifs sont tirés du
// catalogue du jeu de règles, les domaines les plus représentés dans le programme du président
// d'abord : valeur de départ et cible (écart au départ ou valeur). Au bilan, note sur 20 : un
// objectif atteint compte pour 1, un objectif manqué pour la moitié de la part du chemin parcourue
// vers la cible. Cibles = paramètres de jeu (hypothèses), jamais des prévisions.

/**
 * Objectifs du mandat, une fois le premier gouvernement en place : les objectifs du catalogue
 * dont les domaines comptent le plus de propositions dans la feuille de route du président, puis
 * l'ordre du catalogue. Sans effet si les objectifs sont déjà fixés.
 */
export function ensureObjectives(state: GameState, ruleset: Ruleset): void {
  const quinquennat = state.quinquennat;
  if (!quinquennat?.gouvernement || quinquennat.objectifs.length > 0) return;
  const proposals = proposalsById(ruleset);
  const domains = quinquennat.feuilleDeRoute
    .map((id) => proposals.get(id)?.domaine)
    .filter((d): d is string => d !== undefined);
  const ranked = ruleset.objectifs.catalogue
    .map((o, ordre) => ({ o, ordre, poids: domains.filter((d) => o.domaines.includes(d)).length }))
    .sort((a, b) => b.poids - a.poids || a.ordre - b.ordre)
    .slice(0, ruleset.objectifs.nombre);
  quinquennat.objectifs = ranked
    .sort((a, b) => a.ordre - b.ordre)
    .map(({ o }) => {
      const depart = objectiveMeasure(state, o);
      return { id: o.id, depart, cible: o.ecart !== undefined ? depart + o.ecart : o.valeur! };
    });
}

/** Note finale du mandat (bilan) : règle partagée avec l'interface (`@r2027/shared`). */
export function gradeMandate(state: GameState, ruleset: Ruleset): MandateGrade | null {
  return mandateGrade(state, ruleset);
}
