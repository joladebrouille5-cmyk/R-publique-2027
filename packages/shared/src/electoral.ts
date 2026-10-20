import { z } from 'zod';
import { CountsSchema } from './game';
import { DataImportSchema } from './territory';

// Résultats électoraux historiques importés (§3.1, §10) : présidentielle 2022 par commune,
// ramenés à la géographie du référentiel (COG 2026). Valeurs entières ; ordre des champs fixe.

/** Champs de comptage, dans l'ordre des tableaux `valeurs` (suivis des voix de chaque candidat). */
export const COUNT_FIELDS = [
  'inscrits',
  'abstentions',
  'votants',
  'blancs',
  'nuls',
  'exprimes',
] as const;

export const HistoricalCandidateSchema = z
  .object({
    panneau: z.number().int().positive(),
    nom: z.string().min(1),
    prenom: z.string().min(1),
    sexe: z.enum(['F', 'M']),
  })
  .strict();
export type HistoricalCandidate = z.infer<typeof HistoricalCandidateSchema>;

const Counts = z.array(z.number().int().min(0));

export const HistoricalRoundSchema = z
  .object({
    format: z.literal('republique-2027/resultats'),
    formatVersion: z.literal(1),
    election: z.string().min(1),
    tour: z.union([z.literal(1), z.literal(2)]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nature: z.literal('reel'),
    millesimeGeographique: z.string().min(1),
    importeur: z.string().min(1),
    sources: z.array(DataImportSchema).min(1),
    /** Totaux proclamés (Conseil constitutionnel), égaux à la somme des lignes, vérifiés à l'import. */
    proclamation: z
      .object({ reference: z.string().min(1), url: z.url(), valeurs: Counts })
      .strict(),
    candidats: z.array(HistoricalCandidateSchema).min(1),
    /** Commune (code COG du référentiel) → [inscrits, abstentions, votants, blancs, nuls, exprimés, voix…]. */
    communes: z.record(z.string(), Counts),
    /** Communes dont les résultats ont été ventilés au prorata de la population (scissions) : estimation. */
    estimations: z.array(z.string()),
    /** Communes du référentiel sans électeurs inscrits en 2022 (aucune ligne dans le fichier). */
    sansLigne: z.array(z.string()),
    /** Territoires hors carte (collectivités d'outre-mer, Français établis hors de France). */
    horsCarte: z.record(z.string(), z.object({ nom: z.string().min(1), valeurs: Counts }).strict()),
  })
  .strict();
export type HistoricalRound = z.infer<typeof HistoricalRoundSchema>;

// --- Réponses de l'API pour la carte ---

/** Résultats simulés des communes d'un département, pour un tour d'une partie. */
export const CommuneResultsResponseSchema = z
  .object({
    tour: z.union([z.literal(1), z.literal(2)]),
    departement: z.string(),
    nature: z.enum(['reel', 'fictif', 'national']),
    communes: z.record(z.string(), CountsSchema),
  })
  .strict();
export type CommuneResultsResponse = z.infer<typeof CommuneResultsResponseSchema>;

/** Disponibilité des résultats historiques (importés localement ; jamais commités, question Q8). */
export const HistoricalStatusSchema = z.discriminatedUnion('disponible', [
  z
    .object({
      disponible: z.literal(true),
      election: z.string(),
      tours: z.array(
        z
          .object({
            tour: z.union([z.literal(1), z.literal(2)]),
            date: z.string(),
            candidats: z.array(HistoricalCandidateSchema),
            proclamation: z.object({ reference: z.string(), url: z.string() }).strict(),
          })
          .strict(),
      ),
      sources: z.array(DataImportSchema),
    })
    .strict(),
  z.object({ disponible: z.literal(false), raison: z.string() }).strict(),
]);
export type HistoricalStatus = z.infer<typeof HistoricalStatusSchema>;

const Values = z.record(z.string(), z.array(z.number().int().min(0)));

/** Résultats historiques réels agrégés : [inscrits, abstentions, votants, blancs, nuls, exprimés, voix…]. */
export const HistoricalOverviewSchema = z
  .object({
    tour: z.union([z.literal(1), z.literal(2)]),
    nature: z.literal('reel'),
    departements: Values,
    regions: Values,
    horsCarte: Values,
  })
  .strict();
export type HistoricalOverview = z.infer<typeof HistoricalOverviewSchema>;

/** Résultats historiques réels des communes d'un département. */
export const HistoricalCommunesSchema = z
  .object({
    tour: z.union([z.literal(1), z.literal(2)]),
    nature: z.literal('reel'),
    departement: z.string(),
    communes: Values,
    /** Communes dont les valeurs sont ventilées (scissions) : estimation. */
    estimations: z.array(z.string()),
  })
  .strict();
export type HistoricalCommunes = z.infer<typeof HistoricalCommunesSchema>;
