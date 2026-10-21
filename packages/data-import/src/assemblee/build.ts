// Composition réelle de l'Assemblée nationale (`packages/rulesets/src/assemblee-2026.json`) :
// effectifs de chaque groupe d'après la liste ouverte des députés en exercice, sans aucun nom
// de député, et position de chaque groupe d'après l'enquête CHES (parti de référence) ou une
// hypothèse documentée. Un groupe absent de la sélection fait échouer l'import plutôt que de
// recevoir une position inventée.
import { RealAssemblySchema, type AssemblyGroup, type RealAssembly } from '@r2027/shared';
import { parseCsv } from '../cog/csv';
import { ImportError } from '../geometry/coverage';
import { partyAt, toAxis, type ChesParty } from '../personnalites/ches';

export const SIEGES = 577;

/** Colonnes du fichier « liste_deputes_libre_office.csv » utilisées (les seules lues). */
const COLONNE_SIGLE = 'Groupe politique (abrégé)';
const COLONNE_LIBELLE = 'Groupe politique (complet)';

type GroupSelection = {
  id: string;
  nonInscrits?: true;
} & (
  | { ches: string }
  | {
      hypothese: {
        position: (ches: ChesParty[]) => { economie: number; societe: number };
        detail: string;
      };
    }
);

const mean = (parties: ChesParty[]) => ({
  economie: toAxis(parties.reduce((s, p) => s + p.lrecon, 0) / parties.length),
  societe: toAxis(parties.reduce((s, p) => s + p.galtan, 0) / parties.length),
});

/**
 * Groupes de la 17e législature et leur parti de référence dans l'enquête CHES 2024. Les
 * groupes sans parti noté reçoivent une position « hypothèse », motivée.
 */
export const GROUPES: Readonly<Record<string, GroupSelection>> = {
  RN: { id: 'rn', ches: 'RN' },
  EPR: { id: 'epr', ches: 'RE' },
  'LFI-NFP': { id: 'lfi-nfp', ches: 'FI' },
  SOC: { id: 'soc', ches: 'PS' },
  DR: { id: 'dr', ches: 'LR' },
  EcoS: { id: 'ecos', ches: 'LE/EELV' },
  Dem: { id: 'dem', ches: 'MoDem' },
  HOR: { id: 'hor', ches: 'Horizons' },
  GDR: { id: 'gdr', ches: 'PCF' },
  LIOT: {
    id: 'liot',
    hypothese: {
      position: () => ({ economie: 0, societe: 0 }),
      detail:
        'Groupe composite sans parti de référence noté par l’enquête CHES 2024 : position centrale (hypothèse de jeu).',
    },
  },
  UDR: {
    id: 'udr',
    hypothese: {
      position: (ches) => mean(ches.filter((p) => p.family === 1 || p.family === 2)),
      detail:
        'Groupe sans parti noté par l’enquête CHES 2024 : position moyenne des partis français des familles CHES « droite radicale » et « conservateurs » en 2024, d’après l’intitulé du groupe (« Union des droites ») (hypothèse de jeu).',
    },
  },
  NI: {
    id: 'ni',
    nonInscrits: true,
    hypothese: {
      position: () => ({ economie: 0, societe: 0 }),
      detail:
        'Députés non inscrits : aucune position commune ; position centrale et vote sans discipline de groupe (hypothèse de jeu).',
    },
  },
};

export const METHODE: RealAssembly['methode'] = {
  composition:
    'Nombre de députés en exercice par groupe politique, compté dans la liste ouverte de l’Assemblée nationale ; seules les colonnes du groupe sont lues, aucun nom de député n’est conservé. Sièges non pourvus : 577 moins les députés listés.',
  position:
    'Position du parti de référence du groupe dans l’enquête d’experts Chapel Hill (CHES) 2024, convertie sur les axes du jeu par (x − 5) × 20 (statut « estimation ») ; groupes sans parti noté : hypothèse motivée.',
};

export type AssemblyInputs = {
  verifieLe: string;
  legislature: number;
  csv: string;
  ches2024: ChesParty[];
  sources: RealAssembly['sources'];
};

export function buildAssembly(input: AssemblyInputs): RealAssembly {
  const [header, ...rows] = parseCsv(input.csv).filter((r) => r.length > 1);
  if (!header) throw new ImportError('Liste des députés vide.');
  const sigleAt = header.indexOf(COLONNE_SIGLE);
  const libelleAt = header.indexOf(COLONNE_LIBELLE);
  if (sigleAt < 0 || libelleAt < 0)
    throw new ImportError(`Colonnes absentes : « ${COLONNE_SIGLE} », « ${COLONNE_LIBELLE} ».`);

  const counts = new Map<string, { libelle: string; sieges: number }>();
  for (const row of rows) {
    const sigle = row[sigleAt]?.trim() ?? '';
    const libelle = row[libelleAt]?.trim() ?? '';
    if (!sigle || !libelle) throw new ImportError('Député sans groupe dans la liste.');
    const current = counts.get(sigle);
    if (current && current.libelle !== libelle)
      throw new ImportError(
        `Groupe ${sigle} : intitulés différents (${current.libelle}, ${libelle}).`,
      );
    counts.set(sigle, { libelle, sieges: (current?.sieges ?? 0) + 1 });
  }
  const filled = [...counts.values()].reduce((sum, c) => sum + c.sieges, 0);
  if (filled > SIEGES) throw new ImportError(`${filled} députés listés pour ${SIEGES} sièges.`);

  const groupes: AssemblyGroup[] = [...counts.entries()].map(([sigle, { libelle, sieges }]) => {
    const selection = GROUPES[sigle];
    if (!selection)
      throw new ImportError(
        `Groupe ${sigle} (${libelle}) absent de la sélection : lui choisir un parti de référence ou une hypothèse.`,
      );
    const base = {
      id: selection.id,
      sigle,
      libelle,
      sieges,
      nonInscrits: selection.nonInscrits === true,
    };
    if ('ches' in selection) {
      const party = partyAt(input.ches2024, selection.ches, 2024);
      return {
        ...base,
        position: { economie: toAxis(party.lrecon), societe: toAxis(party.galtan) },
        positionStatut: 'estimation',
        ches: {
          parti: party.party,
          lrecon: Math.round(party.lrecon * 100) / 100,
          galtan: Math.round(party.galtan * 100) / 100,
        },
        positionDetail: `Position du parti ${party.party} dans l’enquête CHES 2024.`,
      };
    }
    return {
      ...base,
      position: selection.hypothese.position(input.ches2024.filter((p) => p.year === 2024)),
      positionStatut: 'hypothese',
      ches: null,
      positionDetail: selection.hypothese.detail,
    };
  });
  groupes.sort((a, b) => b.sieges - a.sieges || (a.sigle < b.sigle ? -1 : 1));

  return RealAssemblySchema.parse({
    verifieLe: input.verifieLe,
    legislature: input.legislature,
    siegesTotal: SIEGES,
    sources: input.sources,
    methode: METHODE,
    groupes,
    vacants: SIEGES - filled,
  });
}
