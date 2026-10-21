// Infobox des articles Wikipédia (émissions, chaînes, stations, journaux) : seuls des champs
// factuels en sont lus (chaîne ou station, présentation, diffusion, statut, logo). Aucune
// phrase de l'article n'est reprise.
import { ImportError } from '../geometry/coverage';

export type Infobox = { modele: string; champs: Map<string, string> };

/** Découpe au premier niveau (hors `[[…]]` et `{{…}}`) selon `|`. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      current += two;
      i++;
    } else if (text[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += text[i];
  }
  parts.push(current);
  return parts;
}

/** Première infobox de l'article (`{{Infobox …}}`), champs par nom (premier occurrence). */
export function infobox(wikitext: string): Infobox | null {
  const start = wikitext.search(/\{\{\s*Infobox\s/i);
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === '{{') {
      depth++;
      i++;
    } else if (two === '}}') {
      depth--;
      i++;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new ImportError('Infobox non refermée.');
  const body = wikitext.slice(start + 2, end - 2).replace(/<!--[\s\S]*?-->/g, '');
  const [head, ...params] = splitTopLevel(body);
  const champs = new Map<string, string>();
  for (const param of params) {
    const eq = param.indexOf('=');
    if (eq < 0) continue;
    const name = param.slice(0, eq).trim().toLowerCase();
    if (!champs.has(name)) champs.set(name, param.slice(eq + 1).trim());
  }
  return { modele: head!.replace(/^\s*Infobox\s+/i, '').trim(), champs };
}

/** Cibles et libellés des liens internes `[[Cible|Libellé]]` (hors fichiers et catégories). */
export function links(value: string): { cible: string; libelle: string }[] {
  return [...value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)]
    .filter((m) => !/^(Fichier|File|Image|Catégorie|Category):/i.test(m[1]!.trim()))
    .map((m) => ({ cible: m[1]!.trim(), libelle: (m[2] ?? m[1]!).trim() }));
}

const pad = (n: string) => n.padStart(2, '0');

/** Modèles courants rendus en texte ; les autres sont supprimés. */
function renderTemplate(inner: string): string {
  const [name, ...args] = splitTopLevel(inner).map((s) => s.trim());
  const positional = args.filter((a) => !/^[a-zé ]+=/i.test(a));
  switch ((name ?? '').toLowerCase()) {
    case 'heure':
    case 'heures':
      return positional[1] ? `${positional[0]} h ${pad(positional[1])}` : `${positional[0]} h`;
    case 'nobr':
    case 'nowrap':
    case 'lang':
      return positional[positional.length - 1] ?? '';
    case 'date':
    case 'date-':
      return positional.slice(0, 3).filter(Boolean).join(' ');
    default:
      return '';
  }
}

/** Texte lisible d'une valeur d'infobox : liens, modèles simples, balises et notes retirés. */
export function plain(value: string): string {
  let text = value
    .replace(/<ref[^>/]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<br\s*\/?>/gi, ' ; ');
  // Modèles, du plus intérieur au plus extérieur.
  for (let guard = 0; guard < 10 && /\{\{/.test(text); guard++)
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => renderTemplate(inner));
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s;—–-]+|[\s;]+$/g, '')
    .trim();
}

/** Nom du fichier d'une valeur d'image (`X.svg`, `[[Fichier:X.svg|…]]`), sans espace de noms. */
export function imageFile(value: string | undefined): string | null {
  if (!value) return null;
  const inner = /\[\[\s*(?:Fichier|File|Image)\s*:\s*([^|\]]+)/i.exec(value)?.[1] ?? value;
  const name = inner
    .replace(/^(Fichier|File|Image)\s*:/i, '')
    .split('|')[0]!
    .replace(/_/g, ' ')
    .trim();
  return /\.(svg|png|jpe?g|gif|webp)$/i.test(name) ? name : null;
}

/** Cible d'une page de redirection (`#REDIRECTION [[Cible]]`), sinon null. */
export function redirectTarget(wikitext: string): string | null {
  return /^\s*#(?:REDIRECT|REDIRECTION)\s*\[\[([^\]|#]+)/i.exec(wikitext)?.[1]?.trim() ?? null;
}

/** Page d'homonymie (`{{Homonymie}}`) : aucun fait à en tirer. */
export const isDisambiguation = (wikitext: string) => /\{\{\s*Homonymie\s*[|}]/i.test(wikitext);
