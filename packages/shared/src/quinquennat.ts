import { z } from 'zod';
import { isValidIsoDate } from './dates';
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
 * candidat personnalisé) ou profil fictif du jeu de règles.
 */
export const MemberRefSchema = z.object({ nature: z.enum(['acteur', 'profil']), ref: Id }).strict();
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

/** Refus simulé d'un acteur sollicité pour un poste. */
export const RefusalSchema = z
  .object({ acteurId: Id, semaine: z.number().int().min(0), posteId: Id })
  .strict();
export type Refusal = z.infer<typeof RefusalSchema>;

/** Poste du Premier ministre dans les refus (les ministres ne sont sollicités que s'ils acceptent). */
export const PRIME_MINISTER_POST = 'premier-ministre';

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

/** Quinquennat en cours (format 12) : relevé de départ, à l'ouverture du mandat. */
export const QuinquennatSchema = QuinquennatV8Schema.extend({
  depart: QuinquennatSnapshotSchema,
}).strict();
export type Quinquennat = z.infer<typeof QuinquennatSchema>;

const Count = z.number().int().min(0);

/**
 * Bilan d'un quinquennat (phase 6, P6-08), arrêté au début de la campagne présidentielle
 * suivante : relevés de départ et de fin, textes et réformes, gouvernements, dernières
 * législatives. Tout y est simulé (sauf les valeurs de départ sourcées de l'économie).
 */
export const QuinquennatReviewSchema = z
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
export type QuinquennatReview = z.infer<typeof QuinquennatReviewSchema>;

/** Quinquennat achevé aux formats 8 à 11 (figé pour les migrations). */
export const QuinquennatSummaryV8Schema = z
  .object({
    mandat: MandateSchema,
    gouvernements: z.array(PastGovernmentSchema),
  })
  .strict();

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
