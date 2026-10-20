import type {
  ActionDefinition,
  ActionOutcome,
  GameState,
  PlannedAction,
  ReportEvent,
  Ruleset,
} from '@r2027/shared';
import { applyOrSchedule } from '../core/effects';
import { EngineInputError } from '../core/errors';
import type { Ledger } from '../core/ledger';
import { drawAlea, stream } from '../core/random';

export type ValidatedAction = { index: number; definition: ActionDefinition };

const euros = (centimes: number) =>
  `${Math.round(centimes / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;

function rejectionReason(
  { cout, prerequis }: ActionDefinition,
  militants: number,
  budget: number,
  time: number,
): string | null {
  if (militants < prerequis.militantsMin) {
    return `Il faut au moins ${prerequis.militantsMin} militants (vous en avez ${militants}).`;
  }
  if (cout.budgetCentimes > budget) {
    return `Budget insuffisant : ${euros(cout.budgetCentimes)} nécessaires, ${euros(budget)} restants.`;
  }
  if (cout.tempsHeures > time) {
    return `Temps insuffisant : ${cout.tempsHeures} h nécessaires, ${time} h restantes cette semaine.`;
  }
  return null;
}

/**
 * Étape 1 : validation des actions programmées, dans l'ordre soumis. Une action qui ne peut
 * pas être financée avec ce qui reste (budget, temps) ou dont le prérequis n'est pas rempli
 * est rejetée avec son motif ; les autres sont retenues.
 */
export function validateActions(
  state: GameState,
  planned: readonly PlannedAction[],
  ruleset: Ruleset,
): { outcomes: ActionOutcome[]; validated: ValidatedAction[] } {
  const actorId = state.player.actorId;
  if (planned.length > 0 && (state.player.mode === 'observateur' || !actorId)) {
    throw new EngineInputError('actions_interdites', 'Le mode observateur ne permet pas d’agir.');
  }
  if (planned.length > ruleset.jeu.actionsMaxParSemaine) {
    throw new EngineInputError(
      'trop_d_actions',
      `Au plus ${ruleset.jeu.actionsMaxParSemaine} actions par semaine.`,
    );
  }
  const outcomes: ActionOutcome[] = [];
  const validated: ValidatedAction[] = [];
  if (!actorId) return { outcomes, validated };

  const resources = state.actors[actorId]!.resources;
  let budget = resources.budgetCentimes;
  let time = resources.tempsHeures;

  planned.forEach((action, index) => {
    const definition = ruleset.actions.find((a) => a.id === action.actionId);
    const reason = !definition
      ? 'Action inconnue dans ce jeu de règles.'
      : rejectionReason(definition, resources.militants, budget, time);
    if (!definition || reason) {
      outcomes.push({
        index,
        actionId: action.actionId,
        label: definition?.libelle ?? action.actionId,
        status: 'rejetee',
        reason,
        cost: { budgetCentimes: 0, tempsHeures: 0 },
      });
      return;
    }
    const { cout } = definition;
    budget -= cout.budgetCentimes;
    time -= cout.tempsHeures;
    validated.push({ index, definition });
    outcomes.push({
      index,
      actionId: definition.id,
      label: definition.libelle,
      status: 'validee',
      reason: null,
      cost: { ...cout },
    });
  });
  return { outcomes, validated };
}

/** Étape 2 : débit exact du coût des actions retenues. */
export function consumeActions(
  ledger: Ledger,
  actorId: string,
  validated: readonly ValidatedAction[],
  step: number,
): void {
  for (const { definition } of validated) {
    const label = `${definition.libelle} : coût`;
    ledger.apply(actorId, 'budgetCentimes', [
      { label, value: -definition.cout.budgetCentimes, source: 'action', step },
    ]);
    ledger.apply(actorId, 'tempsHeures', [
      { label, value: -definition.cout.tempsHeures, source: 'action', step },
    ]);
  }
}

/** Étape 5 : effets des actions (immédiats ou programmés) et tirage de leur risque éventuel. */
export function resolveActionEffects(
  state: GameState,
  ledger: Ledger,
  actorId: string,
  validated: readonly ValidatedAction[],
  step: number,
): ReportEvent[] {
  const week = state.meta.week;
  const risks: ReportEvent[] = [];
  for (const { index, definition } of validated) {
    const rng = stream(state.meta.seed, week, 'action', index, definition.id);
    const ref = `a-${week}-${index}`;
    const base = { state, ledger, actorId, week, step, ref };
    definition.effets.forEach((effect, i) =>
      applyOrSchedule(
        { ...base, label: definition.libelle, source: 'action' },
        effect,
        drawAlea(rng, effect),
        i,
      ),
    );
    const risk = definition.risque;
    if (risk && rng.nextFloat() < risk.probabilite) {
      const riskRef = `${ref}-risque`;
      risk.effets.forEach((effect, i) =>
        applyOrSchedule(
          {
            ...base,
            ref: riskRef,
            label: `${definition.libelle} — ${risk.libelle}`,
            source: 'risque',
          },
          effect,
          drawAlea(rng, effect),
          i,
        ),
      );
      risks.push({
        id: riskRef,
        kind: 'risque',
        refId: definition.id,
        label: risk.libelle,
        description: `Aléa de l'action « ${definition.libelle} » (probabilité ${Math.round(risk.probabilite * 100)} %).`,
        nature: 'simule',
        majeur: false,
        decisionId: null,
      });
    }
  }
  return risks;
}
