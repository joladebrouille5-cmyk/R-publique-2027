import { feature } from 'topojson-client';
import type { TerritoryCollection } from '../map/data';

// Départements de la géographie de démonstration (commitée), pour les tests du plateau.

const FILES = import.meta.glob('../../../../packages/data-import/demo/cog-2026/france.topo.json', {
  eager: true,
  import: 'default',
});
const topology = Object.values(FILES)[0] as Parameters<typeof feature>[0] & {
  objects: Record<string, Parameters<typeof feature>[1]>;
};

export const DEMO_DEPARTEMENTS = feature(
  topology,
  topology.objects.departements!,
) as unknown as TerritoryCollection;
