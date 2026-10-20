import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export type DownloadRecord = { url: string; telechargeLe: string; sha256: string; octets: number };

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Télécharge `url` vers `path` en reprenant après une coupure (en-tête Range), puis enregistre
 * à côté (`.meta.json`) l'URL, la date, la taille et l'empreinte SHA-256. Un fichier déjà
 * présent avec ses métadonnées n'est pas retéléchargé ; son empreinte est revérifiée.
 */
export async function download(url: string, path: string, attempts = 30): Promise<DownloadRecord> {
  const metaPath = `${path}.meta.json`;
  if (existsSync(path) && existsSync(metaPath)) {
    const record = JSON.parse(readFileSync(metaPath, 'utf8')) as DownloadRecord;
    if (record.url === url && (await sha256File(path)) === record.sha256) return record;
    throw new Error(
      `${path} ne correspond plus à son empreinte enregistrée : supprimez-le pour le retélécharger.`,
    );
  }
  let total: number | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const start = existsSync(path) ? statSync(path).size : 0;
    if (total !== null && start >= total) break;
    try {
      const response = await fetch(url, { headers: start > 0 ? { range: `bytes=${start}-` } : {} });
      // 416 : le fichier local est déjà complet (reprise d'un téléchargement terminé).
      if (response.status === 416 && start > 0) break;
      if (!(response.ok || response.status === 206) || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      const length = Number(response.headers.get('content-length') ?? NaN);
      if (response.status === 206) {
        const range = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
        total = range ? Number(range[1]) : null;
      } else {
        total = Number.isFinite(length) ? length : null;
      }
      const append = response.status === 206 && start > 0;
      await pipeline(
        Readable.fromWeb(response.body as unknown as WebReadableStream),
        createWriteStream(path, { flags: append ? 'a' : 'w' }),
      );
      if (total === null || statSync(path).size >= total) break;
    } catch (error) {
      if (attempt === attempts)
        throw new Error(`Téléchargement impossible : ${url} (${String(error)})`, { cause: error });
      await sleep(Math.min(16_000, 1000 * attempt));
    }
  }
  const octets = statSync(path).size;
  if (total !== null && octets !== total)
    throw new Error(`${url} : ${octets} octets reçus sur ${total}`);
  const record: DownloadRecord = {
    url,
    telechargeLe: new Date().toISOString().slice(0, 10),
    sha256: await sha256File(path),
    octets,
  };
  writeFileSync(metaPath, JSON.stringify(record, null, 2));
  return record;
}
