import type { Alignment, AssemblyGroup } from '@r2027/shared';
import { useId } from 'react';

// Hémicycle de l'Assemblée nationale (phase 6, refondu en phase 13) : un point par siège,
// groupes rangés de gauche à droite sur un axe synthétique (moyenne des deux axes de position,
// convention du jeu), séparés par un intervalle. Couleurs des groupes : convention du jeu, pas
// des couleurs officielles (rouge LFI-NFP, rose socialiste, vert écologiste, jaunes du centre,
// bleu de la droite, bleu marine du RN…), vérifiées en vision normale et pour les daltonismes.
// La couleur n'est jamais seule : sigle des grands groupes sur l'arc, légende chiffrée,
// infobulle par siège et tableau des groupes. Les sièges du groupe du joueur portent un liseré
// lumineux ; la fronde de fond de la majorité est dessinée en sièges évidés.

export type HemicycleGroup = {
  id: string;
  sigle: string;
  libelle: string;
  sieges: number;
  alignement: Alignment;
  /** Frondeurs de fond du groupe (nombres, aucun nom). */
  fronde?: number;
};

/** Couleur de chaque groupe (convention du jeu), en thème clair et en thème sombre. */
export const GROUP_COLORS: Record<string, { fill: string; swatch: string }> = {
  'lfi-nfp': {
    fill: 'fill-[#cc1f2f] dark:fill-[#e0384a]',
    swatch: 'bg-[#cc1f2f] dark:bg-[#e0384a]',
  },
  gdr: { fill: 'fill-[#7d1428] dark:fill-[#c23d57]', swatch: 'bg-[#7d1428] dark:bg-[#c23d57]' },
  ecos: { fill: 'fill-[#3aa655] dark:fill-[#5cd27c]', swatch: 'bg-[#3aa655] dark:bg-[#5cd27c]' },
  soc: { fill: 'fill-[#e8559a] dark:fill-[#f57ab2]', swatch: 'bg-[#e8559a] dark:bg-[#f57ab2]' },
  liot: { fill: 'fill-[#4b5868] dark:fill-[#5f6d85]', swatch: 'bg-[#4b5868] dark:bg-[#5f6d85]' },
  ni: { fill: 'fill-[#c3c8d1] dark:fill-[#a3aab6]', swatch: 'bg-[#c3c8d1] dark:bg-[#a3aab6]' },
  dem: { fill: 'fill-[#f39200] dark:fill-[#f27a12]', swatch: 'bg-[#f39200] dark:bg-[#f27a12]' },
  epr: { fill: 'fill-[#ffd200] dark:fill-[#ffe14d]', swatch: 'bg-[#ffd200] dark:bg-[#ffe14d]' },
  hor: { fill: 'fill-[#8c6d00] dark:fill-[#c79a1a]', swatch: 'bg-[#8c6d00] dark:bg-[#c79a1a]' },
  rn: { fill: 'fill-[#13235b] dark:fill-[#4a5fc0]', swatch: 'bg-[#13235b] dark:bg-[#4a5fc0]' },
  dr: { fill: 'fill-[#2a7de1] dark:fill-[#56a0ff]', swatch: 'bg-[#2a7de1] dark:bg-[#56a0ff]' },
  udr: { fill: 'fill-[#5a2d91] dark:fill-[#7b4fd0]', swatch: 'bg-[#5a2d91] dark:bg-[#7b4fd0]' },
};
const FALLBACK = { fill: 'fill-slate-500', swatch: 'bg-slate-500' };
const VACANT = 'fill-slate-200 dark:fill-slate-700';
/** Opacité des autres sièges quand un groupe interpelle le gouvernement (phase 15). */
const DIMMED = 0.28;
export const colorOf = (id: string) => GROUP_COLORS[id] ?? FALLBACK;

/** Rang de l'hémicycle (convention du jeu) : moyenne des deux axes, puis axe économique. */
export function seatingOrder<T extends Pick<AssemblyGroup, 'id' | 'position'>>(
  groups: readonly T[],
): T[] {
  const axis = (g: T) => (g.position.economie + g.position.societe) / 2;
  return [...groups].sort(
    (a, b) =>
      axis(a) - axis(b) || a.position.economie - b.position.economie || a.id.localeCompare(b.id),
  );
}

const LABELS: Record<Alignment, string> = {
  soutien: 'soutien du président',
  independant: 'non aligné',
  opposition: 'opposition',
};

const WIDTH = 400;
const HEIGHT = 212;
const CENTER = { x: WIDTH / 2, y: HEIGHT - 6 };
const OUTER = 186;
const INNER = 74;

/** Rangs de l'hémicycle : nombre de places par rang, proportionnel au rayon (plus fort reste). */
function rows(total: number) {
  const count = Math.max(1, Math.round(Math.sqrt(total / 4.5)));
  const radii = Array.from(
    { length: count },
    (_, i) => INNER + ((OUTER - INNER) * i) / Math.max(1, count - 1),
  );
  const sum = radii.reduce((a, b) => a + b, 0);
  const exact = radii.map((r) => (total * r) / sum);
  const seats = exact.map(Math.floor);
  let rest = total - seats.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  for (const { i } of order) {
    if (rest-- <= 0) break;
    seats[i]! += 1;
  }
  return radii.map((radius, i) => ({ radius, seats: seats[i]! }));
}

/** Positions des places, de la gauche (angle π) vers la droite (angle 0). */
function seatPositions(total: number) {
  const positions: { x: number; y: number; angle: number }[] = [];
  for (const { radius, seats } of rows(total)) {
    for (let k = 0; k < seats; k++) {
      const angle = seats === 1 ? Math.PI / 2 : Math.PI * (1 - k / (seats - 1));
      positions.push({
        x: CENTER.x + radius * Math.cos(angle),
        y: CENTER.y - radius * Math.sin(angle),
        angle,
      });
    }
  }
  return positions.sort((a, b) => b.angle - a.angle);
}

/** Place d'un siège : un groupe (et l'état de ce siège), un intervalle ou un siège vacant. */
type Slot =
  | { kind: 'groupe'; group: HemicycleGroup; frondeur: boolean }
  | { kind: 'intervalle' }
  | { kind: 'vacant' };

export function Hemicycle({
  groups,
  total,
  title,
  playerGroup = null,
  playerConvention = false,
  speaker = null,
}: {
  /** Groupes, de la gauche vers la droite (`seatingOrder`). */
  groups: HemicycleGroup[];
  /** Nombre total de sièges (pourvus et vacants). */
  total: number;
  title: string;
  /** Groupe du joueur (liseré lumineux), ou null. */
  playerGroup?: string | null;
  /** Groupe du joueur déduit de son positionnement (convention du jeu, signalée). */
  playerConvention?: boolean;
  /** Groupe qui interpelle le gouvernement (questions au gouvernement, phase 15), ou null. */
  speaker?: string | null;
}) {
  const glow = useId().replace(/:/g, '');
  const seated = groups.filter((g) => g.sieges > 0);
  // Un intervalle entre deux groupes voisins ; les sièges vacants à l'extrémité droite.
  const slots: Slot[] = [];
  seated.forEach((group, i) => {
    if (i > 0) slots.push({ kind: 'intervalle' });
    const rebels = Math.min(group.sieges, group.fronde ?? 0);
    for (let k = 0; k < group.sieges; k++)
      slots.push({ kind: 'groupe', group, frondeur: k >= group.sieges - rebels });
  });
  const filled = seated.reduce((sum, g) => sum + g.sieges, 0);
  for (let k = filled; k < total; k++) slots.push({ kind: 'vacant' });
  const positions = seatPositions(slots.length);
  // Rayon des points : 40 % de l'écart entre deux places voisines (un liseré reste visible).
  const layout = rows(slots.length);
  const radial = (OUTER - INNER) / Math.max(1, layout.length - 1);
  const arc = (Math.PI * layout.reduce((sum, r) => sum + r.radius, 0)) / Math.max(1, slots.length);
  const dot = 0.4 * Math.min(radial, arc);
  const supporters = groups
    .filter((g) => g.alignement === 'soutien')
    .reduce((s, g) => s + g.sieges, 0);
  const player = groups.find((g) => g.id === playerGroup);
  const speaking = groups.find((g) => g.id === speaker);
  const rebels = groups.reduce((s, g) => s + Math.min(g.sieges, g.fronde ?? 0), 0);

  // Sigle des groupes assez nombreux, au milieu de leur arc, à l'extérieur de l'hémicycle.
  const labels = seated
    .filter((g) => g.sieges / Math.max(1, total) >= 0.05)
    .map((g) => {
      const indices = slots.flatMap((s, i) => (s.kind === 'groupe' && s.group === g ? [i] : []));
      const angles = indices.map((i) => positions[i]!.angle);
      const angle = (Math.max(...angles) + Math.min(...angles)) / 2;
      const r = OUTER + 12;
      return {
        id: g.id,
        sigle: g.sigle,
        x: CENTER.x + r * Math.cos(angle),
        y: CENTER.y - r * Math.sin(angle),
        anchor: (Math.cos(angle) > 0.3 ? 'start' : Math.cos(angle) < -0.3 ? 'end' : 'middle') as
          'start' | 'end' | 'middle',
      };
    });

  const description = `${title} : ${seated.map((g) => `${g.sigle} ${g.sieges}`).join(', ')}${
    total > filled ? `, ${total - filled} vacants` : ''
  }. Soutiens du président ${supporters}.${
    player ? ` Votre groupe : ${player.sigle} (${player.sieges} sièges).` : ''
  }${rebels > 0 ? ` Frondeurs de la majorité : ${rebels}.` : ''}${
    speaking ? ` Le groupe ${speaking.sigle} interpelle le gouvernement.` : ''
  }`;

  return (
    <figure className="space-y-3">
      <svg
        viewBox={`-26 -16 ${WIDTH + 52} ${HEIGHT + 20}`}
        className="mx-auto block w-full max-w-xl"
        role="img"
        aria-label={description}
      >
        <defs>
          <filter id={glow} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        {positions.map((p, i) => {
          const slot = slots[i]!;
          if (slot.kind === 'intervalle') return null;
          if (slot.kind === 'vacant')
            return (
              <circle
                key={i}
                data-siege=""
                cx={p.x.toFixed(2)}
                cy={p.y.toFixed(2)}
                r={dot.toFixed(2)}
                opacity={speaking ? DIMMED : undefined}
                className={VACANT}
              >
                <title>Siège vacant</title>
              </circle>
            );
          const { group, frondeur } = slot;
          const mine = group.id === playerGroup;
          const asking = group.id === speaker;
          return (
            <g
              key={i}
              data-groupe={group.id}
              data-joueur={mine ? '' : undefined}
              data-interpelle={asking ? '' : undefined}
              opacity={speaking && !asking ? DIMMED : undefined}
            >
              {asking && (
                <circle
                  cx={p.x.toFixed(2)}
                  cy={p.y.toFixed(2)}
                  r={(dot * 1.22).toFixed(2)}
                  className="fill-none stroke-amber-500 stroke-[0.6] dark:stroke-amber-300"
                />
              )}
              {mine && (
                <circle
                  cx={p.x.toFixed(2)}
                  cy={p.y.toFixed(2)}
                  r={(dot * 1.75).toFixed(2)}
                  className="fill-cyan-400/80 dark:fill-cyan-300/80"
                  filter={`url(#${glow})`}
                />
              )}
              <circle
                data-siege=""
                cx={p.x.toFixed(2)}
                cy={p.y.toFixed(2)}
                r={dot.toFixed(2)}
                fillOpacity={frondeur ? 0.3 : undefined}
                className={`${colorOf(group.id).fill} ${
                  frondeur
                    ? 'stroke-current stroke-[1.2] text-slate-700 dark:text-slate-200'
                    : mine
                      ? 'stroke-white stroke-[0.9] dark:stroke-slate-950'
                      : 'stroke-slate-950/15 stroke-[0.5] dark:stroke-white/10'
                }`}
              >
                <title>
                  {`${group.sigle} — ${LABELS[group.alignement]}${frondeur ? ' — frondeur (fronde de fond)' : ''}${mine ? ' — votre groupe' : ''}`}
                </title>
              </circle>
            </g>
          );
        })}
        {labels.map((l) => (
          <text
            key={l.id}
            x={l.x.toFixed(1)}
            y={l.y.toFixed(1)}
            textAnchor={l.anchor}
            dominantBaseline="middle"
            className="fill-slate-600 text-[9px] font-semibold dark:fill-slate-300"
            aria-hidden="true"
          >
            {l.sigle}
          </text>
        ))}
      </svg>
      <figcaption className="space-y-2">
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs">
          {seated.map((g) => (
            <li
              key={g.id}
              className={`flex items-center gap-1.5 rounded-full px-1.5 py-0.5 ${
                g.id === playerGroup
                  ? 'bg-cyan-50 ring-2 ring-cyan-400 dark:bg-cyan-950/40 dark:ring-cyan-300'
                  : g.id === speaker
                    ? 'bg-amber-50 ring-2 ring-amber-400 dark:bg-amber-950/40 dark:ring-amber-300'
                    : ''
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block size-2.5 shrink-0 rounded-full ${colorOf(g.id).swatch}`}
              />
              <span>
                <span className="font-semibold">{g.sigle}</span>{' '}
                <span className="tabular-nums">{g.sieges}</span>
                {g.id === playerGroup && (
                  <span className="font-semibold text-cyan-800 dark:text-cyan-200">
                    {' '}
                    · votre groupe{playerConvention ? ' (convention du jeu)' : ''}
                  </span>
                )}
                {g.id === speaker && (
                  <span className="font-semibold text-amber-800 dark:text-amber-200">
                    {' '}
                    · interpelle le gouvernement
                  </span>
                )}
              </span>
            </li>
          ))}
          {total > filled && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 rounded-full bg-slate-200 dark:bg-slate-700"
              />
              Vacants <span className="tabular-nums">{total - filled}</span>
            </li>
          )}
        </ul>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Couleurs des groupes : convention du jeu, pas des couleurs officielles. Groupes rangés de
          gauche à droite selon leur position (moyenne des deux axes).
          {rebels > 0 &&
            ` Sièges évidés : ${rebels} frondeur(s) de la majorité (nombre simulé, aucun nom).`}
        </p>
      </figcaption>
    </figure>
  );
}
