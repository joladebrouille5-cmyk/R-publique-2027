import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fillCandidate, settled, toQG, wizardTo } from './helpers';

// Phase 20 : palmarès à l'écran-titre (niveau, déblocages, défi du jour) et défi du jour lancé
// depuis l'écran-titre, paramètres imposés par le serveur.

test('palmarès et défi du jour : niveau, verrous, défi lancé puis compté', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  const level = page.getByRole('region', { name: 'Votre niveau' });
  await expect(level.getByRole('meter')).toBeVisible();
  await expect(level.getByRole('list', { name: 'Déblocages' })).toContainText('Niveau Légende');
  const defi = page.getByRole('region', { name: 'Défi du jour' });
  await expect(defi).toContainText('Même campagne pour tous ce');
  await settled(page);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);

  await defi.getByRole('link', { name: 'Relever le défi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Défi du jour' })).toBeVisible();
  await fillCandidate(page, 'Défi');
  await wizardTo(page, 'Le terrain');
  await expect(page.getByText('Étape 4 sur 4')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Difficulté' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Relever le défi' }).click();
  await toQG(page);
  // Partie au format court, niveau Standard, comme le défi l'impose.
  await expect(page.getByRole('button', { name: /^La partie/ })).toContainText('Standard');

  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Défi du jour' })).toContainText(
    /\d+ tentatives? aujourd’hui, premier tour à venir\./,
  );
  await expect(page.getByRole('link', { name: /Défi du jour du / }).first()).toBeVisible();
});
