import {
  CommuneIndexSchema,
  GeoManifestSchema,
  normalizeName,
  zoneOfDepartement,
  type CommuneIndexEntry,
  type GeoManifest,
  type TerritorySearchResult,
} from '@r2027/shared';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Répertoires candidats du référentiel cartographique, par ordre de préférence : celui de
 * GEO_DATA_DIR, sinon l'import complet (`pnpm data:geo`), sinon le jeu de démonstration commité.
 */
export function geoDirectories(configured: string | undefined): string[] {
  if (configured) return [resolve(configured)];
  return [
    join(REPO, 'data/processed/geo/cog-2026'),
    join(REPO, 'packages/data-import/demo/cog-2026'),
  ];
}

type Searchable = { result: TerritorySearchResult; name: string; rank: number };

/** Référentiel chargé en mémoire : manifeste, index de recherche et fichiers servis (compressés). */
export class GeoRepository {
  readonly manifest: GeoManifest;
  /** Index des communes : [code, nom, département, région, emprise…]. */
  readonly index: CommuneIndexEntry[];
  private readonly entries: Searchable[];
  private readonly allowed: Set<string>;
  private readonly cache = new Map<string, { raw: Buffer; gzip: Buffer }>();

  constructor(readonly directory: string) {
    const read = (name: string) =>
      JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown;
    this.manifest = GeoManifestSchema.parse(read('manifest.json'));
    const index = CommuneIndexSchema.parse(read(this.manifest.index));
    this.index = index;
    this.allowed = new Set([
      this.manifest.apercu,
      this.manifest.index,
      ...this.manifest.departements.flatMap((d) => (d.fichier ? [d.fichier] : [])),
    ]);
    this.entries = [
      ...this.manifest.regions.map((r) => ({
        result: {
          level: 'region' as const,
          code: r.code,
          nom: r.nom,
          departement: null,
          zone: zoneOf(r.code, this.manifest),
          bbox: r.bbox,
        },
        name: normalizeName(r.nom),
        rank: 0,
      })),
      ...this.manifest.departements.map((d) => ({
        result: {
          level: 'departement' as const,
          code: d.code,
          nom: d.nom,
          departement: d.code,
          zone: d.zone,
          bbox: d.bbox,
        },
        name: normalizeName(d.nom),
        rank: 1,
      })),
      ...index.map((entry: CommuneIndexEntry) => {
        const [code, nom, departement, , w, s, e, n] = entry;
        return {
          result: {
            level: 'commune' as const,
            code,
            nom,
            departement,
            zone: zoneOfDepartement(departement),
            bbox: [w, s, e, n] as [number, number, number, number],
          },
          name: normalizeName(nom),
          rank: 2,
        };
      }),
    ];
  }

  /** Lit le premier référentiel disponible ; erreur explicite si aucun n'existe. */
  static load(directories: readonly string[]): GeoRepository {
    const found = directories.find((dir) => existsSync(join(dir, 'manifest.json')));
    if (!found) {
      throw new Error(
        `Référentiel cartographique introuvable (${directories.join(', ')}) : lancer « pnpm data:geo ».`,
      );
    }
    return new GeoRepository(found);
  }

  /** Contenu d'un fichier du manifeste (et sa version compressée) ; null si le nom est inconnu. */
  file(name: string): { raw: Buffer; gzip: Buffer } | null {
    if (!this.allowed.has(name)) return null;
    let cached = this.cache.get(name);
    if (!cached) {
      const raw = readFileSync(join(this.directory, name));
      cached = { raw, gzip: gzipSync(raw) };
      this.cache.set(name, cached);
    }
    return cached;
  }

  /**
   * Recherche par code (exact puis préfixe) ou par nom (sans accents ni casse : égalité, début,
   * puis contenu). À pertinence égale : régions, départements, puis communes, et ordre des codes.
   */
  search(query: string, limit = 10): TerritorySearchResult[] {
    const q = normalizeName(query);
    if (q.length === 0) return [];
    const code = query.trim().toUpperCase();
    const scored: { entry: Searchable; score: number }[] = [];
    for (const entry of this.entries) {
      let score: number | null = null;
      if (entry.result.code === code) score = 0;
      else if (code.length >= 2 && /^[0-9AB]+$/.test(code) && entry.result.code.startsWith(code))
        score = 1;
      else if (entry.name === q) score = 2;
      else if (entry.name.startsWith(q)) score = 3;
      else if (q.length >= 3 && entry.name.includes(q)) score = 4;
      if (score !== null) scored.push({ entry, score });
    }
    return scored
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.entry.rank - b.entry.rank ||
          a.entry.name.length - b.entry.name.length ||
          (a.entry.result.code < b.entry.result.code ? -1 : 1),
      )
      .slice(0, limit)
      .map((s) => s.entry.result);
  }
}

function zoneOf(regionCode: string, manifest: GeoManifest) {
  return manifest.departements.find((d) => d.region === regionCode)?.zone ?? 'metropole';
}
