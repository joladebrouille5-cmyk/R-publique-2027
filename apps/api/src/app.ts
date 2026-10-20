import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from '@r2027/engine';
import {
  CreateGameRequestSchema,
  CreateSaveRequestSchema,
  RestoreSaveRequestSchema,
  type ApiError,
  type HealthResponse,
} from '@r2027/shared';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import type { Config } from './config';
import type { Database } from './db';
import { HttpError } from './errors';
import {
  createManualSave,
  createNewGame,
  getGame,
  listGames,
  listSaves,
  restoreSave,
} from './services/games';
import { resolveUserId } from './session';
import { API_VERSION } from './version';

export type AppOptions = {
  config: Pick<Config, 'NODE_ENV' | 'SESSION_SECRET' | 'RATE_LIMIT_MAX' | 'TRUST_PROXY'>;
  db: Database;
};

const GameParams = z.object({ gameId: z.uuid() });
const SaveParams = z.object({ gameId: z.uuid(), saveId: z.uuid() });
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
