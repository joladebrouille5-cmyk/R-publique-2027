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
  /** Avance rapide (semaines par requête, arrêtée par le serveur avant toute décision). */
  semaines?: number,
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
        ...(semaines ? { semaines } : {}),
      },
    });
    expect(response.status()).toBe(200);
    game = AdvanceResponseSchema.parse(await response.json()).game;
  }
  return game;
}

/**
 * Comme `advanceViaApi`, mais en candidat : deux actions « élus locaux » par semaine jusqu'à la
 * clôture des parrainages, puis la préparation des débats jusqu'au premier tour.
 */
export async function advanceAsCandidate(
  page: Page,
  done: (game: GameDetail) => boolean,
): Promise<GameDetail> {
  const id = gameIdOf(page);
  let game = GameDetailSchema.parse(await (await page.request.get(`/api/games/${id}`)).json());
  const ruleset = (await (
    await page.request.get(`/api/rulesets/${encodeURIComponent(game.rulesetVersion)}`)
  ).json()) as {
    parrainages: { reservoir: { departements: Record<string, unknown> } };
    calendrier: { echeances: { id: string; date: string }[] };
  };
  const departements = Object.keys(ruleset.parrainages.reservoir.departements).sort();
  const closing = ruleset.calendrier.echeances.find((e) => e.id === 'presentation-candidatures')!;
  for (let i = 0; i < 60 && !done(game) && !game.state.calendar.blockedBy; i++) {
    const actions =
      game.date < closing.date
        ? [0, 1].map((k) => ({
            actionId: 'elus-locaux',
            cible: departements[(game.week * 2 + k) % departements.length]!,
          }))
        : game.state.elections.t1
          ? []
          : [{ actionId: 'preparation-debat' }];
    const response = await page.request.post(`/api/games/${id}/advance`, {
      headers: { 'idempotency-key': randomUUID().replaceAll('-', '') },
      data: {
        expectedWeek: game.week,
        actions,
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    game = AdvanceResponseSchema.parse(await response.json()).game;
  }
  return game;
}

/**
 * Ouvre un écran par le menu « Écrans de la partie » : rail sur ordinateur, feuille ouverte
 * par « Tous les écrans » sur mobile (barre du bas).
 */
export async function openScreen(page: Page, label: string) {
  const nav = page.getByRole('navigation', { name: 'Écrans de la partie' });
  const more = page.getByRole('button', { name: 'Tous les écrans' });
  await expect(nav.or(more).first()).toBeVisible();
  if (!(await nav.isVisible())) await more.click();
  await nav.getByRole('link', { name: label }).click();
}

/** Résout la semaine depuis le tableau de bord (décisions : première option). */
export async function resolveWeek(page: Page, week: number) {
  const decisions = page.getByRole('region', { name: 'Décisions à prendre' });
  if (await decisions.isVisible()) {
    // Une décision par fieldset (les groupes repliables d'une nomination sont aussi des « group »).
    for (const decision of await decisions.locator('fieldset').all()) {
      await decision.getByRole('radio').first().check();
    }
  }
  await page.getByRole('button', { name: `Résoudre la semaine ${week}` }).click();
  await closeDebrief(page, week);
  await expect(
    page.getByRole('heading', { name: `Bilan de la semaine ${week}`, exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: `Résoudre la semaine ${week + 1}` })).toBeVisible();
}

/** Débriefing de la semaine (phase 11), ouvert après la résolution : le lire, puis continuer. */
export async function closeDebrief(page: Page, week: number) {
  const debrief = page.getByRole('dialog', { name: `Débriefing de la semaine ${week}` });
  await expect(debrief).toBeVisible();
  await debrief.getByRole('button', { name: 'Continuer' }).click();
  await expect(debrief).toBeHidden();
}

/**
 * Attend la fin des animations finies (entrées en fondu, montées) : un audit de contraste mené
 * pendant un fondu mesure des éléments encore transparents. Les animations infinies (voyant
 * « En direct », bandeau défilant) sont ignorées.
 */
export async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
}
