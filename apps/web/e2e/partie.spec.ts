import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { AdvanceResponseSchema, GameDetailSchema, type GameDetail } from '@r2027/shared';

async function createGame(page: Page, name: string, seed = 'e2e-boucle') {
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await page.getByLabel('Nom de la partie').fill(name);
  await page.getByLabel('Prénom').fill('Camille');
  await page.getByLabel(/^Nom \*/).fill('Durand');
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement Playwright');
  await page.getByLabel('Graine (facultative)').fill(seed);
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
}

/** Identifiant de la partie affichée, d'après l'URL. */
const gameIdOf = (page: Page) => /\/parties\/([0-9a-f-]{36})\//.exec(page.url())![1]!;

/**
 * Fait avancer la partie par l'API (même session que le navigateur) jusqu'à la fin de la
 * présidentielle, en répondant aux décisions par l'option par défaut.
 */
async function playToEndViaApi(page: Page): Promise<GameDetail> {
  const id = gameIdOf(page);
  let game = GameDetailSchema.parse(await (await page.request.get(`/api/games/${id}`)).json());
  for (let i = 0; i < 60 && !game.state.calendar.blockedBy; i++) {
    const response = await page.request.post(`/api/games/${id}/advance`, {
      headers: { 'idempotency-key': randomUUID().replaceAll('-', '') },
      data: {
        expectedWeek: game.week,
        actions: [],
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
    });
    expect(response.status()).toBe(200);
    game = AdvanceResponseSchema.parse(await response.json()).game;
  }
  expect(game.state.calendar.blockedBy).toBe('fin-de-la-presidentielle');
  return game;
}

async function readStateHash(page: Page): Promise<string> {
  await page.getByText('Paramètres techniques').click();
  const hash = (await page.getByTestId('empreinte').textContent()) ?? '';
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await page.getByText('Paramètres techniques').click();
  return hash;
}

async function openScreen(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: 'Écrans de la partie' })
    .getByRole('link', { name: label })
    .click();
}

/** Répond aux éventuelles décisions en attente (premier choix), puis résout la semaine. */
async function resolveWeek(page: Page, week: number) {
  const decisions = page.getByRole('region', { name: 'Décisions à prendre' });
  if (await decisions.isVisible()) {
    for (const group of await decisions.getByRole('group').all()) {
      await group.getByRole('radio').first().check();
    }
  }
  await page.getByRole('button', { name: `Résoudre la semaine ${week}` }).click();
  await expect(
    page.getByRole('heading', { name: `Bilan de la semaine ${week}`, exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: `Résoudre la semaine ${week + 1}` })).toBeVisible();
}

test('boucle complète : actions, progression, bilan, sauvegarde, restauration, journal', async ({
  page,
  context,
}) => {
  await createGame(page, 'Campagne Playwright');
  const budget = page.getByTestId('ressource-budgetCentimes');
  await expect(budget).toHaveText(/800\s000\s€/);

  await page.getByRole('button', { name: 'Ajouter Meeting public' }).click();
  await page.getByRole('button', { name: 'Ajouter Rencontre avec des élus locaux' }).click();
  await expect(
    page.getByRole('list', { name: 'Actions programmées' }).getByRole('listitem'),
  ).toHaveCount(2);
  await resolveWeek(page, 0);

  // Effet visible : coût débité exactement, détaillé par facteurs dans le bilan.
  await expect(budget).toHaveText(/767\s000\s€/);
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
  await openScreen(page, 'Carte électorale');
  await expect(page.getByText('Non disponible — prévu en phase 4')).toBeVisible();
  await openScreen(page, 'Programme');
  await expect(page.getByText('Non disponible — prévu en phase 5')).toBeVisible();
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

  const final = await playToEndViaApi(page);
  await page.reload();
  await openScreen(page, 'Résultats');
  const t2 = page.getByRole('region', { name: 'Second tour' });
  const winner = final.state.actors[final.state.elections.t2!.winner!]!.candidate;
  await expect(
    t2.getByText(`${winner.prenom} ${winner.nom} est élu(e) président(e) de la République.`),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Premier tour' })).toBeVisible();

  await openScreen(page, 'Tableau de bord');
  await expect(page.getByRole('alert').filter({ hasText: /élu\(e\)/ })).toBeVisible();
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
  for (const screen of [null, 'Candidats', 'Sondages', 'Résultats', 'Journal', 'Sauvegardes']) {
    if (screen) await openScreen(page, screen);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `écran ${screen ?? 'Tableau de bord'}`).toBeLessThanOrEqual(0);
  }
});
