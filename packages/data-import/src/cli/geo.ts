// Import du référentiel cartographique : `pnpm data:geo` (complet, dans data/processed/geo)
// ou `pnpm data:geo --demo` (sous-ensemble commité dans packages/data-import/demo).
import { path7za } from '7zip-bin';
import type { DataImport } from '@r2027/shared';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCog } from '../cog/cog';
import { download, type DownloadRecord } from '../download';
import { buildGeo } from '../geo/build';
import { ImportError } from '../geometry/coverage';
import { readGpkgTable } from '../geometry/gpkg';
import { DEMO_DEPARTEMENTS, GEO_SOURCES, MILLESIME } from '../geo/sources';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw');
const demo = process.argv.includes('--demo');
const OUT = demo
  ? join(ROOT, 'packages/data-import/demo', MILLESIME)
  : join(ROOT, 'data/processed/geo', MILLESIME);

function toImport(source: (typeof GEO_SOURCES)[number], record: DownloadRecord): DataImport {
  return {
    id: source.id,
    titre: source.titre,
    producteur: source.producteur,
    url: source.url,
    licence: source.licence,
    millesime: source.millesime,
    telechargeLe: record.telechargeLe,
    sha256: record.sha256,
    octets: record.octets,
  };
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const records = new Map<string, { path: string; record: DownloadRecord }>();
  for (const source of GEO_SOURCES) {
    const path = join(RAW, source.fichier);
    console.log(`Source : ${source.url} (copie locale réutilisée si son empreinte est intacte)`);
    records.set(source.id, { path, record: await download(source.url, path) });
  }

  const archive = records.get('ign-admin-express-cog-carto')!.path;
  const gpkgDir = join(RAW, 'admin-express');
  const gpkg = existsSync(gpkgDir)
    ? readdirSync(gpkgDir).find((f) => f.endsWith('.gpkg'))
    : undefined;
  if (!gpkg) {
    console.log('Extraction du GeoPackage…');
    chmodSync(path7za, 0o755);
    execFileSync(path7za, ['e', '-y', `-o${gpkgDir}`, archive, '*.gpkg', '-r'], {
      stdio: 'ignore',
    });
  }
  const gpkgPath = join(
    gpkgDir,
    readdirSync(gpkgDir).find((f) => f.endsWith('.gpkg'))!,
  );

  const text = (id: string) => readFileSync(records.get(id)!.path, 'utf8');
  const cog = parseCog({
    communes: text('insee-cog-communes'),
    departements: text('insee-cog-departements'),
    regions: text('insee-cog-regions'),
    comer: text('insee-cog-comer'),
  });
  console.log(
    `COG : ${cog.communes.length} communes, ${cog.departements.length} départements, ${cog.regions.length} régions`,
  );
  const communes = readGpkgTable(gpkgPath, 'commune', ['code_insee', 'population']);
  console.log(`ADMIN EXPRESS : ${communes.length} géométries communales`);

  const { manifest, files } = await buildGeo({
    millesime: MILLESIME,
    cog,
    communes,
    sources: GEO_SOURCES.map((s) => toImport(s, records.get(s.id)!.record)),
    intervals: { communes: 100, apercu: 1000 },
    ...(demo ? { departements: new Set(DEMO_DEPARTEMENTS) } : {}),
  });

  rmSync(OUT, { recursive: true, force: true });
  for (const [name, content] of files) {
    const path = join(OUT, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  console.log(
    `Référentiel ${manifest.couverture} écrit dans ${OUT} : ${manifest.effectifs.communes} communes, ` +
      `${files.size} fichiers. Hors carte : ${manifest.horsCarte.map((h) => h.nom).join(', ')}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof ImportError ? error.message : error);
  process.exit(1);
});
