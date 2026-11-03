// Import de la musique du jeu (phase 19) : `pnpm data:sons`.
// Source : Wikimedia Commons (morceaux de Kevin MacLeod sous licence CC BY 3.0) ; la licence et
// l'auteur sont lus sur la page de chaque fichier, et un morceau sans licence libre reconnue est
// refusé. Réseau requis ; ffmpeg et ffprobe requis (extrait, normalisation EBU R128, MP3).
// Copies brutes : data/raw/sons (jamais commitées). Sorties commitées : apps/web/public/sons/ et
// apps/web/src/audio/musiques.json. La musique n'est pas un paramètre de jeu : le jeu de règles
// ne change pas.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MusicManifestSchema, type MusicTrack } from '@r2027/shared';
import {
  commonsFileTitle,
  commonsPageUrl,
  freeLicense,
  originalUrl,
} from '../personnalites/commons';
import {
  buildTrack,
  creditedAuthor,
  encodeFilter,
  extractSeconds,
  MEASURE_FILTER,
  parseFfprobeDuration,
  parseLoudnorm,
} from '../sons/build';
import { MP3_KBPS, MUSIC_SELECTION } from '../sons/selection';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/sons');
const OUT_FILES = join(ROOT, 'apps/web/public/sons');
const OUT_JSON = join(ROOT, 'apps/web/src/audio/musiques.json');

/** En-tête : nom de l'outil et adresse du projet (aucune donnée personnelle). */
const HEADERS = {
  'user-agent':
    'republique-2027-import/1.0 (https://github.com/joladebrouille5-cmyk/R-publique-2027)',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Requête qui respecte la limite de débit de Wikimedia : après un refus (429 ou 5xx), attend le
 * délai demandé (`retry-after`, jusqu'à 20 minutes) avant de réessayer.
 */
async function fetchPolite(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const response = await fetch(url, { headers: HEADERS });
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500)
      throw new Error(`${url} : HTTP ${response.status}`);
    const asked = Number(response.headers.get('retry-after') ?? NaN);
    const wait = Math.min(1_200, Number.isFinite(asked) ? asked + 5 : 30 * attempt);
    console.log(`  limite de débit (HTTP ${response.status}) : nouvel essai dans ${wait} s`);
    await sleep(wait * 1000);
  }
  throw new Error(`${url} : trop de refus (limite de débit)`);
}

type Original = { url: string; sha256: string; octets: number };

/** Original du fichier, téléchargé une fois puis relu (empreinte revérifiée). */
async function original(file: string, id: string): Promise<{ path: string; record: Original }> {
  const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
  const path = join(RAW, `${id}${extension}`);
  const metaPath = `${path}.meta.json`;
  const url = originalUrl(file);
  if (existsSync(path) && existsSync(metaPath)) {
    const {
      url: saved,
      sha256: hash,
      octets,
    } = JSON.parse(readFileSync(metaPath, 'utf8')) as Original;
    if (saved === url && sha256(readFileSync(path)) === hash)
      return { path, record: { url, sha256: hash, octets } };
    throw new Error(
      `${path} ne correspond plus à son empreinte : supprimez-le pour le retélécharger.`,
    );
  }
  const data = Buffer.from(await (await fetchPolite(url)).arrayBuffer());
  const record: Original = { url, sha256: sha256(data), octets: data.length };
  writeFileSync(path, data);
  writeFileSync(metaPath, JSON.stringify({ ...record, telechargeLe: today() }, null, 2));
  return { path, record };
}

function ffprobeSeconds(path: string): number {
  return parseFfprobeDuration(
    execFileSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', path], {
      encoding: 'utf8',
    }),
  );
}

function ffmpeg(args: string[]): string {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg a échoué : ${run.stderr.slice(-600)}`);
  return run.stderr;
}

function requireTools() {
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const check = spawnSync(tool, ['-version'], { encoding: 'utf8' });
    if (check.status !== 0)
      throw new Error(`${tool} est requis par pnpm data:sons (paquet ffmpeg de la distribution).`);
  }
}

async function importTrack(selection: (typeof MUSIC_SELECTION)[number]): Promise<MusicTrack> {
  console.log(`${selection.titre} (${selection.ambiance})`);
  const page = await (await fetchPolite(commonsPageUrl(selection.fichier))).text();
  await sleep(3_000);
  // Une page peut rediriger vers un autre fichier : c'est lui qu'il faut télécharger.
  const file = commonsFileTitle(page) ?? selection.fichier;
  const license = freeLicense(page);
  if ('refus' in license) throw new Error(`${selection.fichier} : ${license.refus}`);
  const { path, record } = await original(file, selection.id);
  const originalSeconds = ffprobeSeconds(path);
  const seconds = extractSeconds(originalSeconds, selection.extraitMax);
  const trimmed = seconds < originalSeconds - 0.5;
  const measure = parseLoudnorm(
    ffmpeg(['-i', path, '-t', seconds.toFixed(3), '-af', MEASURE_FILTER, '-f', 'null', '-']),
  );
  const output = join(OUT_FILES, `${selection.id}.mp3`);
  const temporary = `${output}.tmp.mp3`;
  ffmpeg([
    '-y',
    '-i',
    path,
    '-t',
    seconds.toFixed(3),
    '-af',
    encodeFilter(measure, seconds, trimmed),
    '-ac',
    '2',
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${MP3_KBPS}k`,
    '-map_metadata',
    '-1',
    '-id3v2_version',
    '3',
    '-metadata',
    `title=${selection.titre}`,
    '-metadata',
    `artist=${creditedAuthor(license.auteur)}`,
    '-metadata',
    `copyright=${license.licence}`,
    '-metadata',
    `comment=${commonsPageUrl(file)}`,
    temporary,
  ]);
  renameSync(temporary, output);
  const data = readFileSync(output);
  return buildTrack({
    selection,
    auteur: license.auteur,
    licence: license.licence,
    licenceUrl: license.licenceUrl,
    source: commonsPageUrl(file),
    original: { ...record, dureeSecondes: originalSeconds },
    output: { sha256: sha256(data), octets: data.length, dureeSecondes: ffprobeSeconds(output) },
  });
}

async function main() {
  requireTools();
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT_FILES, { recursive: true });
  const tracks: MusicTrack[] = [];
  for (const selection of MUSIC_SELECTION) tracks.push(await importTrack(selection));
  // Fichiers d'un import précédent qui ne figurent plus dans la sélection.
  const kept = new Set(tracks.map((t) => t.fichier.slice('sons/'.length)));
  for (const file of readdirSync(OUT_FILES))
    if (!kept.has(file)) rmSync(join(OUT_FILES, file), { force: true });
  const manifest = MusicManifestSchema.parse({
    verifieLe: today(),
    note: 'Musique : morceaux de Kevin MacLeod (incompetech.com) sous licence CC BY 3.0, hébergés sur Wikimedia Commons ; licence et auteur lus sur la page de chaque fichier lors de l’import (pnpm data:sons). Extraits, volume normalisé et réencodage déclarés pour chaque morceau. Les jingles des moments forts sont fabriqués par le jeu (synthèse dans le navigateur) et n’empruntent aucun enregistrement.',
    morceaux: tracks,
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = tracks.reduce((n, t) => n + t.octets, 0);
  console.log(`${tracks.length} morceaux, ${(total / 1e6).toFixed(1)} Mo → ${OUT_JSON}`);
}

await main();
