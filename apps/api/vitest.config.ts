import { defineConfig } from 'vitest/config';

// Tests d'intégration : API réelle (Fastify `inject`) contre un PostgreSQL réel.
// Base cible : DATABASE_URL_TEST (vidée avant chaque test).
export default defineConfig({
  test: {
    name: 'api-integration',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
