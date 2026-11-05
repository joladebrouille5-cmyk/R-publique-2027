import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame, settled } from './helpers';

// Marges de sécurité sur téléphone (phase 11) : comme Capacitor 8 sur Android, le test injecte
// les hauteurs de la barre d'état et de la barre de gestes dans --safe-area-inset-* ; l'en-tête,
// le bandeau de la partie et la navigation basse doivent s'en écarter, et chaque carte d'action
// rester atteignable au-dessus de la barre « Résoudre la semaine ».

const STATUS_BAR = 40;
const GESTURE_BAR = 24;

test('l’interface évite la barre d’état et la barre de gestes du téléphone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Disposition propre au téléphone');
  await page.addInitScript(
    ([top, bottom]) => {
      const set = () => {
        document.documentElement.style.setProperty('--safe-area-inset-top', `${top}px`);
        document.documentElement.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
      };
      if (document.documentElement) set();
      document.addEventListener('DOMContentLoaded', set);
    },
    [STATUS_BAR, GESTURE_BAR],
  );
  await createGame(page, 'Marges de sécurité', 'e2e-marges');

  // En-tête : la marque commence sous la barre d'état.
  await page.evaluate(() => window.scrollTo(0, 0));
  const brand = page.getByRole('banner').getByRole('link', { name: 'RÉPUBLIQUE 2027' });
  expect((await brand.boundingBox())!.y).toBeGreaterThanOrEqual(STATUS_BAR);

  // Bandeau de la partie, collé en haut pendant le défilement : sous la barre d'état aussi.
  await page.evaluate(() => window.scrollBy(0, 1500));
  const hud = page.getByRole('region', { name: 'Situation de la partie' });
  await expect
    .poll(async () => (await hud.boundingBox())!.y, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(STATUS_BAR - 1);

  // Navigation basse : ses liens finissent au-dessus de la barre de gestes.
  const viewport = page.viewportSize()!;
  const spaces = page.getByRole('navigation', { name: 'Espaces de la partie' });
  const firstLink = spaces.getByRole('link').first();
  const linkBox = (await firstLink.boundingBox())!;
  expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(viewport.height - GESTURE_BAR + 1);

  // Chaque carte d'action, amenée à l'écran, est visible (ni sous la barre de résolution, ni
  // sous la navigation) : le point central de son bouton désigne bien ce bouton.
  const add = page.getByRole('button', { name: /^Ajouter / });
  const count = await add.count();
  expect(count).toBeGreaterThan(3);
  for (const index of [0, Math.floor(count / 2), count - 1]) {
    const button = add.nth(index);
    await button.focus();
    const box = (await button.boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y)?.closest('button');
        return target?.getAttribute('aria-label') ?? target?.textContent ?? '';
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(hit, `carte ${index + 1} sur ${count}`).toBe(
      (await button.getAttribute('aria-label')) ?? (await button.textContent()) ?? '',
    );
  }

  // Tiroir de détail (phase 12) : sous la barre d'état, son bouton au-dessus de la barre de gestes.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Détails : Meeting public' }).click();
  const drawer = page.getByRole('dialog', { name: 'Meeting public' });
  await expect(drawer).toBeVisible();
  // Mesures une fois le tiroir arrivé (montée depuis le bas de l'écran).
  await settled(page);
  expect((await drawer.boundingBox())!.y).toBeGreaterThanOrEqual(STATUS_BAR);
  const addBox = (await drawer.getByRole('button', { name: 'Ajouter au plan' }).boundingBox())!;
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(viewport.height - GESTURE_BAR + 1);
});

/** Bas de la barre « Résoudre la semaine » (collée au-dessus de la navigation). */
async function resolveBarTop(page: Page) {
  const bar = page
    .getByRole('button', { name: /^Résoudre la semaine/ })
    .locator('xpath=ancestor::div[@data-barre-resolution][1]');
  return (await bar.boundingBox())!.y;
}

test('le QG tient dans le premier écran d’un téléphone de 390 × 844', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Disposition propre au téléphone');
  await page.setViewportSize({ width: 390, height: 844 });
  await createGame(page, 'Coup d’œil', 'e2e-coup-d-oeil');
  await advanceViaApi(page, (g) => g.week >= 2);
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 0));

  // Budget, popularité, notoriété : le bandeau ; le reste : les tuiles de la vue d'ensemble.
  const hud = page.getByRole('region', { name: 'Situation de la partie' });
  for (const label of ['Budget', 'Popularité', 'Notoriété'])
    await expect(hud.getByText(label, { exact: true })).toBeInViewport();
  const overview = page.getByRole('region', { name: 'En un coup d’œil' });
  const tiles = overview.getByRole('button');
  for (const label of [/^Actions programmées/, /^Décisions/, /^Sondage clé/, /^Prochaine échéance/])
    await expect(overview.getByRole('button', { name: label })).toBeVisible();
  // Aucune tuile sous la barre de résolution : tout se lit sans défiler.
  const limit = await resolveBarTop(page);
  const count = await tiles.count();
  expect(count).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < count; i++) {
    const box = (await tiles.nth(i).boundingBox())!;
    expect(box.y + box.height, (await tiles.nth(i).textContent()) ?? '').toBeLessThanOrEqual(limit);
  }

  // Une tuile ouvre son détail dans un tiroir : l'adresse ne change pas, Échap le referme.
  const url = page.url();
  await overview.getByRole('button', { name: /^Sondage clé/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Sondages' });
  await expect(drawer.getByRole('region', { name: /^Dernier sondage/ })).toBeVisible();
  expect(page.url()).toBe(url);
  const audit = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(overview.getByRole('button', { name: /^Sondage clé/ })).toBeFocused();
});

test('aucun espace ne déborde en largeur, toutes sections dépliées (360 et 390 px)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Disposition propre au téléphone');
  test.setTimeout(120_000);
  await createGame(page, 'Largeur mobile', 'e2e-largeur-mobile');
  await advanceViaApi(page, (g) => g.week >= 2);
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Espaces de la partie' });
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    // Le plateau, plein cadre et sans barre des espaces, a son propre scénario (plateau.spec).
    for (const space of ['Carte', 'Campagne', 'Opinion', 'Pouvoir']) {
      const tab = nav.getByRole('link', { name: space, exact: true });
      await tab.click();
      // Transition de vue (phase 16) : la page change un instant après le clic ; l'onglet n'est
      // marqué courant qu'une fois la nouvelle page en place.
      await expect(tab).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const toggles = page.locator('main h2 > button[aria-controls$="-contenu"]');
      for (let i = 0; i < (await toggles.count()); i++) {
        if ((await toggles.nth(i).getAttribute('aria-expanded')) !== 'true')
          await toggles.nth(i).click();
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${space} à ${width} px`).toBeLessThanOrEqual(0);
    }
  }
});
