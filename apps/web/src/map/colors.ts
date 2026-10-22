import type { ResultCandidate, TerritoryResult } from './data';

// Couleurs de la carte (palette de référence validée : 3 teintes catégorielles au plus sur une
// carte, le reste en « Autre » ; dégradé séquentiel à une teinte pour les scores). Chaque couleur
// est doublée d'un texte (légende, fiche, tableau) : jamais la couleur seule.

const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a'],
  dark: ['#3987e5', '#d95926', '#199e70'],
};
const OTHER = { light: '#94a3b8', dark: '#64748b' };
const NO_DATA = { light: '#e9edf6', dark: '#212a46' };
const SEQUENTIAL = {
  light: ['#cde2fb', '#86b6ef', '#3987e5', '#256abf', '#104281'],
  dark: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'],
};
export const SCORE_BREAKS = [10, 20, 30, 40] as const;
export const TURNOUT_BREAKS = [60, 70, 75, 80] as const;

export type Mode = 'light' | 'dark';
export type Coloring =
  | { kind: 'vainqueur' }
  | { kind: 'score'; candidate: number }
  | { kind: 'participation' }
  | { kind: 'ecart'; a: number; b: number };

/** Comparaison de deux candidats : palette divergente bleu ↔ rouge, milieu gris neutre. */
const DIVERGING = {
  light: {
    a: ['#9ec5f4', '#3987e5', '#1c5cab'],
    b: ['#f5b3b2', '#e34948', '#a32b2a'],
    mid: '#f0efec',
  },
  dark: {
    a: ['#1c5cab', '#3987e5', '#9ec5f4'],
    b: ['#a32b2a', '#e66767', '#f5b3b2'],
    mid: '#383835',
  },
};
/** Seuils de l'écart, en points de pourcentage des exprimés. */
export const GAP_BREAKS = [2, 10, 20] as const;

/**
 * Motif superposé à la couleur (option « Motifs ») : l'identité d'un candidat ou d'un camp ne
 * repose plus sur la teinte seule (daltonisme, impression en niveaux de gris).
 */
export type Motif = 'aucun' | 'hachures' | 'hachures-inverses' | 'croisillons';
export const MOTIFS = ['hachures', 'hachures-inverses', 'croisillons'] as const;
/** Motifs des trois couleurs catégorielles, dans le même ordre ; « Autre » : croisillons. */
const CATEGORICAL_MOTIFS: Motif[] = ['aucun', 'hachures', 'hachures-inverses'];
/** Encre des motifs (RVBA), lisible sur toutes les couleurs du mode. */
const MOTIF_INK = {
  light: [15, 23, 42, 150],
  dark: [248, 250, 252, 160],
} as const;

export type LegendEntry = { color: string; label: string; motif: Motif };

/**
 * Couleurs attribuées aux candidats : les trois premiers au niveau national du tour (la couleur
 * suit le candidat, pas son rang local), les autres « Autre ».
 */
export function winnerPalette(
  candidats: readonly ResultCandidate[],
  national: TerritoryResult | null,
  mode: Mode,
) {
  const order = candidats
    .map((c, index) => ({ c, index, voix: national?.voix[index] ?? 0 }))
    .sort((a, b) => b.voix - a.voix || a.index - b.index);
  const slots = new Map<number, number>();
  order.slice(0, 3).forEach((entry, slot) => slots.set(entry.index, slot));
  const slotOf = (index: number) => slots.get(index);
  return {
    colorOf: (index: number) => CATEGORICAL[mode][slotOf(index) ?? -1] ?? OTHER[mode],
    motifOf: (index: number): Motif => CATEGORICAL_MOTIFS[slotOf(index) ?? -1] ?? 'croisillons',
    legend: [
      ...order.slice(0, 3).map((entry, slot) => ({
        color: CATEGORICAL[mode][slot]!,
        label: `${entry.c.label}${entry.c.player ? ' (vous)' : ''}`,
        motif: CATEGORICAL_MOTIFS[slot]!,
      })),
      ...(order.length > 3
        ? [{ color: OTHER[mode], label: 'Autre candidat en tête', motif: 'croisillons' as const }]
        : []),
    ],
  };
}

const binOf = (value: number, breaks: readonly number[]) => breaks.filter((b) => value >= b).length;

function binsLegend(breaks: readonly number[], mode: Mode, unit: string): LegendEntry[] {
  const steps = SEQUENTIAL[mode];
  return steps.map((color, i) => ({
    color,
    motif: 'aucun',
    label:
      i === 0
        ? `moins de ${breaks[0]} ${unit}`
        : i === steps.length - 1
          ? `${breaks[i - 1]} ${unit} et plus`
          : `${breaks[i - 1]} à ${breaks[i]} ${unit}`,
  }));
}

/** Fonction de couleur d'un territoire et légende textuelle pour un mode de coloration. */
export function colorScheme(
  coloring: Coloring,
  candidats: readonly ResultCandidate[],
  national: TerritoryResult | null,
  mode: Mode,
): {
  colorOf: (result: TerritoryResult | undefined) => string;
  /** Motif du territoire ; les dégradés se lisent par leur clarté et n'en ont pas. */
  motifOf: (result: TerritoryResult | undefined) => Motif;
  legend: LegendEntry[];
  noData: string;
} {
  const noData = NO_DATA[mode];
  const none = (): Motif => 'aucun';
  if (coloring.kind === 'vainqueur') {
    const palette = winnerPalette(candidats, national, mode);
    return {
      noData,
      legend: palette.legend,
      colorOf: (result) => {
        const leader = leaderOf(result);
        return leader === null ? noData : palette.colorOf(leader);
      },
      motifOf: (result) => {
        const leader = leaderOf(result);
        return leader === null ? 'aucun' : palette.motifOf(leader);
      },
    };
  }
  if (coloring.kind === 'score') {
    return {
      noData,
      motifOf: none,
      legend: binsLegend(SCORE_BREAKS, mode, '%'),
      colorOf: (result) =>
        !result || result.exprimes === 0
          ? noData
          : SEQUENTIAL[mode][
              binOf((100 * result.voix[coloring.candidate]!) / result.exprimes, SCORE_BREAKS)
            ]!,
    };
  }
  if (coloring.kind === 'ecart') {
    const palette = DIVERGING[mode];
    const name = (i: number) => candidats[i]?.label ?? '?';
    const [low, mid, high] = GAP_BREAKS;
    // Le camp du second candidat est hachuré : les deux camps se distinguent sans la teinte.
    const sideMotif = { a: 'aucun', b: 'hachures' } as const;
    const arm = (side: 'a' | 'b', who: string) =>
      [
        { color: palette[side][2]!, label: `${who} devant de ${high} pts et plus` },
        { color: palette[side][1]!, label: `${who} devant de ${mid} à ${high} pts` },
        { color: palette[side][0]!, label: `${who} devant de ${low} à ${mid} pts` },
      ].map((entry) => ({ ...entry, motif: sideMotif[side] }));
    /** Camp en tête et palier de l'écart (0 : moins de `low` points). */
    const gapOf = (result: TerritoryResult) => {
      const gap = (100 * (result.voix[coloring.a]! - result.voix[coloring.b]!)) / result.exprimes;
      return {
        side: gap > 0 ? ('a' as const) : ('b' as const),
        step: binOf(Math.abs(gap), GAP_BREAKS),
      };
    };
    return {
      noData,
      legend: [
        ...arm('a', name(coloring.a)),
        { color: palette.mid, label: `Écart de moins de ${low} pts`, motif: 'aucun' },
        ...arm('b', name(coloring.b)).reverse(),
      ],
      colorOf: (result) => {
        if (!result || result.exprimes === 0) return noData;
        const { side, step } = gapOf(result);
        return step === 0 ? palette.mid : palette[side][step - 1]!;
      },
      motifOf: (result) => {
        if (!result || result.exprimes === 0) return 'aucun';
        const { side, step } = gapOf(result);
        return step === 0 ? 'aucun' : sideMotif[side];
      },
    };
  }
  return {
    noData,
    motifOf: none,
    legend: binsLegend(TURNOUT_BREAKS, mode, '%'),
    colorOf: (result) =>
      !result || result.inscrits === 0
        ? noData
        : SEQUENTIAL[mode][binOf((100 * result.votants) / result.inscrits, TURNOUT_BREAKS)]!,
  };
}

/** Candidat en tête (indice) d'un résultat, ou null. */
export function leaderOf(result: TerritoryResult | undefined): number | null {
  if (!result || result.exprimes === 0) return null;
  let best = 0;
  result.voix.forEach((v, i) => {
    if (v > result.voix[best]!) best = i;
  });
  return best;
}

/**
 * Tuile RVBA d'un motif pour `map.addImage` (densité de pixels 2) : traits « / » (hachures),
 * « \ » (hachures inversées) ou les deux, raccordés d'une tuile à l'autre.
 */
export function motifImage(
  motif: (typeof MOTIFS)[number],
  mode: Mode,
  size = 24,
): { width: number; height: number; data: Uint8Array } {
  const period = size / 2;
  const ink = MOTIF_INK[mode];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const slash = (x + y) % period < 2;
      const backslash = (x - y + size) % period < 2;
      const on =
        motif === 'hachures'
          ? slash
          : motif === 'hachures-inverses'
            ? backslash
            : slash || backslash;
      if (on) data.set(ink, (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

/** Même motif en CSS, pour les pastilles de la légende. */
export function motifBackground(motif: Motif, mode: Mode): string | undefined {
  if (motif === 'aucun') return undefined;
  const [r, g, b, a] = MOTIF_INK[mode];
  const ink = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
  // 135deg : bandes « / » ; 45deg : bandes « \ ».
  const stripes = (angle: number) =>
    `repeating-linear-gradient(${angle}deg, ${ink} 0 1px, transparent 1px 4px)`;
  if (motif === 'hachures') return stripes(135);
  if (motif === 'hachures-inverses') return stripes(45);
  return `${stripes(135)}, ${stripes(45)}`;
}

/** Mer et fond de carte : bleu brumeux en clair, bleu nuit en sombre (palette de la phase 9). */
export const MAP_SURFACE = { light: '#d3dcef', dark: '#070d22' };
export const BORDER = { light: '#ffffff', dark: '#0b1229' };
export const SELECTED = { light: '#0b1229', dark: '#f4f6fb' };

/** Mélange de deux couleurs « #rrggbb » : `t` = 1 donne `a`, 0 donne `b`. */
export function mixColors(a: string, b: string, t: number): string {
  const channel = (hex: string, shift: number) => (parseInt(hex.slice(1), 16) >> shift) & 255;
  const blend = (shift: number) => Math.round(channel(a, shift) * t + channel(b, shift) * (1 - t));
  const rgb = (blend(16) << 16) | (blend(8) << 8) | blend(0);
  return `#${rgb.toString(16).padStart(6, '0')}`;
}
