import { expect, test, type Page } from '@playwright/test';

async function createGame(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await page.getByLabel('Nom de la partie').fill(name);
  await page.getByRole('radio', { name: /Observateur/ }).check();
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
}

async function readStateHash(page: Page): Promise<string> {
  await page.getByText('Paramètres techniques').click();
  const hash = (await page.getByTestId('empreinte').textContent()) ?? '';
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  return hash;
}

async function openScreen(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: 'Écrans de la partie' })
    .getByRole('link', { name: label })
    .click();
}

test('créer une partie, sauvegarder, restaurer puis reprendre sans perte', async ({
  page,
  context,
}) => {
  await createGame(page, 'Campagne Playwright');
  await expect(page.getByText('lundi 28 septembre 2026').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Semaine suivante/ })).toBeDisabled();
  const initialHash = await readStateHash(page);

  await openScreen(page, 'Sauvegardes');
  const slot1 = page.getByRole('listitem', { name: 'Emplacement 1' });
  await page.getByLabel(/Libellé/).fill('Départ');
  await slot1.getByRole('button', { name: 'Sauvegarder ici' }).click();
  await expect(page.getByText('Partie sauvegardée dans l’emplacement 1.')).toBeVisible();
  await expect(slot1.getByText(/Départ — Semaine 0/)).toBeVisible();

  // Écraser exige une confirmation.
  await slot1.getByRole('button', { name: 'Écraser' }).click();
  await expect(slot1.getByText('Écraser la sauvegarde existante ?')).toBeVisible();
  await slot1.getByRole('button', { name: 'Annuler' }).click();

  await slot1.getByRole('button', { name: 'Restaurer' }).click();
  await slot1.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByText('Emplacement 1 restauré (semaine 0).')).toBeVisible();

  // « Fermer » puis reprendre : nouvel onglet, même session, relecture depuis le serveur.
  const gameUrl = page.url().replace(/\/sauvegardes$/, '/tableau-de-bord');
  await page.close();
  const resumed = await context.newPage();
  await resumed.goto('/');
  await resumed.getByRole('link', { name: /Campagne Playwright/ }).click();
  await expect(resumed).toHaveURL(gameUrl);
  expect(await readStateHash(resumed)).toBe(initialHash);
});

test('les écrans non implémentés sont annoncés comme tels', async ({ page }) => {
  await createGame(page, 'Écrans');
  await openScreen(page, 'Carte électorale');
  await expect(page.getByText('Non disponible — prévu en phase 4')).toBeVisible();
  await openScreen(page, 'Journal');
  await expect(page.getByText('Non disponible — prévu en phase 2')).toBeVisible();
});

test('une date de départ invalide est refusée par le serveur', async ({ page }) => {
  await page.goto('/nouvelle-partie');
  await page.getByLabel('Nom de la partie').fill('Date invalide');
  await page.getByLabel('Date de départ').fill('2026-09-29');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('alert')).toContainText('doit être un lundi');
});

test('aucun défilement horizontal de la page', async ({ page }) => {
  await createGame(page, 'Largeur');
  for (const path of ['', '/sauvegardes']) {
    if (path) await openScreen(page, 'Sauvegardes');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
