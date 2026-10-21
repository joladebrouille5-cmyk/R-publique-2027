// Lecture minimale d'un classeur Excel (.xlsx) : archive ZIP (entrées stockées ou compressées
// par « deflate »), chaînes partagées et cellules de chaque feuille, sans dépendance. Suffit
// pour les tableaux publiés par Médiamétrie (valeurs et libellés, sans formules ni styles).
import { inflateRawSync } from 'node:zlib';
import { ImportError } from '../geometry/coverage';

/** Fichiers d'une archive ZIP, par chemin. */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin (commentaire éventuel).
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ImportError('Archive ZIP illisible : fin du répertoire central absente.');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new ImportError('Archive ZIP illisible : entrée du répertoire central invalide.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (buffer.readUInt32LE(local) !== 0x04034b50)
      throw new ImportError(`Archive ZIP illisible : en-tête local invalide (${name}).`);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + compressed);
    let content: Buffer;
    if (method === 0) content = Buffer.from(data);
    else if (method === 8) content = inflateRawSync(data);
    else
      throw new ImportError(`Archive ZIP : méthode de compression ${method} non prise en charge.`);
    if (content.length !== size)
      throw new ImportError(`Archive ZIP : taille inattendue pour ${name}.`);
    files.set(name, content);
  }
  return files;
}

const decodeXml = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Texte d'un élément `<si>` ou `<is>` (texte simple ou suite de segments `<r><t>`). */
const richText = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join('');

/** Feuille : cellules non vides, par référence (« B12 »), en texte. */
export type Sheet = Map<string, string>;

/** Feuilles d'un classeur, par nom d'onglet. */
export function readXlsx(buffer: Buffer): Map<string, Sheet> {
  const files = unzip(buffer);
  const text = (path: string) => {
    const file = files.get(path);
    if (!file) throw new ImportError(`Classeur incomplet : ${path} absent.`);
    return file.toString('utf8');
  };
  const shared = files.has('xl/sharedStrings.xml')
    ? [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        richText(m[1]!),
      )
    : [];
  const rels = new Map(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s([^>]*)\/?>/g)].map((m) => [
      /Id="([^"]+)"/.exec(m[1]!)?.[1] ?? '',
      /Target="([^"]+)"/.exec(m[1]!)?.[1] ?? '',
    ]),
  );
  const sheets = new Map<string, Sheet>();
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\s([^>]*)\/>/g)) {
    const name = decodeXml(/name="([^"]*)"/.exec(m[1]!)?.[1] ?? '');
    const target = rels.get(/r:id="([^"]+)"/.exec(m[1]!)?.[1] ?? '');
    if (!target) throw new ImportError(`Classeur : feuille « ${name} » sans fichier.`);
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const cells: Sheet = new Map();
    for (const c of text(path).matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(c[1]!)?.[1];
      const type = /t="(\w+)"/.exec(c[1]!)?.[1];
      const inner = c[2] ?? '';
      if (!ref) continue;
      let value: string | null = null;
      if (type === 'inlineStr') value = richText(inner);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) value = type === 's' ? (shared[Number(v)] ?? null) : decodeXml(v);
      }
      if (value !== null && value.trim() !== '') cells.set(ref, value);
    }
    sheets.set(name, cells);
  }
  return sheets;
}

/** Lignes d'une feuille : numéro de ligne → cellules par colonne (« B » → valeur). */
export function sheetRows(sheet: Sheet): Map<number, Map<string, string>> {
  const rows = new Map<number, Map<string, string>>();
  for (const [ref, value] of sheet) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const row = Number(m[2]);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row)!.set(m[1]!, value);
  }
  return new Map([...rows].sort((a, b) => a[0] - b[0]));
}
