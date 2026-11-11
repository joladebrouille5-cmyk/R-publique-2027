import { z } from 'zod';
import { IsoDateSchema } from './game';

// Actifs photographiques des scènes 3D (phase 26), importés par `pnpm data:scenes` : textures de
// matériaux et éclairages par environnement de Poly Haven (domaine public, CC0), et photographies
// de lieux réels de Wikimedia Commons (licence libre, auteur crédité). Décor seulement : ni le moteur, ni les règles, ni la sauvegarde n'en dépendent ; sans eux (palier
// « éco », fichier absent), les scènes gardent leurs matières fabriquées par le code.

/** Matières des scènes : chaque nom a aussi sa recette fabriquée par le code (repli). */
export const SCENE_MATERIALS = ['bois', 'parquet', 'pierre', 'velours', 'beton'] as const;
export type SceneMaterialId = (typeof SCENE_MATERIALS)[number];

/** Éclairages par environnement : une salle, un studio. */
export const SCENE_LIGHTINGS = ['salle', 'studio'] as const;
export type SceneLightingId = (typeof SCENE_LIGHTINGS)[number];

const Credit = {
  /** Nom de l'actif chez Poly Haven. */
  titre: z.string().min(1),
  auteurs: z.string().min(1),
  licence: z.literal('CC0 1.0'),
  licenceUrl: z.literal('https://creativecommons.org/publicdomain/zero/1.0/deed.fr'),
  source: z.string().regex(/^https:\/\/polyhaven\.com\/a\/[A-Za-z0-9_]+$/),
  /** Ce que l'import a changé (taille, format, teinte). */
  modifications: z.string().min(1),
  octets: z.number().int().positive(),
};
const Fichier = z.string().regex(/^scenes3d\/[a-z0-9/-]+\.(webp|hdr)$/);

export const SceneMaterialSchema = z
  .object({
    id: z.enum(SCENE_MATERIALS),
    ...Credit,
    /** Côté de la surface photographiée, en mètres (échelle de répétition). */
    tailleM: z.number().positive(),
    couleur: Fichier,
    normale: Fichier,
    rugosite: Fichier,
  })
  .strict();
export type SceneMaterial = z.infer<typeof SceneMaterialSchema>;

export const SceneLightingSchema = z
  .object({
    id: z.enum(SCENE_LIGHTINGS),
    ...Credit,
    /** Image à grande dynamique (Radiance .hdr, équirectangulaire). */
    fichier: Fichier,
  })
  .strict();
export type SceneLighting = z.infer<typeof SceneLightingSchema>;

/** Plans photographiques : une vraie photographie d'un lieu, mise en relief par la scène. */
export const SCENE_PLATES = ['elysee'] as const;
export type ScenePlateId = (typeof SCENE_PLATES)[number];

const Part = z.number().min(0).max(1);

export const ScenePlateSchema = z
  .object({
    id: z.enum(SCENE_PLATES),
    /** Ce que montre la photographie. */
    titre: z.string().min(1),
    auteur: z.string().min(1),
    licence: z.string().min(1),
    licenceUrl: z.string().url().nullable(),
    /** Page du fichier sur Wikimedia Commons. */
    source: z.string().regex(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/),
    modifications: z.string().min(1),
    octets: z.number().int().positive(),
    fichier: z.string().regex(/^scenes3d\/plans\/[a-z0-9-]+\.webp$/),
    largeur: z.number().int().positive(),
    hauteur: z.number().int().positive(),
    /**
     * Repères lus sur la photographie, pour la remettre en perspective : focale (en largeurs
     * d'image), ligne d'horizon et pied de la façade (parts de la hauteur, depuis le haut),
     * hauteur de l'œil du photographe (mètres, estimation).
     */
    repere: z
      .object({
        focale: z.number().positive(),
        horizon: Part,
        pied: Part,
        oeilM: z.number().positive(),
      })
      .strict()
      .refine((r) => r.pied > r.horizon, { message: 'le pied de la façade est sous l’horizon' }),
    /** Drapeaux de la photographie, animés par une légère ondulation (parts de l'image). */
    drapeaux: z.array(
      z
        .object({
          x: Part,
          y: Part,
          largeur: Part,
          hauteur: Part,
          mat: z.enum(['gauche', 'droite']),
        })
        .strict(),
    ),
  })
  .strict();
export type ScenePlate = z.infer<typeof ScenePlateSchema>;

export const SceneAssetsSchema = z
  .object({
    verifieLe: IsoDateSchema,
    note: z.string().min(1),
    matieres: z.array(SceneMaterialSchema),
    eclairages: z.array(SceneLightingSchema),
    plans: z.array(ScenePlateSchema).default([]),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    for (const [nom, liste] of [
      ['matière', manifest.matieres.map((m) => m.id)],
      ['éclairage', manifest.eclairages.map((e) => e.id)],
    ] as const)
      if (new Set(liste).size !== liste.length)
        ctx.addIssue({ code: 'custom', message: `${nom} en double` });
  });
export type SceneAssets = z.infer<typeof SceneAssetsSchema>;
