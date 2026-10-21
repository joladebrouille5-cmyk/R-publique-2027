// Import des résultats des législatives de 2024 par circonscription (phase 6) :
// `pnpm data:legislatives`. Sources : résultats définitifs du ministère de l'Intérieur publiés
// sur data.gouv.fr (Licence Ouverte 2.0). Réseau requis. Copies brutes : data/raw/legislatives
// (jamais commitées). Sortie commitée : packages/rulesets/src/legislatives-2024.json, sans nom
// de candidat. Toute nouvelle sortie impose une nouvelle version du jeu de règles.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from '../download';
import { buildLegislatives } from '../legislatives/build';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/legislatives');
const OUT_JSON = join(ROOT, 'packages/rulesets/src/legislatives-2024.json');

/** En-tête : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};
const FILES = {
  t1: {
    id: 'legislatives-2024-t1',
    titre:
      'Ministère de l’Intérieur — Élections législatives des 30 juin et 7 juillet 2024, résultats définitifs du 1er tour par circonscription (data.gouv.fr) ; voix par nuance, sans nom de candidat',
    url: 'https://static.data.gouv.fr/resources/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour/20240710-171413/resultats-definitifs-par-circonscriptions-legislatives.csv',
    fichier: 'resultats-2024-t1-par-circonscription.csv',
  },
  t2: {
    id: 'legislatives-2024-t2',
    titre:
      'Ministère de l’Intérieur — Élections législatives des 30 juin et 7 juillet 2024, résultats définitifs du 2nd tour par circonscription (data.gouv.fr) ; nuance de l’élu, sans nom de candidat',
    url: 'https://static.data.gouv.fr/resources/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-2nd-tour/20240710-170728/resultats-definitifs-par-circonscription.csv',
    fichier: 'resultats-2024-t2-par-circonscription.csv',
  },
};

async function main() {
  mkdirSync(RAW, { recursive: true });
  const records = {} as Record<'t1' | 't2', Awaited<ReturnType<typeof download>>>;
  for (const round of ['t1', 't2'] as const) {
    console.log(`Source : ${FILES[round].url}`);
    records[round] = await download(FILES[round].url, join(RAW, FILES[round].fichier), 10, HEADERS);
  }
  const result = buildLegislatives({
    verifieLe: records.t1.telechargeLe,
    t1: readFileSync(join(RAW, FILES.t1.fichier), 'utf8'),
    t2: readFileSync(join(RAW, FILES.t2.fichier), 'utf8'),
    sources: (['t1', 't2'] as const).map((round) => ({
      id: FILES[round].id,
      titre: FILES[round].titre,
      url: FILES[round].url,
      licence: 'Licence Ouverte / Open Licence version 2.0',
      version: 'résultats définitifs (fichier du 10/07/2024)',
      consulteLe: records[round].telechargeLe,
      sha256: records[round].sha256,
    })),
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(result)}\n`);
  execFileSync(join(ROOT, 'node_modules/.bin/prettier'), ['--write', OUT_JSON]);
  const firstRound = result.circonscriptions.filter((d) => d.elu.tour === 1).length;
  console.log(
    `${result.circonscriptions.length} circonscriptions (${firstRound} élus au 1er tour) → ${OUT_JSON}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
