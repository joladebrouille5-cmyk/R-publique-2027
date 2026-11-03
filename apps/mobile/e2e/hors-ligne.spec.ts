import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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
  await page.getByLabel('Nom de la partie').fill(name);
  await page.getByLabel('Prénom').fill('Camille');
  await page.getByLabel(/^Nom \*/).fill('Hors-Ligne');
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement de poche');
  await page.getByLabel('Graine (facultative)').fill('android');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
}

/** Ouvre un espace (barre du bas), puis, au besoin, déplie une de ses sections (phase 12). */
async function openScreen(page: Page, space: string, section?: string) {
  await page
    .getByRole('navigation', { name: 'Espaces de la partie' })
    .getByRole('link', { name: space, exact: true })
    .click();
  if (!section) return;
  const toggle = page.locator(`section#${section} > h2 > button`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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
    .toEqual(['/sons/investigations.mp3']);

  await page.getByRole('button', { name: 'Ajouter Meeting public' }).click();
  await page.getByRole('button', { name: 'Résoudre la semaine 0' }).click();
  // Débriefing de la semaine (phase 11), plein écran, calculé hors ligne par le moteur local.
  const debrief = page.getByRole('dialog', { name: 'Débriefing de la semaine 0' });
  await expect(debrief.getByText('Meeting public')).toBeVisible();
  await debrief.getByRole('button', { name: 'Continuer' }).click();
  await expect(debrief).toBeHidden();
  await expect(page.getByRole('heading', { name: /Bilan de la semaine 0/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeVisible();

  // Fermeture puis réouverture de l'application : la partie est relue depuis IndexedDB.
  const gameUrl = page.url();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Partie Android/ })).toBeVisible();
  await page.goto(gameUrl);

  // Carte : référentiel de démonstration embarqué, rendu par MapLibre dans la politique CSP.
  await openScreen(page, 'Carte');
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

  // Export (hors application native : téléchargement), puis import en nouvelle partie.
  await openScreen(page, 'QG', 'sauvegardes');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter la partie (JSON)' }).click(),
  ]);
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8')) as { format: string; week: number };
  expect(exported.format).toBe('republique-2027/partie');
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await page.getByLabel('Importer un fichier de partie').setInputFiles(path);
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Partie Android/ })).toHaveCount(2);

  expect(watch.apiRequests).toEqual([]);
  expect(watch.external).toEqual([]);
  expect(watch.csp).toEqual([]);
});
