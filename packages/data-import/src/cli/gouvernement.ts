// Import des figures politiques nominables (phases 11 et 14) : `pnpm data:gouvernement`.
// Sources : Wikipédia (révisions des articles, infobox : fonctions et parti), Wikidata (CC0 :
// identifiant, photos, catégorie Commons, décès), Wikimedia Commons (photos sous licence libre ;
// licence et auteur lus par l'API `imageinfo`), enquête d'experts Chapel Hill (CHES 2024). Lit
// aussi assemblee-2026.json (groupes) et personnalites-2027.json (rattachements).
// Option `--verifier` : ni photo ni écriture, liste des fiches retenues et écartées (motifs).
// Réseau requis ; ImageMagick (`convert`, `montage`) requis pour les photos. Copies brutes et
// planche contact de revue des photos : data/raw/gouvernement (jamais commitées). Sorties
// commitées : packages/rulesets/src/gouvernement-2027.json et apps/web/public/gouvernement/*.webp.
// Toute nouvelle sortie impose une nouvelle version du jeu de règles (empreinte vérifiée par les
// tests).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, sha256File } from '../download';
import {
  buildFigures,
  type BuildInput,
  type PhotoChoice,
  type Sources,
} from '../gouvernement/build';
import {
  categoryCandidates,
  choosePhoto,
  parseImageInfo,
  photoCandidates,
  type ImageInfo,
} from '../gouvernement/photos';
import { SELECTION } from '../gouvernement/selection';
import { figureSparqlQuery, parseFigureWikidata } from '../gouvernement/wikidata';
import { CHES_2024, CHES_LICENCE, parseChes } from '../personnalites/ches';

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

/** Pause entre deux requêtes et nombre d'essais (limites de débit de Wikimedia). */
const PAUSE = 1_000;
const ATTEMPTS = 12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const chunks = <T>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );

let lastRequest = 0;

/**
 * Requête espacée d'au moins une seconde de la précédente ; refus 429 ou erreur 5xx : nouvel essai
 * après le délai demandé (Retry-After, borné entre 2 et 60 secondes).
 */
async function request(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const wait = lastRequest + PAUSE - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      await sleep(2_000 * attempt);
      continue;
    }
    if (response.ok) return response;
    await response.body?.cancel();
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${url} : HTTP ${response.status}`);
    }
    const asked = Number(response.headers.get('retry-after'));
    const seconds = Math.min(60, Math.max(2, asked > 0 ? asked : 5 * attempt));
    console.log(`  limite de débit (HTTP ${response.status}) : nouvel essai dans ${seconds} s`);
    await sleep(seconds * 1_000);
  }
  throw new Error(`${url} : trop de refus (limite de débit)`);
}

const fetchText = async (url: string, init: RequestInit = {}) => (await request(url, init)).text();

type ApiJson = {
  error?: { code: string; info: string };
  continue?: Record<string, string>;
  query?: Record<string, unknown>;
};

/** Requêtes à l'API MediaWiki (POST), suite comprise (`continue`, au plus `maxPages`). */
async function mediawiki(
  host: string,
  params: Record<string, string>,
  maxPages = Infinity,
): Promise<{ text: string; json: ApiJson }[]> {
  const pages: { text: string; json: ApiJson }[] = [];
  let next: Record<string, string> = {};
  for (let lag = 1; ;) {
    const text = await fetchText(`https://${host}/w/api.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        format: 'json',
        formatversion: '2',
        maxlag: '5',
        ...params,
        ...next,
      }).toString(),
    });
    const json = JSON.parse(text) as ApiJson;
    if (json.error?.code === 'maxlag' && lag < 6) {
      await sleep(5_000 * lag++);
      continue;
    }
    if (json.error) throw new Error(`${host} : ${json.error.code} (${json.error.info})`);
    pages.push({ text, json });
    if (!json.continue || pages.length >= maxPages) return pages;
    next = json.continue;
  }
}

type ApiPage = {
  title: string;
  missing?: boolean;
  revisions?: { revid: number; slots: { main: { content: string } } }[];
};

/** Articles (révision courante) par titre de la sélection ; redirections suivies. */
async function fetchArticles(titles: string[]) {
  const articles: BuildInput['articles'] = new Map();
  const raw: string[] = [];
  for (const batch of chunks(titles, 20)) {
    const normalized = new Map<string, string>();
    const redirects = new Map<string, string>();
    const pages = new Map<string, ApiPage>();
    for (const { text, json } of await mediawiki('fr.wikipedia.org', {
      action: 'query',
      prop: 'revisions',
      rvprop: 'ids|content',
      rvslots: 'main',
      redirects: '1',
      titles: batch.join('|'),
    })) {
      raw.push(text);
      const query = json.query as {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages?: ApiPage[];
      };
      for (const n of query.normalized ?? []) normalized.set(n.from, n.to);
      for (const r of query.redirects ?? []) redirects.set(r.from, r.to);
      for (const p of query.pages ?? [])
        if (p.revisions?.length || !pages.has(p.title)) pages.set(p.title, p);
    }
    for (const title of batch) {
      const resolved =
        redirects.get(normalized.get(title) ?? title) ?? normalized.get(title) ?? title;
      const page = pages.get(resolved);
      const revision = page?.revisions?.[0];
      if (!page || page.missing || !revision) continue;
      articles.set(title, {
        revid: revision.revid,
        wikitext: revision.slots.main.content,
        ...(resolved !== title ? { titre: resolved } : {}),
      });
    }
  }
  return { articles, raw };
}

/** Requête SPARQL (POST) au service de Wikidata. */
const sparql = (query: string) =>
  fetchText('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }).toString(),
  });

/** Métadonnées de fichiers de Commons (licence, auteur, vignette), par lots de 50. */
async function fetchImageInfo(files: string[], raw: string[]): Promise<Map<string, ImageInfo>> {
  const infos = new Map<string, ImageInfo>();
  for (const batch of chunks([...new Set(files)], 50)) {
    for (const { text } of await mediawiki('commons.wikimedia.org', {
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'extmetadata|url|size|mime',
      iiurlwidth: '500',
      iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
      redirects: '1',
      titles: batch.map((f) => `File:${f}`).join('|'),
    })) {
      raw.push(text);
      for (const [file, info] of parseImageInfo(text, batch)) infos.set(file, info);
    }
  }
  return infos;
}

/** Fichiers d'une catégorie de Commons (au plus 2 000 : quatre pages de 500). */
async function categoryFiles(category: string): Promise<string[]> {
  const pages = await mediawiki(
    'commons.wikimedia.org',
    {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmtype: 'file',
      cmlimit: '500',
    },
    4,
  );
  return pages.flatMap(({ json }) =>
    ((json.query?.categorymembers ?? []) as { title: string }[]).map((m) => m.title),
  );
}

async function main() {
  const verify = process.argv.includes('--verifier');
  mkdirSync(RAW, { recursive: true });
  const consulteLe = today();
  const titles = SELECTION.map((s) => s.article);

  // 1. Articles Wikipédia : révision courante, par lots de 20, redirections suivies.
  console.log(`Source : https://fr.wikipedia.org/w/api.php (${titles.length} articles)`);
  const { articles, raw: wikipediaRaw } = await fetchArticles(titles);
  writeFileSync(join(RAW, `wikipedia-${consulteLe}.json`), `[${wikipediaRaw.join(',\n')}]`);

  // 2. Wikidata : identifiant, photos (P18), catégorie Commons (P373), décès (P570).
  const resolved = new Map(titles.map((t) => [t, articles.get(t)?.titre ?? t]));
  console.log('Source : https://query.wikidata.org/sparql (P18, P373, P570)');
  const wikidataJson = await sparql(figureSparqlQuery([...new Set(resolved.values())]));
  writeFileSync(join(RAW, `wikidata-${consulteLe}.json`), wikidataJson);
  const people = parseFigureWikidata(wikidataJson);
  const wikidata: BuildInput['wikidata'] = new Map();
  for (const [title, actual] of resolved) {
    const person = people.get(actual);
    if (person) wikidata.set(title, person);
  }

  // 3. Enquête CHES 2024 (déjà téléchargée par `pnpm data:personnalites`, ou ici).
  console.log(`Source : ${CHES_2024.url}`);
  const chesRecord = await download(CHES_2024.url, join(CHES_RAW, CHES_2024.fichier), 5, HEADERS);
  const ches2024 = parseChes(readFileSync(join(CHES_RAW, CHES_2024.fichier), 'utf8'), 2024);

  // 4. Groupes de l'Assemblée et personnalités candidates (fichiers commités du jeu de règles).
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
        'CC BY-SA 4.0 (texte des articles) ; seuls les libellés des fonctions, leurs dates et les partis cités en sont repris',
      version: `révisions du ${consulteLe} (lien de chaque révision dans la fiche)`,
      consulteLe,
      sha256: sha256(wikipediaRaw.join('\n')),
    },
    {
      id: 'wikidata-figures',
      titre:
        'Wikidata — identifiants, photos (P18), catégories Commons (P373) et décès (P570) des figures',
      url: 'https://query.wikidata.org/',
      licence: 'CC0 1.0',
      version: `requête du ${consulteLe}`,
      consulteLe,
      sha256: sha256(wikidataJson),
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
  const input: BuildInput = {
    verifieLe: consulteLe,
    sources,
    articles,
    wikidata,
    ches2024,
    photos: new Map(),
    groupes: assemblee.groupes,
    personnalites: personnalites.personnalites,
  };

  // 5. Premier assemblage, sans photo : fiches retenues et écartées.
  const draft = buildFigures(input);
  const retained = new Set(draft.figures.map((f) => f.id));
  console.log(`${draft.figures.length} fiches retenues, ${draft.ecartees.length} écartées.`);
  for (const e of draft.ecartees) console.log(`  écartée : ${e.prenom} ${e.nom} — ${e.motif}`);
  if (verify) {
    for (const f of draft.figures) {
      const s = SELECTION.find((x) => x.id === f.id)!;
      const w = wikidata.get(s.article)!;
      const redirect = articles.get(s.article)?.titre;
      console.log(
        `  ${f.id} : ${f.parti} (${f.groupe ?? 'aucun groupe'}), compétence ${f.competence.valeur}, notoriété ${f.notoriete.niveau}, ${w.images.length} photo(s) Wikidata, catégorie ${w.categorie ?? '—'}${redirect ? `, article « ${redirect} »` : ''}`,
      );
    }
    return;
  }

  // 6. Photos : candidates (main, Wikidata, catégorie Commons), licence lue dans les métadonnées.
  const commonsRaw: string[] = [];
  const figures = SELECTION.filter((s) => retained.has(s.id));
  const first = new Map(
    figures.map((s) => [s.id, photoCandidates(s.photo, wikidata.get(s.article)!.images, [])]),
  );
  console.log('Source : https://commons.wikimedia.org/w/api.php (imageinfo, categorymembers)');
  const infos = await fetchImageInfo(
    [...first.values()].flat().map((c) => c.fichier),
    commonsRaw,
  );
  const lacking = figures.filter((s) => {
    const choice = choosePhoto(first.get(s.id)!, infos, wikidata.get(s.article)!.categorie);
    return 'refus' in choice && wikidata.get(s.article)!.categorie !== null;
  });
  const fromCategory = new Map<string, string[]>();
  for (const s of lacking) {
    const categorie = wikidata.get(s.article)!.categorie!;
    console.log(`  catégorie Commons « ${categorie} » (${s.prenom} ${s.nom})`);
    fromCategory.set(s.id, categoryCandidates(await categoryFiles(categorie), s.nom));
  }
  for (const [file, info] of await fetchImageInfo([...fromCategory.values()].flat(), commonsRaw))
    infos.set(file, info);
  writeFileSync(join(RAW, `commons-${consulteLe}.json`), `[${commonsRaw.join(',\n')}]`);

  const photos = new Map<string, PhotoChoice>();
  mkdirSync(OUT_PHOTOS, { recursive: true });
  for (const name of readdirSync(OUT_PHOTOS)) rmSync(join(OUT_PHOTOS, name));
  for (const s of figures) {
    const w = wikidata.get(s.article)!;
    const candidates = photoCandidates(s.photo, w.images, fromCategory.get(s.id) ?? []);
    const choice = choosePhoto(candidates, infos, w.categorie);
    if ('refus' in choice) {
      if (candidates.length > 0) photos.set(s.id, { refus: choice.refus });
      console.log(`  ${s.id} : sans photo (${choice.refus})`);
      continue;
    }
    const url = choice.info.vignette ?? choice.info.url;
    const extension = url.split('.').pop()!.toLowerCase();
    const local = join(RAW, `photo-${s.id}-${sha256(url).slice(0, 8)}.${extension}`);
    if (!existsSync(local))
      writeFileSync(local, Buffer.from(await (await request(url)).arrayBuffer()));
    execFileSync('convert', [
      `${local}[0]`,
      '-auto-orient',
      '-strip',
      '-resize',
      '240x>',
      '-quality',
      '82',
      join(OUT_PHOTOS, `${s.id}.webp`),
    ]);
    photos.set(s.id, {
      fichier: choice.info.fichier,
      licence: choice.licence,
      ...(choice.choix ? { choix: choice.choix } : {}),
    });
    console.log(`  ${s.id} : ${choice.info.fichier} (${choice.licence.licence})`);
  }

  // 7. Assemblage final, écriture et planche contact de revue (photos une à une).
  const result = buildFigures({ ...input, photos });
  writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  const withPhoto = result.figures.filter((f) => f.photo);
  if (withPhoto.length > 0) {
    execFileSync('montage', [
      ...withPhoto.flatMap((f) => [
        '-label',
        f.id.replace(/^figure-/, ''),
        join(OUT_PHOTOS, `${f.id}.webp`),
      ]),
      '-tile',
      '10x',
      '-geometry',
      '120x150+4+4',
      join(RAW, 'planche.jpg'),
    ]);
  }
  console.log(
    `${result.figures.length} figures (${withPhoto.length} avec photo), ${result.ecartees.length} écartées, ${result.rattachements.length} personnalités candidates rattachées à un groupe.`,
  );
  console.log(`Planche contact : ${join(RAW, 'planche.jpg')}`);
  console.log(`Empreinte de ${OUT_JSON} : ${await sha256File(OUT_JSON)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
