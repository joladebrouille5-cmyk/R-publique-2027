import type { RngState } from '@r2027/shared';
import { sha256Words, utf8Encode } from './sha256';

// Générateur pseudo-aléatoire sfc32 (« Small Fast Counting », PractRand, domaine public).
// État : trois mots de 32 bits (a, b, c) et un compteur. Seule source d'aléa du moteur.

/** Nombre de tirages écartés après l'initialisation, comme dans PractRand. */
const WARMUP_ROUNDS = 12;
const LABEL_SEPARATOR = '\u0000';

export type Rng = {
  /** Entier non signé sur 32 bits. */
  nextUint32(): number;
  /** Réel dans [0, 1). */
  nextFloat(): number;
  /** Entier uniforme dans [0, maxExclusive), sans biais (rejet). */
  nextInt(maxExclusive: number): number;
  /** Copie de l'état courant, sérialisable dans `GameState`. */
  snapshot(): RngState;
};

function step(s: [number, number, number, number]): number {
  const [a, b, c, counter] = s;
  const tmp = (((a + b) | 0) + counter) | 0;
  s[3] = (counter + 1) | 0;
  s[0] = b ^ (b >>> 9);
  s[1] = (c + (c << 3)) | 0;
  s[2] = (((c << 21) | (c >>> 11)) + tmp) | 0;
  return tmp >>> 0;
}

export function createRng(state: RngState): Rng {
  const s: [number, number, number, number] = [...state.state];
  return {
    nextUint32: () => step(s),
    nextFloat: () => step(s) / 0x100000000,
    nextInt(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) {
        throw new RangeError(`Borne invalide : ${maxExclusive}`);
      }
      const limit = 0x100000000 - (0x100000000 % maxExclusive);
      let value = step(s);
      while (value >= limit) value = step(s);
      return value % maxExclusive;
    },
    snapshot: () => ({
      algorithm: 'sfc32',
      state: [s[0] >>> 0, s[1] >>> 0, s[2] >>> 0, s[3] >>> 0],
    }),
  };
}

/** Initialise sfc32 à partir de trois mots de 32 bits (compteur à 1, puis échauffement). */
export function seedSfc32(a: number, b: number, c: number): RngState {
  const s: [number, number, number, number] = [a | 0, b | 0, c | 0, 1];
  for (let i = 0; i < WARMUP_ROUNDS; i++) step(s);
  return { algorithm: 'sfc32', state: [s[0] >>> 0, s[1] >>> 0, s[2] >>> 0, s[3] >>> 0] };
}

/**
 * État initial dérivé d'une graine et d'étiquettes (semaine, module, acteur…).
 * Chaque combinaison d'étiquettes donne un flux indépendant : ajouter un flux
 * ne modifie pas les tirages des autres.
 */
export function deriveRngState(seed: string, ...labels: string[]): RngState {
  const words = sha256Words(utf8Encode([seed, ...labels].join(LABEL_SEPARATOR)));
  return seedSfc32(words[0]!, words[1]!, words[2]!);
}
