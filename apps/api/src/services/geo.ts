import {
  buildTerritorySearch,
  CommuneIndexSchema,
  GeoManifestSchema,
  searchTerritories,
  type CommuneIndexEntry,
  type GeoManifest,
  type TerritorySearchEntry,
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

/** Référentiel chargé en mémoire : manifeste, index de recherche et fichiers servis (compressés). */
export class GeoRepository {
  readonly manifest: GeoManifest;
  /** Index des communes : [code, nom, département, région, emprise…]. */
  readonly index: CommuneIndexEntry[];
  private readonly entries: TerritorySearchEntry[];
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
    this.entries = buildTerritorySearch(this.manifest, index);
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

  /** Recherche de territoires (voir `searchTerritories`, partagée avec le serveur local). */
  search(query: string, limit = 10): TerritorySearchResult[] {
    return searchTerritories(this.entries, query, limit);
  }
}
