// Spike P4-01 : mesure, sur un téléphone émulé (Pixel 7, processeur ralenti 4×, réseau 4G),
// du premier rendu, des octets transférés et de la mémoire JavaScript pour deux formats de
// géométries communales. Prérequis : `pnpm data:geo` (référentiel complet).
// Usage : node scripts/spike-carte/spike.mjs
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GEO = join(ROOT, 'data/processed/geo/cog-2026');
const WEB = join(ROOT, 'apps/web/node_modules');
const require = createRequire(join(ROOT, 'apps/web/package.json'));
const { chromium, devices } = require('@playwright/test');
const { feature } = require('topojson-client');

if (!existsSync(join(GEO, 'manifest.json'))) {
  console.error('Référentiel complet absent : lancer « pnpm data:geo ».');
  process.exit(1);
}

// Variante écartée, reconstituée à partir des mêmes géométries (même simplification, 100 m,
// coordonnées arrondies à 4 décimales, soit une dizaine de mètres).
const round = (value) => (Array.isArray(value) ? value.map(round) : Math.round(value * 1e4) / 1e4);
const national = {
  type: 'FeatureCollection',
  features: readdirSync(join(GEO, 'communes')).flatMap((file) => {
    const t = JSON.parse(readFileSync(join(GEO, 'communes', file), 'utf8'));
    return feature(t, Object.values(t.objects)[0]).features.map((f) => ({
      ...f,
      geometry: { ...f.geometry, coordinates: round(f.geometry.coordinates) },
    }));
  }),
};
const files = new Map([
  ['/', join(ROOT, 'scripts/spike-carte/page.html')],
  ['/lib/maplibre-gl.mjs', join(WEB, 'maplibre-gl/dist/maplibre-gl.mjs')],
  ['/lib/maplibre-gl-worker.mjs', join(WEB, 'maplibre-gl/dist/maplibre-gl-worker.mjs')],
  ['/lib/maplibre-gl-shared.mjs', join(WEB, 'maplibre-gl/dist/maplibre-gl-shared.mjs')],
  ['/lib/maplibre-gl.css', join(WEB, 'maplibre-gl/dist/maplibre-gl.css')],
  ['/lib/topojson-client.min.js', join(WEB, 'topojson-client/dist/topojson-client.min.js')],
  ['/geo/france.topo.json', join(GEO, 'france.topo.json')],
  ['/geo/communes/62.topo.json', join(GEO, 'communes/62.topo.json')],
]);
const TYPES = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.geojson': 'application/json',
};
const cache = new Map();
const body = (path) => {
  if (!cache.has(path)) {
    const raw =
      path === '/geo/communes-france.geojson'
        ? Buffer.from(JSON.stringify(national))
        : readFileSync(files.get(path));
    cache.set(path, gzipSync(raw));
  }
  return cache.get(path);
};

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!files.has(path) && path !== '/geo/communes-france.geojson') {
    res.writeHead(404).end();
    return;
  }
  const ext = path === '/' ? '.html' : extname(path);
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'content-encoding': 'gzip',
  });
  res.end(body(path));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const results = [];
for (const variante of ['departements', 'national']) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 85,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    let transferred = 0;
    cdp.on('Network.loadingFinished', (e) => (transferred += e.encodedDataLength));
    await page.goto(`${base}/?variante=${variante}`);
    const mesures = await page
      .waitForFunction(() => globalThis.mesures, null, { timeout: 180_000 })
      .then((h) => h.jsonValue());
    const metrics = (await cdp.send('Performance.getMetrics')).metrics;
    const heap = metrics.find((m) => m.name === 'JSHeapUsedSize').value;
    runs.push({ ...mesures, transferred, heap });
    await context.close();
  }
  const median = (key) =>
    runs
      .map((r) => r[key])
      .filter((v) => v !== undefined)
      .sort((a, b) => a - b)[1];
  results.push({
    variante,
    premierRendu: median('premierRendu'),
    departementCommunes: median('departementCommunes'),
    transferred: median('transferred'),
    heap: median('heap'),
  });
}
await browser.close();
server.close();

const ms = (v) => (v === undefined ? '—' : `${Math.round(v)} ms`);
const mo = (v) => `${(v / 1024 / 1024).toFixed(2)} Mo`;
console.log(
  '| Variante | Premier rendu | Communes d’un département (62) | Transféré | Mémoire JS |',
);
console.log('|---|---|---|---|---|');
for (const r of results) {
  console.log(
    `| ${r.variante} | ${ms(r.premierRendu)} | ${ms(r.departementCommunes)} | ${mo(r.transferred)} | ${mo(r.heap)} |`,
  );
}
