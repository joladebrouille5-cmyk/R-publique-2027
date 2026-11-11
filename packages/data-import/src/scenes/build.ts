// Aides de l'import des actifs des scènes 3D (phase 26), sans réseau ni fichier.

/** Auteurs d'un actif Poly Haven (« nom → rôle »), dans l'ordre alphabétique. */
export function authorsText(authors: Readonly<Record<string, string>>): string {
  const noms = Object.keys(authors).sort((a, b) => a.localeCompare(b));
  if (noms.length === 0) throw new Error('actif sans auteur');
  return noms.join(', ');
}

/** Côté photographié, en mètres, d'après les dimensions (en millimètres) de la fiche. */
export function sizeMeters(dimensions: readonly number[] | undefined): number {
  const mm = dimensions?.[0];
  if (!mm || mm <= 0) throw new Error('actif sans dimensions');
  return Math.round(mm) / 1000;
}
