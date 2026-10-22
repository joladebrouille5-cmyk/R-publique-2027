// Import des personnalités politiques réelles (phase 5 bis) : `pnpm data:personnalites`.
// Sources : Wikipédia (révision figée de l'article des candidatures), Wikidata (CC0), Wikimedia
// Commons (photos sous licence libre), enquête d'experts Chapel Hill (CHES), COG 2026 (INSEE).
// Réseau requis ; ImageMagick (`convert`) requis pour les photos. Copies brutes : data/raw/
// personnalites (jamais commitées). Sorties commitées : packages/rulesets/src/personnalites-
// 2027.json et apps/web/public/personnalites/*.webp. Toute nouvelle sortie impose une nouvelle
// version du jeu de règles (empreinte vérifiée par les tests).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCog } from '../cog/cog';
import { download, sha256File } from '../download';
import { GEO_SOURCES } from '../geo/sources';
import { buildPersonalities, photoFiles, type Sources } from '../personnalites/build';
import { parseChes } from '../personnalites/ches';
import {
  commonsPageUrl,
  freeLicense,
  originalUrl,
  type CommonsLicense,
} from '../personnalites/commons';
import { ARTICLE, SELECTION } from '../personnalites/selection';
import { parseSparql, sparqlQuery } from '../personnalites/wikidata';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/personnalites');
const COG_RAW = join(ROOT, 'data/raw');
const OUT_JSON = join(ROOT, 'packages/rulesets/src/personnalites-2027.json');
const OUT_PHOTOS = join(ROOT, 'apps/web/public/personnalites');

/** En-tête demandé par Wikimedia : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};

const CHES_2024 = {
  url: 'https://github.com/chesdata/chesdata.github.io/releases/download/ches-europe/CHES_2024_final_v2.csv',
  fichier: 'CHES_2024_final_v2.csv',
};
const CHES_TREND = {
  url: 'https://github.com/chesdata/chesdata.github.io/releases/download/ches-trend/1999-2024_CHES_dataset_meansV2.csv',
  fichier: '1999-2024_CHES_dataset_meansV2.csv',
};
const CHES_LICENCE =
  'non précisée ; usage avec citation demandé (Rovny et al., « The 2024 Chapel Hill Expert Survey on political party positioning in Europe », 2025)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { ...HEADERS, ...(init.headers ?? {}) },
    });
    if (response.ok) return response.text();
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${url} : HTTP ${response.status}`);
    }
    await sleep(5_000 * attempt);
  }
  throw new Error(`${url} : trop de refus (limite de débit)`);
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const consulteLe = today();

  // 1. Article Wikipédia, à une révision figée : la révision courante, ou celle donnée par
  // `--revision <oldid>` (réimport sans changer de source, par exemple pour une photo).
  const title = ARTICLE.replace(/ /g, '_');
  const flag = process.argv.indexOf('--revision');
  let revid = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (flag >= 0 && !/^\d+$/.test(revid ?? ''))
    throw new Error('--revision attend un numéro de révision.');
  if (!revid) {
    const html = await fetchText(`https://fr.wikipedia.org/wiki/${encodeURIComponent(title)}`);
    revid = /"wgRevisionId":(\d+)/.exec(html)?.[1];
  }
  if (!revid) throw new Error('Révision de l’article introuvable.');
  const rawUrl = `https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw&oldid=${revid}`;
  console.log(`Source : ${rawUrl}`);
  const articlePath = join(RAW, `candidatures-2027-${revid}.wiki`);
  const articleRecord = await download(rawUrl, articlePath, 5, HEADERS);
  const article = readFileSync(articlePath, 'utf8');

  // 2. Enquête CHES : vague 2024 et fichier de tendance 1999-2024.
  const chesRecords = [];
  for (const file of [CHES_2024, CHES_TREND]) {
    console.log(`Source : ${file.url}`);
    chesRecords.push(await download(file.url, join(RAW, file.fichier), 5, HEADERS));
  }
  const ches2024 = parseChes(readFileSync(join(RAW, CHES_2024.fichier), 'utf8'), 2024);
  const chesTrend = parseChes(readFileSync(join(RAW, CHES_TREND.fichier), 'utf8'));

  // 3. Wikidata : identifiants et partis (P102).
  const query = sparqlQuery(SELECTION.map((s) => s.article));
  console.log('Source : https://query.wikidata.org/sparql (requête des partis, P102)');
  const sparql = await fetchText('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }).toString(),
  });
  writeFileSync(join(RAW, `wikidata-${consulteLe}.json`), sparql);
  const wikidata = parseSparql(sparql);

  // 4. COG 2026 (communes, départements, régions), déjà téléchargé par `pnpm data:geo` ou ici.
  const cogFiles: Record<string, string> = {};
  const cogSources: Sources = [];
  for (const id of [
    'insee-cog-communes',
    'insee-cog-departements',
    'insee-cog-regions',
    'insee-cog-comer',
  ]) {
    const source = GEO_SOURCES.find((s) => s.id === id)!;
    const record = await download(source.url, join(COG_RAW, source.fichier));
    cogFiles[id] = readFileSync(join(COG_RAW, source.fichier), 'utf8');
    if (id !== 'insee-cog-comer') {
      cogSources.push({
        id,
        titre: source.titre,
        url: source.url,
        licence: source.licence,
        version: source.millesime,
        consulteLe: record.telechargeLe,
        sha256: record.sha256,
      });
    }
  }
  const cog = parseCog({
    communes: cogFiles['insee-cog-communes']!,
    departements: cogFiles['insee-cog-departements']!,
    regions: cogFiles['insee-cog-regions']!,
    comer: cogFiles['insee-cog-comer']!,
  });

  // 5. Photos : licence lue sur Commons, original téléchargé, réduit sans métadonnées.
  const files = photoFiles(article);
  const photos = new Map<string, CommonsLicense | { refus: string }>();
  mkdirSync(OUT_PHOTOS, { recursive: true });
  for (const name of readdirSync(OUT_PHOTOS)) rmSync(join(OUT_PHOTOS, name));
  for (const [id, file] of files) {
    if (!file) continue;
    console.log(`Photo : ${commonsPageUrl(file)}`);
    let license: CommonsLicense | { refus: string };
    try {
      const page = await fetchText(commonsPageUrl(file));
      writeFileSync(join(RAW, `commons-${id}.html`), page);
      license = freeLicense(page);
    } catch (error) {
      license = { refus: `page du fichier illisible (${String(error)})` };
    }
    photos.set(file, license);
    if ('refus' in license) {
      console.log(`  non reprise : ${license.refus}`);
      continue;
    }
    const extension = file.split('.').pop()!.toLowerCase();
    const original = join(RAW, `photo-${id}.${extension}`);
    await download(originalUrl(file), original, 5, HEADERS);
    execFileSync('convert', [
      `${original}[0]`,
      '-auto-orient',
      '-strip',
      '-resize',
      '240x',
      '-quality',
      '82',
      join(OUT_PHOTOS, `${id}.webp`),
    ]);
    await sleep(1_000);
  }

  const sources: Sources = [
    {
      id: 'wikipedia-candidatures-2027',
      titre: `Wikipédia — « ${ARTICLE} »`,
      url: rawUrl.replace('&action=raw', ''),
      licence:
        'CC BY-SA 4.0 (texte de l’article) ; seuls des faits datés en sont repris, reformulés',
      version: `révision ${revid}`,
      consulteLe: articleRecord.telechargeLe,
      sha256: articleRecord.sha256,
    },
    {
      id: 'ches-2024',
      titre: 'Chapel Hill Expert Survey 2024 — positions moyennes des partis',
      url: CHES_2024.url,
      licence: CHES_LICENCE,
      version: 'vague 2024 (fichier final v2)',
      consulteLe: chesRecords[0]!.telechargeLe,
      sha256: chesRecords[0]!.sha256,
    },
    {
      id: 'ches-1999-2024',
      titre: 'Chapel Hill Expert Survey — fichier de tendance 1999-2024',
      url: CHES_TREND.url,
      licence: CHES_LICENCE,
      version: '1999-2024 (moyennes V2)',
      consulteLe: chesRecords[1]!.telechargeLe,
      sha256: chesRecords[1]!.sha256,
    },
    {
      id: 'wikidata-partis',
      titre: 'Wikidata — identifiants et partis des personnalités (propriété P102)',
      url: 'https://query.wikidata.org/',
      licence: 'CC0 1.0',
      version: `requête du ${consulteLe}`,
      consulteLe,
      sha256: sha256(sparql),
    },
    ...cogSources,
  ];

  const result = buildPersonalities({
    article,
    articleRevisionUrl: rawUrl.replace('&action=raw', ''),
    verifieLe: consulteLe,
    sources,
    ches2024,
    chesTrend,
    wikidata,
    photos,
    cog,
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  const withPhoto = result.personnalites.filter((p) => p.photo).length;
  console.log(
    `${result.personnalites.length} personnalités (${withPhoto} avec photo), ${result.nonIntegrees.length} candidatures non intégrées.`,
  );
  console.log(`Empreinte de ${OUT_JSON} : ${await sha256File(OUT_JSON)}`);
  if (!existsSync(OUT_JSON)) throw new Error('Écriture impossible.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
