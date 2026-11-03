import { Volume2, VolumeX } from 'lucide-react';
import { useSoundStore } from '../stores/son';

/**
 * Bouton « Couper le son » de l'en-tête (phase 19) : toujours visible, il coupe musique et jingles
 * d'un geste (état annoncé par `aria-pressed`). Les réglages fins sont dans Paramètres.
 */
export function SoundToggle() {
  const coupe = useSoundStore((state) => state.coupe);
  const toggleMute = useSoundStore((state) => state.toggleMute);
  const Icon = coupe ? VolumeX : Volume2;
  return (
    <button
      type="button"
      aria-pressed={coupe}
      onClick={toggleMute}
      title={coupe ? 'Son coupé : rétablir le son' : 'Couper le son'}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500 dark:text-slate-300 dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus-visible:outline-dorure"
    >
      <Icon
        aria-hidden="true"
        className={`size-5 ${coupe ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-dorure'}`}
      />
      <span className="sr-only">Couper le son</span>
    </button>
  );
}
