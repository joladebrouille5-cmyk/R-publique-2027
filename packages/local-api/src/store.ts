import type { GameMode, Difficulty, GamePhase } from '@r2027/shared';

// Stockage du serveur local (phase 8) : mêmes données que les tables techniques de l'API
// (parties, sauvegardes, journal, progressions idempotentes), conservées sur l'appareil. Les
// lectures se font avant le calcul ; toutes les écritures d'une requête sont ensuite appliquées
// d'un seul tenant (`commit`), comme une transaction de l'API.

export type GameRow = {
  id: string;
  name: string;
  mode: GameMode;
  difficulty: Difficulty;
  seed: string;
  engineVersion: string;
  rulesetVersion: string;
  saveSchemaVersion: number;
  phase: GamePhase;
  week: number;
  date: string;
  /** Verrou optimiste, comme dans l'API. */
  version: number;
  state: unknown;
  stateHash: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveRow = {
  id: string;
  gameId: string;
  kind: 'auto' | 'manuelle' | 'avant_evenement' | 'import';
  slot: number | null;
  label: string | null;
  week: number;
  date: string;
  state: unknown;
  stateHash: string;
  engineVersion: string;
  saveSchemaVersion: number;
  createdAt: string;
};

export type EventRow = {
  id: string;
  gameId: string;
  week: number;
  type: string;
  nature: string;
  payload: unknown;
  createdAt: string;
};

export type AdvanceRow = {
  id: string;
  gameId: string;
  idempotencyKey: string;
  requestHash: string;
  fromWeek: number;
  toWeek: number;
  response: unknown;
  createdAt: string;
};

export type Rows = { games: GameRow; saves: SaveRow; events: EventRow; advances: AdvanceRow };
export type Table = keyof Rows;
export const TABLES: readonly Table[] = ['games', 'saves', 'events', 'advances'];

export type Operation =
  | { [T in Table]: { kind: 'put'; table: T; value: Rows[T] } }[Table]
  | { kind: 'delete'; table: Table; id: string };

export interface Store {
  games(): Promise<GameRow[]>;
  game(id: string): Promise<GameRow | undefined>;
  saves(gameId: string): Promise<SaveRow[]>;
  events(gameId: string): Promise<EventRow[]>;
  advance(gameId: string, idempotencyKey: string): Promise<AdvanceRow | undefined>;
  /** Applique toutes les écritures d'une requête, ou aucune. */
  commit(operations: readonly Operation[]): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Stockage en mémoire (tests, et repli si IndexedDB est indisponible). */
export class MemoryStore implements Store {
  private readonly tables: { [T in Table]: Map<string, Rows[T]> } = {
    games: new Map(),
    saves: new Map(),
    events: new Map(),
    advances: new Map(),
  };

  async games() {
    return [...this.tables.games.values()].map(clone);
  }

  async game(id: string) {
    const row = this.tables.games.get(id);
    return row && clone(row);
  }

  async saves(gameId: string) {
    return [...this.tables.saves.values()].filter((s) => s.gameId === gameId).map(clone);
  }

  async events(gameId: string) {
    return [...this.tables.events.values()].filter((e) => e.gameId === gameId).map(clone);
  }

  async advance(gameId: string, idempotencyKey: string) {
    const row = [...this.tables.advances.values()].find(
      (a) => a.gameId === gameId && a.idempotencyKey === idempotencyKey,
    );
    return row && clone(row);
  }

  async commit(operations: readonly Operation[]) {
    for (const op of operations) {
      const table = this.tables[op.table] as Map<string, unknown>;
      if (op.kind === 'put') table.set(op.value.id, clone(op.value));
      else table.delete(op.id);
    }
  }
}
