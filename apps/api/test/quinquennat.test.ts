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
    // Le défilement va jusqu'à 52 semaines, ou s'arrête sur un fait majeur (crise fictive…).
    const { resolues, arret } = body.avanceRapide!;
    expect(body.avanceRapide!.demandees).toBe(52);
    expect(resolues).toBeGreaterThan(8);
    if (resolues < 52) {
      expect(arret).toBe('evenement_majeur');
      expect(body.report.events.some((e) => e.majeur)).toBe(true);
    } else expect(arret).toBeNull();
    expect(body.game.week).toBe(31 + resolues);
    expect(body.report).toMatchObject({ week: 30 + resolues, nextWeek: 31 + resolues });
    expect(body.game.state.quinquennat!.gouvernement).not.toBeNull();

    const weeks = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'semaine_resolue' },
      orderBy: { week: 'asc' },
    });
    expect(weeks.map((w) => w.week)).toEqual(Array.from({ length: resolues }, (_, i) => 31 + i));
    const advances = await db.gameAdvance.findMany({ where: { gameId: game.id } });
    expect(advances.map((a) => [a.fromWeek, a.toWeek])).toEqual([[31, 31 + resolues]]);
    const nomination = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'evenement' },
    });
    expect(nomination.some((e) => (e.payload as { refId: string }).refId === 'gouvernement')).toBe(
      true,
    );
    const logs = await db.simulationLog.count({ where: { gameId: game.id } });
    expect(logs).toBe(resolues * 12);

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

describe('dissolution et législatives', () => {
  it('dissout, s’arrête sur chaque tour et sauvegarde le premier tour dépouillé', async () => {
    const client = new Client(app);
    const game = await electedGame(client, 'candidat_personnalise');
    const nomination = AdvanceResponseSchema.parse(
      (await advanceVia(client, game, { expectedWeek: game.week, semaines: 4 })).json(),
    );
    const decision = nomination.game.state.pendingDecisions[0]!;
    const named = AdvanceResponseSchema.parse(
      (
        await advanceVia(client, nomination.game, {
          expectedWeek: nomination.game.week,
          decisions: [{ decisionId: decision.id, optionId: decision.defaultOptionId }],
        })
      ).json(),
    );
    const dissolved = await advanceVia(client, named.game, {
      expectedWeek: named.game.week,
      actions: [{ actionId: 'dissolution' }],
    });
    expect(dissolved.statusCode).toBe(200);
    const afterDissolution = AdvanceResponseSchema.parse(dissolved.json());
    expect(afterDissolution.game.state.legislatives!.prochaine!.motif).toBe('dissolution');

    // Premier tour : événement majeur, l'avance rapide s'arrête ; l'état est sauvegardé.
    const round1 = AdvanceResponseSchema.parse(
      (
        await advanceVia(client, afterDissolution.game, {
          expectedWeek: afterDissolution.game.week,
          semaines: 8,
        })
      ).json(),
    );
    expect(round1.avanceRapide!.arret).toBe('evenement_majeur');
    expect(round1.report.legislatives).toMatchObject({ tour: 1, siegesParBloc: null });
    const stored = await db.game.findUniqueOrThrow({ where: { id: game.id } });
    expect((stored.state as GameState).legislatives!.premierTour).toHaveLength(577);

    // Second tour : nouvelle Assemblée de 577 sièges, nouveau gouvernement à nommer.
    const round2 = AdvanceResponseSchema.parse(
      (
        await advanceVia(client, round1.game, { expectedWeek: round1.game.week, semaines: 8 })
      ).json(),
    );
    expect(round2.report.legislatives).toMatchObject({ tour: 2 });
    const legislatives = round2.game.state.legislatives!;
    expect(legislatives.derniere.motif).toBe('dissolution');
    expect(Object.values(legislatives.derniere.siegesParBloc).reduce((a, b) => a + b, 0)).toBe(577);
    expect(round2.game.state.pendingDecisions.map((d) => d.kind)).toContain('gouvernement');

    // Pas de nouvelle dissolution dans l'année : l'action est rejetée par le moteur.
    const again = AdvanceResponseSchema.parse(
      (
        await advanceVia(client, round2.game, {
          expectedWeek: round2.game.week,
          actions: [{ actionId: 'dissolution' }],
          decisions: round2.game.state.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        })
      ).json(),
    );
    expect(again.report.actions[0]).toMatchObject({ status: 'rejetee' });
  });
});

describe('fin du quinquennat', () => {
  it('l’avance rapide s’arrête à l’ouverture de la présidentielle suivante, sauvegardée', async () => {
    const client = new Client(app);
    const game = await electedGame(client, 'observateur');
    // Fin du quinquennat jouée par le moteur, jusqu'à la semaine qui précède la campagne.
    let state = game.state;
    while (state.meta.date < '2031-09-22') {
      const decisions = state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      state = advanceWeek(state, { actions: [], decisions }, { ruleset }).state;
    }
    await forceState(game.id, state);
    const response = await advanceVia(client, game, { expectedWeek: state.meta.week, semaines: 8 });
    expect(response.statusCode).toBe(200);
    const body = AdvanceResponseSchema.parse(response.json());
    expect(body.avanceRapide).toEqual({ demandees: 8, resolues: 1, arret: 'changement_de_phase' });
    expect(body.report.phaseChange).toEqual({ from: 'presidence', to: 'campagne' });
    expect(body.game.state.meta).toMatchObject({ phase: 'campagne', date: '2031-09-29' });
    expect(body.game.state.cycle.annee).toBe(2032);
    expect(body.game.state.historique.quinquennats).toHaveLength(1);
    const stored = await db.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(stored.phase).toBe('campagne');
    expect(stored.stateHash).toBe(hashState(body.game.state));

    // La campagne de 2032 avance ensuite comme celle de 2027.
    const next = AdvanceResponseSchema.parse(
      (await advanceVia(client, body.game, { expectedWeek: body.game.week })).json(),
    );
    expect(next.game.week).toBe(body.game.week + 1);
    expect(next.report.notices.every((n) => n.date >= '2031-10-06')).toBe(true);
  });
});
