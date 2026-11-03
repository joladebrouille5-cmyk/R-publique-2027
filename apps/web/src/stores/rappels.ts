import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Rappel quotidien du défi du jour (phase 20) : réglage propre à l'appareil, désactivé par
// défaut ; la notification elle-même est programmée par la plateforme (application Android).

export const REMINDER_HOURS = [8, 10, 12, 14, 16, 18, 19, 20, 21] as const;

type RappelsState = {
  actif: boolean;
  heure: number;
  setActif: (actif: boolean) => void;
  setHeure: (heure: number) => void;
};

export const useRappels = create<RappelsState>()(
  persist(
    (set) => ({
      actif: false,
      heure: 18,
      setActif: (actif) => set({ actif }),
      setHeure: (heure) => set({ heure }),
    }),
    { name: 'r2027-rappels' },
  ),
);
