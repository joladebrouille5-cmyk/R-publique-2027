import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import {
  AdvanceResponseSchema,
  ApiErrorSchema,
  CommuneResultsResponseSchema,
  debateAwaitingPlayer,
  DIFFICULTIES,
  GameDetailSchema,
  GameSummarySchema,
  HealthResponseSchema,
  JournalPageSchema,
  SaveSummarySchema,
  SupportProspectsSchema,
  type GameDetail,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { LocalGeo } from './geo';
import { IndexedDbStore } from './indexeddb-store';
import {
  ADVANCE_REPLAY_RETENTION,
  AUTO_SAVE_RETENTION,
  LocalApi,
  type LocalResponse,
} from './server';
import { MemoryStore, type Store } from './store';

// Phase 8 : serveur local de l'application mobile (même contrat que l'API, hors ligne).

const DEMO = join(dirname(fileURLToPath(import.meta.url)), '../../data-import/demo/cog-2026');
const geo = await LocalGeo.load(async (name) =>
  JSON.parse(await readFile(join(DEMO, name), 'utf8')),
);

const candidate = {
  prenom: 'Camille',
  nom: 'Local',
  parti: 'Parti hors ligne',
  positionnement: { economie: 0, societe: 0 },
};

function server(store: Store = new MemoryStore()) {
  let tick = Date.parse('2026-10-21T10:00:00Z');
  return new LocalApi({ store, geo, now: () => new Date((tick += 1000)) });
}

async function call(api: LocalApi, method: string, url: string, body?: unknown, key?: string) {
  return api.handle({
    method,
    url,
    body,
    headers: key ? { 'Idempotency-Key': key } : {},
  });
}

function error(response: LocalResponse) {
  return ApiErrorSchema.parse(response.body).error.code;
}

async function newGame(api: LocalApi, body: object = {}): Promise<GameDetail> {
  const response = await call(api, 'POST', '/api/games', {
    name: 'Partie locale',
    mode: 'candidat_personnalise',
    seed: 'local',
    candidate,
    ...body,
  });
  expect(response.status).toBe(201);
  return GameDetailSchema.parse(response.body);
}

let keys = 0;
async function advance(api: LocalApi, game: GameDetail, extra: object = {}) {
  const response = await call(
    api,
    'POST',
    `/api/games/${game.id}/advance`,
    {
      expectedWeek: game.week,
      actions: [],
      decisions: game.state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
      ...extra,
    },
    `cle-locale-${++keys}`,
  );
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return AdvanceResponseSchema.parse(response.body);
}

describe('serveur local : parties et progression', () => {
  it('répond à la santé, au jeu de règles et refuse une route inconnue', async () => {
    const api = server();
    const health = HealthResponseSchema.parse((await call(api, 'GET', '/api/health')).body);
    expect(health).toMatchObject({ status: 'ok', versions: { api: 'local-0.1.0' } });
    expect((await call(api, 'GET', '/api/rulesets/courant')).status).toBe(200);
    expect(error(await call(api, 'GET', '/api/rulesets/inexistant@1.0.0'))).toBe('introuvable');
    expect(error(await call(api, 'GET', '/api/inconnu'))).toBe('introuvable');
  });

  it('crée, liste et relit une partie ; refuse une requête invalide', async () => {
    const api = server();
    const game = await newGame(api, { scenarioId: 'outsider' });
    expect(game.state.scenario).toBe('outsider');
    const list = GameSummarySchema.array().parse((await call(api, 'GET', '/api/games')).body);
    expect(list.map((g) => g.id)).toEqual([game.id]);
    expect(GameDetailSchema.parse((await call(api, 'GET', `/api/games/${game.id}`)).body)).toEqual(
      game,
    );
    expect(error(await call(api, 'POST', '/api/games', { name: '' }))).toBe('requete_invalide');
    expect(
      error(
        await call(api, 'POST', '/api/games', {
          name: 'x',
          mode: 'observateur',
          scenarioId: 'nope',
        }),
      ),
    ).toBe('scenario_inconnu');
    expect(error(await call(api, 'GET', '/api/games/pas-un-uuid'))).toBe('requete_invalide');
    expect(error(await call(api, 'GET', `/api/games/${crypto.randomUUID()}`))).toBe('introuvable');
  });

  it('crée une partie à chacun des cinq niveaux ; même refus que l’API (phase 18)', async () => {
    const api = server();
    const games: GameDetail[] = [];
    for (const difficulty of DIFFICULTIES) {
      const game = await newGame(api, { difficulty });
      expect(game.difficulty).toBe(difficulty);
      expect(game.state.meta.difficulty).toBe(difficulty);
      games.push(game);
    }
    const budgets = games.map((g) => g.state.actors.joueur!.resources.budgetCentimes);
    expect([...budgets].sort((a, b) => b - a)).toEqual(budgets);
    expect(new Set(budgets).size).toBe(DIFFICULTIES.length);
    const list = GameSummarySchema.array().parse((await call(api, 'GET', '/api/games')).body);
    expect(list.map((g) => g.difficulty).sort()).toEqual([...DIFFICULTIES].sort());
    expect(
      error(
        await call(api, 'POST', '/api/games', {
          name: 'x',
          mode: 'observateur',
          difficulty: 'impossible',
        }),
      ),
    ).toBe('requete_invalide');
  });

  it('crée une partie au format court ; même refus que l’API (phase 20)', async () => {
    const api = server();
    expect((await newGame(api, { format: 'court' })).state.player.format).toBe('court');
    expect((await newGame(api)).state.player.format).toBe('complet');
    expect(
      error(
        await call(api, 'POST', '/api/games', { name: 'x', mode: 'observateur', format: 'eclair' }),
      ),
    ).toBe('requete_invalide');
  });

  it('crée une partie avec une orientation stratégique (phase 15), mêmes refus que l’API', async () => {
    const api = server();
    const game = await newGame(api, { orientationId: 'elus-locaux' });
    expect(game.state.player.orientation).toBe('elus-locaux');
    const journal = JournalPageSchema.parse(
      (await call(api, 'GET', `/api/games/${game.id}/journal`)).body,
    );
    expect(journal.entries.find((e) => e.type === 'partie_creee')!.details).toMatchObject({
      orientation: 'elus-locaux',
    });
    expect(
      error(
        await call(api, 'POST', '/api/games', {
          name: 'x',
          mode: 'candidat_personnalise',
          candidate,
          orientationId: 'inconnue',
        }),
      ),
    ).toBe('orientation_inconnue');
    expect(
      error(
        await call(api, 'POST', '/api/games', {
          name: 'x',
          mode: 'observateur',
          orientationId: 'camp',
        }),
      ),
    ).toBe('requete_invalide');
  });

  it('sert le vivier des négociations calculé par le moteur, puis négocie par le plan', async () => {
    const api = server();
    const game = await newGame(api);
    const response = await call(api, 'GET', `/api/games/${game.id}/soutiens`);
    expect(response.status).toBe(200);
    const prospects = SupportProspectsSchema.parse(response.body);
    expect(prospects).toMatchObject({ annee: 2027, obtenus: 0, maximum: 6 });
    const open = prospects.personnalites.find((p) => p.probabilites !== null)!;
    const { report, game: next } = await advance(api, game, {
      actions: [{ actionId: 'negocier-soutien', cible: open.figureId }],
    });
    expect(report.events.some((e) => e.refId === 'negociation-soutien')).toBe(true);
    expect(next.state.negociations).toHaveLength(1);
    const observer = await newGame(api, { mode: 'observateur', candidate: undefined });
    const refused = await call(api, 'GET', `/api/games/${observer.id}/soutiens`);
    expect(refused.status).toBe(409);
    expect(error(refused)).toBe('soutiens_indisponibles');
  });

  it('fait progresser la partie de façon idempotente, avec verrou sur la semaine', async () => {
    const api = server();
    const game = await newGame(api);
    const body = { expectedWeek: 0, actions: [], decisions: [] };
    const first = await call(api, 'POST', `/api/games/${game.id}/advance`, body, 'cle-unique-1');
    expect(first.status).toBe(200);
    const replay = await call(api, 'POST', `/api/games/${game.id}/advance`, body, 'cle-unique-1');
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);
    const reused = await call(
      api,
      'POST',
      `/api/games/${game.id}/advance`,
      { ...body, actions: [{ actionId: 'meeting' }] },
      'cle-unique-1',
    );
    expect(error(reused)).toBe('cle_idempotence_reutilisee');
    const stale = await call(api, 'POST', `/api/games/${game.id}/advance`, body, 'cle-unique-2');
    expect(stale.status).toBe(409);
    expect(error(stale)).toBe('semaine_perimee');
    expect(error(await call(api, 'POST', `/api/games/${game.id}/advance`, body))).toBe(
      'cle_idempotence_requise',
    );
    const after = GameDetailSchema.parse((await call(api, 'GET', `/api/games/${game.id}`)).body);
    expect(after.week).toBe(1);
    expect(after.version).toBe(game.version + 1);
  });

  it('note les passages dans les médias selon la posture choisie, sans tirage (phase 11)', async () => {
    const api = server();
    const game = await newGame(api);
    const body = {
      actions: [
        { actionId: 'emission-politique', cible: 'emi-le-grand-jury', posture: 'offensive' },
        { actionId: 'decryptage' },
        { actionId: 'meeting', posture: 'rassembleuse' },
      ],
    };
    const { report } = await advance(api, game, body);
    const [show, decryptage, meeting] = report.actions.filter(
      (a) => a.actorId === game.state.player.actorId,
    );
    expect(show!.prestation).toMatchObject({
      posture: 'offensive',
      choisie: true,
      formatId: 'emission-politique',
    });
    expect(show!.prestation!.raisons.length).toBeGreaterThan(1);
    expect(decryptage!.prestation).toMatchObject({ posture: 'pedagogique', choisie: false });
    expect(meeting).toMatchObject({
      status: 'rejetee',
      reason: 'Cette action n’est pas un passage dans les médias : aucune posture à choisir.',
      prestation: null,
    });
    // Posture inconnue : requête refusée par le schéma partagé.
    const bad = await call(
      api,
      'POST',
      `/api/games/${game.id}/advance`,
      { expectedWeek: 0, actions: [{ actionId: 'decryptage', posture: 'agressive' }] },
      'cle-posture',
    );
    expect(bad.status).toBe(400);
  });

  it('mène une présidentielle hors ligne jusqu’au quinquennat, avance rapide comprise', async () => {
    const api = server();
    let game = await newGame(api, {
      mode: 'observateur',
      candidate: undefined,
      seed: 'hors-ligne',
    });
    while (!game.state.quinquennat) game = (await advance(api, game)).game;
    expect(game.state.meta.phase).toBe('presidence');
    // Résultats du premier tour par commune (base de démonstration fictive).
    const communes = CommuneResultsResponseSchema.parse(
      (await call(api, 'GET', `/api/games/${game.id}/resultats/1/communes?departement=01`)).body,
    );
    expect(communes.nature).toBe('fictif');
    expect(Object.keys(communes.communes).length).toBeGreaterThan(100);
    const fast = await advance(api, game, { semaines: 20 });
    expect(fast.avanceRapide!.demandees).toBe(20);
    expect(fast.game.week).toBe(game.week + fast.avanceRapide!.resolues);
    // Partie complète (une cinquantaine de semaines, puis vingt en avance rapide) : bien plus
    // que le délai par défaut de 5 s quand toute la suite tourne en parallèle.
  }, 30_000);
});

describe('serveur local : débats télévisés (phase 10)', () => {
  it('ouvre, joue une carte, simule la fin et persiste ; mêmes erreurs que l’API', async () => {
    const api = server();
    const rules = (await call(api, 'GET', '/api/rulesets/courant')).body as {
      parrainages: { reservoir: { departements: Record<string, unknown> } };
      calendrier: { echeances: { id: string; date: string }[] };
    };
    const deps = Object.keys(rules.parrainages.reservoir.departements).sort();
    const closing = rules.calendrier.echeances.find((e) => e.id === 'presentation-candidatures')!;
    let game = await newGame(api, { seed: 'debat-local' });
    for (let i = 0; i < 40; i++) {
      if (
        game.state.debats.seances.some((d) => d.id === 'debat-t1-tous' && d.semaine === game.week)
      )
        break;
      const actions =
        game.date < closing.date
          ? [0, 1].map((k) => ({
              actionId: 'elus-locaux',
              cible: deps[(game.week * 2 + k) % deps.length]!,
            }))
          : [];
      game = (await advance(api, game, { actions })).game;
    }
    const debate = game.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!;
    expect(debate.invites).toContain(game.state.player.actorId);
    const url = `/api/games/${game.id}/debats/debat-t1-tous`;

    const opened = await call(api, 'POST', url, { action: 'ouvrir' });
    expect(opened.status).toBe(200);
    expect(GameDetailSchema.parse(opened.body).version).toBe(game.version);

    const unknown = await call(api, 'POST', `/api/games/${game.id}/debats/debat-inexistant`, {
      action: 'ouvrir',
    });
    expect([unknown.status, error(unknown)]).toEqual([404, 'debat_introuvable']);
    const stale = await call(api, 'POST', url, { action: 'jouer', sequence: 4, carte: 'defendre' });
    expect([stale.status, error(stale)]).toEqual([409, 'sequence_perimee']);
    const offered = new Set<string>(debate.enCours!.cartes.map((c) => c.carte));
    const missing = ['defendre', 'repondre', 'hauteur', 'petite-phrase'].find(
      (c) => !offered.has(c),
    )!;
    const invalid = await call(api, 'POST', url, { action: 'jouer', sequence: 0, carte: missing });
    expect([invalid.status, error(invalid)]).toEqual([422, 'carte_invalide']);
    const malformed = await call(api, 'POST', url, { action: 'danser' });
    expect([malformed.status, error(malformed)]).toEqual([400, 'requete_invalide']);

    const played = await call(api, 'POST', url, {
      action: 'jouer',
      sequence: 0,
      carte: debate.enCours!.cartes[0]!.carte,
    });
    expect(played.status).toBe(200);
    const afterOne = GameDetailSchema.parse(played.body);
    expect(afterOne.version).toBe(game.version + 1);
    expect(
      afterOne.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!.sequences,
    ).toHaveLength(1);
    const done = GameDetailSchema.parse(
      (await call(api, 'POST', url, { action: 'finir', sequence: 1 })).body,
    );
    expect(done.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!.statut).toBe('termine');
    const replay = await call(api, 'POST', url, { action: 'finir', sequence: 1 });
    expect([replay.status, error(replay)]).toEqual([409, 'debat_termine']);
    const reread = GameDetailSchema.parse((await call(api, 'GET', `/api/games/${game.id}`)).body);
    expect(reread.stateHash).toBe(done.stateHash);
    // Campagne jouée jusqu'au premier débat (une trentaine de semaines) : plus que le délai par
    // défaut de 5 s quand toute la suite tourne en parallèle.
  }, 30_000);
});

describe('serveur local : débat obligatoire (phase 17)', () => {
  it('arrête l’avance rapide avant le débat et refuse la semaine tant qu’il n’est pas joué', async () => {
    const api = server();
    const rules = (await call(api, 'GET', '/api/rulesets/courant')).body as {
      parrainages: { reservoir: { departements: Record<string, unknown> } };
      calendrier: { echeances: { id: string; date: string }[] };
    };
    const deps = Object.keys(rules.parrainages.reservoir.departements).sort();
    const closing = rules.calendrier.echeances.find((e) => e.id === 'presentation-candidatures')!;
    let game = await newGame(api, { seed: 'debat-local' });
    // Parrainages jusqu'à la clôture des présentations, puis avance rapide.
    while (game.date < closing.date) {
      const actions = [0, 1].map((k) => ({
        actionId: 'elus-locaux',
        cible: deps[(game.week * 2 + k) % deps.length]!,
      }));
      game = (await advance(api, game, { actions })).game;
    }
    let stop: string | null = null;
    for (let i = 0; i < 20 && stop !== 'debat'; i++) {
      const fast = await advance(api, game, { semaines: 52 });
      game = fast.game;
      stop = fast.avanceRapide!.arret;
    }
    expect(stop).toBe('debat');
    const debate = debateAwaitingPlayer(game.state)!;
    expect(debate.invites).toContain(game.state.player.actorId);

    const refused = await call(
      api,
      'POST',
      `/api/games/${game.id}/advance`,
      {
        expectedWeek: game.week,
        actions: [],
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      'cle-debat-requis',
    );
    expect([refused.status, error(refused)]).toEqual([422, 'debat_requis']);

    // Fin simulée depuis le plateau : la semaine se résout.
    const finished = await call(api, 'POST', `/api/games/${game.id}/debats/${debate.id}`, {
      action: 'finir',
      sequence: debate.enCours!.index,
    });
    expect(finished.status).toBe(200);
    game = GameDetailSchema.parse(finished.body);
    expect(debateAwaitingPlayer(game.state)).toBeUndefined();
    expect((await advance(api, game)).game.week).toBe(game.week + 1);
    // Campagne jouée jusqu'au débat : plus que le délai par défaut de 5 s.
  }, 60_000);
});

describe('serveur local : photo du candidat (phase 13)', () => {
  const PHOTO =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  it('crée une partie avec la photo choisie ; refuse une photo invalide avec le code de l’API', async () => {
    const api = server();
    const game = await newGame(api, { candidate: { ...candidate, photo: PHOTO } });
    expect(game.state.actors.joueur!.candidate.photo).toBe(PHOTO);
    // Le journal note la présence de la photo, sans en recopier le contenu.
    const journal = JournalPageSchema.parse(
      (await call(api, 'GET', `/api/games/${game.id}/journal?limit=10`)).body,
    );
    const created = journal.entries.find((e) => e.type === 'partie_creee')!;
    expect(created.details).toMatchObject({ candidat: { nom: 'Local', photo: true } });
    expect(JSON.stringify(journal)).not.toContain('base64');
    for (const photo of [
      'data:image/png;base64,/9j/4AAQSkZJRgABAQ==',
      'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      `data:image/png;base64,iVBORw0KGgo${'A'.repeat(140_000)}`,
      'https://exemple.fr/photo.png',
    ])
      expect(
        error(
          await call(api, 'POST', '/api/games', {
            name: 'Photo',
            mode: 'candidat_personnalise',
            candidate: { ...candidate, photo },
          }),
        ),
      ).toBe('requete_invalide');
  });
});

describe('serveur local : journal, sauvegardes, export', () => {
  it('pagine le journal sans doublon ni événement résumé dans le bilan', async () => {
    const api = server();
    let game = await newGame(api);
    for (let i = 0; i < 6; i++) game = (await advance(api, game)).game;
    const seen: string[] = [];
    let before: string | null = null;
    do {
      const page = JournalPageSchema.parse(
        (
          await call(
            api,
            'GET',
            `/api/games/${game.id}/journal?limit=3${before ? `&before=${encodeURIComponent(before)}` : ''}`,
          )
        ).body,
      );
      seen.push(...page.entries.map((e) => e.id));
      for (const entry of page.entries)
        expect(['evenement', 'risque', 'sondage_publie', 'resultat_scrutin']).not.toContain(
          entry.type,
        );
      before = page.nextBefore;
    } while (before);
    expect(new Set(seen).size).toBe(seen.length);
    // Six semaines résolues et la création de la partie.
    expect(seen.length).toBe(7);
  });

  it('garde les sauvegardes automatiques récentes ; sauvegarde, refuse puis restaure', async () => {
    const api = server();
    let game = await newGame(api);
    for (let i = 0; i < AUTO_SAVE_RETENTION + 2; i++) game = (await advance(api, game)).game;
    const list = async () =>
      SaveSummarySchema.array().parse((await call(api, 'GET', `/api/games/${game.id}/saves`)).body);
    expect((await list()).filter((s) => s.kind === 'auto')).toHaveLength(AUTO_SAVE_RETENTION);

    const manual = await call(api, 'POST', `/api/games/${game.id}/saves`, { slot: 1 });
    expect(manual.status).toBe(201);
    const saved = SaveSummarySchema.parse(manual.body);
    expect(error(await call(api, 'POST', `/api/games/${game.id}/saves`, { slot: 1 }))).toBe(
      'emplacement_occupe',
    );
    expect(
      (await call(api, 'POST', `/api/games/${game.id}/saves`, { slot: 1, overwrite: true })).status,
    ).toBe(201);
    expect((await list())[0]).toMatchObject({ slot: 1, kind: 'manuelle' });

    const later = (await advance(api, game)).game;
    const current = SaveSummarySchema.array()
      .parse((await call(api, 'GET', `/api/games/${game.id}/saves`)).body)
      .find((s) => s.slot === 1)!;
    expect(current.stateHash).toBe(saved.stateHash);
    const restored = GameDetailSchema.parse(
      (
        await call(api, 'POST', `/api/games/${game.id}/saves/${current.id}/restore`, {
          expectedVersion: later.version,
        })
      ).body,
    );
    expect(restored.stateHash).toBe(saved.stateHash);
    expect(restored.week).toBe(game.week);
  });

  it('exporte puis importe dans une nouvelle partie identique ; refuse un fichier altéré', async () => {
    const api = server();
    let game = await newGame(api);
    game = (await advance(api, game)).game;
    const exported = await call(api, 'GET', `/api/games/${game.id}/export`);
    expect(exported.headers['x-file-name']).toBe('republique-2027-partie-locale-semaine-1.json');
    const imported = GameDetailSchema.parse(
      (await call(api, 'POST', '/api/games/import', exported.body)).body,
    );
    expect(imported.id).not.toBe(game.id);
    expect(imported.name).toBe('Partie locale (importée)');
    expect(imported.stateHash).toBe(game.stateHash);
    const tampered = structuredClone(exported.body) as { state: { meta: { week: number } } };
    tampered.state.meta.week = 40;
    const refused = await call(api, 'POST', '/api/games/import', tampered);
    expect(refused.status).toBe(422);
  });
});

describe('serveur local : carte embarquée', () => {
  it('sert le manifeste, les fichiers autorisés et la recherche ; pas de résultats 2022', async () => {
    const api = server();
    const manifest = (await call(api, 'GET', '/api/geo/manifeste')).body as { apercu: string };
    expect((await call(api, 'GET', `/api/geo/fichiers/${manifest.apercu}`)).status).toBe(200);
    expect(error(await call(api, 'GET', '/api/geo/fichiers/..%2F..%2Fsecret.json'))).toBe(
      'introuvable',
    );
    const found = (await call(api, 'GET', '/api/geo/recherche?q=Bourg-en-Bresse')).body as {
      code: string;
    }[];
    expect(found[0]!.code).toBe('01053');
    expect((await call(api, 'GET', '/api/geo/historique')).body).toMatchObject({
      disponible: false,
    });
    expect(error(await call(api, 'GET', '/api/geo/historique/1/apercu'))).toBe(
      'historique_indisponible',
    );
  });
});

describe('serveur local : robustesse (phase 8)', () => {
  it('ne garde sur l’appareil que les dernières réponses rejouables', async () => {
    for (const store of [new MemoryStore(), await IndexedDbStore.open(new IDBFactory())]) {
      const api = server(store);
      let game = await newGame(api);
      const first = `cle-retention-${++keys}`;
      const body = { expectedWeek: 0, actions: [], decisions: [] };
      const response = await call(api, 'POST', `/api/games/${game.id}/advance`, body, first);
      game = AdvanceResponseSchema.parse(response.body).game;
      for (let i = 0; i < ADVANCE_REPLAY_RETENTION + 1; i++) game = (await advance(api, game)).game;
      expect(await store.staleAdvances(game.id, 0)).toHaveLength(ADVANCE_REPLAY_RETENTION);
      // La progression la plus ancienne n'est plus rejouable : semaine périmée, rien n'est recalculé.
      const replay = await call(api, 'POST', `/api/games/${game.id}/advance`, body, first);
      expect(replay.status).toBe(409);
      expect(error(replay)).toBe('semaine_perimee');
      // Le journal, lui, reste complet.
      const journal = JournalPageSchema.parse(
        (await call(api, 'GET', `/api/games/${game.id}/journal?limit=50`)).body,
      );
      expect(journal.entries.filter((e) => e.type === 'semaine_resolue')).toHaveLength(
        ADVANCE_REPLAY_RETENTION + 2,
      );
    }
  });

  it('répond 404 à une URL mal encodée et 413 au-delà d’1 Mo (en octets)', async () => {
    const api = server();
    expect(error(await call(api, 'GET', '/api/geo/fichiers/%E0%A4%A'))).toBe('introuvable');
    expect(error(await call(api, 'GET', '/api/rulesets/%zz'))).toBe('introuvable');
    // 400 000 caractères de trois octets chacun : sous 1 Mo de caractères, au-delà en octets.
    const big = await call(api, 'POST', '/api/games', { name: '€'.repeat(400_000) });
    expect(big.status).toBe(413);
  });
});

describe('stockage IndexedDB de l’appareil', () => {
  it('conserve les parties d’une ouverture de l’application à l’autre', async () => {
    const factory = new IDBFactory();
    const first = await IndexedDbStore.open(factory);
    const api = server(first);
    let game = await newGame(api);
    game = (await advance(api, game)).game;
    first.close();

    const reopened = server(await IndexedDbStore.open(factory));
    const again = GameDetailSchema.parse(
      (await call(reopened, 'GET', `/api/games/${game.id}`)).body,
    );
    expect(again.stateHash).toBe(game.stateHash);
    expect(again.week).toBe(1);
    const saves = SaveSummarySchema.array().parse(
      (await call(reopened, 'GET', `/api/games/${game.id}/saves`)).body,
    );
    expect(saves.map((s) => s.kind)).toEqual(['auto']);
  });

  it('migre une base de la version 1 sans perdre ses parties', async () => {
    // Base telle que l'a créée la première version de l'application (sans l'index par date).
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('republique-2027', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('games', { keyPath: 'id' }).put({ id: 'ancienne', name: 'v1' });
        db.createObjectStore('saves', { keyPath: 'id' }).createIndex('gameId', 'gameId');
        db.createObjectStore('events', { keyPath: 'id' }).createIndex('gameId', 'gameId');
        db.createObjectStore('advances', { keyPath: 'id' }).createIndex(
          'gameKey',
          ['gameId', 'idempotencyKey'],
          { unique: true },
        );
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const store = await IndexedDbStore.open(factory);
    expect((await store.game('ancienne'))?.name).toBe('v1');
    expect(await store.staleAdvances('ancienne', 0)).toEqual([]);
    store.close();
  });

  it('applique toutes les écritures d’une requête, ou aucune', async () => {
    const store = await IndexedDbStore.open(new IDBFactory());
    const row = {
      id: 'a',
      gameId: 'g',
      week: 0,
      type: 't',
      nature: 'systeme',
      payload: {},
      createdAt: '2026-10-21T00:00:00.000Z',
    };
    await expect(
      store.commit([
        { kind: 'put', table: 'events', value: row },
        // Clé composée unique : deux progressions avec la même clé d'idempotence.
        ...[1, 2].map((i) => ({
          kind: 'put' as const,
          table: 'advances' as const,
          value: {
            id: `adv-${i}`,
            gameId: 'g',
            idempotencyKey: 'meme-cle',
            requestHash: 'h',
            fromWeek: 0,
            toWeek: 1,
            response: {},
            createdAt: row.createdAt,
          },
        })),
      ]),
    ).rejects.toBeTruthy();
    expect(await store.events('g')).toEqual([]);
  });
});
