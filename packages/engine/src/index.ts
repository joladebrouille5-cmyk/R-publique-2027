export { planOpponentActions, scoreAction } from './ai/opponents';
export {
  advanceWeek,
  WEEKLY_STEPS,
  type AdvanceInput,
  type AdvanceResult,
  type EngineContext,
} from './core/advanceWeek';
export { formatFrenchDate, scrutinInWeek, upcomingNotices } from './core/calendar';
export {
  createGame,
  createOpponents,
  createPlayerActor,
  GameCreationError,
  PLAYER_ACTOR_ID,
  type CreateGameInput,
} from './core/createGame';
export { EngineInputError, type EngineInputErrorCode } from './core/errors';
export { createRng, deriveRngState, seedSfc32, type Rng } from './core/rng';
export { sha256Hex } from './core/sha256';
export { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './core/versions';
export { largestRemainder } from './election/apportion';
export { distribute, summarize } from './election/distribution';
export { distance, softmax } from './election/model';
export { marginOfError } from './election/polls';
export { resolveRound } from './election/rounds';
export {
  aggregateCounts,
  aggregateHierarchy,
  checkCounts,
  type VoteCounts,
} from './territory/aggregate';
