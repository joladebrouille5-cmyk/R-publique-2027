import {
  DEFAULT_START_DATE,
  isoWeekday,
  parseIsoDate,
  rulesetKey,
  START_DATE_MAX,
  START_DATE_MIN,
  type Actor,
  type Difficulty,
  type GameMode,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './versions';

/** Identifiant de la campagne du joueur (le candidat lui-même est créé en phase 3). */
export const PLAYER_ACTOR_ID = 'joueur';

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

/** Ressources de départ : paramètres de jeu (hypothèses) qui dépendent de la difficulté (§1.3). */
export function createPlayerActor(difficulty: Difficulty, ruleset: Ruleset): Actor {
  return {
    id: PLAYER_ACTOR_ID,
    kind: 'joueur',
    label: 'Votre campagne',
    resources: {
      ...ruleset.jeu.ressourcesInitiales[difficulty],
      tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
    },
  };
}

export function createGame(input: CreateGameInput, ruleset: Ruleset): GameState {
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
      rulesetVersion: rulesetKey(ruleset),
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    },
    player: {
      mode: input.mode,
      actorId: input.mode === 'observateur' ? null : PLAYER_ACTOR_ID,
    },
    actors:
      input.mode === 'observateur'
        ? {}
        : { [PLAYER_ACTOR_ID]: createPlayerActor(input.difficulty, ruleset) },
    scheduled: [],
    pendingDecisions: [],
    eventHistory: {},
    calendar: { blockedBy: null },
  };
}
