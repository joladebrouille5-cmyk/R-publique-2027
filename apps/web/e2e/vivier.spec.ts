import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame, openScreen, settled } from './helpers';

// Phase 14 : vivier élargi des personnalités nominables (photo pour toutes, parti, expertise
// ministérielle), filtres, compétence des ministres sur leur poste et figures des blocs aux
// législatives. Fonctions relevées dans les sources ; aucun propos attribué.

async function audit(page: Page, screen: string) {
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${screen} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

test('vivier des personnalités : photos, filtres, expertise des ministres, figures des blocs', async ({
  page,
}) => {
  // Avance jusqu'au gouvernement, puis deux audits d'accessibilité sur des listes volumineuses.
  test.setTimeout(120_000);
  await createGame(page, 'Vivier élargi', 'e2e-vivier');
  const game = await advanceViaApi(page, (g) => g.state.quinquennat?.gouvernement != null);
  expect(game.state.quinquennat?.gouvernement).not.toBeNull();
  await page.reload();

  // Gouvernement en place : la compétence d'un ministre expert est donnée sur son poste.
  await openScreen(page, 'Gouvernement');
  await expect(page.getByText(/ sur ce poste/).first()).toBeVisible();
  await expect(page.getByText(/^Expertise : /).first()).toBeVisible();

  // Vivier : plus de cent personnalités, toutes avec photo, filtrées par ministère d'expertise.
  await page.getByRole('button', { name: /^Voir les \d+ personnalités de \d+ partis$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Personnalités nominables' });
  await expect(drawer).toBeVisible();
  const cards = drawer.locator('li[aria-label]');
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(100);
  await expect(drawer.getByText(`${total} personnalités`, { exact: true })).toBeVisible();
  await expect(drawer.locator('li[aria-label] [data-avatar="photo"]')).toHaveCount(total);
  await drawer.getByLabel('Expertise').selectOption({ label: 'Intérieur' });
  await expect(drawer.getByText(new RegExp(`^\\d+ sur ${total} personnalités$`))).toBeVisible();
  const experts = await cards.count();
  expect(experts).toBeGreaterThan(0);
  expect(experts).toBeLessThan(total);
  await expect(
    drawer.getByText(/Intérieur \((ministre|secrétaire d’État ou délégué)\)/),
  ).toHaveCount(experts);
  await drawer.getByLabel('Rechercher').fill('zzz');
  await expect(drawer.getByText(/Aucune personnalité ne répond à ces critères/)).toBeVisible();
  await drawer.getByLabel('Rechercher').fill('');
  await audit(page, 'Personnalités nominables');
  await drawer.getByRole('button', { name: 'Fermer' }).click();
  await expect(drawer).toBeHidden();

  // Législatives : visages des blocs, liste complète d'un bloc dans un tiroir.
  await openScreen(page, 'Législatives');
  const figures = page.getByRole('region', { name: 'Figures des blocs' });
  await expect(figures.locator('[data-bloc-faces]').first()).toBeVisible();
  await figures.getByRole('button', { name: 'Voir les personnalités du bloc Gauche' }).click();
  const bloc = page.getByRole('list', { name: 'Personnalités du bloc Gauche' });
  await expect(bloc.getByRole('listitem').first()).toBeVisible();
  expect(await bloc.getByRole('listitem').count()).toBeGreaterThan(10);
  await audit(page, 'Figures du bloc Gauche');
});
