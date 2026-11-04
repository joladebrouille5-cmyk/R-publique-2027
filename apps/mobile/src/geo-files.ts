import type { GeoSource } from '@r2027/local-api';

// Référentiel cartographique de démonstration (COG 2026, commité) embarqué dans l'application :
// chaque fichier devient un morceau du paquet, chargé à la demande.
const ROOT = '../../../packages/data-import/demo/cog-2026/';
const FILES = import.meta.glob<unknown>('../../../packages/data-import/demo/cog-2026/**/*.json', {
  import: 'default',
});

export const readEmbeddedGeo: GeoSource = async (name) => {
  const load = FILES[ROOT + name];
  if (!load) throw new Error(`Fichier cartographique absent de l’application : ${name}`);
  return load();
};
