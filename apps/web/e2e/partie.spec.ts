import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame, openScreen, openSection, resolveWeek } from './helpers';

/** Empreinte de l'état : paramètres techniques de la section « La partie » du QG. */
async function readStateHash(page: Page): Promise<string> {
  await openSection(page, 'partie');
  const hash = (await page.getByTestId('empreinte').textContent()) ?? '';
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  return hash;
}

/** Répond aux éventuelles décisions en attente (premier choix), puis résout la semaine. */

test('boucle complète : actions, progression, bilan, sauvegarde, restauration, journal', async ({
  page,
  context,
}) => {
  await createGame(page, 'Campagne Playwright');
  // Le détail des ressources est replié en bas du QG.
  await openSection(page, 'ressources');
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
  await openSection(page, 'bilan-semaine');
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
  const journal = page.getByRole('region', { name: 'Journal', exact: true });
  await expect(journal.getByText(/^Semaine 1 — /)).toBeVisible();
  await expect(journal.getByText(/^Semaine 0 — /)).toBeVisible();
  await expect(page.getByText('Sauvegarde restaurée')).toBeVisible();

  // Reprise après « fermeture » : nouvel onglet, état relu depuis le serveur.
  // Les sections se déplient sur place : l'adresse reste celle du QG.
  const gameUrl = page.url();
  expect(gameUrl).toMatch(/\/tableau-de-bord$/);
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

test('tous les écrans du cahier des charges ont leur moteur', async ({ page }) => {
  await createGame(page, 'Écrans', 'e2e-ecrans');
  await openScreen(page, 'Bilan du quinquennat');
  await expect(
    page
      .getByRole('region', { name: 'Bilan du quinquennat', exact: true })
      .getByText(/Aucun quinquennat achevé/),
  ).toBeVisible();
  await expect(page.getByText(/Non disponible/)).toHaveCount(0);
});

test('fin du quinquennat : bilan, puis campagne de la présidentielle 2032', async ({ page }) => {
  test.setTimeout(180_000);
  await createGame(page, 'Cycle 2032', 'e2e-cycle');
  await advanceViaApi(page, (g) => g.state.quinquennat !== null);
  // De l'investiture à un premier vote à l'Assemblée (votes simulés par groupe).
  const voted = await advanceViaApi(
    page,
    (g) => g.state.parlement?.textes.some((b) => b.votes.length > 0) ?? false,
    13,
  );
  expect(voted.state.meta.phase).toBe('presidence');
  await page.reload();
  await openScreen(page, 'Parlement');
  await expect(
    page.getByRole('img', { name: /^Hémicycle de l’Assemblée nationale/ }),
  ).toBeVisible();
  await expect(page.getByText(/votes de groupe simulés/).first()).toBeVisible();
  const parliamentAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    parliamentAudit.violations.map((v) => `Parlement — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
  // Avance rapide du quinquennat (président IA) jusqu'à la campagne suivante (critère 17).
  const campaign = await advanceViaApi(page, (g) => g.state.cycle.annee === 2032, 52);
  expect(campaign.state.meta).toMatchObject({ phase: 'campagne', date: '2031-09-29' });
  await page.reload();
  await openScreen(page, 'Tableau de bord');
  const panel = page.getByRole('region', { name: 'Présidentielle 2032' });
  await expect(panel).toContainText('Le quinquennat 2027–2032');
  await openSection(page, 'calendrier');
  await expect(
    page.getByRole('region', { name: 'Calendrier électoral' }).getByText(/dimanche 18 avril 2032/),
  ).toBeVisible();
  // Le joueur, battu en 2027, fait de nouveau campagne.
  await expect(page.getByRole('list', { name: 'Catalogue des actions' })).toBeVisible();
  await resolveWeek(page, campaign.week);

  await openScreen(page, 'Bilan du quinquennat');
  const review = page.getByRole('region', { name: /Quinquennat 2027–2032/ });
  await expect(review.getByRole('rowheader', { name: 'Popularité du président' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Présidentielles précédentes' })).toContainText(
    '2027',
  );
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `Bilan — ${v.id} : ${v.help} (${v.nodes.length})`)).toEqual(
    [],
  );
});

test('présidentielle complète puis quinquennat : deux tours, résultats, gouvernement, avance rapide', async ({
  page,
}) => {
  // Une présidentielle entière puis cinq audits axe de l'espace Pouvoir (vue du mandat comprise).
  test.setTimeout(90_000);
  await createGame(page, 'Présidentielle', 'e2e-presidentielle');
  await openScreen(page, 'Candidats');
  const mine = page.getByRole('listitem', { name: 'Camille Durand' });
  await expect(mine.getByText('Votre candidat')).toBeVisible();
  await expect(page.getByText('Fictif', { exact: true })).toHaveCount(7);

  await openScreen(page, 'Tableau de bord');
  await resolveWeek(page, 0);
  await openScreen(page, 'Sondages');
  const latest = page.getByRole('region', { name: /^Dernier sondage/ });
  await expect(latest.getByText(/1\s000 personnes/)).toBeVisible();
  await expect(latest.getByText('Camille Durand (vous)')).toBeVisible();

  // Critère 10 : la fin de la présidentielle ouvre la présidence (ici celle de l'IA).
  const final = await advanceViaApi(page, (g) => g.state.quinquennat !== null);
  expect(final.state.meta.phase).toBe('presidence');
  expect(final.state.calendar.blockedBy).toBeNull();
  await page.reload();
  await openScreen(page, 'Résultats');
  const t2 = page.getByRole('region', { name: 'Second tour' });
  const winner = final.state.actors[final.state.elections.t2!.winner!]!.candidate;
  await expect(
    t2.getByText(`${winner.prenom} ${winner.nom} est élu(e) président(e) de la République.`),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Premier tour' })).toBeVisible();

  await openScreen(page, 'Tableau de bord');
  const quinquennat = page.getByRole('region', { name: /Quinquennat 2027–2032/ });
  await expect(quinquennat).toContainText(
    `${winner.prenom} ${winner.nom} est président(e) de la République`,
  );
  await expect(quinquennat).toContainText('Vous n’êtes pas président(e)');
  await page.getByLabel('Avance rapide').selectOption('13');
  await page.getByRole('button', { name: 'Avancer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Avance rapide' })).toHaveText(
    'Avance rapide : 13 semaine(s) résolue(s) sur 13.',
  );
  await expect(
    page.getByRole('button', { name: `Résoudre la semaine ${final.week + 13}` }),
  ).toBeVisible();

  await openScreen(page, 'Gouvernement');
  await expect(page.getByRole('heading', { name: 'Gouvernement n° 1' })).toBeVisible();
  await expect(page.getByText('Premier ministre', { exact: true })).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);

  // Parlement : composition réelle, votes simulés par groupe.
  await openScreen(page, 'Parlement');
  const assembly = page.getByRole('region', { name: /Assemblée nationale \(17e législature\)/ });
  await expect(assembly.getByRole('table', { name: 'Groupes politiques et sièges' })).toBeVisible();
  await expect(assembly.getByText(/sans aucun nom de député/)).toBeVisible();
  const parliamentAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(parliamentAudit.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual(
    [],
  );

  // Économie (valeurs de départ de l'Insee, évolution simulée), crises fictives et législatives
  // (Assemblée élue en 2024, résultats réels par circonscription).
  for (const [screenName, landmark] of [
    ['Économie', page.getByRole('listitem', { name: 'Taux de chômage' })],
    ['Crises', page.getByRole('region', { name: 'Crises possibles (fictives)' })],
    ['Législatives', page.getByRole('region', { name: 'Dernières élections' })],
  ] as const) {
    await openScreen(page, screenName);
    await expect(landmark).toBeVisible();
    const screenAudit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      screenAudit.violations.map((v) => `${screenName} — ${v.id} : ${v.help} (${v.nodes.length})`),
    ).toEqual([]);
  }
  const districts = page.getByRole('region', {
    name: 'Résultats par circonscription en 2024 (réels)',
  });
  await districts.getByLabel('Département').selectOption('2A');
  await expect(
    districts.getByRole('rowheader', { name: /^Corse-du-Sud — 1ère circonscription$/ }),
  ).toBeVisible();
});

test('scénario de départ fictif : choisi à la création, affiché pendant la partie', async ({
  page,
}) => {
  await page.goto('/nouvelle-partie');
  await page.getByLabel('Nom de la partie').fill('Scénario');
  await page.getByLabel(/^Nom \*/).fill('Durand');
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement Playwright');
  const scenarios = page.getByRole('group', { name: 'Scénario de départ' });
  await scenarios.getByRole('radio', { name: /Colère sociale/ }).check();
  await expect(scenarios.getByText(/Événements de campagne × 1,5/)).toBeVisible();
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  // Le scénario se lit dans la ligne d'état de la section « La partie », et dans ses faits.
  await expect(page.getByRole('button', { name: /^La partie/ })).toContainText('Colère sociale');
  await openSection(page, 'partie');
  await expect(page.getByText('Colère sociale', { exact: true })).toBeVisible();
  await openScreen(page, 'Crises');
  await expect(page.getByRole('region', { name: 'Conséquences durables' })).toContainText(
    'Aucune conséquence durable en cours.',
  );
  await expect(page.getByText(/probabilité des crises × 1,2/)).toBeVisible();
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
    'Gouvernement',
    'Parlement',
    'Économie',
    'Crises',
    'Législatives',
    'Bilan du quinquennat',
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
