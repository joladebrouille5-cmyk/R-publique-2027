import { CommuneIndexSchema, GeoManifestSchema, MAP_ZONES } from '@r2027/shared';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_DEPARTEMENTS, MILLESIME } from './geo/sources';

// Jeu de démonstration commité (P4-04) : il doit rester cohérent avec son manifeste.
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', MILLESIME);
const read = (name: string) => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as unknown;
const manifest = GeoManifestSchema.parse(read('manifest.json'));
const index = CommuneIndexSchema.parse(read(manifest.index));

type Topology = {
  objects: Record<string, { geometries: { properties: { code: string; dep: string } }[] }>;
};

describe('jeu de démonstration géographique', () => {
  it('est un sous-ensemble sourcé du référentiel complet', () => {
    expect(manifest).toMatchObject({ couverture: 'demonstration', millesime: MILLESIME });
    expect(manifest.effectifs.communesDuReferentiel).toBe(34_875);
    expect(manifest.departements).toHaveLength(101);
    expect(manifest.sources.map((s) => s.producteur).sort()).toEqual([
      'IGN',
      'INSEE',
      'INSEE',
      'INSEE',
      'INSEE',
    ]);
  });

  it('couvre la Corse, l’Ain et les cinq DROM, toutes leurs communes comprises', () => {
    const withFile = manifest.departements.filter((d) => d.fichier !== null);
    expect(withFile.map((d) => d.code)).toEqual([...DEMO_DEPARTEMENTS]);
    expect(new Set(withFile.map((d) => d.zone))).toEqual(new Set(MAP_ZONES));
    for (const departement of withFile) {
      const topology = read(departement.fichier!) as Topology;
      const codes = Object.values(topology.objects)[0]!
        .geometries.map((g) => g.properties.code)
        .sort();
      expect(codes).toHaveLength(departement.communes);
      expect(codes).toEqual(
        index
          .filter((e) => e[2] === departement.code)
          .map((e) => e[0])
          .sort(),
      );
    }
    expect(index).toHaveLength(manifest.effectifs.communes);
  });

  it('contient les communes des scénarios de recherche', () => {
    const byCode = new Map(index.map((e) => [e[0], e[1]]));
    expect(byCode.get('2A004')).toBe('Ajaccio');
    expect(byCode.get('97411')).toBe('Saint-Denis');
    expect(byCode.get('97611')).toBe('Mamoudzou');
  });

  it('présente les régions et départements de toute la France dans l’aperçu', () => {
    const topology = read(manifest.apercu) as Topology;
    expect(topology.objects.departements!.geometries).toHaveLength(101);
    expect(topology.objects.regions!.geometries).toHaveLength(18);
  });
});
