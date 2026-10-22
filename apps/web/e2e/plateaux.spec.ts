import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createGame } from './helpers';

// Passages dans les médias sans aléa (phase 11) : le joueur choisit la posture du passage ; le
// bilan de la semaine en donne le niveau, le score et chacune de ses raisons.

test('la posture d’un passage se choisit au plan et s’explique au bilan', async ({ page }) => {
  await createGame(page, 'Plateaux', 'e2e-plateaux');
  await page.getByRole('button', { name: 'Ajouter Passage dans un format décryptage' }).click();
  const posture = page.getByRole('group', { name: /Posture du passage n° 1/ });
  await expect(posture.getByRole('radio', { name: 'Pédagogique' })).toBeChecked();
  await posture.getByText('Offensive', { exact: true }).click();
  await expect(posture.getByRole('radio', { name: 'Offensive' })).toBeChecked();
  await expect(posture.getByText('Posture peu adaptée au format.')).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .include('[aria-label="Actions programmées"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);

  await page.getByRole('button', { name: 'Résoudre la semaine 0' }).click();
  await expect(page.getByRole('heading', { name: /Bilan de la semaine 0/ })).toBeVisible();
  const reasons = page.getByRole('list', { name: 'Raisons du score' });
  await expect(reasons).toContainText('Posture offensive, format « Décryptage »');
  await expect(reasons).toContainText(/Préparation \(0 h sur \d+ h utiles\)/);
  await expect(page.getByText(/^Passage (réussi|correct|raté)$/)).toBeVisible();
});
