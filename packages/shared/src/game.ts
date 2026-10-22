import { z } from 'zod';
import {
  AiObjectiveSchema,
  AllianceSchema,
  CampaignRegimeSchema,
  DebateDetailSchema,
  FinancesStateSchema,
  MediaStateSchema,
  MediaStateV6Schema,
  ParrainagesStateSchema,
  ProgrammeStateSchema,
  RelationSchema,
  StrategySchema,
} from './campaign';
import { isValidIsoDate } from './dates';
import {
  CampaignStyleSchema,
  CandidateIdentitySchema,
  CandidateIdentityV5Schema,
} from './politics';
import { ConsequenceSchema } from './consequences';
import { EconomyStateSchema } from './economie';
import { LegislativesStateSchema } from './legislatives-etat';
import { ParliamentSchema } from './parlement';
import {
  CycleSchema,
  QuinquennatSchema,
  QuinquennatSummarySchema,
  QuinquennatSummaryV12Schema,
  QuinquennatSummaryV8Schema,
  QuinquennatV8Schema,
} from './quinquennat';
import { DigitalStateSchema } from './numerique';
import { ResourceKeySchema, ResourcesSchema, ResourcesV1Schema } from './resources';

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

const PlayerV1Schema = z
  .object({
    mode: GameModeSchema,
    actorId: z.string().nullable(),
  })
  .strict();

/** Adversaires d'une partie (phase 5 bis) : fictifs, ou personnalités réelles sourcées. */
export const OPPONENT_SETS = ['fictifs', 'reels'] as const;
export const OpponentSetSchema = z.enum(OPPONENT_SETS);
export type OpponentSet = z.infer<typeof OpponentSetSchema>;

/** Joueur (format 6) : mode, campagne incarnée et jeu d'adversaires. */
const PlayerSchema = PlayerV1Schema.extend({ adversaires: OpponentSetSchema }).strict();

/**
 * Format de sauvegarde n° 1 (phase 1) : figé, ne jamais modifier. Sert à relire et migrer
 * les parties et sauvegardes créées avant la phase 2.
 */
export const GameStateV1Schema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(1) }).strict(),
    rng: RngStateSchema,
    player: PlayerV1Schema,
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
    player: PlayerV1Schema,
    actors: z.record(
      Id,
      z
        .object({
          id: Id,
          kind: z.literal('joueur'),
          label: z.string().min(1),
          resources: ResourcesV1Schema,
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

/** Statuts des formats 3 et 4, figés. */
const CANDIDATE_STATUSES_V4 = ['candidat', 'qualifie', 'elimine', 'elu', 'battu'] as const;

/**
 * Statuts d'un candidat. Depuis la phase 5 : `ecarte` (présentations insuffisantes à la
 * clôture, absent du premier tour) et `retire` (ralliement à un autre candidat).
 */
const CANDIDATE_STATUSES_V5 = [...CANDIDATE_STATUSES_V4, 'ecarte', 'retire'] as const;

/**
 * Statuts d'un candidat. Depuis le format 12 (phase 6) : `ineligible` (président sortant au
 * terme de deux mandats consécutifs, Constitution, art. 6).
 */
export const CANDIDATE_STATUSES = [...CANDIDATE_STATUSES_V5, 'ineligible'] as const;
export const CandidateStatusSchema = z.enum(CANDIDATE_STATUSES);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

/** Candidat et sa campagne aux formats 3 et 4 (figé pour les migrations). */
const ActorV4Schema = z
  .object({
    id: Id,
    kind: z.enum(['joueur', 'adversaire']),
    label: z.string().min(1),
    candidate: CandidateIdentityV5Schema,
    /** Style et goût du risque de l'IA ; null pour le joueur. */
    style: CampaignStyleSchema.nullable(),
    toleranceRisque: z.number().min(0).max(1).nullable(),
    resources: ResourcesV1Schema,
    status: z.enum(CANDIDATE_STATUSES_V4),
    /** Popularité des dernières semaines (la plus récente en dernier), pour la dynamique. */
    history: z.object({ popularite: z.array(z.number().int()).max(8) }).strict(),
  })
  .strict();
export type ActorV4 = z.infer<typeof ActorV4Schema>;

/**
 * Candidat et sa campagne au format 5 (figé pour les migrations) : le joueur ou un adversaire
 * autonome (IA), avec son programme, ses parrainages, son compte de campagne et, pour l'IA,
 * sa stratégie (§6, §7).
 */
const ActorV5Schema = ActorV4Schema.extend({
  status: z.enum(CANDIDATE_STATUSES_V5),
  /** Qualité de l'équipe de campagne (0 à 1) : maîtrise des débats, conversion des parrainages. */
  equipe: z.number().min(0).max(1),
  /** Régions où le candidat compte le plus d'élus (codes INSEE). */
  implantation: z.array(z.string().regex(/^\d{2}$/)),
  /** Objectif de l'adversaire (§7) ; null pour le joueur. */
  objectif: AiObjectiveSchema.nullable(),
  programme: ProgrammeStateSchema,
  parrainages: ParrainagesStateSchema,
  finances: FinancesStateSchema,
  /** Heures consacrées à la préparation des débats. */
  preparationDebat: z.number().int().min(0),
  /** Stratégie de la semaine pour un adversaire ; null pour le joueur. */
  strategie: StrategySchema.nullable(),
}).strict();
export type ActorV5 = z.infer<typeof ActorV5Schema>;

/** Candidat et sa campagne aux formats 6 à 11 (figé) : l'identité peut être une personnalité réelle. */
const ActorV6Schema = ActorV5Schema.extend({ candidate: CandidateIdentitySchema }).strict();
export type ActorV6 = z.infer<typeof ActorV6Schema>;

/** Candidat et sa campagne aux formats 12 et 13 (figé) : statut `ineligible` possible. */
const ActorV13Schema = ActorV6Schema.extend({ status: CandidateStatusSchema }).strict();
export type ActorV13 = z.infer<typeof ActorV13Schema>;

/** Candidat et sa campagne (format 14) : jauges Jeunesse et Dynamique (phase 9). */
export const ActorSchema = ActorV13Schema.extend({ resources: ResourcesSchema }).strict();
export type Actor = z.infer<typeof ActorSchema>;

/** Décision obligatoire aux formats 3 à 7 (événement ou consigne de vote), figée. */
export const PendingDecisionV7Schema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne']),
}).strict();

/** Décision obligatoire au format 8 (événement, consigne, gouvernement), figée. */
export const PendingDecisionV8Schema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne', 'gouvernement']),
}).strict();

/** Décision obligatoire au format 9 (avec la conduite des textes), figée. */
export const PendingDecisionV9Schema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne', 'gouvernement', 'texte']),
}).strict();

/**
 * Décision obligatoire : réponse à un événement, consigne de vote entre les deux tours, choix
 * du gouvernement (nomination du Premier ministre), conduite d'un texte au Parlement ou réponse
 * à une crise fictive (phase 6).
 */
export const PendingDecisionSchema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne', 'gouvernement', 'texte', 'crise']),
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
    player: PlayerV1Schema,
    actors: z.record(Id, ActorV4Schema),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionV7Schema),
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

const ElectionsV4Schema = z
  .object({
    t1: RoundResultSchema.nullable(),
    t2: RoundResultSchema.nullable(),
    consignes: z.array(VoteInstructionSchema),
    /** Prestation de chaque finaliste au débat d'entre-deux-tours (−1 à +1), une fois tenu. */
    debate: z.record(Id, z.number().min(-1).max(1)).nullable(),
  })
  .strict();

const CalendarSchema = z
  .object({ blockedBy: Id.nullable(), blockedMessage: z.string().nullable() })
  .strict();

/** État au format 4 (phase 4), figé pour les migrations. */
export const GameStateV4Schema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(4) }).strict(),
    player: PlayerV1Schema,
    actors: z.record(Id, ActorV4Schema),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionV7Schema),
    eventHistory: EventHistorySchema,
    opinion: OpinionSchema.nullable(),
    polls: z.array(PollSchema),
    elections: ElectionsV4Schema,
    calendar: CalendarSchema,
  })
  .strict();
export type GameStateV4 = z.infer<typeof GameStateV4Schema>;

/** État au format 5 (phase 5), figé pour les migrations. */
export const GameStateV5Schema = z
  .object({
    meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(5) }).strict(),
    player: PlayerV1Schema,
    actors: z.record(Id, ActorV5Schema),
    scheduled: z.array(ScheduledEffectSchema),
    pendingDecisions: z.array(PendingDecisionV7Schema),
    eventHistory: EventHistorySchema,
    opinion: OpinionSchema.nullable(),
    polls: z.array(PollSchema),
    elections: ElectionsV4Schema.extend({
      /** Composantes de la prestation de chaque finaliste au débat (§8), une fois tenu. */
      debateDetail: z.record(Id, DebateDetailSchema).nullable(),
    }).strict(),
    calendar: CalendarSchema,
    campagne: CampaignRegimeSchema,
    medias: MediaStateV6Schema.nullable(),
    /** Relations entre candidats, par paire (clé « a|b », identifiants triés). */
    relations: z.record(z.string(), RelationSchema),
    alliances: z.array(AllianceSchema),
  })
  .strict();
export type GameStateV5 = z.infer<typeof GameStateV5Schema>;

/** État au format 6 (phase 5 bis), figé pour les migrations. */
export const GameStateV6Schema = GameStateV5Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(6) }).strict(),
  player: PlayerSchema,
  actors: z.record(Id, ActorV6Schema),
}).strict();
export type GameStateV6 = z.infer<typeof GameStateV6Schema>;

/** État au format 7 (phase 5 ter), figé pour les migrations. */
export const GameStateV7Schema = GameStateV6Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(7) }).strict(),
  medias: MediaStateSchema.nullable(),
}).strict();
export type GameStateV7 = z.infer<typeof GameStateV7Schema>;

/** Présidentielle achevée d'un cycle précédent (archivée au début du cycle suivant). */
export const PresidentialArchiveSchema = z
  .object({
    annee: z.number().int().min(2027),
    t1: RoundResultSchema,
    t2: RoundResultSchema.nullable(),
    eluId: Id,
  })
  .strict();
export type PresidentialArchive = z.infer<typeof PresidentialArchiveSchema>;

/** État au format 8 (phase 6, P6-01 à P6-03), figé pour les migrations. */
export const GameStateV8Schema = GameStateV7Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(8) }).strict(),
  pendingDecisions: z.array(PendingDecisionV8Schema),
  cycle: CycleSchema,
  /** Présidence en cours ; null pendant une campagne présidentielle. */
  quinquennat: QuinquennatV8Schema.nullable(),
  historique: z
    .object({
      presidentielles: z.array(PresidentialArchiveSchema),
      quinquennats: z.array(QuinquennatSummaryV8Schema),
    })
    .strict(),
}).strict();
export type GameStateV8 = z.infer<typeof GameStateV8Schema>;

/** État au format 9 (phase 6, P6-04), figé pour les migrations. */
export const GameStateV9Schema = GameStateV8Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(9) }).strict(),
  pendingDecisions: z.array(PendingDecisionV9Schema),
  /** Assemblée nationale et textes ; null tant qu'aucun quinquennat n'a commencé. */
  parlement: ParliamentSchema.nullable(),
}).strict();
export type GameStateV9 = z.infer<typeof GameStateV9Schema>;

/** État au format 10 (phase 6, P6-05 et P6-06), figé pour les migrations. */
export const GameStateV10Schema = GameStateV9Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(10) }).strict(),
  pendingDecisions: z.array(PendingDecisionSchema),
  /** Économie du quinquennat ; null tant qu'aucun quinquennat n'a commencé. */
  economie: EconomyStateSchema.nullable(),
}).strict();
export type GameStateV10 = z.infer<typeof GameStateV10Schema>;

/** État au format 11 (phase 6, P6-07), figé pour les migrations. */
export const GameStateV11Schema = GameStateV10Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(11) }).strict(),
  /** Législatives ; null tant qu'aucun quinquennat n'a commencé. */
  legislatives: LegislativesStateSchema.nullable(),
}).strict();
export type GameStateV11 = z.infer<typeof GameStateV11Schema>;

/** État au format 12 (phase 6, P6-08), figé pour les migrations. */
export const GameStateV12Schema = GameStateV11Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(12) }).strict(),
  actors: z.record(Id, ActorV13Schema),
  quinquennat: QuinquennatSchema.nullable(),
  historique: z
    .object({
      presidentielles: z.array(PresidentialArchiveSchema),
      quinquennats: z.array(QuinquennatSummaryV12Schema),
    })
    .strict(),
}).strict();
export type GameStateV12 = z.infer<typeof GameStateV12Schema>;

/** État au format 13 (phase 7) : scénario de départ et conséquences durables ; figé. */
export const GameStateV13Schema = GameStateV12Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(13) }).strict(),
  /** Scénario de départ (jeu de règles). */
  scenario: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  /** Conséquences durables, en cours et passées. */
  consequences: z.array(ConsequenceSchema),
  historique: z
    .object({
      presidentielles: z.array(PresidentialArchiveSchema),
      quinquennats: z.array(QuinquennatSummarySchema),
    })
    .strict(),
}).strict();
export type GameStateV13 = z.infer<typeof GameStateV13Schema>;

/**
 * État complet d'une partie, format de sauvegarde n° 14 (phase 9) : jauges Jeunesse et
 * Dynamique de chaque candidat, fil des publications simulées sur les réseaux et nouveaux
 * médias ; scénario de départ, conséquences durables (en cours et passées), cycle électoral,
 * présidence et gouvernement, Parlement, économie et crises, législatives, archives des cycles
 * précédents ; statut `ineligible` (art. 6). Toute évolution s'accompagne d'un nouveau numéro
 * de format et d'une migration (packages/save-engine). L'aléa ne figure pas dans l'état :
 * chaque tirage est dérivé de la graine, de la semaine et de son contexte (module, action,
 * événement, groupe…).
 */
export const GameStateSchema = GameStateV13Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(14) }).strict(),
  actors: z.record(Id, ActorSchema),
  /** Réseaux sociaux et nouveaux médias : publications simulées des dernières semaines. */
  numerique: DigitalStateSchema,
}).strict();
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * Action programmée pour la semaine en cours, avec sa cible si l'action en demande une
 * (département pour les élus locaux, organe de presse ou émission politique pour une interview).
 */
export const PlannedActionSchema = z
  .object({ actionId: Id, cible: z.string().min(1).max(60).optional() })
  .strict();
export type PlannedAction = z.infer<typeof PlannedActionSchema>;

export const DecisionAnswerSchema = z.object({ decisionId: Id, optionId: Id }).strict();

/** Changements de programme demandés pour la semaine (§6) : annonces et retraits. */
export const ProgrammeChangeSchema = z
  .object({
    ajouter: z.array(Id).max(20).default([]),
    retirer: z.array(Id).max(20).default([]),
  })
  .strict();
export type ProgrammeChange = z.infer<typeof ProgrammeChangeSchema>;

/** Propositions de ralliement adressées par le joueur à d'autres candidats (§7). */
export const AlliancePlanSchema = z.object({ proposer: z.array(Id).max(20).default([]) }).strict();
export type AlliancePlan = z.infer<typeof AlliancePlanSchema>;
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;
