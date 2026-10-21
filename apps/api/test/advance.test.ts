import { advanceWeek, createGame } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { canonicalStringify, hashState, sha256 } from '@r2027/save-engine';
import {
  AdvanceResponseSchema,
  ExportDocumentSchema,
  GameDetailSchema,
  JournalPageSchema,
  RulesetSchema,
  type GameDetail,
  type GameState,
} from '@r2027/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db';
import V2 from '../../../packages/save-engine/src/fixtures/v2-phase-2.json' with { type: 'json' };
import { AUTO_SAVE_RETENTION } from '../src/services/saves';
import { Client, resetDatabase, testApp, testDatabase } from './helpers';

const ruleset = getRuleset(CURRENT_RULESET_KEY);
let db: Database;
let app: FastifyInstance;
let keyCounter = 0;
const newKey = () => `cle-test-${++keyCounter}-${Date.now()}`;

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
  positionnement: { economie: 0, societe: 0 },
};

async function createGameVia(
  client: Client,
  body: Record<string, unknown> = {},
): Promise<GameDetail> {
  const response = await client.post('/api/games', {
    name: 'Campagne',
    mode: 'candidat_personnalise',
    seed: 'graine-test',
    ...(body.mode === 'observateur' ? {} : { candidate }),
    ...body,
  });
  expect(response.statusCode).toBe(201);
  return GameDetailSchema.parse(response.json());
}

function advanceVia(client: Client, game: Pick<GameDetail, 'id'>, body: object, key = newKey()) {
  return client.request({
    method: 'POST',
    url: `/api/games/${game.id}/advance`,
    payload: body as never,
    headers: { 'idempotency-key': key },
  });
}

/** Avance en répondant aux décisions en attente par l'option par défaut. */
async function advanceDefault(client: Client, game: GameDetail, actions: string[] = []) {
  const response = await advanceVia(client, game, {
    expectedWeek: game.week,
    actions: actions.map((actionId) => ({ actionId })),
    decisions: game.state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    })),
  });
  expect(response.statusCode).toBe(200);
  return AdvanceResponseSchema.parse(response.json());
}

async function forceState(gameId: string, state: GameState) {
  await db.game.update({
    where: { id: gameId },
    data: { state, stateHash: hashState(state), week: state.meta.week, version: { increment: 1 } },
  });
}

describe('progression hebdomadaire', () => {
  it('avance d’une semaine et enregistre actions, journal, événements et sauvegarde', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const { game: next, report } = await advanceDefault(client, game, ['meeting', 'inexistante']);

    expect(next).toMatchObject({ week: 1, date: '2026-10-05', version: game.version + 1 });
    expect(report).toMatchObject({ week: 0, nextWeek: 1 });
    const meeting = ruleset.actions.find((a) => a.id === 'meeting')!;
    expect(next.state.actors.joueur!.resources.budgetCentimes).toBe(
      game.state.actors.joueur!.resources.budgetCentimes - meeting.cout.budgetCentimes,
    );

    const actions = await db.gameAction.findMany({
      where: { gameId: game.id, actorId: 'joueur' },
      orderBy: { position: 'asc' },
    });
    expect(actions.map((a) => [a.type, a.status])).toEqual([
      ['meeting', 'validee'],
      ['inexistante', 'rejetee'],
    ]);
    // Les actions des adversaires sont enregistrées sous leur propre identifiant.
    const opponents = await db.gameAction.findMany({
      where: { gameId: game.id, actorId: { not: 'joueur' } },
    });
    expect(opponents.length).toBe(report.actions.length - 2);
    expect(opponents.every((a) => a.actorId.startsWith('adv-'))).toBe(true);
    // Sondages publiés : journalisés avec la nature « sondage ».
    const polls = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'sondage_publie' },
    });
    expect(polls).toHaveLength(report.polls.length);
    expect(polls.every((p) => p.nature === 'sondage')).toBe(true);
    const logs = await db.simulationLog.findMany({
      where: { gameId: game.id },
      orderBy: { step: 'asc' },
    });
    expect(logs.map((l) => l.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const events = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'semaine_resolue' },
    });
    expect(events).toHaveLength(1);
    const autos = await db.gameSave.findMany({ where: { gameId: game.id, kind: 'auto' } });
    expect(autos.map((s) => [s.week, s.stateHash])).toEqual([[1, next.stateHash]]);
  });

  it('est idempotent : même clé et même requête ⇒ une seule progression', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const body = { expectedWeek: 0, actions: [{ actionId: 'interview' }], decisions: [] };
    const key = newKey();
    const first = await advanceVia(client, game, body, key);
    const second = await advanceVia(client, game, body, key);
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.json()).toEqual(first.json());
    expect(await db.gameAdvance.count({ where: { gameId: game.id } })).toBe(1);

    const reused = await advanceVia(client, game, { ...body, actions: [] }, key);
    expect(reused.statusCode).toBe(422);
    expect(reused.json()).toMatchObject({ error: { code: 'cle_idempotence_reutilisee' } });
  });

  it('refuse une semaine périmée et départage deux envois simultanés', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const body = { expectedWeek: 0, actions: [], decisions: [] };
    const [a, b] = await Promise.all([
      advanceVia(client, game, body),
      advanceVia(client, game, body),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(['semaine_perimee', 'conflit_de_version']).toContain(loser.json().error.code);
    expect(await db.gameAdvance.count({ where: { gameId: game.id } })).toBe(1);

    const stale = await advanceVia(client, game, body);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: 'semaine_perimee' } });
  });

  it('rejoue la réponse pour deux envois simultanés de la même requête', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const body = { expectedWeek: 0, actions: [], decisions: [] };
    const key = newKey();
    const [a, b] = await Promise.all([
      advanceVia(client, game, body, key),
      advanceVia(client, game, body, key),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json()).toEqual(b.json());
    const game2 = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    expect(game2.week).toBe(1);
  });

  it('exige une clé d’idempotence valide et refuse les actions d’un observateur', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const noKey = await client.post(`/api/games/${game.id}/advance`, { expectedWeek: 0 });
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json()).toMatchObject({ error: { code: 'cle_idempotence_requise' } });

    const observer = await createGameVia(client, { mode: 'observateur' });
    const refused = await advanceVia(client, observer, {
      expectedWeek: 0,
      actions: [{ actionId: 'meeting' }],
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ error: { code: 'actions_interdites' } });
  });

  it('exige les décisions en attente puis les applique', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const state: GameState = {
      ...game.state,
      pendingDecisions: [
        {
          id: 'd-0-polemique-reseaux',
          kind: 'evenement',
          eventId: 'polemique-reseaux',
          actorId: 'joueur',
          createdWeek: 0,
          label: 'Polémique sur les réseaux sociaux',
          description: 'Test',
          options: [
            { id: 'repondre', libelle: 'Répondre', description: 'x' },
            { id: 'excuses', libelle: 'Excuses', description: 'x' },
          ],
          defaultOptionId: 'repondre',
        },
      ],
    };
    await forceState(game.id, state);
    const missing = await advanceVia(client, game, { expectedWeek: 0 });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({ error: { code: 'decision_requise' } });

    const answered = await advanceVia(client, game, {
      expectedWeek: 0,
      decisions: [{ decisionId: 'd-0-polemique-reseaux', optionId: 'excuses' }],
    });
    expect(answered.statusCode).toBe(200);
    expect(AdvanceResponseSchema.parse(answered.json()).report.decisions).toMatchObject([
      { optionId: 'excuses', automatic: false },
    ]);
  });

  it('simule le premier tour la semaine du scrutin et sauvegarde l’état d’avant', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    let state = game.state;
    while (state.meta.week < 28) {
      const decisions = state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      state = advanceWeek(state, { actions: [], decisions }, { ruleset }).state;
    }
    await forceState(game.id, state);
    const current = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    const { report, game: next } = await advanceDefault(client, current);

    expect(report.election).toMatchObject({
      round: 1,
      scrutinId: 'presidentielle-2027-t1',
      nature: 'simule',
    });
    expect(next.phase).toBe('entre_deux_tours');
    const results = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'resultat_scrutin' },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.nature).toBe('simule');
    const before = await db.gameSave.findMany({
      where: { gameId: game.id, kind: 'avant_evenement' },
    });
    expect(before.map((s) => [s.label, s.week, s.stateHash])).toEqual([
      ['Avant le premier tour', 28, current.stateHash],
    ]);
  });

  it('bloque la progression à la fin de la présidentielle', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    await forceState(game.id, {
      ...game.state,
      calendar: {
        blockedBy: 'fin-de-la-presidentielle',
        blockedMessage: 'La suite arrive en phase 6.',
      },
    });
    const response = await advanceVia(client, game, { expectedWeek: 0 });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'progression_bloquee', message: 'La suite arrive en phase 6.' },
    });
  });
});

describe('sauvegardes automatiques', () => {
  it('sauvegarde l’état d’avant un événement majeur', async () => {
    const CANDIDATE = candidate;
    const seed = Array.from({ length: 2000 }, (_, i) => `majeur-${i}`).find((candidate) => {
      const state = createGame(
        {
          seed: candidate,
          mode: 'candidat_personnalise',
          difficulty: 'standard',
          candidate: CANDIDATE,
        },
        ruleset,
      );
      return advanceWeek(state, { actions: [], decisions: [] }, { ruleset }).majorEvent;
    });
    expect(seed).toBeDefined();
    const client = new Client(app);
    const game = await createGameVia(client, { seed });
    const { report } = await advanceDefault(client, game);
    expect(report.events.some((e) => e.majeur)).toBe(true);
    const before = await db.gameSave.findMany({
      where: { gameId: game.id, kind: 'avant_evenement' },
    });
    expect(before.map((s) => [s.week, s.stateHash])).toEqual([[0, game.stateHash]]);
  });

  it(`ne conserve que les ${AUTO_SAVE_RETENTION} dernières sauvegardes hebdomadaires`, async () => {
    const client = new Client(app);
    let game = await createGameVia(client);
    for (let i = 0; i < AUTO_SAVE_RETENTION + 2; i++)
      game = (await advanceDefault(client, game)).game;
    const autos = await db.gameSave.findMany({
      where: { gameId: game.id, kind: 'auto' },
      orderBy: { week: 'asc' },
    });
    expect(autos).toHaveLength(AUTO_SAVE_RETENTION);
    expect(autos.at(-1)!.week).toBe(AUTO_SAVE_RETENTION + 2);
  });
});

describe('déterminisme de bout en bout', () => {
  it('deux parties de même graine et mêmes actions restent identiques', async () => {
    const client = new Client(app);
    let a = await createGameVia(client, { name: 'A' });
    let b = await createGameVia(client, { name: 'B' });
    const plans = [['meeting', 'collecte'], ['tournee'], [], ['recrutement', 'interview']];
    for (const plan of plans) {
      a = (await advanceDefault(client, a, plan)).game;
      b = (await advanceDefault(client, b, plan)).game;
      expect(b.stateHash).toBe(a.stateHash);
    }
  });
});

describe('journal', () => {
  it('liste les semaines résolues et les événements techniques, du plus récent au plus ancien', async () => {
    const client = new Client(app);
    let game = await createGameVia(client);
    game = (await advanceDefault(client, game, ['meeting'])).game;
    game = (await advanceDefault(client, game)).game;

    const page1 = JournalPageSchema.parse(
      (await client.get(`/api/games/${game.id}/journal?limit=2`)).json(),
    );
    expect(page1.entries.map((e) => [e.type, e.week])).toEqual([
      ['semaine_resolue', 1],
      ['semaine_resolue', 0],
    ]);
    expect(page1.entries[1]!.report!.actions[0]).toMatchObject({ actionId: 'meeting' });
    expect(page1.nextBefore).not.toBeNull();

    const page2 = JournalPageSchema.parse(
      (
        await client.get(
          `/api/games/${game.id}/journal?limit=2&before=${encodeURIComponent(page1.nextBefore!)}`,
        )
      ).json(),
    );
    expect(page2.entries.map((e) => e.type)).toEqual(['partie_creee']);
    expect(page2.nextBefore).toBeNull();
  });
});

describe('export et import', () => {
  it('exporte un fichier et l’importe dans une nouvelle partie sans perte', async () => {
    const alice = new Client(app);
    let game = await createGameVia(alice, { name: 'Ma campagne' });
    game = (await advanceDefault(alice, game, ['meeting'])).game;

    const exported = await alice.get(`/api/games/${game.id}/export`);
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toBe(
      'attachment; filename="republique-2027-ma-campagne-semaine-1.json"',
    );
    const document = ExportDocumentSchema.parse(exported.json());

    const bob = new Client(app);
    const imported = await bob.post('/api/games/import', document);
    expect(imported.statusCode).toBe(201);
    const copy = GameDetailSchema.parse(imported.json());
    expect(copy.id).not.toBe(game.id);
    expect(copy).toMatchObject({
      name: 'Ma campagne (importée)',
      week: 1,
      stateHash: game.stateHash,
    });
    expect(copy.state).toEqual(game.state);
    expect((await bob.get(`/api/games/${copy.id}/saves`)).json()).toMatchObject([
      { kind: 'import' },
    ]);

    // La partie d'origine est intacte et la copie se joue exactement pareil.
    const original = GameDetailSchema.parse((await alice.get(`/api/games/${game.id}`)).json());
    expect(original.version).toBe(game.version);
    const nextA = (await advanceDefault(alice, original, ['tournee'])).game;
    const nextB = (await advanceDefault(bob, copy, ['tournee'])).game;
    expect(nextB.stateHash).toBe(nextA.stateHash);
  });

  it('refuse un fichier corrompu sans rien créer', async () => {
    const client = new Client(app);
    const game = await createGameVia(client);
    const document = ExportDocumentSchema.parse(
      (await client.get(`/api/games/${game.id}/export`)).json(),
    );
    const before = await db.game.count();

    const state = document.state as GameState;
    const tampered = { ...document, state: { ...state, meta: { ...state.meta, week: 12 } } };
    const response = await client.post('/api/games/import', tampered);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'empreinte_incoherente' } });

    const garbage = await client.post('/api/games/import', { bonjour: 'monde' });
    expect(garbage.statusCode).toBe(422);
    expect(garbage.json()).toMatchObject({ error: { code: 'format_inconnu' } });
    expect(await db.game.count()).toBe(before);
  });
});

describe('migration des parties des phases 1 et 2', () => {
  const V1_STATE = {
    meta: {
      seed: 'phase-1',
      week: 0,
      date: '2026-09-28',
      startDate: '2026-09-28',
      phase: 'campagne',
      difficulty: 'expert',
      engineVersion: '0.1.0',
      rulesetVersion: 'socle@0.1.0',
      saveSchemaVersion: 1,
    },
    rng: { algorithm: 'sfc32', state: [2192868698, 897309963, 1850546000, 13] },
    player: { mode: 'candidat_personnalise', actorId: null },
  };
  const V1_HASH = sha256(canonicalStringify(V1_STATE));

  it('migre une partie au format 1 à la lecture, une seule fois', async () => {
    const client = new Client(app);
    const game = await createGameVia(client, { seed: 'phase-1', difficulty: 'expert' });
    await db.game.update({
      where: { id: game.id },
      data: {
        state: V1_STATE,
        stateHash: V1_HASH,
        saveSchemaVersion: 1,
        engineVersion: '0.1.0',
        rulesetVersion: 'socle@0.1.0',
      },
    });

    const migrated = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    expect(migrated).toMatchObject({ saveSchemaVersion: 5, rulesetVersion: CURRENT_RULESET_KEY });
    expect(migrated.state.actors.joueur).toBeDefined();
    await client.get(`/api/games/${game.id}`);
    const events = await db.gameEvent.findMany({
      where: { gameId: game.id, type: 'migration_de_sauvegarde' },
    });
    expect(events).toHaveLength(1);
    expect((await advanceDefault(client, migrated)).game.week).toBe(1);
  });

  it('restaure une sauvegarde manuelle au format 1 en la migrant', async () => {
    const client = new Client(app);
    const game = await createGameVia(client, { seed: 'phase-1', difficulty: 'expert' });
    const save = await db.gameSave.create({
      data: {
        gameId: game.id,
        kind: 'manuelle',
        slot: 3,
        week: 0,
        date: new Date('2026-09-28T00:00:00.000Z'),
        state: V1_STATE,
        stateHash: V1_HASH,
        engineVersion: '0.1.0',
        saveSchemaVersion: 1,
      },
    });
    const restored = await client.post(`/api/games/${game.id}/saves/${save.id}/restore`, {});
    expect(restored.statusCode).toBe(200);
    expect(GameDetailSchema.parse(restored.json()).saveSchemaVersion).toBe(5);
  });

  it('migre une partie réelle de la phase 2 et la rend jouable', async () => {
    const client = new Client(app);
    const game = await createGameVia(client, { seed: 'phase-2' });
    await db.game.update({
      where: { id: game.id },
      data: {
        state: V2.state,
        stateHash: V2.stateHash,
        saveSchemaVersion: 2,
        engineVersion: '0.2.0',
        rulesetVersion: 'presidentielle-2027@1.0.0',
        week: 20,
      },
    });
    const migrated = GameDetailSchema.parse((await client.get(`/api/games/${game.id}`)).json());
    expect(migrated).toMatchObject({
      week: 20,
      saveSchemaVersion: 5,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(migrated.state.actors.joueur!.resources).toEqual(V2.state.actors.joueur.resources);
    const { report } = await advanceDefault(client, migrated);
    expect(report.decisions).toHaveLength(1);
    expect(report.intentions).not.toBeNull();
  });
});

describe('jeu de règles', () => {
  it('sert le jeu de règles d’une partie et refuse une clé inconnue', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/rulesets/${CURRENT_RULESET_KEY}`,
    });
    expect(response.statusCode).toBe(200);
    expect(RulesetSchema.parse(response.json()).id).toBe('presidentielle-2027');
    const current = await app.inject({ method: 'GET', url: '/api/rulesets/courant' });
    expect(RulesetSchema.parse(current.json()).version).toBe(ruleset.version);
    expect(
      (await app.inject({ method: 'GET', url: '/api/rulesets/inconnu@0.0.0' })).statusCode,
    ).toBe(404);
  });
});
