import type { MultiPolygon, Polygon } from 'geojson';
import { DatabaseSync } from 'node:sqlite';
import { readGpkgGeometry } from './wkb';

export type GpkgFeature = {
  properties: Record<string, string | number | null>;
  geometry: Polygon | MultiPolygon;
};

/** Lit les entités d'une table GeoPackage (colonnes demandées + géométrie), en lecture seule. */
export function readGpkgTable(
  path: string,
  table: string,
  columns: readonly string[],
): GpkgFeature[] {
  if (!/^[a-z_]+$/.test(table) || columns.some((c) => !/^[a-z_]+$/.test(c))) {
    throw new Error('Nom de table ou de colonne invalide');
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const geometry = db
      .prepare(
        'SELECT column_name AS name, srs_id AS srs FROM gpkg_geometry_columns WHERE table_name = ?',
      )
      .get(table) as { name: string; srs: number } | undefined;
    if (!geometry) throw new Error(`Table ${table} absente du GeoPackage`);
    const rows = db
      .prepare(`SELECT ${[...columns, geometry.name].join(', ')} FROM ${table} ORDER BY fid`)
      .all() as Record<string, string | number | null | Uint8Array>[];
    return rows.map((row) => {
      const blob = row[geometry.name];
      if (!(blob instanceof Uint8Array)) throw new Error(`${table} : géométrie absente`);
      const properties = Object.fromEntries(
        columns.map((c) => [c, row[c] as string | number | null]),
      );
      return { properties, geometry: readGpkgGeometry(blob, geometry.srs) };
    });
  } finally {
    db.close();
  }
}
