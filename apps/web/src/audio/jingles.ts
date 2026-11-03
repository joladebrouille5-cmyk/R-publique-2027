// Jingles des moments forts (phase 19) : partitions jouées par le synthétiseur de l'interface
// (`synth.ts`), sans aucun enregistrement. Chaque note donne son instant (secondes depuis le début
// du jingle), son instrument, ses hauteurs (notes MIDI, un accord en contient plusieurs), sa durée
// tenue et sa vélocité (0 à 1). Données pures : testées sans navigateur.

export const CUES = ['vingt-heures', 'victoire', 'defaite', 'debat', 'flash'] as const;
export type Cue = (typeof CUES)[number];

export const INSTRUMENTS = [
  'cuivres',
  'cordes',
  'cloche',
  'timbale',
  'cymbale',
  'tic',
  'basse',
  'souffle',
  'pulsation',
] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export type JingleNote = {
  t: number;
  instrument: Instrument;
  hauteurs: readonly number[];
  duree: number;
  velocite: number;
};

export type Jingle = {
  id: Cue;
  /** Nom du moment, affiché dans Paramètres. */
  libelle: string;
  /** Quand le jingle se fait entendre (Paramètres). */
  quand: string;
  /** Durée totale, queue de réverbération comprise (secondes). */
  duree: number;
  /** Part du signal envoyée à la réverbération (0 à 1). */
  reverb: number;
  notes: readonly JingleNote[];
};

/** Hauteurs MIDI usuelles (do 4 = 60). */
const N = {
  A1: 33,
  C2: 36,
  D2: 38,
  E2: 40,
  G1: 31,
  A2: 45,
  C3: 48,
  D3: 50,
  E3: 52,
  F3: 53,
  Fs3: 54,
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60,
  D4: 62,
  E4: 64,
  F4: 65,
  Fs4: 66,
  G4: 67,
  A4: 69,
  B4: 71,
  C5: 72,
  Cs5: 73,
  D5: 74,
  E5: 76,
  A5: 81,
  B5: 83,
  C6: 84,
  D6: 86,
  E6: 88,
  Fs6: 90,
  G6: 91,
  A6: 93,
  C7: 96,
} as const;

const note = (
  t: number,
  instrument: Instrument,
  hauteurs: readonly number[],
  duree: number,
  velocite: number,
): JingleNote => ({ t, instrument, hauteurs, duree, velocite });

/**
 * Résultat à 20 h : quatre secondes de compte à rebours (tic, battement, montée), puis l'accord
 * éclatant de ré majeur au moment où l'estimation s'affiche.
 */
const VINGT_HEURES: Jingle = {
  id: 'vingt-heures',
  libelle: 'Résultat à 20 h',
  quand: 'À l’ouverture de la soirée électorale, quand l’estimation de 20 h s’affiche.',
  duree: 7,
  reverb: 0.3,
  notes: [
    ...[0, 0.5, 1, 1.5].map((t, i) => note(t, 'tic', [N.C7], 0.05, 0.55 + i * 0.07)),
    ...[0, 0.5, 1, 1.5].map((t, i) => note(t, 'pulsation', [N.A1], 0.25, 0.5 + i * 0.1)),
    note(0, 'cordes', [N.D3, N.A3], 2, 0.24),
    note(0.3, 'souffle', [], 1.7, 0.35),
    note(1.82, 'cuivres', [N.A3, N.A4], 0.16, 0.6),
    note(2, 'cuivres', [N.D3, N.Fs3, N.A3, N.D4, N.Fs4, N.A4], 2.4, 0.85),
    note(2, 'timbale', [N.D2], 1.6, 1),
    note(2, 'cymbale', [], 2.5, 0.55),
    note(2, 'cordes', [N.D4, N.Fs4, N.A4, N.D5], 3.6, 0.35),
    note(2, 'cloche', [N.D6, N.A6], 1.6, 0.45),
    note(2.12, 'cloche', [N.Fs6], 1.4, 0.35),
  ],
};

/** Victoire : fanfare de cuivres en do majeur, triolets d'élan puis accord tenu, étincelles. */
const VICTOIRE: Jingle = {
  id: 'victoire',
  libelle: 'Victoire',
  quand: 'À la fin du dépouillement, si votre candidat est qualifié ou élu.',
  duree: 6,
  reverb: 0.3,
  notes: [
    note(0, 'cuivres', [N.G3], 0.12, 0.7),
    note(0.13, 'cuivres', [N.C4], 0.12, 0.72),
    note(0.26, 'cuivres', [N.E4], 0.12, 0.75),
    note(0.39, 'cuivres', [N.G4], 0.34, 0.8),
    note(0.39, 'timbale', [N.G1], 0.8, 0.7),
    note(0.8, 'cuivres', [N.C3, N.G3, N.C4, N.E4, N.G4, N.C5], 2.6, 0.9),
    note(0.8, 'timbale', [N.C2], 1.6, 1),
    note(0.8, 'cymbale', [], 3, 0.6),
    note(0.8, 'cordes', [N.C4, N.E4, N.G4, N.C5, N.E5], 4.2, 0.38),
    note(0.8, 'cloche', [N.C6], 1.4, 0.35),
    note(0.95, 'cloche', [N.E6], 1.4, 0.35),
    note(1.1, 'cloche', [N.G6], 1.4, 0.35),
    note(1.25, 'cloche', [N.C7], 1.6, 0.35),
  ],
};

/** Défaite : cordes graves, la mineur puis fa majeur, cor discret ; aucun éclat. */
const DEFAITE: Jingle = {
  id: 'defaite',
  libelle: 'Défaite',
  quand: 'À la fin du dépouillement, si votre candidat est battu.',
  duree: 6.2,
  reverb: 0.35,
  notes: [
    note(0, 'cordes', [N.A3, N.C4, N.E4], 1.8, 0.32),
    note(0, 'cuivres', [N.A2], 1.6, 0.3),
    note(0, 'timbale', [N.A1], 1.4, 0.45),
    note(1.6, 'cordes', [N.F3, N.A3, N.C4, N.F4], 3, 0.32),
    note(1.6, 'cuivres', [N.F3], 2.2, 0.26),
    note(1.6, 'cloche', [N.E5], 1.8, 0.22),
  ],
};

/** Ouverture d'un débat : pulsation de basse qui accélère la tension, deux impacts, accord en suspens. */
const DEBAT: Jingle = {
  id: 'debat',
  libelle: 'Ouverture d’un débat',
  quand: 'À l’ouverture du plateau d’un débat télévisé.',
  duree: 5.6,
  reverb: 0.28,
  notes: [
    ...[0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4].map((t, i) =>
      note(t, 'basse', [N.E2], 0.14, 0.45 + i * 0.04),
    ),
    note(0.5, 'souffle', [], 1.1, 0.35),
    note(1.6, 'cuivres', [N.E3, N.B3, N.E4, N.G4], 0.38, 0.85),
    note(1.6, 'timbale', [N.E2], 1, 0.9),
    note(1.6, 'cymbale', [], 1.4, 0.45),
    note(2.05, 'cuivres', [N.C3, N.G3, N.C4, N.E4], 1.7, 0.8),
    note(2.05, 'timbale', [N.C2], 1.4, 0.8),
    note(2.05, 'cordes', [N.C4, N.E4, N.G4, N.B4], 2.4, 0.3),
    note(2.05, 'cloche', [N.B5], 1.4, 0.35),
    note(2.2, 'cloche', [N.E6], 1.4, 0.3),
  ],
};

/** Nouvelle importante : trois notes de cloche qui montent, sur un battement et une nappe claire. */
const FLASH: Jingle = {
  id: 'flash',
  libelle: 'Nouvelle importante',
  quand: 'Événement majeur de la semaine ou urgence ministérielle.',
  duree: 3,
  reverb: 0.3,
  notes: [
    note(0, 'pulsation', [N.A1], 0.25, 0.6),
    note(0, 'souffle', [], 0.3, 0.3),
    note(0, 'cloche', [N.E5], 0.9, 0.7),
    note(0.14, 'cloche', [N.A5], 0.9, 0.7),
    note(0.28, 'cloche', [N.E6], 1.2, 0.85),
    note(0.28, 'cordes', [N.A4, N.Cs5, N.E5], 1.6, 0.22),
    note(0.28, 'cuivres', [N.A3, N.E4], 0.9, 0.5),
  ],
};

export const JINGLES: Record<Cue, Jingle> = {
  'vingt-heures': VINGT_HEURES,
  victoire: VICTOIRE,
  defaite: DEFAITE,
  debat: DEBAT,
  flash: FLASH,
};

/** Fréquence (Hz) d'une note MIDI (la 4 = 69 = 440 Hz). */
export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
