import { meetsThreshold, PLAYER_ACTOR_ID } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import {
  AdvanceResponseSchema,
  GameDetailSchema,
  type AdvanceResponse,
  type GameDetail,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

// Phase 5 : plan hebdomadaire étendu (cibles, programme, propositions d'alliance) et
// parrainages jusqu'à la clôture, à travers l'API réelle et PostgreSQL.

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const departements = Object.keys(ruleset.parrainages.reservoir.departements).sort();
const candidate = { nom: 'Campagne', parti: 'Parti', positionnement: { economie: 0, societe: 0 } };
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

async function newGame(client: Client, mode = 'candidat_personnalise'): Promise<GameDetail> {
  const response = await client.post('/api/games', {
    name: 'Campagne',
    mode,
    seed: 'campagne-api',
    ...(mode === 'candidat_personnalise' ? { candidate } : {}),
  });
  expect(response.statusCode).toBe(201);
  return GameDetailSchema.parse(response.json());
}

async function advance(client: Client, game: GameDetail, body: Record<string, unknown> = {}) {
  return client.request({
    method: 'POST',
    url: `/api/games/${game.id}/advance`,
    headers: { 'idempotency-key': `cle-campagne-${++keys}` },
    payload: {
      expectedWeek: game.week,
      decisions: game.state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
      ...body,
    },
  });
}

async function advanceOk(client: Client, game: GameDetail, body: Record<string, unknown> = {}) {
  const response = await advance(client, game, body);
  expect(response.statusCode).toBe(200);
  return AdvanceResponseSchema.parse(response.json());
}

describe('plan hebdomadaire de la phase 5', () => {
  it('annonce des propositions et refuse, avec motif, celle dont la dépendance manque', async () => {
    const client = new Client(app);
    const game = await newGame(client);
    const { game: next, report } = await advanceOk(client, game, {
      programme: { ajouter: ['pa-prime-partage-valeur', 'emploi-garantie-emploi'], retirer: [] },
    });
    expect(next.state.actors[PLAYER_ACTOR_ID]!.programme.propositions).toEqual([
      'pa-prime-partage-valeur',
    ]);
    expect(report.programme[0]!.refusees).toEqual([
      {
        id: 'emploi-garantie-emploi',
        motif: expect.stringMatching(/suppose d'abord/),
      },
    ]);
  });

  it('enregistre les actions ciblées avec leur cible, et refuse une requête mal formée', async () => {
    const client = new Client(app);
    const game = await newGame(client);
    const { report } = await advanceOk(client, game, {
      actions: [
        { actionId: 'elus-locaux', cible: '974' },
        { actionId: 'interview', cible: 'france-inter' },
        { actionId: 'emission-politique', cible: 'emi-le-grand-jury' },
      ],
    });
    const mine = report.actions.filter((a) => a.actorId === PLAYER_ACTOR_ID);
    expect(mine.map((a) => [a.status, a.cible])).toEqual([
      ['validee', 'La Réunion (974)'],
      ['validee', 'France Inter'],
      ['validee', 'Le Grand Jury (RTL)'],
    ]);
    const rows = await db.gameAction.findMany({
      where: { gameId: game.id, actorId: PLAYER_ACTOR_ID },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => (r.payload as { cible: string }).cible)).toEqual([
      'La Réunion (974)',
      'France Inter',
      'Le Grand Jury (RTL)',
    ]);

    const bad = await advance(client, game, {
      programme: { ajouter: [42], retirer: [] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('une proposition de ralliement hors de la fenêtre reste sans suite', async () => {
    const client = new Client(app);
    const game = await newGame(client);
    const { report } = await advanceOk(client, game, { alliances: { proposer: ['adv-agora'] } });
    expect(report.relations.some((r) => /sans suite/.test(r.libelle))).toBe(true);
    expect(report.alliances).toEqual([]);
  });

  it('refuse toute action de campagne en mode observateur', async () => {
    const client = new Client(app);
    const game = await newGame(client, 'observateur');
    const response = await advance(client, game, { programme: { ajouter: ['ret-age-62'] } });
    expect(response.statusCode).toBe(422);
    const { game: next, report } = await advanceOk(client, game);
    expect(report.strategies.length).toBeGreaterThan(0);
    for (const actor of Object.values(next.state.actors)) expect(actor.strategie).not.toBeNull();
  });
});

describe('parrainages jusqu’à la clôture', () => {
  it('arrête la liste des candidats, sauvegarde avant, et y inscrit le joueur parrainé', async () => {
    const client = new Client(app);
    let game = await newGame(client);
    let closing: AdvanceResponse['report'] | null = null;
    while (game.state.meta.phase === 'campagne' && closing === null) {
      const week = game.week;
      const { game: next, report } = await advanceOk(client, game, {
        actions: [0, 1].map((k) => ({
          actionId: 'elus-locaux',
          cible: departements[(week * 2 + k) % departements.length],
        })),
      });
      if (report.events.some((e) => e.refId === 'liste-des-candidats')) closing = report;
      game = next;
    }
    expect(closing!.date).toBe('2027-03-08');
    const player = game.state.actors[PLAYER_ACTOR_ID]!;
    expect(player.status).toBe('candidat');
    expect(meetsThreshold(player.parrainages, ruleset)).toBe(true);
    expect(player.finances.recettes.avance).toBe(ruleset.finances.avanceForfaitaireCentimes);
    const saves = await db.gameSave.findMany({
      where: { gameId: game.id, kind: 'avant_evenement' },
    });
    expect(saves.map((s) => s.label)).toContain('Avant la clôture des parrainages');
    // Après la clôture, les rencontres d'élus n'apportent plus de présentation.
    const { report } = await advanceOk(client, game, {
      actions: [{ actionId: 'elus-locaux', cible: '01' }],
    });
    expect(report.parrainages.find((p) => p.actorId === PLAYER_ACTOR_ID)?.validees ?? 0).toBe(0);
  });
});
