import { z } from 'zod';

// Ressources d'un acteur de campagne. Toutes les valeurs sont des ENTIERS pour une
// comptabilité exacte et un calcul déterministe :
// - budgetCentimes : argent disponible, en centimes d'euro ;
// - tempsHeures : heures disponibles pour la semaine en cours (capacité remise à zéro chaque semaine) ;
// - militants : nombre de militants actifs ;
// - notoriete, popularite : en centièmes de point de pourcentage (0 à 10 000 = 0 à 100 %) ;
// - jeunesse, dynamique (phase 9, format 14) : écho auprès des 18-34 ans et élan de campagne
//   (buzz), jauges de jeu de 0 à 10 000 (hypothèses du jeu, non mesurées).

export const RESOURCE_KEYS = [
  'budgetCentimes',
  'tempsHeures',
  'militants',
  'notoriete',
  'popularite',
  'jeunesse',
  'dynamique',
] as const;
export const ResourceKeySchema = z.enum(RESOURCE_KEYS);
export type ResourceKey = z.infer<typeof ResourceKeySchema>;

const NonNegativeInt = z.number().int().min(0);
const Percent100 = z.number().int().min(0).max(10_000);

/** Ressources des formats 1 à 13, figées pour les migrations. */
export const ResourcesV1Schema = z
  .object({
    budgetCentimes: NonNegativeInt,
    tempsHeures: NonNegativeInt,
    militants: NonNegativeInt,
    notoriete: Percent100,
    popularite: Percent100,
  })
  .strict();
export type ResourcesV1 = z.infer<typeof ResourcesV1Schema>;

/** Ressources depuis le format 14 (phase 9) : jauges Jeunesse et Dynamique en plus. */
export const ResourcesSchema = ResourcesV1Schema.extend({
  jeunesse: Percent100,
  dynamique: Percent100,
}).strict();
export type Resources = z.infer<typeof ResourcesSchema>;

/** Bornes de chaque ressource (au-delà, la variation est écrêtée et l'écrêtement est journalisé). */
export const RESOURCE_BOUNDS: Record<ResourceKey, { min: number; max: number }> = {
  budgetCentimes: { min: 0, max: Number.MAX_SAFE_INTEGER },
  tempsHeures: { min: 0, max: 168 },
  militants: { min: 0, max: Number.MAX_SAFE_INTEGER },
  notoriete: { min: 0, max: 10_000 },
  popularite: { min: 0, max: 10_000 },
  jeunesse: { min: 0, max: 10_000 },
  dynamique: { min: 0, max: 10_000 },
};
