// Lecture de l'infobox « Personnalité politique » d'un article de Wikipédia en français : les
// fonctions (`fonctionN`) et leurs dates (`depuis le fonctionN`, `à partir du fonctionN`,
// `jusqu'au fonctionN`). Seuls des libellés de fonctions et des dates en sont repris ; aucune
// phrase de l'article. Nature de chaque fonction déduite de son libellé (règles documentées).
import type { FigureFunction, FigureFunctionKind } from '@r2027/shared';
import { ImportError } from '../geometry/coverage';
import { parseFrenchDate, readable } from '../personnalites/wikitext';

/** Texte d'un modèle (`{{Nom …}}`), accolades équilibrées, à partir de sa première occurrence. */
export function template(wikitext: string, name: string): string {
  const start = wikitext.indexOf(`{{${name}`);
  if (start < 0) throw new ImportError(`Modèle « ${name} » absent de l'article.`);
  let depth = 0;
  for (let i = start; i < wikitext.length - 1; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === '{{') {
      depth++;
      i++;
    } else if (two === '}}') {
      depth--;
      i++;
      if (depth === 0) return wikitext.slice(start, i + 1);
    }
  }
  throw new ImportError(`Modèle « ${name} » non refermé.`);
}

/** Clé de paramètre normalisée : minuscules, apostrophe droite, sans espace avant le numéro. */
const normalizeKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/ (\d+)$/, '$1');

/** Paramètres nommés d'un modèle (découpe sur les « | » hors liens, modèles et références). */
export function templateParams(text: string): Map<string, string> {
  const inner = text.replace(/^\{\{/, '').replace(/\}\}$/, '');
  const parts: string[] = [];
  let depth = 0;
  let inRef = false;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (inner.startsWith('<ref', i) && !/^<ref[^>]*\/>/.test(inner.slice(i, i + 200))) inRef = true;
    if (inRef && inner.startsWith('</ref>', i)) inRef = false;
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth--;
      current += two;
      i++;
    } else if (inner[i] === '|' && depth === 0 && !inRef) {
      parts.push(current);
      current = '';
    } else current += inner[i];
  }
  parts.push(current);
  const params = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(normalizeKey(part.slice(0, eq)), part.slice(eq + 1).trim());
  }
  return params;
}

/** Retire les modèles dont le nom correspond à `name` (accolades équilibrées, imbrications comprises). */
function removeTemplates(text: string, name: RegExp): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('{{', i) && name.test(text.slice(i + 2, i + 40))) {
      let depth = 0;
      let j = i;
      for (; j < text.length - 1; j++) {
        if (text.startsWith('{{', j)) {
          depth++;
          j++;
        } else if (text.startsWith('}}', j)) {
          depth--;
          j++;
          if (depth === 0) break;
        }
      }
      i = j;
      continue;
    }
    out += text[i];
  }
  return out;
}

const withoutNotes = (text: string) =>
  removeTemplates(
    text
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ''),
    /^\s*(note|efn|référence nécessaire|refnec)\b/i,
  );

/**
 * Marque provisoire d'un retour à la ligne (`<br>`) pendant la mise en forme du libellé : un
 * caractère à usage privé, absent des textes de Wikipédia (et non un caractère de contrôle).
 */
const LINE_BREAK = '\uE000';

/** Titre qui, après un retour à la ligne, ouvre une seconde fonction cumulée (« A, ministre B »). */
const SECOND_TITLE =
  /\s*\uE000\s*(Ministre|Garde des Sceaux|Porte-parole|Secrétaire|Haute?-commissaire|Présidente?|Vice-présidente?)\b/g;

/**
 * Libellé lisible d'une valeur de l'infobox : références et notes retirées, liens réduits. Un
 * retour à la ligne suivi d'un second titre devient une virgule (« Ministre d'État, garde des
 * Sceaux… ») ; ailleurs, la phrase continue (« conseil régional<br>d'Auvergne » → une espace).
 */
export function cleanValue(text: string): string {
  const kept = withoutNotes(text)
    .replace(/\{\{\s*(?:nobr|nowrap)\s*\|([^{}|]*)\}\}/gi, '$1')
    .replace(/<br\s*\/?>/gi, LINE_BREAK);
  return readable(kept)
    .replace(SECOND_TITLE, (_m, title: string) => `, ${title[0]!.toLowerCase()}${title.slice(1)}`)
    .replaceAll(LINE_BREAK, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/[\s,;]+$/, '')
    .trim();
}

const DATE_IN_TEXT =
  /\{\{[Dd]ate\|[^}]+\}\}|\b(?:\d{1,2}|1er)\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/;

/** Date d'une valeur de l'infobox : jour si possible, sinon l'année ; null si aucune. */
export function dateValue(text: string | undefined): string | null {
  if (!text) return null;
  const cleaned = withoutNotes(text).trim();
  if (!cleaned) return null;
  const whole = parseFrenchDate(cleaned);
  if (whole) return whole;
  const part = DATE_IN_TEXT.exec(cleaned);
  const day = part ? parseFrenchDate(part[0]) : null;
  if (day) return day;
  const year = /\b(1[89]\d\d|20\d\d)\b/.exec(cleaned);
  return year ? year[1]! : null;
}

/**
 * Nature d'une fonction d'après son libellé : présidence de la République, Premier ministre,
 * ministre (ou garde des Sceaux),
 * secrétaire d'État ou ministre délégué, mandat parlementaire (député, sénateur, député
 * européen), exécutif local (maire, présidence d'un conseil régional, départemental ou général,
 * d'une métropole ou d'une communauté), direction (présidence ou secrétariat national d'un parti,
 * présidence d'un groupe, d'une assemblée, d'une commission, d'une association d'élus).
 */
export function classify(libelle: string): FigureFunctionKind {
  const l = libelle.toLowerCase().replace(/’/g, "'");
  if (/^présidente? de la république\b/.test(l)) return 'president-republique';
  if (/^premi(er|ère) ministre\b/.test(l)) return 'premier-ministre';
  if (/^(secrétaire d'état|ministre délégué)/.test(l)) return 'secretaire-etat';
  if (/^(ministre|garde des sceaux)\b/.test(l)) return 'ministre';
  if (/^(député|sénateur|sénatrice)/.test(l)) return 'parlementaire';
  if (
    /^maire\b/.test(l) ||
    /^présidente? (du|de la|de l') ?(conseil (régional|départemental|général)|métropole|communauté)/.test(
      l,
    )
  )
    return 'executif-local';
  if (
    /^(présidente? (du|de la|de l'|des|de) ?|premier secrétaire|première secrétaire|secrétaire national|secrétaire général|coordinat(eur|rice)|co-coordinat)/.test(
      l,
    )
  )
    return 'direction';
  return 'autre';
}

/** Fonctions de l'infobox, dans l'ordre de l'article (numéros croissants). */
export function infoboxFunctions(wikitext: string): FigureFunction[] {
  const params = templateParams(template(wikitext, 'Infobox Personnalité politique'));
  const numbers = [...params.keys()]
    .map((k) => /^fonction(\d+)$/.exec(k)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const functions: FigureFunction[] = [];
  for (const n of numbers) {
    const libelle = cleanValue(params.get(`fonction${n}`) ?? '');
    if (!libelle) continue;
    const debut =
      dateValue(params.get(`depuis le fonction${n}`)) ??
      dateValue(params.get(`à partir du fonction${n}`));
    const fin = dateValue(params.get(`jusqu'au fonction${n}`));
    functions.push({
      libelle,
      debut,
      fin,
      enCours: fin === null && debut !== null,
      nature: classify(libelle),
    });
  }
  if (functions.length === 0) throw new ImportError('Aucune fonction dans l’infobox.');
  return functions;
}
