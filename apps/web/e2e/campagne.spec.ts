import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceViaApi, createGame, openScreen, resolveWeek } from './helpers';

// Campagne approfondie (phase 5) : programme, actions ciblées, parrainages, finances,
// relations, mode observateur — bureau et téléphone.

/** Ouvre un domaine du programme (élément <summary> repliable). */
async function openDomain(page: Page, name: string) {
  await page.locator('summary', { hasText: new RegExp(`^${name} `) }).click();
}

test('programme, rencontre d’élus ciblée et interview : bilan, parrainages et compte', async ({
  page,
}) => {
  await createGame(page, 'Campagne', 'e2e-campagne');

  // Programme : une dépendance manquante bloque l'annonce ; on annonce la proposition requise.
  await openScreen(page, 'Programme');
  await openDomain(page, 'Emploi');
  const guarantee = page.getByRole('listitem', {
    name: 'Garantie d’emploi pour les chômeurs de longue durée',
  });
  await expect(guarantee.getByRole('button', { name: /^Annoncer/ })).toBeDisabled();
  await openDomain(page, 'Économie');
  await page.getByRole('button', { name: 'Annoncer Plan d’investissement public' }).click();
  await expect(page.getByText('Annonce prévue')).toBeVisible();

  // Tableau de bord : deux actions ciblées.
  await openScreen(page, 'Tableau de bord');
  await expect(page.getByText(/À annoncer : Plan d’investissement public/)).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter Rencontre avec des élus locaux' }).click();
  await page.getByLabel(/Cible de l’action n° 1/).selectOption('2A');
  await page.getByRole('button', { name: 'Ajouter Interview dans un média national' }).click();
  await page.getByLabel(/Cible de l’action n° 2/).selectOption('onde-publique');
  await resolveWeek(page, 0);

  const report = page.getByRole('region', { name: /Bilan de la semaine 0/ });
  const campaign = report.getByRole('region', { name: 'Campagne de la semaine' });
  await expect(campaign.getByText('Plan d’investissement public')).toBeVisible();
  await expect(
    campaign.getByText(/Rencontre avec des élus locaux — Corse-du-Sud \(2A\) : \+/),
  ).toBeVisible();
  await expect(report.getByText(/Interview dans un média national — Onde publique/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Parrainages' })).toContainText(
    /présentations comptées sur 500 requises/,
  );

  // Finances : dépenses de la semaine comptées, règles officielles affichées.
  await openScreen(page, 'Finances');
  const summary = page.getByRole('region', { name: 'Votre compte de campagne' });
  await expect(summary).toContainText(/Dépenses électorales\s*10\s000\s€/);
  await expect(page.getByRole('region', { name: 'Règles appliquées' })).toContainText(
    /16\s851\s000\s€/,
  );

  // Candidats : relations et médias.
  await openScreen(page, 'Candidats');
  await expect(
    page.getByRole('region', { name: 'Vos relations avec les autres candidats' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Médias' }).getByText('Onde publique', { exact: true }),
  ).toBeVisible();
});

test('sans parrainages, le candidat est écarté à la clôture et la partie continue', async ({
  page,
}) => {
  await createGame(page, 'Sans parrainages', 'e2e-ecarte');
  await advanceViaApi(page, (g) => g.date > '2027-03-12');
  await page.reload();
  await expect(page.getByText(/Écarté\(e\) : parrainages insuffisants/).first()).toBeVisible();
  await expect(page.getByText(/Vous n’êtes plus candidat/)).toBeVisible();
  await openScreen(page, 'Candidats');
  await expect(
    page.getByRole('listitem', { name: 'Camille Durand' }).getByText(/parrainages insuffisants/),
  ).toBeVisible();
});

test('observateur : les adversaires agissent, collectent et se motivent seuls', async ({
  page,
}) => {
  await page.goto('/nouvelle-partie');
  await page.getByLabel('Nom de la partie').fill('Observation');
  await page.getByLabel('Observateur').check();
  await page.getByLabel('Graine (facultative)').fill('e2e-observateur');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await resolveWeek(page, 0);
  const report = page.getByRole('region', { name: /Bilan de la semaine 0/ });
  await report.getByText(/Stratégies des adversaires \(7\)/).click();
  await expect(
    report.getByText(/Parrainages :|Conquête d’électeurs :|Financement :/).first(),
  ).toBeVisible();
  await report.getByText(/Actions des campagnes adverses/).click();
  await expect(
    report.getByText(/ — .+\(\d{2,3}\)|— Canal Hexagone|— Onde publique|— Fil d’actu/).first(),
  ).toBeVisible();
});

test('accessibilité des écrans Programme et Finances (axe-core, WCAG 2.1 AA)', async ({ page }) => {
  await createGame(page, 'Accessibilité', 'e2e-a11y-campagne');
  for (const screen of ['Programme', 'Finances', 'Candidats']) {
    await openScreen(page, screen);
    await expect(page.getByRole('heading', { level: 1, name: screen })).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((v) => `${screen} — ${v.id} : ${v.help} (${v.nodes.length})`),
    ).toEqual([]);
  }
});
