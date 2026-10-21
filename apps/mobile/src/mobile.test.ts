import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GameDetailSchema,
  GameSummarySchema,
  GeoManifestSchema,
  HealthResponseSchema,
} from '@r2027/shared';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { api, setApiTransport } from '../../web/src/api/client';
import { requestPersistentStorage, startLocalBackend, type LocalBackend } from './backend';
import { readEmbeddedGeo } from './geo-files';
import { safeFileName } from './native';

// Phase 8 : l'application mobile branche l'interface (client d'API de apps/web) sur le moteur
// local, avec une base IndexedDB et le référentiel cartographique embarqué.

const DEMO = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/data-import/demo');

const backends: LocalBackend[] = [];
async function start(factory = new IDBFactory()) {
  const backend = await startLocalBackend(factory, readEmbeddedGeo);
  backends.push(backend);
  setApiTransport(backend.transport);
  return backend;
}

afterEach(() => {
  for (const backend of backends.splice(0)) backend.store.close();
});

const newGame = {
  name: 'Partie mobile',
  mode: 'candidat_personnalise',
  seed: 'mobile',
  candidate: {
    prenom: 'Camille',
    nom: 'Mobile',
    parti: 'Parti de poche',
    positionnement: { economie: 0, societe: 0 },
  },
};

describe('application mobile hors ligne', () => {
  it('sert l’interface par le moteur local, sans réseau', async () => {
    await start();
    const health = await api.get('/api/health', HealthResponseSchema);
    expect(health.status).toBe('ok');
    const game = await api.post('/api/games', GameDetailSchema, newGame);
    expect(game.week).toBe(game.state.meta.week);
    const games = await api.get('/api/games', z.array(GameSummarySchema));
    expect(games.map((g) => g.id)).toEqual([game.id]);
  });

  it('conserve les parties après fermeture et réouverture de l’application', async () => {
    const factory = new IDBFactory();
    const first = await start(factory);
    const game = await api.post('/api/games', GameDetailSchema, newGame);
    first.store.close();
    backends.length = 0;
    await start(factory);
    const again = await api.get(`/api/games/${game.id}`, GameDetailSchema);
    expect(again.stateHash).toBe(game.stateHash);
  });

  it('ne partage aucun objet entre l’interface et le moteur', async () => {
    await start();
    const game = await api.post('/api/games', GameDetailSchema, newGame);
    (game.state.meta as { week: number }).week = 999;
    const again = await api.get(`/api/games/${game.id}`, GameDetailSchema);
    expect(again.state.meta.week).toBe(game.week);
  });

  it('remonte les erreurs du moteur local comme celles de l’API', async () => {
    await start();
    await expect(
      api.get('/api/games/00000000-0000-4000-8000-000000000000', GameDetailSchema),
    ).rejects.toMatchObject({ status: 404, code: 'introuvable' });
    await expect(api.post('/api/games', GameDetailSchema, { name: '' })).rejects.toMatchObject({
      status: 400,
      code: 'requete_invalide',
    });
  });

  it('embarque tous les fichiers du référentiel cartographique de démonstration', async () => {
    const manifest = GeoManifestSchema.parse(await readEmbeddedGeo('manifest.json'));
    const names = [
      manifest.apercu,
      manifest.index,
      ...manifest.departements.flatMap((d) => (d.fichier ? [d.fichier] : [])),
    ];
    for (const name of names) {
      const onDisk: unknown = JSON.parse(await readFile(join(DEMO, 'cog-2026', name), 'utf8'));
      expect(await readEmbeddedGeo(name)).toEqual(onDisk);
    }
    await expect(readEmbeddedGeo('../secret.json')).rejects.toThrow(/absent de l’application/);
  });

  it('signale un stockage non garanti au lieu de le taire', async () => {
    const granted = { persisted: async () => false, persist: async () => true };
    const refused = { persisted: async () => false, persist: async () => false };
    const already = { persisted: async () => true, persist: async () => false };
    const failing = {
      persisted: async () => Promise.reject(new Error('indisponible')),
      persist: async () => true,
    };
    expect(await requestPersistentStorage(granted)).toBeNull();
    expect(await requestPersistentStorage(already)).toBeNull();
    expect(await requestPersistentStorage(refused)).toMatch(/Stockage non garanti/);
    expect(await requestPersistentStorage(failing)).toMatch(/Stockage non garanti/);
    expect(await requestPersistentStorage(undefined)).toMatch(/Exportez régulièrement/);
  });

  it('refuse IndexedDB absent avec une erreur explicite', async () => {
    await expect(
      startLocalBackend(undefined as unknown as IDBFactory, readEmbeddedGeo),
    ).rejects.toThrow(/IndexedDB indisponible/);
  });

  it('nettoie le nom des fichiers exportés', () => {
    expect(safeFileName('partie-2027-semaine-12.json')).toBe('partie-2027-semaine-12.json');
    expect(safeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(safeFileName('Élection présidentielle.json')).toBe('_lection_pr_sidentielle.json');
    expect(safeFileName('')).toBe('republique-2027-partie.json');
  });
});
