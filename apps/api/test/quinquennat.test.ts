import { advanceWeek, openQuinquennat, PLAYER_ACTOR_ID } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { hashState } from '@r2027/save-engine';
import {
  AdvanceResponseSchema,
  GameDetailSchema,
  type GameDetail,
  type GameState,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

// Phase 6 : quinquennat servi par l'API, avance rapide arrêtée avant toute décision obligatoire.

const ruleset = getRuleset(CURRENT_RULESET_KEY);
let db: Database;
let app: FastifyInstance;
let keyCounter = 0;
const newKey = () => `cle-quinquennat-${++keyCounter}-${Date.now()}`;

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

async function createGameVia(client: Client, mode: 'observateur' | 'candidat_personnalise') {
  const response = await client.post('/api/games', {
    name: 'Quinquennat',
    mode,
    seed: 'api-quinquennat',
    ...(mode === 'observateur'
      ? {}
      : {
          candidate: {
            prenom: 'Camille',
            nom: 'Test',
            parti: 'Parti du test',
            positionnement: { economie: 0, societe: 0 },
          },
        }),
  });
  expect(response.statusCode).toBe(201);
  return GameDetailSchema.parse(response.json());
}

/** Joue la présidentielle avec le moteur jusqu'à l'élection, puis installe l'état en base. */
async function electedGame(client: Client, mode: 'observateur' | 'candidat_personnalise') {
  const game = await createGameVia(client, mode);
  let state = game.state;
  while (!state.quinquennat) {
    const decisions = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    }));
    state = advanceWeek(state, { actions: [], decisions }, { ruleset }).state;
  }
  if (
    mode === 'candidat_personnalise' &&
    state.quinquennat.mandat.presidentId !== PLAYER_ACTOR_ID
  ) {
    // Le joueur déclaré élu : même ouverture du quinquennat que celle du moteur au second tour.
    for (const actor of Object.values(state.actors))
      if (actor.status === 'elu') actor.status = 'battu';
    state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
    state.quinquennat = null;
    openQuinquennat(state, ruleset, PLAYER_ACTOR_ID);
  }
  await forceState(game.id, state);
  return { ...game, state, week: state.meta.week };
}

async function forceState(gameId: string, state: GameState) {
  await db.game.update({
    where: { id: gameId },
    data: { state, stateHash: hashState(state), week: state.meta.week, version: { increment: 1 } },
  });
}

function advanceVia(client: Client, game: Pick<GameDetail, 'id'>, body: object, key = newKey()) {
  return client.request({
    method: 'POST',
    url: `/api/games/${game.id}/advance`,
    payload: body as never,
    headers: { 'idempotency-key': key },
  });
}

describe('avance rapide pendant le quinquennat', () => {
  it('fait défiler jusqu’à 52 semaines du président IA, chacune journalisée', async () => {
    const client = new Client(app);
    const game = await electedGame(client, 'observateur');
    expect(game.state.meta).toMatchObject({ phase: 'presidence', week: 31, date: '2027-05-03' });

    const key = newKey();
    const response = await advanceVia(client, game, { expectedWeek: 31, semaines: 52 }, key);
    expect(response.statusCode).toBe(200);
    const body = AdvanceResponseSchema.parse(response.json());
    expect(body.avanceRapide).toEqual({ demandees: 52, resolues: 52, arret: null });
    expect(body.game.week).toBe(83);
    expect(body.report).toMatchObject({ week: 82, nextWeek: 83 });
    expect(body.game.state.quinquennat!.gouvernement).not.toBeNull();

    const weeks = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'semaine_resolue' },
      orderBy: { week: 'asc' },
    });
    expect(weeks.map((w) => w.week)).toEqual(Array.from({ length: 52 }, (_, i) => 31 + i));
    const advances = await db.gameAdvance.findMany({ where: { gameId: game.id } });
    expect(advances.map((a) => [a.fromWeek, a.toWeek])).toEqual([[31, 83]]);
    const nomination = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'evenement' },
    });
    expect(nomination.some((e) => (e.payload as { refId: string }).refId === 'gouvernement')).toBe(
      true,
    );
    const logs = await db.simulationLog.count({ where: { gameId: game.id } });
    expect(logs).toBe(52 * 12);

    // Même clé, même requête : réponse rejouée, la partie n'avance pas deux fois.
    const replay = await advanceVia(client, game, { expectedWeek: 31, semaines: 52 }, key);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.json()).toEqual(response.json());
  });

  it('s’arrête avant la nomination du Premier ministre, puis reprend une fois la décision prise', async () => {
    const client = new Client(app);
    const game = await electedGame(client, 'candidat_personnalise');
    const first = AdvanceResponseSchema.parse(
      (await advanceVia(client, game, { expectedWeek: game.week, semaines: 10 })).json(),
    );
    expect(first.avanceRapide).toEqual({ demandees: 10, resolues: 1, arret: 'decision' });
    const decision = first.game.state.pendingDecisions[0]!;
    expect(decision.kind).toBe('gouvernement');

    const second = AdvanceResponseSchema.parse(
      (
        await advanceVia(client, first.game, {
          expectedWeek: first.game.week,
          semaines: 10,
          decisions: [{ decisionId: decision.id, optionId: decision.defaultOptionId }],
        })
      ).json(),
    );
    expect(second.avanceRapide).toEqual({ demandees: 10, resolues: 10, arret: null });
    expect(second.game.state.quinquennat!.gouvernement).toMatchObject({ numero: 1 });
    expect(second.game.week).toBe(first.game.week + 10);
  });

  it('refuse les actions en avance rapide et celles d’un joueur qui ne préside pas', async () => {
    const client = new Client(app);
    const game = await electedGame(client, 'candidat_personnalise');
    const withActions = await advanceVia(client, game, {
      expectedWeek: game.week,
      semaines: 4,
      actions: [{ actionId: 'allocution' }],
    });
    expect(withActions.statusCode).toBe(400);
    expect(withActions.json()).toMatchObject({ error: { code: 'requete_invalide' } });

    const observer = await electedGame(client, 'observateur');
    const forbidden = await advanceVia(client, observer, {
      expectedWeek: observer.week,
      actions: [{ actionId: 'allocution' }],
    });
    expect(forbidden.statusCode).toBe(422);
    expect(forbidden.json()).toMatchObject({ error: { code: 'actions_interdites' } });
  });
});
