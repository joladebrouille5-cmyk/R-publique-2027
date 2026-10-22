// Sources du référentiel cartographique (voir docs/SOURCES.md §2). Une nouvelle édition = un
// nouveau millésime : les fichiers générés portent le millésime dans leur chemin.

export const MILLESIME = 'cog-2026';

/**
 * Départements du jeu de démonstration commité (et embarqué dans l'application Android) : Ain,
 * Corse, Somme (phase 9 : Amiens et ses 772 communes) et les cinq DROM.
 */
export const DEMO_DEPARTEMENTS = [
  '01',
  '2A',
  '2B',
  '80',
  '971',
  '972',
  '973',
  '974',
  '976',
] as const;

const INSEE = 'https://www.insee.fr/fr/statistiques/fichier/8740222';
const COG = {
  producteur: 'INSEE',
  licence: 'Licence Ouverte 2.0',
  millesime: 'COG 2026 (au 1er janvier 2026)',
} as const;

export const GEO_SOURCES = [
  {
    id: 'insee-cog-communes',
    titre: 'Code officiel géographique — communes',
    fichier: 'v_commune_2026.csv',
    url: `${INSEE}/v_commune_2026.csv`,
    ...COG,
  },
  {
    id: 'insee-cog-departements',
    titre: 'Code officiel géographique — départements',
    fichier: 'v_departement_2026.csv',
    url: `${INSEE}/v_departement_2026.csv`,
    ...COG,
  },
  {
    id: 'insee-cog-regions',
    titre: 'Code officiel géographique — régions',
    fichier: 'v_region_2026.csv',
    url: `${INSEE}/v_region_2026.csv`,
    ...COG,
  },
  {
    id: 'insee-cog-comer',
    titre: 'Code officiel géographique — collectivités d’outre-mer',
    fichier: 'v_comer_2026.csv',
    url: `${INSEE}/v_comer_2026.csv`,
    ...COG,
  },
  {
    id: 'ign-admin-express-cog-carto',
    titre: 'ADMIN EXPRESS COG CARTO 4-0, France entière WGS84 (GeoPackage)',
    fichier: 'ADMIN-EXPRESS-COG-CARTO_4-0__GPKG_WGS84G_FRA_2026-01-01.7z',
    url: 'https://data.geopf.fr/telechargement/download/ADMIN-EXPRESS-COG-CARTO/ADMIN-EXPRESS-COG-CARTO_4-0__GPKG_WGS84G_FRA_2026-01-01/ADMIN-EXPRESS-COG-CARTO_4-0__GPKG_WGS84G_FRA_2026-01-01.7z',
    producteur: 'IGN',
    licence: 'Licence Ouverte 2.0',
    millesime: 'édition 2026-01-01',
  },
] as const;
