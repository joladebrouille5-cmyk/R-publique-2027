import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  AdvanceResponseSchema,
  GameDetailSchema,
  type GameDetail,
  type MemberRef,
  type PendingDecision,
} from '@r2027/shared';
import { closeDebrief, openScreen, settled } from './helpers';

// Phase 15 : le mandat d'un président joueur dans le navigateur — pop-ups d'urgence ministérielle
// et de questions au gouvernement « en direct », Conseil des ministres, objectifs du mandat,
// déplacement programmé depuis la carte. La partie importée est un état produit par le vrai
// moteur, le joueur déclaré élu comme dans les tests de composants (fixtures/README.md) : aucun
// parcours de campagne automatisé ne mène sûrement le joueur à l'Élysée.

const FIXTURE = new URL('./fixtures/president-joueur.json', import.meta.url);

type Rules = {
  figures: { figures: { id: string; prenom: string; nom: string }[] };
  quinquennat: {
    postes: { id: string; libelle: string }[];
    profils: { id: string; prenom: string; nom: string }[];
  };
};

async function audit(page: Page, label: string) {
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${label} — ${v.id} : ${v.help} (${v.nodes.length})`),
  ).toEqual([]);
}

/** Importe la partie du président joueur (nouvelle partie de la session) et ouvre le QG. */
async function importPresident(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  const response = await page.request.post('/api/games/import', {
    data: JSON.parse(await readFile(FIXTURE, 'utf8')) as unknown,
  });
  expect(response.status(), await response.text()).toBe(201);
  const game = GameDetailSchema.parse(await response.json());
  const rules = (await (
    await page.request.get(`/api/rulesets/${encodeURIComponent(game.rulesetVersion)}`)
  ).json()) as Rules;
  await page.goto(`/parties/${game.id}/tableau-de-bord`);
  return { game, rules };
}

/** Nom d'un membre du gouvernement (personnalité réelle ou profil fictif). */
function nameOf(rules: Rules, member: MemberRef) {
  const person =
    rules.figures.figures.find((f) => f.id === member.ref) ??
    rules.quinquennat.profils.find((p) => p.id === member.ref);
  return person ? `${person.prenom} ${person.nom}` : member.ref;
}

/** Ministre en charge d'une décision (son poste, sinon le Premier ministre), comme le moteur. */
function inCharge(game: GameDetail, decision: PendingDecision): MemberRef {
  const government = game.state.quinquennat!.gouvernement!;
  return (
    government.ministres.find((m) => m.posteId === decision.posteId) ?? government.premierMinistre
  );
}

/** Referme, dans l'ordre, les pop-ups qui s'ouvrent d'eux-mêmes (urgences, séance de questions). */
async function closeSpotlights(page: Page, game: GameDetail) {
  for (const decision of game.state.pendingDecisions) {
    if (decision.kind !== 'urgence' && decision.kind !== 'qag') continue;
    const dialog = page.getByRole('dialog', { name: decision.label });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialog).toBeHidden();
  }
}

test('mandat : urgence ministérielle et questions au gouvernement en pop-up, puis Conseil des ministres', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { game, rules } = await importPresident(page);
  const urgence = game.state.pendingDecisions.find((d) => d.kind === 'urgence')!;
  const qag = game.state.pendingDecisions.find((d) => d.kind === 'qag')!;
  expect(urgence).toBeDefined();
  expect(qag).toBeDefined();

  // Urgence : pop-up automatique, ministre en charge avec sa photo, choix à effet direct.
  const emergency = page.getByRole('dialog', { name: urgence.label });
  await expect(emergency).toBeVisible();
  await expect(emergency.getByText('Urgence ministérielle (fictive)')).toBeVisible();
  const minister = nameOf(rules, inCharge(game, urgence));
  const poste = rules.quinquennat.postes.find((p) => p.id === urgence.posteId)!;
  await expect(emergency.getByText(minister, { exact: true })).toBeVisible();
  await expect(emergency.getByText(`En charge · ${poste.libelle}`)).toBeVisible();
  await expect(emergency.getByRole('img', { name: `Portrait de ${minister}` })).toBeVisible();
  await audit(page, 'Urgence ministérielle');
  const other = urgence.options.find((o) => o.id !== urgence.defaultOptionId)!;
  await emergency.getByRole('button', { name: other.libelle }).click();
  await expect(emergency).toBeHidden();

  // Questions au gouvernement : séance « en direct » qui s'ouvre ensuite d'elle-même.
  const live = page.getByRole('dialog', { name: qag.label });
  await expect(live).toBeVisible();
  await expect(live.getByText('Direct', { exact: true })).toBeVisible();
  const hemicycle = live.getByRole('img', {
    name: /^Hémicycle pendant les questions au gouvernement/,
  });
  await expect(hemicycle).toBeVisible();
  await expect(hemicycle.locator('[data-siege]')).toHaveCount(577);
  expect(await hemicycle.locator('[data-interpelle]').count()).toBe(
    game.state.parlement!.groupes[qag.groupeId!]!.sieges,
  );
  await expect(live.getByRole('meter', { name: 'Tension parlementaire' })).toBeVisible();
  await expect(live.getByText(nameOf(rules, inCharge(game, qag)), { exact: true })).toBeVisible();
  await expect(live.getByText(/^Répond pour le gouvernement · /)).toBeVisible();
  await audit(page, 'Questions au gouvernement');
  // Facultative : sans réponse, le gouvernement répond sur le fond ; la semaine se résout.
  await live.getByRole('button', { name: 'Laisser le gouvernement répondre sur le fond' }).click();
  await expect(live).toBeHidden();
  await expect(
    page
      .getByRole('group', { name: qag.label })
      .getByText('Facultatif : réponse sur le fond par défaut'),
  ).toBeVisible();

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/advance') && r.request().method() === 'POST'),
    page.getByRole('button', { name: `Résoudre la semaine ${game.week}` }).click(),
  ]);
  const next = AdvanceResponseSchema.parse(await response.json());
  expect(next.report.conseil).not.toBeNull();
  const debrief = page.getByRole('dialog', { name: `Débriefing de la semaine ${game.week}` });
  await expect(debrief.getByRole('region', { name: 'Conseil des ministres' })).toBeVisible();
  await closeDebrief(page, game.week);
  await closeSpotlights(page, next.game);

  // Conseil des ministres : popularité prêtée et loyauté de chaque membre, compte rendu lu au
  // journal.
  await openScreen(page, 'Conseil des ministres');
  const members = page.getByRole('list', { name: 'Membres du gouvernement' });
  await expect(members.locator(':scope > li')).toHaveCount(
    next.game.state.quinquennat!.gouvernement!.ministres.length + 1,
  );
  await expect(page.getByText(/^Compte rendu du dernier Conseil des ministres\./)).toBeVisible();
  await expect(
    members.getByText(/^Premier ministre · en poste depuis la semaine \d+$/),
  ).toBeVisible();
  // Objectifs du mandat et note provisoire, en tête de l'espace Pouvoir.
  const overview = page.getByRole('region', { name: 'Vue du mandat' });
  await expect(
    overview.getByRole('list', { name: 'Objectifs du mandat' }).getByRole('listitem'),
  ).toHaveCount(next.game.state.quinquennat!.objectifs.length);
  await expect(overview.getByText(/^\d+\/20$/)).toBeVisible();
  await audit(page, 'Pouvoir — Conseil des ministres');
});

test('mandat : déplacement du président programmé depuis la carte', async ({ page }) => {
  test.setTimeout(90_000);
  const { game } = await importPresident(page);
  await closeSpotlights(page, game);
  await openScreen(page, 'Carte électorale');
  await page.getByRole('button', { name: 'Voir Corse-du-Sud' }).click();
  const trip = page.getByRole('region', { name: 'Déplacement du président : Corse-du-Sud' });
  await expect(
    trip.getByText('Aucun déplacement du président ici pendant le mandat.'),
  ).toBeVisible();
  await trip.getByRole('button', { name: /^Déplacement de terrain en région \(\d+ h\)$/ }).click();
  await expect(trip.getByRole('status')).toHaveText(
    /« Déplacement de terrain en région » ajouté à l’agenda de la semaine\./,
  );
  await trip.getByRole('link', { name: 'Voir l’agenda au QG' }).click();
  await closeSpotlights(page, game);
  const planned = page.getByRole('list', { name: 'Actions programmées' });
  await expect(planned.getByText('Déplacement de terrain en région')).toBeVisible();
  await expect(planned.getByRole('combobox', { name: /^Cible de l’action n° 1/ })).toHaveValue(
    '2A',
  );
});
