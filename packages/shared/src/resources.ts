import { z } from 'zod';

// Ressources d'un acteur de campagne. Toutes les valeurs sont des ENTIERS pour une
// comptabilité exacte et un calcul déterministe :
// - budgetCentimes : argent disponible, en centimes d'euro ;
// - tempsHeures : heures disponibles pour la semaine en cours (capacité remise à zéro chaque semaine) ;
// - militants : nombre de militants actifs ;
// - notoriete, popularite : en centièmes de point de pourcentage (0 à 10 000 = 0 à 100 %).

export const RESOURCE_KEYS = [
  'budgetCentimes',
  'tempsHeures',
  'militants',
  'notoriete',
  'popularite',
] as const;
export const ResourceKeySchema = z.enum(RESOURCE_KEYS);
export type ResourceKey = z.infer<typeof ResourceKeySchema>;

const NonNegativeInt = z.number().int().min(0);
const Percent100 = z.number().int().min(0).max(10_000);

export const ResourcesSchema = z
  .object({
    budgetCentimes: NonNegativeInt,
    tempsHeures: NonNegativeInt,
    militants: NonNegativeInt,
    notoriete: Percent100,
    popularite: Percent100,
  })
  .strict();
export type Resources = z.infer<typeof ResourcesSchema>;

/** Bornes de chaque ressource (au-delà, la variation est écrêtée et l'écrêtement est journalisé). */
export const RESOURCE_BOUNDS: Record<ResourceKey, { min: number; max: number }> = {
  budgetCentimes: { min: 0, max: Number.MAX_SAFE_INTEGER },
  tempsHeures: { min: 0, max: 168 },
  militants: { min: 0, max: Number.MAX_SAFE_INTEGER },
  notoriete: { min: 0, max: 10_000 },
  popularite: { min: 0, max: 10_000 },
};
