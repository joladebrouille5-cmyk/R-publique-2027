import {
  GeoManifestSchema,
  type CommuneIndexEntry,
  type DataImport,
  type GeoManifest,
} from '@r2027/shared';
import type { Position } from 'geojson';
import mapshaper from 'mapshaper';
import type { Cog } from '../cog/cog';
import { checkCoverage } from '../geometry/coverage';
import type { GpkgFeature } from '../geometry/gpkg';

export const IMPORTER_VERSION = 'geo-1.0.0';

/** Collectivités d'outre-mer dont les électeurs votent à la présidentielle (liste « Hors carte »). */
export const OFF_MAP_COMER = ['975', '977', '978', '986', '987', '988'] as const;

export type GeoBuildInput = {
  millesime: string;
  cog: Cog;
  /** Entités de la table `commune` d'ADMIN EXPRESS (code_insee, population, géométrie). */
  communes: readonly GpkgFeature[];
  sources: DataImport[];
  /** Tolérance de simplification, en mètres : communes (par département) et aperçu national. */
  intervals: { communes: number; apercu: number };
  /** Départements retenus (jeu de démonstration) ; tous si absent. La validation reste complète. */
  departements?: ReadonlySet<string>;
};

export type GeoBuildOutput = { manifest: GeoManifest; files: Map<string, string> };

type BBox = [number, number, number, number];
const round = (value: number) => Math.round(value * 1e4) / 1e4;

function bboxOf(rings: Position[][][]): BBox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of rings) {
    for (const [x, y] of polygon[0] ?? []) {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    }
  }
  return [round(w), round(s), round(e), round(n)];
}

function union(boxes: readonly BBox[]): BBox {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function run(commands: string, input: string): Promise<Record<string, string>> {
  const output = (await mapshaper.applyCommands(commands, { 'communes.json': input })) as Record<
    string,
    string | Uint8Array
  >;
  return Object.fromEntries(
    Object.entries(output).map(([name, content]) => [
      name,
      typeof content === 'string' ? content : Buffer.from(content).toString('utf8'),
    ]),
  );
}

/**
 * Construit le référentiel cartographique : validation stricte COG ⇄ géométries, communes
 * simplifiées par département (TopoJSON), aperçu national des départements et régions obtenus
 * par fusion des communes (emboîtement exact), index de recherche et manifeste.
 */
export async function buildGeo(input: GeoBuildInput): Promise<GeoBuildOutput> {
  const { cog } = input;
  const byCode = new Map(cog.communes.map((c) => [c.code, c]));
  const comer = new Set<string>(OFF_MAP_COMER);
  checkCoverage(
    cog.communes.map((c) => c.code),
    input.communes.map((f) => String(f.properties.code_insee)),
    (code) => comer.has(code.slice(0, 3)),
  );

  const kept = input.communes
    .map((feature) => ({ feature, commune: byCode.get(String(feature.properties.code_insee)) }))
    .filter(
      (x): x is { feature: GpkgFeature; commune: NonNullable<typeof x.commune> } =>
        x.commune !== undefined,
    )
    .sort((a, b) => compare(a.commune.code, b.commune.code));

  const boxes = new Map<string, BBox>();
  const features = kept.map(({ feature, commune }) => {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    boxes.set(commune.code, bboxOf(polygons));
    const population = feature.properties.population;
    return {
      type: 'Feature',
      properties: {
        code: commune.code,
        nom: commune.nom,
        dep: commune.departement,
        reg: commune.region,
        population: typeof population === 'number' ? population : null,
      },
      geometry: feature.geometry,
    };
  });
  const all = JSON.stringify({ type: 'FeatureCollection', features });

  // Aperçu national : départements et régions fusionnés à partir des communes simplifiées.
  const overview = await run(
    `-i communes.json -simplify interval=${input.intervals.apercu} keep-shapes ` +
      `-dissolve dep copy-fields=reg + name=departements -target departements -rename-fields code=dep,region=reg ` +
      `-target communes -dissolve reg + name=regions -target regions -rename-fields code=reg ` +
      `-target departements,regions -o format=topojson quantization=100000 france.json`,
    all,
  );

  const selected = input.departements;
  const scoped = selected ? features.filter((f) => selected.has(f.properties.dep)) : features;
  const perDepartement = await run(
    `-i communes.json -simplify interval=${input.intervals.communes} keep-shapes -split dep ` +
      `-o format=topojson quantization=100000 singles`,
    JSON.stringify({ type: 'FeatureCollection', features: scoped }),
  );

  const files = new Map<string, string>();
  files.set('france.topo.json', overview['france.json']!);
  const departementCodes = [...new Set(scoped.map((f) => f.properties.dep))].sort(compare);
  for (const code of departementCodes) {
    const content = perDepartement[`${code}.json`];
    if (!content) throw new Error(`Fichier des communes manquant pour le département ${code}`);
    files.set(`communes/${code}.topo.json`, content);
  }

  const index: CommuneIndexEntry[] = scoped.map((f) => {
    const [w, s, e, n] = boxes.get(f.properties.code)!;
    return [f.properties.code, f.properties.nom, f.properties.dep, f.properties.reg, w, s, e, n];
  });
  files.set('index.json', JSON.stringify(index));

  const communesOf = (dep: string) => cog.communes.filter((c) => c.departement === dep);
  const manifest = GeoManifestSchema.parse({
    format: 'republique-2027/geo',
    formatVersion: 1,
    millesime: input.millesime,
    couverture: selected ? 'demonstration' : 'complet',
    importeur: IMPORTER_VERSION,
    sources: input.sources,
    simplification: {
      communes: `tolérance ${input.intervals.communes} m (mapshaper, formes conservées)`,
      apercu: `tolérance ${input.intervals.apercu} m, départements et régions fusionnés à partir des communes`,
    },
    effectifs: {
      communes: scoped.length,
      communesDuReferentiel: cog.communes.length,
      departements: cog.departements.length,
      regions: cog.regions.length,
    },
    apercu: 'france.topo.json',
    index: 'index.json',
    regions: [...cog.regions]
      .sort((a, b) => compare(a.code, b.code))
      .map((r) => ({
        code: r.code,
        nom: r.nom,
        bbox: union(cog.communes.filter((c) => c.region === r.code).map((c) => boxes.get(c.code)!)),
      })),
    departements: [...cog.departements]
      .sort((a, b) => compare(a.code, b.code))
      .map((d) => ({
        code: d.code,
        nom: d.nom,
        region: d.region,
        zone: d.zone,
        communes: communesOf(d.code).length,
        bbox: union(communesOf(d.code).map((c) => boxes.get(c.code)!)),
        fichier: departementCodes.includes(d.code) ? `communes/${d.code}.topo.json` : null,
      })),
    horsCarte: [
      ...cog.comer.filter((c) => (OFF_MAP_COMER as readonly string[]).includes(c.code)),
      { code: '99', nom: 'Français établis hors de France' },
    ],
  });
  files.set('manifest.json', JSON.stringify(manifest, null, 2));
  return { manifest, files };
}
