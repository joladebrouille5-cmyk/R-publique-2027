import { sha256Hex } from '@r2027/engine';
import { GameStateSchema, type GameState } from '@r2027/shared';

/**
 * Sérialisation JSON canonique : clés d'objet triées, aucun espace. Refuse les valeurs
 * que JSON ne représente pas fidèlement (undefined, NaN, Infinity, fonctions, BigInt…)
 * pour que l'empreinte d'un état soit stable et sans ambiguïté.
 */
export function canonicalStringify(value: unknown): string {
  return serialize(value, '$');
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Nombre non fini en ${path}`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => serialize(item, `${path}[${index}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value) as unknown;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Objet non sérialisable en ${path}`);
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map((key) => {
          const item = record[key];
          if (item === undefined) throw new TypeError(`Valeur undefined en ${path}.${key}`);
          return `${JSON.stringify(key)}:${serialize(item, `${path}.${key}`)}`;
        })
        .join(',')}}`;
    }
    default:
      throw new TypeError(`Type ${typeof value} non sérialisable en ${path}`);
  }
}

/**
 * SHA-256 hexadécimal (UTF-8) en TypeScript pur, identique à `node:crypto` (testé par le
 * moteur) : les sauvegardes se vérifient aussi dans l'application mobile, sans serveur.
 */
export function sha256(text: string): string {
  return sha256Hex(text);
}

/** Empreinte SHA-256 de la forme canonique d'un état de partie. */
export function hashState(state: GameState): string {
  return sha256(canonicalStringify(state));
}

export type Snapshot = { state: GameState; stateHash: string };

/** Valide un état (schéma Zod strict) et calcule son empreinte. */
export function snapshotState(state: unknown): Snapshot {
  const parsed = GameStateSchema.parse(state);
  return { state: parsed, stateHash: hashState(parsed) };
}

export class SnapshotIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotIntegrityError';
  }
}

/** Relit un état persistant et vérifie qu'il correspond à son empreinte enregistrée. */
export function verifySnapshot(state: unknown, expectedHash: string): GameState {
  const { state: parsed, stateHash } = snapshotState(state);
  if (stateHash !== expectedHash) {
    throw new SnapshotIntegrityError(
      `Empreinte d'état incohérente : attendue ${expectedHash}, obtenue ${stateHash}`,
    );
  }
  return parsed;
}
