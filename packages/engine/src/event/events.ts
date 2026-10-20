import type {
  DecisionAnswer,
  EventDefinition,
  GameState,
  PendingDecision,
  ReportEvent,
  Ruleset,
  WeeklyReport,
} from '@r2027/shared';
import { applyOrSchedule } from '../core/effects';
import { EngineInputError } from '../core/errors';
import { compareStrings, type Ledger } from '../core/ledger';
import { drawAlea, stream } from '../core/random';

type AppliedDecision = WeeklyReport['decisions'][number];
type ResolvedAnswer = { decision: PendingDecision; optionId: string; automatic: boolean };

/**
 * Étape 1 : chaque décision en attente doit recevoir une réponse valide avant de résoudre
 * la semaine. En mode observateur, l'option par défaut est retenue automatiquement.
 */
export function validateDecisionAnswers(
  state: GameState,
  answers: readonly DecisionAnswer[],
): ResolvedAnswer[] {
  const pending = new Map(state.pendingDecisions.map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const answer of answers) {
    if (seen.has(answer.decisionId)) {
      throw new EngineInputError('decision_en_double', `Décision répétée : ${answer.decisionId}`);
    }
    seen.add(answer.decisionId);
    const decision = pending.get(answer.decisionId);
    if (!decision) {
      throw new EngineInputError(
        'decision_inconnue',
        `Aucune décision en attente : ${answer.decisionId}`,
      );
    }
    if (!decision.options.some((o) => o.id === answer.optionId)) {
      throw new EngineInputError('option_inconnue', `Option inconnue pour « ${decision.label} ».`);
    }
  }
  const automatic = state.player.mode === 'observateur';
  return [...pending.values()]
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((decision) => {
      const answer = answers.find((a) => a.decisionId === decision.id);
      if (!answer && !automatic) {
        throw new EngineInputError(
          'decision_requise',
          `Décision à prendre avant de continuer : « ${decision.label} ».`,
        );
      }
      return {
        decision,
        optionId: answer?.optionId ?? decision.defaultOptionId,
        automatic: !answer,
      };
    });
}

/** Étape 5 : application des options choisies pour les décisions de la semaine précédente. */
export function applyDecisions(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  answers: readonly ResolvedAnswer[],
  step: number,
): AppliedDecision[] {
  const week = state.meta.week;
  const applied: AppliedDecision[] = [];
  for (const { decision, optionId, automatic } of answers) {
    if (decision.kind === 'consigne') {
      // Consigne de vote du joueur éliminé : pas d'effet sur les ressources, effet au second tour.
      const toActorId = optionId === 'aucune' ? null : optionId;
      state.elections.consignes.push({ fromActorId: decision.actorId, toActorId, automatic });
      const option = decision.options.find((o) => o.id === optionId)!;
      applied.push({
        decisionId: decision.id,
        eventId: decision.eventId,
        optionId,
        label: `${decision.label} : ${option.libelle}`,
        automatic,
      });
      continue;
    }
    const definition = ruleset.evenements.find((e) => e.id === decision.eventId);
    const option = definition?.choix.find((c) => c.id === optionId);
    if (!definition || !option) throw new Error(`Événement ou option introuvable : ${decision.id}`);
    if (state.actors[decision.actorId]) {
      const rng = stream(state.meta.seed, week, 'decision', decision.id, option.id);
      const context = {
        state,
        ledger,
        actorId: decision.actorId,
        week,
        step,
        ref: `${decision.id}-${option.id}`,
        label: `${definition.libelle} — ${option.libelle}`,
        source: 'decision' as const,
      };
      option.effets.forEach((effect, i) =>
        applyOrSchedule(context, effect, drawAlea(rng, effect), i),
      );
    }
    applied.push({
      decisionId: decision.id,
      eventId: definition.id,
      optionId: option.id,
      label: `${definition.libelle} : ${option.libelle}`,
      automatic,
    });
  }
  state.pendingDecisions = [];
  return applied;
}

function isEligible(state: GameState, event: EventDefinition, actorId: string): boolean {
  const resources = state.actors[actorId]!.resources;
  const history = state.eventHistory[event.id];
  const week = state.meta.week;
  if (history && event.occurrencesMax !== null && history.count >= event.occurrencesMax)
    return false;
  if (history && week - history.lastWeek < event.delaiMinEntreOccurrences) return false;
  return event.conditions.every(
    (c) =>
      (c.min === null || resources[c.ressource] >= c.min) &&
      (c.max === null || resources[c.ressource] <= c.max),
  );
}

/**
 * Étape 5 : tirage des événements de la semaine (§8 : conditions, probabilité, fréquence,
 * effets immédiats et différés, choix). Au plus `evenementsMaxParSemaine` événements et une
 * seule nouvelle décision par semaine.
 */
export function drawEvents(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  step: number,
): ReportEvent[] {
  const actorId = state.player.actorId;
  const player = actorId ? state.actors[actorId] : undefined;
  // Événements de campagne : seulement pour un joueur encore en lice.
  if (!actorId || !player || (player.status !== 'candidat' && player.status !== 'qualifie'))
    return [];
  const week = state.meta.week;
  const triggered: ReportEvent[] = [];
  let decisionCreated = false;

  const candidates = [...ruleset.evenements].sort((a, b) => compareStrings(a.id, b.id));
  for (const event of candidates) {
    if (triggered.length >= ruleset.jeu.evenementsMaxParSemaine) break;
    const hasChoices = event.choix.length > 0;
    if (hasChoices && decisionCreated) continue;
    if (!isEligible(state, event, actorId)) continue;
    const rng = stream(state.meta.seed, week, 'evenement', event.id);
    if (rng.nextFloat() >= event.probabiliteHebdomadaire) continue;

    const previous = state.eventHistory[event.id];
    state.eventHistory[event.id] = { count: (previous?.count ?? 0) + 1, lastWeek: week };
    const id = `e-${week}-${event.id}`;
    let decisionId: string | null = null;

    if (hasChoices) {
      decisionId = `d-${week}-${event.id}`;
      decisionCreated = true;
      state.pendingDecisions.push({
        id: decisionId,
        kind: 'evenement',
        eventId: event.id,
        actorId,
        createdWeek: week,
        label: event.libelle,
        description: event.description,
        options: event.choix.map(({ id: optionId, libelle, description }) => ({
          id: optionId,
          libelle,
          description,
        })),
        defaultOptionId: event.choixParDefaut!,
      });
    }
    const context = {
      state,
      ledger,
      actorId,
      week,
      step,
      ref: id,
      label: event.libelle,
      source: 'evenement' as const,
    };
    event.effets.forEach((effect, i) => applyOrSchedule(context, effect, drawAlea(rng, effect), i));

    triggered.push({
      id,
      kind: 'evenement',
      refId: event.id,
      label: event.libelle,
      description: event.description,
      nature: event.nature,
      majeur: event.majeur,
      decisionId,
    });
  }
  return triggered;
}
