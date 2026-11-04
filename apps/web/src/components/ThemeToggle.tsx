import { Moon, Sun, SunMoon } from 'lucide-react';
import { useEffect } from 'react';
import { isDark, useThemeStore, type ThemeChoice } from '../stores/theme';

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'sombre', label: 'Soirée' },
  { value: 'clair', label: 'Clair' },
  { value: 'systeme', label: 'Système' },
];

/** Applique le thème choisi à <html> et suit la préférence du système si demandé. */
export function useApplyTheme() {
  const theme = useThemeStore((state) => state.theme);
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', isDark(theme));
    apply();
    if (theme !== 'systeme' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/**
 * Choix du thème, discret dans l'en-tête : une pastille (lune ou soleil) et le nom du thème ; sur
 * un petit écran, la pastille seule (le sélecteur reste le même, avec son nom accessible).
 * Paramètres propose le même choix.
 */
export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const Icon = theme === 'clair' ? Sun : theme === 'sombre' ? Moon : SunMoon;
  return (
    <label className="relative flex items-center text-sm">
      <span className="sr-only">Thème</span>
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 size-4 text-slate-900 sm:left-3 dark:text-dorure"
      />
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeChoice)}
        className="min-h-11 w-11 cursor-pointer appearance-none rounded-full border border-transparent bg-transparent py-1 text-sm font-semibold text-transparent hover:border-slate-300 sm:w-auto sm:pr-3 sm:pl-9 sm:text-slate-700 sm:dark:text-slate-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:focus-visible:outline-dorure [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
      >
        {CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
