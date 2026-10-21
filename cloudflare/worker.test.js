import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import worker, { API_NON_DEPLOYEE } from './worker.js';

// Déploiement Cloudflare Workers : le Worker ne sert jamais de fausse réponse d'API, et la
// configuration reste cohérente avec le dépôt (nom du Worker, dossier compilé, version de Node).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** wrangler.jsonc : commentaires de ligne et virgules finales retirés avant lecture. */
const config = JSON.parse(
  readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1'),
);

const env = () => ({
  ASSETS: { fetch: vi.fn(async () => new Response('<!doctype html>', { status: 200 })) },
});

describe('Worker Cloudflare', () => {
  it('répond aux requêtes de l’API par une erreur explicite, au format de l’API', async () => {
    for (const path of ['/api/health', '/api/games/1/advance', '/api']) {
      const e = env();
      const response = await worker.fetch(new Request(`https://exemple.org${path}`), e);
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = await response.json();
      expect(body).toEqual(API_NON_DEPLOYEE);
      expect(body.error.code).toBe('api_non_deployee');
      expect(e.ASSETS.fetch).not.toHaveBeenCalled();
    }
  });

  it('laisse les autres requêtes aux fichiers de l’interface', async () => {
    for (const path of ['/', '/parties/abc/carte', '/apiculture', '/favicon.svg']) {
      const e = env();
      const request = new Request(`https://exemple.org${path}`);
      const response = await worker.fetch(request, e);
      expect(response.status).toBe(200);
      expect(e.ASSETS.fetch).toHaveBeenCalledWith(request);
    }
  });
});

describe('configuration wrangler.jsonc', () => {
  it('déploie le Worker « republique-2027 » avec l’interface compilée et le script ci-dessus', () => {
    expect(config.name).toBe('republique-2027');
    expect(existsSync(join(ROOT, config.main))).toBe(true);
    expect(config.assets).toMatchObject({
      directory: './apps/web/dist',
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*'],
    });
    // Le dossier compilé est celui de Vite par défaut (aucun outDir personnalisé).
    expect(readFileSync(join(ROOT, 'apps/web/vite.config.ts'), 'utf8')).not.toMatch(/outDir/);
    expect(config.build.command).toBe('pnpm --filter @r2027/web run build');
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fixe une version de Node acceptée par le dépôt (engine-strict)', () => {
    const version = readFileSync(join(ROOT, '.node-version'), 'utf8').trim();
    const minimum = /^>=(\d+)\.(\d+)$/.exec(
      JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines.node,
    );
    const [major, minor] = version.split('.').map(Number);
    expect(minimum).not.toBeNull();
    expect(
      major > Number(minimum[1]) || (major === Number(minimum[1]) && minor >= Number(minimum[2])),
    ).toBe(true);
    expect(readFileSync(join(ROOT, '.npmrc'), 'utf8')).toMatch(/engine-strict=true/);
  });
});
