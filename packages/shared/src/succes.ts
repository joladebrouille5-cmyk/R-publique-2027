import { z } from 'zod';

// Succès (phase 15, idée I9) : jalons de la partie débloqués une fois, évalués par le moteur à
// la fin de chaque semaine sur l'état (conditions nommées, seuils du jeu de règles). Convention
// du jeu, sans valeur d'évaluation réelle ; propres à chaque partie (enregistrés dans l'état).

const Id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Conditions évaluées par le moteur ; le seuil éventuel vient du jeu de règles. */
export const ACHIEVEMENT_CONDITIONS = [
  'parrainages-seuil',
  'parrainages-departements',
  'soutiens',
  'ralliement',
  'qualifie',
  'elu',
  'reelu',
  'gouvernement-experts',
  'majorite-absolue',
  'coalition',
  'texte-sans-49-3',
  'sans-censure',
  'qag-sang-froid',
  'gestion-crises',
  'objectifs',
  'note',
  'popularite',
  'deplacements',
] as const;
export const AchievementConditionSchema = z.enum(ACHIEVEMENT_CONDITIONS);
export type AchievementCondition = z.infer<typeof AchievementConditionSchema>;

/** Succès du jeu de règles : libellé, description et condition (seuil éventuel). */
export const AchievementDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    condition: AchievementConditionSchema,
    seuil: z.number().int().min(1).optional(),
  })
  .strict();
export type AchievementDefinition = z.infer<typeof AchievementDefinitionSchema>;

/** Succès débloqué dans une partie, avec la semaine où il l'a été. */
export const AchievementSchema = z.object({ id: Id, semaine: z.number().int().min(0) }).strict();
export type Achievement = z.infer<typeof AchievementSchema>;
