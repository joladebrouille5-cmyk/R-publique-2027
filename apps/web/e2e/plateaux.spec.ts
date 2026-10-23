import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createGame, openSection } from './helpers';

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
  // Débriefing plein écran : le passage, son niveau et ses raisons ; audit d'accessibilité.
  const debrief = page.getByRole('dialog', { name: 'Débriefing de la semaine 0' });
  await expect(debrief.getByRole('list', { name: 'Raisons du score' })).toContainText(
    'Posture offensive, format « Décryptage »',
  );
  await expect(debrief.getByRole('region', { name: 'Sondages de la semaine' })).toBeVisible();
  const overlay = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(overlay.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
  // Sur téléphone, le bouton « Continuer » reste au-dessus de la barre de gestes.
  const proceed = debrief.getByRole('button', { name: 'Continuer' });
  const box = (await proceed.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press('Escape');
  await expect(debrief).toBeHidden();
  await expect(page.getByRole('heading', { name: /Bilan de la semaine 0/ })).toBeVisible();
  await openSection(page, 'bilan-semaine');
  const reasons = page.getByRole('list', { name: 'Raisons du score' });
  await expect(reasons).toContainText('Posture offensive, format « Décryptage »');
  await expect(reasons).toContainText(/Préparation \(0 h sur \d+ h utiles\)/);
  await expect(page.getByText(/^Passage (réussi|correct|décevant)$/)).toBeVisible();
});
