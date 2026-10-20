// Construit dist/server.js : un seul fichier ESM pour Node.js. Les paquets du
// monorepo (@r2027/*) et le client Prisma généré sont intégrés ; les dépendances
// npm restent externes (installées en production).
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@r2027/'));

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: [...external, '@prisma/client/*'],
  logLevel: 'info',
});
