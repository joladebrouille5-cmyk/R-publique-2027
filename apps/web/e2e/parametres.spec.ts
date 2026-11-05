import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame, wizardTo } from './helpers';

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
  // Phase 22 : catégories repliées ; le filtre ouvre celles qui répondent.
  const filter = credits.getByRole('searchbox', { name: 'Filtrer les crédits' });
  await filter.fill('MapLibre');
  await expect(credits.getByRole('link', { name: 'MapLibre GL JS' })).toBeVisible();
  await filter.fill('Code officiel géographique');
  await expect(
    credits.getByRole('link', { name: /Code officiel géographique/ }).first(),
  ).toBeVisible();
  await filter.fill('');
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
  expect(await externalLinks(page)).toEqual([]);
  await wizardTo(page, 'Votre candidat');
  await expect(page.getByRole('group', { name: 'Personnalité incarnée' })).toBeVisible();
  expect(await externalLinks(page)).toEqual([]);

  await createGame(page, 'Sans sources à l’écran', 'e2e-sans-sources');
  await advanceViaApi(page, (g) => g.week >= 3);
  await page.reload();
  // Les cinq espaces, toutes sections dépliées : aucun écran ne garde de lien de source.
  const nav = page.getByRole('navigation', { name: 'Espaces de la partie' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  const spaces = await nav
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')!));
  expect(spaces).toHaveLength(5);
  // Phase 25 : le plateau n'a pas de sections ; le QG détaillé, hors des espaces, les garde.
  spaces.push(spaces[0]!.replace(/\/plateau$/, '/tableau-de-bord'));
  let sections = 0;
  for (const href of spaces) {
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const toggles = page.locator('main h2 > button[aria-controls$="-contenu"]');
    for (let i = 0; i < (await toggles.count()); i++) {
      if ((await toggles.nth(i).getAttribute('aria-expanded')) !== 'true')
        await toggles.nth(i).click();
      sections++;
    }
    expect(await externalLinks(page), href).toEqual([]);
    // Un seul titre de niveau 1 par page, même toutes sections dépliées.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  }
  expect(sections).toBeGreaterThan(10);
});
