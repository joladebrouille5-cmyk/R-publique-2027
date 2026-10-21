import { z } from 'zod';

// État de campagne de la phase 5 (§6, §7, §8) : programme, parrainages, compte de campagne,
// couverture médiatique, relations et alliances, stratégie des adversaires.
// Tous les montants sont en centimes d'euro et tous les effectifs en entiers.

const Id = z.string().min(1).max(120);
const Count = z.number().int().min(0);
const Centimes = z.number().int().min(0);
const Week = z.number().int().min(0);
/** Code de département ou de collectivité (toujours une chaîne : « 01 », « 2A », « 974 »). */
export const DepartementCodeSchema = z.string().regex(/^(\d{2}|2A|2B|9[78]\d)$/);
const PerDepartement = z.record(DepartementCodeSchema, Count);

/** Programme d'un candidat : propositions retenues (dans l'ordre d'annonce) et revirements. */
export const ProgrammeStateSchema = z
  .object({
    propositions: z.array(Id),
    /** Propositions retirées après leur annonce : chacune coûte de la crédibilité. */
    revirements: Count,
  })
  .strict();
export type ProgrammeState = z.infer<typeof ProgrammeStateSchema>;

export const INVALIDITY_REASONS = ['formulaire_irregulier'] as const;

/**
 * Parrainages (présentations) d'un candidat, par département : promesses d'élus, intentions
 * confirmées, présentations reçues par le Conseil constitutionnel, présentations validées.
 * Une présentation reçue est validée ou invalidée ; les invalidées ne comptent jamais.
 */
export const ParrainagesStateSchema = z
  .object({
    promesses: PerDepartement,
    intentions: PerDepartement,
    recues: PerDepartement,
    validees: PerDepartement,
    invalides: z.partialRecord(z.enum(INVALIDITY_REASONS), Count),
  })
  .strict();
export type ParrainagesState = z.infer<typeof ParrainagesStateSchema>;

export const REFUSAL_ORIGINS = ['personne_morale', 'depassement', 'especes'] as const;
export type RefusalOrigin = (typeof REFUSAL_ORIGINS)[number];

export const RefusedDonationSchema = z
  .object({
    semaine: Week,
    origine: z.enum(REFUSAL_ORIGINS),
    montantCentimes: Centimes,
    motif: z.string().min(1),
  })
  .strict();
export type RefusedDonation = z.infer<typeof RefusedDonationSchema>;

export const RECEIPT_KINDS = [
  'parti',
  'apportPersonnel',
  'dons',
  'emprunts',
  'avance',
  'autres',
] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

/**
 * Compte de campagne (§6) : recettes par origine et dépenses électorales. Pour une campagne
 * suivie depuis sa création, la trésorerie vaut exactement recettes − dépenses.
 */
export const FinancesStateSchema = z
  .object({
    recettes: z
      .object({
        parti: Centimes,
        apportPersonnel: Centimes,
        dons: Centimes,
        emprunts: Centimes,
        avance: Centimes,
        autres: Centimes,
      })
      .strict(),
    depenses: Centimes,
    donateurs: Count,
    refus: z
      .object({
        nombre: Count,
        montantCentimes: Centimes,
        /** Derniers refus, du plus ancien au plus récent (12 au plus). */
        derniers: z.array(RefusedDonationSchema).max(12),
      })
      .strict(),
    emprunts: z
      .array(
        z
          .object({
            semaine: Week,
            montantCentimes: Centimes,
            tauxAnnuel: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(40),
    /** Dépassement du plafond légal constaté (semaine et montant), sinon null. */
    depassement: z.object({ semaine: Week, montantCentimes: Centimes }).strict().nullable(),
    /** Remboursement forfaitaire attendu après le scrutin, sous réserve d'approbation du compte. */
    remboursementPrevisionnel: Centimes.nullable(),
  })
  .strict();
export type FinancesState = z.infer<typeof FinancesStateSchema>;

export const STRATEGY_PRIORITIES = [
  'parrainages',
  'financement',
  'notoriete',
  'popularite',
  'mobilisation',
  'debat',
] as const;
export const StrategyPrioritySchema = z.enum(STRATEGY_PRIORITIES);
export type StrategyPriority = z.infer<typeof StrategyPrioritySchema>;

export const AI_OBJECTIVES = ['victoire', 'qualification', 'visibilite'] as const;
export const AiObjectiveSchema = z.enum(AI_OBJECTIVES);
export type AiObjective = z.infer<typeof AiObjectiveSchema>;

/** Stratégie courante d'un adversaire (§7) : priorité de la semaine et motif lisible. */
export const StrategySchema = z
  .object({ priorite: StrategyPrioritySchema, motif: z.string().min(1), semaine: Week })
  .strict();
export type Strategy = z.infer<typeof StrategySchema>;

/** Couverture d'un candidat par un organe : exposition (0 à 10 000) et tonalité (−100 à +100). */
export const CoverageSchema = z
  .object({
    exposition: z.number().int().min(0).max(10_000),
    tonalite: z.number().int().min(-100).max(100),
  })
  .strict();
export type Coverage = z.infer<typeof CoverageSchema>;

/** Couverture médiatique au format 6 (organes fictifs), figée pour les migrations. */
export const MediaStateV6Schema = z
  .object({
    semaine: Week,
    couverture: z.record(Id, z.record(Id, CoverageSchema)),
    /** Indice médiatique de chaque candidat (−1 à +1), utilisé par le score latent. */
    indice: z.record(Id, z.number().min(-1).max(1)),
  })
  .strict();

/** Passage d'un candidat dans une émission politique réelle (interview simulée). */
export const InterviewSchema = z.object({ emissionId: Id, acteurId: Id }).strict();
export type Interview = z.infer<typeof InterviewSchema>;

/**
 * Couverture médiatique de la semaine passée (§8), par organe réel puis par candidat, et
 * interviews simulées tenues dans les émissions politiques.
 */
export const MediaStateSchema = MediaStateV6Schema.extend({
  interviews: z.array(InterviewSchema),
}).strict();
export type MediaState = z.infer<typeof MediaStateSchema>;

/** Relation entre deux candidats (§7) : confiance, proximité, rivalité et historique. */
export const RelationSchema = z
  .object({
    a: Id,
    b: Id,
    confiance: z.number().int().min(-100).max(100),
    proximite: z.number().int().min(0).max(100),
    rivalite: z.number().int().min(0).max(100),
    historique: z.array(z.object({ semaine: Week, libelle: z.string().min(1) }).strict()).max(10),
  })
  .strict();
export type Relation = z.infer<typeof RelationSchema>;

/** Ralliement : un candidat se retire et soutient un autre candidat avant le premier tour. */
export const AllianceSchema = z
  .object({
    id: Id,
    de: Id,
    vers: Id,
    semaine: Week,
    origine: z.enum(['ia', 'joueur']),
    nature: z.literal('ralliement'),
  })
  .strict();
export type Alliance = z.infer<typeof AllianceSchema>;

/** Composantes de la prestation d'un finaliste au débat (§8), chacune entre 0 et 1. */
export const DebateDetailSchema = z
  .object({
    preparation: z.number().min(0).max(1),
    maitrise: z.number().min(0).max(1),
    coherence: z.number().min(0).max(1),
    reponse: z.number().min(0).max(1),
  })
  .strict();
export type DebateDetail = z.infer<typeof DebateDetailSchema>;

/**
 * Régime des règles de campagne d'une partie. `modelise` : règles appliquées depuis la création
 * de la partie. `non_modelise` / `partiel` : partie créée avant la phase 5 (migration) — les
 * parrainages n'écartent personne et les dépenses antérieures ne sont pas comptabilisées.
 */
export const CampaignRegimeSchema = z
  .object({
    parrainages: z.enum(['modelise', 'non_modelise']),
    finances: z.enum(['complet', 'partiel']),
  })
  .strict();
export type CampaignRegime = z.infer<typeof CampaignRegimeSchema>;

/** Clé d'une relation entre deux acteurs (ordre alphabétique des identifiants). */
export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Total des recettes d'un compte de campagne. */
export function totalReceipts(finances: Pick<FinancesState, 'recettes'>): number {
  return RECEIPT_KINDS.reduce((sum, kind) => sum + finances.recettes[kind], 0);
}

/** Somme des effectifs d'un décompte par département. */
export function sumPerDepartement(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
