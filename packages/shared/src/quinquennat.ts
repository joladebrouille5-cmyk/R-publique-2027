import { z } from 'zod';
import { isValidIsoDate } from './dates';
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

export const QuinquennatSchema = z
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
export type Quinquennat = z.infer<typeof QuinquennatSchema>;

/** Quinquennat achevé (archivé au début de la campagne présidentielle suivante). */
export const QuinquennatSummarySchema = z
  .object({
    mandat: MandateSchema,
    gouvernements: z.array(PastGovernmentSchema),
  })
  .strict();
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
