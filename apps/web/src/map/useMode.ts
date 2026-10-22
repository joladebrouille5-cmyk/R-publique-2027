import { useEffect, useState } from 'react';
import { useThemeStore } from '../stores/theme';
import type { Mode } from './colors';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Thème des cartes : choix de l'utilisateur, ou préférence du système suivie en direct. */
export function useMode(): Mode {
  const theme = useThemeStore((s) => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return theme === 'sombre' || (theme === 'systeme' && systemDark) ? 'dark' : 'light';
}
