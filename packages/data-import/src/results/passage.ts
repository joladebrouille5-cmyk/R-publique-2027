import { csvRecords } from '../cog/csv';
import { ImportError } from '../geometry/coverage';

/** Groupe de communes liées par des fusions ou des scissions entre deux géographies. */
export type PassageGroup = { sources: string[]; targets: string[] };

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(code: string): string {
    let root = code;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let node = code;
    while (node !== root) {
      const next = this.parent.get(node) ?? root;
      this.parent.set(node, root);
      node = next;
    }
    if (!this.parent.has(root)) this.parent.set(root, root);
    return root;
  }
  union(a: string, b: string): void {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra !== rb) this.parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

/**
 * Table de passage entre les communes d'une ancienne géographie (`sources`) et celles du
 * référentiel (`targets`), à partir du fichier des mouvements du COG : chaque mouvement de
 * commune à commune postérieur à `since` relie ses deux codes. Chaque groupe connexe réunit des
 * communes fusionnées, rétablies (scissions) ou recodées. Erreur si une commune source n'aboutit
 * à aucune commune du référentiel.
 */
export function buildPassage(
  movementsCsv: string,
  since: string,
  sources: readonly string[],
  targets: readonly string[],
): PassageGroup[] {
  const uf = new UnionFind();
  for (const m of csvRecords(movementsCsv)) {
    if (m.DATE_EFF! <= since || m.TYPECOM_AV !== 'COM' || m.TYPECOM_AP !== 'COM') continue;
    uf.union(m.COM_AV!, m.COM_AP!);
  }
  const groups = new Map<string, PassageGroup>();
  const group = (code: string) => {
    const root = uf.find(code);
    if (!groups.has(root)) groups.set(root, { sources: [], targets: [] });
    return groups.get(root)!;
  };
  for (const code of new Set(sources)) group(code).sources.push(code);
  for (const code of new Set(targets)) group(code).targets.push(code);
  const orphans = [...groups.values()]
    .filter((g) => g.targets.length === 0)
    .flatMap((g) => g.sources);
  if (orphans.length) {
    throw new ImportError(
      `Communes sans correspondance dans le référentiel : ${orphans.slice(0, 20).join(', ')}`,
    );
  }
  const sorted = (codes: string[]) => [...codes].sort();
  return [...groups.values()]
    .map((g) => ({ sources: sorted(g.sources), targets: sorted(g.targets) }))
    .sort((a, b) => (a.targets[0]! < b.targets[0]! ? -1 : 1));
}
