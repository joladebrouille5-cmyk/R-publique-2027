import { GeoManifestSchema } from '@r2027/shared';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import { isMappedDepartement, parseCog, type Cog } from './cog/cog';
import { csvRecords, parseCsv } from './cog/csv';
import { buildGeo } from './geo/build';
import { checkCoverage, ImportError } from './geometry/coverage';
import type { GpkgFeature } from './geometry/gpkg';
import { GeometryError, readGpkgGeometry, readWkb } from './geometry/wkb';

/** WKB d'un polygone (un anneau) dans l'ordre d'octets demandé. */
function polygonWkb(ring: Position[], little = true): Uint8Array {
  const view = new DataView(new ArrayBuffer(1 + 4 + 4 + 4 + ring.length * 16));
  let o = 0;
  view.setUint8(o, little ? 1 : 0);
  view.setUint32((o += 1), 3, little);
  view.setUint32((o += 4), 1, little);
  view.setUint32((o += 4), ring.length, little);
  o += 4;
  for (const [x, y] of ring) {
    view.setFloat64(o, x!, little);
    view.setFloat64(o + 8, y!, little);
    o += 16;
  }
  return new Uint8Array(view.buffer);
}

/** En-tête GeoPackage (enveloppe XY de 32 octets) suivi du WKB. */
function gpkg(wkb: Uint8Array, srs = 4326): Uint8Array {
  const header = new DataView(new ArrayBuffer(8 + 32));
  header.setUint8(0, 0x47);
  header.setUint8(1, 0x50);
  header.setUint8(3, 0b0000_0011);
  header.setInt32(4, srs, true);
  return new Uint8Array([...new Uint8Array(header.buffer), ...wkb]);
}

const square = (x: number, y: number, size = 0.1): Position[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

describe('lecture CSV', () => {
  it('gère guillemets, virgules et guillemets doublés, sans convertir les codes', () => {
    expect(parseCsv('"COM","LIBELLE"\r\n"01001","L\'Abergement, ""test"""\n')).toEqual([
      ['COM', 'LIBELLE'],
      ['01001', 'L\'Abergement, "test"'],
    ]);
    expect(csvRecords('"DEP","LIBELLE"\n"2A","Corse-du-Sud"')).toEqual([
      { DEP: '2A', LIBELLE: 'Corse-du-Sud' },
    ]);
  });

  it('refuse une ligne au mauvais nombre de colonnes ou un guillemet non refermé', () => {
    expect(() => csvRecords('A,B\n1')).toThrow(/ligne 2/);
    expect(() => parseCsv('"ouvert')).toThrow(/guillemet/);
  });
});

describe('géométries GeoPackage', () => {
  it('lit un polygone WKB dans les deux ordres d’octets', () => {
    const ring = square(2, 46);
    for (const little of [true, false]) {
      expect(readWkb(polygonWkb(ring, little))).toEqual({ type: 'Polygon', coordinates: [ring] });
    }
  });

  it('lit l’en-tête GeoPackage et vérifie le système de coordonnées', () => {
    const geometry = readGpkgGeometry(gpkg(polygonWkb(square(55.4, -21))));
    expect(geometry.type).toBe('Polygon');
    expect(() => readGpkgGeometry(gpkg(polygonWkb(square(0, 0)), 2154))).toThrow(GeometryError);
    expect(() => readGpkgGeometry(new Uint8Array([1, 2, 3]))).toThrow(/GP/);
  });
});

describe('contrôle de couverture', () => {
  it('accepte une correspondance exacte et écarte les collectivités hors carte', () => {
    const result = checkCoverage(['01001', '2A004'], ['2A004', '01001', '97501'], (c) =>
      c.startsWith('975'),
    );
    expect(result.offMap).toEqual(['97501']);
  });

  it.each([
    [['01001', '01002'], ['01001'], /sans géométrie : 01002/],
    [['01001'], ['01001', '01001'], /plusieurs géométries : 01001/],
    [['01001'], ['01001', '99999'], /hors référentiel : 99999/],
  ])(
    'refuse l’import si une commune n’a pas exactement une géométrie',
    (reference, geometries, message) => {
      expect(() => checkCoverage(reference, geometries, () => false)).toThrow(ImportError);
      expect(() => checkCoverage(reference, geometries, () => false)).toThrow(message);
    },
  );
});

const cogFiles = {
  communes: [
    '"TYPECOM","COM","REG","DEP","LIBELLE"',
    '"COM","2A004","94","2A","Ajaccio"',
    '"COM","2A006","94","2A","Alata"',
    '"COM","97411","04","974","Saint-Denis"',
    '"ARM","75101","11","75","Paris 1er Arrondissement"',
  ].join('\n'),
  departements: '"DEP","REG","LIBELLE"\n"2A","94","Corse-du-Sud"\n"974","04","La Réunion"',
  regions: '"REG","LIBELLE"\n"94","Corse"\n"04","La Réunion"',
  comer:
    '"COMER","LIBELLE"\n"975","Saint-Pierre-et-Miquelon"\n"984","Terres australes et antarctiques françaises"',
};

describe('Code officiel géographique', () => {
  it('ne retient que les communes et garde les codes en chaînes', () => {
    const cog = parseCog(cogFiles);
    expect(cog.communes.map((c) => c.code)).toEqual(['2A004', '2A006', '97411']);
    expect(cog.departements.map((d) => [d.code, d.zone])).toEqual([
      ['2A', 'metropole'],
      ['974', '974'],
    ]);
  });

  it('reconnaît les départements cartographiés', () => {
    for (const code of ['01', '2A', '2B', '95', '971', '976'])
      expect(isMappedDepartement(code)).toBe(true);
    for (const code of ['20', '96', '975', '99']) expect(isMappedDepartement(code)).toBe(false);
  });

  it('refuse une commune rattachée à un département inconnu', () => {
    expect(() =>
      parseCog({
        ...cogFiles,
        communes: '"TYPECOM","COM","REG","DEP","LIBELLE"\n"COM","2B033","94","2B","Bastia"',
      }),
    ).toThrow(/département 2B inconnu/);
  });
});

describe('construction du référentiel', () => {
  const cog: Cog = parseCog(cogFiles);
  const feature = (
    code: string,
    geometry: Polygon | MultiPolygon,
    population = 100,
  ): GpkgFeature => ({
    properties: { code_insee: code, population },
    geometry,
  });
  const communes = [
    feature('2A004', { type: 'Polygon', coordinates: [square(8.7, 41.9)] }),
    feature('2A006', { type: 'Polygon', coordinates: [square(8.8, 41.9)] }),
    feature('97411', { type: 'MultiPolygon', coordinates: [[square(55.4, -20.9)]] }),
    feature('97502', { type: 'Polygon', coordinates: [square(-56.2, 46.7)] }),
  ];
  const sources = [
    {
      id: 'test',
      titre: 'Test',
      producteur: 'IGN',
      url: 'https://example.org/test.7z',
      licence: 'Licence Ouverte 2.0',
      millesime: '2026',
      telechargeLe: '2026-10-20',
      sha256: 'a'.repeat(64),
      octets: 1,
    },
  ];
  const input = {
    millesime: 'test',
    cog,
    communes,
    sources,
    intervals: { communes: 100, apercu: 1000 },
  };

  it('produit l’aperçu national, un fichier par département, l’index et le manifeste', async () => {
    const { manifest, files } = await buildGeo(input);
    expect(GeoManifestSchema.parse(JSON.parse(files.get('manifest.json')!))).toEqual(manifest);
    expect([...files.keys()].sort()).toEqual([
      'communes/2A.topo.json',
      'communes/974.topo.json',
      'france.topo.json',
      'index.json',
      'manifest.json',
    ]);
    const overview = JSON.parse(files.get('france.topo.json')!);
    // Les départements et régions sont fusionnés à partir des communes : un seul objet par code.
    expect(
      overview.objects.departements.geometries
        .map((g: { properties: { code: string } }) => g.properties.code)
        .sort(),
    ).toEqual(['2A', '974']);
    expect(JSON.parse(files.get('index.json')!)).toEqual([
      ['2A004', 'Ajaccio', '2A', '94', 8.7, 41.9, 8.8, 42],
      ['2A006', 'Alata', '2A', '94', 8.8, 41.9, 8.9, 42],
      ['97411', 'Saint-Denis', '974', '04', 55.4, -20.9, 55.5, -20.8],
    ]);
    expect(manifest.couverture).toBe('complet');
    expect(manifest.horsCarte.map((h) => h.code)).toEqual(['975', '99']);
    expect(manifest.departements.find((d) => d.code === '2A')).toMatchObject({
      communes: 2,
      zone: 'metropole',
    });
  });

  it('limite le jeu de démonstration aux départements choisis, après validation complète', async () => {
    const { manifest, files } = await buildGeo({ ...input, departements: new Set(['974']) });
    expect(manifest.couverture).toBe('demonstration');
    expect(manifest.effectifs).toMatchObject({ communes: 1, communesDuReferentiel: 3 });
    expect(manifest.departements.find((d) => d.code === '2A')!.fichier).toBeNull();
    expect(files.has('communes/2A.topo.json')).toBe(false);
    await expect(
      buildGeo({ ...input, communes: communes.slice(1), departements: new Set(['974']) }),
    ).rejects.toThrow(/sans géométrie : 2A004/);
  });

  it('est reproductible : même entrée, mêmes fichiers', async () => {
    const [a, b] = await Promise.all([buildGeo(input), buildGeo(input)]);
    expect([...a.files]).toEqual([...b.files]);
  });
});
