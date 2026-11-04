import { candidateName, type GameState, type Poll, type Ruleset } from '@r2027/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatShare } from '../labels';
import { colorOf } from '../portraits';
import { labelledIds, layoutTrend, type TrendSeries } from './pollTrend';

// Évolution des intentions de vote au premier tour (phase 22), en courbes. Focus + contexte (voir
// docs/superpowers/specs/2026-11-03-refonte-globale-design.md §3) : le joueur et les trois
// premiers à la couleur de leur famille, étiquetés en bout de ligne ; les autres en lignes
// neutres. Une lecture de la vague choisie (survol, flèches) donne toutes les valeurs ; le
// tableau d'évolution reste à côté. Les points sont les valeurs publiées : rien n'est recalculé.

const HEIGHT = 240;
const PADDING = { top: 12, right: 118, bottom: 26, left: 38 };
const MAX_X_LABELS = 6;

type Props = { polls: readonly Poll[]; state: GameState; ruleset: Ruleset | undefined };

/** Largeur de l'élément, suivie au redimensionnement (640 px faute d'observateur). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function PollTrend({ polls, state, ruleset }: Props) {
  const { ref, width } = useWidth();
  const last = polls.at(-1);
  const [cursor, setCursor] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  if (!last || polls.length < 2) return null;

  const playerId = state.player.actorId;
  const fullName = (actorId: string) => {
    const actor = state.actors[actorId];
    return actor ? candidateName(actor.candidate) : actorId;
  };
  const shortName = (actorId: string) =>
    actorId === playerId ? 'vous' : (state.actors[actorId]?.candidate.nom ?? actorId);
  const series: TrendSeries[] = last.results.map((result) => ({
    id: result.actorId,
    label: shortName(result.actorId),
    color: colorOf(state.actors[result.actorId], ruleset),
    player: result.actorId === playerId,
    values: polls.map(
      (poll) => poll.results.find((r) => r.actorId === result.actorId)?.value ?? null,
    ),
  }));
  const emphasized = new Set(labelledIds(series));
  const layout = layoutTrend(series, { width, height: HEIGHT, padding: PADDING });
  const right = width - PADDING.right;
  const bottom = HEIGHT - PADDING.bottom;
  const wave = cursor ?? polls.length - 1;
  const poll = polls[wave]!;
  const ranked = [...poll.results].sort((a, b) => b.value - a.value);
  const leader = [...last.results].sort((a, b) => b.value - a.value)[0]!;
  const mine = last.results.find((r) => r.actorId === playerId);
  // Semaines à l'axe : une sur `xStep`, la dernière toujours, et jamais deux à moins de 30 px.
  const pitch = polls.length > 1 ? (right - PADDING.left) / (polls.length - 1) : Infinity;
  const xStep = Math.max(Math.ceil(polls.length / MAX_X_LABELS), Math.ceil(30 / pitch));
  const xLabels = polls
    .map((_, i) => i)
    .filter((i) => i % xStep === 0 && polls.length - 1 - i >= xStep)
    .concat(polls.length - 1);
  // Marqueurs de vague seulement s'ils ne se touchent pas (8 px chacun, de l'air entre eux).
  const markers = pitch >= 22;

  const summary = `Intentions de vote au premier tour sur ${polls.length} sondages, de la semaine ${polls[0]!.week} à la semaine ${last.week} : en tête ${fullName(leader.actorId)}, ${formatShare(leader.value)}${mine ? ` ; vous : ${formatShare(mine.value)}` : ''}.`;

  const move = (to: number) => setCursor(Math.min(polls.length - 1, Math.max(0, to)));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowLeft: wave - 1,
      ArrowRight: wave + 1,
      Home: 0,
      End: polls.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    move(keys[event.key]!);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const span = right - PADDING.left;
    move(Math.round(((x - PADDING.left) / span) * (polls.length - 1)));
    setActive(true);
  };
  // Couleur de série : la famille du candidat, éclaircie la nuit pour rester lisible sur le fond.
  const tinted = 'stroke-[var(--c)] dark:stroke-[color-mix(in_oklab,var(--c)_55%,white)]';

  return (
    <figure className="space-y-3">
      <div
        ref={ref}
        role="group"
        aria-label="Parcourir les sondages : flèches gauche et droite, Début, Fin"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setActive(false);
          setCursor(null);
        }}
        className="relative touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-republique-600 dark:focus-visible:ring-dorure"
      >
        <svg
          role="img"
          aria-label={summary}
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block max-w-full overflow-visible font-sans text-[11px]"
        >
          {/* Grille : filets d'un pixel, discrets ; graduation tous les 5 points. */}
          {layout.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={right}
                y1={layout.yAt(tick)}
                y2={layout.yAt(tick)}
                className="stroke-filet"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 6}
                y={layout.yAt(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-encre-3 tabular-nums"
              >
                {tick / 100} %
              </text>
            </g>
          ))}
          {polls.map((p, i) =>
            xLabels.includes(i) ? (
              <text
                key={p.id}
                x={layout.xAt(i)}
                y={bottom + 17}
                textAnchor="middle"
                className="fill-encre-3"
              >
                S{p.week}
              </text>
            ) : null,
          )}
          {/* Réticule de la vague lue. */}
          {active && (
            <line
              x1={layout.xAt(wave)}
              x2={layout.xAt(wave)}
              y1={PADDING.top}
              y2={bottom}
              className="stroke-encre-2"
              strokeWidth={1}
            />
          )}
          {/* Contexte d'abord (dessous), puis les séries mises en avant, le joueur au-dessus. */}
          {[...series]
            .sort(
              (a, b) =>
                Number(emphasized.has(a.id)) - Number(emphasized.has(b.id)) ||
                Number(a.player) - Number(b.player),
            )
            .map((s) => {
              const path = layout.paths.find((p) => p.id === s.id)!;
              const strong = emphasized.has(s.id);
              return (
                <g key={s.id} style={{ '--c': s.color } as React.CSSProperties}>
                  <path
                    data-serie={s.id}
                    d={path.d}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={strong ? (s.player ? 3 : 2) : 1.5}
                    className={strong ? tinted : 'stroke-encre-3 opacity-35'}
                  />
                  {strong &&
                    s.values.map((value, i) =>
                      value !== null && (markers || i === s.values.length - 1 || i === wave) ? (
                        <circle
                          key={i}
                          cx={layout.xAt(i)}
                          cy={layout.yAt(value)}
                          r={i === wave && active ? 5 : 4}
                          strokeWidth={2}
                          className={`stroke-papier dark:stroke-slate-900 ${'fill-[var(--c)] dark:fill-[color-mix(in_oklab,var(--c)_55%,white)]'}`}
                        />
                      ) : null,
                    )}
                </g>
              );
            })}
          {/* Étiquettes directes : encre du texte, fil de rappel à la couleur de la série. */}
          {layout.labels.map((label) => {
            const s = series.find((x) => x.id === label.id)!;
            const value = s.values.at(-1);
            return (
              <g key={label.id} style={{ '--c': s.color } as React.CSSProperties}>
                <polyline
                  points={`${right + 4},${label.anchorY} ${right + 10},${label.y} ${right + 14},${label.y}`}
                  fill="none"
                  strokeWidth={1.5}
                  className={tinted}
                />
                <text
                  data-etiquette={label.id}
                  x={right + 17}
                  y={label.y}
                  dy="0.32em"
                  className={`fill-encre ${s.player ? 'font-bold' : ''}`}
                >
                  {s.label}
                  {value !== null && value !== undefined && (
                    <tspan className="fill-encre-2 tabular-nums"> {formatShare(value)}</tspan>
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Lecture de la vague : toutes les valeurs, triées ; annoncée aux lecteurs d'écran. */}
      <div role="status" aria-live="polite" className="text-sm">
        <p className="font-semibold">
          Semaine {poll.week} — {poll.institute}
        </p>
        <ul className="mt-1 grid grid-cols-1 gap-x-4 text-xs min-[480px]:grid-cols-2 sm:text-sm lg:grid-cols-4">
          {ranked.map((result) => (
            <li key={result.actorId} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorOf(state.actors[result.actorId], ruleset) }}
              />
              <span className={result.actorId === playerId ? 'font-semibold' : ''}>
                {fullName(result.actorId)}
              </span>{' '}
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {formatShare(result.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ul aria-label="Légende" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-encre-2">
        {series
          .filter((s) => emphasized.has(s.id))
          .map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1.5"
              style={{ '--c': s.color } as React.CSSProperties}
            >
              <svg aria-hidden="true" width="18" height="6" className="shrink-0">
                <line
                  x1="1"
                  x2="17"
                  y1="3"
                  y2="3"
                  strokeWidth={s.player ? 3 : 2}
                  className={tinted}
                />
              </svg>
              {fullName(s.id)}
              {s.player ? ' (vous)' : ''}
            </li>
          ))}
        {series.some((s) => !emphasized.has(s.id)) && (
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="18" height="6" className="shrink-0">
              <line
                x1="1"
                x2="17"
                y1="3"
                y2="3"
                strokeWidth={1.5}
                className="stroke-encre-3 opacity-50"
              />
            </svg>
            Autres candidats
          </li>
        )}
      </ul>
    </figure>
  );
}
