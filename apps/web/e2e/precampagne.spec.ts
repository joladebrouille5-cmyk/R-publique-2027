import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GameDetailSchema, SupportProspectsSchema } from '@r2027/shared';
import {
  closeDebrief,
  fillCandidate,
  finishWizard,
  gameIdOf,
  settled,
  toQG,
  wizardTo,
} from './helpers';

// Phase 15 : pré-campagne dans le navigateur — orientation du mouvement à la création, course aux
// parrainages, négociation d'un soutien (vivier servi par l'API, issue simulée par le moteur),
// rendez-vous d'élus ouvert en dossier. Graine choisie pour qu'une délégation se présente dès la
// deuxième semaine (tirage du moteur, identique à chaque exécution).

async function audit(page: Page, label: string) {
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

const readGame = async (page: Page) =>
  GameDetailSchema.parse(await (await page.request.get(`/api/games/${gameIdOf(page)}`)).json());

test('pré-campagne : orientation, course aux parrainages, soutien négocié, rendez-vous d’élus', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await fillCandidate(page);
  await wizardTo(page, 'Votre parcours');
  await page
    .getByRole('group', { name: 'Variante de campagne (facultative)' })
    .getByRole('radio', { name: /S’appuyer sur les élus locaux/ })
    .check();
  await finishWizard(page, { name: 'Pré-campagne', seed: 'e2e-elus' });
  await toQG(page);
  expect((await readGame(page)).state.player.orientation).toBe('elus-locaux');

  // Course aux parrainages : seuil, départements, compte à rebours, classement.
  const race = page.getByRole('region', { name: 'Course aux parrainages' });
  await expect(race.getByText('Présentations comptées', { exact: true })).toBeVisible();
  await expect(race.getByText(/^J−\d+$/)).toBeVisible();
  await expect(race.getByText(/^Classement des candidats — vous êtes \d+(er|e)$/)).toBeVisible();

  // Négociation : la cible se choisit dans le vivier calculé par le serveur.
  const prospects = SupportProspectsSchema.parse(
    await (await page.request.get(`/api/games/${gameIdOf(page)}/soutiens`)).json(),
  );
  const supports = page.getByRole('region', { name: 'Soutiens et ralliements' });
  await expect(supports.getByText('0/6 soutien(s)')).toBeVisible();
  await supports.getByRole('button', { name: 'Négocier un soutien' }).click();
  const planned = page.getByRole('list', { name: 'Actions programmées' });
  const select = planned.getByRole('combobox', { name: /^Cible de l’action n° 1/ });
  const possible = select.locator('optgroup').first();
  await expect(possible).toHaveAttribute('label', /^Accord possible \(\d+\)$/);
  const figureId = (await possible.locator('option').first().getAttribute('value'))!;
  await select.selectOption(figureId);
  const prospect = prospects.personnalites.find((p) => p.figureId === figureId)!;
  await expect(
    planned.getByText(`Proximité ${prospect.proximite}/100 · probabilité d’accord`, {
      exact: false,
    }),
  ).toBeVisible();
  await audit(page, 'QG de pré-campagne');

  // Résolution : issue simulée par le moteur, sans propos attribué.
  await page.getByRole('button', { name: 'Résoudre la semaine 0' }).click();
  const debrief = page.getByRole('dialog', { name: 'Verdict de la semaine 0' });
  await expect(
    debrief.getByText(/Camille Durand \((soutien|refus) simulé\)$/).first(),
  ).toBeVisible();
  await closeDebrief(page, 0);

  // Semaine 1 : une délégation d'élus attend une réponse ; le dossier s'ouvre à la demande.
  const game = await readGame(page);
  const meeting = game.state.pendingDecisions.find((d) => d.kind === 'parrainage');
  expect(meeting).toBeDefined();
  await expect(
    race.getByText(
      `${meeting!.label} : une délégation attend votre réponse (décision de la semaine).`,
    ),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: meeting!.label })).toHaveCount(0);
  const decision = page.getByRole('group', { name: meeting!.label });
  await decision.getByRole('button', { name: 'Ouvrir le dossier' }).click();
  const dialog = page.getByRole('dialog', { name: meeting!.label });
  await expect(dialog.getByText('Rendez-vous d’élus (fictif)')).toBeVisible();
  await audit(page, 'Rendez-vous d’élus');
  // Recevoir la délégation : ses heures sont prises sur la semaine, avant les actions.
  const ruleset = (await (
    await page.request.get(`/api/rulesets/${encodeURIComponent(game.rulesetVersion)}`)
  ).json()) as { parrainages: { rendezVous: { tempsHeures: number } } };
  const left =
    game.state.actors.joueur!.resources.tempsHeures - ruleset.parrainages.rendezVous.tempsHeures;
  await dialog.getByRole('button', { name: /^Recevoir la délégation/ }).click();
  await expect(dialog).toBeHidden();
  await expect(decision.getByRole('radio', { name: /^Recevoir la délégation/ })).toBeChecked();
  await expect(page.getByText(new RegExp(` · ${left} h · 0/\\d+ actions$`))).toBeVisible();
});
