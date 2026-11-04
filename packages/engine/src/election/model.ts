import type { ElectorateGroup, Position, Ruleset, UtilityFactor } from '@r2027/shared';

export type Contender = {
  id: string;
  position: Position;
  /** Centièmes de point (0 à 10 000). */
  notoriete: number;
  popularite: number;
  /** Variation de popularité sur trois semaines, en centièmes de point. */
  dynamique: number;
};

type Model = Ruleset['modele'];

/** Distance idéologique, en centaines de points (0 = même position). */
export function distance(a: Position, b: Position): number {
  return Math.hypot(a.economie - b.economie, a.societe - b.societe) / 100;
}

/**
 * Facteurs du score latent d'un candidat auprès d'un groupe d'électeurs (§5.1) :
 * proximité idéologique, notoriété, popularité, dynamique et part d'incertitude.
 * Le score est la somme exacte de ces facteurs.
 */
export function utilityFactors(
  group: ElectorateGroup,
  contender: Contender,
  model: Model,
  alea: number,
  extra: UtilityFactor[] = [],
): UtilityFactor[] {
  return [
    {
      label: 'Proximité idéologique',
      // Phase 24 : la pénalité sature au-delà de `saturationProximite` (3 : aucune saturation).
      value:
        -model.proximite *
        Math.min(distance(group.position, contender.position), model.saturationProximite),
    },
    {
      label: 'Notoriété',
      value: model.notoriete * Math.log(Math.max(contender.notoriete, 100) / 2500),
    },
    { label: 'Popularité', value: model.popularite * (contender.popularite / 10_000 - 0.3) },
    { label: 'Dynamique de campagne', value: model.dynamique * (contender.dynamique / 10_000) },
    { label: 'Incertitude', value: alea },
    ...extra,
  ];
}

export const sumFactors = (factors: readonly UtilityFactor[]) =>
  factors.reduce((total, factor) => total + factor.value, 0);

/** Probabilités de choix (softmax) : chacune dans [0, 1], somme égale à 1. */
export function softmax(scores: readonly number[]): number[] {
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const total = exps.reduce((acc, v) => acc + v, 0);
  return exps.map((v) => v / total);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Participation d'un groupe : plus forte quand un candidat lui est proche (§5.1). */
export function turnout(
  group: ElectorateGroup,
  contenders: readonly Contender[],
  model: Model,
  differential = 0,
): number {
  const nearest = Math.min(...contenders.map((c) => distance(group.position, c.position)));
  const { effetProximite, min, max } = model.participation;
  const base = group.participation * (1 + effetProximite * (1 - Math.min(nearest, 1)));
  // Second tour : abstention différentielle des électeurs éloignés des deux finalistes.
  const penalty = differential * clamp(nearest - 0.6, 0, 1);
  return clamp(base * (1 - penalty), min, max);
}

/** Part des votes blancs : au second tour, elle croît quand aucun finaliste n'est proche. */
export function blankRate(
  group: ElectorateGroup,
  contenders: readonly Contender[],
  model: Model,
  round: 1 | 2,
): number {
  const { blancsT1, blancsT2Min, blancsT2Max } = model.blancsNuls;
  if (round === 1) return blancsT1;
  const nearest = Math.min(...contenders.map((c) => distance(group.position, c.position)));
  return blancsT2Min + (blancsT2Max - blancsT2Min) * clamp((nearest - 0.5) / 1.5, 0, 1);
}
