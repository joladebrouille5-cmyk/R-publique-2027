import {
  TABLES,
  type AdvanceRow,
  type EventRow,
  type GameRow,
  type Operation,
  type SaveRow,
  type Store,
} from './store';

// Stockage IndexedDB de l'application mobile (phase 8) : une base « republique-2027 » sur
// l'appareil, une table par type d'enregistrement. Toutes les écritures d'une requête passent
// par une seule transaction IndexedDB : elles sont appliquées ensemble, ou pas du tout.

const DATABASE = 'republique-2027';
/** Version 2 : index des progressions par partie et date (rétention de l'idempotence). */
const VERSION = 2;

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Erreur IndexedDB'));
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DATABASE, VERSION);
  // Montée de version incrémentale : une base existante garde ses données.
  request.onupgradeneeded = (event) => {
    const db = request.result;
    if (event.oldVersion < 1) {
      db.createObjectStore('games', { keyPath: 'id' });
      db.createObjectStore('saves', { keyPath: 'id' }).createIndex('gameId', 'gameId');
      db.createObjectStore('events', { keyPath: 'id' }).createIndex('gameId', 'gameId');
      db.createObjectStore('advances', { keyPath: 'id' }).createIndex(
        'gameKey',
        ['gameId', 'idempotencyKey'],
        { unique: true },
      );
    }
    if (event.oldVersion < 2) {
      request
        .transaction!.objectStore('advances')
        .createIndex('gameCreated', ['gameId', 'createdAt']);
    }
  };
  return promised(request);
}

export class IndexedDbStore implements Store {
  private constructor(private readonly db: IDBDatabase) {}

  /** Ouvre (ou crée) la base de l'application. */
  static async open(factory: IDBFactory = globalThis.indexedDB): Promise<IndexedDbStore> {
    if (!factory) throw new Error('IndexedDB indisponible : stockage local impossible.');
    return new IndexedDbStore(await open(factory));
  }

  private read<T>(table: string, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const transaction = this.db.transaction(table, 'readonly');
    return promised(run(transaction.objectStore(table)));
  }

  games() {
    return this.read('games', (s) => s.getAll() as IDBRequest<GameRow[]>);
  }

  game(id: string) {
    return this.read('games', (s) => s.get(id) as IDBRequest<GameRow | undefined>);
  }

  saves(gameId: string) {
    return this.read('saves', (s) => s.index('gameId').getAll(gameId) as IDBRequest<SaveRow[]>);
  }

  events(gameId: string) {
    return this.read('events', (s) => s.index('gameId').getAll(gameId) as IDBRequest<EventRow[]>);
  }

  advance(gameId: string, idempotencyKey: string) {
    return this.read(
      'advances',
      (s) => s.index('gameKey').get([gameId, idempotencyKey]) as IDBRequest<AdvanceRow | undefined>,
    );
  }

  staleAdvances(gameId: string, keep: number): Promise<string[]> {
    // Parcours des seules clés (sans charger les réponses), des plus récentes aux plus anciennes ;
    // la rétention borne la table à quelques lignes par partie.
    return new Promise((resolve, reject) => {
      const store = this.db.transaction('advances', 'readonly').objectStore('advances');
      const request = store.index('gameCreated').openKeyCursor(null, 'prev');
      const ids: string[] = [];
      let seen = 0;
      request.onerror = () => reject(request.error ?? new Error('Erreur IndexedDB'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(ids);
        if ((cursor.key as [string, string])[0] === gameId && seen++ >= keep)
          ids.push(String(cursor.primaryKey));
        cursor.continue();
      };
    });
  }

  commit(operations: readonly Operation[]): Promise<void> {
    if (operations.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([...TABLES], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Écriture refusée'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Écriture annulée'));
      for (const op of operations) {
        const store = transaction.objectStore(op.table);
        if (op.kind === 'put') store.put(op.value);
        else store.delete(op.id);
      }
    });
  }

  close(): void {
    this.db.close();
  }
}
