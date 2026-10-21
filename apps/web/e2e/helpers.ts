// Outils partagés des scénarios Playwright.
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { AdvanceResponseSchema, GameDetailSchema, type GameDetail } from '@r2027/shared';

export async function createGame(page: Page, name: string, seed = 'e2e-boucle') {
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
export const gameIdOf = (page: Page) => /\/parties\/([0-9a-f-]{36})\//.exec(page.url())![1]!;

/**
 * Fait avancer la partie par l'API (même session que le navigateur) jusqu'à ce que `done`
 * soit vrai ou que la partie se bloque, en répondant aux décisions par l'option par défaut.
 */
export async function advanceViaApi(
  page: Page,
  done: (game: GameDetail) => boolean,
): Promise<GameDetail> {
  const id = gameIdOf(page);
  let game = GameDetailSchema.parse(await (await page.request.get(`/api/games/${id}`)).json());
  for (let i = 0; i < 60 && !done(game) && !game.state.calendar.blockedBy; i++) {
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
  return game;
}

export async function openScreen(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: 'Écrans de la partie' })
    .getByRole('link', { name: label })
    .click();
}

/** Résout la semaine depuis le tableau de bord (décisions : première option). */
export async function resolveWeek(page: Page, week: number) {
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
