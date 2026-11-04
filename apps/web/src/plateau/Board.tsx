import type { GameState, Ruleset } from '@r2027/shared';
import type { KeyboardEvent } from 'react';
import { BOARD_VIEWBOX, insetFrames, type BoardShape } from './geometry';
import {
  departmentName,
  hasProjection,
  legendOf,
  paintDepartment,
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

export function Board({
  shapes,
  state,
  ruleset,
  reading,
  selected,
  placed,
  onSelect,
  onDropCard,
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
}) {
  const [x, y, width, height] = BOARD_VIEWBOX;
  const onKey = (code: string) => (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(code);
    }
  };
  const pending = reading !== 'implantation' && !hasProjection(state);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="font-display text-sm font-bold text-encre-carton">
        {CAPTIONS[reading]}
        {pending && (
          <span className="mt-1 block font-sans text-xs font-normal text-encre-carton-2">
            {PROJECTION_PENDING}
          </span>
        )}
      </figcaption>
      <svg
        viewBox={`${x} ${y} ${width} ${height}`}
        role="group"
        aria-label="Plateau : la France des départements"
        className="h-auto w-full touch-manipulation select-none"
      >
        {insetFrames().map((frame) => (
          <rect
            key={frame.code}
            {...frame}
            rx={14}
            className="fill-carton-2/50 stroke-trait/40"
            strokeWidth={2}
            aria-hidden="true"
          />
        ))}
        {shapes.map((shape) => {
          const paint = paintDepartment(state, ruleset, reading, shape.code);
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
      </svg>
      <ul
        aria-label="Légende"
        className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-encre-carton"
      >
        {legendOf(reading).map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-3.5 rounded-sm border border-trait/60 ${item.swatch}`}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
