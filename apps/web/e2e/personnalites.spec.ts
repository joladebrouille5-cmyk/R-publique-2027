import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openScreen, openSection, resolveWeek } from './helpers';

// Personnalités réelles (phase 5 bis) : création d'une partie où l'on incarne une personnalité
// sourcée face aux adversaires réels, photos créditées, rappels de simulation, accessibilité.

const audit = async (page: Page, label: string) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
};

test('incarner une personnalité réelle face aux adversaires réels', async ({ page }) => {
  await page.goto('/nouvelle-partie');
  await page.getByLabel('Nom de la partie').fill('Personnalités');
  await page.getByRole('radio', { name: /Candidat réel/ }).check();
  const group = page.getByRole('group', { name: 'Personnalité incarnée' });
  await expect(group.getByText(/sont simulés par le jeu/)).toBeVisible();
  await group.getByRole('radio', { name: /Marine Tondelier/ }).check();
  await expect(group.getByText(/Désignée candidate par Les Écologistes/)).toBeVisible();
  // Les photos sont servies et décodées (fichiers commités, licences libres).
  const portrait = group.getByRole('img', { name: 'Portrait de Marine Tondelier' });
  await expect(portrait).toBeVisible();
  expect(await portrait.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240);
  await page.getByRole('radio', { name: /Personnalités réelles/ }).check();
  await audit(page, 'Nouvelle partie');
  await page.getByLabel('Graine (facultative)').fill('e2e-reel');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await expect(page.getByText(/Partie avec des personnalités réelles/)).toBeVisible();

  await resolveWeek(page, 0);
  await openSection(page, 'bilan-semaine');
  await expect(page.getByRole('region', { name: /Bilan de la semaine 0/ })).toBeVisible();

  await openScreen(page, 'Candidats');
  await expect(page.getByRole('note')).toContainText('sont simulés par le jeu');
  const tondelier = page.getByRole('listitem', { name: 'Marine Tondelier' });
  await expect(tondelier.getByText('Votre candidat')).toBeVisible();
  const philippe = page.getByRole('listitem', { name: 'Édouard Philippe' });
  await expect(philippe.getByText('Personnalité réelle — simulée')).toBeVisible();
  await philippe.getByText('Fiche', { exact: true }).click();
  await expect(philippe.getByText('Estimation')).toBeVisible();
  await audit(page, 'Candidats');
  // Phase 11 : crédit de la photo et sources des fiches dans Paramètres → Crédits.
  await page.getByRole('banner').getByRole('link', { name: 'Paramètres' }).click();
  const credits = page.getByRole('region', { name: 'Crédits et mentions légales' });
  await expect(credits.getByText(/Photo : Wasasaq8, CC0/)).toBeVisible();
  await expect(credits).toContainText('Chapel Hill');
});
