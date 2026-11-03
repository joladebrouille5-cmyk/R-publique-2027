import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Réglages du son (phase 19) : état d'interface seulement, propre à l'appareil, jamais l'état de
// partie. Musique et jingles s'activent et se règlent séparément ; « son coupé » prime sur tout.

export type SoundSettings = {
  /** Tout le son est coupé (bouton de l'en-tête). */
  coupe: boolean;
  musique: boolean;
  /** Volume de la musique, de 0 à 1. */
  volumeMusique: number;
  jingles: boolean;
  /** Volume des jingles, de 0 à 1. */
  volumeJingles: number;
};

export const DEFAULT_SOUND: SoundSettings = {
  coupe: false,
  musique: true,
  volumeMusique: 0.5,
  jingles: true,
  volumeJingles: 0.8,
};

const clamp = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

type SoundStore = SoundSettings & {
  set: (change: Partial<SoundSettings>) => void;
  toggleMute: () => void;
};

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SOUND,
      set: (change) =>
        set((state) => ({
          ...change,
          volumeMusique: clamp(change.volumeMusique ?? state.volumeMusique),
          volumeJingles: clamp(change.volumeJingles ?? state.volumeJingles),
        })),
      toggleMute: () => set((state) => ({ coupe: !state.coupe })),
    }),
    {
      name: 'r2027-son',
      partialize: ({ coupe, musique, volumeMusique, jingles, volumeJingles }) => ({
        coupe,
        musique,
        volumeMusique,
        jingles,
        volumeJingles,
      }),
    },
  ),
);

/** Réglages courants, sans les opérations du magasin. */
export function soundSettings(state: SoundSettings): SoundSettings {
  const { coupe, musique, volumeMusique, jingles, volumeJingles } = state;
  return { coupe, musique, volumeMusique, jingles, volumeJingles };
}

/**
 * Gain appliqué pour un volume réglé : la courbe quadratique suit mieux la perception de
 * l'oreille qu'une échelle linéaire (la moitié du curseur ≈ −12 dB).
 */
export const perceivedGain = (volume: number) => clamp(volume) ** 2;
