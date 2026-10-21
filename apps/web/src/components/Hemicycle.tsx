import type { Alignment } from '@r2027/shared';

// Hémicycle de l'Assemblée nationale (phase 6, P6-09) : un point par siège, groupes rangés de
// gauche à droite selon leur position économique, couleur selon la position du groupe à l'égard
// du président (trois teintes catégorielles de la palette de référence validée, les mêmes que
// la carte). La couleur n'est jamais seule : légende chiffrée, infobulle par siège et tableau
// des groupes juste en dessous.

export type HemicycleGroup = {
  id: string;
  sigle: string;
  libelle: string;
  sieges: number;
  alignement: Alignment;
};

const FILLS: Record<Alignment | 'vacant', string> = {
  soutien: 'fill-[#2a78d6] dark:fill-[#3987e5]',
  opposition: 'fill-[#eb6834] dark:fill-[#d95926]',
  independant: 'fill-[#1baf7a] dark:fill-[#199e70]',
  vacant: 'fill-slate-300 dark:fill-slate-600',
};
const LABELS: Record<Alignment | 'vacant', string> = {
  soutien: 'Soutiens du président',
  independant: 'Non alignés',
  opposition: 'Opposition',
  vacant: 'Sièges vacants',
};
const ORDER = ['soutien', 'independant', 'opposition', 'vacant'] as const;

const WIDTH = 400;
const HEIGHT = 212;
const CENTER = { x: WIDTH / 2, y: HEIGHT - 6 };
const OUTER = 194;
const INNER = 78;

/** Rangs de l'hémicycle : nombre de sièges par rang, proportionnel au rayon (plus fort reste). */
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

/** Positions des sièges, de la gauche (angle π) vers la droite (angle 0). */
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

export function Hemicycle({
  groups,
  total,
  title,
}: {
  /** Groupes, de la gauche vers la droite. */
  groups: HemicycleGroup[];
  /** Nombre total de sièges (pourvus et vacants). */
  total: number;
  title: string;
}) {
  const seats = groups.flatMap((g) => Array.from({ length: g.sieges }, () => g));
  const vacant = Math.max(0, total - seats.length);
  const positions = seatPositions(seats.length + vacant);
  const counts = { soutien: 0, independant: 0, opposition: 0, vacant };
  for (const g of groups) counts[g.alignement] += g.sieges;
  // Rayon des points : 40 % de l'écart entre deux sièges voisins (un liseré reste visible).
  const layout = rows(total);
  const radial = (OUTER - INNER) / Math.max(1, layout.length - 1);
  const arc = (Math.PI * layout.reduce((sum, r) => sum + r.radius, 0)) / Math.max(1, total);
  const dot = 0.4 * Math.min(radial, arc);
  // Les sièges vacants occupent l'extrémité droite, après les groupes.
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mx-auto block w-full max-w-xl"
        role="img"
        aria-label={`${title} : ${ORDER.filter((k) => counts[k] > 0)
          .map((k) => `${LABELS[k]} ${counts[k]}`)
          .join(', ')}.`}
      >
        {positions.map((p, i) => {
          const group = seats[i];
          const kind = group ? group.alignement : 'vacant';
          return (
            <circle
              key={i}
              cx={p.x.toFixed(2)}
              cy={p.y.toFixed(2)}
              r={dot.toFixed(2)}
              className={FILLS[kind]}
            >
              <title>{group ? `${group.sigle} — ${LABELS[kind]}` : LABELS.vacant}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
          {ORDER.filter((k) => counts[k] > 0).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true" className="shrink-0">
                <circle cx="5" cy="5" r="5" className={FILLS[k]} />
              </svg>
              <span>
                {LABELS[k]} : <span className="font-semibold tabular-nums">{counts[k]}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
          Groupes rangés de gauche à droite selon leur position économique ; détail dans le tableau.
        </p>
      </figcaption>
    </figure>
  );
}
