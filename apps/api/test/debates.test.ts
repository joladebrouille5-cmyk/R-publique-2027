import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import {
  AdvanceResponseSchema,
  ApiErrorSchema,
  debateAwaitingPlayer,
  GameDetailSchema,
  type GameDetail,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

// Phase 10 : débats télévisés à travers l'API réelle et PostgreSQL (même contrat que le moteur
// local de l'application Android).

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const departements = Object.keys(ruleset.parrainages.reservoir.departements).sort();
const candidate = { nom: 'Débat', parti: 'Parti', positionnement: { economie: 0, societe: 0 } };
const closing = ruleset.calendrier.echeances.find((e) => e.id === 'presentation-candidatures')!;
let db: Database;
let app: FastifyInstance;
let keys = 0;

beforeAll(async () => {
  db = testDatabase();
  app = await testApp(db);
  await resetDatabase(db);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const code = (response: { json: () => unknown }) =>
  ApiErrorSchema.parse(response.json()).error.code;

/** Partie avec parrainages, menée jusqu'à la semaine du débat de tous les candidats. */
async function untilDebate(client: Client): Promise<GameDetail> {
  const created = await client.post('/api/games', {
    name: 'Débat',
    mode: 'candidat_personnalise',
    seed: 'debat-api',
    candidate,
  });
  expect(created.statusCode).toBe(201);
  let game = GameDetailSchema.parse(created.json());
  for (let i = 0; i < 40; i++) {
    if (game.state.debats.seances.some((d) => d.id === 'debat-t1-tous' && d.semaine === game.week))
      break;
    const actions =
      game.date < closing.date
        ? [0, 1].map((k) => ({
            actionId: 'elus-locaux',
            cible: departements[(game.week * 2 + k) % departements.length]!,
          }))
        : [];
    const response = await client.request({
      method: 'POST',
      url: `/api/games/${game.id}/advance`,
      headers: { 'idempotency-key': `cle-debat-${++keys}` },
      payload: {
        expectedWeek: game.week,
        actions,
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    game = AdvanceResponseSchema.parse(response.json()).game;
  }
  return game;
}

describe('débats télévisés (API)', () => {
  it('ouvre, joue une carte, simule la fin et persiste le débat ; erreurs du contrat', async () => {
    const client = new Client(app);
    const game = await untilDebate(client);
    const debate = game.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!;
    expect(debate.invites).toContain(game.state.player.actorId);
    const url = `/api/games/${game.id}/debats/debat-t1-tous`;

    // Ouvrir un débat déjà programmé n'écrit rien.
    const opened = await client.post(url, { action: 'ouvrir' });
    expect(opened.statusCode).toBe(200);
    expect(GameDetailSchema.parse(opened.json()).version).toBe(game.version);

    // Erreurs : débat inconnu, séquence périmée, carte non proposée, requête invalide.
    const unknown = await client.post(`/api/games/${game.id}/debats/debat-inexistant`, {
      action: 'ouvrir',
    });
    expect(unknown.statusCode).toBe(404);
    expect(code(unknown)).toBe('debat_introuvable');
    const stale = await client.post(url, { action: 'jouer', sequence: 4, carte: 'defendre' });
    expect(stale.statusCode).toBe(409);
    expect(code(stale)).toBe('sequence_perimee');
    const offered = new Set(debate.enCours!.cartes.map((c) => c.carte));
    const missing = ['defendre', 'repondre', 'hauteur', 'petite-phrase'].find(
      (c) => !offered.has(c as never),
    )!;
    const invalid = await client.post(url, { action: 'jouer', sequence: 0, carte: missing });
    expect(invalid.statusCode).toBe(422);
    expect(code(invalid)).toBe('carte_invalide');
    const malformed = await client.post(url, { action: 'danser' });
    expect(malformed.statusCode).toBe(400);
    expect(code(malformed)).toBe('requete_invalide');

    // Une carte, puis la fin simulée.
    const played = await client.post(url, {
      action: 'jouer',
      sequence: 0,
      carte: debate.enCours!.cartes[0]!.carte,
    });
    expect(played.statusCode).toBe(200);
    const afterOne = GameDetailSchema.parse(played.json());
    expect(afterOne.version).toBe(game.version + 1);
    const session = afterOne.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!;
    expect(session.sequences).toHaveLength(1);
    expect(session.statut).toBe('en_cours');
    const finished = await client.post(url, { action: 'finir', sequence: 1 });
    expect(finished.statusCode).toBe(200);
    const done = GameDetailSchema.parse(finished.json());
    expect(done.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!.statut).toBe('termine');
    const replay = await client.post(url, { action: 'finir', sequence: 1 });
    expect(replay.statusCode).toBe(409);
    expect(code(replay)).toBe('debat_termine');

    // Relu depuis la base, à l'identique.
    const reread = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    expect(reread.stateHash).toBe(done.stateHash);
    // Une autre session ne voit pas la partie.
    const stranger = await new Client(app).post(url, { action: 'ouvrir' });
    expect(stranger.statusCode).toBe(404);
  });
});

describe('débat obligatoire (phase 17)', () => {
  const advance = (client: Client, game: GameDetail, extra: object = {}) =>
    client.request({
      method: 'POST',
      url: `/api/games/${game.id}/advance`,
      headers: { 'idempotency-key': `cle-debat-${++keys}` },
      payload: {
        expectedWeek: game.week,
        actions: [],
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
        ...extra,
      },
    });

  it('arrête l’avance rapide avant le débat et refuse la semaine tant qu’il n’est pas joué', async () => {
    const client = new Client(app);
    const created = await client.post('/api/games', {
      name: 'Débat obligatoire',
      mode: 'candidat_personnalise',
      seed: 'debat-api',
      candidate,
    });
    let game = GameDetailSchema.parse(created.json());
    while (game.date < closing.date) {
      const actions = [0, 1].map((k) => ({
        actionId: 'elus-locaux',
        cible: departements[(game.week * 2 + k) % departements.length]!,
      }));
      const response = await advance(client, game, { actions });
      expect(response.statusCode, response.body).toBe(200);
      game = AdvanceResponseSchema.parse(response.json()).game;
    }
    let stop: string | null = null;
    for (let i = 0; i < 20 && stop !== 'debat'; i++) {
      const response = await advance(client, game, { semaines: 52 });
      expect(response.statusCode, response.body).toBe(200);
      const body = AdvanceResponseSchema.parse(response.json());
      game = body.game;
      stop = body.avanceRapide!.arret;
    }
    expect(stop).toBe('debat');
    const debate = debateAwaitingPlayer(game.state)!;
    expect(debate.invites).toContain(game.state.player.actorId);

    const refused = await advance(client, game);
    expect(refused.statusCode).toBe(422);
    expect(code(refused)).toBe('debat_requis');

    const finished = await client.post(`/api/games/${game.id}/debats/${debate.id}`, {
      action: 'finir',
      sequence: debate.enCours!.index,
    });
    expect(finished.statusCode).toBe(200);
    game = GameDetailSchema.parse(finished.json());
    const next = await advance(client, game);
    expect(next.statusCode, next.body).toBe(200);
    expect(AdvanceResponseSchema.parse(next.json()).game.week).toBe(game.week + 1);
  }, 60_000);
});
