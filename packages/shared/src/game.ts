import { z } from 'zod';
import {
  AiObjectiveSchema,
  AllianceSchema,
  CampaignRegimeSchema,
  DebateDetailSchema,
  DepartementCodeSchema,
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
  CandidateIdentityV16Schema,
  CandidateIdentityV22Schema,
  CandidateIdentityV5Schema,
} from './politics';
import { ConsequenceSchema } from './consequences';
import { EconomyStateSchema } from './economie';
import { LegislativesStateSchema, LegislativesStateV16Schema } from './legislatives-etat';
import { ParliamentSchema, ParliamentV16Schema, ParliamentV18Schema } from './parlement';
import { NegotiationSchema } from './precampagne';
import {
  CycleSchema,
  QuinquennatSchema,
  QuinquennatSummarySchema,
  QuinquennatSummaryV18Schema,
  QuinquennatV16Schema,
  QuinquennatV18Schema,
  QuinquennatSummaryV12Schema,
  QuinquennatSummaryV8Schema,
  QuinquennatV8Schema,
} from './quinquennat';
import { AchievementSchema } from './succes';
import { DebatesStateSchema, type DebateSession } from './debats';
import { PostureSchema } from './prestations';
import { DigitalStateSchema, DigitalStateV14Schema } from './numerique';
import { ResourceKeySchema, ResourcesSchema, ResourcesV1Schema } from './resources';

export const GAME_MODES = ['candidat_reel', 'candidat_personnalise', 'observateur'] as const;
export const GameModeSchema = z.enum(GAME_MODES);
export type GameMode = z.infer<typeof GameModeSchema>;

/** Niveaux des formats de sauvegarde 1 à 19 (figés). */
const DIFFICULTIES_V19 = ['accessible', 'standard', 'expert'] as const;
const DifficultyV19Schema = z.enum(DIFFICULTIES_V19);

/**
 * Niveaux de difficulté (phase 18), du plus facile au plus difficile, figés à la création de la
 * partie. Leurs effets (moyens du joueur, adversaires, débats) sont des paramètres du jeu de
 * règles (hypothèses) ; aucun ne touche aux règles constitutionnelles ni au décompte des voix.
 */
export const DIFFICULTIES = ['decouverte', 'accessible', 'standard', 'expert', 'legende'] as const;
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
    difficulty: DifficultyV19Schema,
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

/** Joueur (formats 6 à 18, figé) : mode, campagne incarnée et jeu d'adversaires. */
const PlayerV18Schema = PlayerV1Schema.extend({ adversaires: OpponentSetSchema }).strict();

/**
 * Joueur (format 19, phase 15) : en plus, l'orientation stratégique de son mouvement (jeu de
 * règles, `orientations`), choisie à la création ; null sans candidat ou pour une partie migrée.
 */
const PlayerSchema = PlayerV18Schema.extend({
  orientation: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable(),
}).strict();

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
        /** Libellé de la part variable (phase 11, passage noté) ; absent : « aléa ». */
        variable: z.string().min(1).max(120).optional(),
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
const ActorV6Schema = ActorV5Schema.extend({ candidate: CandidateIdentityV16Schema }).strict();
export type ActorV6 = z.infer<typeof ActorV6Schema>;

/** Candidat et sa campagne aux formats 12 et 13 (figé) : statut `ineligible` possible. */
const ActorV13Schema = ActorV6Schema.extend({ status: CandidateStatusSchema }).strict();
export type ActorV13 = z.infer<typeof ActorV13Schema>;

/** Candidat et sa campagne aux formats 14 à 16 (figé) : jauges Jeunesse et Dynamique (phase 9). */
export const ActorV16Schema = ActorV13Schema.extend({ resources: ResourcesSchema }).strict();
export type ActorV16 = z.infer<typeof ActorV16Schema>;

/**
 * Candidat et sa campagne aux formats 17 à 22 (figé) : identité avec la photo d'un candidat
 * personnalisé.
 */
export const ActorV22Schema = ActorV16Schema.extend({
  candidate: CandidateIdentityV22Schema,
}).strict();
export type ActorV22 = z.infer<typeof ActorV22Schema>;

/**
 * Candidat et sa campagne (format 23, phase 23) : identité qui peut renvoyer à une fiche de
 * figure du vivier (personnalité réelle entrée dans la course à la présidentielle suivante).
 */
export const ActorSchema = ActorV16Schema.extend({ candidate: CandidateIdentitySchema }).strict();
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
 * Décision obligatoire aux formats 10 à 16 (figée) : réponse à un événement, consigne de vote
 * entre les deux tours, choix du gouvernement (nomination du Premier ministre), conduite d'un
 * texte au Parlement ou réponse à une crise fictive (phase 6).
 */
export const PendingDecisionV16Schema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne', 'gouvernement', 'texte', 'crise']),
}).strict();

/**
 * Décision obligatoire aux formats 17 et 18 (figée) : en plus, stratégie d'alliance pour les
 * législatives et coalition de gouvernement après des législatives sans majorité (phase 13).
 */
export const PendingDecisionV18Schema = PendingDecisionV2Schema.extend({
  kind: z.enum(['evenement', 'consigne', 'gouvernement', 'texte', 'crise', 'alliance']),
}).strict();

/**
 * Décision obligatoire (format 19, phase 15) : en plus, rendez-vous d'élus pendant la période
 * des parrainages (`departement`), urgence ministérielle (`posteId` : ministère en charge) et
 * questions au gouvernement (`groupeId` : groupe d'opposition qui interpelle ; `themeId` :
 * thème ; `posteId` : ministère du thème, s'il y en a un). Aucun nom de député, d'élu ni de
 * propos : ces décisions décrivent des faits de jeu simulés.
 */
const DECISION_KINDS_V22 = [
  'evenement',
  'consigne',
  'gouvernement',
  'texte',
  'crise',
  'alliance',
  'parrainage',
  'urgence',
  'qag',
] as const;
/** Décision obligatoire aux formats 19 à 22 (figée pour les migrations). */
export const PendingDecisionV22Schema = PendingDecisionV2Schema.extend({
  kind: z.enum(DECISION_KINDS_V22),
  departement: z
    .string()
    .regex(/^(\d{2}|2A|2B|97\d)$/)
    .optional(),
  posteId: Id.optional(),
  groupeId: Id.optional(),
  themeId: Id.optional(),
}).strict();

/**
 * Genres de décision (format 23, phase 23) : en plus, la candidature du joueur à la
 * présidentielle suivante (`candidature`), quatre semaines avant l'ouverture de la campagne :
 * se représenter ou passer la main à un successeur de son camp.
 */
export const DECISION_KINDS = [...DECISION_KINDS_V22, 'candidature'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
/**
 * Décisions facultatives (phase 15) : sans réponse du joueur, l'option par défaut s'applique —
 * les questions au gouvernement, auxquelles le gouvernement répond sur le fond. Elles n'arrêtent
 * pas l'avance rapide. Règle commune au moteur, à l'API, au moteur local et à l'interface.
 */
export const OPTIONAL_DECISION_KINDS: readonly DecisionKind[] = ['qag'];
export const isOptionalDecision = (decision: { kind: DecisionKind }) =>
  OPTIONAL_DECISION_KINDS.includes(decision.kind);
export const PendingDecisionSchema = PendingDecisionV2Schema.extend({
  kind: z.enum(DECISION_KINDS),
  departement: z
    .string()
    .regex(/^(\d{2}|2A|2B|97\d)$/)
    .optional(),
  posteId: Id.optional(),
  groupeId: Id.optional(),
  themeId: Id.optional(),
}).strict();
export type PendingDecision = z.infer<typeof PendingDecisionSchema>;

/** Contribution d'un facteur au score latent d'un candidat (moyenne pondérée sur l'électorat). */
export const UtilityFactorSchema = z
  .object({ label: z.string().min(1), value: z.number() })
  .strict();
export type UtilityFactor = z.infer<typeof UtilityFactorSchema>;

/**
 * Intentions de vote « réelles » du modèle (non publiées) : les sondages en sont un échantillon.
 * Figé au format 24.
 */
export const OpinionV24Schema = z
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

/**
 * Intentions de vote du modèle (format 25) : en plus du format 24, le score de chaque candidat par
 * département (`departements`, centièmes de point des exprimés), projeté depuis les intentions
 * nationales et l'implantation locale ; vide tant qu'aucune base territoriale n'est chargée.
 */
export const OpinionSchema = OpinionV24Schema.extend({
  departements: z
    .record(DepartementCodeSchema, z.record(Id, z.number().int().min(0).max(10_000)))
    .default({}),
}).strict();
export type Opinion = z.infer<typeof OpinionSchema>;

export const POLL_KINDS = ['intentions_t1', 'intentions_t2', 'popularite'] as const;

/** Sondage simulé (§5.2) : terrain, publication, échantillon, méthode, marge, limites ; figé au format 15. */
export const PollV15Schema = z
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
export type PollV15 = z.infer<typeof PollV15Schema>;

/** Part d'une variation de sondage attribuée à un facteur, en centièmes de point. */
export const PollContributionSchema = z
  .object({ label: z.string().min(1).max(120), valeur: z.number().int() })
  .strict();
export type PollContribution = z.infer<typeof PollContributionSchema>;

/**
 * Sondage simulé (format 16, phase 11) : chaque résultat porte sa variation depuis la vague
 * précédente du même institut et, pour les intentions de vote, la décomposition de cette
 * variation par facteur (programme, médias, popularité…) dont la somme est la variation exacte
 * (le reste : écart d'échantillon et arrondis).
 */
export const PollSchema = PollV15Schema.extend({
  results: z
    .array(
      z
        .object({
          actorId: Id,
          value: z.number().int().min(0).max(10_000),
          margin: z.number().int().min(0),
          variation: z.number().int().nullable().default(null),
          explication: z.array(PollContributionSchema).max(12).default([]),
        })
        .strict(),
    )
    .min(1),
}).strict();
export type Poll = z.infer<typeof PollSchema>;

/**
 * Point de comparaison de chaque institut (format 16) : intentions attendues et facteurs moyens
 * de chaque candidat à sa dernière vague, pour expliquer la variation de la vague suivante.
 */
export const PollBaseSchema = z
  .object({
    semaine: z.number().int().min(0),
    tour: z.union([z.literal(1), z.literal(2)]),
    intentions: z.record(Id, z.number().int().min(0).max(10_000)),
    facteurs: z.record(Id, z.record(z.string().min(1).max(120), z.number())),
  })
  .strict();
export type PollBase = z.infer<typeof PollBaseSchema>;

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
    /**
     * Phase 25 : multiplicateurs d'implantation appliqués par département (ordre des
     * candidats) ; absents pour un tour dépouillé avant la phase 25 ou sans géographie.
     */
    implantation: z.record(z.string(), z.array(z.number().positive())).optional(),
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
    opinion: OpinionV24Schema.nullable(),
    polls: z.array(PollV15Schema),
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
    opinion: OpinionV24Schema.nullable(),
    polls: z.array(PollV15Schema),
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
    opinion: OpinionV24Schema.nullable(),
    polls: z.array(PollV15Schema),
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
  player: PlayerV18Schema,
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
  parlement: ParliamentV16Schema.nullable(),
}).strict();
export type GameStateV9 = z.infer<typeof GameStateV9Schema>;

/** État au format 10 (phase 6, P6-05 et P6-06), figé pour les migrations. */
export const GameStateV10Schema = GameStateV9Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(10) }).strict(),
  pendingDecisions: z.array(PendingDecisionV16Schema),
  /** Économie du quinquennat ; null tant qu'aucun quinquennat n'a commencé. */
  economie: EconomyStateSchema.nullable(),
}).strict();
export type GameStateV10 = z.infer<typeof GameStateV10Schema>;

/** État au format 11 (phase 6, P6-07), figé pour les migrations. */
export const GameStateV11Schema = GameStateV10Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(11) }).strict(),
  /** Législatives ; null tant qu'aucun quinquennat n'a commencé. */
  legislatives: LegislativesStateV16Schema.nullable(),
}).strict();
export type GameStateV11 = z.infer<typeof GameStateV11Schema>;

/** État au format 12 (phase 6, P6-08), figé pour les migrations. */
export const GameStateV12Schema = GameStateV11Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(12) }).strict(),
  actors: z.record(Id, ActorV13Schema),
  quinquennat: QuinquennatV16Schema.nullable(),
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
      quinquennats: z.array(QuinquennatSummaryV18Schema),
    })
    .strict(),
}).strict();
export type GameStateV13 = z.infer<typeof GameStateV13Schema>;

/** État au format 14 (phase 9) : jauges Jeunesse et Dynamique, fil des réseaux ; figé. */
export const GameStateV14Schema = GameStateV13Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(14) }).strict(),
  actors: z.record(Id, ActorV16Schema),
  /** Réseaux sociaux et nouveaux médias : publications simulées des dernières semaines. */
  numerique: DigitalStateV14Schema,
}).strict();
export type GameStateV14 = z.infer<typeof GameStateV14Schema>;

/** État au format 15 (phase 10) : débats télévisés, passages récents par format ; figé. */
export const GameStateV15Schema = GameStateV14Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(15) }).strict(),
  numerique: DigitalStateSchema,
  debats: DebatesStateSchema,
}).strict();
export type GameStateV15 = z.infer<typeof GameStateV15Schema>;

/** État au format 16 (phase 11) : sondages expliqués, dernière vague de chaque institut ; figé. */
export const GameStateV16Schema = GameStateV15Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(16) }).strict(),
  /** Sondages publiés, avec variation et explication (phase 11). */
  polls: z.array(PollSchema),
  /** Dernière vague de chaque institut, pour expliquer la suivante (phase 11). */
  sondagesBase: z.record(Id, PollBaseSchema).default({}),
}).strict();
export type GameStateV16 = z.infer<typeof GameStateV16Schema>;

/**
 * État au format 17 (phase 13) : jeu de règles 14 (actions du chef de l'État, tension
 * parlementaire, frondeurs, alliances législatives, effets des ministres) ; photo du candidat
 * personnalisé ; Parlement avec tension, fronde, motions spontanées et coalition ; votes avec
 * frondeurs et interventions de l'opposition ; campagne des législatives (accords, mobilisation)
 * et résultats avec investitures communes et désistements ; dernier emploi de chaque action du
 * président ; décisions d'alliance et de coalition ; figé.
 */
export const GameStateV17Schema = GameStateV16Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(17) }).strict(),
  actors: z.record(Id, ActorV22Schema),
  pendingDecisions: z.array(PendingDecisionV18Schema),
  parlement: ParliamentV18Schema.nullable(),
  legislatives: LegislativesStateSchema.nullable(),
  quinquennat: QuinquennatV18Schema.nullable(),
}).strict();
export type GameStateV17 = z.infer<typeof GameStateV17Schema>;

/**
 * État complet d'une partie, format de sauvegarde n° 18 (phase 14) : jeu de règles 15 (vivier
 * de 108 personnalités réelles nominables, expertise ministérielle, ministères ouverts aux
 * personnalités) ; mêmes champs que le format 17, que la migration reprend sans perte. Reprend
 * tout le format 17 : mandat vivant (tension, frondeurs, motions, coalition), législatives avec
 * accords, sondages expliqués, débats télévisés, réseaux et nouveaux médias, scénario de départ,
 * conséquences durables, cycle électoral, présidence et gouvernement, économie et crises,
 * archives des cycles précédents. Toute évolution s'accompagne d'un nouveau numéro de format et
 * d'une migration (packages/save-engine). L'aléa ne figure pas dans l'état : chaque tirage est
 * dérivé de la graine, de la semaine et de son contexte.
 */
export const GameStateV18Schema = GameStateV17Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(18) }).strict(),
}).strict();
export type GameStateV18 = z.infer<typeof GameStateV18Schema>;

/**
 * État complet d'une partie, format de sauvegarde n° 19 (phase 15) : jeu de règles 16
 * (orientations stratégiques, rendez-vous d'élus, négociations de soutien, ministres vivants,
 * remaniement ciblé, urgences ministérielles, questions au gouvernement, objectifs de mandat,
 * succès). En plus du format 18 : orientation du mouvement du joueur ; négociations de soutien
 * avec les personnalités réelles (issues simulées) ; succès débloqués ; décisions de rendez-vous
 * d'élus, d'urgence et de QAG ; Parlement avec échauffement et séances de QAG ; quinquennat avec
 * suivi des ministres (popularité prêtée, loyauté), objectifs et déplacements ; bilans avec la
 * note du mandat. Toute évolution s'accompagne d'un nouveau numéro de format et d'une migration
 * (packages/save-engine). L'aléa ne figure pas dans l'état : chaque tirage est dérivé de la
 * graine, de la semaine et de son contexte.
 */
export const GameStateV19Schema = GameStateV18Schema.extend({
  meta: MetaV1Schema.extend({ saveSchemaVersion: z.literal(19) }).strict(),
  player: PlayerSchema,
  pendingDecisions: z.array(PendingDecisionV22Schema),
  parlement: ParliamentSchema.nullable(),
  quinquennat: QuinquennatSchema.nullable(),
  historique: z
    .object({
      presidentielles: z.array(PresidentialArchiveSchema),
      quinquennats: z.array(QuinquennatSummarySchema),
    })
    .strict(),
  /** Négociations de soutien avec les personnalités réelles (phase 15), toutes campagnes. */
  negociations: z.array(NegotiationSchema),
  /** Succès débloqués (phase 15), dans l'ordre. */
  succes: z.array(AchievementSchema),
}).strict();
export type GameStateV19 = z.infer<typeof GameStateV19Schema>;

/**
 * État complet d'une partie, format de sauvegarde n° 20 (phase 18) : jeu de règles 17, cinq
 * niveaux de difficulté (Découverte et Légende en plus d'Accessible, Standard et Expert). Mêmes
 * champs que le format 19, que la migration reprend sans perte. Toute évolution s'accompagne
 * d'un nouveau numéro de format et d'une migration (packages/save-engine). L'aléa ne figure pas
 * dans l'état : chaque tirage est dérivé de la graine, de la semaine et de son contexte.
 */
export const GameStateV20Schema = GameStateV19Schema.extend({
  meta: MetaV1Schema.extend({
    difficulty: DifficultySchema,
    saveSchemaVersion: z.literal(20),
  }).strict(),
}).strict();
export type GameStateV20 = z.infer<typeof GameStateV20Schema>;

/**
 * Format de partie (phase 20), choisi à la création : complet (campagne puis quinquennat et
 * cycles suivants) ou court (la partie s'arrête au soir de l'élection présidentielle).
 */
export const GAME_FORMATS = ['complet', 'court'] as const;
export const GameFormatSchema = z.enum(GAME_FORMATS);
export type GameFormat = z.infer<typeof GameFormatSchema>;

/**
 * État au format 21 (phase 20) : en plus du format 20, le format de la partie
 * (`player.format`). Figé pour les migrations.
 */
export const GameStateV21Schema = GameStateV20Schema.extend({
  meta: MetaV1Schema.extend({
    difficulty: DifficultySchema,
    saveSchemaVersion: z.literal(21),
  }).strict(),
  player: PlayerSchema.extend({ format: GameFormatSchema }).strict(),
}).strict();
export type GameStateV21 = z.infer<typeof GameStateV21Schema>;

/**
 * Suite programmée d'un événement (phase 20, événements en chaîne) : l'événement `evenement`
 * survient à la résolution de la semaine `dueWeek` (au plus tard la suivante, si une décision
 * est déjà ouverte cette semaine-là).
 */
export const FollowUpSchema = z
  .object({
    id: Id,
    evenement: Id,
    dueWeek: z.number().int().min(0),
    /** Libellé de l'événement d'origine, tel qu'il a été annoncé au joueur. */
    origine: z.string().min(1),
  })
  .strict();
export type FollowUp = z.infer<typeof FollowUpSchema>;

/**
 * État au format 22 (phase 20) : en plus du format 21, les suites programmées des événements en
 * chaîne (`suites`). Figé pour les migrations.
 */
export const GameStateV22Schema = GameStateV21Schema.extend({
  meta: MetaV1Schema.extend({
    difficulty: DifficultySchema,
    saveSchemaVersion: z.literal(22),
  }).strict(),
  suites: z.array(FollowUpSchema),
}).strict();
export type GameStateV22 = z.infer<typeof GameStateV22Schema>;

/**
 * Annonce de candidature à la présidentielle suivante (phase 23), simulée par le jeu : un
 * candidat se représente, se retire, entre dans la course, ou succède au candidat du joueur.
 * `motif` est un fait de jeu chiffré (« score de 2027 : 3,2 % »), jamais un propos prêté.
 */
export const SUCCESSION_CHOICES = ['candidat', 'retrait', 'entree', 'successeur'] as const;
export type SuccessionChoice = (typeof SUCCESSION_CHOICES)[number];
export const SuccessionAnnouncementSchema = z
  .object({
    actorId: Id,
    choix: z.enum(SUCCESSION_CHOICES),
    motif: z.string().min(1).max(200),
  })
  .strict();
export type SuccessionAnnouncement = z.infer<typeof SuccessionAnnouncementSchema>;

/**
 * Rôle d'un candidat vis-à-vis du bilan du quinquennat écoulé (phase 23) : président sortant,
 * héritier du camp sortant (ou successeur d'un président joueur), autre membre du dernier
 * gouvernement.
 */
export const RECORD_ROLES = ['sortant', 'heritier', 'ministre'] as const;
export type RecordRole = (typeof RECORD_ROLES)[number];

/**
 * Présidentielle suivante (phase 23) : année du cycle, choix du joueur (option de sa décision
 * `candidature`, null s'il n'a pas eu à choisir), annonces de candidature faites à l'ouverture
 * de la campagne et facteur de bilan de chaque candidat concerné (utilité, arrêté une fois).
 */
export const SuccessionSchema = z
  .object({
    annee: z.number().int().min(2032),
    choixJoueur: Id.nullable(),
    annonces: z.array(SuccessionAnnouncementSchema),
    bilan: z.record(
      Id,
      z.object({ facteur: z.number().min(-1).max(1), role: z.enum(RECORD_ROLES) }).strict(),
    ),
  })
  .strict();
export type Succession = z.infer<typeof SuccessionSchema>;

/**
 * État complet d'une partie, format de sauvegarde n° 23 (phase 23) : en plus du format 22, la
 * présidentielle suivante (`succession` : choix du joueur, annonces de candidature, facteurs de
 * bilan), la fiche de figure d'un candidat réel entré dans la course (`figureId`) et la décision
 * `candidature`. Toute évolution s'accompagne d'un nouveau numéro de format et d'une migration
 * (packages/save-engine).
 */
export const GameStateV23Schema = GameStateV22Schema.extend({
  meta: MetaV1Schema.extend({
    difficulty: DifficultySchema,
    saveSchemaVersion: z.literal(23),
  }).strict(),
  actors: z.record(Id, ActorSchema),
  pendingDecisions: z.array(PendingDecisionSchema),
  succession: SuccessionSchema.nullable(),
}).strict();
export type GameStateV23 = z.infer<typeof GameStateV23Schema>;

/**
 * Point de départ d'une partie avec des personnalités réelles (phase 24) : « Sondages actuels »
 * (socle électoral calibré sur les sondages publiés) ou « Départ équitable » (tous à égalité).
 */
export const DEPARTS = ['sondages', 'equitable'] as const;
export const DepartSchema = z.enum(DEPARTS);
export type Depart = z.infer<typeof DepartSchema>;

/**
 * Socle électoral (phase 24) : décalages d'utilité calibrés à la création, par personnalité, au
 * premier et au second tour, et date des sondages dont ils viennent.
 */
export const SocleSchema = z
  .object({
    date: IsoDateSchema,
    t1: z.record(Id, z.number().min(-20).max(20)),
    t2: z.record(Id, z.number().min(-20).max(20)),
  })
  .strict();
export type Socle = z.infer<typeof SocleSchema>;

/**
 * État complet d'une partie, format de sauvegarde n° 24 (phase 24) : en plus du format 23, le
 * point de départ choisi (`player.depart`) et le socle électoral calibré (`socle`, null en départ
 * équitable). Figé au format 24.
 */
export const GameStateV24Schema = GameStateV23Schema.extend({
  meta: MetaV1Schema.extend({
    difficulty: DifficultySchema,
    saveSchemaVersion: z.literal(24),
  }).strict(),
  player: PlayerSchema.extend({ format: GameFormatSchema, depart: DepartSchema }).strict(),
  socle: SocleSchema.nullable(),
}).strict();
export type GameStateV24 = z.infer<typeof GameStateV24Schema>;

/** Implantation d'un candidat dans un département, de 0 (terre inconnue) à 100 (fief). */
export const ImplantationSchema = z.record(DepartementCodeSchema, z.number().int().min(0).max(100));

/**
 * État complet d'une partie, format de sauvegarde n° 25 (phase 25) : en plus du format 24,
 * l'implantation de chaque candidat par département (`implantation`) et le score projeté par
 * département dans les intentions (`opinion.departements`). Toute évolution s'accompagne d'un
 * nouveau numéro de format et d'une migration (packages/save-engine).
 */
export const GameStateSchema = GameStateV24Schema.extend({
  meta: MetaV1Schema.extend({
    difficulty: DifficultySchema,
    saveSchemaVersion: z.literal(25),
  }).strict(),
  opinion: OpinionSchema.nullable(),
  implantation: z.record(Id, ImplantationSchema),
}).strict();
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * Le joueur est-il sur le plateau d'un débat : invité, sans chaise vide, toujours en lice ?
 * Règle commune au moteur et à l'interface (phase 10, partagée depuis la phase 17).
 */
export function playerOnDebateStage(
  state: Pick<GameState, 'player' | 'actors'>,
  session: Pick<DebateSession, 'invites' | 'refus'>,
): boolean {
  const id = state.player.actorId;
  if (!id || !session.invites.includes(id) || session.refus.includes(id)) return false;
  const status = state.actors[id]?.status;
  return status === 'candidat' || status === 'qualifie';
}

/**
 * Débat obligatoire (phase 17) : débat télévisé de la semaine en cours qui compte le joueur sur
 * le plateau et n'est pas terminé. Tant qu'il y en a un, la semaine ne se résout pas (moteur),
 * l'avance rapide s'arrête avant (API, moteur local) et l'interface mène le joueur au plateau.
 * Le blocage se lève par un choix du joueur : débat joué jusqu'au bout, fin simulée depuis le
 * plateau, ou refus avant le premier échange (chaise vide).
 */
export function debateAwaitingPlayer(
  state: Pick<GameState, 'player' | 'actors' | 'debats' | 'meta'>,
): DebateSession | undefined {
  return state.debats.seances.find(
    (session) =>
      session.semaine === state.meta.week &&
      session.statut !== 'termine' &&
      playerOnDebateStage(state, session),
  );
}

/**
 * Action programmée pour la semaine en cours, avec sa cible si l'action en demande une
 * (département pour les élus locaux, organe de presse ou émission politique pour une interview)
 * et, pour un passage dans les médias, sa posture (phase 11 ; absente : posture par défaut).
 */
export const PlannedActionSchema = z
  .object({
    actionId: Id,
    cible: z.string().min(1).max(60).optional(),
    posture: PostureSchema.optional(),
  })
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
