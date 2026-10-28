export { analyzeSituation, planOpponentActions, scoreAction } from './ai/opponents';
export { initialRelations, proximity, weeksBeforeFirstRound } from './ai/relations';
export { targetLabel } from './campaign/actions';
export {
  emptyFinances,
  expectedReimbursementCap,
  formatEuros,
  openingAccount,
  spendingCap,
} from './campaign/finances';
export {
  countedPresentations,
  emptyParrainages,
  meetsThreshold,
  perDepartementCap,
  presentationWindow,
  projectedPresentations,
} from './campaign/parrainages';
export {
  credibility,
  programmeAppeal,
  programmeCost,
  validateProgrammeChange,
} from './campaign/programme';
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
  distributeInitialPromises,
  GameCreationError,
  PLAYER_ACTOR_ID,
  type CreateGameInput,
} from './core/createGame';
export { EngineInputError, inputErrorStatus, type EngineInputErrorCode } from './core/errors';
export { createRng, deriveRngState, seedSfc32, type Rng } from './core/rng';
export { sha256Hex } from './core/sha256';
export { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './core/versions';
export { largestRemainder } from './election/apportion';
export { distribute, summarize } from './election/distribution';
export { debateComponents, debatePerformance } from './election/flow';
export {
  angleHolds,
  debateSkills,
  debateVoteFactors,
  invitedTo,
  playDebate,
  resolveWeekDebates,
  scheduleDebates,
  upcomingDebate,
} from './election/debats';
export { distance, softmax } from './election/model';
export { marginOfError } from './election/polls';
export { resolveRound } from './election/rounds';
export {
  aggregateCounts,
  aggregateHierarchy,
  checkCounts,
  type VoteCounts,
} from './territory/aggregate';
export {
  demoBaseline,
  demoBaselineFromTopologies,
  historicalBaseline,
  nationalBaseline,
  type CommuneRef,
  type TerritorialBaseline,
  type TerritorialUnit,
} from './territory/baseline';
export { BaselineMismatchError, communeResults } from './territory/communes';
export { tallyBaseline, tallyUnit } from './territory/tally';
export {
  applyPresidentialEffects,
  governmentAgeWeeks,
  presidentialActionBlocked,
  recentCrisis,
  validatePresidencyActions,
} from './presidency/actions';
export {
  aiCoalitionChoice,
  aiPacts,
  ALLIANCE_DECISION_EVENT,
  allianceOptions,
  blocDistance,
  COALITION_DECISION_EVENT,
  needsCoalition,
  openLegislativeCampaign,
  playerCamp,
} from './presidency/alliances';
export { computeTension, updateTension, weeklyTension } from './presidency/tension';
export { ministerEffects } from './presidency/themes';
export {
  addYears,
  FIRST_CYCLE,
  mandateDates,
  nextCampaignStart,
  nextCycle,
  shiftToCycle,
} from './presidency/dates';
export {
  acceptsPost,
  aiPrimeMinister,
  composeMinisters,
  eligibleCandidates,
  GOVERNMENT_DECISION_EVENT,
  memberLabel,
  openQuinquennat,
  presidentOf,
  snapshot,
} from './presidency/government';
export {
  figureById,
  governmentGroups,
  memberInCharge,
  memberName,
  memberTraits,
  teamCompetence,
} from './presidency/members';
export { openNextCampaign, reviewQuinquennat } from './presidency/cycle';
export { activeConsequences, addConsequence, crisisMultiplier } from './presidency/consequences';
export { answerCrisis, drawCrises } from './presidency/crises';
export {
  blocPositions,
  dissolutionBlocked,
  firstRound,
  legislativeWeek,
  nationalTargets,
  openLegislatives,
  presidentBloc,
  secondRound,
  thirdTuesdayOfJune,
} from './presidency/legislatives';
export {
  applyReformToEconomy,
  EconomyBook,
  openEconomy,
  shareOfGdp,
  weeklyEconomy,
} from './presidency/economy';
export {
  aiBillChoice,
  alignmentOf,
  BILL_DECISION_EVENT,
  canEngage,
  censureVote,
  domainCompetence,
  engagementFactor,
  filledSeats,
  interventionLabel,
  isKeyVote,
  membersMajority,
  openParliament,
  oppositionIntervention,
  projectVote,
  rebelShare,
  rebelsOf,
  reformDelayWeeks,
  reformEffect,
  reformKept,
  reformReception,
  sessionOf,
  tallyVote,
} from './presidency/parliament';
