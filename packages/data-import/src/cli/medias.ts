// Import des médias réels (phase 5 ter) : `pnpm data:medias`.
// Sources : relevés mensuels des temps de parole (Arcom), Médiamat mensuel et EAR National
// (Médiamétrie), classements OneNext (ACPM), articles Wikipédia (révisions consultées),
// Wikimedia Commons (logos sous licence libre), fiches des personnalités réelles (jeu de règles).
// Réseau requis ; ImageMagick (`convert`) requis pour les logos matriciels. Copies brutes :
// data/raw/medias (jamais commitées). Sorties commitées : packages/rulesets/src/medias-2027.json
// et apps/web/public/medias/. Toute nouvelle sortie impose une nouvelle version du jeu de
// règles (empreinte vérifiée par les tests).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RealPersonalitiesSchema, type LogoCredit, type RealMedia } from '@r2027/shared';
import { download, sha256File } from '../download';
import { parseArcomMonth } from '../medias/arcom';
import { buildMedias, type SourcedMeasures } from '../medias/build';
import type { ShowArticle } from '../medias/emissions';
import { infobox, redirectTarget } from '../medias/infobox';
import { logoFile, unsafeSvg } from '../medias/logos';
import { parseEar, parseMediamat, parseOneNext } from '../medias/mesures';
import { MOIS_REFERENCE, OUTLETS, SHOW_ARTICLES } from '../medias/selection';
import { readXlsx } from '../medias/xlsx';
import {
  commonsFileTitle,
  commonsPageUrl,
  freeLicense,
  originalUrl,
} from '../personnalites/commons';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/medias');
const OUT_JSON = join(ROOT, 'packages/rulesets/src/medias-2027.json');
const OUT_LOGOS = join(ROOT, 'apps/web/public/medias');
const PERSONNALITES = join(ROOT, 'packages/rulesets/src/personnalites-2027.json');

/** En-tête : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};

const ARCOM_PAGE = (year: number) =>
  `https://www.arcom.fr/temps-parole/hors-elections/recherche/source/${year}`;
const ARCOM_LICENCE =
  'non précisée sur la page ; données publiques de l’Arcom (jeux analogues publiés sous Licence Ouverte 2.0 sur data.gouv.fr) ; seules des parts agrégées en sont tirées, avec citation';
const MEDIAMETRIE = {
  mediamat: 'https://www.mediametrie.fr/fr/audiences-et-resultats/tv/mediamat-mensuel',
  ear: 'https://www.mediametrie.fr/fr/audiences-et-resultats/radio/ear-national',
};
const MEDIAMETRIE_LICENCE =
  'non précisée ; publication de Médiamétrie, seules quelques parts d’audience publiées sont reprises, avec citation';
const ACPM = {
  'onenext-pqn': 'https://www.acpm.fr/classements/onenext-pqn',
  'onenext-pqr': 'https://www.acpm.fr/classements/onenext-pqr',
};
const ACPM_LICENCE =
  'non précisée ; classement publié par l’ACPM, seuls quelques lectorats publiés sont repris, avec citation';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

/** Requête qui respecte la limite de débit de Wikimedia (`retry-after`) ; 404 : null. */
async function fetchPolite(url: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const response = await fetch(url, { headers: HEADERS });
    if (response.status === 404) return null;
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500)
      throw new Error(`${url} : HTTP ${response.status}`);
    const wait = Number(response.headers.get('retry-after') ?? NaN);
    await sleep((Number.isFinite(wait) ? wait + 2 : 10 * attempt) * 1000);
  }
  throw new Error(`${url} : trop de refus (limite de débit)`);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchPolite(url);
  if (!response) throw new Error(`${url} : HTTP 404`);
  return response.text();
}

type WikiPage = { titre: string; revision: number; url: string; wikitext: string; sha256: string };

/**
 * Article Wikipédia (API REST) à sa dernière révision ; suit une redirection. Une réponse est
 * conservée pour la journée (`data/raw/medias/wikipedia/<date>-<titre>.json`) : une relance le
 * même jour relit les mêmes révisions sans solliciter de nouveau Wikipédia.
 */
async function wikiPage(title: string, day: string): Promise<WikiPage | null> {
  let current = title;
  for (let hop = 0; hop < 2; hop++) {
    const cache = join(RAW, 'wikipedia', `${day}-${slug(current)}.json`);
    let body: string;
    if (existsSync(cache)) body = readFileSync(cache, 'utf8');
    else {
      const response = await fetchPolite(
        `https://fr.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(current.replace(/ /g, '_'))}`,
      );
      await sleep(3_000);
      if (!response) return null;
      body = await response.text();
      writeFileSync(cache, body);
    }
    const page = JSON.parse(body) as { title: string; latest: { id: number }; source: string };
    const target = redirectTarget(page.source);
    if (target) {
      current = target;
      continue;
    }
    return {
      titre: page.title,
      revision: page.latest.id,
      url: `https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title.replace(/ /g, '_'))}&oldid=${page.latest.id}`,
      wikitext: page.source,
      sha256: sha256(body),
    };
  }
  throw new Error(`${title} : redirections en chaîne.`);
}

type ArcomFile = { debut: string; fin: string; uri: string };

/** Fichiers mensuels des partis politiques publiés pour une année (réglages de la page). */
async function arcomFiles(year: number): Promise<ArcomFile[]> {
  const html = await fetchText(ARCOM_PAGE(year));
  const json =
    /<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/.exec(
      html,
    )?.[1];
  if (!json) throw new Error(`Arcom ${year} : réglages de la page introuvables.`);
  type Settings = {
    tphpe?: {
      mois?: {
        fichiers?: { type: string; date_start: string; date_end: string; file_uri: string }[];
      }[];
    }[];
  };
  const settings = JSON.parse(json) as Settings;
  const iso = (fr: string) => fr.split('/').reverse().join('-');
  return (settings.tphpe ?? [])
    .flatMap((t) => t.mois ?? [])
    .flatMap((m) => m.fichiers ?? [])
    .filter((f) => f.type === 'uploaded_csv_partis_politiques')
    .map((f) => ({ debut: iso(f.date_start), fin: iso(f.date_end), uri: f.file_uri }));
}

async function main() {
  for (const dir of ['arcom', 'wikipedia', 'logos']) mkdirSync(join(RAW, dir), { recursive: true });
  const consulteLe = today();
  const sources: RealMedia['sources'] = [];

  // 1. Arcom : les douze derniers mois publiés, consécutifs.
  const year = Number(consulteLe.slice(0, 4));
  const files = [...(await arcomFiles(year)), ...(await arcomFiles(year - 1))]
    .filter((f) => f.debut.endsWith('-01'))
    .sort((a, b) => (a.debut < b.debut ? 1 : -1));
  const months = [...new Map(files.map((f) => [f.debut.slice(0, 7), f])).values()].slice(
    0,
    MOIS_REFERENCE,
  );
  if (months.length !== MOIS_REFERENCE) throw new Error('Arcom : moins de douze mois publiés.');
  months.reverse();
  for (let i = 1; i < months.length; i++) {
    const previous = new Date(`${months[i - 1]!.debut}T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() + 1);
    if (previous.toISOString().slice(0, 10) !== months[i]!.debut)
      throw new Error(`Arcom : mois manquant avant ${months[i]!.debut}.`);
  }
  const arcom = [];
  for (const f of months) {
    const url = new URL(f.uri, 'https://www.arcom.fr').toString();
    const mois = f.debut.slice(0, 7);
    console.log(`Source : ${url}`);
    const path = join(RAW, 'arcom', `${mois}.csv`);
    const record = await download(url, path, 5, HEADERS);
    arcom.push(parseArcomMonth(readFileSync(path, 'utf8'), mois));
    sources.push({
      id: `arcom-${mois}`,
      titre: `Arcom — temps de parole des partis politiques, ${mois}`,
      url,
      licence: ARCOM_LICENCE,
      version: `relevé du ${f.debut} au ${f.fin}`,
      consulteLe: record.telechargeLe,
      sha256: record.sha256,
    });
  }
  const periodeArcom = { debut: months[0]!.debut, fin: months[months.length - 1]!.fin };

  // 2. Médiamétrie : classeurs Excel des pages Médiamat mensuel et EAR National.
  const measures: Partial<Record<string, SourcedMeasures>> = {};
  for (const [id, page] of Object.entries(MEDIAMETRIE)) {
    const html = await fetchText(page);
    const download_ = /href="(\/fr\/audience\/\d+\/download-excel)"/.exec(html)?.[1];
    const title = /class="audience-header__node-title">\s*([^<]+?)\s*</
      .exec(html)?.[1]
      ?.replace(/&#0?39;/g, '’');
    if (!download_ || !title) throw new Error(`Médiamétrie : lien ou titre introuvable (${page}).`);
    const url = `https://www.mediametrie.fr${download_}`;
    console.log(`Source : ${url} (${title})`);
    const path = join(RAW, `${id}-${download_.split('/')[3]}.xlsx`);
    const record = await download(url, path, 5, HEADERS);
    const sheets = readXlsx(readFileSync(path));
    const parsed = id === 'mediamat' ? parseMediamat(sheets) : parseEar(sheets);
    measures[id] = {
      ...parsed,
      sourceId: `mediametrie-${id}`,
      population:
        id === 'mediamat'
          ? 'individus de 4 ans et plus'
          : '13 ans et plus, du lundi au vendredi, 5 h-24 h',
    };
    sources.push({
      id: `mediametrie-${id}`,
      titre: `Médiamétrie — ${id === 'mediamat' ? 'Médiamat mensuel' : 'EAR National'} : « ${title} »`,
      url,
      licence: MEDIAMETRIE_LICENCE,
      version: parsed.periode,
      consulteLe: record.telechargeLe,
      sha256: record.sha256,
    });
  }

  // 3. ACPM : classements OneNext de la presse quotidienne nationale et régionale.
  for (const [id, url] of Object.entries(ACPM)) {
    console.log(`Source : ${url}`);
    const path = join(RAW, `acpm-${id}.html`);
    const record = await download(url, path, 5, HEADERS);
    const parsed = parseOneNext(readFileSync(path, 'utf8'));
    measures[id] = {
      ...parsed,
      sourceId: `acpm-${id}`,
      population: 'nombre moyen de lecteurs par numéro, calculé sur les six derniers numéros parus',
    };
    sources.push({
      id: `acpm-${id}`,
      titre: `ACPM — classement OneNext, presse quotidienne ${id === 'onenext-pqn' ? 'nationale' : 'régionale'}`,
      url,
      licence: ACPM_LICENCE,
      version: parsed.periode,
      consulteLe: record.telechargeLe,
      sha256: record.sha256,
    });
  }

  // 4. Wikipédia : article de chaque organe (logo) et des émissions examinées.
  const articles = new Map<string, { url: string }>();
  const boxes = new Map<string, ReturnType<typeof infobox>>();
  const pages: WikiPage[] = [];
  for (const o of OUTLETS) {
    console.log(`Wikipédia : ${o.article}`);
    const page = await wikiPage(o.article, consulteLe);
    if (!page) throw new Error(`Wikipédia : article « ${o.article} » introuvable.`);
    pages.push(page);
    articles.set(o.id, { url: page.url });
    boxes.set(o.id, infobox(page.wikitext));
  }
  const shows: ShowArticle[] = [];
  for (const title of SHOW_ARTICLES) {
    console.log(`Wikipédia : ${title}`);
    const page = await wikiPage(title, consulteLe);
    if (!page)
      throw new Error(`Wikipédia : article « ${title} » introuvable ; sélection à revoir.`);
    pages.push(page);
    shows.push({ titre: page.titre, url: page.url, wikitext: page.wikitext });
  }
  sources.push({
    id: 'wikipedia-medias',
    titre: 'Wikipédia — articles des organes et des émissions politiques',
    url: 'https://fr.wikipedia.org/',
    licence:
      'CC BY-SA 4.0 (texte des articles) ; seuls des faits (chaîne, présentateurs, diffusion, logo) en sont repris',
    version: `${pages.length} articles, révision indiquée pour chaque organe et chaque émission`,
    consulteLe,
    sha256: sha256(pages.map((p) => `${p.titre}\t${p.revision}\t${p.sha256}`).join('\n')),
  });

  // 5. Logos : fichier de l'infobox, licence lue sur Commons.
  rmSync(OUT_LOGOS, { recursive: true, force: true });
  mkdirSync(OUT_LOGOS, { recursive: true });
  const logos = new Map<string, LogoCredit | { refus: string }>();
  for (const o of OUTLETS) {
    const file = logoFile(boxes.get(o.id) ?? null);
    if (!file) continue;
    console.log(`Logo : ${commonsPageUrl(file)}`);
    const response = await fetchPolite(commonsPageUrl(file));
    await sleep(2_000);
    if (!response) {
      console.log('  non repris : fichier absent de Commons');
      logos.set(o.id, {
        refus: `fichier « ${file} » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)`,
      });
      continue;
    }
    const html = await response.text();
    writeFileSync(join(RAW, 'logos', `commons-${o.id}.html`), html);
    const license = freeLicense(html);
    if ('refus' in license) {
      console.log(`  non repris : ${license.refus}`);
      logos.set(o.id, { refus: license.refus });
      continue;
    }
    // La page peut rediriger vers un autre fichier : c'est lui qui est téléchargé et crédité.
    const actual = commonsFileTitle(html) ?? file;
    const extension = actual.split('.').pop()!.toLowerCase();
    const original = join(RAW, 'logos', `${o.id}.${extension}`);
    await download(originalUrl(actual), original, 5, HEADERS);
    let fichier: string;
    let modification: string;
    if (extension === 'svg') {
      const unsafe = unsafeSvg(readFileSync(original, 'utf8'));
      if (unsafe) {
        console.log(`  non repris : ${unsafe}`);
        logos.set(o.id, { refus: `${unsafe} : fichier non repris` });
        continue;
      }
      fichier = `medias/${o.id}.svg`;
      copyFileSync(original, join(OUT_LOGOS, `${o.id}.svg`));
      modification = 'Fichier SVG d’origine, non modifié.';
    } else {
      fichier = `medias/${o.id}.webp`;
      execFileSync('convert', [
        `${original}[0]`,
        '-strip',
        '-resize',
        '240x120>',
        '-quality',
        '90',
        join(OUT_LOGOS, `${o.id}.webp`),
      ]);
      modification = 'Réduit (240 × 120 pixels au plus) et converti en WebP, sans métadonnées.';
    }
    logos.set(o.id, { ...license, fichier, source: commonsPageUrl(actual), modification });
  }

  const personnalites = RealPersonalitiesSchema.parse(
    JSON.parse(readFileSync(PERSONNALITES, 'utf8')),
  ).personnalites;
  const result = buildMedias({
    verifieLe: consulteLe,
    sources,
    periodeArcom,
    arcom,
    mesures: {
      mediamat: measures.mediamat!,
      ear: measures.ear!,
      'onenext-pqn': measures['onenext-pqn']!,
      'onenext-pqr': measures['onenext-pqr']!,
    },
    articles,
    logos,
    shows,
    personnalites,
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  // Mise en forme du dépôt (Prettier) : l'empreinte, calculée sur les données, n'en dépend pas.
  execFileSync(join(ROOT, 'node_modules/.bin/prettier'), ['--write', OUT_JSON]);
  for (const name of readdirSync(OUT_LOGOS))
    if (!result.organes.some((o) => o.logo?.fichier === `medias/${name}`))
      throw new Error(`Logo sans organe : ${name}`);
  console.log(
    `${result.organes.length} organes (${result.organes.filter((o) => o.logo).length} logos), ${result.emissions.length} émissions, ${result.exclus.length} exclusions.`,
  );
  console.log(`Empreinte de ${OUT_JSON} : ${await sha256File(OUT_JSON)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
