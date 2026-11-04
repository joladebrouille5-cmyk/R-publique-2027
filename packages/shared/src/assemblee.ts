import { z } from 'zod';
import { IsoDateSchema } from './game';
import { ImportedSourceSchema } from './personalities';
import { PositionSchema } from './politics';

// Assemblée nationale réelle (phase 6, décision du 21/10/2026) : groupes politiques et nombre
// de sièges d'après la liste ouverte des députés en exercice, sans aucun nom de député ;
// position de chaque groupe d'après l'enquête CHES (parti de référence) ou hypothèse
// documentée. Produit par `pnpm data:assemblee`. Les votes du jeu sont ceux des groupes,
// simulés : aucun vote individuel n'est attribué à un député réel.

export const AssemblyGroupSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    /** Sigle et intitulé du groupe dans le fichier source. */
    sigle: z.string().min(1),
    libelle: z.string().min(1),
    sieges: z.number().int().min(0),
    /** Députés non inscrits : pas de groupe, donc pas de discipline de vote. */
    nonInscrits: z.boolean(),
    position: PositionSchema,
    positionStatut: z.enum(['estimation', 'hypothese']),
    /** Parti de référence noté par l'enquête CHES 2024, ou null (position « hypothèse »). */
    ches: z
      .object({ parti: z.string().min(1), lrecon: z.number(), galtan: z.number() })
      .strict()
      .nullable(),
    positionDetail: z.string().min(1),
  })
  .strict();
export type AssemblyGroup = z.infer<typeof AssemblyGroupSchema>;

export const RealAssemblySchema = z
  .object({
    verifieLe: IsoDateSchema,
    legislature: z.number().int().min(1),
    siegesTotal: z.literal(577),
    sources: z.array(ImportedSourceSchema).min(1),
    methode: z.object({ composition: z.string().min(1), position: z.string().min(1) }).strict(),
    groupes: z.array(AssemblyGroupSchema).min(2),
    /** Sièges non pourvus dans le fichier source. */
    vacants: z.number().int().min(0),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const ids = new Set<string>();
    for (const g of value.groupes) {
      if (ids.has(g.id)) issue(`Groupe en double : ${g.id}`);
      ids.add(g.id);
      if ((g.ches === null) !== (g.positionStatut === 'hypothese'))
        issue(`${g.id} : position « estimation » si et seulement si un parti CHES est cité`);
    }
    const seats = value.groupes.reduce((sum, g) => sum + g.sieges, 0);
    if (seats + value.vacants !== value.siegesTotal)
      issue(`Sièges : ${seats} pourvus + ${value.vacants} vacants ≠ ${value.siegesTotal}`);
    if (value.groupes.filter((g) => g.nonInscrits).length > 1)
      issue('Un seul ensemble de non-inscrits');
  });
export type RealAssembly = z.infer<typeof RealAssemblySchema>;
