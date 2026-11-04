import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { fileURLToPath } from 'node:url';
import { buildApp, type AppOptions } from '../src/app';
import { createDatabase, type Database } from '../src/db';
import { loadRootEnv } from '../src/env-file';

loadRootEnv();

export const TEST_SECRET = 'secret-de-test-uniquement-0123456789-abcdef';
export const DEMO_GEO_DIR = fileURLToPath(
  new URL('../../../packages/data-import/demo/cog-2026', import.meta.url),
);

export function testDatabase(): Database {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST manquante');
  return createDatabase(url);
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE "simulation_log", "game_event", "game_action", "game_advance", "game_save", "game", "app_user" CASCADE',
  );
}

export async function testApp(
  db: Database,
  overrides: Partial<AppOptions['config']> = {},
  clock?: AppOptions['clock'],
): Promise<FastifyInstance> {
  const app = await buildApp({
    db,
    ...(clock ? { clock } : {}),
    config: {
      NODE_ENV: 'test',
      SESSION_SECRET: TEST_SECRET,
      RATE_LIMIT_MAX: 10_000,
      RATE_LIMIT_WRITE_MAX: 10_000,
      TRUST_PROXY: false,
      // Jeu de démonstration commité : mêmes résultats en local et en CI.
      GEO_DATA_DIR: DEMO_GEO_DIR,
      ...overrides,
    },
  });
  await app.ready();
  return app;
}

/** Client de test qui conserve le cookie de session comme un navigateur. */
export class Client {
  private cookie: string | undefined;
  constructor(private readonly app: FastifyInstance) {}

  async request(options: InjectOptions): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (this.cookie) headers.cookie = this.cookie;
    if (options.payload !== undefined && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    const response = await this.app.inject({ ...options, headers });
    const setCookie = response.cookies.find((c) => c.name === 'r2027_session');
    if (setCookie) this.cookie = `${setCookie.name}=${setCookie.value}`;
    return response;
  }

  get = (url: string) => this.request({ method: 'GET', url });
  post = (url: string, payload: unknown = {}) =>
    this.request({ method: 'POST', url, payload: payload as InjectOptions['payload'] });

  get sessionCookie(): string | undefined {
    return this.cookie;
  }
}
