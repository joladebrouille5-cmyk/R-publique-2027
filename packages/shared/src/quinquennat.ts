import { z } from 'zod';
import { isValidIsoDate } from './dates';
import { ConsequenceSummarySchema } from './consequences';
import { EconomicIndicatorSchema } from './economie';
import { LEGISLATIVE_MOTIVES } from './legislatives-etat';
import { PositionSchema } from './politics';

// Présidence et quinquennat (phase 6) : cycle électoral en cours, mandat du président,
// gouvernement (Premier ministre et ministres, personnalités de la partie ou profils fictifs)
// et feuille de route. Tout ce que font les personnalités réelles nommées à un poste est
// simulé ; aucun propos ne leur est attribué.

const Id = z.string().min(1).max(120);
// Défini ici (et non importé de game.ts, qui importe ce module) pour éviter un cycle.
const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'Date attendue au format AAAA-MM-JJ' });

/**
 * Cycle électoral : présidentielle de l'année `annee`. Les dates de campagne du jeu de règles
 * (celles de 2027) s'appliquent décalées de `decalageSemaines` semaines entières, ce qui
 * conserve les jours de la semaine.
 */
export const CycleSchema = z
  .object({
    annee: z.number().int().min(2027),
    decalageSemaines: z.number().int().min(0),
  })
  .strict();
export type Cycle = z.infer<typeof CycleSchema>;

/**
 * Membre du gouvernement : acteur de la partie (personnalité réelle, adversaire fictif ou
 * candidat personnalisé), figure réelle nominable du jeu de règles (phase 11) ou profil fictif.
 */
export const MEMBER_NATURES = ['acteur', 'figure', 'profil'] as const;
export const MemberRefSchema = z.object({ nature: z.enum(MEMBER_NATURES), ref: Id }).strict();
export type MemberRef = z.infer<typeof MemberRefSchema>;

export const MinisterSchema = MemberRefSchema.extend({ posteId: Id }).strict();
export type Minister = z.infer<typeof MinisterSchema>;

export const GovernmentSchema = z
  .object({
    /** Numéro du gouvernement dans le quinquennat (1, 2…). */
    numero: z.number().int().min(1),
    premierMinistre: MemberRefSchema,
    ministres: z.array(MinisterSchema),
    nommeLe: IsoDateSchema,
  })
  .strict();
export type Government = z.infer<typeof GovernmentSchema>;

/** Gouvernement terminé (démission, remaniement, fin du quinquennat). */
export const PastGovernmentSchema = z
  .object({
    numero: z.number().int().min(1),
    premierMinistre: MemberRefSchema,
    debut: IsoDateSchema,
    fin: IsoDateSchema,
    motif: z.string().min(1),
  })
  .strict();
export type PastGovernment = z.infer<typeof PastGovernmentSchema>;

export const MandateSchema = z
  .object({
    presidentId: Id,
    debut: IsoDateSchema,
    fin: IsoDateSchema,
    /** Mandats consécutifs du président (1 ou 2 : Constitution, art. 6). */
    numero: z.number().int().min(1).max(2),
  })
  .strict();
export type Mandate = z.infer<typeof MandateSchema>;

/** Refus simulé d'un acteur ou d'une figure (identifiant dans `acteurId`) sollicité pour un poste. */
export const RefusalSchema = z
  .object({ acteurId: Id, semaine: z.number().int().min(0), posteId: Id })
  .strict();
export type Refusal = z.infer<typeof RefusalSchema>;

/** Poste du Premier ministre dans les refus (les autres refus portent l'identifiant du ministère). */
export const PRIME_MINISTER_POST = 'premier-ministre';

/** Événement des décisions de nomination à un ministère régalien (phase 11). */
export const MINISTER_DECISION_EVENT = 'nomination-ministre';

/** Quinquennat aux formats 8 à 11 (figé pour les migrations). */
export const QuinquennatV8Schema = z
  .object({
    mandat: MandateSchema,
    /** null tant que le Premier ministre n'est pas nommé. */
    gouvernement: GovernmentSchema.nullable(),
    anciensGouvernements: z.array(PastGovernmentSchema),
    /** Propositions du programme à porter au Parlement, dans l'ordre choisi. */
    feuilleDeRoute: z.array(Id),
    refus: z.array(RefusalSchema),
  })
  .strict();
export type QuinquennatV8 = z.infer<typeof QuinquennatV8Schema>;

/** Relevé du quinquennat à une date : popularité du président et indicateurs économiques. */
export const QuinquennatSnapshotSchema = z
  .object({
    semaine: z.number().int().min(0),
    date: IsoDateSchema,
    /** Popularité du président (centièmes de point) ; null si elle n'a pas été enregistrée. */
    popularite: z.number().int().min(0).max(10_000).nullable(),
    /** Indicateurs économiques (centièmes) ; null sans économie simulée. */
    indicateurs: z.record(EconomicIndicatorSchema, z.number().int()).nullable(),
  })
  .strict();
export type QuinquennatSnapshot = z.infer<typeof QuinquennatSnapshotSchema>;

/** Quinquennat aux formats 12 à 16 (figé) : relevé de départ, à l'ouverture du mandat. */
export const QuinquennatV16Schema = QuinquennatV8Schema.extend({
  depart: QuinquennatSnapshotSchema,
}).strict();
export type QuinquennatV16 = z.infer<typeof QuinquennatV16Schema>;

/**
 * Quinquennat aux formats 17 et 18 (phase 13, figé) : semaine du dernier emploi de chaque action
 * du président, pour les délais entre deux emplois (discours devant le Congrès, panthéonisation…).
 */
export const QuinquennatV18Schema = QuinquennatV16Schema.extend({
  usages: z.record(Id, z.number().int().min(0)),
}).strict();
export type QuinquennatV18 = z.infer<typeof QuinquennatV18Schema>;

/**
 * Suivi d'un membre du gouvernement (format 19, phase 15) : popularité prêtée (centièmes de
 * point ; hypothèse du jeu, jamais un sondage), loyauté envers le président (0 à 100 ; hypothèse
 * du jeu) et semaine de sa nomination. Ce que fait la personnalité réelle nommée est simulé ;
 * aucun propos ne lui est attribué.
 */
export const MinisterTrackSchema = z
  .object({
    popularite: z.number().int().min(0).max(10_000),
    loyaute: z.number().int().min(0).max(100),
    depuis: z.number().int().min(0),
  })
  .strict();
export type MinisterTrack = z.infer<typeof MinisterTrackSchema>;

/**
 * Objectif du mandat (format 19, phase 15), fixé à l'ouverture du gouvernement : valeur de départ
 * et cible (unités de la mesure du jeu de règles). Paramètre de jeu, jamais une prévision.
 */
export const MandateObjectiveSchema = z
  .object({ id: Id, depart: z.number().int(), cible: z.number().int() })
  .strict();
export type MandateObjective = z.infer<typeof MandateObjectiveSchema>;

const DepartementCode = z.string().regex(/^(\d{2}|2A|2B|97\d)$/);

/**
 * Quinquennat en cours (format 19, phase 15) : en plus du format 18, suivi des membres du
 * gouvernement (par identifiant de la personnalité, du profil ou de l'acteur), objectifs du
 * mandat et déplacements du président par département (trace de la carte).
 */
export const QuinquennatV25Schema = QuinquennatV18Schema.extend({
  suivi: z.record(Id, MinisterTrackSchema),
  objectifs: z.array(MandateObjectiveSchema),
  deplacements: z.record(DepartementCode, z.number().int().min(1)),
}).strict();
export type QuinquennatV25 = z.infer<typeof QuinquennatV25Schema>;

/** Nombre de décisions gardées au journal de mandat (les plus récentes). */
export const DECISION_FOLLOW_UP_HISTORY = 60;

/**
 * Suivi d'une décision ministérielle (format 26, phase 25 ter) : une urgence tranchée par le
 * président enclenche un retour 2 à 5 semaines plus tard (échéance tirée à la décision), qui
 * applique la part différée des effets et dit si la décision a porté ses fruits. Tout est simulé ;
 * aucun propos n'est attribué au ministre ni à quiconque.
 */
export const DecisionFollowUpSchema = z
  .object({
    id: Id,
    urgenceId: Id,
    choixId: Id,
    /** Rappel de la décision en une ligne. */
    libelle: z.string().min(1),
    /** Membre du gouvernement en charge au moment de la décision (son identifiant), ou null. */
    ministre: Id.nullable(),
    /** Compétence du ministre sur le poste au moment de la décision (0 à 1). */
    competence: z.number().min(0).max(1),
    /** Part différée de la popularité du président (centièmes, signe du choix). */
    popularite: z.number().int(),
    semaine: z.number().int().min(0),
    echeance: z.number().int().min(0),
    statut: z.enum(['en-cours', 'fait']),
    bilan: z
      .object({
        favorable: z.boolean(),
        texte: z.string().min(1),
        /** Effet appliqué au suivi sur la popularité du président (centièmes). */
        popularite: z.number().int(),
        /** Effet sur la popularité prêtée du ministre (centièmes). */
        ministrePopularite: z.number().int(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type DecisionFollowUp = z.infer<typeof DecisionFollowUpSchema>;

/** Quinquennat (format 26, phase 25 ter) : le journal de mandat des décisions ministérielles. */
export const QuinquennatSchema = QuinquennatV25Schema.extend({
  suivisDecisions: z.array(DecisionFollowUpSchema).max(DECISION_FOLLOW_UP_HISTORY),
}).strict();
export type Quinquennat = z.infer<typeof QuinquennatSchema>;

const Count = z.number().int().min(0);

/**
 * Bilan d'un quinquennat (phase 6, P6-08), arrêté au début de la campagne présidentielle
 * suivante : relevés de départ et de fin, textes et réformes, gouvernements, dernières
 * législatives. Tout y est simulé (sauf les valeurs de départ sourcées de l'économie).
 */
export const QuinquennatReviewV12Schema = z
  .object({
    debut: QuinquennatSnapshotSchema,
    fin: QuinquennatSnapshotSchema,
    reformes: z
      .object({
        /** Propositions adoptées pendant le quinquennat, dans l'ordre d'adoption. */
        adoptees: z.array(Id),
        /** Réformes du quinquennat déjà en vigueur à la fin. */
        enVigueur: Count,
        rejetees: Count,
        retirees: Count,
        /** Textes en cours à la fin du quinquennat (devenus caducs, simplification du jeu). */
        caducs: Count,
        engagements49_3: Count,
        censures: Count,
      })
      .strict(),
    gouvernements: Count,
    /** Dernières législatives tenues pendant le quinquennat ; null s'il n'y en a pas eu. */
    legislatives: z
      .object({
        motif: z.enum(LEGISLATIVE_MOTIVES),
        t2: IsoDateSchema,
        cohabitation: z.boolean(),
        siegesParBloc: z.record(z.string().min(1), Count),
      })
      .strict()
      .nullable(),
  })
  .strict();

/** Bilan d'un quinquennat (formats 13 à 18, figé) : conséquences durables nées pendant le mandat. */
export const QuinquennatReviewV18Schema = QuinquennatReviewV12Schema.extend({
  consequences: z.array(ConsequenceSummarySchema),
}).strict();

/**
 * Note finale du mandat (format 19, phase 15) : objectifs atteints ou non (valeur de fin), note
 * sur 20 et mention, selon le barème du jeu de règles (hypothèses).
 */
export const MandateGradeSchema = z
  .object({
    valeur: z.number().int().min(0).max(20),
    mention: z.string().min(1),
    objectifs: z.array(
      z
        .object({
          id: Id,
          depart: z.number().int(),
          cible: z.number().int(),
          fin: z.number().int(),
          atteint: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type MandateGrade = z.infer<typeof MandateGradeSchema>;

/** Bilan d'un quinquennat (format 19) : en plus, la note finale du mandat (null sans objectifs). */
export const QuinquennatReviewSchema = QuinquennatReviewV18Schema.extend({
  note: MandateGradeSchema.nullable(),
}).strict();
export type QuinquennatReview = z.infer<typeof QuinquennatReviewSchema>;

/** Quinquennat achevé aux formats 8 à 11 (figé pour les migrations). */
export const QuinquennatSummaryV8Schema = z
  .object({
    mandat: MandateSchema,
    gouvernements: z.array(PastGovernmentSchema),
  })
  .strict();

/** Quinquennat achevé au format 12 (figé pour les migrations). */
export const QuinquennatSummaryV12Schema = QuinquennatSummaryV8Schema.extend({
  bilan: QuinquennatReviewV12Schema,
}).strict();

/** Quinquennat achevé aux formats 13 à 18 (figé pour les migrations). */
export const QuinquennatSummaryV18Schema = QuinquennatSummaryV8Schema.extend({
  bilan: QuinquennatReviewV18Schema,
}).strict();
export type QuinquennatSummaryV18 = z.infer<typeof QuinquennatSummaryV18Schema>;

/** Quinquennat achevé (archivé au début de la campagne présidentielle suivante), avec son bilan. */
export const QuinquennatSummarySchema = QuinquennatSummaryV8Schema.extend({
  bilan: QuinquennatReviewSchema,
}).strict();
export type QuinquennatSummary = z.infer<typeof QuinquennatSummarySchema>;

/** Profil fictif proposé pour Matignon ou un ministère (jeu de règles). */
export const MinisterProfileSchema = z
  .object({
    id: z.string().regex(/^profil-[a-z0-9-]+$/),
    prenom: z.string().min(1),
    nom: z.string().min(1),
    /** Famille politique ou « société civile ». */
    famille: z.string().min(1),
    positionnement: PositionSchema,
    /** Compétence de gestion (0 à 1), paramètre de jeu. */
    competence: z.number().min(0).max(1),
    parcours: z.string().regex(/^Personnage fictif\./),
    nature: z.literal('fictif'),
  })
  .strict();
export type MinisterProfile = z.infer<typeof MinisterProfileSchema>;
