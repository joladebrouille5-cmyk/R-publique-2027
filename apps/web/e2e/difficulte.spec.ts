import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fillCandidate, finishWizard, openSection, settled, wizardTo } from './helpers';

// Phase 18 : cinq niveaux de difficulté. Échelle et fiche du niveau à la création (accessibilité
// dans les deux thèmes, largeur des téléphones), niveau enregistré par le serveur et rappelé,
// sans sélecteur, dans la section « La partie » du QG.

async function audit(page: Page, label: string) {
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

test('cinq niveaux, fiche du niveau choisi, Légende verrouillée, partie créée en Expert', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await fillCandidate(page);
  await wizardTo(page, 'Le terrain');
  const group = page.getByRole('group', { name: 'Difficulté' });
  await expect(group.getByRole('radio')).toHaveCount(5);
  await expect(group.getByRole('radio', { name: /Standard/ })).toBeChecked();
  await expect(group.getByRole('region', { name: /Niveau Standard/ })).toBeVisible();

  await group.getByRole('radio', { name: /Découverte/ }).check();
  const discovery = group.getByRole('region', { name: /Niveau Découverte/ });
  await expect(discovery.getByText('Vos moyens de départ')).toBeVisible();
  await expect(discovery.getByText('−20 points sur 100')).toBeVisible();
  for (const theme of ['sombre', 'clair'] as const) {
    await page.getByLabel('Thème').selectOption(theme);
    await audit(page, `Création, niveau Découverte (${theme})`);
  }
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `Création à ${width} px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // Phase 20 : Légende se consulte, mais se débloque par une première victoire.
  await group.getByRole('radio', { name: /Légende/ }).check();
  await expect(group.getByRole('region', { name: /Niveau Légende/ })).toBeVisible();
  await expect(
    group.getByText('Verrouillé : gagner une présidentielle pour le débloquer').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('alert')).toContainText('Niveau Légende : contenu verrouillé.');
  await group.getByRole('radio', { name: /Expert/ }).check();
  await expect(page.getByRole('complementary', { name: 'Récapitulatif' })).toContainText('Expert');
  await finishWizard(page, { name: 'Sans filet', seed: 'e2e-expert' });
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // Le niveau est celui de l'état produit par le serveur ; il ne se change plus.
  await openSection(page, 'partie');
  const sheet = page.getByRole('region', { name: /Niveau Expert/ });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByText('Le niveau est fixé à la création de la partie.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Difficulté' })).toHaveCount(0);
  await audit(page, 'QG, section « La partie »');
});
