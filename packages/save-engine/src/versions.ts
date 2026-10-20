import {
  createPlayerActor,
  ENGINE_VERSION,
  PLAYER_ACTOR_ID,
  SAVE_SCHEMA_VERSION,
} from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset, UnknownRulesetError } from '@r2027/rulesets';
import {
  GameStateSchema,
  GameStateV1Schema,
  type GameState,
  type GameStateV1,
} from '@r2027/shared';
import { z } from 'zod';
import { hashState, sha256, canonicalStringify } from './canonical';

export type SaveFormatErrorCode =
  | 'version_future'
  | 'version_inconnue'
  | 'etat_invalide'
  | 'empreinte_incoherente'
  | 'regles_inconnues'
  | 'format_inconnu'
  | 'incoherence';

/** Sauvegarde ou fichier illisible : refusé en entier, jamais appliqué partiellement. */
export class SaveFormatError extends Error {
  constructor(
    readonly code: SaveFormatErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export const CURRENT_SAVE_SCHEMA_VERSION = SAVE_SCHEMA_VERSION;

const SCHEMAS: Record<number, z.ZodType> = { 1: GameStateV1Schema, 2: GameStateSchema };

/**
 * Format 1 → 2 (phase 2) : ajout des ressources de campagne, des effets programmés, des
 * décisions et du calendrier ; l'aléa n'est plus stocké (dérivé de la graine). Les ressources
 * de départ sont celles du jeu de règles courant pour la difficulté de la partie.
 */
function migrateV1ToV2(v1: GameStateV1): GameState {
  const ruleset = getRuleset(CURRENT_RULESET_KEY);
  const observer = v1.player.mode === 'observateur';
  return {
    meta: {
      ...v1.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 2,
    },
    player: { mode: v1.player.mode, actorId: observer ? null : PLAYER_ACTOR_ID },
    actors: observer ? {} : { [PLAYER_ACTOR_ID]: createPlayerActor(v1.meta.difficulty, ruleset) },
    scheduled: [],
    pendingDecisions: [],
    eventHistory: {},
    calendar: { blockedBy: null },
  };
}

const MIGRATIONS: Record<number, (state: never) => unknown> = { 1: migrateV1ToV2 };

export type LoadedState = { state: GameState; stateHash: string; migratedFrom: number | null };

/** Valide un état selon le schéma de sa version puis le migre jusqu'au format courant. */
export function upgradeState(raw: unknown, version: number): Omit<LoadedState, 'stateHash'> {
  if (version > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new SaveFormatError(
      'version_future',
      `Format de sauvegarde ${version} plus récent que ce serveur (format ${CURRENT_SAVE_SCHEMA_VERSION}).`,
    );
  }
  const schema = SCHEMAS[version];
  if (!schema)
    throw new SaveFormatError('version_inconnue', `Format de sauvegarde inconnu : ${version}.`);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new SaveFormatError(
      'etat_invalide',
      `État invalide pour le format ${version}.`,
      z.treeifyError(parsed.error),
    );
  }
  let value: unknown = parsed.data;
  for (let v = version; v < CURRENT_SAVE_SCHEMA_VERSION; v++)
    value = MIGRATIONS[v]!(value as never);
  const state = GameStateSchema.parse(value);
  try {
    getRuleset(state.meta.rulesetVersion);
  } catch (error) {
    if (error instanceof UnknownRulesetError) {
      throw new SaveFormatError('regles_inconnues', error.message);
    }
    throw error;
  }
  return { state, migratedFrom: version < CURRENT_SAVE_SCHEMA_VERSION ? version : null };
}

/**
 * Relit un état stocké (base ou fichier) : l'empreinte est vérifiée sur l'état tel qu'il a
 * été enregistré, AVANT toute migration ; puis l'état est validé et migré.
 */
export function loadStoredState(raw: unknown, expectedHash: string, version: number): LoadedState {
  let actualHash: string;
  try {
    actualHash = sha256(canonicalStringify(raw));
  } catch {
    throw new SaveFormatError('etat_invalide', 'État non sérialisable.');
  }
  if (actualHash !== expectedHash) {
    throw new SaveFormatError(
      'empreinte_incoherente',
      'Empreinte incohérente : l’état a été modifié ou corrompu.',
    );
  }
  const upgraded = upgradeState(raw, version);
  return { ...upgraded, stateHash: hashState(upgraded.state) };
}
