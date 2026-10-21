import { z } from 'zod';
import {
  AllianceSchema,
  RECEIPT_KINDS,
  RefusedDonationSchema,
  StrategyPrioritySchema,
} from './campaign';
import { GamePhaseSchema, IsoDateSchema, PollSchema, RoundResultSchema } from './game';
import { ResourceKeySchema } from './resources';
import { DataStatusSchema } from './ruleset';

// Bilan hebdomadaire produit par le moteur (§2, étape 12). Toute variation affichée est
// décomposée en facteurs réellement utilisés par le moteur (§13) : la somme des facteurs
// d'une variation est exactement égale à `after − before`.

export const FACTOR_SOURCES = [
  'action',
  'risque',
  'evenement',
  'decision',
  'differe',
  'opinion',
  'calendrier',
  'limite',
] as const;
export const FactorSourceSchema = z.enum(FACTOR_SOURCES);
export type FactorSource = z.infer<typeof FactorSourceSchema>;

export const FactorSchema = z
  .object({
    label: z.string().min(1),
    value: z.number().int(),
    source: FactorSourceSchema,
    step: z.number().int().min(1).max(12),
  })
  .strict();
export type Factor = z.infer<typeof FactorSchema>;

export const ResourceChangeSchema = z
  .object({
    actorId: z.string(),
    ressource: ResourceKeySchema,
    before: z.number().int(),
    after: z.number().int(),
    factors: z.array(FactorSchema).min(1),
  })
  .strict();
export type ResourceChange = z.infer<typeof ResourceChangeSchema>;

export const ActionOutcomeSchema = z
  .object({
    /** Acteur qui a programmé l'action (joueur ou adversaire IA). Absent des bilans de phase 2. */
    actorId: z.string().default('joueur'),
    index: z.number().int().min(0),
    actionId: z.string(),
    label: z.string(),
    status: z.enum(['validee', 'rejetee']),
    reason: z.string().nullable(),
    /** Cible choisie (département, organe de presse), avec son libellé. Phase 5. */
    cible: z.string().nullable().default(null),
    cost: z.object({ budgetCentimes: z.number().int(), tempsHeures: z.number().int() }).strict(),
  })
  .strict();
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

export const ReportEventSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['evenement', 'risque']),
    refId: z.string(),
    label: z.string(),
    description: z.string(),
    /** Événement inventé (`fictif`) ou aléa simulé d'une action (`simule`). */
    nature: z.enum(['fictif', 'simule']),
    majeur: z.boolean(),
    decisionId: z.string().nullable(),
  })
  .strict();
export type ReportEvent = z.infer<typeof ReportEventSchema>;

export const AppliedDecisionSchema = z
  .object({
    decisionId: z.string(),
    eventId: z.string(),
    optionId: z.string(),
    label: z.string(),
    automatic: z.boolean(),
  })
  .strict();

export const NoticeSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['scrutin', 'echeance']),
    label: z.string(),
    date: IsoDateSchema,
    statut: DataStatusSchema,
    /** 0 : dans la semaine qui commence ; n : dans n semaines. */
    inWeeks: z.number().int().min(0),
  })
  .strict();
export type Notice = z.infer<typeof NoticeSchema>;

export const StepSummarySchema = z
  .object({
    step: z.number().int().min(1).max(12),
    module: z.string(),
    label: z.string(),
    active: z.boolean(),
    summary: z.string(),
  })
  .strict();
export type StepSummary = z.infer<typeof StepSummarySchema>;

/** Changements de programme d'un candidat dans la semaine. */
export const ProgrammeReportSchema = z
  .object({
    actorId: z.string(),
    ajoutees: z.array(z.string()),
    retirees: z.array(z.string()),
    refusees: z.array(z.object({ id: z.string(), motif: z.string() }).strict()),
  })
  .strict();
export type ProgrammeReport = z.infer<typeof ProgrammeReportSchema>;

/** Variation des parrainages d'un candidat, avec ses facteurs (effectifs entiers). */
export const ParrainageChangeSchema = z
  .object({
    actorId: z.string(),
    promesses: z.number().int(),
    intentions: z.number().int(),
    recues: z.number().int(),
    validees: z.number().int(),
    invalides: z.number().int(),
    facteurs: z.array(z.object({ label: z.string(), value: z.number().int() }).strict()),
  })
  .strict();
export type ParrainageChange = z.infer<typeof ParrainageChangeSchema>;

/** Mouvements du compte de campagne d'un candidat dans la semaine. */
export const FinanceChangeSchema = z
  .object({
    actorId: z.string(),
    depenses: z.number().int().min(0),
    recettes: z.partialRecord(z.enum(RECEIPT_KINDS), z.number().int()),
    donateurs: z.number().int().min(0),
    refus: z.array(RefusedDonationSchema),
    notes: z.array(z.string()),
  })
  .strict();
export type FinanceChange = z.infer<typeof FinanceChangeSchema>;

export const RelationNoteSchema = z
  .object({ a: z.string(), b: z.string(), libelle: z.string() })
  .strict();
export type RelationNote = z.infer<typeof RelationNoteSchema>;

export const StrategyNoteSchema = z
  .object({ actorId: z.string(), priorite: StrategyPrioritySchema, motif: z.string() })
  .strict();
export type StrategyNote = z.infer<typeof StrategyNoteSchema>;

export const WeeklyReportSchema = z
  .object({
    /** Semaine résolue et son lundi. */
    week: z.number().int().min(0),
    date: IsoDateSchema,
    nextWeek: z.number().int().min(1),
    nextDate: IsoDateSchema,
    steps: z.array(StepSummarySchema),
    actions: z.array(ActionOutcomeSchema),
    changes: z.array(ResourceChangeSchema),
    events: z.array(ReportEventSchema),
    decisions: z.array(AppliedDecisionSchema),
    notices: z.array(NoticeSchema),
    blocked: z.object({ scrutinId: z.string(), message: z.string() }).strict().nullable(),
    // Ajouts de la phase 3 (valeurs par défaut pour relire les bilans de la phase 2).
    intentions: z
      .object({
        round: z.union([z.literal(1), z.literal(2)]),
        participation: z.number().int(),
        values: z.record(z.string(), z.number().int()),
      })
      .strict()
      .nullable()
      .default(null),
    polls: z.array(PollSchema).default([]),
    election: RoundResultSchema.nullable().default(null),
    phaseChange: z
      .object({ from: GamePhaseSchema, to: GamePhaseSchema })
      .strict()
      .nullable()
      .default(null),
    // Ajouts de la phase 5 (valeurs par défaut pour relire les bilans antérieurs).
    programme: z.array(ProgrammeReportSchema).default([]),
    parrainages: z.array(ParrainageChangeSchema).default([]),
    finances: z.array(FinanceChangeSchema).default([]),
    relations: z.array(RelationNoteSchema).default([]),
    alliances: z.array(AllianceSchema).default([]),
    strategies: z.array(StrategyNoteSchema).default([]),
  })
  .strict();
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
