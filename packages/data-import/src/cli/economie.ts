// Import des indicateurs économiques de départ (phase 6) : `pnpm data:economie`.
// Source : séries chronologiques de l'Insee, lues sur les pages publiques des séries
// (www.insee.fr, réponse JSON de la page). Réseau requis. Copies brutes : data/raw/economie
// (jamais commitées). Sortie commitée : packages/rulesets/src/economie-2026.json. Toute
// nouvelle sortie impose une nouvelle version du jeu de règles (empreinte vérifiée).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEconomy,
  parseInseeSeries,
  SERIES,
  type InseeSeries,
  type SeriesRole,
} from '../economie/build';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/economie');
const OUT_JSON = join(ROOT, 'packages/rulesets/src/economie-2026.json');

/** En-tête : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};
const PAGE = (idbank: string) => `https://www.insee.fr/fr/statistiques/serie/${idbank}`;
const DATA = (idbank: string) => `https://www.insee.fr/fr/statistiques/serie/ajax/${idbank}`;
const LICENCE =
  'non relevée (conditions de réutilisation de l’Insee non consultées) ; seules quelques valeurs publiées sont reprises, avec citation de la série';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

async function fetchSeries(idbank: string, path: string): Promise<string> {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(DATA(idbank), { headers: HEADERS });
    if (response.ok) {
      const text = await response.text();
      writeFileSync(path, text);
      return text;
    }
    console.warn(`  ${idbank} : HTTP ${response.status}, nouvel essai`);
    await sleep(2_000 * attempt);
  }
  throw new Error(`Série ${idbank} inaccessible.`);
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const consulteLe = today();
  const series = {} as Record<SeriesRole, InseeSeries>;
  const sources = [];
  for (const [role, idbank] of Object.entries(SERIES) as [SeriesRole, string][]) {
    console.log(`Source : ${PAGE(idbank)}`);
    const text = await fetchSeries(idbank, join(RAW, `${idbank}-${consulteLe}.json`));
    const parsed = parseInseeSeries(text);
    series[role] = parsed;
    sources.push({
      id: role,
      titre: `Insee — ${parsed.titre} (idbank ${idbank})`,
      url: PAGE(idbank),
      licence: LICENCE,
      version: `mise à jour du ${parsed.derniereMiseAJour}`,
      consulteLe,
      sha256: sha256(text),
    });
    await sleep(1_000);
  }
  const economy = buildEconomy({ verifieLe: consulteLe, series, sources });
  writeFileSync(OUT_JSON, `${JSON.stringify(economy, null, 2)}\n`);
  execFileSync(join(ROOT, 'node_modules/.bin/prettier'), ['--write', OUT_JSON]);
  for (const [name, indicator] of Object.entries(economy.indicateurs))
    console.log(
      `  ${name.padEnd(11)} ${String(indicator.valeur).padStart(6)}  ${indicator.periode}`,
    );
  console.log(`→ ${OUT_JSON}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
