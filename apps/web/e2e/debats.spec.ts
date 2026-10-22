import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceAsCandidate, createGame, openScreen } from './helpers';

// Débats télévisés (phase 10) : débat de tous les candidats joué sur le plateau (carte, attaque
// ciblée, fin simulée, sondage flash), puis débat de l'entre-deux-tours revu depuis les
// résultats ; accessibilité vérifiée dans les deux thèmes.

async function audit(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('le débat de tous les candidats se joue carte par carte sur le plateau', async ({ page }) => {
  test.setTimeout(150_000);
  await createGame(page, 'Débat du premier tour', 'e2e-debat');
  const game = await advanceAsCandidate(page, (g) =>
    g.state.debats.seances.some((d) => d.id === 'debat-t1-tous' && d.semaine === g.week),
  );
  const session = game.state.debats.seances.find((d) => d.id === 'debat-t1-tous')!;
  expect(session.invites).toContain(game.state.player.actorId);
  await page.reload();

  // Tableau de bord : le débat de la semaine, l'entrée sur le plateau.
  const panel = page.getByRole('region', { name: 'Débats télévisés' });
  await expect(panel.getByText('Débat de tous les candidats')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Refuser ce débat' })).toBeVisible();
  await panel.getByRole('link', { name: 'Entrer sur le plateau' }).click();

  await expect(page.getByRole('heading', { name: 'Débat de tous les candidats' })).toBeVisible();
  await expect(page.getByText('En direct', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pupitres' }).getByRole('listitem')).toHaveCount(
    session.invites.length,
  );
  const cards = page.getByRole('list', { name: 'Cartes de la séquence' });
  await expect(cards.getByRole('button')).toHaveCount(3);
  await audit(page, 'plateau');
  await noOverflow(page);

  // Une carte, puis une attaque ciblée.
  await cards.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: /^Séquence 2 :/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Déroulé du débat' })).toBeVisible();
  await cards.getByRole('button', { name: /^Attaquer/ }).click();
  const form = page.getByRole('form', { name: 'Préparer l’attaque' });
  await form.getByRole('radio').first().check();
  await form.getByRole('radio', { name: /Comptes de campagne/ }).check();
  await audit(page, 'attaque');
  await form.getByRole('button', { name: 'Lancer l’attaque' }).click();
  await expect(page.getByRole('heading', { name: /^Séquence 3 :/ })).toBeVisible();
  await expect(page.getByText(/Attaque .+ : Comptes de campagne/).first()).toBeVisible();

  // Fin simulée : sondage flash et relecture.
  await page.getByRole('button', { name: 'Simuler la fin du débat' }).click();
  await expect(page.getByText('Débat terminé', { exact: true })).toBeVisible();
  const poll = page.getByRole('region', { name: 'Le plus convaincant' });
  await expect(poll.getByText('Sondage flash simulé')).toBeVisible();
  await expect(poll.getByRole('listitem')).toHaveCount(session.invites.length);
  await expect(page.getByRole('list', { name: 'Cartes de la séquence' })).toHaveCount(0);
  // Audits sur le déroulé complet (pendant la relecture, les coups apparaissent en fondu).
  await noOverflow(page);
  await audit(page, 'fin');
  await page.getByLabel('Thème').selectOption('clair');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await audit(page, 'clair');
  await page.getByRole('button', { name: 'Revoir en accéléré' }).click();

  // Le débat tenu figure dans les résultats.
  await openScreen(page, 'Résultats');
  const results = page.getByRole('region', { name: 'Débats télévisés' });
  await expect(results.getByText('Débat de tous les candidats')).toBeVisible();
  await expect(results.getByRole('link', { name: 'Revoir' }).first()).toBeVisible();
});

test('le débat de l’entre-deux-tours oppose les deux finalistes et se revoit ensuite', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Graine où le joueur est éliminé au premier tour et où les deux finalistes débattent.
  await createGame(page, 'Débat du second tour', 'e2e-t2-a');
  const week = await advanceAsCandidate(page, (g) =>
    g.state.debats.seances.some((d) => d.id === 'debat-t2' && d.semaine === g.week),
  );
  const session = week.state.debats.seances.find((d) => d.id === 'debat-t2')!;
  expect(session.tour).toBe(2);
  expect(session.invites).toHaveLength(2);
  expect(session.refus).toEqual([]);
  expect(session.invites).not.toContain(week.state.player.actorId);
  await page.reload();

  // Avant la résolution : le joueur n'est pas sur le plateau, le débat sera simulé.
  const panel = page.getByRole('region', { name: 'Débats télévisés' });
  await expect(panel.getByText('Débat d’entre-deux-tours')).toBeVisible();
  await expect(panel.getByText(/Vous n’êtes pas sur ce plateau/)).toBeVisible();
  await panel.getByRole('link', { name: 'Le plateau' }).click();
  await expect(page.getByRole('heading', { name: 'Débat d’entre-deux-tours' })).toBeVisible();
  await expect(page.getByText(/Le débat sera simulé à la résolution de la semaine/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Cartes de la séquence' })).toHaveCount(0);

  // Après la résolution : relecture du débat des deux finalistes.
  await advanceAsCandidate(page, (g) => g.week > week.week);
  await page.reload();
  await expect(page.getByText('Débat terminé', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pupitres' }).getByRole('listitem')).toHaveCount(2);
  const poll = page.getByRole('region', { name: 'Le plus convaincant' });
  await expect(poll.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: /^Séquence 6 : / })).toBeVisible();
  await noOverflow(page);
  await audit(page, 'entre-deux-tours');
  await page.getByRole('button', { name: 'Revoir en accéléré' }).click();

  await openScreen(page, 'Résultats');
  const results = page.getByRole('region', { name: 'Débats télévisés' });
  await expect(
    results.getByRole('listitem').filter({ hasText: 'Débat d’entre-deux-tours' }),
  ).toContainText('jugé(e) le plus convaincant');
});
