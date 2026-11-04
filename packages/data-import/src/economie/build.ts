// Indicateurs économiques de départ (`packages/rulesets/src/economie-2026.json`) à partir des
// séries chronologiques de l'Insee : dernière valeur publiée, ou valeur déduite par une règle
// explicite (croissance sur un an, déficit sur quatre trimestres). Une série absente, vide ou
// incohérente fait échouer l'import plutôt que de compléter une valeur.
import { RealEconomySchema, type RealEconomy } from '@r2027/shared';
import { ImportError } from '../geometry/coverage';

export type Observation = { annee: number; periode: string; valeur: number };
export type InseeSeries = {
  idbank: string;
  titre: string;
  frequence: string;
  derniereMiseAJour: string;
  /** Observations, de la plus récente à la plus ancienne. */
  observations: Observation[];
};

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « (r) 1 234,5 » → 1234.5 (révisée ou non) ; espaces fines et insécables ignorées. */
export function parseInseeNumber(text: string): number {
  const cleaned = text
    .replace(/\(r\)|\(p\)|\(e\)/g, '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.');
  const value = Number(cleaned);
  if (cleaned === '' || !Number.isFinite(value))
    throw new ImportError(`Valeur illisible : « ${text} »`);
  return value;
}

/**
 * Réponse JSON de la page d'une série sur www.insee.fr : métadonnées (`series[0]`) et tableau
 * HTML des observations (année, période, valeur).
 */
export function parseInseeSeries(json: string): InseeSeries {
  const data = JSON.parse(json) as {
    series?: { idbank: string; titreFR: string; frequence: string; lastUpdate: string }[];
    html?: string;
  };
  const meta = data.series?.[0];
  if (!meta || !data.html) throw new ImportError('Réponse de série Insee incomplète.');
  const rows = [
    ...data.html.matchAll(
      /<tr>\s*<td>(\d{4})<\/td>\s*<td>(?:<span data-i18n="series\.mois\.(\d{2})">[^<]*<\/span>|([^<]*))<\/td>\s*<td class="nombre">([^<]*)<\/td>/g,
    ),
  ];
  const observations = rows.map((m) => ({
    annee: Number(m[1]),
    periode: m[2] ? MONTHS[Number(m[2]) - 1]! : m[3]!.trim(),
    valeur: parseInseeNumber(m[4]!),
  }));
  if (observations.length === 0) throw new ImportError(`Série ${meta.idbank} sans observation.`);
  return {
    idbank: meta.idbank,
    titre: meta.titreFR,
    frequence: meta.frequence,
    derniereMiseAJour: meta.lastUpdate,
    observations,
  };
}

/** Rôle de chaque série dans le jeu (identifiant de source → idbank attendu). */
export const SERIES = {
  'insee-pib-evolution': '011794844',
  'insee-ipc-glissement': '011814632',
  'insee-chomage-bit': '001688527',
  'insee-dette-maastricht': '010777608',
  'insee-solde-apu': '011794759',
  'insee-pib-valeur': '011794859',
  'insee-confiance-menages': '001587668',
} as const;
export type SeriesRole = keyof typeof SERIES;

const label = (o: Observation) => `${o.periode} ${o.annee}`;
const centiemes = (value: number) => Math.round(value * 100) + 0;

function latest(series: InseeSeries, count: number): Observation[] {
  if (series.observations.length < count)
    throw new ImportError(`Série ${series.idbank} : ${count} observations attendues.`);
  return series.observations.slice(0, count);
}

export type EconomyInputs = {
  verifieLe: string;
  series: Readonly<Record<SeriesRole, InseeSeries>>;
  sources: RealEconomy['sources'];
};

export function buildEconomy(input: EconomyInputs): RealEconomy {
  for (const [role, idbank] of Object.entries(SERIES))
    if (input.series[role as SeriesRole].idbank !== idbank)
      throw new ImportError(`Série ${role} : idbank ${idbank} attendu.`);
  const s = input.series;

  const growth = latest(s['insee-pib-evolution'], 4);
  const yearly = growth.reduce((product, o) => product * (1 + o.valeur / 100), 1) - 1;
  const balance = latest(s['insee-solde-apu'], 4);
  const gdp = latest(s['insee-pib-valeur'], 4);
  if (balance.some((o, i) => label(o) !== label(gdp[i]!)))
    throw new ImportError('Solde des administrations et PIB : trimestres différents.');
  const sum = (list: Observation[]) => list.reduce((total, o) => total + o.valeur, 0);
  const window = `4 trimestres jusqu’au ${label(gdp[0]!)}`;
  const last = (role: SeriesRole) => latest(s[role], 1)[0]!;

  return RealEconomySchema.parse({
    verifieLe: input.verifieLe,
    sources: input.sources,
    indicateurs: {
      croissance: {
        valeur: centiemes(yearly * 100),
        periode: `4 trimestres jusqu’au ${label(growth[0]!)}`,
        statut: 'deduit',
        sourceIds: ['insee-pib-evolution'],
        regle:
          'Évolution du PIB en volume sur un an : produit des quatre dernières évolutions trimestrielles publiées (séries CVS-CJO).',
      },
      inflation: {
        valeur: centiemes(last('insee-ipc-glissement').valeur),
        periode: label(last('insee-ipc-glissement')),
        statut: 'estimation',
        sourceIds: ['insee-ipc-glissement'],
        regle: 'Glissement annuel de l’indice des prix à la consommation, dernier mois publié.',
      },
      chomage: {
        valeur: centiemes(last('insee-chomage-bit').valeur),
        periode: label(last('insee-chomage-bit')),
        statut: 'estimation',
        sourceIds: ['insee-chomage-bit'],
        regle: 'Taux de chômage au sens du BIT, dernier trimestre publié.',
      },
      deficit: {
        valeur: centiemes((sum(balance) / sum(gdp)) * 100),
        periode: window,
        statut: 'deduit',
        sourceIds: ['insee-solde-apu', 'insee-pib-valeur'],
        regle:
          'Capacité (+) ou besoin (−) de financement des administrations publiques sur quatre trimestres, rapporté au PIB en valeur des mêmes trimestres (séries CVS-CJO).',
      },
      dette: {
        valeur: centiemes(last('insee-dette-maastricht').valeur),
        periode: label(last('insee-dette-maastricht')),
        statut: 'estimation',
        sourceIds: ['insee-dette-maastricht'],
        regle:
          'Dette des administrations publiques au sens de Maastricht, en points de PIB, dernier trimestre publié.',
      },
      confiance: {
        valeur: centiemes(last('insee-confiance-menages').valeur),
        periode: label(last('insee-confiance-menages')),
        statut: 'estimation',
        sourceIds: ['insee-confiance-menages'],
        regle:
          'Indicateur synthétique de confiance des ménages (moyenne de longue période : 100), dernier mois publié.',
      },
    },
    pibAnnuelMillions: {
      valeur: Math.round(sum(gdp)),
      periode: window,
      statut: 'deduit',
      sourceIds: ['insee-pib-valeur'],
      regle: 'Somme des quatre derniers trimestres du PIB en valeur, en millions d’euros.',
    },
  });
}
