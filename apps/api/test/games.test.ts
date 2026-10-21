import { hashState } from '@r2027/save-engine';
import {
  GameDetailSchema,
  GameSummarySchema,
  HealthResponseSchema,
  SaveSummarySchema,
  type GameDetail,
  type GameState,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

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

const candidate = {
  prenom: 'Camille',
  nom: 'Test',
  parti: 'Parti du test',
  positionnement: { economie: -10, societe: 20 },
};
const newGame = {
  name: 'Partie de test',
  mode: 'candidat_personnalise',
  seed: 'graine-test',
  candidate,
};

async function createGame(client: Client, body: object = newGame): Promise<GameDetail> {
  const response = await client.post('/api/games', body);
  expect(response.statusCode).toBe(201);
  return GameDetailSchema.parse(response.json());
}

/** Simule une progression (le moteur hebdomadaire arrive en phase 2) en écrivant un autre état. */
async function forceGameState(gameId: string, state: GameState): Promise<void> {
  await db.game.update({
    where: { id: gameId },
    data: { state, stateHash: hashState(state), week: state.meta.week, version: { increment: 1 } },
  });
}

describe('santé et session', () => {
  it('signale une base joignable et les versions', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toMatchObject({
      status: 'ok',
      database: 'ok',
    });
  });

  it('pose un cookie de session signé, HttpOnly et SameSite=Lax', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/session' });
    const cookie = response.cookies.find((c) => c.name === 'r2027_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.value).toContain('.'); // valeur signée
  });

  it('conserve la session puis ignore un cookie falsifié', async () => {
    const client = new Client(app);
    const first = (await client.get('/api/session')).json<{ userId: string }>();
    const second = (await client.get('/api/session')).json<{ userId: string }>();
    expect(second.userId).toBe(first.userId);

    const forged = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: `r2027_session=${first.userId}.signature-falsifiee` },
    });
    expect(forged.json<{ userId: string }>().userId).not.toBe(first.userId);
  });

  it('ajoute les en-têtes de sécurité', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('création de partie', () => {
  it('crée une partie dont l’état est valide et l’empreinte exacte', async () => {
    const client = new Client(app);
    const game = await createGame(client);
    expect(game).toMatchObject({
      name: 'Partie de test',
      mode: 'candidat_personnalise',
      difficulty: 'standard',
      week: 0,
      date: '2026-09-28',
      phase: 'campagne',
      seed: 'graine-test',
      version: 0,
    });
    expect(game.stateHash).toBe(hashState(game.state));
    expect(game.state.actors.joueur).toMatchObject({
      label: 'Campagne de Camille Test',
      candidate: { ...candidate, nature: 'personnalise', profilId: null },
    });
    const opponents = Object.values(game.state.actors).filter((a) => a.kind === 'adversaire');
    expect(opponents.length).toBeGreaterThan(0);
    expect(opponents.every((a) => a.candidate.nature === 'fictif')).toBe(true);

    const events = await db.gameEvent.findMany({ where: { gameId: game.id } });
    expect(events.map((e) => e.type)).toEqual(['partie_creee']);
    expect(events[0]!.payload).toMatchObject({ candidat: { nom: 'Test', parti: 'Parti du test' } });
  });

  it('applique le profil de départ choisi', async () => {
    const client = new Client(app);
    const base = await createGame(client);
    const civil = await createGame(client, {
      ...newGame,
      candidate: { ...candidate, profilId: 'societe-civile' },
    });
    expect(civil.state.actors.joueur!.resources.notoriete).toBeGreaterThan(
      base.state.actors.joueur!.resources.notoriete,
    );
  });

  it('est déterministe : même graine, même état', async () => {
    const client = new Client(app);
    const a = await createGame(client);
    const b = await createGame(client, { ...newGame, name: 'Autre' });
    expect(b.stateHash).toBe(a.stateHash);
  });

  it('génère une graine si le joueur n’en donne pas', async () => {
    const client = new Client(app);
    const a = await createGame(client, { name: 'A', mode: 'observateur' });
    const b = await createGame(client, { name: 'B', mode: 'observateur' });
    expect(a.seed).not.toBe(b.seed);
  });

  it('crée une partie dans un scénario de départ fictif (phase 7)', async () => {
    const client = new Client(app);
    const game = await createGame(client, { ...newGame, scenarioId: 'outsider' });
    expect(game.state.scenario).toBe('outsider');
    expect(game.state.consequences).toEqual([]);
    const standard = await createGame(client, { ...newGame, seed: game.seed });
    expect(standard.state.scenario).toBe('standard');
    expect(game.state.actors.joueur!.resources.budgetCentimes).toBeLessThan(
      standard.state.actors.joueur!.resources.budgetCentimes,
    );
  });

  it('liste les parties du joueur', async () => {
    const client = new Client(app);
    await createGame(client);
    const response = await client.get('/api/games');
    const list = GameSummarySchema.array().parse(response.json());
    expect(list).toHaveLength(1);
  });

  it.each([
    [{ ...newGame, name: '' }, 400, 'requete_invalide'],
    [{ ...newGame, mode: 'dictateur' }, 400, 'requete_invalide'],
    [{ ...newGame, champInconnu: 1 }, 400, 'requete_invalide'],
    [{ ...newGame, seed: 'graine avec espaces' }, 400, 'requete_invalide'],
    [{ ...newGame, startDate: '2026-09-29' }, 422, 'date_de_depart_invalide'],
    [{ ...newGame, mode: 'candidat_reel' }, 400, 'requete_invalide'],
    [
      { ...newGame, candidate: undefined, mode: 'candidat_reel', personnaliteId: 'reel-inconnu' },
      422,
      'personnalite_inconnue',
    ],
    [{ ...newGame, personnaliteId: 'reel-attal' }, 400, 'requete_invalide'],
    [{ ...newGame, adversaires: 'imaginaires' }, 400, 'requete_invalide'],
    [{ ...newGame, scenarioId: 'scenario-inconnu' }, 422, 'scenario_inconnu'],
    [{ ...newGame, scenarioId: 'Tempête !' }, 400, 'requete_invalide'],
    [{ ...newGame, candidate: undefined }, 400, 'requete_invalide'],
    [{ ...newGame, mode: 'observateur' }, 400, 'requete_invalide'],
    [{ ...newGame, candidate: { ...candidate, nom: '' } }, 400, 'requete_invalide'],
    [
      { ...newGame, candidate: { ...candidate, positionnement: { economie: 150, societe: 0 } } },
      400,
      'requete_invalide',
    ],
    [{ ...newGame, candidate: { ...candidate, profilId: 'inconnu' } }, 422, 'profil_inconnu'],
  ])('refuse une requête invalide (%j)', async (body, status, code) => {
    const response = await new Client(app).post('/api/games', body);
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
  });

  it('refuse les écritures qui ne sont pas en JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { 'content-type': 'text/plain' },
      payload: JSON.stringify(newGame),
    });
    expect(response.statusCode).toBe(415);
  });
});

describe('isolation entre joueurs', () => {
  it('un joueur ne voit ni ne modifie la partie d’un autre', async () => {
    const alice = new Client(app);
    const bob = new Client(app);
    const game = await createGame(alice);
    const save = SaveSummarySchema.parse(
      (await alice.post(`/api/games/${game.id}/saves`, { slot: 1 })).json(),
    );

    expect((await bob.get('/api/games')).json()).toEqual([]);
    expect((await bob.get(`/api/games/${game.id}`)).statusCode).toBe(404);
    expect((await bob.get(`/api/games/${game.id}/saves`)).statusCode).toBe(404);
    expect((await bob.post(`/api/games/${game.id}/saves`, { slot: 2 })).statusCode).toBe(404);
    expect((await bob.post(`/api/games/${game.id}/saves/${save.id}/restore`, {})).statusCode).toBe(
      404,
    );
  });

  it('rejette un identifiant mal formé', async () => {
    expect((await new Client(app).get('/api/games/pas-un-uuid')).statusCode).toBe(400);
  });
});

describe('sauvegardes', () => {
  it('crée, liste et protège les emplacements', async () => {
    const client = new Client(app);
    const game = await createGame(client);
    const url = `/api/games/${game.id}/saves`;

    const first = await client.post(url, { slot: 1, label: 'Avant le meeting' });
    expect(first.statusCode).toBe(201);
    expect(SaveSummarySchema.parse(first.json())).toMatchObject({
      kind: 'manuelle',
      slot: 1,
      label: 'Avant le meeting',
      stateHash: game.stateHash,
    });

    const occupied = await client.post(url, { slot: 1 });
    expect(occupied.statusCode).toBe(409);
    expect(occupied.json()).toMatchObject({ error: { code: 'emplacement_occupe' } });

    expect((await client.post(url, { slot: 1, overwrite: true })).statusCode).toBe(201);
    expect((await client.post(url, { slot: 2 })).statusCode).toBe(201);
    expect((await client.post(url, { slot: 6 })).statusCode).toBe(400);

    const list = SaveSummarySchema.array().parse((await client.get(url)).json());
    expect(list.map((s) => s.slot)).toEqual([1, 2]);
  });

  it('restaure une sauvegarde sans perte (empreinte identique)', async () => {
    const client = new Client(app);
    const game = await createGame(client);
    const save = SaveSummarySchema.parse(
      (await client.post(`/api/games/${game.id}/saves`, { slot: 1 })).json(),
    );

    const later: GameState = {
      ...game.state,
      meta: { ...game.state.meta, week: 5, date: '2026-11-02' },
    };
    await forceGameState(game.id, later);
    const moved = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    expect(moved.week).toBe(5);

    const response = await client.post(`/api/games/${game.id}/saves/${save.id}/restore`, {
      expectedVersion: moved.version,
    });
    expect(response.statusCode).toBe(200);
    const restored = GameDetailSchema.parse(response.json());
    expect(restored.state).toEqual(game.state);
    expect(restored.stateHash).toBe(game.stateHash);
    expect(restored.week).toBe(0);
    expect(restored.version).toBe(moved.version + 1);

    // Reprise après « fermeture » : relecture depuis la base par un nouveau serveur.
    const freshApp = await testApp(db);
    const reread = await freshApp.inject({
      method: 'GET',
      url: `/api/games/${game.id}`,
      headers: { cookie: client.sessionCookie! },
    });
    await freshApp.close();
    expect(GameDetailSchema.parse(reread.json()).stateHash).toBe(game.stateHash);

    const events = await db.gameEvent.findMany({
      where: { gameId: game.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual([
      'partie_creee',
      'sauvegarde_creee',
      'sauvegarde_restauree',
    ]);
  });

  it('refuse une restauration sur une version périmée', async () => {
    const client = new Client(app);
    const game = await createGame(client);
    const save = SaveSummarySchema.parse(
      (await client.post(`/api/games/${game.id}/saves`, { slot: 1 })).json(),
    );
    await forceGameState(game.id, { ...game.state, meta: { ...game.state.meta, week: 1 } });

    const response = await client.post(`/api/games/${game.id}/saves/${save.id}/restore`, {
      expectedVersion: game.version,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'conflit_de_version' } });
  });

  it('détecte une sauvegarde corrompue sans modifier la partie', async () => {
    const client = new Client(app);
    const game = await createGame(client);
    const save = SaveSummarySchema.parse(
      (await client.post(`/api/games/${game.id}/saves`, { slot: 1 })).json(),
    );
    await forceGameState(game.id, { ...game.state, meta: { ...game.state.meta, week: 3 } });
    await db.gameSave.update({
      where: { id: save.id },
      data: { state: { ...game.state, meta: { ...game.state.meta, week: 99 } } },
    });

    const response = await client.post(`/api/games/${game.id}/saves/${save.id}/restore`, {});
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'etat_corrompu' } });
    const after = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    expect(after.week).toBe(3);
  });
});

describe('historique immuable', () => {
  it('interdit la modification des événements en base', async () => {
    const game = await createGame(new Client(app));
    const event = await db.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
    await expect(
      db.gameEvent.update({ where: { id: event.id }, data: { type: 'falsifie' } }),
    ).rejects.toThrow(/Historique immuable/);
  });
});

describe('durcissement (phase 8)', () => {
  it('une lecture sans session ne crée aucun utilisateur ni cookie', async () => {
    const before = await db.user.count();
    const list = await app.inject({ method: 'GET', url: '/api/games' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([]);
    expect(list.cookies).toHaveLength(0);
    const game = await app.inject({ method: 'GET', url: `/api/games/${crypto.randomUUID()}` });
    expect(game.statusCode).toBe(404);
    expect(await db.user.count()).toBe(before);
  });

  it('refuse un caractère nul plutôt qu’une erreur interne', async () => {
    const client = new Client(app);
    const response = await client.post('/api/games', {
      name: 'Nul\u0000',
      mode: 'observateur',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('requete_invalide');
  });

  it('limite à part les écritures coûteuses', async () => {
    const limited = await testApp(db, { RATE_LIMIT_WRITE_MAX: 2 });
    const client = new Client(limited);
    const codes: number[] = [];
    for (let i = 0; i < 3; i++)
      codes.push(
        (await client.post('/api/games', { name: `P${i}`, mode: 'observateur' })).statusCode,
      );
    // Les lectures restent sous la limite générale.
    codes.push((await client.get('/api/games')).statusCode);
    await limited.close();
    expect(codes).toEqual([201, 201, 429, 200]);
  });
});

describe('limitation de débit', () => {
  it('répond 429 au-delà du plafond', async () => {
    const limited = await testApp(db, { RATE_LIMIT_MAX: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await limited.inject({ method: 'GET', url: '/api/health' })).statusCode);
    }
    await limited.close();
    expect(codes).toEqual([200, 200, 200, 429]);
  });
});
