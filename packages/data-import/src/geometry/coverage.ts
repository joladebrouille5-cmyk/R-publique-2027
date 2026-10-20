/** Import refusé : l'erreur décrit précisément les codes en cause (§3.1 : aucune attribution silencieuse). */
export class ImportError extends Error {
  override name = 'ImportError';
}

const sample = (codes: string[]) =>
  codes.slice(0, 20).join(', ') + (codes.length > 20 ? ` (+${codes.length - 20})` : '');

/**
 * Vérifie que chaque commune du référentiel a exactement une géométrie et inversement.
 * Les géométries hors référentiel ne sont tolérées que si elles sont explicitement hors carte
 * (collectivités d'outre-mer) ; elles sont alors écartées.
 */
export function checkCoverage(
  referenceCodes: readonly string[],
  geometryCodes: readonly string[],
  isOffMap: (code: string) => boolean,
): { kept: Set<string>; offMap: string[] } {
  const reference = new Set(referenceCodes);
  if (reference.size !== referenceCodes.length)
    throw new ImportError('Référentiel : code de commune en double');
  const counts = new Map<string, number>();
  for (const code of geometryCodes) counts.set(code, (counts.get(code) ?? 0) + 1);

  const duplicates = [...counts].filter(([, n]) => n > 1).map(([code]) => code);
  const missing = referenceCodes.filter((code) => !counts.has(code));
  const extra = [...counts.keys()].filter((code) => !reference.has(code));
  const unexpected = extra.filter((code) => !isOffMap(code));
  const problems = [
    duplicates.length &&
      `${duplicates.length} commune(s) avec plusieurs géométries : ${sample(duplicates)}`,
    missing.length && `${missing.length} commune(s) sans géométrie : ${sample(missing)}`,
    unexpected.length &&
      `${unexpected.length} géométrie(s) hors référentiel : ${sample(unexpected)}`,
  ].filter(Boolean);
  if (problems.length) throw new ImportError(`Import refusé. ${problems.join(' ; ')}.`);
  return { kept: reference, offMap: extra.sort() };
}
