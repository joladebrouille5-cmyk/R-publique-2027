import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { advanceViaApi, createGame } from './helpers';

// Soirée électorale (P9-09) : le soir du premier tour, la partie passe en direct ; la carte se
// colore au fil du dépouillement simulé, le bandeau défile, la Somme se suit commune par commune.

const DAY_MS = 86_400_000;
const time = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

test('le soir du premier tour, la partie passe en direct jusqu’aux résultats définitifs', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createGame(page, 'Soirée électorale', 'e2e-soiree');
  const start = await advanceViaApi(page, () => true);
  const ruleset = (await (
    await page.request.get(`/api/rulesets/${encodeURIComponent(start.rulesetVersion)}`)
  ).json()) as { calendrier: { scrutins: { date: string }[] } };
  const firstRound = time(ruleset.calendrier.scrutins[0]!.date);
  // Veille du scrutin : la semaine suivante contient le premier tour.
  const eve = await advanceViaApi(page, (g) => time(g.date) + 7 * DAY_MS > firstRound);
  expect(eve.state.elections.t1).toBeNull();
  await page.reload();

  const decisions = page.getByRole('region', { name: 'Décisions à prendre' });
  if (await decisions.isVisible())
    for (const group of await decisions.getByRole('group').all())
      await group.getByRole('radio').first().check();
  await page.getByRole('button', { name: `Résoudre la semaine ${eve.week}` }).click();

  // Passage automatique en direct.
  await expect(page.getByRole('heading', { name: 'Soirée électorale' })).toBeVisible();
  await expect(page).toHaveURL(/\/soiree\/1$/);
  await expect(page.getByText('En direct', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Carte du dépouillement' })).toHaveAttribute(
    'data-ready',
    'oui',
  );
  await expect(page.getByTestId('bandeau-soiree')).toContainText('Estimations');
  // Lecture automatique : l'horloge avance d'elle-même.
  const clock = page.getByTestId('horloge-soiree');
  await expect(clock).not.toHaveText('20 h 00', { timeout: 10_000 });

  // La Somme, commune par commune.
  await page.getByLabel('Suivre les communes d’un département').selectOption('80');
  await expect(page.getByText(/commune\(s\) dépouillée\(s\) sur 771$/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Carte du dépouillement' })).toHaveAttribute(
    'data-territoires',
    '771',
  );

  await page.getByRole('button', { name: 'Résultats définitifs' }).click();
  await expect(clock).toHaveText('0 h 00');
  await expect(page.getByText('771 commune(s) dépouillée(s) sur 771')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /^(Qualifiés pour le second tour : |.+ est élu)/ }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
  // Thème clair : mêmes exigences de contraste.
  await page.getByLabel('Thème').selectOption('clair');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  const light = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(light.violations.map((v) => `clair — ${v.id} : ${v.help} (${v.nodes.length})`)).toEqual(
    [],
  );

  await page.getByRole('link', { name: 'Voir les résultats complets' }).click();
  await expect(page.getByRole('heading', { name: 'Résultats' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Revivre la soirée électorale' })).toBeVisible();
});
