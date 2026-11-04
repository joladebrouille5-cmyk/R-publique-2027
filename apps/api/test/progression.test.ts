import { advanceWeek, PLAYER_ACTOR_ID } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { hashState } from '@r2027/save-engine';
import {
  GameDetailSchema,
  ProgressionSchema,
  type GameDetail,
  type GameState,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

// Phase 20 : palmarès, niveau, déblocages et défi du jour, servis par l'API (mêmes règles que le
// moteur local). L'horloge du serveur est fixée : 3 novembre 2026, 23 h 30 à Paris.

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const NOW = new Date('2026-11-03T22:30:00Z');
let db: Database;
let app: FastifyInstance;

beforeAll(async () => {
  db = testDatabase();
  app = await testApp(db, {}, () => NOW);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(db);
});

const candidate = {
  prenom: 'Camille',
  nom: 'Test',
  parti: 'Parti du test',
  positionnement: { economie: 0, societe: 0 },
};

async function create(client: Client, body: object) {
  return client.post('/api/games', {
    name: 'Progression',
    mode: 'candidat_personnalise',
    candidate,
    ...body,
  });
}

async function progression(client: Client) {
  const response = await client.request({ method: 'GET', url: '/api/progression' });
  expect(response.statusCode).toBe(200);
  return ProgressionSchema.parse(response.json());
}

/** Joue la présidentielle jusqu'au second tour et déclare le joueur élu, puis l'installe. */
async function wonGame(client: Client): Promise<GameDetail> {
  const response = await create(client, { seed: 'api-progression' });
  const game = GameDetailSchema.parse(response.json());
  let state: GameState = game.state;
  while (!state.elections.t2) {
    const decisions = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    }));
    state = advanceWeek(state, { actions: [], decisions }, { ruleset }).state;
  }
  state.elections.t1!.qualified = [PLAYER_ACTOR_ID, ...state.elections.t1!.qualified.slice(1)];
  state.elections.t2.winner = PLAYER_ACTOR_ID;
  await db.game.update({
    where: { id: game.id },
    data: { state, stateHash: hashState(state), week: state.meta.week, version: { increment: 1 } },
  });
  return game;
}

describe('progression (phase 20)', () => {
  it('part de zéro : niveau 1, Légende et le scénario d’outsider verrouillés, défi du jour', async () => {
    const client = new Client(app);
    const start = await progression(client);
    expect(start).toMatchObject({ parties: 0, victoires: 0, points: 0, meilleurPremierTour: null });
    expect(start.niveau).toMatchObject({ numero: 1, titre: 'Militant', suivant: { numero: 2 } });
    expect(start.deblocages.map((d) => [d.id, d.debloque, d.condition])).toEqual([
      ['niveau-legende', false, 'Gagner une présidentielle'],
      ['scenario-outsider', false, 'Gagner une présidentielle'],
    ]);
    // Date de Paris (le 3 novembre à 23 h 30), pas celle de Greenwich.
    expect(start.defi).toMatchObject({
      date: '2026-11-03',
      graine: 'defi-2026-11-03',
      difficulte: 'standard',
      format: 'court',
      tentatives: 0,
      meilleurScore: null,
    });
  });

  it('refuse un contenu verrouillé et une graine réservée au défi, puis débloque après une victoire', async () => {
    const client = new Client(app);
    const legende = await create(client, { difficulty: 'legende' });
    expect(legende.statusCode).toBe(403);
    expect(legende.json()).toMatchObject({
      error: { code: 'verrouille', message: expect.stringMatching(/^Niveau Légende/) },
    });
    const outsider = await create(client, { scenarioId: 'outsider' });
    expect(outsider.statusCode).toBe(403);
    const reserved = await create(client, { seed: 'defi-2026-11-03' });
    expect(reserved.statusCode).toBe(422);
    expect(reserved.json()).toMatchObject({ error: { code: 'graine_reservee' } });

    await wonGame(client);
    const after = await progression(client);
    expect(after.victoires).toBe(1);
    expect(after.deblocages.every((d) => d.debloque)).toBe(true);
    // Partie jouée, qualification, victoire (et premier tour s'il a été disputé : ce candidat
    // sans action n'a pas réuni ses parrainages).
    const p = ruleset.progression.points;
    expect(after.points).toBe(
      p.partie +
        (after.meilleurPremierTour === null ? 0 : p.premierTour) +
        p.secondTour +
        p.victoire,
    );
    expect(after.niveau.numero).toBeGreaterThan(1);
    expect((await create(client, { difficulty: 'legende' })).statusCode).toBe(201);
    // Une autre session n'en profite pas.
    expect((await create(new Client(app), { difficulty: 'legende' })).statusCode).toBe(403);
  });

  it('lance le défi du jour avec ses paramètres imposés, et le compte au palmarès', async () => {
    const client = new Client(app);
    const response = await create(client, { defi: true, difficulty: 'decouverte' });
    expect(response.statusCode).toBe(201);
    const game = GameDetailSchema.parse(response.json());
    expect(game.seed).toBe('defi-2026-11-03');
    expect(game.difficulty).toBe('standard');
    expect(game.state.player.format).toBe('court');
    expect(game.state.scenario).toBe('standard');
    expect((await progression(client)).defi.tentatives).toBe(1);
    // Graine et date de départ ne se choisissent pas ; un observateur ne relève pas le défi.
    expect((await create(client, { defi: true, seed: 'x1234567' })).statusCode).toBe(400);
    const observer = await client.post('/api/games', {
      name: 'Défi',
      mode: 'observateur',
      defi: true,
    });
    expect(observer.statusCode).toBe(400);
  });
});
