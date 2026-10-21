// Lecture du wikicode de l'article « Candidatures à l'élection présidentielle française de
// 2027 » (Wikipédia en français) : lignes du tableau des candidats déclarés, dates, références
// de presse et fichier de la photo. Seuls des faits datés et sourcés en sont tirés ; aucune
// phrase de l'article n'est reprise telle quelle dans le jeu (formulations neutres rédigées).
import { ImportError } from '../geometry/coverage';

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

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (day: number, month: number, year: number) => `${year}-${pad(month)}-${pad(day)}`;
const monthIndex = (name: string) => MONTHS.indexOf(name.toLowerCase().trim()) + 1;

/** Ligne du tableau : en-tête (nom, parti) puis cellules, wikicode brut. */
export type TableRow = {
  /** Clé de recherche : « Prénom Nom ». */
  nom: string;
  cells: string[];
  raw: string;
};

/**
 * Texte propre d'une section (`== Titre ==` ou `=== Titre ===`) : jusqu'au titre suivant, quel
 * que soit son niveau (une sous-section n'appartient pas au texte propre de la section).
 */
export function section(wikitext: string, title: string): string {
  const lines = wikitext.split('\n');
  const start = lines.findIndex((l) => {
    const m = /^(={2,3})\s*(.+?)\s*\1\s*$/.exec(l);
    return m !== null && m[2] === title;
  });
  if (start < 0) throw new ImportError(`Section « ${title} » absente de l'article.`);
  let end = lines.findIndex((l, i) => i > start && /^==/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

function rowName(header: string): string {
  const tri = /\{\{TriNom\|([^|}]+)\|([^|}]+)/.exec(header);
  if (tri) return `${tri[1]!.trim()} ${tri[2]!.trim()}`;
  const plain = header.replace(/^!\s*/, '').split('<br')[0]!;
  return plain.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim();
}

/**
 * Lignes d'un tableau wiki : une ligne commence par `|-` suivi d'un en-tête `!`. Les cellules
 * commencent par `|` ou `!` en début de ligne ; une cellule peut porter des attributs
 * (`width="9%" | contenu`).
 */
export function tableRows(text: string): TableRow[] {
  const lines = text.split('\n');
  const rows: TableRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith('|-') || !lines[i + 1]?.startsWith('!')) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !lines[j]!.startsWith('|-') && !lines[j]!.startsWith('|}')) {
      body.push(lines[j]!);
      j++;
    }
    const cells: string[] = [];
    for (const line of body) {
      if (line.startsWith('|') || line.startsWith('!'))
        cells.push(stripCellAttributes(line.slice(1)));
      else if (cells.length) cells[cells.length - 1] += `\n${line}`;
    }
    rows.push({ nom: rowName(body[0]!), cells, raw: body.join('\n') });
    i = j - 1;
  }
  return rows;
}

/** Retire les attributs d'une cellule (`width="9%" | …`) sans toucher aux liens ni modèles. */
function stripCellAttributes(cell: string): string {
  const m = /^\s*((?:[a-z-]+="[^"]*"\s*)+)\|(.*)$/s.exec(cell);
  return (m ? m[2]! : cell).trim();
}

/** Date française d'un modèle ou d'un texte : {{date|8 décembre 2025}}, {{Date|01|04|2025}}, « 3 mai 2026 »… */
export function parseFrenchDate(text: string): string | null {
  const t = text.trim();
  let m = /^\{\{[Dd]ate\|(\d{1,2})\|(\d{1,2})\|(\d{4})\}\}$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^\{\{[Dd]ate\|(\d{1,2})\|([a-zéû]+)\|(\d{4})(?:\|[^}]*)?\}\}$/.exec(t);
  if (m && monthIndex(m[2]!)) return iso(Number(m[1]), monthIndex(m[2]!), Number(m[3]));
  m = /^\{\{[Dd]ate\|(\d{1,2})\/(\d{1,2})\/(\d{4})\}\}$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(?:\{\{[Dd]ate\|)?(\d{1,2}|1er)\s+([a-zéû]+)\s+(\d{4})(?:\}\})?$/.exec(t);
  if (m && monthIndex(m[2]!)) {
    return iso(m[1] === '1er' ? 1 : Number(m[1]), monthIndex(m[2]!), Number(m[3]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  return null;
}

const DATE_PATTERN =
  /\{\{[Dd]ate\|[^}]+\}\}|\b(?:\d{1,2}|1er)\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/g;

/**
 * Position, dans le wikicode, de la première mention de la date `isoDate` dans le texte de la
 * ligne (les références sont masquées : une date de publication ne compte pas).
 */
export function findDate(raw: string, isoDate: string): number {
  const masked = raw.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, (m) =>
    ' '.repeat(m.length),
  );
  for (const m of masked.matchAll(DATE_PATTERN)) {
    if (parseFrenchDate(m[0]) === isoDate) return m.index;
  }
  return -1;
}

export type Citation = {
  titre: string;
  url: string;
  site: string | null;
  date: string | null;
};

/** Paramètres d'un modèle de citation ({{Lien web}}, {{Article}}). */
function templateParams(template: string): Map<string, string> {
  const inner = template.replace(/^\{\{/, '').replace(/\}\}$/, '');
  const params = new Map<string, string>();
  // Découpe sur les « | » de premier niveau (hors liens et modèles imbriqués).
  let depth = 0;
  let current = '';
  const parts: string[] = [];
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth--;
      current += two;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += inner[i];
  }
  parts.push(current);
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  return params;
}

const linkLabel = (text: string) =>
  text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/''+/g, '')
    .trim();

/** Citation d'une référence <ref>…</ref> ; null si elle n'a ni titre ni URL. */
export function parseCitation(ref: string): Citation | null {
  const template = /\{\{\s*(?:Lien web|Article|lien web|article)\s*\|[\s\S]*\}\}/.exec(ref);
  if (!template) return null;
  const p = templateParams(template[0]);
  const url = p.get('url') ?? p.get('lire en ligne');
  const titre = p.get('titre');
  if (!url || !titre) return null;
  const site = p.get('site') ?? p.get('périodique') ?? p.get('journal') ?? p.get('éditeur') ?? null;
  const date = p.get('date') ? parseFrenchDate(p.get('date')!) : null;
  return { titre: linkLabel(titre), url: url.trim(), site: site ? linkLabel(site) : null, date };
}

/**
 * Première référence citée après la position `from` de la ligne ; une référence nommée
 * réutilisée (`<ref name="x" />`) est résolue dans tout l'article.
 */
export function citationAfter(raw: string, from: number, article: string): Citation {
  const re = /<ref(?:\s+name\s*=\s*"?([^">/]+?)"?)?\s*(\/>|>([\s\S]*?)<\/ref>)/g;
  re.lastIndex = from;
  const m = re.exec(raw);
  if (!m) throw new ImportError('Aucune référence après la date de la candidature.');
  let body = m[3];
  if (body === undefined) {
    const name = m[1]!.trim();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const def = new RegExp(`<ref\\s+name\\s*=\\s*"?${escaped}"?\\s*>([\\s\\S]*?)</ref>`).exec(
      article,
    );
    if (!def) throw new ImportError(`Référence nommée « ${name} » introuvable.`);
    body = def[1]!;
  }
  const citation = parseCitation(body);
  if (!citation)
    throw new ImportError('Référence sans titre ni URL après la date de la candidature.');
  return citation;
}

/** Fichier de la photo (cellule qui suit l'en-tête), ou null s'il n'y en a pas. */
export function photoFile(row: TableRow): string | null {
  const m = /\[\[(?:Fichier|File|Image):([^|\]]+)/.exec(row.cells[1] ?? '');
  return m ? m[1]!.trim().replace(/ /g, '_') : null;
}

/**
 * Texte lisible : références, fichiers et mise en forme retirés, liens réduits à leur libellé,
 * modèles courants rendus (circonscription, ordinaux, dates), contenu des notes conservé.
 */
export function readable(text: string): string {
  let out = text
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\[\[(?:Fichier|File|Image):(?:[^[\]]|\[\[[^\]]*\]\])*\]\]/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(
      /\{\{Circonscription fr\|(\d+)\|([^}]+)\}\}/g,
      (_m, n: string, dep: string) => `${n}${n === '1' ? 're' : 'e'} circonscription (${dep})`,
    )
    .replace(/\{\{(\d+)(?:e|er|re)\}\}/g, (_m, n: string) => `${n}${n === '1' ? 'er' : 'e'}`)
    .replace(/\{\{1er\|([^}]*)\}\}/g, '1er $1')
    .replace(/\{\{2d\|([^}]*)\}\}/g, '2d $1')
    .replace(/\{\{[Dd]ate\|[^}]+\}\}/g, (m) => {
      const d = parseFrenchDate(m);
      if (!d) return '';
      const [y, mo, da] = d.split('-').map(Number);
      return `${da === 1 ? '1er' : da} ${MONTHS[mo! - 1]} ${y}`;
    })
    .replace(/\{\{[Nn]ote\|(?:[^|{}]*\|)*?texte=([^{}]*?)(?:\|[a-z]+=[^{}|]*)*\}\}/g, ' ($1) ');
  // Modèles restants (y compris imbriqués) retirés de l'intérieur vers l'extérieur.
  while (/\{\{[^{}]*\}\}/.test(out)) out = out.replace(/\{\{[^{}]*\}\}/g, '');
  return out
    .replace(/<sup>(.*?)<\/sup>/g, '$1')
    .replace(/<\/?(small|br)\s*\/?>/g, ' ')
    .replace(/''+/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fonctions en cours : puces de la quatrième cellule (« Aucune » ⇒ liste vide). */
export function currentFunctions(row: TableRow): string[] {
  const cell = row.cells[3] ?? '';
  return cell
    .split('\n')
    .filter((l) => l.trim().startsWith('*'))
    .map((l) => readable(l.replace(/^\s*\*\s*/, '')))
    .filter((l) => l.length > 0);
}

/** Vérifie qu'un fait cité figure dans la ligne (texte lisible) ; sinon l'import échoue. */
export function assertFact(row: TableRow, fact: string): void {
  if (!readable(row.raw).includes(fact)) {
    throw new ImportError(`${row.nom} : fait introuvable dans la source : « ${fact} ».`);
  }
}
