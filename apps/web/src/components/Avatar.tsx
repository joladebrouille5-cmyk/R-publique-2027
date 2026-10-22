import { useState } from 'react';
import { initialsOf, type Portrait } from '../portraits';

const SIZES = {
  xs: 'size-7 text-[0.7rem]',
  sm: 'size-9 text-xs',
  md: 'size-12 text-base',
  lg: 'size-16 text-xl',
  xl: 'size-20 text-2xl',
} as const;

/**
 * Avatar d'un candidat : sa photo libre, ou ses initiales sur la couleur de sa famille
 * politique (aussi quand l'image ne se charge pas). Décoratif : le nom figure toujours à côté.
 */
export function Avatar({
  portrait,
  size = 'md',
  ring = false,
  alt = '',
  className = '',
}: {
  portrait: Portrait;
  size?: keyof typeof SIZES;
  ring?: boolean;
  /** Texte de la photo quand elle porte une information (« Portrait de … ») ; décorative sinon. */
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const color = portrait.famille ?? { fond: '#5d6886', texte: '#ffffff' };
  const frame = `${SIZES[size]} relative inline-flex shrink-0 overflow-hidden rounded-full ${
    ring ? 'ring-2 ring-white shadow-card dark:ring-slate-900' : ''
  } ${className}`;
  if (portrait.photo && !failed) {
    return (
      <span className={frame} data-avatar="photo">
        <img
          src={portrait.photo}
          alt={alt}
          className="size-full bg-slate-200 object-cover object-top dark:bg-slate-700"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={`${frame} items-center justify-center font-display font-bold tracking-tight`}
      style={{ backgroundColor: color.fond, color: color.texte }}
      aria-hidden="true"
      data-avatar="initiales"
    >
      {initialsOf(portrait)}
    </span>
  );
}
