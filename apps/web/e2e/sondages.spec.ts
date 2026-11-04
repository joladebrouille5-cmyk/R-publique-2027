import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { advanceViaApi, createGame, openScreen } from './helpers';

// Sondages stables et expliqués (phase 11) : chaque vague donne l'écart depuis la précédente du
// même institut, et « Pourquoi ça bouge ? » le décompose par facteur, jusqu'au total.

test('chaque sondage explique l’écart depuis la vague précédente de l’institut', async ({
  page,
}) => {
  await createGame(page, 'Sondages expliqués', 'e2e-sondages');
  const game = await advanceViaApi(page, (g) => g.week >= 4);
  await page.reload();
  await openScreen(page, 'Sondages');

  const latest = page.getByRole('region', { name: /^Dernier sondage/ });
  await expect(latest.getByRole('columnheader', { name: 'Écart' })).toBeVisible();
  const why = latest.getByRole('region', { name: 'Pourquoi ça bouge ?' });
  await expect(why).toBeVisible();
  await expect(why.getByText('Camille Durand (vous)')).toBeVisible();
  await expect(why.getByText('Total').first()).toBeVisible();

  // L'écart affiché du joueur est celui du moteur (variation de sa ligne).
  const poll = [...game.state.polls].reverse().find((p) => p.kind === 'intentions_t1')!;
  const mine = poll.results.find((r) => r.actorId === game.state.player.actorId)!;
  expect(mine.variation).not.toBeNull();
  expect(mine.explication.reduce((sum, c) => sum + c.valeur, 0)).toBe(mine.variation);

  // Un autre candidat se déplie.
  const other = why.getByRole('group').first();
  await other.locator('summary').click();
  await expect(other.getByText('Total')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
});

test('l’évolution se lit en courbes, au clavier, de jour comme de nuit', async ({ page }) => {
  await createGame(page, 'Courbes', 'e2e-courbes');
  const game = await advanceViaApi(page, (g) => g.week >= 5);
  await page.reload();
  await openScreen(page, 'Sondages');

  const trend = page.getByRole('region', { name: 'Évolution des intentions au premier tour' });
  const chart = trend.getByRole('img', {
    name: /^Intentions de vote au premier tour sur \d+ sondages/,
  });
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /vous : /);

  // Au clavier : la première vague, puis la dernière.
  const polls = game.state.polls.filter((p) => p.kind === 'intentions_t1');
  const explorer = trend.getByRole('group', { name: /Parcourir les sondages/ });
  await explorer.focus();
  await page.keyboard.press('Home');
  await expect(trend.getByRole('status')).toContainText(`Semaine ${polls[0]!.week}`);
  await page.keyboard.press('End');
  await expect(trend.getByRole('status')).toContainText(`Semaine ${polls.at(-1)!.week}`);

  // Le tableau reste à portée.
  await trend.getByText('Voir le tableau des derniers sondages').click();
  await expect(trend.getByRole('table')).toBeVisible();

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page })
      .include('section[aria-labelledby="titre-evolution"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(audit.violations.map((v) => `${colorScheme} — ${v.id} : ${v.help}`)).toEqual([]);
  }
});
