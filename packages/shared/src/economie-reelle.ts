import { z } from 'zod';
import { IsoDateSchema } from './game';
import { ImportedSourceSchema } from './personalities';

// Indicateurs économiques de départ importés par `pnpm data:economie` (séries de l'Insee).
// Module distinct de `economie.ts` (état de partie) pour éviter un cycle d'imports avec game.ts.

/** Valeur de départ issue d'une ou de plusieurs séries de l'Insee. */
export const SourcedIndicatorSchema = z
  .object({
    valeur: z.number().int(),
    /** Période de la donnée (« T2 2026 », « septembre 2026 », « 4 trimestres jusqu'au T2 2026 »). */
    periode: z.string().min(1),
    statut: z.enum(['estimation', 'deduit']),
    /** Identifiants des sources (séries) utilisées. */
    sourceIds: z.array(z.string().min(1)).min(1),
    regle: z.string().min(1),
  })
  .strict();
export type SourcedIndicator = z.infer<typeof SourcedIndicatorSchema>;

export const RealEconomySchema = z
  .object({
    verifieLe: IsoDateSchema,
    sources: z.array(ImportedSourceSchema).min(1),
    indicateurs: z
      .object({
        croissance: SourcedIndicatorSchema,
        inflation: SourcedIndicatorSchema,
        chomage: SourcedIndicatorSchema,
        deficit: SourcedIndicatorSchema,
        dette: SourcedIndicatorSchema,
        confiance: SourcedIndicatorSchema,
      })
      .strict(),
    /** PIB annuel en valeur (millions d'euros), somme des quatre derniers trimestres. */
    pibAnnuelMillions: SourcedIndicatorSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.sources.map((s) => s.id));
    for (const [name, indicator] of Object.entries({
      ...value.indicateurs,
      pibAnnuelMillions: value.pibAnnuelMillions,
    }))
      for (const id of indicator.sourceIds)
        if (!ids.has(id))
          ctx.addIssue({ code: 'custom', path: [name], message: `Source inconnue : ${id}` });
  });
export type RealEconomy = z.infer<typeof RealEconomySchema>;
