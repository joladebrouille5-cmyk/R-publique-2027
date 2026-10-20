import { z } from 'zod';
import { isValidIsoDate } from './dates';
import { CampaignStyleSchema, CandidateIdentitySchema } from './politics';
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

const EventHistorySchema = z.record(
  Id,
  z.object({ count: z.number().int().min(1), lastWeek: z.number().int().min(0) }).strict(),
);

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

const DecisionOptionSchema = z
  .object({ id: Id, libelle: z.string().min(1), description: z.string().min(1) })
  .strict();

const PendingDecisionV2Schema = z
  .object({
    id: Id,
    eventId: Id,
    actorId: Id,
    createdWeek: z.number().int().min(0),
    label: z.string().min(1),
    description: z.string().min(1),
    options: z.array(DecisionOptionSchema).min(1),
    defaultOptionId: Id,
  })
  .strict();

/**
 * Format de sauvegarde n° 2 (phase 2) : figé, ne jamais modifier. Sert à relire et migrer
 * les parties créées pendant la phase 2.
 */
export const GameStateV2Schema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(2) }).strict(),
    player: PlayerSchema,
    actors: z.record(
      Id,
      z
        .object({
          id: Id,
          kind: z.literal('joueur'),
          label: z.string().min(1),
          resources: ResourcesSchema,
        })
        .strict(),
    ),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionV2Schema),
    eventHistory: EventHistorySchema,
    calendar: z.object({ blockedBy: Id.nullable() }).strict(),
  })
  .strict();
export type GameStateV2 = z.infer<typeof GameStateV2Schema>;

export const CANDIDATE_STATUSES = ['candidat', 'qualifie', 'elimine', 'elu', 'battu'] as const;
export const CandidateStatusSchema = z.enum(CANDIDATE_STATUSES);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

/** Candidat et sa campagne : le joueur ou un adversaire autonome (IA). */
export const ActorSchema = z
  .object({
    id: Id,
    kind: z.enum(['joueur', 'adversaire']),
    label: z.string().min(1),
    candidate: CandidateIdentitySchema,
    /** Style et goût du risque de l'IA ; null pour le joueur. */
    style: CampaignStyleSchema.nullable(),
    toleranceRisque: z.number().min(0).max(1).nullable(),
    resources: ResourcesSchema,
    status: CandidateStatusSchema,
    /** Popularité des dernières semaines (la plus récente en dernier), pour la dynamique. */
    history: z.object({ popularite: z.array(z.number().int()).max(8) }).strict(),
  })
  .strict();
export type Actor = z.infer<typeof ActorSchema>;

/** Décision obligatoire : réponse à un événement, ou consigne de vote entre les deux tours. */
export const PendingDecisionSchema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne']),
}).strict();
export type PendingDecision = z.infer<typeof PendingDecisionSchema>;

/** Contribution d'un facteur au score latent d'un candidat (moyenne pondérée sur l'électorat). */
export const UtilityFactorSchema = z
  .object({ label: z.string().min(1), value: z.number() })
  .strict();
export type UtilityFactor = z.infer<typeof UtilityFactorSchema>;

/** Intentions de vote « réelles » du modèle (non publiées) : les sondages en sont un échantillon. */
export const OpinionSchema = z
  .object({
    week: z.number().int().min(0),
    round: z.union([z.literal(1), z.literal(2)]),
    /** Participation attendue, en centièmes de point de pourcentage des inscrits. */
    participation: z.number().int().min(0).max(10_000),
    /** Intentions, en centièmes de point de pourcentage des suffrages exprimés. */
    intentions: z.record(Id, z.number().int().min(0).max(10_000)),
    breakdown: z.record(Id, z.array(UtilityFactorSchema)),
  })
  .strict();
export type Opinion = z.infer<typeof OpinionSchema>;

export const POLL_KINDS = ['intentions_t1', 'intentions_t2', 'popularite'] as const;

/** Sondage simulé (§5.2) : terrain, publication, échantillon, méthode, marge, limites. */
export const PollSchema = z
  .object({
    id: Id,
    kind: z.enum(POLL_KINDS),
    instituteId: Id,
    institute: z.string().min(1),
    week: z.number().int().min(0),
    fieldStart: IsoDateSchema,
    fieldEnd: IsoDateSchema,
    publishedAt: IsoDateSchema,
    sampleSize: z.number().int().positive(),
    method: z.string().min(1),
    results: z
      .array(
        z
          .object({
            actorId: Id,
            value: z.number().int().min(0).max(10_000),
            margin: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1),
    limits: z.string().min(1),
    nature: z.literal('sondage'),
  })
  .strict();
export type Poll = z.infer<typeof PollSchema>;

const VoteCountsSchema = {
  inscrits: z.number().int().min(0),
  votants: z.number().int().min(0),
  blancs: z.number().int().min(0),
  nuls: z.number().int().min(0),
  exprimes: z.number().int().min(0),
  voix: z.record(Id, z.number().int().min(0)),
};

/** Résultat simulé d'un tour : national et par groupe d'électeurs (format 3, sans territoires). */
const RoundResultV3Schema = z
  .object({
    scrutinId: Id,
    round: z.union([z.literal(1), z.literal(2)]),
    date: IsoDateSchema,
    ...VoteCountsSchema,
    abstentions: z.number().int().min(0),
    groups: z.array(z.object({ groupId: Id, ...VoteCountsSchema }).strict()).min(1),
    qualified: z.array(Id),
    winner: Id.nullable(),
    nature: z.literal('simule'),
  })
  .strict();

export const CountsSchema = z.object(VoteCountsSchema).strict();
export type Counts = z.infer<typeof CountsSchema>;

/** Comportement d'un groupe d'électeurs le jour du scrutin (permet de recalculer chaque commune). */
export const GroupBehaviorSchema = z
  .object({
    groupId: Id,
    turnout: z.number().min(0).max(1),
    blancs: z.number().min(0).max(1),
    nuls: z.number().min(0).max(1),
    /** Probabilités de vote, dans l'ordre de `candidats`. */
    probabilities: z.array(z.number().min(0).max(1)),
  })
  .strict();
export type GroupBehavior = z.infer<typeof GroupBehaviorSchema>;

/**
 * Détail territorial d'un tour (phase 4) : agrégats exacts par département, région et territoire
 * hors carte, et comportement des groupes. Les résultats communaux ne sont pas stockés : ils se
 * recalculent à l'identique avec la même base électorale (`baselineId`).
 */
export const TerritorialResultSchema = z
  .object({
    baselineId: z.string().min(1),
    nature: z.enum(['reel', 'fictif', 'national']),
    candidats: z.array(Id),
    comportement: z.array(GroupBehaviorSchema),
    departements: z.record(z.string(), CountsSchema),
    regions: z.record(z.string(), CountsSchema),
    horsCarte: z.record(z.string(), CountsSchema),
  })
  .strict();
export type TerritorialResult = z.infer<typeof TerritorialResultSchema>;

/** Résultat simulé d'un tour : national, par groupe d'électeurs et par territoire (format 4). */
export const RoundResultSchema = RoundResultV3Schema.extend({
  territoire: TerritorialResultSchema.nullable(),
}).strict();
export type RoundResult = z.infer<typeof RoundResultSchema>;

export const VoteInstructionSchema = z
  .object({ fromActorId: Id, toActorId: Id.nullable(), automatic: z.boolean() })
  .strict();
export type VoteInstruction = z.infer<typeof VoteInstructionSchema>;

/** État au format 3 (phase 3), figé pour les migrations. */
export const GameStateV3Schema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(3) }).strict(),
    player: PlayerSchema,
    actors: z.record(Id, ActorSchema),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionSchema),
    eventHistory: EventHistorySchema,
    opinion: OpinionSchema.nullable(),
    polls: z.array(PollSchema),
    elections: z
      .object({
        t1: RoundResultV3Schema.nullable(),
        t2: RoundResultV3Schema.nullable(),
        consignes: z.array(VoteInstructionSchema),
        /** Prestation de chaque finaliste au débat d'entre-deux-tours (−1 à +1), une fois tenu. */
        debate: z.record(Id, z.number().min(-1).max(1)).nullable(),
      })
      .strict(),
    calendar: z
      .object({ blockedBy: Id.nullable(), blockedMessage: z.string().nullable() })
      .strict(),
  })
  .strict();
export type GameStateV3 = z.infer<typeof GameStateV3Schema>;

/**
 * État complet d'une partie, format de sauvegarde n° 4 (phase 4). Toute évolution
 * s'accompagne d'un nouveau numéro de format et d'une migration (packages/save-engine).
 * L'aléa ne figure pas dans l'état : chaque tirage est dérivé de la graine, de la semaine
 * et de son contexte (module, action, événement, groupe d'électeurs…).
 */
export const GameStateSchema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(4) }).strict(),
    player: PlayerSchema,
    actors: z.record(Id, ActorSchema),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionSchema),
    eventHistory: EventHistorySchema,
    opinion: OpinionSchema.nullable(),
    polls: z.array(PollSchema),
    elections: z
      .object({
        t1: RoundResultSchema.nullable(),
        t2: RoundResultSchema.nullable(),
        consignes: z.array(VoteInstructionSchema),
        /** Prestation de chaque finaliste au débat d'entre-deux-tours (−1 à +1), une fois tenu. */
        debate: z.record(Id, z.number().min(-1).max(1)).nullable(),
      })
      .strict(),
    calendar: z
      .object({ blockedBy: Id.nullable(), blockedMessage: z.string().nullable() })
      .strict(),
  })
  .strict();
export type GameState = z.infer<typeof GameStateSchema>;

/** Action programmée par le joueur pour la semaine en cours. */
export const PlannedActionSchema = z.object({ actionId: Id }).strict();
export type PlannedAction = z.infer<typeof PlannedActionSchema>;

export const DecisionAnswerSchema = z.object({ decisionId: Id, optionId: Id }).strict();
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;
