/**
 * Répartition d'un total entier selon des poids, par la méthode du plus fort reste
 * (Hamilton) : la somme des parts est EXACTEMENT égale au total, chaque part est la partie
 * entière de son quota ou cet entier + 1. Égalités départagées par l'ordre des poids.
 */
export function largestRemainder(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new RangeError(`Total invalide : ${total}`);
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError('Poids invalide');
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (weights.length === 0 || total === 0) return weights.map(() => 0);
  if (sum === 0) throw new RangeError('Poids tous nuls : répartition impossible');

  const quotas = weights.map((w) => (total * w) / sum);
  const parts = quotas.map(Math.floor);
  let remaining = total - parts.reduce((acc, p) => acc + p, 0);
  const order = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    parts[index]! += 1;
    remaining -= 1;
  }
  return parts;
}
