import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame } from './helpers';

// Paramètres et crédits (phase 11) : les sources, liens, licences et crédits quittent les écrans
// de jeu pour « Paramètres → Crédits et mentions légales » ; seules restent à l'écran les
// étiquettes courtes (réel, simulé, estimation, hypothèse, fictif).

/** Liens vers l'extérieur dans le contenu principal (sources, articles, licences…). */
const externalLinks = (page: Page) =>
  page.locator('main a[href^="http"]').evaluateAll((links) => links.map((a) => a.outerHTML));

test('les paramètres rassemblent le thème, les crédits et les mentions légales', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Paramètres' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres', level: 1 })).toBeVisible();
  const credits = page.getByRole('region', { name: 'Crédits et mentions légales' });
  await expect(credits.getByRole('heading', { name: 'Photos des personnalités' })).toBeVisible();
  await expect(credits.getByRole('heading', { name: 'Logos des médias' })).toBeVisible();
  await expect(credits.getByRole('link', { name: 'MapLibre GL JS' })).toBeVisible();
  await expect(
    credits.getByRole('link', { name: /Code officiel géographique/ }).first(),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
});

test('aucun lien de source sur les écrans de jeu ni à la création de partie', async ({ page }) => {
  test.setTimeout(120_000);
  // Création de partie, personnalités réelles comprises.
  await page.goto('/nouvelle-partie');
  await page.getByRole('radio', { name: /Candidat réel/ }).check();
  await expect(page.getByRole('group', { name: 'Personnalité incarnée' })).toBeVisible();
  expect(await externalLinks(page)).toEqual([]);

  await createGame(page, 'Sans sources à l’écran', 'e2e-sans-sources');
  await advanceViaApi(page, (g) => g.week >= 3);
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Écrans de la partie' });
  const more = page.getByRole('button', { name: 'Tous les écrans' });
  await expect(nav.or(more).first()).toBeVisible();
  if (!(await nav.isVisible())) await more.click();
  const screens = await nav
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')!));
  expect(screens.length).toBeGreaterThan(10);
  for (const href of screens) {
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await externalLinks(page), href).toEqual([]);
  }
});
