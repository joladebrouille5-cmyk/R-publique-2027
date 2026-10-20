import { z } from 'zod';
import { isValidIsoDate } from './dates';
import { ResourceKeySchema, ResourcesSchema } from './resources';

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

const MetaV1Schema = z
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
  .strict();

const PlayerSchema = z
  .object({
    mode: GameModeSchema,
    actorId: z.string().nullable(),
  })
  .strict();

/**
 * Format de sauvegarde n° 1 (phase 1) : figé, ne jamais modifier. Sert à relire et migrer
 * les parties et sauvegardes créées avant la phase 2.
 */
export const GameStateV1Schema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(1) }).strict(),
    rng: RngStateSchema,
    player: PlayerSchema,
  })
  .strict();
export type GameStateV1 = z.infer<typeof GameStateV1Schema>;

const Id = z.string().min(1).max(120);

/** Acteur de campagne. Phase 2 : uniquement la campagne du joueur ; adversaires en phase 3. */
export const ActorSchema = z
  .object({
    id: Id,
    kind: z.literal('joueur'),
    label: z.string().min(1),
    resources: ResourcesSchema,
  })
  .strict();
export type Actor = z.infer<typeof ActorSchema>;

/** Effet programmé, appliqué à l'entrée de la semaine `dueWeek` (§8 : effets différés). */
export const ScheduledEffectSchema = z
  .object({
    id: Id,
    dueWeek: z.number().int().min(0),
    actorId: Id,
    ressource: ResourceKeySchema,
    base: z.number().int(),
    alea: z.number().int(),
    saturation: z.boolean(),
    origin: z
      .object({
        kind: z.enum(['action', 'risque', 'evenement', 'decision']),
        ref: Id,
        label: z.string().min(1),
        week: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
export type ScheduledEffect = z.infer<typeof ScheduledEffectSchema>;

/** Décision obligatoire née d'un événement : à trancher avant la semaine suivante (§2). */
export const PendingDecisionSchema = z
  .object({
    id: Id,
    eventId: Id,
    actorId: Id,
    createdWeek: z.number().int().min(0),
    label: z.string().min(1),
    description: z.string().min(1),
    options: z
      .array(
        z.object({ id: Id, libelle: z.string().min(1), description: z.string().min(1) }).strict(),
      )
      .min(1),
    defaultOptionId: Id,
  })
  .strict();
export type PendingDecision = z.infer<typeof PendingDecisionSchema>;

/**
 * État complet d'une partie, format de sauvegarde n° 2 (phase 2). Toute évolution
 * s'accompagne d'un nouveau numéro de format et d'une migration (packages/save-engine).
 * L'aléa ne figure pas dans l'état : chaque tirage est dérivé de la graine, de la semaine
 * et de son contexte (module, action, événement).
 */
export const GameStateSchema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(2) }).strict(),
    player: PlayerSchema,
    actors: z.record(Id, ActorSchema),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionSchema),
    eventHistory: z.record(
      Id,
      z.object({ count: z.number().int().min(1), lastWeek: z.number().int().min(0) }).strict(),
    ),
    calendar: z.object({ blockedBy: Id.nullable() }).strict(),
  })
  .strict();
export type GameState = z.infer<typeof GameStateSchema>;

/** Action programmée par le joueur pour la semaine en cours. */
export const PlannedActionSchema = z.object({ actionId: Id }).strict();
export type PlannedAction = z.infer<typeof PlannedActionSchema>;

export const DecisionAnswerSchema = z.object({ decisionId: Id, optionId: Id }).strict();
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;
