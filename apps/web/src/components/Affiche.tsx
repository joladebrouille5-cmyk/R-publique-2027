import type { CSSProperties } from 'react';
import type { Portrait } from '../portraits';
import { Avatar } from './Avatar';

// Affiche de campagne (phase 16) : le portrait sur la couleur de la famille politique (convention
// du jeu, pas la couleur officielle d'un parti), le mouvement sur un bandeau, le prénom et le NOM
// en Didone sur le papier. Toutes les mesures sont en em : la taille de police du conteneur
// règle la taille de l'affiche. Jamais de slogan ni de propos : rien n'est prêté au candidat.

const NEUTRAL = { fond: '#5d6886', texte: '#ffffff' };

export function Affiche({
  portrait,
  parti,
  className = '',
  style,
}: {
  portrait: Portrait;
  parti: string;
  className?: string;
  style?: CSSProperties;
}) {
  const color = portrait.famille ?? NEUTRAL;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-affiche bg-papier text-slate-950 shadow-affiche ${className}`}
      style={style}
    >
      <div className="relative aspect-square" style={{ backgroundColor: color.fond }}>
        <Avatar portrait={portrait} size="plein" shape="carre" />
        {/* Reflet du papier glacé. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(155deg,rgb(255_255_255/0.28),transparent_38%)]"
        />
      </div>
      <p
        className="truncate px-[0.6em] py-[0.25em] text-[0.62em] leading-tight font-bold"
        style={{ backgroundColor: color.fond, color: color.texte }}
      >
        {parti}
      </p>
      <p className="px-[0.45em] pt-[0.3em] pb-[0.5em] font-display leading-[0.95]">
        <span className="block truncate text-[0.72em] font-semibold">{portrait.prenom}</span>
        <span className="block truncate text-[1.02em] font-bold uppercase">{portrait.nom}</span>
      </p>
      {/* Pli de l'affiche collée : une lumière qui traverse le papier. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_35%,rgb(255_255_255/0.16)_47%,transparent_58%)] mix-blend-screen"
      />
    </div>
  );
}
