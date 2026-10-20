import { z } from 'zod';
import { isValidIsoDate } from './dates';

export const GAME_MODES = ['candidat_reel', 'candidat_personnalise', 'observateur'] as const;
export const GameModeSchema = z.enum(GAME_MODES);
export type GameMode = z.infer<typeof GameModeSchema>;

export const DIFFICULTIES = ['accessible', 'standard', 'expert'] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const GAME_PHASES = [
  'campagne',
  'entre_deux_tours',
  'presidence',
  'legislatives',
  'bilan',
] as const;
export const GamePhaseSchema = z.enum(GAME_PHASES);
export type GamePhase = z.infer<typeof GamePhaseSchema>;

export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'Date attendue au format AAAA-MM-JJ' });

/**
 * Date de départ par défaut : lundi 28 septembre 2026, premier lundi de l'automne 2026.
 * Choix de conception du jeu (le cahier des charges demande un départ « configurable à
 * l'automne 2026 »), pas une date officielle.
 */
export const DEFAULT_START_DATE = '2026-09-28';

/** Fenêtre de départ autorisée en phase 1 (hypothèse de conception, revue en phase 2). */
export const START_DATE_MIN = '2026-09-01';
export const START_DATE_MAX = '2026-12-31';

/** Graine : caractères sûrs uniquement, pour pouvoir la recopier et la partager. */
export const SeedSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, { message: 'Graine : lettres, chiffres, « _ » et « - » uniquement' });

const Uint32Schema = z.number().int().min(0).max(0xffffffff);

export const RngStateSchema = z
  .object({
    algorithm: z.literal('sfc32'),
    state: z.tuple([Uint32Schema, Uint32Schema, Uint32Schema, Uint32Schema]),
  })
  .strict();
export type RngState = z.infer<typeof RngStateSchema>;

/**
 * État complet d'une partie. Phase 1 : socle minimal (méta-données, aléa, joueur).
 * Les phases suivantes ajoutent acteurs, campagne, opinion, institutions… avec
 * incrément de `saveSchemaVersion` et migration de sauvegarde.
 */
export const GameStateSchema = z
  .object({
    meta: z
      .object({
        seed: SeedSchema,
        week: z.number().int().min(0),
        date: IsoDateSchema,
        startDate: IsoDateSchema,
        phase: GamePhaseSchema,
        difficulty: DifficultySchema,
        engineVersion: z.string().min(1),
        rulesetVersion: z.string().min(1),
        saveSchemaVersion: z.number().int().positive(),
      })
      .strict(),
    rng: RngStateSchema,
    player: z
      .object({
        mode: GameModeSchema,
        actorId: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type GameState = z.infer<typeof GameStateSchema>;
