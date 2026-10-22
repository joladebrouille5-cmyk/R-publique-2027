import type {
  ActionDefinition,
  Actor,
  GameState,
  PlannedAction,
  RealOutlet,
  ResourceKey,
  Ruleset,
  Strategy,
  StrategyPriority,
} from '@r2027/shared';
import { expectedReimbursementCap, formatEuros, spendingCap } from '../campaign/finances';
import { arcomParty, outletAudience, propensity } from '../campaign/medias';
import { bestPosture, isPlateau } from '../campaign/prestations';
import {
  available,
  committedByDepartement,
  departements,
  perDepartementCap,
  presentationWindow,
  projectedPresentations,
} from '../campaign/parrainages';
import { formatFrenchDate } from '../core/calendar';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { upcomingDebate } from '../election/debats';
import { softmax } from '../election/model';

// IA des adversaires (§7) : chaque adversaire analyse sa situation, en déduit une priorité
// motivée (sa stratégie de la semaine), évalue le coût et le bénéfice de chaque action
// possible avec sa meilleure cible, puis choisit. Mêmes actions, mêmes coûts et mêmes règles
// de validation que le joueur ; aucun modèle de langage. La difficulté ne change que ses
// moyens (budget, nombre d'actions) et la finesse de ses choix (température).

/** Échelle d'une unité de « gain » par ressource, pour comparer des effets hétérogènes. */
const SCALE: Record<ResourceKey, number> = {
  budgetCentimes: 10_000_000,
  tempsHeures: 10,
  militants: 50,
  notoriete: 100,
  popularite: 100,
  jeunesse: 100,
  dynamique: 100,
};
const PRIORITY_WEIGHT = 1.5;

/** Importance que l'adversaire accorde à chaque ressource, selon sa situation. */
function needs(actor: Actor): Record<ResourceKey, number> {
  const r = actor.resources;
  return {
    budgetCentimes: r.budgetCentimes < 100_000_000 ? 1 : 0.2,
    tempsHeures: 0,
    militants: r.militants < 300 ? 0.6 : 0.2,
    notoriete: 1 - r.notoriete / 10_000,
    popularite: 1.2,
    // Jauges des réseaux (phase 9) : poids modérés, à la mesure de leur effet sur le vote.
    jeunesse: 0.15 * (1 - r.jeunesse / 10_000),
    dynamique: 0.1,
  };
}

/**
 * Valeur attendue d'une action : gains attendus pondérés par les besoins, moins le risque
 * (pondéré par le goût du risque et le style) et le poids du coût dans le budget restant.
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

const pct = (centiemes: number) => `${(centiemes / 100).toFixed(1).replace('.', ',')} %`;

/** Coût de l'action la plus chère : en dessous, la trésorerie limite la campagne. */
function comfortableBudget(ruleset: Ruleset): number {
  return Math.max(...ruleset.actions.map((a) => a.cout.budgetCentimes)) * 1.1;
}

function needsSponsorship(state: GameState, ruleset: Ruleset, actor: Actor): boolean {
  if (state.campagne.parrainages !== 'modelise' || state.meta.phase !== 'campagne') return false;
  if (presentationWindow(state.meta.date, ruleset).closed) return false;
  const projected = projectedPresentations(actor, ruleset);
  const { seuil, departementsMin } = ruleset.parrainages;
  return projected.counted < seuil * 1.2 || projected.departements < departementsMin + 3;
}

/** Étape 3 (analyse) : priorité de la semaine et motif lisible. */
export function analyzeSituation(state: GameState, ruleset: Ruleset, actor: Actor): Strategy {
  const week = state.meta.week;
  const make = (priorite: StrategyPriority, motif: string): Strategy => ({
    priorite,
    motif,
    semaine: week,
  });
  if (needsSponsorship(state, ruleset, actor)) {
    const projected = projectedPresentations(actor, ruleset);
    const closing = presentationWindow(state.meta.date, ruleset).closing;
    return make(
      'parrainages',
      `Environ ${projected.counted} présentations en vue dans ${projected.departements} départements : il en faut ${ruleset.parrainages.seuil} de ${ruleset.parrainages.departementsMin} départements avant le ${formatFrenchDate(closing)}.`,
    );
  }
  if (actor.resources.budgetCentimes < comfortableBudget(ruleset)) {
    return make(
      'financement',
      `Trésorerie de ${formatEuros(actor.resources.budgetCentimes)} : priorité aux dons et à l'emprunt.`,
    );
  }
  const max = ruleset.debats.preparationMaxHeures;
  if (state.meta.phase === 'entre_deux_tours' && actor.status === 'qualifie') {
    if (actor.preparationDebat < max) {
      return make(
        'debat',
        `Débat d'entre-deux-tours à préparer (${actor.preparationDebat} h sur ${max} h utiles).`,
      );
    }
  }
  if (actor.status === 'candidat' && upcomingDebate(state, ruleset, 3)) {
    if (actor.preparationDebat < max / 2) {
      return make(
        'debat',
        `Débat télévisé dans les trois semaines : préparation à poursuivre (${actor.preparationDebat} h).`,
      );
    }
  }
  if (actor.resources.notoriete < 3_000) {
    return make(
      'notoriete',
      `Notoriété de ${pct(actor.resources.notoriete)} : se faire connaître.`,
    );
  }
  if (actor.resources.militants < 300) {
    return make('mobilisation', `${actor.resources.militants} militants : renforcer le terrain.`);
  }
  const intentions = state.opinion?.intentions[actor.id];
  return make(
    'popularite',
    intentions === undefined
      ? 'Convaincre de nouveaux électeurs.'
      : `${pct(intentions)} d'intentions de vote : convaincre de nouveaux électeurs.`,
  );
}

/** Intérêt d'une action pour la priorité de la semaine (0 si elle ne la sert pas). */
function relevance(action: ActionDefinition, priority: StrategyPriority): number {
  const effect = (r: ResourceKey) =>
    action.effets.filter((e) => e.ressource === r).reduce((sum, e) => sum + e.base, 0);
  switch (priority) {
    case 'parrainages':
      return action.campagne?.promesses ? 3 : 0;
    case 'financement':
      return action.campagne?.dons || action.campagne?.emprunt ? 2.5 : 0;
    case 'debat':
      return action.campagne?.preparationDebat ? 3 : 0;
    case 'notoriete':
      return effect('notoriete') / 100 + (action.campagne?.exposition ?? 0) / 1_000;
    case 'popularite':
      return effect('popularite') / 50;
    case 'mobilisation':
      return effect('militants') / 30;
  }
}

/** Lassitude du public : un même format numérique répété perd de son intérêt (phase 10). */
const REPEAT_PENALTY = 2.5;

/** Passages récents du candidat dans le format de l'action (quatre semaines), plan compris. */
function recentRepeats(
  state: GameState,
  actorId: string,
  action: ActionDefinition,
  planned: readonly PlannedAction[],
): number {
  if (!action.format) return 0;
  const since = state.meta.week - 4;
  return (
    (state.numerique.passages[actorId]?.[action.id] ?? []).filter((w) => w >= since).length +
    planned.filter((p) => p.actionId === action.id).length
  );
}

/** Bonus selon l'objectif de l'adversaire (§7). */
function objectiveBonus(actor: Actor, action: ActionDefinition): number {
  if (actor.objectif === 'victoire' && action.portee === 'nationale') return 0.3;
  if (actor.objectif === 'visibilite' && (action.campagne?.exposition ?? 0) > 0) return 0.3;
  if (actor.objectif === 'qualification' && action.effets.some((e) => e.ressource === 'popularite'))
    return 0.2;
  return 0;
}

/** Meilleur département pour chercher des parrainages : élus libres, implantation, plafond. */
function bestDepartement(
  state: GameState,
  ruleset: Ruleset,
  actor: Actor,
  used: ReadonlySet<string>,
  engaged: ReadonlyMap<string, number>,
): string | null {
  const cap = perDepartementCap(ruleset);
  const p = actor.parrainages;
  const reservoir = ruleset.parrainages.reservoir.departements;
  let best: string | null = null;
  let bestValue = 0;
  for (const dep of departements(ruleset)) {
    const mine = (p.promesses[dep] ?? 0) + (p.intentions[dep] ?? 0) + (p.validees[dep] ?? 0);
    if (mine >= cap * 1.4) continue;
    const free = available(state, ruleset, dep, engaged);
    if (free <= 0) continue;
    const value =
      Math.min(free, 40) *
      (actor.implantation.includes(reservoir[dep]!.region) ? 1.5 : 1) *
      (mine === 0 ? 1.3 : 1) *
      (used.has(dep) ? 0.3 : 1);
    if (value > bestValue) {
      bestValue = value;
      best = dep;
    }
  }
  return best;
}

/** Audience touchée par un passage sur un organe, selon l'exposition mesurée de son parti. */
function outletValue(ruleset: Ruleset, outlet: RealOutlet, party: string | null): number {
  return outletAudience(ruleset, outlet) * propensity(ruleset, outlet, party);
}

/** Média le plus utile : audience de l'organe et exposition mesurée de son parti. */
function bestOutlet(ruleset: Ruleset, actor: Actor, used: ReadonlySet<string>): string {
  const party = arcomParty(ruleset, actor);
  let best = ruleset.mediasReels.organes[0]!.id;
  let bestValue = -1;
  for (const outlet of ruleset.mediasReels.organes) {
    const value = outletValue(ruleset, outlet, party) * (used.has(outlet.id) ? 0.4 : 1);
    if (value > bestValue) {
      bestValue = value;
      best = outlet.id;
    }
  }
  return best;
}

/** Émission la plus utile : audience de son organe et de ses autres diffuseurs (mêmes règles). */
function bestShow(ruleset: Ruleset, actor: Actor, used: ReadonlySet<string>): string | undefined {
  const party = arcomParty(ruleset, actor);
  const outlets = new Map(ruleset.mediasReels.organes.map((o) => [o.id, o]));
  let best: string | undefined;
  let bestValue = -1;
  for (const show of ruleset.mediasReels.emissions) {
    const value =
      (outletValue(ruleset, outlets.get(show.organeId)!, party) +
        show.autresOrganes.reduce(
          (sum, id) =>
            sum + ruleset.medias.partCodiffusion * outletValue(ruleset, outlets.get(id)!, party),
          0,
        )) *
      (used.has(show.id) ? 0.4 : 1);
    if (value > bestValue) {
      bestValue = value;
      best = show.id;
    }
  }
  return best;
}

/** Une action est-elle utile à tenter ? (pas de prêt voué au refus, pas de parrainages tardifs) */
function worthTrying(state: GameState, ruleset: Ruleset, actor: Actor, action: ActionDefinition) {
  if (action.campagne?.promesses) {
    if (state.campagne.parrainages !== 'modelise' || state.meta.phase !== 'campagne') return false;
    if (presentationWindow(state.meta.date, ruleset).closed) return false;
  }
  if (action.campagne?.emprunt) {
    const share = (state.opinion?.intentions[actor.id] ?? 0) / 10_000;
    const room = expectedReimbursementCap(ruleset, share) - actor.finances.recettes.emprunts;
    if (room < action.campagne.emprunt.montantCentimes) return false;
  }
  if (
    action.campagne?.preparationDebat &&
    state.meta.phase !== 'entre_deux_tours' &&
    !upcomingDebate(state, ruleset, 3)
  )
    return false;
  return true;
}

export type OpponentPlan = { actorId: string; planned: PlannedAction[]; strategie: Strategy };

/**
 * Étape 3 : chaque adversaire encore en lice analyse sa situation, met à jour sa stratégie et
 * choisit ses actions de la semaine parmi celles qu'il peut payer (budget, temps, plafond
 * légal), avec leur meilleure cible. Le choix est tiré avec une probabilité croissante avec la
 * valeur estimée (température selon la difficulté).
 */
export function planOpponentActions(state: GameState, ruleset: Ruleset): OpponentPlan[] {
  const level = ruleset.ia[state.meta.difficulty];
  const active = state.meta.phase === 'entre_deux_tours' ? 'qualifie' : 'candidat';
  const engaged = committedByDepartement(state);
  return Object.values(state.actors)
    .filter((actor) => actor.kind === 'adversaire' && actor.status === active)
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((actor) => {
      const strategie = analyzeSituation(state, ruleset, actor);
      let budget = actor.resources.budgetCentimes;
      let time = actor.resources.tempsHeures;
      let spent = actor.finances.depenses;
      const cap = spendingCap(state, actor.id, ruleset);
      const usedDeps = new Set<string>();
      const usedOutlets = new Set<string>();
      const planned: PlannedAction[] = [];
      for (let k = 0; k < level.actionsParSemaine; k++) {
        const options = ruleset.actions
          .filter(
            (a) =>
              a.cout.budgetCentimes <= budget &&
              a.cout.tempsHeures <= time &&
              spent + a.cout.budgetCentimes <= cap &&
              actor.resources.militants >= a.prerequis.militantsMin &&
              worthTrying(state, ruleset, actor, a),
          )
          .map((action) => {
            let cible: string | undefined;
            if (action.cible === 'departement') {
              cible = bestDepartement(state, ruleset, actor, usedDeps, engaged) ?? undefined;
            } else if (action.cible === 'media') {
              cible = bestOutlet(ruleset, actor, usedOutlets);
            } else if (action.cible === 'emission') {
              cible = bestShow(ruleset, actor, usedOutlets);
            }
            return { action, cible };
          })
          .filter(({ action, cible }) => action.cible === null || cible !== undefined);
        if (options.length === 0) break;
        const probabilities = softmax(
          options.map(
            ({ action }) =>
              (scoreAction(actor, action, budget) +
                PRIORITY_WEIGHT * relevance(action, strategie.priorite) +
                objectiveBonus(actor, action) -
                REPEAT_PENALTY * recentRepeats(state, actor.id, action, planned)) /
              level.temperature,
          ),
        );
        const rng = stream(state.meta.seed, state.meta.week, 'ia', actor.id, k);
        let target = rng.nextFloat();
        let choice = options[options.length - 1]!;
        for (let i = 0; i < options.length; i++) {
          target -= probabilities[i]!;
          if (target < 0) {
            choice = options[i]!;
            break;
          }
        }
        // Passage dans les médias : la posture au meilleur score, préparation prévue comprise.
        const posture = isPlateau(ruleset, choice.action)
          ? bestPosture(state, ruleset, {
              actorId: actor.id,
              definition: choice.action,
              cible: choice.cible ?? null,
              preparationSemaine: planned.reduce(
                (sum, p) =>
                  sum +
                  (ruleset.actions.find((a) => a.id === p.actionId)?.campagne?.preparationDebat ??
                    0),
                0,
              ),
              passagesSemaine: planned.filter((p) => p.actionId === choice.action.id).length,
            })
          : undefined;
        planned.push({
          actionId: choice.action.id,
          ...(choice.cible === undefined ? {} : { cible: choice.cible }),
          ...(posture === undefined ? {} : { posture }),
        });
        if (choice.action.cible === 'departement' && choice.cible) usedDeps.add(choice.cible);
        if ((choice.action.cible === 'media' || choice.action.cible === 'emission') && choice.cible)
          usedOutlets.add(choice.cible);
        budget -= choice.action.cout.budgetCentimes;
        spent += choice.action.cout.budgetCentimes;
        time -= choice.action.cout.tempsHeures;
      }
      return { actorId: actor.id, planned, strategie };
    });
}
