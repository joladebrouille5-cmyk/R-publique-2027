// Agrégation territoriale (territory-engine) : un niveau est TOUJOURS la somme exacte de
// ses enfants (§3.3, critère 7). Phase 3 : groupes d'électeurs → national ; phase 4 :
// communes → départements → régions → national.

export type VoteCounts = {
  inscrits: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  voix: Record<string, number>;
};

export function aggregateCounts(children: readonly VoteCounts[]): VoteCounts {
  const total: VoteCounts = { inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0, voix: {} };
  for (const child of children) {
    total.inscrits += child.inscrits;
    total.votants += child.votants;
    total.blancs += child.blancs;
    total.nuls += child.nuls;
    total.exprimes += child.exprimes;
    for (const [id, count] of Object.entries(child.voix))
      total.voix[id] = (total.voix[id] ?? 0) + count;
  }
  return total;
}

/**
 * Agrège des résultats de niveau le plus fin selon une hiérarchie (`parentOf` renvoie le
 * code parent, ou null à la racine). Renvoie les résultats de chaque niveau intermédiaire.
 */
export function aggregateHierarchy(
  leaves: ReadonlyMap<string, VoteCounts>,
  parentOf: (code: string) => string | null,
): Map<string, VoteCounts> {
  const children = new Map<string, VoteCounts[]>();
  const result = new Map<string, VoteCounts>(leaves);
  let level = [...leaves.keys()];
  const seen = new Set(level);
  while (level.length) {
    const next = new Set<string>();
    for (const code of level) {
      const parent = parentOf(code);
      if (parent === null) continue;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(result.get(code)!);
      next.add(parent);
    }
    for (const parent of next) {
      if (seen.has(parent))
        throw new Error(`Hiérarchie invalide : ${parent} est à plusieurs niveaux`);
      seen.add(parent);
      result.set(parent, aggregateCounts(children.get(parent)!));
    }
    level = [...next];
  }
  return result;
}

/** Invariants d'un résultat : aucun négatif, votants = blancs + nuls + exprimés, Σ voix = exprimés. */
export function checkCounts(counts: VoteCounts): string[] {
  const problems: string[] = [];
  const values = [
    counts.inscrits,
    counts.votants,
    counts.blancs,
    counts.nuls,
    counts.exprimes,
    ...Object.values(counts.voix),
  ];
  if (values.some((v) => !Number.isInteger(v) || v < 0))
    problems.push('valeur négative ou non entière');
  if (counts.votants > counts.inscrits) problems.push('plus de votants que d’inscrits');
  if (counts.blancs + counts.nuls + counts.exprimes !== counts.votants)
    problems.push('votants ≠ blancs + nuls + exprimés');
  const sum = Object.values(counts.voix).reduce((a, b) => a + b, 0);
  if (sum !== counts.exprimes) problems.push('Σ voix ≠ exprimés');
  return problems;
}
