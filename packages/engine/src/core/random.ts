import type { Effect } from '@r2027/shared';
import { createRng, deriveRngState, type Rng } from './rng';

/**
 * Flux d'aléa indépendant pour un contexte donné : la même graine, la même semaine et le
 * même contexte donnent toujours les mêmes tirages, quel que soit le reste de la partie.
 */
export function stream(seed: string, week: number, ...context: (string | number)[]): Rng {
  return createRng(deriveRngState(seed, `semaine-${week}`, ...context.map(String)));
}

/** Tire la part aléatoire d'un effet : entier uniforme dans [−ecart, +ecart]. */
export function drawAlea(rng: Rng, effect: Effect): number {
  if (effect.ecart === 0) return 0;
  return rng.nextInt(2 * effect.ecart + 1) - effect.ecart;
}
