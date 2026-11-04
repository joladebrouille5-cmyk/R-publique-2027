import {
  candidateName,
  IMPLANTATION_TIERS,
  implantationTier,
  type GameState,
  type Ruleset,
} from '@r2027/shared';

// Lectures du plateau (phase 25) : couleur, libellé écrit et légende de chaque département.
// Implantation : l'état de la partie ; « Qui mène » et « Sondage local » : la projection simulée
// du moteur (`opinion.departements`), jamais un sondage réel.

export type Reading = 'implantation' | 'qui-mene' | 'sondage-local';

export const READINGS: { id: Reading; label: string }[] = [
  { id: 'implantation', label: 'Implantation' },
  { id: 'qui-mene', label: 'Qui mène' },
  { id: 'sondage-local', label: 'Sondage local' },
];

export const PROJECTION_PENDING =
  'Projection disponible après une semaine de campagne, avec la géographie électorale.';

/** Bornes du score local projeté (en %), sur les cinq teintes de l'implantation. */
const LOCAL_BREAKS = [5, 10, 20, 30] as const;

const percent = (centiemes: number) =>
  `${(centiemes / 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

const tierIndex = (value: number) =>
  IMPLANTATION_TIERS.findIndex((t) => t.id === implantationTier(value).id);

/**
 * Classes de remplissage et de pastille de légende : écrites en toutes lettres pour que
 * Tailwind les génère (et émette les variables de couleur qu'elles emploient).
 */
const STEP_FILL = [
  'fill-implantation-0',
  'fill-implantation-1',
  'fill-implantation-2',
  'fill-implantation-3',
  'fill-implantation-4',
] as const;
const STEP_BG = [
  'bg-implantation-0',
  'bg-implantation-1',
  'bg-implantation-2',
  'bg-implantation-3',
  'bg-implantation-4',
] as const;

export type Paint = { fill: string; text: string; fillClass: string };

export function hasProjection(state: GameState): boolean {
  return Object.keys(state.opinion?.departements ?? {}).length > 0;
}

/** Couleur et description écrite d'un département pour une lecture. */
export function paintDepartment(
  state: GameState,
  ruleset: Ruleset,
  reading: Reading,
  code: string,
): Paint {
  const playerId = state.player.actorId;
  if (reading === 'implantation') {
    const value = playerId ? (state.implantation[playerId]?.[code] ?? 0) : 0;
    const tier = implantationTier(value);
    return {
      fill: `var(--color-implantation-${tierIndex(value)})`,
      fillClass: STEP_FILL[tierIndex(value)]!,
      text: `${tier.libelle}, implantation ${value} sur 100`,
    };
  }
  const local = state.opinion?.departements[code];
  if (!local || Object.keys(local).length === 0)
    return {
      fill: 'var(--color-carton-2)',
      fillClass: 'fill-carton-2',
      text: 'projection indisponible',
    };
  if (reading === 'qui-mene') {
    const [leader, share] = Object.entries(local).sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0]!;
    const mine = leader === playerId;
    const name = state.actors[leader] ? candidateName(state.actors[leader].candidate) : leader;
    return {
      fill: mine ? 'var(--color-or)' : 'var(--color-famille-organisation)',
      fillClass: mine ? 'fill-or' : 'fill-famille-organisation',
      text: `${mine ? 'vous menez' : `${name} mène`}, ${percent(share)} (projection simulée)`,
    };
  }
  const share = playerId ? (local[playerId] ?? 0) : 0;
  const step = LOCAL_BREAKS.filter((b) => share / 100 >= b).length;
  return {
    fill: `var(--color-implantation-${step})`,
    fillClass: STEP_FILL[step]!,
    text: `vous ${percent(share)} (projection simulée)`,
  };
}

export type LegendItem = { fill: string; label: string; swatch: string };

/** Légende chiffrée de la lecture. */
export function legendOf(reading: Reading): LegendItem[] {
  if (reading === 'implantation')
    return IMPLANTATION_TIERS.map((tier, i) => ({
      fill: `var(--color-implantation-${i})`,
      swatch: STEP_BG[i]!,
      label: `${tier.libelle} (${tier.min} à ${IMPLANTATION_TIERS[i + 1] ? IMPLANTATION_TIERS[i + 1]!.min - 1 : 100})`,
    }));
  if (reading === 'qui-mene')
    return [
      { fill: 'var(--color-or)', swatch: 'bg-or', label: 'Vous menez' },
      {
        fill: 'var(--color-famille-organisation)',
        swatch: 'bg-famille-organisation',
        label: 'Un adversaire mène',
      },
      { fill: 'var(--color-carton-2)', swatch: 'bg-carton-2', label: 'Projection indisponible' },
    ];
  return [0, 1, 2, 3, 4].map((i) => ({
    fill: `var(--color-implantation-${i})`,
    swatch: STEP_BG[i]!,
    label:
      i === 0
        ? `moins de ${LOCAL_BREAKS[0]} %`
        : i === 4
          ? `${LOCAL_BREAKS[3]} % et plus`
          : `${LOCAL_BREAKS[i - 1]} à ${LOCAL_BREAKS[i]} %`,
  }));
}

/** Nom d'un département du jeu de règles, avec son code : « Finistère (29) ». */
export function departmentName(ruleset: Ruleset, code: string): string {
  const dep = ruleset.parrainages.reservoir.departements[code];
  return dep ? `${dep.nom} (${code})` : code;
}

export { percent };
