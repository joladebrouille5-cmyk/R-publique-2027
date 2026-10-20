import {
  DEFAULT_START_DATE,
  isoWeekday,
  parseIsoDate,
  START_DATE_MAX,
  START_DATE_MIN,
  type Difficulty,
  type GameMode,
  type GameState,
} from '@r2027/shared';
import { deriveRngState } from './rng';
import { ENGINE_VERSION, RULESET_VERSION, SAVE_SCHEMA_VERSION } from './versions';

export type CreateGameInput = {
  seed: string;
  mode: GameMode;
  difficulty: Difficulty;
  startDate?: string | undefined;
};

export class GameCreationError extends Error {
  constructor(
    readonly code: 'mode_non_disponible' | 'date_de_depart_invalide',
    message: string,
  ) {
    super(message);
    this.name = 'GameCreationError';
  }
}

export function createGame(input: CreateGameInput): GameState {
  if (input.mode === 'candidat_reel') {
    throw new GameCreationError(
      'mode_non_disponible',
      'Le mode « candidat réel » nécessite les profils sourcés prévus en phase 3.',
    );
  }

  const startDate = input.startDate ?? DEFAULT_START_DATE;
  const civil = parseIsoDate(startDate);
  if (!civil) {
    throw new GameCreationError('date_de_depart_invalide', `Date invalide : ${startDate}`);
  }
  if (isoWeekday(civil) !== 1) {
    throw new GameCreationError(
      'date_de_depart_invalide',
      'La partie avance par semaines : la date de départ doit être un lundi.',
    );
  }
  if (startDate < START_DATE_MIN || startDate > START_DATE_MAX) {
    throw new GameCreationError(
      'date_de_depart_invalide',
      `La date de départ doit être comprise entre le ${START_DATE_MIN} et le ${START_DATE_MAX}.`,
    );
  }

  return {
    meta: {
      seed: input.seed,
      week: 0,
      date: startDate,
      startDate,
      phase: 'campagne',
      difficulty: input.difficulty,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: RULESET_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    },
    rng: deriveRngState(input.seed, 'partie'),
    player: { mode: input.mode, actorId: null },
  };
}
