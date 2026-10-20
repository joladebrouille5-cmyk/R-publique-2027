import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout : API réelle + PostgreSQL réel + interface construite (vite preview).
// Base utilisée : DATABASE_URL_E2E, sinon DATABASE_URL_TEST (voir .env.example).
if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env.DATABASE_URL_E2E ?? process.env.DATABASE_URL_TEST;
if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST (ou DATABASE_URL_E2E) est requise pour les tests Playwright.');
}
const API_PORT = '3101';
const WEB_PORT = 4173;

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [
    { name: 'bureau', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command:
        'pnpm --filter @r2027/api exec prisma migrate deploy && pnpm --filter @r2027/api exec tsx src/server.ts',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        API_HOST: '127.0.0.1',
        API_PORT,
        SESSION_SECRET: process.env.SESSION_SECRET ?? 'secret-e2e-uniquement-0123456789-abcdefgh',
        RATE_LIMIT_MAX: '10000',
        // Jeu de démonstration commité : scénarios identiques en local et en CI.
        GEO_DATA_DIR: fileURLToPath(
          new URL('./packages/data-import/demo/cog-2026', import.meta.url),
        ),
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @r2027/web build && pnpm --filter @r2027/web exec vite preview --port ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { ...process.env, API_PORT },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
