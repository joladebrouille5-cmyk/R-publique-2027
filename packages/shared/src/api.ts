import { z } from 'zod';
import {
  AlliancePlanSchema,
  DecisionAnswerSchema,
  DifficultySchema,
  GameModeSchema,
  GamePhaseSchema,
  GameStateSchema,
  IsoDateSchema,
  OpponentSetSchema,
  PlannedActionSchema,
  ProgrammeChangeSchema,
  SeedSchema,
} from './game';
import { PersonalityIdSchema, PositionSchema } from './politics';
import { WeeklyReportSchema } from './report';

// Contrats de l'API REST, partagés entre `apps/api` et `apps/web`.

export const MAX_SAVE_SLOTS = 5;

/** Candidat créé par le joueur (§1.2) ; les ressources de départ dépendent du profil choisi. */
export const CandidateInputSchema = z
  .object({
    prenom: z.string().trim().max(40).default(''),
    nom: z.string().trim().min(1).max(60),
    parti: z.string().trim().min(1).max(80),
    positionnement: PositionSchema,
    parcours: z.string().trim().max(500).default(''),
    profilId: z.string().min(1).max(60).nullable().default(null),
  })
  .strict();
export type CandidateInput = z.input<typeof CandidateInputSchema>;

export const CreateGameRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    mode: GameModeSchema,
    difficulty: DifficultySchema.default('standard'),
    seed: SeedSchema.optional(),
    startDate: IsoDateSchema.optional(),
    candidate: CandidateInputSchema.optional(),
    /** Personnalité réelle incarnée (mode « candidat réel », phase 5 bis). */
    personnaliteId: PersonalityIdSchema.optional(),
    /** Adversaires fictifs (par défaut) ou personnalités réelles. */
    adversaires: OpponentSetSchema.default('fictifs'),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.mode === 'candidat_personnalise' && !body.candidate) {
      ctx.addIssue({
        code: 'custom',
        path: ['candidate'],
        message: 'Candidat requis dans ce mode',
      });
    }
    if (body.mode !== 'candidat_personnalise' && body.candidate) {
      ctx.addIssue({
        code: 'custom',
        path: ['candidate'],
        message: 'Candidat personnalisé seulement dans ce mode',
      });
    }
    if ((body.mode === 'candidat_reel') !== (body.personnaliteId !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['personnaliteId'],
        message: 'Personnalité requise dans le mode « candidat réel », et seulement dans ce mode',
      });
    }
  });
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

/** Fichier d'export d'une partie (JSON versionné, §12). L'état est validé selon sa version. */
export const EXPORT_FORMAT = 'republique-2027/partie';
export const ExportDocumentSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    formatVersion: z.literal(1),
    exportedAt: z.string(),
    name: z.string().trim().min(1).max(80),
    mode: GameModeSchema,
    difficulty: DifficultySchema,
    seed: SeedSchema,
    engineVersion: z.string().min(1),
    rulesetVersion: z.string().min(1),
    saveSchemaVersion: z.number().int().positive(),
    stateHash: z.string().regex(/^[0-9a-f]{64}$/),
    state: z.unknown(),
  })
  .strict();
export type ExportDocument = z.infer<typeof ExportDocumentSchema>;

/** En-tête obligatoire de `POST /advance` : un même envoi répété n'avance qu'une fois. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, {
  message: 'En-tête Idempotency-Key requis (8 à 100 caractères : lettres, chiffres, « _ », « - »)',
});

export const AdvanceRequestSchema = z
  .object({
    /** Semaine vue par le client : refus (409) si la partie a déjà avancé. */
    expectedWeek: z.number().int().min(0),
    actions: z.array(PlannedActionSchema).max(20).default([]),
    decisions: z.array(DecisionAnswerSchema).max(20).default([]),
    programme: ProgrammeChangeSchema.default({ ajouter: [], retirer: [] }),
    alliances: AlliancePlanSchema.default({ proposer: [] }),
  })
  .strict();
export type AdvanceRequest = z.input<typeof AdvanceRequestSchema>;

export const AdvanceResponseSchema = z.object({
  game: GameDetailSchema,
  report: WeeklyReportSchema,
});
export type AdvanceResponse = z.infer<typeof AdvanceResponseSchema>;

export const JournalEntrySchema = z.object({
  id: z.string(),
  week: z.number().int(),
  type: z.string(),
  nature: z.string(),
  createdAt: z.string(),
  /** Bilan complet pour une semaine résolue ; null pour les autres entrées. */
  report: WeeklyReportSchema.nullable(),
  details: z.record(z.string(), z.unknown()),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const JournalPageSchema = z.object({
  entries: z.array(JournalEntrySchema),
  /** Curseur pour la page suivante (entrées plus anciennes), ou null. */
  nextBefore: z.string().nullable(),
});
export type JournalPage = z.infer<typeof JournalPageSchema>;
