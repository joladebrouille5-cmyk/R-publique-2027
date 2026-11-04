import { z } from 'zod';

// Économie du quinquennat (phase 6, P6-05) : indicateurs de départ sourcés (séries de l'Insee,
// produites par `pnpm data:economie`), puis évolution simulée par un modèle de jeu étiqueté
// « hypothèse ». Toutes les valeurs sont des entiers en centièmes (8,30 % → 830 ; indice
// 100,00 → 10 000). Le déficit est négatif (besoin de financement), la dette positive.

export const ECONOMIC_INDICATORS = [
  'croissance',
  'inflation',
  'chomage',
  'deficit',
  'dette',
  'pouvoirAchat',
  'confiance',
  'tensions',
] as const;
export type EconomicIndicator = (typeof ECONOMIC_INDICATORS)[number];
export const EconomicIndicatorSchema = z.enum(ECONOMIC_INDICATORS);

/**
 * Sens favorable de chaque indicateur (convention de lecture) : vrai si une hausse est une
 * amélioration (croissance, solde public, pouvoir d'achat, confiance), faux sinon (inflation,
 * chômage, dette, tensions sociales).
 */
export const FAVORABLE_RISE: Record<EconomicIndicator, boolean> = {
  croissance: true,
  inflation: false,
  chomage: false,
  deficit: true,
  dette: false,
  pouvoirAchat: true,
  confiance: true,
  tensions: false,
};

/** Nom et unité de variation de chaque indicateur dans les textes du jeu. */
const CHANGE_LABELS: Record<EconomicIndicator, { nom: string; unite: string }> = {
  croissance: { nom: 'croissance', unite: ' pt' },
  inflation: { nom: 'inflation', unite: ' pt' },
  chomage: { nom: 'chômage', unite: ' pt' },
  deficit: { nom: 'solde public', unite: ' pt de PIB' },
  dette: { nom: 'dette publique', unite: ' pt de PIB' },
  pouvoirAchat: { nom: 'pouvoir d’achat', unite: '' },
  confiance: { nom: 'confiance des ménages', unite: '' },
  tensions: { nom: 'tensions sociales', unite: '' },
};

/**
 * Nombre signé à la française à partir de centièmes : « +0,6 », « −0,04 » (vrai signe moins ;
 * indépendant des réglages régionaux du système, comme tout texte produit par le moteur).
 */
export function signedHundredths(value: number): string {
  const text = String(Math.abs(value) / 100).replace('.', ',');
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** Variation d'un indicateur en clair : « solde public −0,04 pt de PIB », « chômage −0,02 pt ». */
export function describeIndicatorChange(indicator: EconomicIndicator, value: number): string {
  const { nom, unite } = CHANGE_LABELS[indicator];
  return `${nom} ${signedHundredths(value)}${unite}`;
}

/** Bornes de jeu de chaque indicateur (centièmes) : toute valeur est écrêtée et journalisée. */
export const INDICATOR_BOUNDS: Record<EconomicIndicator, { min: number; max: number }> = {
  croissance: { min: -1_000, max: 1_000 },
  inflation: { min: -500, max: 2_500 },
  chomage: { min: 200, max: 3_000 },
  deficit: { min: -2_000, max: 500 },
  dette: { min: 0, max: 30_000 },
  pouvoirAchat: { min: 5_000, max: 20_000 },
  confiance: { min: 3_000, max: 15_000 },
  tensions: { min: 0, max: 10_000 },
};

const Indicators = z.record(EconomicIndicatorSchema, z.number().int());

export const EconomyStateSchema = z
  .object({
    indicateurs: Indicators,
    /** Solde structurel (centièmes de point de PIB) : départ, puis effet des réformes en vigueur. */
    soldeStructurel: z.number().int(),
    /** Effets différés sur les indicateurs (crises, choix), appliqués à leur semaine. */
    differes: z.array(
      z
        .object({
          semaine: z.number().int().min(0),
          indicateur: EconomicIndicatorSchema,
          valeur: z.number().int(),
          libelle: z.string().min(1),
        })
        .strict(),
    ),
    /** Dernières valeurs hebdomadaires (graphiques), au plus 260 semaines. */
    historique: z.array(
      z.object({ semaine: z.number().int().min(0), valeurs: Indicators }).strict(),
    ),
  })
  .strict();
export type EconomyState = z.infer<typeof EconomyStateSchema>;

/** Variation d'un indicateur dans la semaine, décomposée en facteurs (somme exacte). */
export const EconomyChangeSchema = z
  .object({
    indicateur: EconomicIndicatorSchema,
    before: z.number().int(),
    after: z.number().int(),
    factors: z
      .array(
        z
          .object({
            label: z.string().min(1),
            value: z.number().int(),
            source: z.enum([
              'conjoncture',
              'reforme',
              'crise',
              'decision',
              'differe',
              'limite',
              'durable',
              // Phase 13 : action du chef de l'État, effet des ministres de leur domaine.
              'action',
              'gouvernement',
            ]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type EconomyChange = z.infer<typeof EconomyChangeSchema>;
