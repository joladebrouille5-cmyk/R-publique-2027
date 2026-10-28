import { z } from 'zod';

// Parlement (phase 6, P6-04) : sièges et alignement des groupes de l'Assemblée nationale,
// textes de la feuille de route (dépôt, commission, séance, navette, lecture définitive),
// votes par groupe (simulés : aucun vote individuel n'est attribué à un député réel),
// engagement de responsabilité (art. 49 al. 3), motions de censure et réformes adoptées, dont
// les effets sont différés selon le délai de la proposition. Phase 13 : tension parlementaire,
// frondeurs (nombres), interventions de l'opposition, motions spontanées, coalition.

const Id = z.string().min(1).max(120);
const Week = z.number().int().min(0);
const Count = z.number().int().min(0);

export const BILL_STAGES = [
  'commission',
  'seance',
  'navette',
  'lecture_definitive',
  'adopte',
  'rejete',
  'retire',
] as const;
export type BillStage = (typeof BILL_STAGES)[number];

/** Position d'un groupe à l'égard du président (simulée, d'après les positions). */
export const ALIGNMENTS = ['soutien', 'independant', 'opposition'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

/** Vote d'un groupe aux formats 9 à 16 (figé). */
export const GroupVoteV16Schema = z
  .object({ pour: Count, contre: Count, abstention: Count })
  .strict();

/**
 * Vote d'un groupe (format 17, phase 13). `frondeurs` : députés d'un groupe qui soutient le
 * président votant contre le texte (comptés dans `contre`) — un nombre, jamais un nom.
 */
export const GroupVoteSchema = GroupVoteV16Schema.extend({ frondeurs: Count }).strict();
export type GroupVote = z.infer<typeof GroupVoteSchema>;

/**
 * Intervention du premier groupe d'opposition lors d'un vote clé (phase 13), simulée : elle
 * pèse sur les groupes non alignés. Elle est menée par un candidat fictif battu de la partie
 * proche du groupe (`meneur`), sinon par le groupe lui-même (null) : aucune personnalité réelle
 * ni aucun député réel n'est mis en scène, aucun propos n'est rapporté.
 */
export const OppositionInterventionSchema = z
  .object({
    groupe: Id,
    meneur: Id.nullable(),
    /** Effet sur le soutien des groupes non alignés (contre le texte, ou pour la censure). */
    effet: z.number().min(0).max(1),
  })
  .strict();
export type OppositionIntervention = z.infer<typeof OppositionInterventionSchema>;

const BillVoteShape = z
  .object({
    lecture: z.enum(['premiere', 'definitive']),
    semaine: Week,
    parGroupe: z.record(Id, GroupVoteV16Schema),
    pour: Count,
    contre: Count,
    abstention: Count,
    adopte: z.boolean(),
  })
  .strict();

/** Vote sur un texte aux formats 9 à 16 (figé). */
export const BillVoteV16Schema = BillVoteShape;

/** Vote sur un texte (format 17) : frondeurs par groupe, intervention de l'opposition. */
export const BillVoteSchema = BillVoteShape.extend({
  parGroupe: z.record(Id, GroupVoteSchema),
  intervention: OppositionInterventionSchema.nullable(),
}).strict();
export type BillVote = z.infer<typeof BillVoteSchema>;

const CensureShape = z
  .object({
    semaine: Week,
    /** Voix favorables à la motion, seules recensées (Constitution, art. 49). */
    pour: Count,
    /** Majorité des membres composant l'Assemblée. */
    majorite: Count,
    parGroupe: z.record(Id, Count),
    adoptee: z.boolean(),
  })
  .strict();

/** Motion de censure aux formats 9 à 16 (figée). */
export const CensureV16Schema = CensureShape;

/** Motion de censure (format 17) : intervention de l'opposition auprès des non-alignés. */
export const CensureSchema = CensureShape.extend({
  intervention: OppositionInterventionSchema.nullable(),
}).strict();
export type Censure = z.infer<typeof CensureSchema>;

const BillShape = z
  .object({
    id: Id,
    propositionId: Id,
    deposeSemaine: Week,
    etape: z.enum(BILL_STAGES),
    /** Semaine de la prochaine étape (texte en cours). */
    echeance: Week,
    concessions: Count,
    procedure: z.enum(['ordinaire', '49-3']),
    votes: z.array(BillVoteV16Schema),
    censure: CensureV16Schema.nullable(),
    /** Fin du parcours : semaine et motif (adoption, rejet, retrait, censure). */
    issue: z
      .object({ semaine: Week, motif: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict();

/** Texte aux formats 9 à 16 (figé). */
export const BillV16Schema = BillShape;

/** Texte (format 17) : votes et censure du format 17, négociation avec les frondeurs. */
export const BillSchema = BillShape.extend({
  votes: z.array(BillVoteSchema),
  censure: CensureSchema.nullable(),
  /** Le gouvernement a négocié avec les frondeurs de sa majorité sur ce texte. */
  frondeursNegocies: z.boolean(),
}).strict();
export type Bill = z.infer<typeof BillSchema>;

/** Réforme adoptée : elle entre en vigueur après le délai de la proposition. */
export const ReformSchema = z
  .object({
    propositionId: Id,
    texteId: Id,
    adopteeSemaine: Week,
    vigueurSemaine: Week,
    concessions: Count,
    appliquee: z.boolean(),
  })
  .strict();
export type Reform = z.infer<typeof ReformSchema>;

const ParliamentShape = z
  .object({
    /** Sièges et alignement de chaque groupe (identifiants du jeu de règles). */
    groupes: z.record(Id, z.object({ sieges: Count, alignement: z.enum(ALIGNMENTS) }).strict()),
    textes: z.array(BillV16Schema),
    reformes: z.array(ReformSchema),
    /** Engagements de responsabilité hors lois de finances, par session ordinaire (art. 49). */
    usage49_3: z.object({ session: z.number().int().min(0), autres: Count }).strict(),
    prochainDepot: Week,
  })
  .strict();

/** Parlement aux formats 9 à 16 (figé). */
export const ParliamentV16Schema = ParliamentShape;
export type ParliamentV16 = z.infer<typeof ParliamentV16Schema>;

/** Facteur de la tension parlementaire (points entiers, somme exacte). */
export const TensionFactorSchema = z
  .object({ libelle: z.string().min(1), valeur: z.number().int() })
  .strict();
export type TensionFactor = z.infer<typeof TensionFactorSchema>;

/**
 * Tension parlementaire (phase 13), de 0 à 100, calculée par le moteur chaque semaine avec ses
 * facteurs (hypothèses du jeu de règles) ; la somme des facteurs, écrêtement compris, donne la
 * valeur. `censure` : projection, si le gouvernement engageait sa responsabilité cette semaine,
 * des voix pour la censure et de la majorité requise (null : aucune motion ne serait recevable).
 */
export const ParliamentTensionSchema = z
  .object({
    valeur: z.number().int().min(0).max(100),
    facteurs: z.array(TensionFactorSchema),
    censure: z.object({ pour: Count, majorite: Count }).strict().nullable(),
  })
  .strict()
  .refine((t) => t.facteurs.reduce((sum, f) => sum + f.valeur, 0) === t.valeur, {
    message: 'La tension est la somme exacte de ses facteurs',
  });
export type ParliamentTension = z.infer<typeof ParliamentTensionSchema>;

/** Motion de censure spontanée (art. 49 al. 2), déposée par l'opposition (phase 13). */
export const SpontaneousMotionSchema = CensureShape.extend({
  id: Id,
  intervention: OppositionInterventionSchema.nullable(),
}).strict();
export type SpontaneousMotion = z.infer<typeof SpontaneousMotionSchema>;

/** Coalition de gouvernement (phase 13) : les groupes du bloc partenaire soutiennent le président. */
export const CoalitionSchema = z
  .object({
    bloc: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
    groupes: z.array(Id).min(1),
    depuis: Week,
  })
  .strict();
export type Coalition = z.infer<typeof CoalitionSchema>;

/**
 * Parlement (format 17, phase 13) : textes du format 17, tension parlementaire, fronde de fond
 * des groupes qui soutiennent le président (nombres de députés, aucun nom), apaisement,
 * motions de censure spontanées et coalition de gouvernement.
 */
export const ParliamentSchema = ParliamentShape.extend({
  textes: z.array(BillSchema),
  tension: ParliamentTensionSchema,
  /** Fronde de fond : députés de chaque groupe soutien prêts à voter contre le gouvernement. */
  fronde: z.record(Id, Count),
  /** Apaisement (points de tension retranchés), qui décroît chaque semaine. */
  apaisement: z.number().int().min(0).max(100),
  motions: z.array(SpontaneousMotionSchema),
  /** Motions spontanées de la session ordinaire en cours (art. 49 al. 2 : trois au plus). */
  motionsSession: z.object({ session: z.number().int().min(0), nombre: Count }).strict(),
  coalition: CoalitionSchema.nullable(),
}).strict();
export type Parliament = z.infer<typeof ParliamentSchema>;
