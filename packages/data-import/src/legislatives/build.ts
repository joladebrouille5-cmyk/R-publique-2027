// Résultats des législatives de 2024 par circonscription (`packages/rulesets/src/legislatives-2024.json`)
// à partir des fichiers du ministère de l'Intérieur publiés sur data.gouv.fr (Licence Ouverte
// 2.0) : premier tour (voix par nuance) et second tour (nuance de l'élu). Aucun nom de
// candidat n'est conservé. Codes toujours en chaînes ; les zéros initiaux absents du fichier du
// premier tour (« 1 », « 101 ») sont rétablis.
import { RealLegislativesSchema, type RealLegislatives } from '@r2027/shared';
import { parseCsv } from '../cog/csv';
import { ImportError } from '../geometry/coverage';

type Row = Record<string, string>;

function rowsOf(text: string): Row[] {
  const [header, ...rows] = parseCsv(text, ';').filter((r) => r.length > 1);
  if (!header) throw new ImportError('Fichier de résultats vide.');
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** Département normalisé : « 1 » → « 01 » ; « 2A », « 971 », « ZZ » inchangés. */
export function normalizeDepartement(raw: string): string {
  const code = raw.trim();
  return /^\d$/.test(code) ? `0${code}` : code;
}

/** Circonscription normalisée : département + numéro sur deux chiffres (« 101 » → « 0101 »). */
export function normalizeCirconscription(rawDepartement: string, rawCode: string): string {
  const dep = rawDepartement.trim();
  const code = rawCode.trim();
  if (!code.startsWith(dep)) throw new ImportError(`Code ${code} hors du département ${dep}.`);
  const number = code.slice(dep.length);
  if (!/^\d{1,2}$/.test(number))
    throw new ImportError(`Numéro de circonscription illisible : ${code}`);
  return `${normalizeDepartement(dep)}${number.padStart(2, '0')}`;
}

const integer = (text: string | undefined, what: string): number => {
  const value = Number((text ?? '').replace(/\s/g, ''));
  if (!Number.isInteger(value) || value < 0)
    throw new ImportError(`${what} illisible : « ${text} »`);
  return value;
};

/** Candidats d'une ligne : colonnes « Nuance candidat n », « Voix n », « Elu n ». */
function candidates(row: Row) {
  const list: { nuance: string; voix: number; elu: boolean }[] = [];
  for (let n = 1; `Nuance candidat ${n}` in row; n++) {
    const nuance = row[`Nuance candidat ${n}`]!.trim();
    if (!nuance) continue;
    list.push({
      nuance,
      voix: integer(row[`Voix ${n}`], `Voix ${n}`),
      elu: (row[`Elu ${n}`] ?? '').trim() !== '',
    });
  }
  return list;
}

export type LegislativeInputs = {
  verifieLe: string;
  t1: string;
  t2: string;
  sources: RealLegislatives['sources'];
};

/** Circonscriptions lues dans les deux fichiers, triées par code (sans contrôle de leur nombre). */
export function buildDistricts(t1: string, t2: string): RealLegislatives['circonscriptions'] {
  const secondRound = new Map<string, string>();
  for (const row of rowsOf(t2)) {
    const code = normalizeCirconscription(
      row['Code département']!,
      row['Code circonscription législative']!,
    );
    const elected = candidates(row).filter((c) => c.elu);
    if (elected.length !== 1)
      throw new ImportError(`${code} : ${elected.length} élu(s) au second tour.`);
    secondRound.set(code, elected[0]!.nuance);
  }

  const circonscriptions = rowsOf(t1).map((row) => {
    const departement = normalizeDepartement(row['Code département']!);
    const code = normalizeCirconscription(
      row['Code département']!,
      row['Code circonscription législative']!,
    );
    const list = candidates(row);
    const voix: Record<string, number> = {};
    for (const c of list) voix[c.nuance] = (voix[c.nuance] ?? 0) + c.voix;
    const firstRound = list.filter((c) => c.elu);
    const t2 = secondRound.get(code);
    if (firstRound.length + (t2 ? 1 : 0) !== 1)
      throw new ImportError(`${code} : élu au premier tour et au second, ou jamais.`);
    secondRound.delete(code);
    const exprimes = integer(row['Exprimés'], 'Exprimés');
    return {
      code,
      departement,
      libelle: `${row['Libellé département']!.trim()} — ${row['Libellé circonscription législative']!.trim()}`,
      inscrits: integer(row['Inscrits'], 'Inscrits'),
      votants: integer(row['Votants'], 'Votants'),
      exprimes,
      voix,
      ecart: exprimes - Object.values(voix).reduce((a, b) => a + b, 0),
      elu: firstRound[0]
        ? { nuance: firstRound[0].nuance, tour: 1 as const }
        : { nuance: t2!, tour: 2 as const },
    };
  });
  if (secondRound.size > 0)
    throw new ImportError(`Second tour sans premier tour : ${[...secondRound.keys()].join(', ')}`);
  return circonscriptions.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function buildLegislatives(input: LegislativeInputs): RealLegislatives {
  return RealLegislativesSchema.parse({
    verifieLe: input.verifieLe,
    election: { t1: '2024-06-30', t2: '2024-07-07' },
    sources: input.sources,
    circonscriptions: buildDistricts(input.t1, input.t2),
  });
}
