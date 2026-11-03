import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  advanceViaApi,
  createGame,
  finishWizard,
  openScreen,
  openSection,
  resolveWeek,
} from './helpers';

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
  await page.getByRole('button', { name: 'Ajouter Interview dans un média' }).click();
  await page.getByLabel(/Cible de l’action n° 2/).selectOption('france-inter');
  await page.getByRole('button', { name: 'Ajouter Invité d’une émission politique' }).click();
  await page.getByLabel(/Cible de l’action n° 3/).selectOption('emi-le-grand-jury');
  await resolveWeek(page, 0);

  // Le bilan détaillé et les parrainages sont repliés en bas du QG.
  await openSection(page, 'bilan-semaine');
  const report = page.getByRole('region', { name: /Bilan de la semaine 0/ });
  const campaign = report.getByRole('region', { name: 'Campagne de la semaine' });
  await expect(campaign.getByText('Plan d’investissement public')).toBeVisible();
  await expect(
    campaign.getByText(/Rencontre avec des élus locaux — Corse-du-Sud \(2A\) : \+/),
  ).toBeVisible();
  await expect(report.getByText(/Interview dans un média — France Inter/)).toBeVisible();
  await expect(
    report.getByText(/Invité d’une émission politique — Le Grand Jury \(RTL\)/),
  ).toBeVisible();
  await openSection(page, 'campagne-detail');
  await expect(page.getByRole('region', { name: 'Parrainages', exact: true })).toContainText(
    /présentations comptées sur 500 requises/,
  );

  // Finances : dépenses de la semaine comptées, règles officielles affichées.
  await openScreen(page, 'Finances');
  const summary = page.getByRole('region', { name: 'Votre compte de campagne' });
  await expect(summary).toContainText(/Dépenses électorales\s*10\s000\s€/);
  await expect(page.getByRole('region', { name: 'Règles appliquées' })).toContainText(
    /16\s851\s000\s€/,
  );

  // Candidats : relations.
  await openScreen(page, 'Candidats');
  await expect(
    page.getByRole('region', { name: 'Vos relations avec les autres candidats' }),
  ).toBeVisible();

  // Médias réels : interview simulée dans l'émission, couverture par l'organe, logo crédité.
  await openScreen(page, 'Médias');
  await expect(page.getByRole('note')).toContainText('aucun propos n’est attribué');
  const show = page
    .getByRole('region', { name: 'Émissions politiques' })
    .getByRole('listitem', { name: 'Le Grand Jury' });
  await expect(show.getByText('Interview simulée')).toBeVisible();
  await expect(show.getByText(/Camille Durand \(vous\)/)).toBeVisible();
  const inter = page.getByRole('region', { name: 'Radio' }).getByRole('listitem', {
    name: 'France Inter',
  });
  const logo = inter.getByRole('img', { name: 'Logo de France Inter' });
  // Chargement différé : le logo est décodé une fois arrivé à l'écran.
  await logo.scrollIntoViewIfNeeded();
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    inter.getByRole('table', { name: 'Couverture simulée des candidats par France Inter' }),
  ).toContainText('Camille Durand (vous)');
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
  await page.getByLabel('Observateur').check();
  await finishWizard(page, { name: 'Observation', seed: 'e2e-observateur' });
  await resolveWeek(page, 0);
  await openSection(page, 'bilan-semaine');
  const report = page.getByRole('region', { name: /Bilan de la semaine 0/ });
  await report.getByText(/Stratégies des adversaires \(7\)/).click();
  await expect(
    report.getByText(/Parrainages :|Conquête d’électeurs :|Financement :/).first(),
  ).toBeVisible();
  await report.getByText(/Actions des campagnes adverses/).click();
  await expect(
    report
      .getByText(
        / — .+\(\d{2,3}\)| — .*(TF1|France 2|France 5|France Inter|RTL|Europe 1|CNews|Le Monde)/,
      )
      .first(),
  ).toBeVisible();
});

test('accessibilité des écrans Programme, Finances, Candidats et Médias (axe-core, WCAG 2.1 AA)', async ({
  page,
}) => {
  await createGame(page, 'Accessibilité', 'e2e-a11y-campagne');
  for (const screen of ['Programme', 'Finances', 'Candidats', 'Médias']) {
    await openScreen(page, screen);
    await expect(page.getByRole('heading', { level: 1, name: 'Campagne' })).toBeVisible();
    await expect(page.getByRole('region', { name: screen, exact: true })).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((v) => `${screen} — ${v.id} : ${v.help} (${v.nodes.length})`),
    ).toEqual([]);
  }
});
