import { z } from 'zod';

// Parlement (phase 6, P6-04) : sièges et alignement des groupes de l'Assemblée nationale,
// textes de la feuille de route (dépôt, commission, séance, navette, lecture définitive),
// votes par groupe (simulés : aucun vote individuel n'est attribué à un député réel),
// engagement de responsabilité (art. 49 al. 3), motions de censure et réformes adoptées, dont
// les effets sont différés selon le délai de la proposition.

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

export const GroupVoteSchema = z.object({ pour: Count, contre: Count, abstention: Count }).strict();
export type GroupVote = z.infer<typeof GroupVoteSchema>;

export const BillVoteSchema = z
  .object({
    lecture: z.enum(['premiere', 'definitive']),
    semaine: Week,
    parGroupe: z.record(Id, GroupVoteSchema),
    pour: Count,
    contre: Count,
    abstention: Count,
    adopte: z.boolean(),
  })
  .strict();
export type BillVote = z.infer<typeof BillVoteSchema>;

export const CensureSchema = z
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
export type Censure = z.infer<typeof CensureSchema>;

export const BillSchema = z
  .object({
    id: Id,
    propositionId: Id,
    deposeSemaine: Week,
    etape: z.enum(BILL_STAGES),
    /** Semaine de la prochaine étape (texte en cours). */
    echeance: Week,
    concessions: Count,
    procedure: z.enum(['ordinaire', '49-3']),
    votes: z.array(BillVoteSchema),
    censure: CensureSchema.nullable(),
    /** Fin du parcours : semaine et motif (adoption, rejet, retrait, censure). */
    issue: z
      .object({ semaine: Week, motif: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict();
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

export const ParliamentSchema = z
  .object({
    /** Sièges et alignement de chaque groupe (identifiants du jeu de règles). */
    groupes: z.record(Id, z.object({ sieges: Count, alignement: z.enum(ALIGNMENTS) }).strict()),
    textes: z.array(BillSchema),
    reformes: z.array(ReformSchema),
    /** Engagements de responsabilité hors lois de finances, par session ordinaire (art. 49). */
    usage49_3: z.object({ session: z.number().int().min(0), autres: Count }).strict(),
    prochainDepot: Week,
  })
  .strict();
export type Parliament = z.infer<typeof ParliamentSchema>;
