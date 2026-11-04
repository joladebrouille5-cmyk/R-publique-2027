import { z } from 'zod';
import { IsoDateSchema } from './game';
import { CirconscriptionCodeSchema } from './legislatives-etat';
import { ImportedSourceSchema } from './personalities';

// Résultats des législatives de 2024 par circonscription (phase 6, P6-07), base des
// législatives simulées : inscrits, votants, exprimés et voix par nuance au premier tour,
// nuance de l'élu. Produit par `pnpm data:legislatives` ; aucun nom de candidat n'est conservé.

export const LegislativeDistrictSchema = z
  .object({
    code: CirconscriptionCodeSchema,
    departement: z.string().regex(/^(\d{2}|2A|2B|97\d|98\d|ZX|ZZ)$/),
    libelle: z.string().min(1),
    inscrits: z.number().int().positive(),
    votants: z.number().int().min(0),
    exprimes: z.number().int().min(0),
    /** Voix du premier tour par nuance (code du ministère de l'Intérieur). */
    voix: z.record(z.string().regex(/^[A-Z]{2,4}$/), z.number().int().min(0)),
    /**
     * Écart publié entre les exprimés et la somme des voix (exprimés − Σ voix), conservé tel
     * quel : quelques circonscriptions du fichier officiel présentent un écart d'une ou deux voix.
     */
    ecart: z.number().int().min(-5).max(5),
    /**
     * Nuance de l'élu (telle que publiée pour le tour de son élection) et ce tour. Elle peut
     * différer de sa nuance du premier tour (cas publié en Polynésie française).
     */
    elu: z
      .object({ nuance: z.string().min(1), tour: z.union([z.literal(1), z.literal(2)]) })
      .strict(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const sum = Object.values(d.voix).reduce((a, b) => a + b, 0);
    if (sum + d.ecart !== d.exprimes)
      ctx.addIssue({
        code: 'custom',
        message: `${d.code} : voix ${sum} + écart ${d.ecart} ≠ exprimés ${d.exprimes}`,
      });
    if (!(d.exprimes <= d.votants && d.votants <= d.inscrits))
      ctx.addIssue({ code: 'custom', message: `${d.code} : exprimés ≤ votants ≤ inscrits violé` });
  });
export type LegislativeDistrict = z.infer<typeof LegislativeDistrictSchema>;

export const RealLegislativesSchema = z
  .object({
    verifieLe: IsoDateSchema,
    election: z.object({ t1: IsoDateSchema, t2: IsoDateSchema }).strict(),
    sources: z.array(ImportedSourceSchema).min(1),
    circonscriptions: z.array(LegislativeDistrictSchema).length(577),
  })
  .strict()
  .superRefine((value, ctx) => {
    const codes = new Set<string>();
    for (const d of value.circonscriptions) {
      if (codes.has(d.code))
        ctx.addIssue({ code: 'custom', message: `Circonscription en double : ${d.code}` });
      codes.add(d.code);
    }
  });
export type RealLegislatives = z.infer<typeof RealLegislativesSchema>;
