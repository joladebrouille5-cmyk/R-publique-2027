// Enquête d'experts Chapel Hill (CHES) : positions moyennes des partis sur l'axe économique
// (`lrecon`, 0 = extrême gauche … 10 = extrême droite) et sur l'axe des valeurs (`galtan`,
// 0 = libertaire / post-matérialiste … 10 = traditionnel / autoritaire). Conversion vers les
// axes du jeu (−100 … +100) : (x − 5) × 20, arrondi à l'entier — linéaire et documentée.
import { parseCsv } from '../cog/csv';
import { ImportError } from '../geometry/coverage';

/** Code pays de la France dans les fichiers CHES. */
export const CHES_FRANCE = '6';

export type ChesParty = {
  party: string;
  partyId: string;
  year: number;
  family: number;
  lrecon: number;
  galtan: number;
};

/**
 * Partis français d'un fichier CHES (moyennes par parti). Le fichier de la vague 2024 n'a pas
 * de colonne `year` : l'année est alors fournie.
 */
export function parseChes(text: string, defaultYear?: number): ChesParty[] {
  const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);
  if (!header) throw new ImportError('Fichier CHES vide.');
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0 && !(name === 'year' && defaultYear)) {
      throw new ImportError(`Colonne CHES absente : ${name}`);
    }
    return i;
  };
  const [country, partyId, party, family, year, lrecon, galtan] = [
    'country',
    'party_id',
    'party',
    'family',
    'year',
    'lrecon',
    'galtan',
  ].map(col);
  return rows
    .filter((r) => r[country!] === CHES_FRANCE)
    .map((r) => ({
      party: r[party!]!,
      partyId: r[partyId!]!,
      year: year! >= 0 ? Number(r[year!]) : defaultYear!,
      family: Number(r[family!]),
      lrecon: Number(r[lrecon!]),
      galtan: Number(r[galtan!]),
    }))
    .filter((p) => Number.isFinite(p.lrecon) && Number.isFinite(p.galtan));
}

export const toAxis = (x: number) => Math.max(-100, Math.min(100, Math.round((x - 5) * 20)));

/** Position d'un parti à une vague donnée ; l'import échoue s'il n'y figure pas. */
export function partyAt(parties: ChesParty[], party: string, year: number): ChesParty {
  const found = parties.find((p) => p.party === party && p.year === year);
  if (!found) throw new ImportError(`Parti « ${party} » absent de la vague CHES ${year}.`);
  return found;
}

/** Partis français d'une famille CHES à une vague donnée (au moins un, sinon échec). */
export function familyAt(parties: ChesParty[], family: number, year: number): ChesParty[] {
  const found = parties.filter((p) => p.family === family && p.year === year);
  if (!found.length) throw new ImportError(`Aucun parti de la famille CHES ${family} en ${year}.`);
  return found;
}

export const FAMILY_LABELS: Record<number, string> = {
  1: 'droite radicale',
  2: 'conservateurs',
  3: 'libéraux',
  4: 'démocrates-chrétiens',
  5: 'socialistes',
  6: 'gauche radicale',
  7: 'écologistes',
  8: 'régionalistes',
  9: 'sans famille',
  10: 'confessionnels',
  11: 'agrariens / centre',
};
