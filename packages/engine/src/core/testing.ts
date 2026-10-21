// Outils partagés par les tests du moteur (non exportés par le paquet).
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import type {
  DecisionAnswer,
  GameState,
  PlannedAction,
  Resources,
  Ruleset,
  WeeklyReport,
} from '@r2027/shared';
import { departements, presentationWindow } from '../campaign/parrainages';
import { advanceWeek } from './advanceWeek';
import { createGame, PLAYER_ACTOR_ID, type CreateGameInput } from './createGame';

export const RULESET = getRuleset(CURRENT_RULESET_KEY);

/** Copie du jeu de règles où seuls les événements listés peuvent survenir (probabilité donnée). */
export function withEvents(
  probabilities: Record<string, number>,
  ruleset: Ruleset = RULESET,
): Ruleset {
  const copy = JSON.parse(JSON.stringify(ruleset)) as Ruleset;
  for (const event of copy.evenements) event.probabiliteHebdomadaire = probabilities[event.id] ?? 0;
  return copy;
}
export const QUIET = withEvents({});

export const TEST_CANDIDATE = {
  prenom: 'Camille',
  nom: 'Test',
  parti: 'Parti du test',
  positionnement: { economie: 0, societe: 0 },
};

export function newGame(
  overrides: Partial<CreateGameInput> = {},
  ruleset: Ruleset = RULESET,
): GameState {
  const mode = overrides.mode ?? 'candidat_personnalise';
  return createGame(
    {
      seed: 'graine-test',
      mode,
      difficulty: 'standard',
      ...(mode === 'candidat_personnalise' ? { candidate: TEST_CANDIDATE } : {}),
      ...overrides,
    },
    ruleset,
  );
}

/** « interview@france-inter » → action et sa cible ; « meeting » → action sans cible. */
export function planned(action: string): PlannedAction {
  const [actionId, cible] = action.split('@') as [string, string | undefined];
  return cible === undefined ? { actionId } : { actionId, cible };
}

export function advance(
  state: GameState,
  actions: string[] = [],
  decisions: DecisionAnswer[] = [],
  ruleset: Ruleset = QUIET,
) {
  return advanceWeek(state, { actions: actions.map(planned), decisions }, { ruleset });
}

/**
 * Plan de test : deux rencontres d'élus par semaine dans des départements différents, tant que
 * les présentations restent ouvertes — de quoi atteindre le seuil des parrainages.
 */
export function sponsorship(state: GameState, ruleset: Ruleset = RULESET): string[] {
  if (state.meta.phase !== 'campagne' || presentationWindow(state.meta.date, ruleset).closed)
    return [];
  const deps = departements(ruleset);
  const week = state.meta.week;
  return [0, 1].map((k) => `elus-locaux@${deps[(week * 2 + k) % deps.length]!}`);
}

export const playerResources = (state: GameState) => state.actors[PLAYER_ACTOR_ID]!.resources;

export function withResources(
  state: GameState,
  patch: Partial<Resources>,
  actorId = PLAYER_ACTOR_ID,
): GameState {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  Object.assign(copy.actors[actorId]!.resources, patch);
  return copy;
}

export const playerChange = (report: WeeklyReport, ressource: string) =>
  report.changes.find((c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === ressource);

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * Joue jusqu'à ce que `done(state)` soit vrai (ou que la partie soit bloquée), en répondant
 * aux décisions par l'option par défaut ; `plan(state)` fournit les actions du joueur.
 */
export function playUntil(
  start: GameState,
  done: (state: GameState) => boolean,
  ruleset: Ruleset = RULESET,
  plan: (state: GameState) => string[] = () => [],
): { state: GameState; reports: WeeklyReport[] } {
  let state = start;
  const reports: WeeklyReport[] = [];
  for (let i = 0; i < 80 && !state.calendar.blockedBy && !done(state); i++) {
    const decisions = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    }));
    const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
    const active = player && (player.status === 'candidat' || player.status === 'qualifie');
    const actions = active ? plan(state) : [];
    const result = advanceWeek(state, { actions: actions.map(planned), decisions }, { ruleset });
    reports.push(result.report);
    state = result.state;
  }
  return { state, reports };
}

/** Joue jusqu'à la fin de la présidentielle (calendrier bloqué). */
export function playToEnd(
  start: GameState,
  ruleset: Ruleset = RULESET,
  plan: (state: GameState) => string[] = () => [],
): { state: GameState; reports: WeeklyReport[] } {
  const result = playUntil(start, () => false, ruleset, plan);
  if (!result.state.calendar.blockedBy) throw new Error('La présidentielle aurait dû se terminer');
  return result;
}
