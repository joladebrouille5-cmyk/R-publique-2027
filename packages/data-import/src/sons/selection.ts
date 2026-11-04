import type { Ambiance } from '@r2027/shared';

// Musique du jeu (phase 21, remplace la sélection de la phase 19) : deux marches de compositeurs
// français dans le domaine public (partition et interprétation de la fanfare de l'US Marine Band,
// œuvre d'une administration fédérale américaine) et trois morceaux de Scott Buckley sous licence
// CC BY 4.0, tous hébergés sur Wikimedia Commons. La licence et l'auteur ne sont pas recopiés ici :
// l'importeur les lit sur la page de chaque fichier (licence de l'interprétation, pas seulement
// celle de la partition) et refuse un morceau sans licence libre.

export type MusicSelection = {
  id: string;
  /** Nom du fichier sur Wikimedia Commons (sans le préfixe « File: »). */
  fichier: string;
  titre: string;
  ambiance: Ambiance;
  /** Durée maximale de l'extrait, en secondes ; null : le morceau entier. */
  extraitMax: number | null;
};

export const MUSIC_SELECTION: readonly MusicSelection[] = [
  {
    id: 'orient-et-occident',
    fichier: 'Orient et Occident - U.S. Marine Band.ogg',
    titre: 'Orient et Occident, grande marche',
    ambiance: 'accueil',
    extraitMax: 150,
  },
  {
    id: 'catalyst',
    fichier: 'Scott Buckley - Catalyst.oga',
    titre: 'Catalyst',
    ambiance: 'campagne',
    extraitMax: 150,
  },
  {
    id: 'marche-hongroise',
    fichier: 'Marche Hongroise - U.S. Marine Band.ogg',
    titre: 'Marche hongroise',
    ambiance: 'campagne',
    extraitMax: 150,
  },
  {
    id: 'hiraeth',
    fichier: 'Scott Buckley - Hiraeth.oga',
    titre: 'Hiraeth',
    ambiance: 'mandat',
    extraitMax: 150,
  },
  {
    id: 'born-of-the-sky',
    fichier: 'Scott Buckley - Born Of The Sky.oga',
    titre: 'Born of the Sky',
    ambiance: 'mandat',
    extraitMax: null,
  },
];

/** Volume cible (EBU R128) : sonie intégrée, crête vraie et plage de sonie. */
export const LOUDNESS = { lufs: -18, truePeak: -1.5, range: 11 } as const;
/** Débit de l'encodage MP3, en kbit/s (stéréo, 44,1 kHz). */
export const MP3_KBPS = 96;
/** Fondu de sortie d'un extrait, en secondes (un morceau entier garde sa fin). */
export const FADE_OUT_SECONDS = 4;
