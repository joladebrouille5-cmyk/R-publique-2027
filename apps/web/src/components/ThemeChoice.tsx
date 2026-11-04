import { useThemeStore, type ThemeChoice as Theme } from '../stores/theme';
import { optionTile, radio } from './ui';

// Choix du thème dans Paramètres (phase 22) : trois tuiles avec une vignette, au lieu d'une
// liste déroulante. Mêmes noms que le sélecteur de l'en-tête (Clair, Soirée, Système).

const OPTIONS: { value: Theme; label: string; detail: string }[] = [
  { value: 'clair', label: 'Clair', detail: 'Encre sur papier' },
  { value: 'sombre', label: 'Soirée', detail: 'Encre de nuit' },
  { value: 'systeme', label: 'Système', detail: 'Suit le téléphone ou l’ordinateur' },
];

/** Vignette : la page du thème en miniature (papier, titre, filets). */
function Vignette({ value }: { value: Theme }) {
  const page = (paper: string, ink: string, accent: string) => (
    <span className="flex h-full flex-1 flex-col gap-1 p-1.5" style={{ backgroundColor: paper }}>
      <span className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: ink }} />
      <span className="h-1 w-full rounded-full opacity-40" style={{ backgroundColor: ink }} />
      <span className="h-1 w-5/6 rounded-full opacity-40" style={{ backgroundColor: ink }} />
      <span className="mt-auto h-2 w-1/2 rounded-sm" style={{ backgroundColor: accent }} />
    </span>
  );
  const day = page('#fbfbfc', '#1b1a3a', '#fada0a');
  const night = page('#100f25', '#f1f2f5', '#ffe53d');
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-20 shrink-0 overflow-hidden rounded-md border border-slate-300 dark:border-white/20"
    >
      {value === 'clair' ? day : value === 'sombre' ? night : [day, night]}
    </span>
  );
}

export function ThemeChoice() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  return (
    <div role="radiogroup" aria-label="Thème" className="grid gap-2.5 sm:grid-cols-3">
      {OPTIONS.map((option) => (
        <label key={option.value} className={`${optionTile} items-center`}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
            className={radio}
          />
          <Vignette value={option.value} />
          <span className="min-w-0">
            <span className="block font-display font-bold [font-stretch:92%]">{option.label}</span>
            <span className="block text-xs text-encre-2">{option.detail}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
