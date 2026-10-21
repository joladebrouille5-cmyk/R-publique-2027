import { demoBaselineFromTopologies, type TerritorialBaseline } from '@r2027/engine';
import {
  buildTerritorySearch,
  CommuneIndexSchema,
  GeoManifestSchema,
  rulesetKey,
  searchTerritories,
  type CommuneIndexEntry,
  type GeoManifest,
  type Ruleset,
  type TerritorySearchEntry,
} from '@r2027/shared';

// Référentiel cartographique embarqué dans l'application (phase 8) : le jeu de démonstration
// commité (communes de l'Ain, de la Corse et des DROM), lu depuis les fichiers de l'application.
// La base électorale du moteur est alors la base de démonstration, FICTIVE et affichée comme
// telle — comme l'API sans import local. Les résultats réels de 2022 ne sont pas embarqués.

/** Lecteur d'un fichier du référentiel (JSON déjà analysé). */
export type GeoSource = (name: string) => Promise<unknown>;

export class LocalGeo {
  private readonly allowed: Set<string>;
  private readonly files = new Map<string, Promise<unknown>>();
  private readonly baselines = new Map<string, Promise<TerritorialBaseline>>();
  private readonly entries: TerritorySearchEntry[];

  private constructor(
    private readonly read: GeoSource,
    readonly manifest: GeoManifest,
    readonly index: CommuneIndexEntry[],
  ) {
    this.allowed = new Set([
      manifest.apercu,
      manifest.index,
      ...manifest.departements.flatMap((d) => (d.fichier ? [d.fichier] : [])),
    ]);
    this.entries = buildTerritorySearch(manifest, index);
  }

  static async load(read: GeoSource): Promise<LocalGeo> {
    const manifest = GeoManifestSchema.parse(await read('manifest.json'));
    const index = CommuneIndexSchema.parse(await read(manifest.index));
    return new LocalGeo(read, manifest, index);
  }

  /** Fichier du manifeste (TopoJSON, index) ; null si le nom est inconnu. */
  file(name: string): Promise<unknown> | null {
    if (!this.allowed.has(name)) return null;
    let file = this.files.get(name);
    if (!file) {
      file = this.read(name);
      this.files.set(name, file);
    }
    return file;
  }

  search(query: string, limit = 10) {
    return searchTerritories(this.entries, query, limit);
  }

  /** Base territoriale de démonstration pour un jeu de règles (calculée une fois). */
  baselineFor(ruleset: Ruleset): Promise<TerritorialBaseline> {
    const key = rulesetKey(ruleset);
    let baseline = this.baselines.get(key);
    if (!baseline) {
      baseline = (async () => {
        const departements = this.manifest.departements;
        const topologies = new Map<string, unknown>();
        for (const d of departements)
          if (d.fichier) topologies.set(d.fichier, await this.file(d.fichier));
        return demoBaselineFromTopologies(ruleset, departements, (f) => topologies.get(f));
      })();
      this.baselines.set(key, baseline);
    }
    return baseline;
  }
}
