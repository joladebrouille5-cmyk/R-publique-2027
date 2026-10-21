import type { GroupBehavior, Ruleset } from '@r2027/shared';
import { largestRemainder } from '../election/apportion';
import type { VoteCounts } from './aggregate';
import type { TerritorialBaseline, TerritorialUnit } from './baseline';

const zero = (candidates: readonly string[]): VoteCounts => ({
  inscrits: 0,
  votants: 0,
  blancs: 0,
  nuls: 0,
  exprimes: 0,
  voix: Object.fromEntries(candidates.map((id) => [id, 0])),
});

function addInto(target: VoteCounts, source: VoteCounts): void {
  target.inscrits += source.inscrits;
  target.votants += source.votants;
  target.blancs += source.blancs;
  target.nuls += source.nuls;
  target.exprimes += source.exprimes;
  for (const [id, count] of Object.entries(source.voix))
    target.voix[id] = (target.voix[id] ?? 0) + count;
}

export type UnitTally = { unit: TerritorialUnit; total: VoteCounts; groups: VoteCounts[] };

/**
 * Dépouillement d'une unité (commune ou territoire hors carte), en nombres entiers : inscrits
 * répartis entre groupes selon la part nationale × l'affinité locale ; pour chaque groupe,
 * votants (participation du groupe × facteur local), blancs, nuls, puis voix au plus fort reste.
 */
export function tallyUnit(
  unit: TerritorialUnit,
  ruleset: Ruleset,
  candidates: readonly string[],
  behavior: readonly GroupBehavior[],
): UnitTally {
  const parts = ruleset.electorat.groupes.map((g, i) => g.part * (unit.affinite[i] ?? 1));
  const inscrits = unit.inscrits > 0 ? largestRemainder(unit.inscrits, parts) : parts.map(() => 0);
  const total = zero(candidates);
  const groups = behavior.map((b, g) => {
    const counts = zero(candidates);
    const ins = inscrits[g]!;
    if (ins === 0) return counts;
    const votants = Math.round(ins * Math.min(0.99, b.turnout * unit.participation));
    const blancs = Math.round(votants * b.blancs);
    const nuls = Math.round(votants * b.nuls);
    const exprimes = votants - blancs - nuls;
    const voix =
      exprimes > 0 ? largestRemainder(exprimes, b.probabilities) : b.probabilities.map(() => 0);
    counts.inscrits = ins;
    counts.votants = votants;
    counts.blancs = blancs;
    counts.nuls = nuls;
    counts.exprimes = exprimes;
    candidates.forEach((id, k) => (counts.voix[id] = voix[k]!));
    addInto(total, counts);
    return counts;
  });
  return { unit, total, groups };
}

export type TerritorialTally = {
  national: VoteCounts;
  groups: VoteCounts[];
  departements: Record<string, VoteCounts>;
  regions: Record<string, VoteCounts>;
  horsCarte: Record<string, VoteCounts>;
};

/** Dépouillement de toutes les unités ; chaque niveau est la somme exacte du niveau inférieur. */
export function tallyBaseline(
  baseline: TerritorialBaseline,
  ruleset: Ruleset,
  candidates: readonly string[],
  behavior: readonly GroupBehavior[],
): TerritorialTally {
  const national = zero(candidates);
  const groups = behavior.map(() => zero(candidates));
  const departements: Record<string, VoteCounts> = {};
  const regions: Record<string, VoteCounts> = {};
  const horsCarte: Record<string, VoteCounts> = {};
  for (const unit of baseline.units) {
    const tally = tallyUnit(unit, ruleset, candidates, behavior);
    tally.groups.forEach((counts, g) => addInto(groups[g]!, counts));
    if (unit.departement === null || unit.region === null) {
      horsCarte[unit.code] = tally.total;
    } else {
      addInto((departements[unit.departement] ??= zero(candidates)), tally.total);
    }
  }
  // Régions = somme des départements ; national = régions + hors carte.
  const regionOf = new Map(
    baseline.units.filter((u) => u.departement).map((u) => [u.departement!, u.region!]),
  );
  for (const [code, counts] of Object.entries(departements)) {
    addInto((regions[regionOf.get(code)!] ??= zero(candidates)), counts);
  }
  for (const counts of [...Object.values(regions), ...Object.values(horsCarte)])
    addInto(national, counts);
  return { national, groups, departements, regions, horsCarte };
}
