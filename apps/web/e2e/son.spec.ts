import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import ts from 'typescript';
import { createGame, settled } from './helpers';

// Phase 19 : le son dans un vrai navigateur (Chromium, le moteur de la WebView Android).
// - Jingles : chaque partition est rendue hors temps réel (OfflineAudioContext) par le vrai
//   synthétiseur : durée attendue, son présent, aucune saturation.
// - Musique : chaque fichier servi par l'application se décode, à la durée du manifeste.
// - Règles : rien avant le premier geste ; la musique suit l'écran ; « Couper le son » coupe tout ;
//   les réglages restent sur l'appareil.

type Manifest = { morceaux: { id: string; fichier: string; dureeSecondes: number }[] };
const MANIFEST = JSON.parse(
  readFileSync(new URL('../src/audio/musiques.json', import.meta.url), 'utf8'),
) as Manifest;

/** Modules du synthétiseur, transpilés pour être chargés tels quels par la page. */
function audioModule(name: string): string {
  const source = readFileSync(new URL(`../src/audio/${name}.ts`, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

/** Platines de musique (éléments <audio> cachés) : morceau chargé, lecture ou pause. */
async function decks(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAudioElement>('audio[data-son="musique"]')].map((a) => ({
      src: a.src.split('/').pop() ?? '',
      playing: !a.paused,
    })),
  );
}
const playingTrack = async (page: Page) =>
  (await decks(page)).filter((d) => d.playing).map((d) => d.src);

test('chaque jingle se rend sans silence ni saturation, à la durée de sa partition', async ({
  page,
}) => {
  await page.route('**/__son/*', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!.replace(/\.js$/, '');
    return route.fulfill({ contentType: 'text/javascript', body: audioModule(name) });
  });
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const synth = (await load('/__son/synth.js')) as {
      renderJingle: (
        ctx: BaseAudioContext,
        j: unknown,
        d: AudioNode,
        w: number,
        v: number,
      ) => number;
    };
    const { JINGLES, CUES } = (await load('/__son/jingles.js')) as {
      JINGLES: Record<string, { duree: number }>;
      CUES: string[];
    };
    const out: Record<string, { peak: number; rms: number; seconds: number; duree: number }> = {};
    for (const cue of CUES) {
      const jingle = JINGLES[cue]!;
      const rate = 44_100;
      const ctx = new OfflineAudioContext(2, Math.ceil(rate * jingle.duree), rate);
      synth.renderJingle(ctx, jingle, ctx.destination, 0, 1);
      const buffer = await ctx.startRendering();
      let peak = 0;
      let sum = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++)
        for (const v of buffer.getChannelData(c)) {
          if (!Number.isFinite(v)) return { error: `${cue} : échantillon non fini` };
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
        }
      out[cue] = {
        peak,
        rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)),
        seconds: buffer.duration,
        duree: jingle.duree,
      };
    }
    return out;
  });
  expect(results).not.toHaveProperty('error');
  const entries = Object.entries(
    results as Record<string, { peak: number; rms: number; seconds: number; duree: number }>,
  );
  // Phase 25 : les bruitages du plateau (carte posée, carte retournée, combo) aussi.
  expect(entries.map(([cue]) => cue).sort()).toEqual([
    'combo',
    'debat',
    'defaite',
    'flash',
    'glisser',
    'retourner',
    'tampon',
    'victoire',
    'vingt-heures',
  ]);
  for (const [cue, r] of entries) {
    expect(r.seconds, cue).toBeCloseTo(r.duree, 1);
    expect(r.peak, `${cue} : crête`).toBeLessThan(0.98);
    expect(r.peak, `${cue} : crête`).toBeGreaterThan(0.2);
    expect(r.rms, `${cue} : niveau moyen`).toBeGreaterThan(0.02);
  }
});

test('chaque morceau servi par l’application se décode, à la durée du manifeste', async ({
  page,
}) => {
  await page.goto('/');
  for (const track of MANIFEST.morceaux) {
    const seconds = await page.evaluate(async (fichier) => {
      const data = await (await fetch(`/${fichier}`)).arrayBuffer();
      const ctx = new OfflineAudioContext(2, 44_100, 44_100);
      return (await ctx.decodeAudioData(data)).duration;
    }, track.fichier);
    expect(Math.abs(seconds - track.dureeSecondes), track.id).toBeLessThan(0.3);
  }
});

test('la musique attend un geste, suit l’écran et se coupe d’un bouton', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'RÉPUBLIQUE 2027' })).toBeVisible();
  // Aucun son avant le premier geste : le morceau de l'accueil est prêt, mais à l'arrêt.
  await expect
    .poll(() => decks(page))
    .toContainEqual({ src: 'orient-et-occident.mp3', playing: false });
  expect(await playingTrack(page)).toEqual([]);
  await page.getByRole('heading', { level: 1, name: 'RÉPUBLIQUE 2027' }).click();
  await expect.poll(() => playingTrack(page)).toEqual(['orient-et-occident.mp3']);

  const mute = page.getByRole('button', { name: 'Couper le son' });
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => playingTrack(page)).toEqual([]);
  await mute.click();
  await expect.poll(() => playingTrack(page)).toEqual(['orient-et-occident.mp3']);

  // Dans une partie en campagne : la musique de la campagne prend le relais en fondu.
  await createGame(page, 'Partie sonore', 'e2e-son');
  await expect.poll(() => playingTrack(page), { timeout: 10_000 }).toEqual(['catalyst.mp3']);
});

test('les réglages du son restent sur l’appareil ; Paramètres est accessible', async ({ page }) => {
  await page.goto('/parametres');
  const section = page.getByRole('region', { name: 'Son' });
  await section.getByRole('checkbox', { name: 'Musique' }).uncheck();
  await section.getByRole('slider', { name: 'Volume des jingles' }).fill('40');
  await page.reload();
  await expect(section.getByRole('checkbox', { name: 'Musique' })).not.toBeChecked();
  await expect(section.getByRole('slider', { name: 'Volume des jingles' })).toHaveValue('40');
  await expect(section.getByRole('button', { name: 'Écouter « Résultat à 20 h »' })).toBeEnabled();
  for (const theme of ['sombre', 'clair'] as const) {
    await page.getByRole('banner').getByLabel('Thème').selectOption(theme);
    await settled(page);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(result.violations.map((v) => `${theme} — ${v.id} : ${v.help}`)).toEqual([]);
  }
});
