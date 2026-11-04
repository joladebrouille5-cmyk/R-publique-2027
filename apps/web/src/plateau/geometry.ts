import type { Geometry, Position } from 'geojson';
import type { TerritoryCollection } from '../map/data';

// Géométrie du plateau (phase 25) : les départements dessinés en SVG à partir de la topologie
// déjà servie par l'API géo. Projection plane simple (longitude × cos 46,5°) pour la métropole,
// dans un cadre fixe ; chaque département d'outre-mer dans son encart, sur une rangée en dessous.
// Aucune donnée : seules les formes, le moteur et l'API restent la source des valeurs.

export type BoardShape = {
  code: string;
  d: string;
  zone: 'metropole' | 'outre-mer';
  /** Point d'étiquette (pion, numéro) dans le repère du plateau. */
  label: [number, number];
};

/** Repère SVG du plateau : métropole en haut, encarts d'outre-mer en bas. */
export const BOARD_VIEWBOX = [0, 0, 1000, 1180] as const;
const METRO_BOX = { x: 10, y: 10, width: 980, height: 950 };
const INSET_Y = 990;
const INSET_SIZE = { width: 180, height: 170 };
const INSET_GAP = 20;
/** Ordre des encarts, d'ouest en est sur la rangée. */
const INSET_ORDER = ['971', '972', '973', '974', '976'];

const isOverseas = (code: string) => code.startsWith('97');

function rings(geometry: Geometry): Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

function boundsOf(points: Iterable<Position>, cos: number): Bounds {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const [lon, lat] of points) {
    const x = lon! * cos;
    const y = -lat!;
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

/** Projection qui loge des bornes dans un cadre, proportions gardées, centrée. */
function fit(
  bounds: Bounds,
  box: { x: number; y: number; width: number; height: number },
  cos: number,
) {
  const scale = Math.min(
    box.width / (bounds.maxX - bounds.minX || 1),
    box.height / (bounds.maxY - bounds.minY || 1),
  );
  const offsetX = box.x + (box.width - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = box.y + (box.height - (bounds.maxY - bounds.minY) * scale) / 2;
  return ([lon, lat]: Position): [number, number] => [
    offsetX + (lon! * cos - bounds.minX) * scale,
    offsetY + (-lat! - bounds.minY) * scale,
  ];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function pathOf(polygons: Position[][], project: (p: Position) => [number, number]): string {
  return polygons
    .map((ring) => {
      let previous = '';
      const parts: string[] = [];
      for (const point of ring) {
        const [x, y] = project(point);
        const key = `${round1(x)} ${round1(y)}`;
        if (key === previous) continue;
        parts.push(`${parts.length === 0 ? 'M' : 'L'}${key}`);
        previous = key;
      }
      return parts.length > 2 ? `${parts.join('')}Z` : '';
    })
    .join('');
}

/** Centre de gravité du plus grand anneau (point d'étiquette dans le département). */
function labelOf(
  polygons: Position[][],
  project: (p: Position) => [number, number],
): [number, number] {
  let best: { area: number; x: number; y: number } | null = null;
  for (const ring of polygons) {
    const points = ring.map(project);
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i]!;
      const [x1, y1] = points[i + 1]!;
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (Math.abs(area) < 1e-9) continue;
    const candidate = { area: Math.abs(area), x: cx / (3 * area), y: cy / (3 * area) };
    if (!best || candidate.area > best.area) best = candidate;
  }
  if (best) return [round1(best.x), round1(best.y)];
  const [x, y] = project(polygons[0]![0]!);
  return [round1(x), round1(y)];
}

/**
 * Formes du plateau, triées par code : métropole projetée dans son cadre, chaque DROM dans son
 * encart (même projection, latitude propre).
 */
export function boardShapes(collection: TerritoryCollection): BoardShape[] {
  const features = collection.features.filter((f) => f.geometry && f.properties?.code);
  const metro = features.filter((f) => !isOverseas(f.properties.code));
  const metroCos = Math.cos((46.5 * Math.PI) / 180);
  const metroProject = fit(
    boundsOf(
      metro.flatMap((f) => rings(f.geometry).flat()),
      metroCos,
    ),
    METRO_BOX,
    metroCos,
  );
  const shapes: BoardShape[] = metro.map((f) => {
    const polygons = rings(f.geometry);
    return {
      code: f.properties.code,
      d: pathOf(polygons, metroProject),
      zone: 'metropole',
      label: labelOf(polygons, metroProject),
    };
  });
  for (const f of features.filter((x) => isOverseas(x.properties.code))) {
    const code = f.properties.code;
    const slot = Math.max(0, INSET_ORDER.indexOf(code));
    const polygons = rings(f.geometry);
    const points = polygons.flat();
    const meanLat = points.reduce((s, p) => s + p[1]!, 0) / (points.length || 1);
    const cos = Math.cos((meanLat * Math.PI) / 180);
    const project = fit(
      boundsOf(points, cos),
      {
        x: METRO_BOX.x + slot * (INSET_SIZE.width + INSET_GAP) + 10,
        y: INSET_Y,
        width: INSET_SIZE.width - 20,
        height: INSET_SIZE.height - 20,
      },
      cos,
    );
    shapes.push({
      code,
      d: pathOf(polygons, project),
      zone: 'outre-mer',
      label: labelOf(polygons, project),
    });
  }
  return shapes.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** Cadres des encarts d'outre-mer (fond et filet dessinés par le plateau). */
export function insetFrames(): {
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}[] {
  return INSET_ORDER.map((code, slot) => ({
    code,
    x: METRO_BOX.x + slot * (INSET_SIZE.width + INSET_GAP),
    y: INSET_Y - 10,
    width: INSET_SIZE.width,
    height: INSET_SIZE.height,
  }));
}
