import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeDebrief, createGame, settled } from './helpers';

// Phase 16 : refonte « Grand Soir ». Écran-titre (mur d'affichage des candidats fictifs),
// création en chapitres avec l'affiche en direct, QG et débriefing : accessibilité (axe) dans les
// deux thèmes, mouvement réduit, cibles tactiles, largeur des téléphones.

async function audit(page: Page, label: string) {
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

async function bothThemes(page: Page, label: string) {
  await page.getByLabel('Thème').selectOption('sombre');
  await audit(page, `${label} (soirée)`);
  await page.getByLabel('Thème').selectOption('clair');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await audit(page, `${label} (clair)`);
  await page.getByLabel('Thème').selectOption('sombre');
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test('écran-titre : mur d’affichage des candidats fictifs, reprise de la dernière partie', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createGame(page, 'Écran-titre', 'e2e-ecran-titre');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'RÉPUBLIQUE 2027' })).toBeVisible();
  const wall = page.getByRole('list', {
    name: 'Mur d’affichage : les candidats fictifs de la campagne',
  });
  await expect(wall.getByRole('listitem')).toHaveCount(8);
  await expect(wall.getByText('Votre affiche')).toBeVisible();
  // Portraits illustrés seulement : aucune photo de personne réelle sur le mur.
  await expect(wall.locator('[data-avatar="photo"]')).toHaveCount(0);
  await expect(wall.locator('[data-avatar="illustration"]')).toHaveCount(7);

  const latest = page.getByRole('region', { name: 'Dernière partie' });
  await expect(latest.getByText('Partie « Écran-titre »')).toBeVisible();
  await expect(latest.getByText(/^J−\d+$/)).toBeVisible();
  await bothThemes(page, 'Écran-titre');
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await noOverflow(page, `Écran-titre à ${width} px`);
  }

  await latest.getByRole('link', { name: 'Reprendre la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
});

test('mouvement réduit : les affiches et le titre ne s’animent pas', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  const poster = page
    .getByRole('list', { name: 'Mur d’affichage : les candidats fictifs de la campagne' })
    .locator('.animate-colle')
    .first();
  await expect(poster).toBeVisible();
  const durations = await page.evaluate(() =>
    ['.animate-colle', '.animate-titre'].map(
      (selector) => getComputedStyle(document.querySelector(selector)!).animationDuration,
    ),
  );
  expect(durations).toEqual(['0.001s', '0.001s']);
  await context.close();
});

test('création en chapitres : affiche en direct, boussole, un seul bouton de création', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/nouvelle-partie');
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle partie' })).toBeVisible();
  for (const chapter of [
    'La partie',
    'Votre candidat',
    'Le mouvement',
    'Le terrain',
    'Le calendrier',
  ])
    await expect(page.getByRole('heading', { level: 2, name: chapter })).toBeVisible();

  const recap = page.getByRole('complementary', { name: 'Récapitulatif' });
  await expect(recap.getByText('Votre mouvement')).toBeVisible();
  await page.getByLabel('Prénom').fill('Hélène');
  await page.getByLabel(/^Nom \*/).fill('Vasseur');
  await page.getByLabel(/^Parti ou mouvement/).fill('Renouveau citoyen');
  await expect(recap.getByText('Vasseur')).toBeVisible();
  await expect(recap.getByText('Renouveau citoyen')).toBeVisible();

  // Boussole : un toucher dans le quart « gauche progressiste » règle les deux curseurs.
  const compass = page.locator('svg[viewBox="-100 -100 200 200"]');
  await compass.scrollIntoViewIfNeeded();
  const box = (await compass.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
  await expect(page.getByLabel(/Positionnement économique/)).toHaveValue('-50');
  await expect(page.getByLabel(/Positionnement sociétal/)).toHaveValue('-50');

  await page.getByRole('radio', { name: /Expert/ }).check();
  await expect(recap.getByText('Expert', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer la partie' })).toHaveCount(1);
  await bothThemes(page, 'Création');
  await noOverflow(page, 'Création');
});

test('QG et débriefing : thème clair, cibles tactiles de 44 px', async ({ page }) => {
  test.setTimeout(120_000);
  await createGame(page, 'QG clair', 'e2e-qg-clair');
  await page.getByLabel('Thème').selectOption('clair');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await audit(page, 'QG (clair)');

  const resolve = page.getByRole('button', { name: 'Résoudre la semaine 0' });
  const targets = [
    resolve,
    ...(await page
      .getByRole('navigation', { name: 'Espaces de la partie' })
      .getByRole('link')
      .all()),
    page.getByLabel('Thème'),
  ];
  for (const target of targets) {
    const size = (await target.boundingBox())!;
    expect(
      Math.min(size.width, size.height),
      (await target.textContent()) ?? '',
    ).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole('button', { name: 'Ajouter Meeting public' }).click();
  await resolve.click();
  const debrief = page.getByRole('dialog', { name: 'Débriefing de la semaine 0' });
  await expect(debrief.getByRole('list', { name: 'Votre semaine en bref' })).toBeVisible();
  await audit(page, 'Débriefing (clair)');
  await closeDebrief(page, 0);
});
