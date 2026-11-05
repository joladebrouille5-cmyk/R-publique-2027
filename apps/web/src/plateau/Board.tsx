import type { GameState, Ruleset } from '@r2027/shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BOARD_VIEWBOX, insetFrames, type BoardShape } from './geometry';
import { localPoll } from './localPoll';
import {
  departmentName,
  hasProjection,
  legendOf,
  paintBoard,
  PROJECTION_PENDING,
  type Reading,
} from './readings';

// Le plateau (phase 25) : la France des départements sur le carton, colorée selon la lecture
// choisie, pions dorés là où des cartes sont posées. Chaque département est un bouton (palier ou
// projection écrits dans son nom) ; l'interface ne calcule rien, elle lit l'état.

const CAPTIONS: Record<Reading, string> = {
  implantation: 'Votre implantation par département',
  'qui-mene': 'Qui mène : projection simulée par département',
  'sondage-local': 'Sondage local : votre score projeté (projection simulée)',
};

const plural = (n: number) => `${n} carte${n > 1 ? 's' : ''} posée${n > 1 ? 's' : ''}`;

/** Taille d'affichage des chiffres de la lecture « Sondage local », en pixels à l'écran. */
const LABEL_PX = 9;
/** Échelle supposée (pixels par unité du plateau) tant que la carte n'est pas mesurée. */
const DEFAULT_SCALE = 0.3;

/** Échelle de la carte à l'écran, suivie au redimensionnement (sans calcul au survol). */
function useBoardScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setScale(width / BOARD_VIEWBOX[2]);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

export function Board({
  shapes,
  state,
  ruleset,
  reading,
  selected,
  placed,
  onSelect,
  onDropCard,
  onHover,
  bubble,
}: {
  shapes: readonly BoardShape[];
  state: GameState;
  ruleset: Ruleset;
  reading: Reading;
  selected: string | null;
  placed: Readonly<Record<string, number>>;
  onSelect: (code: string) => void;
  /** Carte de la main glissée sur un département (le toucher puis la cible reste possible). */
  onDropCard?: ((actionId: string, code: string) => void) | undefined;
  /** Département survolé ou atteint au clavier (aperçu de la carte prise). */
  onHover?: ((code: string | null) => void) | undefined;
  /**
   * Bulle posée au-dessus d'un département : aperçu d'une carte prise (annoncé), ou lecture
   * du département survolé ou touché (déjà écrite dans son nom : non annoncée).
   */
  bubble?: { code: string; content: ReactNode; announce?: boolean } | null | undefined;
}) {
  const anchor = bubble ? shapes.find((s) => s.code === bubble.code) : undefined;
  const [x, y, width, height] = BOARD_VIEWBOX;
  const codes = useMemo(() => shapes.map((shape) => shape.code), [shapes]);
  // Couleurs et libellés de toute la carte, calculés une fois par lecture (pas au survol).
  const paints = useMemo(
    () => paintBoard(state, ruleset, reading, codes),
    [state, ruleset, reading, codes],
  );
  const legend = useMemo(() => legendOf(reading, state, codes), [reading, state, codes]);
  const { ref: frame, scale } = useBoardScale();
  // Phase 25 bis : votre score écrit sur les départements où le chiffre tient.
  const labels = useMemo(() => {
    if (reading !== 'sondage-local') return [];
    const size = LABEL_PX / scale;
    return shapes.flatMap((shape) => {
      const mine = localPoll(state, shape.code)?.player;
      if (!mine || (placed[shape.code] ?? 0) > 0) return [];
      if (shape.size[0] < 1.8 * size || shape.size[1] < 1.4 * size) return [];
      return [
        {
          code: shape.code,
          x: shape.label[0],
          y: shape.label[1],
          size,
          text: String(Math.round(mine.share / 100)),
        },
      ];
    });
  }, [reading, scale, shapes, state, placed]);
  const onKey = (code: string) => (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(code);
    }
  };
  const pending = reading !== 'implantation' && !hasProjection(state);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-bold text-encre-carton">
        <span>{CAPTIONS[reading]}</span>
        {reading !== 'qui-mene' && (
          <span aria-hidden="true" className="inline-flex items-center gap-1.5 font-semibold">
            {reading === 'implantation' ? 'Votre soutien' : 'Votre score'}
            <span className="inline-block h-2.5 w-16 rounded-full border border-trait/40 bg-linear-to-r from-implantation-0 via-implantation-2 to-implantation-4" />
            faible → fort
          </span>
        )}
        {pending && (
          <span className="block w-full font-sans text-xs font-normal text-encre-carton-2">
            {PROJECTION_PENDING}
          </span>
        )}
      </figcaption>
      <div
        ref={frame}
        className="relative mx-auto aspect-[1000/1180] w-full max-w-[max(13rem,calc((100dvh-35rem)*1000/1180))] sm:max-w-[max(15rem,calc((100dvh-38rem)*1000/1180))]"
      >
        <svg
          viewBox={`${x} ${y} ${width} ${height}`}
          role="group"
          aria-label="Plateau : la France des départements"
          className="absolute inset-0 h-full w-full touch-manipulation select-none"
        >
          {insetFrames().map(({ code, ...box }) => (
            // Phase 25 bis : tout l'encart se touche (une île est une cible trop petite au doigt) ;
            // le département reste le bouton nommé pour le clavier et les lecteurs d'écran.
            <rect
              key={code}
              {...box}
              data-code={code}
              rx={14}
              className="cursor-pointer fill-carton-2/50 stroke-trait/40"
              strokeWidth={2}
              aria-hidden="true"
              onClick={() => onSelect(code)}
              onPointerEnter={onHover ? () => onHover(code) : undefined}
              onPointerLeave={onHover ? () => onHover(null) : undefined}
            />
          ))}
          {shapes.map((shape) => {
            const paint = paints.get(shape.code)!;
            const count = placed[shape.code] ?? 0;
            const isSelected = selected === shape.code;
            return (
              <path
                key={shape.code}
                d={shape.d}
                // Couleur par une classe générée (une variable CSS ne vaut rien dans l'attribut `fill`).
                data-fill={paint.fill}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${departmentName(ruleset, shape.code)} : ${paint.text}${count ? `, ${plural(count)}` : ''}`}
                onClick={() => onSelect(shape.code)}
                onKeyDown={onKey(shape.code)}
                onPointerEnter={onHover ? () => onHover(shape.code) : undefined}
                onPointerLeave={onHover ? () => onHover(null) : undefined}
                onFocus={onHover ? () => onHover(shape.code) : undefined}
                onBlur={onHover ? () => onHover(null) : undefined}
                style={paint.fillClass ? undefined : { fill: paint.fill }}
                onDragOver={onDropCard ? (event) => event.preventDefault() : undefined}
                onDrop={
                  onDropCard
                    ? (event) => {
                        event.preventDefault();
                        const actionId = event.dataTransfer.getData('text/x-r2027-carte');
                        if (actionId) onDropCard(actionId, shape.code);
                      }
                    : undefined
                }
                className={`${paint.fillClass} cursor-pointer stroke-trait outline-none transition-[stroke-width] duration-150 hover:brightness-95 focus-visible:stroke-or ${isSelected ? 'stroke-[4]' : 'stroke-[1.2]'}`}
                strokeLinejoin="round"
              />
            );
          })}
          {shapes
            .filter((shape) => (placed[shape.code] ?? 0) > 0)
            .map((shape) => (
              <g key={`pion-${shape.code}`} aria-hidden="true" className="pointer-events-none">
                <circle
                  cx={shape.label[0]}
                  cy={shape.label[1]}
                  r={15}
                  className="fill-or stroke-sur-or"
                  strokeWidth={2}
                />
                <text
                  x={shape.label[0]}
                  y={shape.label[1] + 6}
                  textAnchor="middle"
                  className="fill-sur-or font-display text-[17px] font-extrabold"
                >
                  {placed[shape.code]}
                </text>
              </g>
            ))}
          {labels.length > 0 && (
            <g data-etiquettes="sondage-local" aria-hidden="true" className="pointer-events-none">
              {labels.map((label) => (
                <text
                  key={label.code}
                  x={label.x}
                  y={label.y + label.size * 0.35}
                  textAnchor="middle"
                  // Encre sur un liseré de carton : lisible sur les cinq teintes.
                  className="fill-encre-carton stroke-carton font-display font-extrabold [paint-order:stroke]"
                  style={{ fontSize: label.size, strokeWidth: label.size * 0.3 }}
                >
                  {label.text}
                </text>
              ))}
            </g>
          )}
        </svg>
        {bubble && anchor && (
          <div
            {...(bubble.announce === false ? { 'aria-hidden': true } : { role: 'status' })}
            // Ancrée sur le département, la bulle reste dans le cadre : alignée à gauche, au
            // centre ou à droite selon le tiers de la carte où il se trouve ; dessous s'il est
            // trop haut.
            className={`pointer-events-none absolute z-10 w-max max-w-[min(15rem,90%)] animate-apparait rounded-xl border-2 border-or bg-feutrine-3 px-3 py-2 text-xs text-craie shadow-pion ${
              anchor.label[0] < width / 3
                ? '-translate-x-4'
                : anchor.label[0] > (2 * width) / 3
                  ? 'translate-x-[calc(-100%+1rem)]'
                  : '-translate-x-1/2'
            } ${anchor.label[1] < height / 4 ? 'translate-y-5' : '-translate-y-[calc(100%+0.6rem)]'}`}
            style={{
              left: `${(anchor.label[0] / width) * 100}%`,
              top: `${(anchor.label[1] / height) * 100}%`,
            }}
          >
            {bubble.content}
          </div>
        )}
      </div>
      {reading === 'sondage-local' && labels.length > 0 && (
        <p className="text-[0.68rem] text-encre-carton-2">
          Chiffres : votre score projeté, arrondi, en % (détail au toucher d’un département).
        </p>
      )}
      <ul
        aria-label="Légende"
        className="flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-encre-carton-2"
      >
        {legend.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-2.5 rounded-sm border border-trait/60 ${item.swatch}`}
              style={item.swatch ? undefined : { backgroundColor: item.fill }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
