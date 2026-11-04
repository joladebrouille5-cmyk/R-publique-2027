import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { candidateName, GameDetailSchema } from '@r2027/shared';
import { advanceViaApi, closeDebrief, openScreen, settled } from './helpers';

// Phase 23 : le président joueur, en fin de mandat, reçoit sa décision de candidature quatre
// semaines avant la campagne de 2032, passe la main à un successeur de son camp (cartes avec
// portrait et nature réelle ou fictive), puis joue la campagne de ce successeur. Partie importée :
// état du vrai moteur (fixtures/README.md).

const FIXTURE = new URL('./fixtures/president-fin-de-mandat.json', import.meta.url);

async function audit(page: Page, label: string, include?: string) {
  await settled(page);
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const result = await (include ? builder.include(include) : builder).analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

test('passer la main à la présidentielle suivante : décision, passation, campagne du successeur', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  const imported = await page.request.post('/api/games/import', {
    data: JSON.parse(await readFile(FIXTURE, 'utf8')) as unknown,
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const { id } = GameDetailSchema.parse(await imported.json());
  await page.goto(`/parties/${id}/tableau-de-bord`);
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // Avance rapide jusqu'à la décision (arrêtée par le serveur avant elle).
  const asked = await advanceViaApi(
    page,
    (g) => g.state.pendingDecisions.some((d) => d.kind === 'candidature'),
    8,
  );
  expect(asked.state.meta.date).toBe('2031-09-01');
  const decision = asked.state.pendingDecisions.find((d) => d.kind === 'candidature')!;
  const successor = decision.options.find((o) => o.id.startsWith('successeur-'))!;
  await page.reload();

  // Pop-up de la décision : cartes des options, nature de chaque successeur.
  const dialog = page.getByRole('dialog', { name: 'Votre candidature à la présidentielle 2032' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Me représenter/ })).toBeVisible();
  await expect(
    dialog.getByText(/^(Personnalité réelle — candidature simulée|Personnage fictif)$/).first(),
  ).toBeVisible();
  await audit(page, 'Décision de candidature', '[role="dialog"]');
  await dialog.getByRole('button', { name: new RegExp(successor.libelle) }).click();
  await expect(dialog).toBeHidden();

  // Semaine résolue avec ce choix, puis avance rapide jusqu'à l'ouverture de la campagne.
  await page.getByRole('button', { name: `Résoudre la semaine ${asked.week}` }).click();
  await closeDebrief(page, asked.week);
  const opened = await advanceViaApi(page, (g) => g.state.meta.phase === 'campagne', 8);
  expect(opened.state.succession).toMatchObject({ annee: 2032, choixJoueur: successor.id });
  const heir = opened.state.actors[opened.state.player.actorId!]!;
  expect(heir.id).not.toBe('joueur');
  const heirName = candidateName(heir.candidate);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  // Le bandeau de la partie montre désormais le successeur.
  await expect(page.getByText(heirName).first()).toBeVisible();

  // Candidats : le successeur est le candidat du joueur, nouveau en 2032 ; l'ancien se retire.
  await openScreen(page, 'Candidats');
  const card = page.getByRole('listitem', { name: heirName });
  await expect(card.getByText('Votre candidat')).toBeVisible();
  await expect(card.getByText('Nouveau en 2032')).toBeVisible();
  const former = page.getByRole('listitem', {
    name: candidateName(opened.state.actors.joueur!.candidate),
  });
  await expect(former.getByText('Ne se présente pas')).toBeVisible();
  await audit(page, 'Candidats');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
