import { themeIndicatorEffects, type GameState, type Ruleset } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import type { EconomyBook } from './economy';
import { memberName, postCompetenceOf } from './members';

// Effets thématiques des ministres (phase 13) : chaque semaine, la compétence de chaque
// ministre sur son poste (écart à 0,5 ; expertise comprise, phase 14) pèse sur les indicateurs de son poste (table `equipe.themes` du jeu de
// règles, hypothèses), par le registre de l'économie. Le soutien aux textes de son domaine est
// appliqué par le Parlement ; la modulation des actions du président, par les actions.

const pct = (value: number) => `${Math.round(value * 100)} %`;

export function ministerEffects(state: GameState, ruleset: Ruleset, book: EconomyBook): void {
  const government = state.quinquennat?.gouvernement;
  if (!government) return;
  const postes = new Map(ruleset.quinquennat.postes.map((p) => [p.id, p.libelle]));
  for (const minister of [...government.ministres].sort((a, b) =>
    compareStrings(a.posteId, b.posteId),
  )) {
    const competence = postCompetenceOf(state, ruleset, minister, minister.posteId);
    for (const effect of themeIndicatorEffects(ruleset, minister.posteId, competence))
      book.add(
        effect.indicateur,
        `${postes.get(minister.posteId) ?? minister.posteId} : ${memberName(state, ruleset, minister)} (compétence ${pct(competence)}, hypothèse de jeu)`,
        effect.valeur,
        'gouvernement',
      );
  }
}
