import { GeoManifestSchema, TerritorySearchResultSchema } from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { testApp, testDatabase } from './helpers';

let db: Database;
let app: FastifyInstance;

beforeAll(async () => {
  db = testDatabase();
  app = await testApp(db);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url, headers });

describe('référentiel cartographique', () => {
  it('sert le manifeste du jeu de démonstration, avec ses sources', async () => {
    const response = await get('/api/geo/manifeste');
    expect(response.statusCode).toBe(200);
    const manifest = GeoManifestSchema.parse(response.json());
    expect(manifest).toMatchObject({ couverture: 'demonstration', millesime: 'cog-2026' });
    expect(manifest.sources.every((s) => /^[0-9a-f]{64}$/.test(s.sha256))).toBe(true);
    expect(manifest.horsCarte.map((h) => h.nom)).toContain('Français établis hors de France');
  });

  it('sert les fichiers du manifeste, compressés si le client l’accepte', async () => {
    const plain = await get('/api/geo/fichiers/communes/976.topo.json');
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['content-encoding']).toBeUndefined();
    const compressed = await get('/api/geo/fichiers/communes/976.topo.json', {
      'accept-encoding': 'gzip, br',
    });
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.rawPayload.length).toBeLessThan(plain.rawPayload.length);
    expect(gunzipSync(compressed.rawPayload).toString('utf8')).toBe(plain.body);
    expect(JSON.parse(plain.body)).toMatchObject({ type: 'Topology' });
  });

  it.each(['communes/75.topo.json', 'manifest.json', '../../../.env', '%2e%2e/%2e%2e/.env'])(
    'refuse un fichier hors du manifeste (%s)',
    async (name) => {
      const response = await get(`/api/geo/fichiers/${name}`);
      expect(response.statusCode).toBe(404);
    },
  );

  it.each([
    ['Mamoudzou', 'commune', '97611', '976'],
    ['97411', 'commune', '97411', '974'],
    ['Ajaccio', 'commune', '2A004', 'metropole'],
    ['2a004', 'commune', '2A004', 'metropole'],
    ['corse du sud', 'departement', '2A', 'metropole'],
    ['Guyane', 'region', '03', '973'],
  ])('trouve « %s »', async (q, level, code, zone) => {
    const response = await get(`/api/geo/recherche?q=${encodeURIComponent(q)}`);
    expect(response.statusCode).toBe(200);
    const [first] = TerritorySearchResultSchema.array().parse(response.json());
    expect(first).toMatchObject({ level, code, zone });
  });

  it('refuse une recherche vide', async () => {
    expect((await get('/api/geo/recherche?q=')).statusCode).toBe(400);
  });
});
