import { MAP_ZONES, zoneOfDepartement, type MapZone } from '@r2027/shared';
import { csvRecords } from './csv';

export type CogCommune = { code: string; nom: string; departement: string; region: string };
export type CogDepartement = { code: string; nom: string; region: string; zone: MapZone };
export type CogRegion = { code: string; nom: string };
export type CogComer = { code: string; nom: string };

export type Cog = {
  communes: CogCommune[];
  departements: CogDepartement[];
  regions: CogRegion[];
  comer: CogComer[];
};

/** Départements cartographiés : la métropole (Corse comprise) et les cinq DROM. */
export function isMappedDepartement(code: string): boolean {
  if ((MAP_ZONES as readonly string[]).includes(code)) return true;
  return /^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B)$/.test(code) && code !== '20';
}

function required(record: Record<string, string>, key: string, file: string): string {
  const value = record[key];
  if (value === undefined || value === '')
    throw new Error(`${file} : colonne ${key} vide ou absente`);
  return value;
}

/**
 * Lit les fichiers du COG (communes, départements, régions, collectivités d'outre-mer).
 * Seules les communes (TYPECOM = COM) sont retenues : les arrondissements municipaux,
 * communes déléguées et associées ne sont pas des unités de la carte.
 */
export function parseCog(files: {
  communes: string;
  departements: string;
  regions: string;
  comer: string;
}): Cog {
  const communes = csvRecords(files.communes)
    .filter((r) => r.TYPECOM === 'COM')
    .map((r) => ({
      code: required(r, 'COM', 'communes'),
      nom: required(r, 'LIBELLE', 'communes'),
      departement: required(r, 'DEP', 'communes'),
      region: required(r, 'REG', 'communes'),
    }));
  const departements = csvRecords(files.departements).map((r) => {
    const code = required(r, 'DEP', 'departements');
    return {
      code,
      nom: required(r, 'LIBELLE', 'departements'),
      region: required(r, 'REG', 'departements'),
      zone: zoneOfDepartement(code),
    };
  });
  const regions = csvRecords(files.regions).map((r) => ({
    code: required(r, 'REG', 'regions'),
    nom: required(r, 'LIBELLE', 'regions'),
  }));
  const comer = csvRecords(files.comer).map((r) => ({
    code: required(r, 'COMER', 'comer'),
    nom: required(r, 'LIBELLE', 'comer'),
  }));

  const depCodes = new Set(departements.map((d) => d.code));
  const regCodes = new Set(regions.map((r) => r.code));
  for (const commune of communes) {
    if (!depCodes.has(commune.departement))
      throw new Error(`Commune ${commune.code} : département ${commune.departement} inconnu`);
    if (!regCodes.has(commune.region))
      throw new Error(`Commune ${commune.code} : région ${commune.region} inconnue`);
  }
  for (const departement of departements) {
    if (!isMappedDepartement(departement.code))
      throw new Error(`Département hors carte inattendu : ${departement.code}`);
  }
  return { communes, departements, regions, comer };
}
