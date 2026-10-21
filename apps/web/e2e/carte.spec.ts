import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { advanceViaApi, createGame, openScreen } from './helpers';

// Carte électorale (P4-05 à P4-10) avec le jeu de démonstration commité (Ain, Corse, DROM).

const DROM = [
  ['Guadeloupe', '971'],
  ['Martinique', '972'],
  ['Guyane', '973'],
  ['La Réunion', '974'],
  ['Mayotte', '976'],
] as const;
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function openMap(page: Page, seed: string) {
  await createGame(page, 'Carte', seed);
  await openScreen(page, 'Carte électorale');
  await expect(page.getByRole('heading', { name: 'Carte électorale' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Carte de la métropole' })).toHaveAttribute(
    'data-ready',
    'oui',
  );
}

/** Recherche un territoire et ouvre sa fiche ; renvoie la fiche visible. */
async function search(page: Page, query: string, expected: RegExp) {
  await page.getByLabel(/Rechercher un territoire/).fill(query);
  await page
    .getByRole('list', { name: 'Résultats de la recherche' })
    .getByRole('button', { name: expected })
    .first()
    .click();
}

/**
 * Clique dans une carte d'outre-mer jusqu'à tomber sur une commune (le centre d'un encart peut
 * être en mer, comme en Guadeloupe) et attend sa fiche.
 */
async function selectCommuneIn(page: Page, map: Locator, departement: string) {
  await expect(map).toHaveAttribute('data-ready', 'oui');
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const sheet = page
    .getByRole('region', { name: /^Fiche : / })
    .last()
    .getByText(new RegExp(`^Commune · code ${departement}\\d{2}`));
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.35, 0.5],
    [0.65, 0.5],
    [0.5, 0.35],
    [0.5, 0.65],
    [0.3, 0.4],
    [0.7, 0.6],
  ] as const) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    if (
      await sheet.waitFor({ timeout: 1_000 }).then(
        () => true,
        () => false,
      )
    )
      return;
  }
  await expect(sheet).toBeVisible();
}

test('affiche la métropole et cinq encarts DROM où l’on sélectionne une commune', async ({
  page,
}) => {
  await openMap(page, 'e2e-carte-encarts');
  await page.getByLabel('Commune', { exact: true }).check();
  for (const [name, code] of DROM) {
    if (isMobile(page)) {
      await page.getByRole('button', { name: `Ouvrir l’encart ${name}` }).click();
      const dialog = page.getByRole('dialog', { name: `Encart ${name}` });
      await selectCommuneIn(page, dialog.getByRole('region', { name: `Encart ${name}` }), code);
      await dialog.getByRole('button', { name: 'Fermer l’encart' }).click();
    } else {
      await selectCommuneIn(page, page.getByRole('region', { name: `Encart ${name}` }), code);
    }
  }
});

test('la recherche centre la carte et ouvre la fiche (métropole et DROM)', async ({ page }) => {
  await openMap(page, 'e2e-carte-recherche');
  const cases: [string, RegExp, string][] = [
    ['Mamoudzou', /Mamoudzou \(commune 97611\)/, 'Mamoudzou'],
    ['97411', /Saint-Denis \(commune 97411\)/, 'Saint-Denis'],
    ['Ajaccio', /Ajaccio \(commune 2A004\)/, 'Ajaccio'],
    ['2A004', /Ajaccio \(commune 2A004\)/, 'Ajaccio'],
  ];
  for (const [query, result, name] of cases) {
    await search(page, query, result);
    const sheet = page.getByRole('region', { name: `Fiche : ${name}` }).last();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/Population légale/)).toBeVisible();
    if (isMobile(page) && /^97/.test(name === 'Mamoudzou' ? '976' : query)) {
      // Sur téléphone, une commune d'outre-mer ouvre son encart en plein écran.
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('region', { name: /^Encart / })).toHaveAttribute(
        'data-ready',
        'oui',
      );
      await dialog.getByRole('button', { name: 'Fermer l’encart' }).click();
    }
  }
});

test('sélection au clic, niveaux et tableau équivalent', async ({ page }) => {
  await openMap(page, 'e2e-carte-clic');
  const map = page.getByRole('region', { name: 'Carte de la métropole' });
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  // Le centre de la vue initiale tombe dans un département du centre de la France.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole('region', { name: /^Fiche : / }).getByText(/^Département · code/),
  ).toBeVisible();

  await page.getByLabel('Région', { exact: true }).check();
  const table = page.getByRole('region', { name: /Tableau des territoires \(régions\)/ });
  await expect(table.getByRole('row')).toHaveCount(19);
  await table.getByRole('button', { name: 'Voir Corse' }).click();
  await expect(page.getByRole('region', { name: 'Fiche : Corse' })).toBeVisible();
});

test('après le premier tour, la carte colore les territoires et donne le détail des communes', async ({
  page,
}) => {
  await createGame(page, 'Carte au premier tour', 'e2e-carte-t1');
  const game = await advanceViaApi(page, (g) => g.state.elections.t1 !== null);
  const candidates = Object.keys(game.state.elections.t1!.voix).length;
  await page.reload();
  await openScreen(page, 'Carte électorale');
  await expect(page.getByRole('region', { name: 'Carte de la métropole' })).toHaveAttribute(
    'data-ready',
    'oui',
  );
  await expect(page.getByLabel('Résultats affichés')).toHaveValue('0');
  await expect(page.getByText('Démonstration fictive').first()).toBeVisible();
  const legend = page.getByRole('region', { name: 'Légende' });
  await expect(legend.getByText('Candidat en tête', { exact: true })).toBeVisible();
  // Motifs (daltonisme, impression) : la carte se redessine, la légende montre les hachures.
  await page.getByLabel('Motifs (daltonisme, impression)').check();
  await expect(legend.locator('[data-motif="hachures"]')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Carte de la métropole' })).toHaveAttribute(
    'data-ready',
    'oui',
  );

  await search(page, 'Ajaccio', /Ajaccio \(commune 2A004\)/);
  const sheet = page.getByRole('region', { name: 'Fiche : Ajaccio' }).last();
  await expect(sheet.getByText(/^En tête :/)).toBeVisible();
  await expect(
    sheet.getByRole('table', { name: 'Voix par candidat' }).getByRole('row'),
  ).toHaveCount(candidates + 1);
  await expect(
    page
      .getByRole('region', { name: /Tableau des territoires \(communes\)/ })
      .getByRole('rowheader', { name: 'Ajaccio (2A004)' }),
  ).toBeVisible();
});

test('accessibilité : audit axe-core (WCAG 2.1 AA) et parcours au clavier', async ({ page }) => {
  await openMap(page, 'e2e-carte-a11y');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Le canevas WebGL est doublé par le tableau et la recherche (équivalent textuel).
    .exclude('.maplibregl-canvas')
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);

  // Clavier seul : recherche, validation par Entrée, puis tableau.
  const searchBox = page.getByLabel(/Rechercher un territoire/);
  await searchBox.focus();
  await page.keyboard.type('Ajaccio');
  await expect(page.getByRole('list', { name: 'Résultats de la recherche' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Fiche : Ajaccio' }).last()).toBeVisible();
  const view = page.getByRole('button', { name: 'Voir Afa' });
  await view.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Fiche : Afa' }).last()).toBeVisible();
});
