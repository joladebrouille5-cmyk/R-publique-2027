import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { GameDetailSchema } from '@r2027/shared';
import {
  advanceViaApi,
  createGame,
  fillCandidate,
  finishWizard,
  gameIdOf,
  openScreen,
  settled,
} from './helpers';

// Phase 13 : photo du candidat préparée par le navigateur (recadrage, réduction, encodage),
// vue du mandat en tête de l'espace Pouvoir, carte des législatives par bloc.

/** Image PNG de 16 × 12 pixels (dégradé), décodée puis recadrée et réduite par le navigateur. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAABYElEQVR42g3LIRXFIBiAUSpM4QmAocKIMIdeAQQVOIcEuO8g14BDhQkKTOOo8L93/VVKcSiMwilOxaW4FUmRFVXxKIbiVXyKrRCFUppDYzROc2ouza1JmqypmkczNK/m02yN6H+wHBZjcZbTclluS7JkS7U8lmF5LZ9lW8T+g+fwGI/znJ7Lc3uSJ3uq5/EMz+v5PNsj/h8CR8AEXOAMXIE7kAI5UANPYATewBfYAQn/EDkiJuIiZ+SK3JEUyZEaeSIj8ka+yI5I/IfCUTAFVzgLV+EupEIu1MJTGIW38BV2Qco/NI6GabjG2bgadyM1cqM2nsZovI2vsRvS/qFzdEzHdc7O1bk7qZM7tfN0RuftfJ3dkf4Pk2NiJm5yTq7JPUmTPKmTZzIm7+Sb7InMf1gcC7Nwi3NxLe5FWuRFXTyLsXgX32IvZP2DcAhGcMIpXMItJCELVXiEIbzCJ2xBhB9GmjcA+WY/3gAAAABJRU5ErkJggg==',
  'base64',
);

test('photo du candidat : préparée sur l’appareil, envoyée et conservée avec la partie', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await fillCandidate(page);
  // Sans photo : portrait illustré généré.
  await expect(page.locator('[data-avatar="illustration"]').first()).toBeVisible();
  await page
    .getByLabel('Importer une photo')
    .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
  const preview = page.getByRole('img', { name: 'Photo choisie pour le candidat' });
  await expect(preview).toHaveAttribute('src', /^data:image\/(webp|jpeg);base64,/);
  await finishWizard(page, { name: 'Partie avec photo' });
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  const game = GameDetailSchema.parse(
    await (await page.request.get(`/api/games/${gameIdOf(page)}`)).json(),
  );
  const photo = game.state.actors.joueur!.candidate.photo!;
  expect(photo).toMatch(/^data:image\/(webp|jpeg);base64,/);
  expect(photo.length).toBeLessThanOrEqual(140_000);
  // L'en-tête de la partie affiche la photo.
  await expect(page.locator('[data-avatar="photo"] img').first()).toHaveAttribute('src', photo);
});

test('vue du mandat : hémicycle par groupe, jauges, ministres ; carte des législatives', async ({
  page,
}) => {
  await createGame(page, 'Mandat vivant', 'e2e-mandat');
  const elected = await advanceViaApi(page, (g) => g.state.quinquennat?.gouvernement != null);
  expect(elected.state.meta.phase).toBe('presidence');
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Espaces de la partie' })
    .getByRole('link', { name: 'Pouvoir', exact: true })
    .click();
  const overview = page.getByRole('region', { name: 'Vue du mandat' });
  await expect(overview).toBeVisible();
  const hemicycle = overview.getByRole('img', { name: /^Hémicycle de l’Assemblée/ });
  await expect(hemicycle).toBeVisible();
  await expect(hemicycle.locator('[data-siege]')).toHaveCount(577);
  // Liseré lumineux sur les sièges du groupe du joueur (convention du jeu).
  expect(await hemicycle.locator('[data-joueur]').count()).toBeGreaterThan(0);
  await expect(
    overview.getByRole('meter', { name: 'Soutiens du président face à la majorité des membres' }),
  ).toBeVisible();
  await expect(overview.getByRole('meter', { name: 'Tension parlementaire' })).toBeVisible();
  await expect(
    overview
      .getByRole('list', { name: 'Ministres et effets de leur domaine' })
      .getByRole('listitem'),
  ).toHaveCount(10);
  await settled(page);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `Pouvoir — ${v.id} : ${v.help} (${v.nodes.length})`)).toEqual(
    [],
  );

  // Carte : législatives de 2024 par bloc, fiche d'un département avec ses circonscriptions.
  await openScreen(page, 'Carte électorale');
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page
    .getByLabel('Résultats affichés')
    .selectOption({ label: 'Législatives 2024 — premier tour par bloc (officiel)' });
  await expect(
    page.getByRole('region', { name: 'Légende' }).getByText('Bloc en tête'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Voir Corse-du-Sud' }).click();
  const sheet = page.getByRole('region', { name: 'Fiche : Corse-du-Sud' }).first();
  await expect(sheet.getByText('Circonscriptions (2)')).toBeVisible();
  await expect(sheet.getByText('Sièges', { exact: true })).toBeVisible();
});
