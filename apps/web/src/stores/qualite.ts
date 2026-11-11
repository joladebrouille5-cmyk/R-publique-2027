import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { palierInferieur, type ChoixQualite, type Palier } from '../scenes3d/qualite';

// Préférence d'affichage des scènes 3D (phase 26) : état d'interface uniquement. Le choix est
// gardé sur l'appareil ; l'abaissement décidé par la garde d'images par seconde ne vaut que pour
// la session.

type QualiteState = {
  choix: ChoixQualite;
  abaisse: Palier | '2d' | null;
  setChoix: (choix: ChoixQualite) => void;
  /** Images par seconde trop basses au palier donné : palier inférieur, puis repli 2D. */
  abaisser: (depuis: Palier) => void;
};

export const useQualiteStore = create<QualiteState>()(
  persist(
    (set) => ({
      choix: 'auto',
      abaisse: null,
      setChoix: (choix) => set({ choix, abaisse: null }),
      abaisser: (depuis) => set({ abaisse: palierInferieur(depuis) ?? '2d' }),
    }),
    { name: 'r2027-qualite-3d', partialize: (state) => ({ choix: state.choix }) },
  ),
);
