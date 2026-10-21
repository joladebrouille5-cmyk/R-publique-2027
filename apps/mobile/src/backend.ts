import { IndexedDbStore, LocalApi, LocalGeo, type GeoSource } from '@r2027/local-api';
import type { ApiTransport } from '../../web/src/api/client';

// Serveur local de l'application : le moteur, les règles et les parties sont sur l'appareil
// (IndexedDB), derrière le même contrat que l'API HTTP. Rien ne sort de l'appareil.

/** Copie « comme sur le réseau » : l'interface ne partage aucun objet avec le moteur. */
const wire = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export type LocalBackend = { api: LocalApi; store: IndexedDbStore; transport: ApiTransport };

export async function startLocalBackend(
  factory: IDBFactory,
  readGeo: GeoSource,
): Promise<LocalBackend> {
  const store = await IndexedDbStore.open(factory);
  const geo = await LocalGeo.load(readGeo);
  const api = new LocalApi({ store, geo });
  const transport: ApiTransport = async ({ method, url, headers, body }) => {
    const response = await api.handle({ method, url, headers, body: wire(body) });
    return { status: response.status, headers: response.headers, body: wire(response.body) };
  };
  return { api, store, transport };
}

/**
 * Demande que le stockage de l'application ne soit pas effacé quand l'appareil manque de place.
 * Renvoie l'avertissement à afficher si la demande n'est pas accordée.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined,
): Promise<string | null> {
  const notice =
    'Stockage non garanti : le système peut effacer les parties si l’appareil manque de place. Exportez régulièrement vos parties (Sauvegardes).';
  if (!storage?.persist) return notice;
  try {
    if (await storage.persisted()) return null;
    return (await storage.persist()) ? null : notice;
  } catch {
    return notice;
  }
}
