import type { HistoricalRound, Ruleset } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { sha256Hex } from '../core/sha256';
import { largestRemainder } from '../election/apportion';

// Base électorale territoriale (phase 4) : l'unité de vote est la commune (ou une collectivité
// hors carte). Chaque unité porte ses inscrits, l'affinité de chacun des groupes d'électeurs
// du jeu (1 = comme en moyenne nationale) et un facteur de participation locale. C'est une
// donnée de référence, fournie au moteur par l'API : le moteur ne lit aucun fichier.

export type TerritorialUnit = {
  code: string;
  niveau: 'commune' | 'departement' | 'hors-carte';
  /** Département et région de l'unité ; null hors carte. */
  departement: string | null;
  region: string | null;
  inscrits: number;
  /** Multiplicateur de la part nationale de chaque groupe, dans l'ordre des groupes du jeu de règles. */
  affinite: number[];
  /** Participation relative à la moyenne, à composition égale (1 = moyenne). */
  participation: number;
};

export type TerritorialBaseline = {
  /** Empreinte du contenu : les résultats communaux d'une partie ne se recalculent qu'avec la même base. */
  id: string;
  /** reel : tirée des résultats officiels ; fictif : démonstration ; national : sans géographie. */
  nature: 'reel' | 'fictif' | 'national';
  description: string;
  units: TerritorialUnit[];
};

const round6 = (value: number) => Math.round(value * 1e6) / 1e6 + 0;

function finalize(
  nature: TerritorialBaseline['nature'],
  description: string,
  units: TerritorialUnit[],
): TerritorialBaseline {
  const sorted = [...units].sort((a, b) => compareStrings(a.code, b.code));
  const content = sorted
    .map((u) =>
      [
        u.code,
        u.niveau,
        u.departement,
        u.region,
        u.inscrits,
        u.affinite.join(','),
        u.participation,
      ].join('|'),
    )
    .join(';');
  return { id: sha256Hex(`${nature};${content}`).slice(0, 16), nature, description, units: sorted };
}

/** Base sans géographie : une seule unité nationale (tests du moteur, parties sans référentiel). */
export function nationalBaseline(ruleset: Ruleset): TerritorialBaseline {
  return finalize('national', 'Électorat national, sans géographie', [
    {
      code: 'FR',
      niveau: 'hors-carte',
      departement: null,
      region: null,
      inscrits: ruleset.electorat.inscrits.valeur,
      affinite: ruleset.electorat.groupes.map(() => 1),
      participation: 1,
    },
  ]);
}

export type CommuneRef = { code: string; departement: string; region: string };

/**
 * Base « réelle » : à partir des résultats communaux d'un premier tour passé (répartition des
 * électeurs de chaque candidat entre les groupes, selon le jeu de règles) et des inscrits du
 * dernier tour. L'affinité d'un groupe dans une commune est sa part locale rapportée à sa part
 * nationale, lissée pour les petites communes ; la participation locale est l'écart de la
 * commune à la participation attendue d'après sa composition, borné.
 */
export function historicalBaseline(
  ruleset: Ruleset,
  firstRound: HistoricalRound,
  lastRound: HistoricalRound,
  communes: readonly CommuneRef[],
): TerritorialBaseline {
  const { groupes, baseHistorique } = ruleset.electorat;
  const g = groupes.length;
  const indexOf = new Map(groupes.map((group, i) => [group.id, i]));
  const rows = firstRound.candidats.map((c) => {
    const shares = baseHistorique.candidats[c.nom];
    if (!shares)
      throw new Error(`Candidat de ${firstRound.election} absent du jeu de règles : ${c.nom}`);
    const row = new Array<number>(g).fill(0);
    for (const [id, share] of Object.entries(shares)) row[indexOf.get(id)!] = share;
    return row;
  });
  // Abstention et votes blancs ou nuls : selon l'abstention attendue et la taille des groupes.
  const normalize = (values: number[]) => {
    const total = values.reduce((a, b) => a + b, 0);
    return values.map((v) => v / total);
  };
  const abstentionRow = normalize(groupes.map((group) => group.part * (1 - group.participation)));
  const blankRow = normalize(groupes.map((group) => group.part));

  /** Électeurs de chaque groupe d'après un vecteur [inscrits, abstentions, votants, blancs, nuls, exprimés, voix…]. */
  const composition = (values: readonly number[]) => {
    const result = new Array<number>(g).fill(0);
    const add = (row: readonly number[], count: number) =>
      row.forEach((share, i) => (result[i]! += share * count));
    add(abstentionRow, values[1]!);
    add(blankRow, values[3]! + values[4]!);
    rows.forEach((row, k) => add(row, values[6 + k]!));
    return result;
  };
  const expectedTurnout = (shares: readonly number[]) =>
    shares.reduce((sum, share, i) => sum + share * groupes[i]!.participation, 0);

  const national = new Array<number>(6 + rows.length).fill(0);
  for (const values of [
    ...Object.values(firstRound.communes),
    ...Object.values(firstRound.horsCarte).map((h) => h.valeurs),
  ]) {
    values.forEach((v, i) => (national[i]! += v));
  }
  const nationalComposition = normalize(composition(national));
  const nationalTurnout = national[2]! / national[0]!;
  const nationalExpected = expectedTurnout(groupes.map((group) => group.part));
  const { lissage, participationLocale } = baseHistorique;

  const unitOf = (values: readonly number[]) => {
    const local = composition(values);
    const inscrits = values[0]!;
    const smoothed = local.map(
      (v, i) => (v + lissage * nationalComposition[i]!) / (inscrits + lissage),
    );
    const affinite = smoothed.map((share, i) => round6(share / nationalComposition[i]!));
    const shares = normalize(groupes.map((group, i) => group.part * affinite[i]!));
    const turnout = (values[2]! + lissage * nationalTurnout) / (inscrits + lissage);
    const factor = turnout / nationalTurnout / (expectedTurnout(shares) / nationalExpected);
    return {
      affinite,
      participation: round6(
        Math.min(participationLocale.max, Math.max(participationLocale.min, factor)),
      ),
    };
  };

  const units: TerritorialUnit[] = communes.map((commune) => {
    const first = firstRound.communes[commune.code];
    const last = lastRound.communes[commune.code];
    if (!first || !last) throw new Error(`Commune sans résultats : ${commune.code}`);
    return { ...commune, niveau: 'commune', inscrits: last[0]!, ...unitOf(first) };
  });
  for (const [code, area] of Object.entries(firstRound.horsCarte)) {
    const last = lastRound.horsCarte[code];
    if (!last) throw new Error(`Territoire hors carte absent du dernier tour : ${code}`);
    units.push({
      code,
      niveau: 'hors-carte',
      departement: null,
      region: null,
      inscrits: last.valeurs[0]!,
      ...unitOf(area.valeurs),
    });
  }
  return finalize(
    'reel',
    `Géographie de ${firstRound.election} (1er tour) et inscrits du ${lastRound.tour}e tour, répartis selon le jeu de règles`,
    units,
  );
}

/** Pseudo-aléa déterministe dans [−1, 1] à partir d'un texte (démonstration uniquement). */
function wobble(text: string): number {
  return (parseInt(sha256Hex(text).slice(0, 8), 16) / 0xffffffff) * 2 - 1;
}

/**
 * Base de démonstration, FICTIVE : sans résultats officiels importés. Les affinités et la
 * participation sont tirées au hasard (déterministe) : une composante par région, une par
 * département et, pour les communes du jeu de démonstration, une par commune — la carte montre
 * ainsi des territoires contrastés, sans aucune ressemblance voulue avec la géographie
 * électorale réelle. Les départements sans communes forment une unité chacun ; les inscrits sont
 * répartis au prorata de la population pour totaliser ceux du jeu de règles.
 */
/** Amplitudes des composantes fictives des affinités (région, département, commune). */
const DEMO_REGION = 0.45;
const DEMO_DEPARTEMENT = 0.3;
const DEMO_COMMUNE = 0.3;
const DEMO_MIN_AFFINITY = 0.2;

export function demoBaseline(
  ruleset: Ruleset,
  communes: readonly (CommuneRef & { population: number })[],
  otherDepartements: readonly { code: string; region: string; population: number }[],
): TerritorialBaseline {
  const g = ruleset.electorat.groupes.length;
  const entries = [
    ...communes.map((c) => ({ ...c, niveau: 'commune' as const })),
    ...otherDepartements.map((d) => ({
      code: d.code,
      departement: d.code,
      region: d.region,
      population: d.population,
      niveau: 'departement' as const,
    })),
  ];
  const inscrits = largestRemainder(
    ruleset.electorat.inscrits.valeur,
    entries.map((e) => Math.max(e.population, 1)),
  );
  return finalize(
    'fictif',
    'Démonstration : géographie électorale fictive (aucun résultat officiel importé)',
    entries.map((entry, i) => ({
      code: entry.code,
      niveau: entry.niveau,
      departement: entry.departement,
      region: entry.region,
      inscrits: inscrits[i]!,
      affinite: Array.from({ length: g }, (_, k) =>
        round6(
          Math.max(
            DEMO_MIN_AFFINITY,
            1 +
              DEMO_REGION * wobble(`region:${entry.region}:${k}`) +
              DEMO_DEPARTEMENT * wobble(`departement:${entry.departement}:${k}`) +
              (entry.niveau === 'commune' ? DEMO_COMMUNE * wobble(`${entry.code}:${k}`) : 0),
          ),
        ),
      ),
      participation: round6(
        1 +
          0.05 * wobble(`departement:${entry.departement}:p`) +
          (entry.niveau === 'commune' ? 0.06 * wobble(`${entry.code}:p`) : 0),
      ),
    })),
  );
}

/** Géométries d'un fichier TopoJSON du référentiel (propriétés utiles à la base électorale). */
type DemoTopology = {
  objects: Record<
    string,
    {
      geometries: {
        properties: { code: string; dep: string; reg: string; population: number | null };
      }[];
    }
  >;
};

/**
 * Base de démonstration à partir du manifeste et des fichiers TopoJSON déjà lus (communes des
 * départements cartographiés, une unité pour les autres) ; partagée par l'API et le serveur
 * local de l'application mobile.
 */
export function demoBaselineFromTopologies(
  ruleset: Ruleset,
  departements: readonly {
    code: string;
    region: string;
    population: number;
    fichier: string | null;
  }[],
  topologyOf: (fichier: string) => unknown,
): TerritorialBaseline {
  const communes = departements.flatMap((d) => {
    if (!d.fichier) return [];
    const topology = topologyOf(d.fichier) as DemoTopology;
    return Object.values(topology.objects)[0]!.geometries.map(({ properties: p }) => ({
      code: p.code,
      departement: p.dep,
      region: p.reg,
      population: p.population ?? 0,
    }));
  });
  const others = departements
    .filter((d) => !d.fichier)
    .map((d) => ({ code: d.code, region: d.region, population: d.population }));
  return demoBaseline(ruleset, communes, others);
}
