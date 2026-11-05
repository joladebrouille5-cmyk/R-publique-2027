// Outils partagés des scénarios Playwright.
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import {
  AdvanceResponseSchema,
  debateAwaitingPlayer,
  GameDetailSchema,
  type GameDetail,
} from '@r2027/shared';

/** Assistant de création (phase 20) : « Suivant » jusqu'à l'étape intitulée `titre`. */
export async function wizardTo(page: Page, titre: string) {
  const position = page.getByText(/^Étape \d+ sur \d+$/);
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole('heading', { level: 2, name: titre }).isVisible()) return;
    const before = (await position.textContent()) ?? '';
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(position).not.toHaveText(before);
  }
  throw new Error(`Étape de l'assistant introuvable : ${titre}`);
}

/** Étape « Votre candidat » : identité minimale du candidat personnalisé. */
export async function fillCandidate(page: Page, nom = 'Durand') {
  await wizardTo(page, 'Votre candidat');
  await page.getByLabel('Prénom').fill('Camille');
  await page.getByLabel(/^Nom \*/).fill(nom);
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement Playwright');
}

/** Dernière étape : options avancées (nom, graine, date de départ), puis création. */
export async function finishWizard(
  page: Page,
  options: { name?: string; seed?: string; startDate?: string; submit?: boolean } = {},
) {
  await wizardTo(page, 'Le format');
  await page.getByText('Options avancées').click();
  if (options.name) await page.getByLabel('Nom de la partie').fill(options.name);
  if (options.seed) await page.getByLabel('Graine (facultative)').fill(options.seed);
  if (options.startDate) await page.getByLabel('Date de départ').fill(options.startDate);
  if (options.submit !== false) await page.getByRole('button', { name: 'Créer la partie' }).click();
}

/**
 * Création d'une partie, puis le QG détaillé : la partie s'ouvre sur le plateau (phase 25) ;
 * les scénarios qui jouent par le QG détaillé y vont ensuite (voir `toQG`).
 */
export async function createGame(page: Page, name: string, seed = 'e2e-boucle') {
  await page.goto('/');
  await expect(page.getByText(/Serveur connecté/)).toBeVisible();
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await fillCandidate(page);
  await finishWizard(page, { name, seed });
  await toQG(page);
}

/** Le plateau (phase 25) : l'écran où s'ouvre la partie, son gros bouton doré à l'écran. */
export async function onPlateau(page: Page) {
  await expect(page.getByRole('button', { name: /^Jouer la semaine \d+/ })).toBeVisible();
}

/**
 * Le QG détaillé (`tableau-de-bord`), comme un joueur et sans recharger la page (le plan en
 * cours reste en mémoire) : l'onglet « Plateau », puis la boîte de jeu et son lien « QG
 * détaillé ». Les décisions ouvertes en cartes plein écran sur le plateau sont remises à plus
 * tard (Échap) ; le QG les présente à son tour.
 */
export async function toQG(page: Page) {
  if (!page.url().endsWith('/tableau-de-bord')) {
    // Juste après la création ou une importation : l'adresse de la partie d'abord.
    await page.waitForURL(/\/parties\/[0-9a-f-]{36}\//);
    if (!/\/plateau(\?|#|$)/.test(page.url())) {
      const nav = page.getByRole('navigation', { name: 'Espaces de la partie' });
      await nav.getByRole('link', { name: 'Plateau', exact: true }).click();
      await page.waitForURL(/\/plateau(\?|#|$)/);
    }
    const box = page.getByRole('button', { name: 'Boîte de jeu' });
    await expect(async () => {
      if (await page.getByRole('dialog').first().isVisible()) await page.keyboard.press('Escape');
      await box.click({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page
      .getByRole('dialog', { name: 'Boîte de jeu' })
      .getByRole('link', { name: 'QG détaillé' })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
}

/** Identifiant de la partie affichée, d'après l'URL. */
export const gameIdOf = (page: Page) => /\/parties\/([0-9a-f-]{36})\//.exec(page.url())![1]!;

/**
 * Débat obligatoire (phase 17) : fin simulée, demandée par l'API comme depuis le plateau, de
 * chaque débat de la semaine qui attend le joueur.
 */
export async function concludeDebatesViaApi(page: Page, game: GameDetail): Promise<GameDetail> {
  let current = game;
  for (let i = 0; i < 4; i++) {
    const debate = debateAwaitingPlayer(current.state);
    if (!debate) break;
    const response = await page.request.post(`/api/games/${current.id}/debats/${debate.id}`, {
      data: { action: 'finir', sequence: debate.enCours?.index ?? 0 },
    });
    expect(response.status(), await response.text()).toBe(200);
    current = GameDetailSchema.parse(await response.json());
  }
  return current;
}

/**
 * Fait avancer la partie par l'API (même session que le navigateur) jusqu'à ce que `done`
 * soit vrai ou que la partie se bloque, en répondant aux décisions par l'option par défaut.
 */
export async function advanceViaApi(
  page: Page,
  done: (game: GameDetail) => boolean,
  /** Avance rapide (semaines par requête, arrêtée par le serveur avant toute décision). */
  semaines?: number,
): Promise<GameDetail> {
  const id = gameIdOf(page);
  let game = GameDetailSchema.parse(await (await page.request.get(`/api/games/${id}`)).json());
  for (let i = 0; i < 60 && !done(game) && !game.state.calendar.blockedBy; i++) {
    game = await concludeDebatesViaApi(page, game);
    const response = await page.request.post(`/api/games/${id}/advance`, {
      headers: { 'idempotency-key': randomUUID().replaceAll('-', '') },
      data: {
        expectedWeek: game.week,
        actions: [],
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
        ...(semaines ? { semaines } : {}),
      },
    });
    expect(response.status()).toBe(200);
    game = AdvanceResponseSchema.parse(await response.json()).game;
  }
  return game;
}

/**
 * Comme `advanceViaApi`, mais en candidat : deux actions « élus locaux » par semaine jusqu'à la
 * clôture des parrainages, puis la préparation des débats jusqu'au premier tour.
 */
export async function advanceAsCandidate(
  page: Page,
  done: (game: GameDetail) => boolean,
): Promise<GameDetail> {
  const id = gameIdOf(page);
  let game = GameDetailSchema.parse(await (await page.request.get(`/api/games/${id}`)).json());
  const ruleset = (await (
    await page.request.get(`/api/rulesets/${encodeURIComponent(game.rulesetVersion)}`)
  ).json()) as {
    parrainages: { reservoir: { departements: Record<string, unknown> } };
    calendrier: { echeances: { id: string; date: string }[] };
  };
  const departements = Object.keys(ruleset.parrainages.reservoir.departements).sort();
  const closing = ruleset.calendrier.echeances.find((e) => e.id === 'presentation-candidatures')!;
  for (let i = 0; i < 60 && !done(game) && !game.state.calendar.blockedBy; i++) {
    game = await concludeDebatesViaApi(page, game);
    const actions =
      game.date < closing.date
        ? [0, 1].map((k) => ({
            actionId: 'elus-locaux',
            cible: departements[(game.week * 2 + k) % departements.length]!,
          }))
        : game.state.elections.t1
          ? []
          : [{ actionId: 'preparation-debat' }];
    const response = await page.request.post(`/api/games/${id}/advance`, {
      headers: { 'idempotency-key': randomUUID().replaceAll('-', '') },
      data: {
        expectedWeek: game.week,
        actions,
        decisions: game.state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    game = AdvanceResponseSchema.parse(await response.json()).game;
  }
  return game;
}

/**
 * Écrans du cahier des charges (§13) : l'onglet de leur espace et leur section dépliable (phase
 * 20 : quatre paires d'écrans partagent une section commune).
 */
const SCREENS: Record<string, { espace: string; section?: string }> = {
  'Tableau de bord': { espace: 'QG' },
  Journal: { espace: 'QG', section: 'archives' },
  Sauvegardes: { espace: 'QG', section: 'archives' },
  'Carte électorale': { espace: 'Carte' },
  Programme: { espace: 'Campagne', section: 'programme' },
  Candidats: { espace: 'Campagne', section: 'candidats' },
  Médias: { espace: 'Campagne', section: 'medias' },
  Finances: { espace: 'Campagne', section: 'finances' },
  Sondages: { espace: 'Opinion', section: 'sondages-resultats' },
  Résultats: { espace: 'Opinion', section: 'sondages-resultats' },
  Gouvernement: { espace: 'Pouvoir', section: 'executif' },
  'Conseil des ministres': { espace: 'Pouvoir', section: 'executif' },
  Parlement: { espace: 'Pouvoir', section: 'parlement' },
  Économie: { espace: 'Pouvoir', section: 'economie-crises' },
  Crises: { espace: 'Pouvoir', section: 'economie-crises' },
  Législatives: { espace: 'Pouvoir', section: 'legislatives' },
  'Bilan du quinquennat': { espace: 'Pouvoir', section: 'bilan' },
};

/** Adresse de chaque espace (phase 12). */
const HUB_PATHS: Record<string, string> = {
  Carte: 'carte',
  Campagne: 'campagne',
  Opinion: 'opinion',
  Pouvoir: 'pouvoir',
};

/**
 * Ouvre un écran (phase 12) : l'onglet de son espace dans « Espaces de la partie » (rail sur
 * ordinateur, barre du bas sur mobile), puis, pour un écran secondaire, sa section dépliable.
 * Phase 25 : le QG détaillé (et ses archives) s’atteint par son adresse (voir `toQG`) ; le
 * plateau, plein cadre, n'a pas la barre des espaces : on y gagne l'espace par son adresse.
 */
export async function openScreen(page: Page, label: string) {
  const target = SCREENS[label];
  if (!target) throw new Error(`Écran inconnu : ${label}`);
  if (target.espace === 'QG') await toQG(page);
  else {
    const nav = page.getByRole('navigation', { name: 'Espaces de la partie' });
    if (await nav.isVisible())
      await nav.getByRole('link', { name: target.espace, exact: true }).click();
    else await page.goto(`/parties/${gameIdOf(page)}/${HUB_PATHS[target.espace]}`);
  }
  if (!target.section) return;
  await openSection(page, target.section);
}

/** Déplie une section de la page (sans effet si elle l'est déjà). */
export async function openSection(page: Page, id: string) {
  const toggle = page.locator(`section#${id} > h2 > button`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Résout la semaine depuis le tableau de bord (décisions : première option). */
export async function resolveWeek(page: Page, week: number) {
  const decisions = page.getByRole('region', { name: 'Décisions à prendre' });
  if (await decisions.isVisible()) {
    // Une décision par fieldset (les groupes repliables d'une nomination sont aussi des « group »).
    // Le bouton radio est masqué visuellement : on clique sur l'étiquette, comme un joueur.
    for (const decision of await decisions.locator('fieldset').all()) {
      const option = decision.locator('label', { has: page.getByRole('radio') }).first();
      await option.click();
      await expect(option.getByRole('radio')).toBeChecked();
    }
  }
  await page.getByRole('button', { name: `Résoudre la semaine ${week}` }).click();
  await closeDebrief(page, week);
  await expect(
    page.getByRole('heading', { name: `Bilan de la semaine ${week}`, exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: `Résoudre la semaine ${week + 1}` })).toBeVisible();
}

/** Verdict de la semaine (phase 25, ancien débriefing), ouvert après la résolution. */
export async function closeDebrief(page: Page, week: number) {
  const debrief = page.getByRole('dialog', { name: `Verdict de la semaine ${week}` });
  await expect(debrief).toBeVisible();
  await debrief.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(debrief).toBeHidden();
}

/**
 * Attend la fin des animations finies (entrées en fondu, montées) : un audit de contraste mené
 * pendant un fondu mesure des éléments encore transparents. Les animations infinies (voyant
 * « En direct », bandeau défilant) sont ignorées.
 */
export async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
}
