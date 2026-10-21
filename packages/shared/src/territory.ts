import { z } from 'zod';

// Référentiel territorial (§3) : communes, départements et régions du Code officiel
// géographique (COG), produits par packages/data-import. Les codes sont TOUJOURS des chaînes
// (« 01 », « 2A », « 2A004 », « 97411 ») : jamais convertis en nombres.

export const TERRITORY_LEVELS = ['region', 'departement', 'commune'] as const;
export const TerritoryLevelSchema = z.enum(TERRITORY_LEVELS);
export type TerritoryLevel = z.infer<typeof TerritoryLevelSchema>;

/** Zones cartographiées : la métropole (carte principale) et les cinq DROM (encarts). */
export const MAP_ZONES = ['metropole', '971', '972', '973', '974', '976'] as const;
export const MapZoneSchema = z.enum(MAP_ZONES);
export type MapZone = z.infer<typeof MapZoneSchema>;

export const DROM_LABELS: Record<Exclude<MapZone, 'metropole'>, string> = {
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte',
};

const Code = z.string().regex(/^[0-9AB]{2,5}$/);
/** Emprise [ouest, sud, est, nord] en degrés WGS84. */
const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** Zone d'un département : son code s'il s'agit d'un DROM, « metropole » sinon. */
export function zoneOfDepartement(code: string): MapZone {
  return (MAP_ZONES as readonly string[]).includes(code) ? (code as MapZone) : 'metropole';
}

/** Provenance d'un fichier importé (§10) : rien n'est affiché sans source ni licence. */
export const DataImportSchema = z
  .object({
    id: z.string().min(1),
    titre: z.string().min(1),
    producteur: z.string().min(1),
    url: z.url(),
    licence: z.string().min(1),
    millesime: z.string().min(1),
    telechargeLe: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    octets: z.number().int().positive(),
  })
  .strict();
export type DataImport = z.infer<typeof DataImportSchema>;

export const RegionInfoSchema = z
  .object({ code: Code, nom: z.string().min(1), bbox: BBox })
  .strict();
export const DepartementInfoSchema = z
  .object({
    code: Code,
    nom: z.string().min(1),
    region: Code,
    zone: MapZoneSchema,
    communes: z.number().int().positive(),
    /** Population légale totale des communes (INSEE, via ADMIN EXPRESS). */
    population: z.number().int().nonnegative(),
    bbox: BBox,
    /** Fichier TopoJSON des communes du département, relatif au manifeste ; null hors du jeu de démonstration. */
    fichier: z.string().min(1).nullable(),
  })
  .strict();
export type DepartementInfo = z.infer<typeof DepartementInfoSchema>;

/** Collectivité ou ensemble d'électeurs non cartographié, présenté dans la liste « Hors carte ». */
export const OffMapAreaSchema = z
  .object({ code: z.string().min(1), nom: z.string().min(1) })
  .strict();

/** Manifeste d'un référentiel géographique (servi par l'API, lu par la carte). */
export const GeoManifestSchema = z
  .object({
    format: z.literal('republique-2027/geo'),
    formatVersion: z.literal(1),
    millesime: z.string().min(1),
    /** complet : les 34 875 communes ; demonstration : sous-ensemble commité (hors ligne). */
    couverture: z.enum(['complet', 'demonstration']),
    importeur: z.string().min(1),
    sources: z.array(DataImportSchema).min(1),
    simplification: z.object({ communes: z.string(), apercu: z.string() }).strict(),
    effectifs: z
      .object({
        communes: z.number().int().nonnegative(),
        communesDuReferentiel: z.number().int().positive(),
        departements: z.number().int().positive(),
        regions: z.number().int().positive(),
      })
      .strict(),
    /** Fichier TopoJSON des régions et départements (aperçu national), relatif au manifeste. */
    apercu: z.string().min(1),
    /** Index de recherche des communes, relatif au manifeste. */
    index: z.string().min(1),
    regions: z.array(RegionInfoSchema),
    departements: z.array(DepartementInfoSchema),
    horsCarte: z.array(OffMapAreaSchema),
  })
  .strict();
export type GeoManifest = z.infer<typeof GeoManifestSchema>;

/**
 * Index compact des communes : [code, nom, département, région, ouest, sud, est, nord].
 * Sert à la recherche et à la fiche, sans charger les géométries.
 */
export const CommuneIndexEntrySchema = z.tuple([
  Code,
  z.string().min(1),
  Code,
  Code,
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export const CommuneIndexSchema = z.array(CommuneIndexEntrySchema);
export type CommuneIndexEntry = z.infer<typeof CommuneIndexEntrySchema>;

/** Résultat de recherche d'un territoire (nom ou code). */
export const TerritorySearchResultSchema = z
  .object({
    level: TerritoryLevelSchema,
    code: Code,
    nom: z.string(),
    departement: Code.nullable(),
    zone: MapZoneSchema,
    bbox: BBox,
  })
  .strict();
export type TerritorySearchResult = z.infer<typeof TerritorySearchResultSchema>;

/** Forme de recherche : minuscules, sans accents, tirets et apostrophes remplacés par des espaces. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
