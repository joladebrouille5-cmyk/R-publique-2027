// Import de la composition de l'Assemblée nationale (phase 6) : `pnpm data:assemblee`.
// Sources : liste ouverte des députés en exercice (data.assemblee-nationale.fr, Licence
// Ouverte) et enquête d'experts Chapel Hill 2024 (positions des partis de référence). Réseau
// requis. Copies brutes : data/raw/assemblee et data/raw/personnalites (jamais commitées).
// Sortie commitée : packages/rulesets/src/assemblee-2026.json, sans aucun nom de député.
// Toute nouvelle sortie impose une nouvelle version du jeu de règles (empreinte vérifiée).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssembly } from '../assemblee/build';
import { download } from '../download';
import { parseChes } from '../personnalites/ches';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/assemblee');
const RAW_CHES = join(ROOT, 'data/raw/personnalites');
const OUT_JSON = join(ROOT, 'packages/rulesets/src/assemblee-2026.json');

/** En-tête : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};

const LEGISLATURE = 17;
const LISTE_URL = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}/amo/deputes_actifs_csv_opendata/liste_deputes_libre_office.csv`;
const LISTE_LICENCE = 'Licence Ouverte / Open Licence (version non précisée sur la page)';
const CHES_2024 = {
  url: 'https://github.com/chesdata/chesdata.github.io/releases/download/ches-europe/CHES_2024_final_v2.csv',
  fichier: 'CHES_2024_final_v2.csv',
};
const CHES_LICENCE =
  'non précisée ; usage avec citation demandé (Rovny et al., « The 2024 Chapel Hill Expert Survey on political party positioning in Europe », 2025)';

const today = () => new Date().toISOString().slice(0, 10);

/** Date de dernière modification annoncée par le serveur (AAAA-MM-JJ), ou null. */
async function lastModified(url: string): Promise<string | null> {
  const response = await fetch(url, { method: 'HEAD', headers: HEADERS });
  const header = response.headers.get('last-modified');
  return header ? new Date(header).toISOString().slice(0, 10) : null;
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(RAW_CHES, { recursive: true });
  const consulteLe = today();

  console.log(`Source : ${LISTE_URL}`);
  const modified = await lastModified(LISTE_URL);
  const listePath = join(RAW, `liste_deputes_${consulteLe}.csv`);
  const liste = await download(LISTE_URL, listePath, 5, HEADERS);

  console.log(`Source : ${CHES_2024.url}`);
  const chesPath = join(RAW_CHES, CHES_2024.fichier);
  const ches = await download(CHES_2024.url, chesPath, 5, HEADERS);

  const assembly = buildAssembly({
    verifieLe: consulteLe,
    legislature: LEGISLATURE,
    csv: readFileSync(listePath, 'utf8'),
    ches2024: parseChes(readFileSync(chesPath, 'utf8'), 2024),
    sources: [
      {
        id: 'an-deputes-en-exercice',
        titre: `Assemblée nationale — liste des députés en exercice (${LEGISLATURE}e législature), fichier CSV ; seuls les groupes sont lus`,
        url: LISTE_URL,
        licence: LISTE_LICENCE,
        version: modified ? `fichier modifié le ${modified}` : 'date de modification non annoncée',
        consulteLe: liste.telechargeLe,
        sha256: liste.sha256,
      },
      {
        id: 'ches-2024',
        titre: 'Chapel Hill Expert Survey 2024 — positions moyennes des partis',
        url: CHES_2024.url,
        licence: CHES_LICENCE,
        version: 'vague 2024 (fichier final v2)',
        consulteLe: ches.telechargeLe,
        sha256: ches.sha256,
      },
    ],
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(assembly, null, 2)}\n`);
  execFileSync(join(ROOT, 'node_modules/.bin/prettier'), ['--write', OUT_JSON]);
  const filled = assembly.groupes.reduce((sum, g) => sum + g.sieges, 0);
  console.log(
    `${assembly.groupes.length} groupes, ${filled} députés en exercice, ${assembly.vacants} siège(s) vacant(s) → ${OUT_JSON}`,
  );
  for (const g of assembly.groupes)
    console.log(`  ${g.sigle.padEnd(8)} ${String(g.sieges).padStart(3)}  ${g.positionStatut}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
