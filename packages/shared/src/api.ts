import { z } from 'zod';
import {
  DifficultySchema,
  GameModeSchema,
  GamePhaseSchema,
  GameStateSchema,
  IsoDateSchema,
  SeedSchema,
} from './game';

// Contrats de l'API REST, partagés entre `apps/api` et `apps/web`.

export const MAX_SAVE_SLOTS = 5;

export const CreateGameRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    mode: GameModeSchema,
    difficulty: DifficultySchema.default('standard'),
    seed: SeedSchema.optional(),
    startDate: IsoDateSchema.optional(),
  })
  .strict();
export type CreateGameRequest = z.input<typeof CreateGameRequestSchema>;

export const GameSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: GameModeSchema,
  difficulty: DifficultySchema,
  phase: GamePhaseSchema,
  week: z.number().int(),
  date: IsoDateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

export const GameDetailSchema = GameSummarySchema.extend({
  seed: z.string(),
  engineVersion: z.string(),
  rulesetVersion: z.string(),
  saveSchemaVersion: z.number().int(),
  version: z.number().int(),
  stateHash: z.string(),
  state: GameStateSchema,
});
export type GameDetail = z.infer<typeof GameDetailSchema>;

export const SAVE_KINDS = ['auto', 'manuelle', 'avant_evenement', 'import'] as const;
export const SaveKindSchema = z.enum(SAVE_KINDS);

export const CreateSaveRequestSchema = z
  .object({
    slot: z.number().int().min(1).max(MAX_SAVE_SLOTS),
    label: z.string().trim().max(60).optional(),
    overwrite: z.boolean().default(false),
  })
  .strict();
export type CreateSaveRequest = z.input<typeof CreateSaveRequestSchema>;

export const RestoreSaveRequestSchema = z
  .object({
    /** Version de la partie vue par le client : refus (409) si elle a changé entre-temps. */
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict();
export type RestoreSaveRequest = z.input<typeof RestoreSaveRequestSchema>;

export const SaveSummarySchema = z.object({
  id: z.string(),
  kind: SaveKindSchema,
  slot: z.number().int().nullable(),
  label: z.string().nullable(),
  week: z.number().int(),
  date: IsoDateSchema,
  stateHash: z.string(),
  engineVersion: z.string(),
  saveSchemaVersion: z.number().int(),
  createdAt: z.string(),
});
export type SaveSummary = z.infer<typeof SaveSummarySchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degrade']),
  database: z.enum(['ok', 'indisponible']),
  versions: z.object({
    api: z.string(),
    engine: z.string(),
    saveSchema: z.number().int(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const SessionResponseSchema = z.object({ userId: z.string() });
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
