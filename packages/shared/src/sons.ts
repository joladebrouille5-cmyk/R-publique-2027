import { z } from 'zod';
import { IsoDateSchema } from './game';
import { FREE_LICENSES } from './personalities';

// Musique du jeu (phase 19) : morceaux sous licence libre de Wikimedia Commons, importés par
// `pnpm data:sons` (licence et auteur lus sur la page du fichier), extraits, au volume normalisé
// et réencodés pour être embarqués dans l'interface (le jeu reste jouable hors ligne). Les
// jingles des moments forts, eux, sont fabriqués par l'interface et n'ont pas de fichier.

/** Ambiances musicales, de l'écran-titre au mandat. */
export const AMBIANCES = ['accueil', 'campagne', 'mandat'] as const;
export const AmbianceSchema = z.enum(AMBIANCES);
export type Ambiance = z.infer<typeof AmbianceSchema>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const MusicTrackSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    titre: z.string().min(1),
    auteur: z.string().min(1),
    ambiance: AmbianceSchema,
    /** Fichier servi par l'interface, relatif à son dossier public. */
    fichier: z.string().regex(/^sons\/[a-z0-9-]+\.mp3$/),
    dureeSecondes: z.number().positive(),
    octets: z.number().int().positive(),
    sha256: Sha256,
    licence: z.string().regex(FREE_LICENSES, 'licence libre attendue'),
    licenceUrl: z.url().nullable(),
    /** Page du fichier sur Wikimedia Commons. */
    source: z.url(),
    /** Fichier original téléchargé (jamais commité), pour vérifier la reproduction. */
    original: z
      .object({
        url: z.url(),
        sha256: Sha256,
        octets: z.number().int().positive(),
        dureeSecondes: z.number().positive(),
      })
      .strict(),
    /** Modifications apportées à l'œuvre (extrait, volume, format), déclarées comme l'exige la licence. */
    modifications: z.string().min(1),
  })
  .strict();
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

export const MusicManifestSchema = z
  .object({
    verifieLe: IsoDateSchema,
    /** Méthode de l'import, affichée avec les crédits. */
    note: z.string().min(1),
    morceaux: z.array(MusicTrackSchema).min(1),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const ids = manifest.morceaux.map((m) => m.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'identifiants de morceaux en double' });
    for (const ambiance of AMBIANCES)
      if (!manifest.morceaux.some((m) => m.ambiance === ambiance))
        ctx.addIssue({ code: 'custom', message: `aucun morceau pour l’ambiance « ${ambiance} »` });
  });
export type MusicManifest = z.infer<typeof MusicManifestSchema>;
