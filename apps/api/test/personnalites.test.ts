import { PLAYER_ACTOR_ID } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { AdvanceResponseSchema, GameDetailSchema, RulesetSchema } from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

// Phase 5 bis : personnalités réelles jouables et adversaires, à travers l'API et PostgreSQL.

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const fiches = ruleset.personnalites.personnalites;
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
beforeEach(async () => {
  await resetDatabase(db);
});

describe('personnalités réelles', () => {
  it('sert les fiches sourcées avec le jeu de règles', async () => {
    const response = await new Client(app).get(`/api/rulesets/${CURRENT_RULESET_KEY}`);
    expect(response.statusCode).toBe(200);
    const served = RulesetSchema.parse(response.json());
    expect(served.personnalites.personnalites.map((p) => p.id)).toEqual(fiches.map((p) => p.id));
    expect(served.personnalites.sources.length).toBeGreaterThan(0);
  });

  it('crée une partie où le joueur incarne une personnalité face aux adversaires réels, puis la fait avancer', async () => {
    const client = new Client(app);
    const response = await client.post('/api/games', {
      name: 'Réel',
      mode: 'candidat_reel',
      personnaliteId: 'reel-retailleau',
      adversaires: 'reels',
      seed: 'api-reel',
    });
    expect(response.statusCode).toBe(201);
    const game = GameDetailSchema.parse(response.json());
    expect(game.mode).toBe('candidat_reel');
    expect(game.state.player).toEqual({
      mode: 'candidat_reel',
      actorId: PLAYER_ACTOR_ID,
      adversaires: 'reels',
      orientation: null,
      format: 'complet',
      depart: 'sondages',
    });
    expect(game.state.actors[PLAYER_ACTOR_ID]!.candidate).toMatchObject({
      nature: 'reel',
      personnaliteId: 'reel-retailleau',
      nom: 'Retailleau',
    });
    const opponents = Object.keys(game.state.actors).filter((id) => id !== PLAYER_ACTOR_ID);
    expect(opponents.sort()).toEqual(
      fiches.map((p) => p.id).filter((id) => id !== 'reel-retailleau'),
    );

    const advanced = await client.request({
      method: 'POST',
      url: `/api/games/${game.id}/advance`,
      headers: { 'idempotency-key': 'cle-reel-1' },
      payload: { expectedWeek: 0, actions: [{ actionId: 'elus-locaux', cible: '85' }] },
    });
    expect(advanced.statusCode).toBe(200);
    const { game: next, report } = AdvanceResponseSchema.parse(advanced.json());
    expect(next.week).toBe(1);
    expect(report.strategies.map((s) => s.actorId).sort()).toEqual(opponents.sort());
  });

  it('crée une partie d’observation entre personnalités réelles', async () => {
    const response = await new Client(app).post('/api/games', {
      name: 'Observation',
      mode: 'observateur',
      adversaires: 'reels',
      seed: 'api-reel-obs',
    });
    expect(response.statusCode).toBe(201);
    const game = GameDetailSchema.parse(response.json());
    expect(Object.keys(game.state.actors).sort()).toEqual(fiches.map((p) => p.id));
  });
});
