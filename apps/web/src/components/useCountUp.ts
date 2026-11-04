import { useEffect, useState } from 'react';

// Décompte affiché (phase 16) : progression de 0 à 1, pour faire défiler un chiffre jusqu'à sa
// valeur. Pure présentation : la valeur finale est celle servie par l'API, seule lue par les
// lecteurs d'écran. Immédiate sous mouvement réduit, ou là où le navigateur n'anime rien.

const animated = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  typeof window.requestAnimationFrame === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useCountUp(duration = 800, delay = 0): number {
  const [progress, setProgress] = useState(() => (animated() ? 0 : 1));
  useEffect(() => {
    if (!animated()) return;
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      // Sortie amortie : le chiffre ralentit en approchant de sa valeur.
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, delay]);
  return progress;
}
