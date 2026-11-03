import { z } from 'zod';
import {
  AllianceSchema,
  RECEIPT_KINDS,
  RefusedDonationSchema,
  StrategyPrioritySchema,
} from './campaign';
import { EconomyChangeSchema } from './economie';
import { GamePhaseSchema, IsoDateSchema, PollSchema, RoundResultSchema } from './game';
import { DigitalPostSchema } from './numerique';
import { PrestationSchema } from './prestations';
import { MEMBER_NATURES } from './quinquennat';
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
  'durable',
  'debat',
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
    /** Passage dans les médias (phase 11) : posture, format, score et ses raisons. */
    prestation: PrestationSchema.nullable().default(null),
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
    /** Phase 20 : libellé de l'événement dont celui-ci est la suite (chaîne). */
    suiteDe: z.string().optional(),
    /** Phase 20 : rival auteur d'un coup adverse (simulé). */
    adversaire: z.string().optional(),
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

/** Variation d'une valeur suivie (popularité prêtée ou loyauté d'un ministre), avec ses facteurs. */
const TrackChangeSchema = z
  .object({
    avant: z.number().int(),
    apres: z.number().int(),
    facteurs: z.array(z.object({ label: z.string().min(1), value: z.number().int() }).strict()),
  })
  .strict()
  .refine((c) => c.facteurs.reduce((sum, f) => sum + f.value, 0) === c.apres - c.avant, {
    message: 'La variation est la somme exacte de ses facteurs',
  });

/**
 * Compte rendu du Conseil des ministres de la semaine (phase 15 ; Constitution, art. 9 : le
 * président préside le Conseil des ministres ; rythme hebdomadaire : usage). Pour chaque membre
 * du gouvernement : popularité prêtée et loyauté (hypothèses du jeu) avec leurs facteurs, faits
 * de la semaine relevés par le moteur ; départs simulés et alertes. Aucun propos n'est rapporté.
 */
export const CouncilReportSchema = z
  .object({
    ministres: z.array(
      z
        .object({
          nature: z.enum(MEMBER_NATURES),
          ref: z.string().min(1),
          /** Ministère ; null pour le Premier ministre. */
          posteId: z.string().min(1).nullable(),
          popularite: TrackChangeSchema,
          loyaute: TrackChangeSchema,
          faits: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    departs: z.array(
      z
        .object({
          nature: z.enum(MEMBER_NATURES),
          ref: z.string().min(1),
          posteId: z.string().min(1),
          motif: z.string().min(1),
        })
        .strict(),
    ),
    alertes: z.array(z.string().min(1)),
  })
  .strict();
export type CouncilReport = z.infer<typeof CouncilReportSchema>;

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
    // Ajouts de la phase 6 : variations des indicateurs économiques et leurs facteurs ;
    // tour de législatives dépouillé dans la semaine.
    economie: z.array(EconomyChangeSchema).default([]),
    legislatives: z
      .object({
        tour: z.union([z.literal(1), z.literal(2)]),
        date: IsoDateSchema,
        /** Élus à ce tour. */
        elus: z.number().int().min(0),
        /** Sièges par bloc après le second tour (null au premier tour). */
        siegesParBloc: z.record(z.string(), z.number().int().min(0)).nullable(),
      })
      .strict()
      .nullable()
      .default(null),
    // Ajout de la phase 9 : publications simulées de la semaine (réseaux et nouveaux médias).
    numerique: z.array(DigitalPostSchema).default([]),
    // Ajouts de la phase 15 : Conseil des ministres de la semaine (pendant un mandat) et succès
    // débloqués dans la semaine (identifiants du jeu de règles).
    conseil: CouncilReportSchema.nullable().default(null),
    succes: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
