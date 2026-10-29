import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import {
  AdvanceResponseSchema,
  ApiErrorSchema,
  GameDetailSchema,
  JournalPageSchema,
  SupportProspectsSchema,
  type GameDetail,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

// Phase 15 : orientation stratégique à la création, vivier des négociations de soutien calculé
// par le moteur, négociation par le plan de la semaine — à travers l'API réelle et PostgreSQL.

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const candidate = { nom: 'Mouvement', parti: 'Parti', positionnement: { economie: 0, societe: 0 } };
let db: Database;
let app: FastifyInstance;
let keys = 0;

beforeAll(async () => {
  db = testDatabase();
  app = await testApp(db);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(db);
});

const code = (body: unknown) => ApiErrorSchema.parse(body).error.code;

async function newGame(client: Client, body: Record<string, unknown> = {}): Promise<GameDetail> {
  const response = await client.post('/api/games', {
    name: 'Pré-campagne',
    mode: 'candidat_personnalise',
    seed: 'precampagne-api',
    candidate,
    ...body,
  });
  expect(response.statusCode, response.body).toBe(201);
  return GameDetailSchema.parse(response.json());
}

describe('orientation stratégique', () => {
  it('crée une partie avec une orientation et la journalise', async () => {
    const client = new Client(app);
    const game = await newGame(client, { orientationId: 'camp' });
    expect(game.state.player.orientation).toBe('camp');
    const journal = JournalPageSchema.parse(
      (await client.get(`/api/games/${game.id}/journal`)).json(),
    );
    expect(journal.entries.find((e) => e.type === 'partie_creee')!.details).toMatchObject({
      orientation: 'camp',
    });
  });

  it('refuse une orientation inconnue (422) et toute orientation en observateur (400)', async () => {
    const client = new Client(app);
    const unknown = await client.post('/api/games', {
      name: 'x',
      mode: 'candidat_personnalise',
      candidate,
      orientationId: 'inconnue',
    });
    expect(unknown.statusCode).toBe(422);
    expect(code(unknown.json())).toBe('orientation_inconnue');
    const observer = await client.post('/api/games', {
      name: 'x',
      mode: 'observateur',
      orientationId: 'camp',
    });
    expect(observer.statusCode).toBe(400);
    expect(code(observer.json())).toBe('requete_invalide');
  });
});

describe('négociations de soutien', () => {
  it('sert le vivier calculé par le moteur, puis négocie par le plan de la semaine', async () => {
    const client = new Client(app);
    const game = await newGame(client);
    const response = await client.get(`/api/games/${game.id}/soutiens`);
    expect(response.statusCode).toBe(200);
    const prospects = SupportProspectsSchema.parse(response.json());
    expect(prospects).toMatchObject({ annee: 2027, obtenus: 0, maximum: 6 });
    expect(prospects.personnalites).toHaveLength(ruleset.figures.figures.length);
    const open = prospects.personnalites.find((p) => p.probabilites !== null)!;
    const advanced = await client.request({
      method: 'POST',
      url: `/api/games/${game.id}/advance`,
      headers: { 'idempotency-key': `cle-precampagne-${++keys}` },
      payload: {
        expectedWeek: game.week,
        actions: [{ actionId: 'negocier-soutien-ministere', cible: open.figureId }],
        decisions: [],
      },
    });
    expect(advanced.statusCode, advanced.body).toBe(200);
    const { report, game: next } = AdvanceResponseSchema.parse(advanced.json());
    expect(report.events.find((e) => e.refId === 'negociation-soutien')).toMatchObject({
      nature: 'simule',
      majeur: true,
    });
    expect(next.state.negociations).toEqual([
      expect.objectContaining({ figureId: open.figureId, contrepartie: 'ministere' }),
    ]);
  });

  it('refuse le vivier hors campagne d’un candidat du joueur (409) et une partie inconnue (404)', async () => {
    const client = new Client(app);
    const observer = await client.post('/api/games', { name: 'Observateur', mode: 'observateur' });
    const game = GameDetailSchema.parse(observer.json());
    const refused = await client.get(`/api/games/${game.id}/soutiens`);
    expect(refused.statusCode).toBe(409);
    expect(code(refused.json())).toBe('soutiens_indisponibles');
    const missing = await client.get(`/api/games/${crypto.randomUUID()}/soutiens`);
    expect(missing.statusCode).toBe(404);
  });
});
