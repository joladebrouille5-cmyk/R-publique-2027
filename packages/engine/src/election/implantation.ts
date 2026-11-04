import {
  departmentInscrits,
  weightedImplantation,
  type GameState,
  type Ruleset,
  type UtilityFactor,
} from '@r2027/shared';
import type { TerritorialBaseline } from '../territory/baseline';
import { largestRemainder } from './apportion';
import type { GroupDistribution } from './distribution';

// Implantation et vote (phase 25, hypothèses du jeu de règles) : facteur d'utilité national
// « Implantation » et multiplicateur local du dépouillement, qui déplace le score d'un candidat
// vers les départements où il est implanté sans changer sensiblement son total national.

/** Implantation moyenne d'un candidat (0 à 100), pondérée par les inscrits des départements. */
export function meanImplantation(state: GameState, ruleset: Ruleset, actorId: string): number {
  const map = state.implantation[actorId];
  return map ? weightedImplantation(map, departmentInscrits(ruleset)) : 0;
}

/** Facteur « Implantation » = poids × (implantation moyenne − pivot) / 100. */
export function implantationFactor(
  state: GameState,
  ruleset: Ruleset,
  contenderId: string,
): UtilityFactor[] {
  const { poids, pivot } = ruleset.implantation;
  return [
    {
      label: 'Implantation',
      value: (poids * (meanImplantation(state, ruleset, contenderId) - pivot)) / 100,
    },
  ];
}

/** Multiplicateur de la probabilité de vote d'un candidat dans un département. */
export function localMultiplier(local: number, mean: number, alpha: number): number {
  return (1 + (alpha * local) / 100) / (1 + (alpha * mean) / 100);
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6 + 0;

/**
 * Multiplicateurs de chaque département de la base (dans l'ordre des candidats), arrondis au
 * millionième pour être enregistrés tels quels avec le résultat ; aucun pour la base nationale
 * ni quand α vaut 0. La moyenne Ī est prise sur les départements de la base, pondérés par
 * leurs inscrits : le multiplicateur y vaut 1 en moyenne, le total national bouge à peine.
 */
export function implantationMultipliers(
  state: GameState,
  ruleset: Ruleset,
  candidates: readonly string[],
  baseline: TerritorialBaseline,
): Record<string, number[]> {
  const alpha = ruleset.implantation.alpha;
  if (alpha === 0 || baseline.nature === 'national') return {};
  const weights: Record<string, number> = {};
  for (const unit of baseline.units)
    if (unit.departement !== null)
      weights[unit.departement] = (weights[unit.departement] ?? 0) + unit.inscrits;
  const means = candidates.map((id) => weightedImplantation(state.implantation[id] ?? {}, weights));
  const result: Record<string, number[]> = {};
  for (const code of Object.keys(weights).sort())
    result[code] = candidates.map((id, k) =>
      round6(localMultiplier(state.implantation[id]?.[code] ?? 0, means[k]!, alpha)),
    );
  return result;
}

/** Probabilités d'un groupe corrigées par les multiplicateurs locaux, puis renormalisées. */
export function adjustProbabilities(
  probabilities: readonly number[],
  multipliers: readonly number[] | undefined,
): readonly number[] {
  if (!multipliers) return probabilities;
  const weighted = probabilities.map((p, k) => p * (multipliers[k] ?? 1));
  const total = weighted.reduce((a, b) => a + b, 0);
  return total > 0 ? weighted.map((w) => w / total) : probabilities;
}

/**
 * Projection des intentions nationales sur chaque département de la base (lectures « Qui
 * mène » et « Sondage local », simulées) : composition locale des groupes d'électeurs, parts
 * de chaque groupe, multiplicateur d'implantation, en centièmes de point (10 000 par
 * département, plus fort reste). Vide avec la base nationale.
 */
export function projectDepartments(
  state: GameState,
  ruleset: Ruleset,
  distributions: readonly GroupDistribution[],
  baseline: TerritorialBaseline,
): Record<string, Record<string, number>> {
  if (baseline.nature === 'national' || distributions.length === 0) return {};
  const candidates = distributions[0]!.contenders.map((c) => c.id);
  const multipliers = implantationMultipliers(state, ruleset, candidates, baseline);
  const groups = ruleset.electorat.groupes;
  // Suffrages exprimés attendus de chaque groupe, par département.
  const expressed = new Map<string, number[]>();
  for (const unit of baseline.units) {
    if (unit.departement === null) continue;
    const parts = groups.map((g, i) => g.part * (unit.affinite[i] ?? 1));
    const sum = parts.reduce((a, b) => a + b, 0) || 1;
    const row = expressed.get(unit.departement) ?? groups.map(() => 0);
    distributions.forEach((d, g) => {
      const inscrits = (unit.inscrits * parts[g]!) / sum;
      const votants = inscrits * Math.min(0.99, d.turnout * unit.participation);
      row[g] = row[g]! + votants * (1 - d.blancs - d.nuls);
    });
    expressed.set(unit.departement, row);
  }
  const projection: Record<string, Record<string, number>> = {};
  for (const code of [...expressed.keys()].sort()) {
    const row = expressed.get(code)!;
    const votes = candidates.map(() => 0);
    distributions.forEach((d, g) => {
      const probabilities = adjustProbabilities(d.probabilities, multipliers[code]);
      probabilities.forEach((p, k) => (votes[k] = votes[k]! + row[g]! * p));
    });
    if (votes.every((v) => v === 0)) continue;
    const shares = largestRemainder(10_000, votes);
    projection[code] = Object.fromEntries(candidates.map((id, k) => [id, shares[k]!]));
  }
  return projection;
}
