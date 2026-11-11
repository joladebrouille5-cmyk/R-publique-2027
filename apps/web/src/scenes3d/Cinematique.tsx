import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDecision3D } from './appareil';

// Scène de transition plein écran (phase 26) : ralliement, investiture, meeting. Elle se saute au
// toucher (ou au clavier) et se referme d'elle-même à la fin ; sans 3D ou en mouvement réduit,
// c'est un écran statique qui attend « Continuer ». Le titre et les textes sont en HTML, par-dessus.

export function Cinematique({
  titre,
  sousTitre,
  note,
  dureeMs,
  onFin,
  children,
}: {
  titre: string;
  sousTitre?: string | undefined;
  /** Mention discrète (simulation, mise en scène). */
  note?: string | undefined;
  /** Durée de la scène animée ; l'écran statique, lui, attend le joueur. */
  dureeMs: number;
  onFin: () => void;
  /** La scène (avec son repli statique), en fond. */
  children: ReactNode;
}) {
  const anime = useDecision3D().mode === '3d';
  const bouton = useRef<HTMLButtonElement>(null);
  const fin = useRef(onFin);
  useEffect(() => {
    fin.current = onFin;
  }, [onFin]);
  useEffect(() => {
    bouton.current?.focus();
    if (!anime) return;
    const timer = window.setTimeout(() => fin.current(), dureeMs);
    return () => window.clearTimeout(timer);
  }, [anime, dureeMs]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      data-cinematique={anime ? 'animee' : 'statique'}
      className="fixed inset-0 z-[90] flex animate-apparait flex-col justify-end bg-[#060a18] text-white"
      onClick={onFin}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onFin();
      }}
    >
      <div className="absolute inset-0">{children}</div>
      <div className="pointer-events-none relative space-y-2 bg-linear-to-t from-black/85 via-black/55 to-transparent px-5 pt-24 pb-[calc(1.5rem+var(--sab))] text-center">
        <h2 className="font-display text-3xl leading-tight font-extrabold text-balance sm:text-5xl">
          {titre}
        </h2>
        {sousTitre && <p className="mx-auto max-w-prose text-base text-white/90">{sousTitre}</p>}
        {note && <p className="mx-auto max-w-prose text-xs text-white/70">{note}</p>}
        <button
          ref={bouton}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onFin();
          }}
          className="pointer-events-auto mt-2 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-white/80 px-6 text-sm font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-or"
        >
          {anime ? 'Passer' : 'Continuer'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Fond statique d'une transition : deux aplats aux couleurs données, sans mouvement. */
export function FondStatique({ couleurs }: { couleurs: readonly string[] }) {
  return (
    <div
      aria-hidden="true"
      className="h-full w-full"
      style={{
        background: `linear-gradient(115deg, ${couleurs
          .map(
            (c, i) => `${c} ${(i * 100) / couleurs.length}% ${((i + 1) * 100) / couleurs.length}%`,
          )
          .join(', ')})`,
        opacity: 0.55,
      }}
    />
  );
}

/** Deux tableaux d'une même transition : le second remplace le premier après `apresMs`. */
export function Sequence({
  premier,
  second,
  apresMs,
}: {
  premier: ReactNode;
  second: ReactNode | null;
  apresMs: number;
}) {
  const anime = useDecision3D().mode === '3d';
  const [suite, setSuite] = useState(false);
  useEffect(() => {
    if (!anime || !second) return;
    const timer = window.setTimeout(() => setSuite(true), apresMs);
    return () => window.clearTimeout(timer);
  }, [anime, second, apresMs]);
  return <>{suite && second ? second : premier}</>;
}
