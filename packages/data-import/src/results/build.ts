import { largestRemainder } from '@r2027/engine';
import {
  HistoricalRoundSchema,
  type DataImport,
  type HistoricalCandidate,
  type HistoricalRound,
} from '@r2027/shared';
import { ImportError } from '../geometry/coverage';
import type { PassageGroup } from './passage';
import type { ResultLine } from './parse';

export const RESULTS_IMPORTER_VERSION = 'resultats-1.0.0';

export type Proclamation = { reference: string; url: string; valeurs: number[] };

export type RoundBuildInput = {
  election: string;
  tour: 1 | 2;
  date: string;
  millesimeGeographique: string;
  sources: DataImport[];
  proclamation: Proclamation;
  candidats: HistoricalCandidate[];
  lines: readonly ResultLine[];
  passage: readonly PassageGroup[];
  /** Population des communes du référentiel, pour ventiler une commune scindée. */
  population: ReadonlyMap<string, number>;
};

const add = (a: number[], b: readonly number[]) => a.map((v, i) => v + b[i]!);

/**
 * Ventile des valeurs entre communes au prorata des poids, sans rien perdre : abstentions,
 * blancs, nuls et voix sont répartis au plus fort reste, puis exprimés, votants et inscrits
 * sont recalculés, si bien que chaque commune reste cohérente et que les totaux sont exacts.
 */
export function apportion(valeurs: readonly number[], weights: readonly number[]): number[][] {
  const [, abstentions, , blancs, nuls, , ...voix] = valeurs;
  const parts = [abstentions!, blancs!, nuls!, ...voix].map((total) =>
    largestRemainder(total, weights),
  );
  return weights.map((_, t) => {
    const [a, b, n, ...v] = parts.map((p) => p[t]!) as [number, number, number, ...number[]];
    const exprimes = v.reduce((s, x) => s + x, 0);
    const votants = b + n + exprimes;
    return [votants + a, a, votants, b, n, exprimes, ...v];
  });
}

/**
 * Ramène un tour de scrutin à la géographie du référentiel : fusions (somme exacte), scissions
 * (ventilation au prorata de la population, étiquetée « estimation ») ; puis vérifie que la
 * somme de toutes les lignes égale, à l'unité, les totaux proclamés.
 */
export function buildRound(input: RoundBuildInput): HistoricalRound {
  const width = 6 + input.candidats.length;
  const byCode = new Map<string, number[]>();
  const horsCarte: HistoricalRound['horsCarte'] = {};
  let total = new Array<number>(width).fill(0);
  for (const line of input.lines) {
    if (line.valeurs.length !== width)
      throw new ImportError(`${line.code} : ${line.valeurs.length} valeurs`);
    total = add(total, line.valeurs);
    if (line.offMap) {
      const area = (horsCarte[line.code] ??= {
        nom: line.nom,
        valeurs: new Array<number>(width).fill(0),
      });
      area.valeurs = add(area.valeurs, line.valeurs);
    } else {
      if (byCode.has(line.code)) throw new ImportError(`Commune ${line.code} présente deux fois`);
      byCode.set(line.code, line.valeurs);
    }
  }
  if (JSON.stringify(total) !== JSON.stringify(input.proclamation.valeurs)) {
    throw new ImportError(
      `Totaux différents de la proclamation (${input.proclamation.reference}) : ${total.join(', ')} ≠ ${input.proclamation.valeurs.join(', ')}`,
    );
  }

  const communes: Record<string, number[]> = {};
  const estimations: string[] = [];
  const sansLigne: string[] = [];
  for (const group of input.passage) {
    const values = group.sources.flatMap((code) => (byCode.has(code) ? [byCode.get(code)!] : []));
    if (values.length === 0) {
      for (const code of group.targets) {
        communes[code] = new Array<number>(width).fill(0);
        sansLigne.push(code);
      }
      continue;
    }
    const merged = values.reduce((acc, v) => add(acc, v), new Array<number>(width).fill(0));
    if (group.targets.length === 1) {
      communes[group.targets[0]!] = merged;
      continue;
    }
    const weights = group.targets.map((code) => {
      const population = input.population.get(code);
      if (population === undefined) throw new ImportError(`Population inconnue pour ${code}`);
      return Math.max(population, 1);
    });
    apportion(merged, weights).forEach((v, i) => {
      communes[group.targets[i]!] = v;
      estimations.push(group.targets[i]!);
    });
  }
  const placed = new Set(input.passage.flatMap((g) => g.sources));
  const unmatched = [...byCode.keys()].filter((code) => !placed.has(code));
  if (unmatched.length)
    throw new ImportError(`Lignes non rattachées : ${unmatched.slice(0, 20).join(', ')}`);

  const mapped = Object.values(communes).reduce(
    (acc, v) => add(acc, v),
    new Array<number>(width).fill(0),
  );
  const offMap = Object.values(horsCarte).reduce(
    (acc, a) => add(acc, a.valeurs),
    new Array<number>(width).fill(0),
  );
  if (JSON.stringify(add(mapped, offMap)) !== JSON.stringify(input.proclamation.valeurs)) {
    throw new ImportError('Le passage de géographie a modifié les totaux : import refusé');
  }

  return HistoricalRoundSchema.parse({
    format: 'republique-2027/resultats',
    formatVersion: 1,
    election: input.election,
    tour: input.tour,
    date: input.date,
    nature: 'reel',
    millesimeGeographique: input.millesimeGeographique,
    importeur: RESULTS_IMPORTER_VERSION,
    sources: input.sources,
    proclamation: input.proclamation,
    candidats: input.candidats,
    communes: Object.fromEntries(Object.entries(communes).sort(([a], [b]) => (a < b ? -1 : 1))),
    estimations: estimations.sort(),
    sansLigne: sansLigne.sort(),
    horsCarte,
  });
}
