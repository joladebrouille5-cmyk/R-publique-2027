/**
 * Lecture CSV (RFC 4180) : champs entre guillemets, guillemets doublés, séparateur au choix.
 * Les valeurs restent des chaînes : un code comme « 01001 » ou « 2A004 » n'est jamais converti.
 */
export function parseCsv(text: string, separator = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (i < source.length) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      i++;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
    i++;
  }
  if (quoted) throw new Error('CSV invalide : guillemet non refermé');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Lignes CSV en objets indexés par l'en-tête ; un nombre de colonnes différent est une erreur. */
export function csvRecords(text: string, separator = ','): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text, separator);
  if (!header) return [];
  return rows.map((row, index) => {
    if (row.length !== header.length) {
      throw new Error(
        `CSV invalide ligne ${index + 2} : ${row.length} colonnes (${header.length} attendues)`,
      );
    }
    return Object.fromEntries(header.map((name, i) => [name, row[i]!]));
  });
}
