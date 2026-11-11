import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GameDetailSchema } from '@r2027/shared';
import { fillCandidate, finishWizard, gameIdOf, onPlateau, settled } from './helpers';

// Plateau (phase 25) : la partie s'ouvre sur la table de jeu ; deux cartes Terrain posées au
// Finistère forment une série et un bastion ; « Jouer la semaine » ouvre le verdict ; la boîte
// de jeu ouvre chaque écran dans un panneau. Audits d'accessibilité, aucune page plus large que
// l'écran, et l'état final lu par l'API.

async function audit(page: Page, label: string, include?: string) {
  await settled(page);
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const result = await (include ? builder.include(include) : builder).analyze();
  expect(
    result.violations.map(
      (v) =>
        `${label} — ${v.id} : ${v.help} (${v.nodes.length}) ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any.map((a) => JSON.stringify(a.data)).join('')}`).join(' | ')}`,
    ),
  ).toEqual([]);
}

const card = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^Carte « ${name} »`) });
const finistere = (page: Page) => page.getByRole('button', { name: /^Finistère \(29\)/ });

test('une semaine au plateau : pose, combos, verdict, boîte de jeu', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/nouvelle-partie');
  await fillCandidate(page);
  await finishWizard(page, { name: 'Plateau', seed: 'e2e-plateau' });
  await page.waitForURL(/\/parties\/[0-9a-f-]{36}\/plateau$/);
  await onPlateau(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'plateau').toBeLessThanOrEqual(0);
  await audit(page, 'Plateau');

  // Deux portes-à-porte au Finistère : la carte se pose au toucher du département.
  for (let i = 0; i < 2; i++) {
    await card(page, 'Porte-à-porte').click();
    await expect(page.getByText(/Touchez un département du plateau/)).toBeVisible();
    await finistere(page).click();
  }
  await expect(finistere(page)).toHaveAccessibleName(/2 cartes posées/);
  const combos = page.getByRole('status', { name: 'Combos de la semaine' });
  await expect(combos).toContainText('Bastion ×1,5 : Finistère (29)');
  await expect(combos).toContainText('Série Terrain ×2 (+25 %)');

  // Le verdict : cartes retournées, combos, palier franchi.
  await page.getByRole('button', { name: 'Jouer la semaine 0' }).click();
  const verdict = page.getByRole('dialog', { name: 'Verdict de la semaine 0' });
  await expect(verdict).toBeVisible();
  await verdict.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(verdict.getByRole('region', { name: 'Combos' })).toContainText(
    'Bastion ×1,5 : Finistère (29)',
  );
  await expect(
    verdict.getByRole('region', { name: 'Départements qui changent de palier' }),
  ).toContainText('Finistère (29)');
  await audit(page, 'Verdict', '[role="dialog"]');
  await verdict.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(verdict).toBeHidden();
  await expect(page.getByRole('button', { name: 'Jouer la semaine 1' })).toBeVisible();

  // L'état du serveur : l'implantation gagnée au Finistère, lue sur le plateau.
  const game = GameDetailSchema.parse(
    await (await page.request.get(`/api/games/${gameIdOf(page)}`)).json(),
  );
  const player = game.state.player.actorId!;
  const value = game.state.implantation[player]!['29']!;
  expect(value).toBeGreaterThan(0);
  await expect(finistere(page)).toHaveAccessibleName(new RegExp(`implantation ${value} sur 100`));

  // Les décisions de la semaine 1 s'ouvrent en cartes plein écran : on les remet à plus tard.
  const decision = page.getByRole('dialog');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    if (!(await decision.isVisible())) break;
    await page.keyboard.press('Escape');
  }

  // Phase 25 bis : la carte des intentions de vote, dans chaque lecture, au toucher.
  const readings = page.getByRole('radiogroup', { name: 'Lecture du plateau' });
  for (const reading of ['Implantation', 'Qui mène', 'Sondage local']) {
    await readings.getByRole('radio', { name: reading }).click();
    await finistere(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await finistere(page).click();
    await expect(
      page.getByRole('table', { name: /^Intentions de vote dans Finistère \(29\)/ }),
    ).toBeVisible();
    await expect(finistere(page)).toHaveAccessibleName(/intentions.* : .*\d+,\d %/);
    await finistere(page).click();
  }
  // Phase 26 : main déployée, la légende est repliée (elle ne passe plus sous les cartes) ; elle
  // s'ouvre au toucher.
  await expect(page.getByRole('list', { name: 'Légende' })).toBeHidden();
  await page.getByText(/^Légende \(\d+ teintes\)$/).click();
  await expect(page.getByRole('list', { name: 'Légende' })).toBeVisible();
  await audit(page, 'Plateau, lecture « Sondage local »');
  await readings.getByRole('radio', { name: 'Qui mène' }).click();
  await expect(page.getByRole('list', { name: 'Légende' })).toContainText(/\(\d+ départements?\)/);
  await audit(page, 'Plateau, lecture « Qui mène »');

  // La boîte de jeu : chaque écran dans son panneau, Échap rend le focus au bouton.
  const box = page.getByRole('button', { name: 'Boîte de jeu' });
  await box.click();
  const grid = page.getByRole('dialog', { name: 'Boîte de jeu' });
  await expect(grid).toBeVisible();
  await audit(page, 'Boîte de jeu', '[role="dialog"]');
  await grid.getByRole('button', { name: /^Sondages/ }).click();
  const panel = page.getByRole('dialog', { name: 'Sondages' });
  await expect(panel).toBeVisible();
  expect(new URL(page.url()).search).toBe('?panneau=sondages');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(box).toBeFocused();
});
