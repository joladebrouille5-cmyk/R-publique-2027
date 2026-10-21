// Mesures d'audience : Médiamat mensuel (télévision, Médiamétrie), EAR National (radio,
// Médiamétrie) et OneNext (presse quotidienne, ACPM). Chaque lecture vérifie la présence des
// libellés attendus (indicateur, population, période) avant de reprendre les valeurs.
import { ImportError } from '../geometry/coverage';
import { sheetRows, type Sheet } from './xlsx';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Date d'un numéro de série Excel (jours depuis le 30/12/1899). */
export function excelDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Libellé de mois « septembre 2026 » d'une date ISO. */
export const monthLabel = (iso: string) =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const number = (value: string | undefined, context: string): number => {
  const v = Number((value ?? '').replace(',', '.'));
  if (!Number.isFinite(v)) throw new ImportError(`${context} : valeur illisible « ${value} ».`);
  return v;
};

/** Normalisation des libellés pour les rapprochements (casse, accents, apostrophes, espaces). */
export const normalizeLabel = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export type Measures = {
  /** Période telle qu'affichée (« septembre 2026 », « avril - juin 2026 », « 2026 S1 »). */
  periode: string;
  /** Valeur par libellé normalisé, avec le libellé d'origine. */
  valeurs: Map<string, { libelle: string; valeur: number }>;
};

/**
 * Médiamat mensuel, onglet des parts d'audience et couvertures des chaînes : part d'audience
 * (%) des individus de 4 ans et plus, mois en cellule C3 (numéro de série Excel).
 */
export function parseMediamat(sheets: Map<string, Sheet>): Measures & { mois: string } {
  const entry = [...sheets].find(([, sheet]) =>
    [...sheet.values()].some((v) => /^Part d.audience \(%\)$/.test(v.trim())),
  );
  if (!entry) throw new ImportError('Médiamat : onglet des parts d’audience introuvable.');
  const rows = sheetRows(entry[1]);
  const header = rows.get(1);
  const pdaColumn = [...(header ?? [])].find(([, v]) =>
    /^Part d.audience \(%\)$/.test(v.trim()),
  )?.[0];
  if (!pdaColumn) throw new ImportError('Médiamat : colonne de part d’audience introuvable.');
  const serial = number(rows.get(3)?.get(pdaColumn), 'Médiamat, mois (C3)');
  const mois = excelDate(serial);
  if (!/^\d{4}-\d{2}-01$/.test(mois))
    throw new ImportError(`Médiamat : le mois lu (${mois}) n’est pas un premier du mois.`);
  // Population : la couverture « Total TV » doit être celle des individus de 4 ans et plus.
  const targets = [...sheets.values()].flatMap((sheet) => [...sheetRows(sheet).values()]);
  const fourPlus = targets.find((r) => /Individus de 4 ans et \+/.test(r.get('A') ?? ''));
  const totalTv = [...rows.values()].find((r) => r.get('B')?.trim() === 'Total TV');
  if (!fourPlus || !totalTv || fourPlus.get('B') !== totalTv.get('D'))
    throw new ImportError('Médiamat : population des individus de 4 ans et plus non vérifiée.');
  const valeurs = new Map<string, { libelle: string; valeur: number }>();
  for (const [n, r] of rows) {
    if (n <= 7) continue;
    const libelle = r.get('B')?.trim();
    const value = r.get(pdaColumn);
    if (!libelle || value === undefined) continue;
    valeurs.set(normalizeLabel(libelle), {
      libelle,
      valeur: number(value, `Médiamat, ${libelle}`),
    });
  }
  return { mois, periode: monthLabel(mois), valeurs };
}

/**
 * EAR National, onglet « 2 » (lundi-vendredi) : part d'audience (%) des 13 ans et plus pour la
 * vague la plus récente (premier bloc de colonnes AC, DEA, PDA).
 */
export function parseEar(sheets: Map<string, Sheet>): Measures {
  const sheet = sheets.get('2');
  if (!sheet) throw new ImportError('EAR : onglet « 2 » (lundi-vendredi) absent.');
  const rows = sheetRows(sheet);
  const title = [...rows.values()].flatMap((r) => [...r.values()]).join(' ');
  if (!/Lundi-Vendredi/i.test(title))
    throw new ImportError('EAR : l’onglet « 2 » ne porte pas sur le lundi-vendredi.');
  const population = [...(sheets.get('1B')?.values() ?? [])].join(' ');
  if (!/13 ans et plus/.test(population))
    throw new ImportError('EAR : population des 13 ans et plus non indiquée (onglet 1B).');
  // Ligne des vagues puis ligne des indicateurs (« AC », « DEA », « PDA »).
  const waveRow = [...rows].find(([, r]) =>
    [...r.values()].some((v) => /^[A-Z][a-zé]+ - [A-Z][a-zé]+ \d{4}$/.test(v.trim())),
  );
  if (!waveRow) throw new ImportError('EAR : ligne des vagues introuvable.');
  const [waveIndex, waves] = waveRow;
  const columns = [...waves].sort((a, b) => col(a[0]) - col(b[0]));
  const [firstColumn, periode] = columns[0]!;
  const nextColumn = columns[1]?.[0];
  const indicators = rows.get(waveIndex + 1);
  const pda = [...(indicators ?? [])].find(
    ([c, v]) =>
      v.trim() === 'PDA' && col(c) >= col(firstColumn) && (!nextColumn || col(c) < col(nextColumn)),
  )?.[0];
  if (!pda) throw new ImportError('EAR : colonne de part d’audience (PDA) introuvable.');
  if (
    !rows
      .get(waveIndex + 2)
      ?.get(pda)
      ?.includes('%')
  )
    throw new ImportError('EAR : la part d’audience n’est pas exprimée en %.');
  const valeurs = new Map<string, { libelle: string; valeur: number }>();
  for (const [n, r] of rows) {
    if (n <= waveIndex + 2) continue;
    const libelle = r.get('B')?.trim();
    const value = r.get(pda);
    if (!libelle || value === undefined || value === 'ND') continue;
    valeurs.set(normalizeLabel(libelle), { libelle, valeur: number(value, `EAR, ${libelle}`) });
  }
  return { periode: periode.trim().toLowerCase(), valeurs };
}

/** Indice d'une colonne Excel (« A » → 1, « AB » → 28). */
function col(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

const decodeHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Classement OneNext de l'ACPM (page HTML) : lecteurs au numéro moyen (LNM) de chaque titre ;
 * une seule période doit figurer dans le classement.
 */
export function parseOneNext(html: string): Measures {
  const table = /<table[\s\S]*?<\/table>/.exec(html)?.[0];
  if (!table) throw new ImportError('ACPM : tableau du classement introuvable.');
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) =>
    [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decodeHtml(c[1]!)),
  );
  const header = rows[0] ?? [];
  const titre = header.indexOf('Titre');
  const periode = header.indexOf('Période');
  const lnm = header.indexOf('Lecteurs au Numéro Moyen (LNM)');
  if (titre < 0 || periode < 0 || lnm < 0)
    throw new ImportError('ACPM : colonnes Titre, Période ou LNM absentes.');
  const valeurs = new Map<string, { libelle: string; valeur: number }>();
  const periods = new Set<string>();
  for (const r of rows.slice(1)) {
    if (r.length <= lnm) continue;
    const libelle = r[titre]!;
    const value = Number(r[lnm]!.replace(/\s/g, ''));
    if (!Number.isInteger(value) || value <= 0)
      throw new ImportError(`ACPM : lectorat illisible pour ${libelle} (« ${r[lnm]} »).`);
    periods.add(r[periode]!);
    valeurs.set(normalizeLabel(libelle), { libelle, valeur: value });
  }
  if (periods.size !== 1)
    throw new ImportError(`ACPM : ${periods.size} périodes dans le classement au lieu d’une.`);
  return { periode: [...periods][0]!, valeurs };
}
