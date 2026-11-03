import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeDebrief, createGame, settled, wizardTo } from './helpers';

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
    // Phase 21 : le second passage d'encre de l'affiche-titre (calage) ne s'anime pas non plus.
    ['.animate-colle', '.animate-calage'].map(
      (selector) => getComputedStyle(document.querySelector(selector)!).animationDuration,
    ),
  );
  expect(durations).toEqual(['0.001s', '0.001s']);
  // Phase 22 : ni délai — les huit panneaux sont garnis d'emblée, aucune affiche n'attend son tour.
  expect(await page.locator('.animate-colle').count()).toBeGreaterThan(1);
  const states = () =>
    page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll('.animate-colle')].map((el) => {
          const style = getComputedStyle(el);
          return `${style.animationDelay} ${style.opacity}`;
        }),
      ),
    ]);
  // Opaques en moins de 150 ms (sans le correctif, la dernière affiche attendait 1 s).
  await expect.poll(states, { timeout: 150, intervals: [25] }).toEqual(['0s 1']);
  await context.close();
});

test('création en assistant : une étape à la fois, affiche en direct, boussole, format', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/nouvelle-partie');
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle partie' })).toBeVisible();
  // Une étape à la fois : la première, sans bouton Précédent.
  await expect(page.getByRole('heading', { level: 2, name: 'La partie' })).toBeVisible();
  await expect(page.getByText('Étape 1 sur 5')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Le terrain' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Précédent' })).toHaveCount(0);
  await bothThemes(page, 'Création, étape 1');

  const recap = page.getByRole('complementary', { name: 'Récapitulatif' });
  await expect(recap.getByText('Votre mouvement')).toBeVisible();
  await wizardTo(page, 'Votre candidat');
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
  await bothThemes(page, 'Création, candidat');
  await noOverflow(page, 'Création, candidat');

  // Parcours : profil puis variante, réunis sur une même étape.
  await wizardTo(page, 'Votre parcours');
  await expect(page.getByRole('group', { name: 'Votre parcours' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Variante de campagne (facultative)' }),
  ).toBeVisible();
  // Précédent revient à l'étape d'avant, sans rien perdre.
  await page.getByRole('button', { name: 'Précédent' }).click();
  await expect(page.getByLabel(/^Nom \*/)).toHaveValue('Vasseur');

  await wizardTo(page, 'Le terrain');
  await page.getByRole('radio', { name: /Expert/ }).check();
  await expect(recap.getByText('Expert', { exact: true })).toBeVisible();
  await wizardTo(page, 'Le format');
  await page.getByRole('radio', { name: /Court/ }).check();
  await expect(recap.getByText('Court', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suivant' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Créer la partie' })).toHaveCount(1);
  await page.getByText('Options avancées').click();
  await expect(page.getByLabel('Nom de la partie')).toHaveAttribute(
    'placeholder',
    'Campagne de Hélène Vasseur',
  );
  await bothThemes(page, 'Création, format');
  await noOverflow(page, 'Création, format');
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
