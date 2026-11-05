import {
  candidateName,
  IMPLANTATION_TIERS,
  implantationTier,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { leaderColors, localPoll, OTHER_LEADERS_COLOR, rankingText } from './localPoll';

// Lectures du plateau (phase 25) : couleur, libellé écrit et légende de chaque département.
// Implantation : l'état de la partie ; « Qui mène » et « Sondage local » : la projection simulée
// du moteur (`opinion.departements`), jamais un sondage réel. Phase 25 bis : une couleur par
// candidat en tête, légende qui les nomme, classement local écrit dans le nom de chaque
// département.

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

export type Paint = {
  /** Couleur (variable CSS ou valeur), recopiée dans `data-fill`. */
  fill: string;
  text: string;
  /** Classe de remplissage générée ; vide quand la couleur est posée en style. */
  fillClass: string;
};

export function hasProjection(state: GameState): boolean {
  return Object.keys(state.opinion?.departements ?? {}).length > 0;
}

const plural = (n: number) => `${n} département${n > 1 ? 's' : ''}`;

/** Couleur et description écrite d'un département pour une lecture. */
export function paintDepartment(
  state: GameState,
  ruleset: Ruleset,
  reading: Reading,
  code: string,
  colors: ReadonlyMap<string, string> = new Map(),
): Paint {
  const playerId = state.player.actorId;
  const poll = localPoll(state, code);
  // Phase 25 bis : le classement local complète le libellé (lecteurs d'écran, sans couleur).
  const ranking = poll
    ? ` ; ${reading === 'implantation' ? 'intentions (projection simulée)' : 'intentions'} : ${rankingText(poll)}`
    : '';
  if (reading === 'implantation') {
    const value = playerId ? (state.implantation[playerId]?.[code] ?? 0) : 0;
    const tier = implantationTier(value);
    return {
      fill: `var(--color-implantation-${tierIndex(value)})`,
      fillClass: STEP_FILL[tierIndex(value)]!,
      text: `${tier.libelle}, implantation ${value} sur 100${ranking}`,
    };
  }
  if (!poll)
    return {
      fill: 'var(--color-carton-2)',
      fillClass: 'fill-carton-2',
      text: 'projection indisponible',
    };
  if (reading === 'qui-mene') {
    const { leader } = poll;
    const mine = leader.actorId === playerId;
    const name = state.actors[leader.actorId]
      ? candidateName(state.actors[leader.actorId]!.candidate)
      : leader.actorId;
    const color = colors.get(leader.actorId) ?? OTHER_LEADERS_COLOR;
    return {
      fill: mine ? 'var(--color-or)' : color,
      fillClass: mine ? 'fill-or' : '',
      text: `${mine ? 'vous menez' : `${name} mène`}${poll.tie ? ' (ex aequo)' : ''}, ${percent(leader.share)} (projection simulée)${ranking}`,
    };
  }
  const share = poll.player?.share ?? 0;
  const step = LOCAL_BREAKS.filter((b) => share / 100 >= b).length;
  return {
    fill: `var(--color-implantation-${step})`,
    fillClass: STEP_FILL[step]!,
    text: `vous ${percent(share)} (projection simulée)${ranking}`,
  };
}

/** Toutes les couleurs d'une lecture, calculées une fois (le survol ne recalcule rien). */
export function paintBoard(
  state: GameState,
  ruleset: Ruleset,
  reading: Reading,
  codes: readonly string[],
): Map<string, Paint> {
  const { colors } = leaderColors(state);
  return new Map(
    codes.map((code) => [code, paintDepartment(state, ruleset, reading, code, colors)]),
  );
}

export type LegendItem = {
  fill: string;
  label: string;
  /** Classe de la pastille ; vide quand la couleur est posée en style. */
  swatch: string;
};

/**
 * Légende chiffrée de la lecture. « Qui mène » (phase 25 bis) : chaque candidat en tête sur la
 * carte, nommé, avec le nombre de départements qu'il mène.
 */
export function legendOf(
  reading: Reading,
  state?: GameState,
  codes: readonly string[] = [],
): LegendItem[] {
  if (reading === 'implantation')
    return IMPLANTATION_TIERS.map((tier, i) => ({
      fill: `var(--color-implantation-${i})`,
      swatch: STEP_BG[i]!,
      label: `${tier.libelle} (${tier.min} à ${IMPLANTATION_TIERS[i + 1] ? IMPLANTATION_TIERS[i + 1]!.min - 1 : 100})`,
    }));
  if (reading === 'qui-mene') {
    if (!state)
      return [
        { fill: 'var(--color-carton-2)', swatch: 'bg-carton-2', label: 'Projection indisponible' },
      ];
    const playerId = state.player.actorId;
    const { colors, others } = leaderColors(state);
    const led = new Map<string, number>();
    let missing = 0;
    for (const code of codes) {
      const poll = localPoll(state, code);
      if (!poll) missing++;
      else led.set(poll.leader.actorId, (led.get(poll.leader.actorId) ?? 0) + 1);
    }
    const nameOf = (id: string) =>
      state.actors[id] ? candidateName(state.actors[id]!.candidate) : id;
    const items: LegendItem[] = [];
    if (playerId && led.get(playerId))
      items.push({
        fill: 'var(--color-or)',
        swatch: 'bg-or',
        label: `Vous menez (${plural(led.get(playerId)!)})`,
      });
    for (const [id, color] of colors)
      items.push({ fill: color, swatch: '', label: `${nameOf(id)} (${plural(led.get(id) ?? 0)})` });
    if (others.length > 0)
      items.push({
        fill: OTHER_LEADERS_COLOR,
        swatch: '',
        label: `Autres en tête : ${others.map(nameOf).join(', ')} (${plural(others.reduce((n, id) => n + (led.get(id) ?? 0), 0))})`,
      });
    if (missing > 0)
      items.push({
        fill: 'var(--color-carton-2)',
        swatch: 'bg-carton-2',
        label: `Projection indisponible (${plural(missing)})`,
      });
    return items;
  }
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
