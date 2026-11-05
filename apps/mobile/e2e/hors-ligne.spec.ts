import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { fillCandidate, finishWizard } from '../../web/e2e/helpers';

// Phase 8 : l'application Android joue sans réseau. Le paquet de l'APK est servi tel quel ;
// toute requête vers une autre origine est coupée, et aucune requête /api ne doit partir :
// le moteur, les règles, la carte et les parties sont dans l'application.

type Watch = { apiRequests: string[]; external: string[]; csp: string[] };

async function offline(context: BrowserContext, page: Page): Promise<Watch> {
  const watch: Watch = { apiRequests: [], external: [], csp: [] };
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      watch.external.push(url.href);
      return route.abort('internetdisconnected');
    }
    if (url.pathname.startsWith('/api/')) {
      watch.apiRequests.push(url.pathname);
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) watch.csp.push(message.text());
  });
  return watch;
}

/**
 * Moteur local prêt : le pied de page n'affiche plus de ligne « Hors ligne » (phase 14), seulement
 * un démarrage en cours ou une panne ; il ne doit afficher ni l'un ni l'autre.
 */
async function engineReady(page: Page) {
  await expect(page.getByRole('link', { name: 'Nouvelle partie' })).toBeVisible();
  await expect(page.getByText('Démarrage du moteur local…')).toHaveCount(0);
  await expect(page.getByText('Moteur local indisponible')).toHaveCount(0);
  await expect(page.getByText(/Hors ligne · moteur/)).toHaveCount(0);
}

async function createGame(page: Page, name: string) {
  await page.goto('/');
  await engineReady(page);
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  // Assistant de création (phase 20) : candidat, puis options avancées de la dernière étape.
  await fillCandidate(page, 'Hors-Ligne');
  await finishWizard(page, { name, seed: 'android' });
  // Phase 25 : la partie s'ouvre sur le plateau.
  await expect(page.getByRole('button', { name: 'Jouer la semaine 0' })).toBeVisible();
}

/**
 * Ouvre la boîte de jeu du plateau (phase 25), après avoir remis à plus tard les décisions
 * ouvertes en cartes plein écran.
 */
async function openBox(page: Page) {
  const box = page.getByRole('button', { name: 'Boîte de jeu' });
  await expect(async () => {
    if (await page.getByRole('dialog').first().isVisible()) await page.keyboard.press('Escape');
    await box.click({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return page.getByRole('dialog', { name: 'Boîte de jeu' });
}

test('partie complète sans réseau : création, semaine, reprise, carte, export et import', async ({
  page,
  context,
}) => {
  const watch = await offline(context, page);
  await createGame(page, 'Partie Android');
  // Son (phase 19) : après les gestes de la création, la musique de la campagne joue depuis
  // les fichiers embarqués dans le paquet (aucune requête hors de l'application).
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLAudioElement>('audio[data-son="musique"]')]
          .filter((a) => !a.paused)
          .map((a) => new URL(a.src).pathname),
      ),
    )
    .toEqual(['/sons/catalyst.mp3']);

  // Une carte Terrain posée au Finistère, sur le plateau dessiné par la géographie embarquée.
  await page.getByRole('button', { name: /^Carte « Porte-à-porte »/ }).click();
  await page.getByRole('button', { name: /^Finistère \(29\)/ }).click();
  await page.getByRole('button', { name: 'Jouer la semaine 0' }).click();
  // Verdict de la semaine (phase 25), plein écran, calculé hors ligne par le moteur local.
  const verdict = page.getByRole('dialog', { name: 'Verdict de la semaine 0' });
  await verdict.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(
    verdict.getByRole('region', { name: 'Vos cartes de la semaine' }).getByText('Porte-à-porte'),
  ).toBeVisible();
  await verdict.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(verdict).toBeHidden();
  await expect(page.getByRole('button', { name: 'Jouer la semaine 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Finistère \(29\)/ })).toHaveAccessibleName(
    /implantation [1-9]\d* sur 100/,
  );

  // Fermeture puis réouverture de l'application : la partie est relue depuis IndexedDB.
  const gameUrl = page.url();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Jouer la semaine 1' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Partie Android/ })).toBeVisible();
  await page.goto(gameUrl);

  // Carte : référentiel de démonstration embarqué, rendu par MapLibre dans la politique CSP ;
  // on l'ouvre depuis la boîte de jeu du plateau.
  await (await openBox(page)).getByRole('link', { name: 'Carte électorale détaillée' }).click();
  await expect(page.getByRole('region', { name: 'Carte de la métropole' })).toHaveAttribute(
    'data-ready',
    'oui',
  );
  await page.getByLabel(/Rechercher un territoire/).fill('Ajaccio');
  await expect(
    page.getByRole('list', { name: 'Résultats de la recherche' }).getByRole('button', {
      name: /Ajaccio/,
    }),
  ).toBeVisible();

  // Export (hors application native : téléchargement), puis import en nouvelle partie : le
  // panneau « Sauvegardes » de la boîte de jeu.
  await page
    .getByRole('navigation', { name: 'Espaces de la partie' })
    .getByRole('link', { name: 'Plateau', exact: true })
    .click();
  await (await openBox(page)).getByRole('button', { name: /^Sauvegardes/ }).click();
  await expect(page.getByRole('dialog', { name: 'Sauvegardes' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter la partie (JSON)' }).click(),
  ]);
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8')) as { format: string; week: number };
  expect(exported.format).toBe('republique-2027/partie');
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await page.getByLabel('Importer un fichier de partie').setInputFiles(path);
  await page.waitForURL((url) => url.href !== gameUrl && url.pathname.endsWith('/plateau'));
  await expect(page.getByRole('button', { name: 'Jouer la semaine 1' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Partie Android/ })).toHaveCount(2);

  expect(watch.apiRequests).toEqual([]);
  expect(watch.external).toEqual([]);
  expect(watch.csp).toEqual([]);
});
