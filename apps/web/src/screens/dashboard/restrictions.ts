import {
  addDays,
  presidentialActionBlocked,
  type ActionDefinition,
  type GameState,
  type PlannedAction,
  type Ruleset,
} from '@r2027/shared';
import { formatGameDate } from '../../labels';

// Restrictions des actions du chef de l'État affichées avant de les programmer (mêmes règles que
// le moteur, qui reste seul juge) : partagées par le QG et le plateau (phase 25).

/** Même règle que le moteur (qui reste seul juge) : affichée avant de programmer la dissolution. */
function dissolutionRestriction(state: GameState, ruleset: Ruleset): string | null {
  const legislatives = state.legislatives;
  if (!legislatives) return 'Aucune Assemblée à dissoudre.';
  if (legislatives.prochaine?.motif === 'dissolution' || legislatives.premierTour)
    return 'Des élections législatives sont déjà en cours.';
  const { moratoireJours, delaiMaxJours } = ruleset.legislatives.regles;
  const allowed = addDays(legislatives.derniere.t2, moratoireJours);
  if (state.meta.date < allowed)
    return `Pas de nouvelle dissolution dans l’année qui suit les dernières élections (possible à partir du ${formatGameDate(allowed)}).`;
  const next = ruleset.quinquennat.cycles.find((c) => c.annee > state.cycle.annee);
  const campaign = next ? addDays(state.meta.startDate, 7 * next.decalageSemaines) : null;
  return campaign && addDays(state.meta.date, delaiMaxJours) >= campaign
    ? `Plus de dissolution à l’approche de la campagne présidentielle du ${formatGameDate(campaign)} (simplification du jeu).`
    : null;
}

/** Raison qui empêche de programmer une action présidentielle cette semaine, sinon null. */
export function presidencyRestriction(
  state: GameState,
  ruleset: Ruleset,
  plan: readonly PlannedAction[],
  mandateStarted: boolean,
) {
  const quinquennat = state.quinquennat;
  return (action: ActionDefinition): string | null =>
    !quinquennat
      ? null
      : !mandateStarted
        ? `Le mandat commence le ${formatGameDate(quinquennat.mandat.debut)}.`
        : (action.institution === 'remaniement' || action.institution === 'remaniement-cible') &&
            !quinquennat.gouvernement
          ? 'Aucun gouvernement en place à remanier.'
          : action.institution === 'dissolution'
            ? dissolutionRestriction(state, ruleset)
            : action.delaiSemaines !== undefined && plan.some((p) => p.actionId === action.id)
              ? 'Une seule fois par semaine.'
              : // Délai et condition : la règle du moteur (`@r2027/shared`), à l'identique.
                presidentialActionBlocked(state, action);
}
