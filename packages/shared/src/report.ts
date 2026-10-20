import { z } from 'zod';
import { IsoDateSchema } from './game';
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
    index: z.number().int().min(0),
    actionId: z.string(),
    label: z.string(),
    status: z.enum(['validee', 'rejetee']),
    reason: z.string().nullable(),
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
  })
  .strict();
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
