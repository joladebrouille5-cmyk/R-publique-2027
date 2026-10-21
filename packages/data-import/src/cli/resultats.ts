// Import des résultats de la présidentielle 2022 par commune, ramenés au référentiel COG 2026 :
// `pnpm data:resultats` (après `pnpm data:geo`). Sortie : data/processed/resultats/presidentielle-2022.
import { GeoManifestSchema, type DataImport } from '@r2027/shared';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from '../download';
import { MILLESIME } from '../geo/sources';
import { ImportError } from '../geometry/coverage';
import { buildRound } from '../results/build';
import { parseResults } from '../results/parse';
import { buildPassage } from '../results/passage';
import { ELECTION, proclaimedValues, RESULT_SOURCES } from '../results/sources';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw');
const GEO = join(ROOT, 'data/processed/geo', MILLESIME);
const OUT = join(ROOT, 'data/processed/resultats', ELECTION);

const MOVEMENTS = {
  id: 'insee-cog-mouvements',
  titre: 'Code officiel géographique — mouvements des communes depuis 1943',
  producteur: 'INSEE',
  licence: 'Licence Ouverte 2.0',
  millesime: 'COG 2026 (au 1er janvier 2026)',
  fichier: 'v_mvt_commune_2026.csv',
  url: 'https://www.insee.fr/fr/statistiques/fichier/8740222/v_mvt_commune_2026.csv',
};

type Topology = {
  objects: Record<
    string,
    { geometries: { properties: { code: string; population: number | null } }[] }
  >;
};

async function main() {
  const manifest = GeoManifestSchema.parse(
    JSON.parse(readFileSync(join(GEO, 'manifest.json'), 'utf8')),
  );
  if (manifest.couverture !== 'complet')
    throw new Error('Lancer d’abord « pnpm data:geo » (référentiel complet).');
  const population = new Map<string, number>();
  for (const departement of manifest.departements) {
    const topology = JSON.parse(readFileSync(join(GEO, departement.fichier!), 'utf8')) as Topology;
    for (const g of Object.values(topology.objects)[0]!.geometries) {
      population.set(g.properties.code, g.properties.population ?? 0);
    }
  }

  mkdirSync(RAW, { recursive: true });
  const movementsRecord = await download(MOVEMENTS.url, join(RAW, MOVEMENTS.fichier));
  const movements = readFileSync(join(RAW, MOVEMENTS.fichier), 'utf8');
  const cogSource = manifest.sources.filter((s) => s.id === 'insee-cog-communes');
  const movementsSource: DataImport = {
    id: MOVEMENTS.id,
    titre: MOVEMENTS.titre,
    producteur: MOVEMENTS.producteur,
    url: MOVEMENTS.url,
    licence: MOVEMENTS.licence,
    millesime: MOVEMENTS.millesime,
    telechargeLe: movementsRecord.telechargeLe,
    sha256: movementsRecord.sha256,
    octets: movementsRecord.octets,
  };

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const source of RESULT_SOURCES) {
    console.log(`Source : ${source.url} (copie locale réutilisée si son empreinte est intacte)`);
    const path = join(RAW, source.fichier);
    const record = await download(source.url, path);
    const text = new TextDecoder('windows-1252').decode(readFileSync(path));
    const { candidats, lines } = parseResults(text);
    const passage = buildPassage(
      movements,
      '2022-01-01',
      lines.filter((l) => !l.offMap).map((l) => l.code),
      [...population.keys()],
    );
    const round = buildRound({
      election: ELECTION,
      tour: source.tour,
      date: source.date,
      millesimeGeographique: manifest.millesime,
      sources: [
        {
          id: source.id,
          titre: source.titre,
          producteur: source.producteur,
          url: source.url,
          licence: source.licence,
          millesime: source.millesime,
          telechargeLe: record.telechargeLe,
          sha256: record.sha256,
          octets: record.octets,
        },
        movementsSource,
        ...cogSource,
      ],
      proclamation: {
        reference: source.proclamation.reference,
        url: source.proclamation.url,
        valeurs: proclaimedValues(source.proclamation.totaux, candidats),
      },
      candidats,
      lines,
      passage,
      population,
    });
    writeFileSync(join(OUT, `t${source.tour}.json`), JSON.stringify(round));
    const fusions = passage.filter((g) => g.sources.length > 1 && g.targets.length === 1).length;
    console.log(
      `Tour ${source.tour} : ${lines.length} lignes = totaux proclamés à l’unité ; ` +
        `${Object.keys(round.communes).length} communes du référentiel (${fusions} fusions, ` +
        `${round.estimations.length} communes ventilées, ${round.sansLigne.length} sans électeurs) ; ` +
        `hors carte : ${Object.keys(round.horsCarte).join(', ')}.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ImportError ? error.message : error);
  process.exit(1);
});
