// Jingles des moments forts (phase 19, refaits en phase 21 : l'atelier d'imprimerie — marimba,
// cordes pincées, caisse claire, mains, machine à écrire, coup de tampon) : partitions jouées par
// le synthétiseur de l'interface
// (`synth.ts`), sans aucun enregistrement. Chaque note donne son instant (secondes depuis le début
// du jingle), son instrument, ses hauteurs (notes MIDI, un accord en contient plusieurs), sa durée
// tenue et sa vélocité (0 à 1). Données pures : testées sans navigateur.

export const CUES = ['vingt-heures', 'victoire', 'defaite', 'debat', 'flash', 'tampon'] as const;
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
  'marimba',
  'pizz',
  'caisse',
  'claque',
  'machine',
  'tampon',
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
  B1: 35,
  F2: 41,
  G2: 43,
  B2: 47,
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
  Gs4: 68,
  A4: 69,
  B4: 71,
  C5: 72,
  Cs5: 73,
  D5: 74,
  E5: 76,
  F5: 77,
  Fs5: 78,
  G5: 79,
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

/** Roulement de caisse claire : coups réguliers qui enflent de `de` à `a` (vélocités). */
const roulement = (t0: number, t1: number, pas: number, de: number, a: number) => {
  const notes: JingleNote[] = [];
  const count = Math.round((t1 - t0) / pas);
  for (let i = 0; i < count; i++)
    notes.push(
      note(t0 + i * pas, 'caisse', [], 0.12, de + ((a - de) * i) / Math.max(1, count - 1)),
    );
  return notes;
};

/**
 * Résultat à 20 h : quatre frappes de machine à écrire de plus en plus rapprochées et un
 * roulement de caisse qui enfle, puis l'estimation tombe : coup de tampon, mains, accord de ré
 * majeur au marimba et aux cordes pincées, tintement de fin de ligne.
 */
const VINGT_HEURES: Jingle = {
  id: 'vingt-heures',
  libelle: 'Résultat à 20 h',
  quand: 'À l’ouverture de la soirée électorale, quand l’estimation de 20 h s’affiche.',
  duree: 6,
  reverb: 0.24,
  notes: [
    ...[0, 0.55, 0.95, 1.25].map((t, i) => note(t, 'machine', [N.C7], 0.05, 0.6 + i * 0.08)),
    ...roulement(1.2, 1.98, 0.06, 0.18, 0.62),
    note(0.6, 'cordes', [N.D3, N.A3], 1.4, 0.18),
    note(2, 'tampon', [], 0.3, 1),
    note(2, 'claque', [], 0.2, 0.8),
    note(2, 'pizz', [N.D2, N.D3], 0.9, 0.9),
    note(2, 'marimba', [N.D4, N.Fs4, N.A4, N.D5], 1.5, 0.85),
    note(2.12, 'marimba', [N.Fs5], 1.2, 0.6),
    note(2.24, 'marimba', [N.A5], 1.4, 0.6),
    note(2, 'cordes', [N.D4, N.Fs4, N.A4], 2.6, 0.26),
    note(2.38, 'cloche', [N.D6], 1.6, 0.42),
  ],
};

/**
 * Victoire : montée de marimba en do majeur, mains sur les temps, roulement, puis l'accord
 * plein (marimba, cordes pincées, cordes), tampon et cymbale.
 */
const VICTOIRE: Jingle = {
  id: 'victoire',
  libelle: 'Victoire',
  quand: 'À la fin du dépouillement, si votre candidat est qualifié ou élu.',
  duree: 5.4,
  reverb: 0.26,
  notes: [
    ...[N.C4, N.E4, N.G4, N.C5, N.E5, N.G5].map((h, i) =>
      note(i * 0.1, 'marimba', [h], 0.5, 0.62 + i * 0.05),
    ),
    ...[0, 0.3].map((t) => note(t, 'claque', [], 0.2, 0.6)),
    ...roulement(0.45, 0.78, 0.05, 0.25, 0.55),
    note(0.8, 'tampon', [], 0.3, 0.9),
    note(0.8, 'claque', [], 0.2, 0.85),
    note(0.8, 'pizz', [N.C2, N.C3], 1, 0.9),
    note(0.8, 'marimba', [N.C4, N.E4, N.G4, N.C5], 1.6, 0.9),
    note(0.8, 'cordes', [N.C4, N.E4, N.G4, N.C5, N.E5], 3.4, 0.34),
    note(0.8, 'cymbale', [], 2.6, 0.5),
    note(1.1, 'claque', [], 0.2, 0.55),
    note(1.4, 'claque', [], 0.2, 0.55),
    note(1.05, 'cloche', [N.G6], 1.4, 0.32),
    note(1.2, 'cloche', [N.C7], 1.6, 0.32),
  ],
};

/** Défaite : cordes pincées qui descendent en la mineur, marimba grave, nappe de fa majeur. */
const DEFAITE: Jingle = {
  id: 'defaite',
  libelle: 'Défaite',
  quand: 'À la fin du dépouillement, si votre candidat est battu.',
  duree: 6,
  reverb: 0.34,
  notes: [
    ...[N.A3, N.G3, N.F3, N.E3].map((h, i) => note(i * 0.42, 'pizz', [h], 0.9, 0.55 - i * 0.05)),
    note(0, 'marimba', [N.A2, N.E3], 1.4, 0.45),
    note(1.7, 'marimba', [N.F3, N.A3, N.C4], 1.6, 0.42),
    note(1.7, 'cordes', [N.F3, N.A3, N.C4, N.F4], 3.2, 0.28),
    note(1.7, 'pizz', [N.F2], 1.1, 0.5),
    note(2.3, 'cloche', [N.E5], 1.6, 0.18),
  ],
};

/**
 * Ouverture d'un débat : cordes pincées obstinées sur mi, caisse claire qui marque la marche,
 * deux coups de tampon et un accord suspendu au marimba.
 */
const DEBAT: Jingle = {
  id: 'debat',
  libelle: 'Ouverture d’un débat',
  quand: 'À l’ouverture du plateau d’un débat télévisé.',
  duree: 5,
  reverb: 0.24,
  notes: [
    ...[0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4].map((t, i) =>
      note(t, 'pizz', [i % 2 === 0 ? N.E2 : N.E3], 0.18, 0.5 + i * 0.04),
    ),
    ...[0.4, 0.8, 1.2].map((t) => note(t, 'caisse', [], 0.12, 0.55)),
    ...roulement(1.3, 1.58, 0.04, 0.3, 0.6),
    note(1.6, 'tampon', [], 0.3, 0.95),
    note(1.6, 'marimba', [N.E3, N.B3, N.E4, N.G4], 0.5, 0.8),
    note(2.05, 'tampon', [], 0.3, 0.85),
    note(2.05, 'marimba', [N.C4, N.E4, N.G4, N.B4], 1.6, 0.8),
    note(2.05, 'cordes', [N.C4, N.E4, N.G4, N.B4], 2.4, 0.26),
    note(2.05, 'pizz', [N.C2], 1, 0.7),
    note(2.25, 'cloche', [N.B5], 1.4, 0.3),
  ],
};

/** Nouvelle importante : trois frappes de machine à écrire, puis le tintement de fin de ligne. */
const FLASH: Jingle = {
  id: 'flash',
  libelle: 'Nouvelle importante',
  quand: 'Événement majeur de la semaine ou urgence ministérielle.',
  duree: 2.6,
  reverb: 0.22,
  notes: [
    ...[0, 0.09, 0.18].map((t, i) => note(t, 'machine', [N.C7], 0.05, 0.65 + i * 0.08)),
    note(0.34, 'cloche', [N.A6], 1.4, 0.75),
    note(0.34, 'marimba', [N.A4, N.E5], 0.9, 0.55),
    note(0.34, 'pizz', [N.A2], 0.6, 0.45),
  ],
};

/** Coup de tampon : la semaine est bouclée (ouverture du débriefing). */
const TAMPON: Jingle = {
  id: 'tampon',
  libelle: 'Semaine bouclée',
  quand: 'À l’ouverture du débriefing de la semaine, avec le coup de tampon.',
  duree: 1.4,
  reverb: 0.16,
  notes: [note(0.16, 'tampon', [], 0.3, 1), note(0.16, 'marimba', [N.G4, N.D5], 0.6, 0.35)],
};

export const JINGLES: Record<Cue, Jingle> = {
  'vingt-heures': VINGT_HEURES,
  victoire: VICTOIRE,
  defaite: DEFAITE,
  debat: DEBAT,
  flash: FLASH,
  tampon: TAMPON,
};

/** Fréquence (Hz) d'une note MIDI (la 4 = 69 = 440 Hz). */
export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
