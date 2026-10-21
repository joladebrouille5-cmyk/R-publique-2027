import { defineConfig } from 'vitest/config';

// Tests unitaires et de propriétés (sans base de données ni navigateur).
// Les tests d'intégration de l'API ont leur propre configuration : apps/api/vitest.config.ts.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'engine',
          root: './packages/engine',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'rulesets',
          root: './packages/rulesets',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'data-import',
          root: './packages/data-import',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'save-engine',
          root: './packages/save-engine',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
