// Photos des personnalités : fichiers de Wikimedia Commons. La licence et l'auteur sont lus
// dans les champs lisibles par machine de la page du fichier (classes `licensetpl_*` et
// `fileinfotpl_aut`) ; seule une licence libre reconnue est acceptée.
import { createHash } from 'node:crypto';
import { FREE_LICENSES } from '@r2027/shared';

/** Page du fichier sur Commons. */
export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file).replace(/%2C/g, ',')}`;
}

/** Fichier original sur upload.wikimedia.org (chemin dérivé du MD5 du nom, règle de MediaWiki). */
export function originalUrl(file: string): string {
  const name = file.replace(/ /g, '_');
  const md5 = createHash('md5').update(name).digest('hex');
  return `https://upload.wikimedia.org/wikipedia/commons/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(name)}`;
}

/**
 * Nom réel du fichier affiché par une page de Commons (`wgTitle`) : une page peut être une
 * redirection vers un autre fichier, dont il faut alors télécharger l'original.
 */
export function commonsFileTitle(html: string): string | null {
  const m = /"wgTitle":("(?:[^"\\]|\\.)*")/.exec(html);
  return m ? (JSON.parse(m[1]!) as string) : null;
}

/** Texte d'un fragment HTML : balises retirées, entités décodées, espaces normalisées. */
export const decodeHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#95;/g, '_')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

export type CommonsLicense = { licence: string; licenceUrl: string | null; auteur: string };

/** Licences du fichier, dans l'ordre de la page (un fichier peut en avoir plusieurs). */
export function parseLicenses(html: string): { licence: string; licenceUrl: string | null }[] {
  const text = html.replace(/&#95;/g, '_');
  // L'élément porte plusieurs classes (« responsive-license-cc layouttemplate licensetpl »).
  const blocks = text.split(/class="(?:[^"]*\s)?licensetpl(?:\s[^"]*)?"/).slice(1);
  const field = (block: string, name: string) =>
    new RegExp(`class="(?:[^"]*\\s)?licensetpl_${name}(?:\\s[^"]*)?"[^>]*>([^<]*)<`).exec(
      block,
    )?.[1];
  return blocks
    .map((block) => {
      const short = field(block, 'short');
      const link = field(block, 'link');
      return short
        ? { licence: decodeHtml(short), licenceUrl: link ? decodeHtml(link) : null }
        : null;
    })
    .filter((l) => l !== null);
}

/** Auteur : cellule qui suit l'en-tête `fileinfotpl_aut`. */
export function parseAuthor(html: string): string | null {
  const text = html.replace(/&#95;/g, '_');
  const m = /id="fileinfotpl_aut"[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(text);
  if (!m) return null;
  const author = decodeHtml(m[1]!);
  // Certains modèles répètent le texte (libellé visible et libellé accessible) : « X X » → « X ».
  const words = author.split(' ');
  const half = words.length / 2;
  const deduplicated =
    Number.isInteger(half) && words.slice(0, half).join(' ') === words.slice(half).join(' ')
      ? words.slice(0, half).join(' ')
      : author;
  return deduplicated.length > 0 ? deduplicated : null;
}

/**
 * Licence libre et auteur, ou motif du refus (aucune licence libre reconnue, auteur absent) :
 * la fiche s'affiche alors sans photo.
 */
export function freeLicense(html: string): CommonsLicense | { refus: string } {
  const licenses = parseLicenses(html);
  const free = licenses.find((l) => FREE_LICENSES.test(l.licence));
  if (!free) {
    return {
      refus: licenses.length
        ? `licence non reconnue comme libre (${licenses.map((l) => l.licence).join(', ')})`
        : 'aucune licence lisible sur la page du fichier',
    };
  }
  const auteur = parseAuthor(html);
  if (!auteur) return { refus: 'auteur non indiqué sur la page du fichier' };
  return { ...free, auteur };
}
