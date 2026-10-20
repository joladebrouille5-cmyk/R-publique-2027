import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset, UnknownRulesetError } from '@r2027/rulesets';
import {
  AdvanceRequestSchema,
  CreateGameRequestSchema,
  CreateSaveRequestSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  RestoreSaveRequestSchema,
  type ApiError,
  type HealthResponse,
} from '@r2027/shared';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import type { Config } from './config';
import type { Database } from './db';
import { HttpError } from './errors';
import { advanceGame } from './services/advance';
import { exportGame, importGame } from './services/exchange';
import { createNewGame, getGame, listGames } from './services/games';
import { journalPage } from './services/journal';
import { createManualSave, listSaves, restoreSave } from './services/saves';
import { resolveUserId } from './session';
import { API_VERSION } from './version';

export type AppOptions = {
  config: Pick<Config, 'NODE_ENV' | 'SESSION_SECRET' | 'RATE_LIMIT_MAX' | 'TRUST_PROXY'>;
  db: Database;
};

const GameParams = z.object({ gameId: z.uuid() });
const SaveParams = z.object({ gameId: z.uuid(), saveId: z.uuid() });
const JournalQuery = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_LIMIT_BYTES = 1024 * 1024;

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export async function buildApp({ config, db }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.TRUST_PROXY,
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

  const userOf = (request: FastifyRequest, reply: FastifyReply) =>
    resolveUserId(db, request, reply, { secureCookie: config.NODE_ENV === 'production' });

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

  app.get('/api/games', async (request, reply) => listGames(db, await userOf(request, reply)));

  app.post('/api/games', async (request, reply) => {
    const body = CreateGameRequestSchema.parse(request.body);
    const game = await createNewGame(db, await userOf(request, reply), body);
    return reply.code(201).send(game);
  });

  app.get('/api/games/:gameId', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    return getGame(db, await userOf(request, reply), gameId);
  });

  app.post('/api/games/import', async (request, reply) => {
    const game = await importGame(db, await userOf(request, reply), request.body);
    return reply.code(201).send(game);
  });

  app.post('/api/games/:gameId/advance', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    const key = IdempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_HEADER]);
    if (!key.success) {
      throw new HttpError(400, 'cle_idempotence_requise', key.error.issues[0]!.message);
    }
    const body = AdvanceRequestSchema.parse(request.body);
    const outcome = await advanceGame(db, await userOf(request, reply), gameId, key.data, body);
    if (outcome.replayed) reply.header('idempotent-replay', 'true');
    return outcome.response;
  });

  app.get('/api/games/:gameId/journal', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    const query = JournalQuery.parse(request.query);
    return journalPage(db, await userOf(request, reply), gameId, query);
  });

  app.get('/api/games/:gameId/export', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    const { fileName, document } = await exportGame(db, await userOf(request, reply), gameId);
    return reply
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .header('cache-control', 'no-store')
      .send(document);
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

  app.get('/api/games/:gameId/saves', async (request, reply) => {
    const { gameId } = GameParams.parse(request.params);
    return listSaves(db, await userOf(request, reply), gameId);
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
