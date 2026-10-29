import type { Ruleset } from '@r2027/shared';
import { useRef, type PointerEvent } from 'react';
import { familyOf } from '../../portraits';

// Boussole politique (phase 16) : les deux axes du positionnement, les groupes d'électeurs du
// jeu de règles (hypothèse de jeu, taille selon leur poids) et le candidat du joueur, pastille
// dorée. Un toucher ou un clic place le candidat ; les deux curseurs restent le contrôle
// accessible au clavier et aux lecteurs d'écran (la boussole n'en est qu'un raccourci visuel).

const STEP = 5;
const snap = (value: number) => Math.max(-100, Math.min(100, Math.round(value / STEP) * STEP));

export function Compass({
  economie,
  societe,
  ruleset,
  onChange,
}: {
  economie: number;
  societe: number;
  ruleset: Ruleset | undefined;
  onChange: (economie: number, societe: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const place = (event: PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    onChange(
      snap(((event.clientX - box.left) / box.width) * 200 - 100),
      snap(100 - ((event.clientY - box.top) / box.height) * 200),
    );
  };
  const groups = ruleset?.electorat.groupes ?? [];
  const caption = 'text-[0.7rem] font-semibold text-slate-600 dark:text-slate-400';
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-1.5">
      <span aria-hidden="true" className={`col-start-2 text-center ${caption}`}>
        conservateur
      </span>
      <span
        aria-hidden="true"
        className={`row-start-2 [writing-mode:vertical-rl] rotate-180 ${caption}`}
      >
        gauche
      </span>
      <svg
        ref={ref}
        viewBox="-100 -100 200 200"
        aria-hidden="true"
        focusable="false"
        className="row-start-2 aspect-square w-full cursor-crosshair touch-none rounded-xl bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-950/60 dark:ring-white/10"
        onPointerDown={(event) => {
          place(event);
          // Le glisser continue hors de la boussole (capture refusée : le toucher seul compte).
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* capture indisponible */
          }
        }}
        onPointerMove={(event) => {
          if (event.buttons) place(event);
        }}
      >
        {/* Quadrillage tous les 50 points, axes au centre. */}
        {[-50, 50].map((v) => (
          <g key={v} className="stroke-slate-200 dark:stroke-white/[0.06]" strokeWidth="0.8">
            <line x1={v} y1="-100" x2={v} y2="100" />
            <line x1="-100" y1={v} x2="100" y2={v} />
          </g>
        ))}
        <g className="stroke-slate-300 dark:stroke-white/15" strokeWidth="1.1">
          <line x1="0" y1="-100" x2="0" y2="100" />
          <line x1="-100" y1="0" x2="100" y2="0" />
        </g>
        {groups.map((group) => {
          const color = familyOf(group.position, ruleset)?.fond ?? '#5d6886';
          return (
            <circle
              key={group.id}
              cx={group.position.economie}
              cy={-group.position.societe}
              r={4 + group.part * 34}
              fill={color}
              fillOpacity="0.45"
              stroke={color}
              strokeOpacity="0.85"
              strokeWidth="0.8"
            />
          );
        })}
        <g
          style={{ transform: `translate(${economie}px, ${-societe}px)` }}
          className="transition-transform duration-300 ease-sortie"
        >
          <circle r="13" className="fill-or-400/25 dark:fill-dorure/20" />
          <circle
            r="6.5"
            className="fill-or-500 stroke-white dark:fill-dorure dark:stroke-slate-950"
            strokeWidth="2"
          />
        </g>
      </svg>
      <span aria-hidden="true" className={`row-start-2 [writing-mode:vertical-rl] ${caption}`}>
        droite
      </span>
      <span aria-hidden="true" className={`col-start-2 row-start-3 text-center ${caption}`}>
        progressiste
      </span>
    </div>
  );
}
