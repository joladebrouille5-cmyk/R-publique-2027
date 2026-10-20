import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '../src/env-file';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Applique les migrations versionnées sur la base de test avant toute exécution. */
export default function setup(): void {
  loadRootEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST manquante : les tests d’intégration exigent un PostgreSQL réel (voir README).',
    );
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
