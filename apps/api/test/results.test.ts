import { advanceWeek, aggregateCounts } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { hashState } from '@r2027/save-engine';
import {
  CommuneResultsResponseSchema,
  GameDetailSchema,
  HistoricalStatusSchema,
  type GameDetail,
  type GameState,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { ElectoralRepository } from '../src/services/electoral';
import { GeoRepository } from '../src/services/geo';
import { historicalValues } from '../src/services/results';
import { Client, DEMO_GEO_DIR, resetDatabase, testApp, testDatabase } from './helpers';

const ruleset = getRuleset(CURRENT_RULESET_KEY);
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

const candidate = { nom: 'Test', parti: 'Parti', positionnement: { economie: 0, societe: 0 } };
let keys = 0;

async function gameAtFirstRound(client: Client): Promise<GameDetail> {
  const created = await client.post('/api/games', {
    name: 'Carte',
    mode: 'candidat_personnalise',
    seed: 'carte',
    candidate,
  });
  const game = GameDetailSchema.parse(created.json());
  let state: GameState = game.state;
  while (state.meta.week < 28) {
    const decisions = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    }));
    state = advanceWeek(state, { actions: [], decisions }, { ruleset }).state;
  }
  await db.game.update({
    where: { id: game.id },
    data: { state, stateHash: hashState(state), week: state.meta.week, version: { increment: 1 } },
  });
  const current = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
  const response = await client.request({
    method: 'POST',
    url: `/api/games/${game.id}/advance`,
    headers: { 'idempotency-key': `cle-resultats-${++keys}-${Date.now()}` },
    payload: {
      expectedWeek: 28,
      actions: [],
      decisions: current.state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
    },
  });
  expect(response.statusCode).toBe(200);
  return GameDetailSchema.parse(response.json().game);
}

describe('résultats territoriaux d’une partie', () => {
  it('dépouille le premier tour commune par commune (base de démonstration fictive)', async () => {
    const client = new Client(app);
    const game = await gameAtFirstRound(client);
    const territoire = game.state.elections.t1!.territoire!;
    expect(territoire.nature).toBe('fictif');
    expect(Object.keys(territoire.departements)).toHaveLength(101);
    expect(game.state.elections.t1!.inscrits).toBe(ruleset.electorat.inscrits.valeur);

    const response = await client.get(`/api/games/${game.id}/resultats/1/communes?departement=2A`);
    expect(response.statusCode).toBe(200);
    const body = CommuneResultsResponseSchema.parse(response.json());
    expect(Object.keys(body.communes)).toHaveLength(124);
    expect(body.communes['2A004']!.inscrits).toBeGreaterThan(0);
    // Le département est exactement la somme de ses communes recalculées.
    expect(aggregateCounts(Object.values(body.communes))).toEqual(territoire.departements['2A']);

    // Hors du jeu de démonstration, pas de détail communal.
    const paris = CommuneResultsResponseSchema.parse(
      (await client.get(`/api/games/${game.id}/resultats/1/communes?departement=75`)).json(),
    );
    expect(paris.communes).toEqual({});
  });

  it('signale un tour non dépouillé, un département invalide et une base différente', async () => {
    const client = new Client(app);
    const game = await gameAtFirstRound(client);
    expect(
      (await client.get(`/api/games/${game.id}/resultats/2/communes?departement=2A`)).statusCode,
    ).toBe(404);
    expect(
      (await client.get(`/api/games/${game.id}/resultats/1/communes?departement=../x`)).statusCode,
    ).toBe(400);

    const state = structuredClone(game.state);
    state.elections.t1!.territoire!.baselineId = 'autre-base';
    await db.game.update({
      where: { id: game.id },
      data: { state, stateHash: hashState(state), version: { increment: 1 } },
    });
    const mismatch = await client.get(`/api/games/${game.id}/resultats/1/communes?departement=2A`);
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { code: 'base_differente' } });
  });

  it('n’expose les résultats d’une partie qu’à son joueur', async () => {
    const game = await gameAtFirstRound(new Client(app));
    const other = await new Client(app).get(
      `/api/games/${game.id}/resultats/1/communes?departement=2A`,
    );
    expect(other.statusCode).toBe(404);
  });
});

describe('résultats historiques', () => {
  it('sont indisponibles avec le jeu de démonstration, avec la raison', async () => {
    const status = HistoricalStatusSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/geo/historique' })).json(),
    );
    expect(status).toMatchObject({
      disponible: false,
      raison: expect.stringMatching(/data:resultats/),
    });
    const overview = await app.inject({ method: 'GET', url: '/api/geo/historique/1/apercu' });
    expect(overview.statusCode).toBe(404);
    expect(overview.json()).toMatchObject({ error: { code: 'historique_indisponible' } });
  });

  it('agrège exactement les communes par département, région et hors carte', () => {
    const geo = new GeoRepository(DEMO_GEO_DIR);
    const values = (n: number) => [n, 0, n, 0, 0, n, n];
    const communes = Object.fromEntries(geo.index.map(([code], i) => [code, values(i + 1)]));
    const round = {
      tour: 1,
      communes,
      estimations: [],
      horsCarte: { '99': { nom: 'Étranger', valeurs: values(5) } },
    };
    const electoral = new ElectoralRepository(geo, { t1: round, t2: round } as never);
    const overview = historicalValues(electoral, geo, 1, null);
    const total = (record: Record<string, number[]>) =>
      Object.values(record).reduce((s, v) => s + v[0]!, 0);
    const expected = geo.index.reduce((s, _, i) => s + i + 1, 0);
    expect(total(overview.departements)).toBe(expected);
    expect(total(overview.regions)).toBe(expected);
    expect(overview.horsCarte['99']).toEqual(values(5));
    const corse = historicalValues(electoral, geo, 1, '2A');
    expect(Object.keys(corse.communes)).toHaveLength(124);
  });
});
