import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame, openScreen, resolveWeek } from './helpers';

async function readStateHash(page: Page): Promise<string> {
  await page.getByText('Paramètres techniques').click();
  const hash = (await page.getByTestId('empreinte').textContent()) ?? '';
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await page.getByText('Paramètres techniques').click();
  return hash;
}

/** Répond aux éventuelles décisions en attente (premier choix), puis résout la semaine. */

test('boucle complète : actions, progression, bilan, sauvegarde, restauration, journal', async ({
  page,
  context,
}) => {
  await createGame(page, 'Campagne Playwright');
  const budget = page.getByTestId('ressource-budgetCentimes');
  await expect(budget).toHaveText(/3\s000\s000\s€/);

  await page.getByRole('button', { name: 'Ajouter Meeting public' }).click();
  await page.getByRole('button', { name: 'Ajouter Rencontre avec des élus locaux' }).click();
  await expect(
    page.getByRole('list', { name: 'Actions programmées' }).getByRole('listitem'),
  ).toHaveCount(2);
  // Une rencontre d'élus vise un département : la semaine ne se résout pas sans lui.
  await expect(page.getByRole('button', { name: 'Résoudre la semaine 0' })).toBeDisabled();
  await page.getByLabel(/Cible de l’action n° 2/).selectOption('01');
  await resolveWeek(page, 0);

  // Effet visible : coût débité exactement, détaillé par facteurs dans le bilan.
  await expect(budget).toHaveText(/2\s870\s000\s€/);
  const report = page.getByRole('region', { name: /Bilan de la semaine 0/ });
  const budgetChange = report.locator('details', {
    has: page.getByText('Budget', { exact: true }),
  });
  await budgetChange.getByText('Budget', { exact: true }).click();
  await expect(budgetChange.getByText('Meeting public : coût')).toBeVisible();
  await expect(budgetChange.getByText('Rencontre avec des élus locaux : coût')).toBeVisible();
  const week1Hash = await readStateHash(page);

  // Sauvegarde manuelle en semaine 1, puis une semaine de plus.
  await openScreen(page, 'Sauvegardes');
  await page
    .getByRole('listitem', { name: 'Emplacement 1' })
    .getByRole('button', { name: 'Sauvegarder ici' })
    .click();
  await expect(page.getByText('Partie sauvegardée dans l’emplacement 1.')).toBeVisible();
  await expect(
    page.getByRole('listitem', { name: 'Sauvegarde automatique semaine 1' }),
  ).toBeVisible();
  await openScreen(page, 'Tableau de bord');
  await resolveWeek(page, 1);
  expect(await readStateHash(page)).not.toBe(week1Hash);

  // Restauration : retour exact à la semaine 1.
  await openScreen(page, 'Sauvegardes');
  const slot1 = page.getByRole('listitem', { name: 'Emplacement 1' });
  await slot1.getByRole('button', { name: 'Restaurer' }).click();
  await slot1.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByText('Emplacement 1 restauré (semaine 1).')).toBeVisible();
  await openScreen(page, 'Tableau de bord');
  await expect(page.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeVisible();
  expect(await readStateHash(page)).toBe(week1Hash);

  // Journal : semaines résolues et restauration, rien n'est effacé.
  await openScreen(page, 'Journal');
  await expect(page.getByText(/^Semaine 1 — /)).toBeVisible();
  await expect(page.getByText(/^Semaine 0 — /)).toBeVisible();
  await expect(page.getByText('Sauvegarde restaurée')).toBeVisible();

  // Reprise après « fermeture » : nouvel onglet, état relu depuis le serveur.
  const gameUrl = page.url().replace(/\/journal$/, '/tableau-de-bord');
  await page.close();
  const resumed = await context.newPage();
  await resumed.goto(gameUrl);
  expect(await readStateHash(resumed)).toBe(week1Hash);
});

test('export puis import dans une nouvelle partie identique', async ({ page }) => {
  await createGame(page, 'Partie exportée', 'e2e-export');
  await resolveWeek(page, 0);
  const hash = await readStateHash(page);

  await openScreen(page, 'Sauvegardes');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exporter la partie (JSON)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('republique-2027-partie-exportee-semaine-1.json');
  const path = await download.path();
  const content = await readFile(path, 'utf8');
  expect(JSON.parse(content)).toMatchObject({ format: 'republique-2027/partie', stateHash: hash });

  await page.getByLabel('Importer un fichier de partie').setInputFiles({
    name: 'partie.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  await expect(page.getByText('Partie exportée (importée)')).toBeVisible();
  expect(await readStateHash(page)).toBe(hash);
});

test('les écrans non implémentés sont annoncés comme tels', async ({ page }) => {
  await createGame(page, 'Écrans', 'e2e-ecrans');
  await openScreen(page, 'Gouvernement');
  await expect(page.getByText('Non disponible — prévu en phase 6')).toBeVisible();
});

test('présidentielle complète : candidat, sondages, deux tours et résultats', async ({ page }) => {
  await createGame(page, 'Présidentielle', 'e2e-presidentielle');
  await openScreen(page, 'Candidats');
  const mine = page.getByRole('listitem', { name: 'Camille Durand' });
  await expect(mine.getByText('Votre candidat')).toBeVisible();
  await expect(page.getByText('Fictif', { exact: true })).toHaveCount(7);

  await openScreen(page, 'Tableau de bord');
  await resolveWeek(page, 0);
  await openScreen(page, 'Sondages');
  const latest = page.getByRole('region', { name: /Dernier sondage/ });
  await expect(latest.getByText(/1\s000 personnes/)).toBeVisible();
  await expect(latest.getByText('Camille Durand (vous)')).toBeVisible();

  const final = await advanceViaApi(page, (g) => g.state.calendar.blockedBy !== null);
  expect(final.state.calendar.blockedBy).toBe('fin-de-la-presidentielle');
  await page.reload();
  await openScreen(page, 'Résultats');
  const t2 = page.getByRole('region', { name: 'Second tour' });
  const winner = final.state.actors[final.state.elections.t2!.winner!]!.candidate;
  await expect(
    t2.getByText(`${winner.prenom} ${winner.nom} est élu(e) président(e) de la République.`),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Premier tour' })).toBeVisible();

  await openScreen(page, 'Tableau de bord');
  // Alerte du tableau de bord (le bilan de la dernière semaine, chargé ensuite, en a une autre).
  const blocked = page
    .getByRole('alert')
    .filter({ has: page.getByRole('link', { name: 'Voir les résultats' }) });
  await expect(blocked).toContainText(/élu\(e\)/);
  await expect(page.getByRole('button', { name: /Résoudre la semaine/ })).toBeDisabled();
});

test('une date de départ invalide est refusée par le serveur', async ({ page }) => {
  await page.goto('/nouvelle-partie');
  await page.getByLabel('Nom de la partie').fill('Date invalide');
  await page.getByLabel(/^Nom \*/).fill('Durand');
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement Playwright');
  await page.getByLabel('Date de départ').fill('2026-09-29');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('alert')).toContainText('doit être un lundi');
});

test('aucun défilement horizontal de la page', async ({ page }) => {
  await createGame(page, 'Largeur', 'e2e-largeur');
  await resolveWeek(page, 0);
  for (const screen of [
    null,
    'Carte électorale',
    'Candidats',
    'Sondages',
    'Résultats',
    'Journal',
    'Sauvegardes',
  ]) {
    if (screen) await openScreen(page, screen);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `écran ${screen ?? 'Tableau de bord'}`).toBeLessThanOrEqual(0);
  }
});
