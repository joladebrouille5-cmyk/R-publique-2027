import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// État d'interface uniquement (jamais l'état de partie, qui vient de l'API).

export type ThemeChoice = 'clair' | 'sombre' | 'systeme';

type ThemeState = {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
};

export const useThemeStore = create<ThemeState>()(
  // Par défaut : la nuit de la soirée électorale (thème sombre de l'identité du jeu).
  persist((set) => ({ theme: 'systeme', setTheme: (theme) => set({ theme }) }), {
    name: 'r2027-theme',
  }),
);

export function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function isDark(theme: ThemeChoice): boolean {
  return theme === 'sombre' || (theme === 'systeme' && prefersDark());
}
