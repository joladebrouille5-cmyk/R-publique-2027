import { useEffect } from 'react';
import { isDark, useThemeStore, type ThemeChoice } from '../stores/theme';

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'clair', label: 'Clair' },
  { value: 'sombre', label: 'Sombre' },
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

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only sm:not-sr-only">Thème</span>
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeChoice)}
        className="min-h-9 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900"
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
