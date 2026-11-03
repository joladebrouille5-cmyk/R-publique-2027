import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createGame, settled } from './helpers';

// Phase 22 : sommaire collant des espaces et de Paramètres. Toucher une pastille déplie la section
// et l'amène sous le bandeau ; l'entrée courante suit ; rien ne déborde en largeur.

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('le sommaire de Campagne déplie une section et l’amène sous le bandeau', async ({ page }) => {
  await createGame(page, 'Sommaire', 'e2e-sommaire');
  await page
    .getByRole('navigation', { name: 'Espaces de la partie' })
    .getByRole('link', { name: 'Campagne', exact: true })
    .click();
  const nav = page.getByRole('navigation', { name: 'Sommaire de l’espace' });
  await expect(nav).toBeVisible();
  const finances = nav.getByRole('link', { name: /^Finances/ });
  await finances.click();

  const toggle = page.locator('section#finances > h2 > button');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toBeInViewport();
  await expect(nav.getByRole('link', { name: 'Finances (dépliée)' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  // Le titre de la section n'est pas caché sous le sommaire collant.
  const navBox = (await nav.boundingBox())!;
  const titleBox = (await toggle.boundingBox())!;
  expect(titleBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);

  // Tout replier.
  await nav.getByRole('link', { name: /^Programme/ }).click();
  await nav.getByRole('button', { name: 'Tout replier' }).click();
  await expect(page.locator('section#finances > h2 > button')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await settled(page);
  const result = await new AxeBuilder({ page })
    .include('nav[aria-label="Sommaire de l’espace"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  await noOverflow(page);
});

test('à 360 px, le sommaire défile sur place sans élargir la page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await createGame(page, 'Sommaire étroit', 'e2e-sommaire-360');
  await page
    .getByRole('navigation', { name: 'Espaces de la partie' })
    .getByRole('link', { name: 'Campagne', exact: true })
    .click();
  const nav = page.getByRole('navigation', { name: 'Sommaire de l’espace' });
  await nav.getByRole('link', { name: /^Finances/ }).click();
  await expect(page.locator('section#finances > h2 > button')).toBeInViewport();
  await noOverflow(page);
});

test('un espace d’une seule section n’affiche pas de sommaire', async ({ page }) => {
  await createGame(page, 'Sommaire Opinion', 'e2e-sommaire-opinion');
  await page
    .getByRole('navigation', { name: 'Espaces de la partie' })
    .getByRole('link', { name: 'Opinion', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Opinion', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sommaire de l’espace' })).toHaveCount(0);
});

test('Paramètres : le sommaire mène aux crédits', async ({ page }) => {
  await page.goto('/parametres');
  const nav = page.getByRole('navigation', { name: 'Sommaire des paramètres' });
  await nav.getByRole('link', { name: 'Crédits' }).click();
  await expect(page.getByRole('heading', { name: 'Crédits et mentions légales' })).toBeInViewport();
  await noOverflow(page);
});
