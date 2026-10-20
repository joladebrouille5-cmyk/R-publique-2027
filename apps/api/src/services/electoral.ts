import { demoBaseline, historicalBaseline, type TerritorialBaseline } from '@r2027/engine';
import {
  HistoricalRoundSchema,
  rulesetKey,
  type HistoricalRound,
  type Ruleset,
} from '@r2027/shared';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeoRepository } from './geo';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Répertoire des résultats historiques importés (`pnpm data:resultats`), s'il existe. */
export function resultsDirectory(configured: string | undefined): string {
  return configured
    ? resolve(configured)
    : join(REPO, 'data/processed/resultats/presidentielle-2022');
}

type Topology = {
  objects: Record<
    string,
    {
      geometries: {
        properties: { code: string; dep: string; reg: string; population: number | null };
      }[];
    }
  >;
};

/**
 * Données électorales de référence : résultats historiques par commune (s'ils ont été importés
 * avec le référentiel complet) et base territoriale du moteur, réelle ou de démonstration.
 */
export class ElectoralRepository {
  private readonly baselines = new Map<string, TerritorialBaseline>();

  constructor(
    private readonly geo: GeoRepository,
    /** Résultats 2022 (tours 1 et 2) ; null si non importés ou si le référentiel est réduit. */
    readonly history: { t1: HistoricalRound; t2: HistoricalRound } | null,
  ) {}

  static load(geo: GeoRepository, directory: string): ElectoralRepository {
    const files = [join(directory, 't1.json'), join(directory, 't2.json')];
    if (geo.manifest.couverture !== 'complet' || !files.every((f) => existsSync(f))) {
      return new ElectoralRepository(geo, null);
    }
    const [t1, t2] = files.map((f) =>
      HistoricalRoundSchema.parse(JSON.parse(readFileSync(f, 'utf8'))),
    ) as [HistoricalRound, HistoricalRound];
    if (t1.millesimeGeographique !== geo.manifest.millesime) {
      throw new Error(
        `Résultats importés pour ${t1.millesimeGeographique}, référentiel ${geo.manifest.millesime}`,
      );
    }
    return new ElectoralRepository(geo, { t1, t2 });
  }

  /** Base territoriale pour un jeu de règles (calculée une fois, puis gardée en mémoire). */
  baselineFor(ruleset: Ruleset): TerritorialBaseline {
    const key = rulesetKey(ruleset);
    let baseline = this.baselines.get(key);
    if (!baseline) {
      baseline = this.history ? this.historical(ruleset, this.history) : this.demo(ruleset);
      this.baselines.set(key, baseline);
    }
    return baseline;
  }

  private historical(ruleset: Ruleset, history: { t1: HistoricalRound; t2: HistoricalRound }) {
    const communes = this.geo.index.map(([code, , departement, region]) => ({
      code,
      departement,
      region,
    }));
    return historicalBaseline(ruleset, history.t1, history.t2, communes);
  }

  private demo(ruleset: Ruleset) {
    const { manifest } = this.geo;
    const communes = manifest.departements.flatMap((d) => {
      if (!d.fichier) return [];
      const topology = JSON.parse(this.geo.file(d.fichier)!.raw.toString('utf8')) as Topology;
      return Object.values(topology.objects)[0]!.geometries.map(({ properties: p }) => ({
        code: p.code,
        departement: p.dep,
        region: p.reg,
        population: p.population ?? 0,
      }));
    });
    const others = manifest.departements
      .filter((d) => !d.fichier)
      .map((d) => ({ code: d.code, region: d.region, population: d.population }));
    return demoBaseline(ruleset, communes, others);
  }
}
