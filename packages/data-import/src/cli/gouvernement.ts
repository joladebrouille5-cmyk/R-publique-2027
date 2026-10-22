// Import des figures politiques proposées pour le gouvernement (phase 11) : `pnpm data:gouvernement`.
// Sources : Wikipédia (révisions des articles, infobox des fonctions), Wikidata (CC0 : identifiant,
// partis, photo), Wikimedia Commons (photos sous licence libre), enquête d'experts Chapel Hill
// (CHES 2024). Lit aussi assemblee-2026.json (groupes) et personnalites-2027.json (rattachements).
// Réseau requis ; ImageMagick (`convert`) requis pour les photos. Copies brutes : data/raw/
// gouvernement (jamais commitées). Sorties commitées : packages/rulesets/src/gouvernement-2027.json
// et apps/web/public/gouvernement/*.webp. Toute nouvelle sortie impose une nouvelle version du jeu
// de règles (empreinte vérifiée par les tests).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, sha256File } from '../download';
import { buildFigures, type FigureWikidata, type Sources } from '../gouvernement/build';
import { SELECTION } from '../gouvernement/selection';
import { CHES_2024, CHES_LICENCE, parseChes } from '../personnalites/ches';
import {
  commonsFileTitle,
  commonsPageUrl,
  freeLicense,
  originalUrl,
  type CommonsLicense,
} from '../personnalites/commons';
import { articleUrl, parseSparql } from '../personnalites/wikidata';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/gouvernement');
const CHES_RAW = join(ROOT, 'data/raw/personnalites');
const RULESETS = join(ROOT, 'packages/rulesets/src');
const OUT_JSON = join(RULESETS, 'gouvernement-2027.json');
const OUT_PHOTOS = join(ROOT, 'apps/web/public/gouvernement');

/** En-tête demandé par Wikimedia : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};

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

/** Requête SPARQL : identifiant, partis (P102, avec dates) et photo (P18) de chaque article. */
function sparqlQuery(titles: string[]): string {
  const values = titles.map((t) => `<${articleUrl(t)}>`).join(' ');
  return `SELECT ?article ?person ?image ?partyArticle ?partyLabel ?start ?end WHERE {
  VALUES ?article { ${values} }
  ?article schema:about ?person ; schema:isPartOf <https://fr.wikipedia.org/> .
  OPTIONAL { ?person wdt:P18 ?image }
  OPTIONAL {
    ?person p:P102 ?st . ?st ps:P102 ?party .
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
    OPTIONAL { ?partyArticle schema:about ?party ; schema:isPartOf <https://fr.wikipedia.org/> }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}`;
}

/** Photo (P18) par titre d'article : premier fichier dans l'ordre alphabétique (déterministe). */
function parseImages(json: string): Map<string, string | null> {
  const data = JSON.parse(json) as {
    results: { bindings: Record<string, { value: string } | undefined>[] };
  };
  const images = new Map<string, string | null>();
  for (const b of data.results.bindings) {
    const title = decodeURIComponent(b.article!.value.split('/wiki/')[1]!).replace(/_/g, ' ');
    const file = b.image
      ? decodeURIComponent(b.image.value.split('/Special:FilePath/')[1]!).replace(/_/g, ' ')
      : null;
    const current = images.get(title) ?? null;
    images.set(title, current === null || (file !== null && file < current) ? file : current);
  }
  return images;
}

type ApiPage = {
  title: string;
  missing?: boolean;
  revisions?: { revid: number; slots: { main: { content: string } } }[];
};

async function main() {
  mkdirSync(RAW, { recursive: true });
  const consulteLe = today();
  const titles = SELECTION.map((s) => s.article);

  // 1. Articles Wikipédia : révision courante de chaque article, en une requête.
  const api = new URL('https://fr.wikipedia.org/w/api.php');
  for (const [key, value] of Object.entries({
    action: 'query',
    prop: 'revisions',
    rvprop: 'ids|content',
    rvslots: 'main',
    format: 'json',
    formatversion: '2',
    titles: titles.join('|'),
  }))
    api.searchParams.set(key, value);
  console.log(`Source : ${api.origin}${api.pathname} (${titles.length} articles)`);
  const apiText = await fetchText(api.toString());
  writeFileSync(join(RAW, `wikipedia-${consulteLe}.json`), apiText);
  const pages = (JSON.parse(apiText) as { query: { pages: ApiPage[] } }).query.pages;
  const articles = new Map<string, { revid: number; wikitext: string }>();
  for (const page of pages) {
    const revision = page.revisions?.[0];
    if (page.missing || !revision) throw new Error(`Article introuvable : ${page.title}`);
    articles.set(page.title, { revid: revision.revid, wikitext: revision.slots.main.content });
  }

  // 2. Wikidata : identifiant, partis et photo.
  console.log('Source : https://query.wikidata.org/sparql (partis P102, photo P18)');
  const sparql = await fetchText('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query: sparqlQuery(titles) }).toString(),
  });
  writeFileSync(join(RAW, `wikidata-${consulteLe}.json`), sparql);
  const people = parseSparql(sparql);
  const images = parseImages(sparql);
  const wikidata = new Map<string, FigureWikidata>(
    [...people].map(([title, person]) => [title, { ...person, image: images.get(title) ?? null }]),
  );

  // 3. Enquête CHES 2024 (déjà téléchargée par `pnpm data:personnalites`, ou ici).
  console.log(`Source : ${CHES_2024.url}`);
  const chesRecord = await download(CHES_2024.url, join(CHES_RAW, CHES_2024.fichier), 5, HEADERS);
  const ches2024 = parseChes(readFileSync(join(CHES_RAW, CHES_2024.fichier), 'utf8'), 2024);

  // 4. Photos : licence lue sur Commons, original téléchargé, réduit sans métadonnées.
  const photos = new Map<string, CommonsLicense | { refus: string }>();
  mkdirSync(OUT_PHOTOS, { recursive: true });
  for (const name of readdirSync(OUT_PHOTOS)) rmSync(join(OUT_PHOTOS, name));
  for (const s of SELECTION) {
    const file = wikidata.get(s.article)?.image;
    if (!file) continue;
    console.log(`Photo : ${commonsPageUrl(file)}`);
    let license: CommonsLicense | { refus: string };
    let actual = file;
    try {
      const page = await fetchText(commonsPageUrl(file));
      writeFileSync(join(RAW, `commons-${s.id}.html`), page);
      license = freeLicense(page);
      actual = commonsFileTitle(page) ?? file;
    } catch (error) {
      license = { refus: `page du fichier illisible (${String(error)})` };
    }
    photos.set(file, license);
    if ('refus' in license) {
      console.log(`  non reprise : ${license.refus}`);
      continue;
    }
    const extension = actual.split('.').pop()!.toLowerCase();
    const original = join(RAW, `photo-${s.id}.${extension}`);
    await download(originalUrl(actual), original, 5, HEADERS);
    execFileSync('convert', [
      `${original}[0]`,
      '-auto-orient',
      '-strip',
      '-resize',
      '240x',
      '-quality',
      '82',
      join(OUT_PHOTOS, `${s.id}.webp`),
    ]);
    await sleep(1_000);
  }

  // 5. Groupes de l'Assemblée et personnalités candidates (fichiers commités du jeu de règles).
  const assemblee = JSON.parse(readFileSync(join(RULESETS, 'assemblee-2026.json'), 'utf8')) as {
    groupes: { id: string; sieges: number }[];
  };
  const personnalites = JSON.parse(
    readFileSync(join(RULESETS, 'personnalites-2027.json'), 'utf8'),
  ) as { personnalites: { id: string; parti: string }[] };

  const sources: Sources = [
    {
      id: 'wikipedia-figures',
      titre: 'Wikipédia — articles des figures (infobox « Personnalité politique »)',
      url: 'https://fr.wikipedia.org/w/api.php',
      licence:
        'CC BY-SA 4.0 (texte des articles) ; seuls les libellés des fonctions et leurs dates en sont repris',
      version: `révisions du ${consulteLe} (lien de chaque révision dans la fiche)`,
      consulteLe,
      sha256: sha256(apiText),
    },
    {
      id: 'wikidata-figures',
      titre: 'Wikidata — identifiants, partis (P102) et photos (P18) des figures',
      url: 'https://query.wikidata.org/',
      licence: 'CC0 1.0',
      version: `requête du ${consulteLe}`,
      consulteLe,
      sha256: sha256(sparql),
    },
    {
      id: 'ches-2024',
      titre: 'Chapel Hill Expert Survey 2024 — positions moyennes des partis',
      url: CHES_2024.url,
      licence: CHES_LICENCE,
      version: 'vague 2024 (fichier final v2)',
      consulteLe: chesRecord.telechargeLe,
      sha256: chesRecord.sha256,
    },
  ];

  const result = buildFigures({
    verifieLe: consulteLe,
    sources,
    articles,
    wikidata,
    ches2024,
    photos,
    groupes: assemblee.groupes,
    personnalites: personnalites.personnalites,
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  const withPhoto = result.figures.filter((f) => f.photo).length;
  console.log(
    `${result.figures.length} figures (${withPhoto} avec photo), ${result.rattachements.length} personnalités candidates rattachées à un groupe.`,
  );
  console.log(`Empreinte de ${OUT_JSON} : ${await sha256File(OUT_JSON)}`);
  if (!existsSync(OUT_JSON)) throw new Error('Écriture impossible.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
