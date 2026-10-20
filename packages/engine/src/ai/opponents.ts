import type {
  ActionDefinition,
  Actor,
  GameState,
  PlannedAction,
  ResourceKey,
  Ruleset,
} from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { softmax } from '../election/model';

/** Échelle d'une unité de « gain » par ressource, pour comparer des effets hétérogènes. */
const SCALE: Record<ResourceKey, number> = {
  budgetCentimes: 2_000_000,
  tempsHeures: 10,
  militants: 50,
  notoriete: 100,
  popularite: 100,
};
const TEMPERATURE = 0.5;

/** Importance que l'adversaire accorde à chaque ressource, selon sa situation. */
function needs(actor: Actor): Record<ResourceKey, number> {
  const r = actor.resources;
  return {
    budgetCentimes: r.budgetCentimes < 20_000_000 ? 1 : 0.2,
    tempsHeures: 0,
    militants: r.militants < 300 ? 0.6 : 0.2,
    notoriete: 1 - r.notoriete / 10_000,
    popularite: 1.2,
  };
}

/**
 * Valeur attendue d'une action pour un adversaire : gains attendus pondérés par ses
 * besoins, moins le risque (pondéré par son goût du risque et son style) et le poids du coût.
 */
export function scoreAction(
  actor: Actor,
  action: ActionDefinition,
  remainingBudget: number,
): number {
  const weights = needs(actor);
  const gain = action.effets.reduce(
    (sum, effect) => sum + (weights[effect.ressource] * effect.base) / SCALE[effect.ressource],
    0,
  );
  const tolerance = actor.toleranceRisque ?? 0.5;
  const prudence = actor.style === 'prudent' ? 1.5 : actor.style === 'offensif' ? 0.7 : 1;
  const riskLoss = action.risque
    ? action.risque.probabilite *
      Math.abs(
        action.risque.effets.reduce(
          (sum, effect) =>
            sum + (weights[effect.ressource] * effect.base) / SCALE[effect.ressource],
          0,
        ),
      )
    : 0;
  const costShare = action.cout.budgetCentimes / Math.max(remainingBudget, 1);
  const exposure = actor.style === 'offensif' && action.portee === 'nationale' ? 0.3 : 0;
  return gain + exposure - riskLoss * (1 - tolerance) * prudence * 4 - costShare;
}

/**
 * Étape 3 : chaque adversaire encore en lice choisit ses actions de la semaine dans le même
 * catalogue que le joueur, aux mêmes coûts, sans intervention du joueur (§7). Le choix est
 * tiré parmi les actions abordables, avec une probabilité croissante avec leur valeur.
 */
export function planOpponentActions(
  state: GameState,
  ruleset: Ruleset,
): { actorId: string; planned: PlannedAction[] }[] {
  const level = ruleset.ia[state.meta.difficulty];
  const active = state.meta.phase === 'entre_deux_tours' ? 'qualifie' : 'candidat';
  return Object.values(state.actors)
    .filter((actor) => actor.kind === 'adversaire' && actor.status === active)
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((actor) => {
      let budget = actor.resources.budgetCentimes;
      let time = actor.resources.tempsHeures;
      const planned: PlannedAction[] = [];
      for (let k = 0; k < level.actionsParSemaine; k++) {
        const affordable = ruleset.actions.filter(
          (a) =>
            a.cout.budgetCentimes <= budget &&
            a.cout.tempsHeures <= time &&
            actor.resources.militants >= a.prerequis.militantsMin,
        );
        if (affordable.length === 0) break;
        const probabilities = softmax(
          affordable.map((a) => scoreAction(actor, a, budget) / TEMPERATURE),
        );
        const rng = stream(state.meta.seed, state.meta.week, 'ia', actor.id, k);
        let target = rng.nextFloat();
        let choice = affordable[affordable.length - 1]!;
        for (let i = 0; i < affordable.length; i++) {
          target -= probabilities[i]!;
          if (target < 0) {
            choice = affordable[i]!;
            break;
          }
        }
        planned.push({ actionId: choice.id });
        budget -= choice.cout.budgetCentimes;
        time -= choice.cout.tempsHeures;
      }
      return { actorId: actor.id, planned };
    });
}
