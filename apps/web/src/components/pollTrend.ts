// Géométrie du graphique d'évolution des sondages (phase 22) : fonctions pures, sans DOM. Les
// valeurs sont celles des sondages servis par l'API (centièmes de point : 2481 = 24,81 %) ; rien
// n'est interpolé : une vague où un candidat ne figure pas interrompt sa ligne.

export type TrendSeries = {
  id: string;
  label: string;
  color: string;
  player: boolean;
  /** Une valeur par vague (ordre chronologique), null si le candidat n'y figure pas. */
  values: readonly (number | null)[];
};

export type TrendBox = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

export type TrendLabel = { id: string; y: number; anchorY: number };

export type TrendLayout = {
  yMax: number;
  ticks: number[];
  xAt: (wave: number) => number;
  yAt: (value: number) => number;
  paths: { id: string; d: string }[];
  /** Étiquettes directes (au plus quatre), écartées ; `anchorY` : bout de la ligne. */
  labels: TrendLabel[];
};

/** Écart vertical minimal entre deux étiquettes de fin de ligne, en pixels. */
export const LABEL_GAP = 14;
const MAX_LABELS = 4;

const lastValue = (series: TrendSeries) =>
  [...series.values].reverse().find((v) => v !== null) ?? null;

/**
 * Séries étiquetées directement : le joueur d'abord, puis les mieux placées à la dernière vague,
 * quatre au plus (la légende et l'infobulle portent les autres).
 */
export function labelledIds(series: readonly TrendSeries[]): string[] {
  const ranked = series
    .filter((s) => lastValue(s) !== null)
    .sort((a, b) => lastValue(b)! - lastValue(a)!);
  const player = ranked.filter((s) => s.player);
  const others = ranked.filter((s) => !s.player);
  return [...player, ...others].slice(0, MAX_LABELS).map((s) => s.id);
}

/** Écarte des positions triées d'au moins `gap`, dans [min, max] (vers le bas, puis le haut). */
function spread(positions: number[], gap: number, min: number, max: number): number[] {
  const out = [...positions];
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(out[i]!, min, i > 0 ? out[i - 1]! + gap : min);
  }
  for (let i = out.length - 1; i >= 0; i--) {
    out[i] = Math.min(out[i]!, i < out.length - 1 ? out[i + 1]! - gap : max);
  }
  return out;
}

export function layoutTrend(series: readonly TrendSeries[], box: TrendBox): TrendLayout {
  const { width, height, padding } = box;
  const waves = Math.max(1, ...series.map((s) => s.values.length));
  const max = Math.max(0, ...series.flatMap((s) => s.values.filter((v) => v !== null)));
  const yMax = Math.max(500, Math.ceil(max / 500) * 500);
  const step = yMax <= 3000 ? 500 : 1000;
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);

  const left = padding.left;
  const right = width - padding.right;
  const top = padding.top;
  const bottom = height - padding.bottom;
  const xAt = (wave: number) =>
    waves === 1 ? (left + right) / 2 : left + (wave * (right - left)) / (waves - 1);
  const yAt = (value: number) => bottom - (value / yMax) * (bottom - top);

  const paths = series.map((s) => {
    let d = '';
    let drawing = false;
    s.values.forEach((value, wave) => {
      if (value === null) {
        drawing = false;
        return;
      }
      d += `${drawing ? 'L' : 'M'}${xAt(wave).toFixed(1)},${yAt(value).toFixed(1)}`;
      drawing = true;
    });
    return { id: s.id, d };
  });

  const shown = labelledIds(series);
  const anchors = series
    .filter((s) => shown.includes(s.id))
    .map((s) => ({ id: s.id, anchorY: yAt(lastValue(s)!) }))
    .sort((a, b) => a.anchorY - b.anchorY);
  const spreadY = spread(
    anchors.map((a) => a.anchorY),
    LABEL_GAP,
    top,
    bottom,
  );
  const labels = anchors.map((a, i) => ({ id: a.id, y: spreadY[i]!, anchorY: a.anchorY }));

  return { yMax, ticks, xAt, yAt, paths, labels };
}
