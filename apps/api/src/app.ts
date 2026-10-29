import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset, UnknownRulesetError } from '@r2027/rulesets';
import {
  AdvanceRequestSchema,
  CreateGameRequestSchema,
  CreateSaveRequestSchema,
  DebateIdSchema,
  DebateRequestSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  JournalCursorSchema,
  RestoreSaveRequestSchema,
  type ApiError,
  type HealthResponse,
  type Ruleset,
} from '@r2027/shared';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import type { Config } from './config';
import type { Database } from './db';
import { HttpError } from './errors';
import { advanceGame } from './services/advance';
import { playGameDebate } from './services/debates';
import { gameSupports } from './services/supports';
import { exportGame, importGame } from './services/exchange';
import { ElectoralRepository, resultsDirectory } from './services/electoral';
import { geoDirectories, GeoRepository } from './services/geo';
import { communeResultsOf, historicalStatus, historicalValues } from './services/results';
import { createNewGame, getGame, listGames } from './services/games';
import { journalPage } from './services/journal';
import { createManualSave, listSaves, restoreSave } from './services/saves';
import { existingUserId, resolveUserId } from './session';
import { API_VERSION } from './version';

export type AppOptions = {
  config: Pick<Config, 'NODE_ENV' | 'SESSION_SECRET' | 'RATE_LIMIT_MAX' | 'TRUST_PROXY'> &
    Partial<Pick<Config, 'GEO_DATA_DIR' | 'RESULTS_DATA_DIR' | 'RATE_LIMIT_WRITE_MAX'>>;
  db: Database;
  /** Référentiel cartographique ; chargé selon GEO_DATA_DIR s'il n'est pas fourni. */
  geo?: GeoRepository;
};

const TourParams = z.object({
  gameId: z.uuid(),
  tour: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])),
});
const DepartementQuery = z.object({ departement: z.string().regex(/^[0-9AB]{2,3}$/) });
const HistoryParams = z.object({
  tour: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])),
});

const GameParams = z.object({ gameId: z.uuid() });
const SaveParams = z.object({ gameId: z.uuid(), saveId: z.uuid() });
const DebateParams = z.object({ gameId: z.uuid(), debatId: DebateIdSchema });
const JournalQuery = z.object({
  before: JournalCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Lecteur sans session : identifiant qu'aucun utilisateur ne porte (listes vides, 404). */
const NO_USER = '00000000-0000-4000-8000-000000000000';

const trustHops = (hops: number) => (_address: string, hop: number) => hop < hops;

/** Vrai si une chaîne du corps contient un caractère NUL (refusé par PostgreSQL). */
function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (depth > 64 || value === null || typeof value !== 'object') return false;
  for (const [key, item] of Object.entries(value))
    if (key.includes('\u0000') || containsNul(item, depth + 1)) return true;
  return false;
}
const BODY_LIMIT_BYTES = 1024 * 1024;

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export async function buildApp({ config, db, geo }: AppOptions): Promise<FastifyInstance> {
  const territories = geo ?? GeoRepository.load(geoDirectories(config.GEO_DATA_DIR));
  const electoral = ElectoralRepository.load(
    territories,
    resultsDirectory(config.RESULTS_DATA_DIR),
  );
  const territoryFor = (ruleset: Ruleset) => electoral.baselineFor(ruleset);
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    // Nombre d'intermédiaires : les n premiers sauts (depuis le serveur) sont de confiance.
    trustProxy:
      typeof config.TRUST_PROXY === 'number' ? trustHops(config.TRUST_PROXY) : config.TRUST_PROXY,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            // Journaux sans données sensibles (§14).
            redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
          },
  });

  await app.register(helmet);
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: '1 minute' });

  // Seul JSON est accepté en écriture (défense contre les requêtes intersites « simples »).
  app.removeContentTypeParser('text/plain');
  app.addHook('onRequest', async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return reply
        .code(415)
        .send(errorBody('type_de_contenu_refuse', 'Les requêtes d’écriture doivent être en JSON.'));
    }
  });

  // Caractère NUL : refusé par PostgreSQL (texte et jsonb) ; une requête qui en contient est
  // invalide plutôt qu'une erreur interne.
  app.addHook('preValidation', async (request, reply) => {
    if (request.body !== undefined && containsNul(request.body)) {
      return reply
        .code(400)
        .send(errorBody('requete_invalide', 'Requête invalide : caractère nul interdit.'));
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send(errorBody('requete_invalide', 'Requête invalide.', z.treeifyError(error)));
    }
    if (error instanceof UnknownRulesetError) {
      request.log.error({ err: error }, error.message);
      return reply.code(500).send(errorBody('regles_inconnues', error.message));
    }
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      const code = (error as { code?: string }).code ?? 'requete_refusee';
      return reply.code(statusCode).send(errorBody(code, (error as Error).message));
    }
    request.log.error({ err: error }, 'Erreur interne');
    return reply.code(500).send(errorBody('erreur_interne', 'Erreur interne du serveur.'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(errorBody('introuvable', 'Ressource introuvable.')),
  );

  // Écritures : l'utilisateur est créé à la première (cookie posé alors). Lectures : aucun
  // utilisateur créé pour un visiteur sans session (listes vides, parties introuvables).
  const userOf = (request: FastifyRequest, reply: FastifyReply) =>
    resolveUserId(db, request, reply, { secureCookie: config.NODE_ENV === 'production' });
  const readerOf = async (request: FastifyRequest) =>
    (await existingUserId(db, request)) ?? NO_USER;
  // Écritures coûteuses (création, import, progression) : limite propre par IP.
  const writeLimit = {
    config: {
      rateLimit: { max: config.RATE_LIMIT_WRITE_MAX ?? 60, timeWindow: '1 minute' },
    },
  };

  app.get('/api/health', async (_request, reply) => {
    let database: HealthResponse['database'] = 'ok';
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      database = 'indisponible';
    }
    const body: HealthResponse = {
      status: database === 'ok' ? 'ok' : 'degrade',
      database,
      versions: { api: API_VERSION, engine: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION },
    };
    return reply.code(database === 'ok' ? 200 : 503).send(body);
  });

  app.get('/api/session', async (request, reply) => ({ userId: await userOf(request, reply) }));

  app.get('/api/games', async (request) => listGames(db, await readerOf(request)));

  app.post('/api/games', writeLimit, async (request, reply) => {
    const body = CreateGameRequestSchema.parse(request.body);
    const game = await createNewGame(db, await userOf(request, reply), body);
    return reply.code(201).send(game);
  });

  app.get('/api/games/:gameId', async (request) => {
    const { gameId } = GameParams.parse(request.params);
    return getGame(db, await readerOf(request), gameId);
  });

  app.post('/api/games/import', writeLimit, async (request, reply) => {
    const game = await importGame(db, await userOf(request, reply), request.body);
    return reply.code(201).send(game);
  });

  app.post('/api/games/:gameId/advance', writeLimit, async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    const key = IdempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_HEADER]);
    if (!key.success) {
      throw new HttpError(400, 'cle_idempotence_requise', key.error.issues[0]!.message);
    }
    const body = AdvanceRequestSchema.parse(request.body);
    const outcome = await advanceGame(
      db,
      await userOf(request, reply),
      gameId,
      key.data,
      body,
      territoryFor,
    );
    if (outcome.replayed) reply.header('idempotent-replay', 'true');
    return outcome.response;
  });

  // Débats télévisés de la semaine (phase 10) : ouvrir, refuser, jouer une carte, simuler la fin.
  app.post('/api/games/:gameId/debats/:debatId', writeLimit, async (request, reply) => {
    const { gameId, debatId } = DebateParams.parse(request.params);
    const body = DebateRequestSchema.parse(request.body);
    return playGameDebate(db, await userOf(request, reply), gameId, debatId, body);
  });

  // Vivier des négociations de soutien du candidat du joueur (phase 15), calculé par le moteur.
  app.get('/api/games/:gameId/soutiens', async (request) => {
    const { gameId } = GameParams.parse(request.params);
    return gameSupports(db, await readerOf(request), gameId);
  });

  app.get('/api/games/:gameId/journal', async (request) => {
    const { gameId } = GameParams.parse(request.params);
    const query = JournalQuery.parse(request.query);
    return journalPage(db, await readerOf(request), gameId, query);
  });

  app.get('/api/games/:gameId/export', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    const { fileName, document } = await exportGame(db, await readerOf(request), gameId);
    return reply
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .header('cache-control', 'no-store')
      .send(document);
  });

  // Référentiel cartographique (§3) : manifeste, fichiers TopoJSON et recherche de territoires.
  app.get('/api/geo/manifeste', async (_request, reply) =>
    reply.header('cache-control', 'public, max-age=3600').send(territories.manifest),
  );

  app.get('/api/geo/fichiers/*', async (request, reply) => {
    const name = (request.params as { '*': string })['*'];
    const file = territories.file(name);
    if (!file) throw new HttpError(404, 'introuvable', `Fichier cartographique inconnu : ${name}`);
    const gzip = /\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''));
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('cache-control', 'public, max-age=86400')
      .header('vary', 'accept-encoding');
    if (gzip) reply.header('content-encoding', 'gzip');
    return reply.send(gzip ? file.gzip : file.raw);
  });

  app.get('/api/games/:gameId/resultats/:tour/communes', async (request) => {
    const { gameId, tour } = TourParams.parse(request.params);
    const { departement } = DepartementQuery.parse(request.query);
    return communeResultsOf(db, await readerOf(request), gameId, tour, departement, territoryFor);
  });

  // Résultats historiques réels (importés localement par `pnpm data:resultats`).
  app.get('/api/geo/historique', async () => historicalStatus(electoral));
  app.get('/api/geo/historique/:tour/apercu', async (request) => {
    const { tour } = HistoryParams.parse(request.params);
    return historicalValues(electoral, territories, tour, null);
  });
  app.get('/api/geo/historique/:tour/communes', async (request) => {
    const { tour } = HistoryParams.parse(request.params);
    const { departement } = DepartementQuery.parse(request.query);
    return historicalValues(electoral, territories, tour, departement);
  });

  app.get('/api/geo/recherche', async (request) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(80) }).parse(request.query);
    return territories.search(q);
  });

  // Jeu de règles des nouvelles parties (profils de départ, adversaires, électorat).
  app.get('/api/rulesets/courant', async () => getRuleset(CURRENT_RULESET_KEY));

  app.get('/api/rulesets/:key', async (request) => {
    const { key } = z.object({ key: z.string().min(1).max(100) }).parse(request.params);
    try {
      return getRuleset(key);
    } catch (error) {
      if (error instanceof UnknownRulesetError)
        throw new HttpError(404, 'introuvable', error.message);
      throw error;
    }
  });

  app.get('/api/games/:gameId/saves', async (request) => {
    const { gameId } = GameParams.parse(request.params);
    return listSaves(db, await readerOf(request), gameId);
  });

  app.post('/api/games/:gameId/saves', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    const body = CreateSaveRequestSchema.parse(request.body);
    const save = await createManualSave(db, await userOf(request, reply), gameId, body);
    return reply.code(201).send(save);
  });

  app.post('/api/games/:gameId/saves/:saveId/restore', async (request, reply) => {
    const { gameId, saveId } = SaveParams.parse(request.params);
    const body = RestoreSaveRequestSchema.parse(request.body ?? {});
    return restoreSave(db, await userOf(request, reply), gameId, saveId, body);
  });

  return app;
}
