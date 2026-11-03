import { MusicManifestSchema } from '@r2027/shared';
import raw from './musiques.json';

// Manifeste de la musique (phase 19), produit par `pnpm data:sons` et validé au chargement :
// titres, auteurs, licences, sources et fichiers servis par l'interface (dossier public).

export const MUSIC = MusicManifestSchema.parse(raw);

/** Adresse d'un fichier du dossier public, relative à la base de l'interface. */
export const publicUrl = (fichier: string) => `${import.meta.env.BASE_URL}${fichier}`;
