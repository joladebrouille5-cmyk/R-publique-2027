import type { HistoricalCandidate } from '@r2027/shared';

// Fichiers « résultats par commune » du ministère de l'Intérieur (présidentielle 2022) :
// séparateur « ; », Windows-1252, un bloc de 7 champs par candidat après 19 champs communs.
// Voir docs/SOURCES.md §3.1.

const COMMON_FIELDS = 19;
const BLOCK = 7;

/** Codes « département » de l'Intérieur pour les DROM : commune INSEE = 97 + code à 3 chiffres. */
const DROM: Record<string, string> = { ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976' };

/** Territoires hors carte et leur code COG (collectivité) ; « 99 » : Français établis hors de France. */
export const OFF_MAP_AREAS: Record<string, (communeCode: string) => string> = {
  ZN: () => '988',
  ZP: () => '987',
  ZS: () => '975',
  ZW: () => '986',
  ZX: (commune) => (commune === '701' ? '977' : commune === '801' ? '978' : 'ZX?'),
  ZZ: () => '99',
};

export type ResultLine = {
  /** Code INSEE de la commune (géographie de 2022), ou code de la collectivité hors carte. */
  code: string;
  offMap: boolean;
  nom: string;
  /** inscrits, abstentions, votants, blancs, nuls, exprimés, puis voix de chaque candidat. */
  valeurs: number[];
};

function integer(value: string, line: number, field: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`Ligne ${line} : ${field} non entier (« ${value} »)`);
  return Number(value);
}

/** Code INSEE à partir du code de département et du code de commune de l'Intérieur. */
export function inseeCode(departement: string, commune: string): string {
  if (DROM[departement]) return `97${commune.padStart(3, '0')}`;
  if (/^(\d{2}|2A|2B)$/.test(departement))
    return `${departement}${commune.padStart(3, '0').slice(-3)}`;
  throw new Error(`Code de département inconnu : ${departement}`);
}

/**
 * Lit un fichier de résultats communaux. Contrôle chaque ligne : même liste de candidats,
 * inscrits = abstentions + votants, votants = blancs + nuls + exprimés, Σ voix = exprimés.
 */
export function parseResults(text: string): {
  candidats: HistoricalCandidate[];
  lines: ResultLine[];
} {
  const rows = text.split(/\r?\n/).filter((row) => row.trim() !== '');
  const [header, ...data] = rows;
  if (!header?.startsWith('Code du département;')) throw new Error('En-tête inattendu');
  let candidats: HistoricalCandidate[] | null = null;
  const lines = data.map((row, index) => {
    const n = index + 2;
    const f = row.split(';');
    if ((f.length - COMMON_FIELDS) % BLOCK !== 0)
      throw new Error(`Ligne ${n} : ${f.length} champs`);
    const blocks = (f.length - COMMON_FIELDS) / BLOCK;
    const here: HistoricalCandidate[] = [];
    const voix: number[] = [];
    for (let k = 0; k < blocks; k++) {
      const b = f.slice(COMMON_FIELDS + k * BLOCK, COMMON_FIELDS + (k + 1) * BLOCK);
      const sexe = b[1];
      if (sexe !== 'F' && sexe !== 'M') throw new Error(`Ligne ${n} : sexe « ${sexe} »`);
      here.push({ panneau: integer(b[0]!, n, 'panneau'), sexe, nom: b[2]!, prenom: b[3]! });
      voix.push(integer(b[4]!, n, 'voix'));
    }
    if (candidats === null) candidats = here;
    else if (JSON.stringify(candidats) !== JSON.stringify(here)) {
      throw new Error(`Ligne ${n} : liste de candidats différente`);
    }
    const [inscrits, abstentions, votants, blancs, nuls, exprimes] = [5, 6, 8, 10, 13, 16].map(
      (i) => integer(f[i]!, n, `champ ${i + 1}`),
    ) as [number, number, number, number, number, number];
    const sum = voix.reduce((a, b) => a + b, 0);
    if (
      inscrits !== abstentions + votants ||
      votants !== blancs + nuls + exprimes ||
      sum !== exprimes
    ) {
      throw new Error(`Ligne ${n} : totaux incohérents (${f[3]})`);
    }
    const departement = f[0]!;
    const offMap = OFF_MAP_AREAS[departement];
    const code = offMap ? offMap(f[2]!) : inseeCode(departement, f[2]!);
    if (code.includes('?'))
      throw new Error(`Ligne ${n} : collectivité inconnue ${departement} ${f[2]}`);
    return {
      code,
      offMap: offMap !== undefined,
      nom: offMap ? f[1]! : f[3]!,
      valeurs: [inscrits, abstentions, votants, blancs, nuls, exprimes, ...voix],
    };
  });
  if (!candidats) throw new Error('Fichier sans résultats');
  return { candidats, lines };
}
