import type { Ambiance } from '@r2027/shared';

// Musique du jeu (phase 19) : morceaux de Kevin MacLeod (incompetech.com) publiés sous licence
// CC BY 3.0 et hébergés sur Wikimedia Commons. La licence et l'auteur ne sont pas recopiés ici :
// l'importeur les lit sur la page de chaque fichier et refuse un morceau sans licence libre.

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
    id: 'inspired',
    fichier: 'Inspired (ISRC USUAN1600022).mp3',
    titre: 'Inspired',
    ambiance: 'accueil',
    extraitMax: 150,
  },
  {
    id: 'investigations',
    fichier: 'Investigations (ISRC USUAN1100646).mp3',
    titre: 'Investigations',
    ambiance: 'campagne',
    extraitMax: null,
  },
  {
    id: 'impact-moderato',
    fichier: 'Impact Moderato (ISRC USUAN1100618).mp3',
    titre: 'Impact Moderato',
    ambiance: 'campagne',
    extraitMax: null,
  },
  {
    id: 'deliberate-thought',
    fichier: 'Deliberate Thought (ISRC USUAN1100261).mp3',
    titre: 'Deliberate Thought',
    ambiance: 'mandat',
    extraitMax: 150,
  },
  {
    id: 'lasting-hope',
    fichier: 'Lasting Hope (ISRC USUAN1100178).mp3',
    titre: 'Lasting Hope',
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
