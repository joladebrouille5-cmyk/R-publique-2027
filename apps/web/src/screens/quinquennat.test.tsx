import { advanceWeek, openQuinquennat } from '@r2027/engine';
import type { GameState } from '@r2027/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  playedState,
  renderRoute,
  reportFixture,
  RULESET,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Phase 6 : présidence et gouvernement à l'écran (états produits par le vrai moteur).

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
});

const elected = playedState((s) => s.quinquennat !== null);

const step = (state: GameState) =>
  advanceWeek(
    state,
    {
      actions: [],
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
    },
    { ruleset: RULESET },
  ).state;

/** Le joueur déclaré élu, puis la semaine de l'investiture : la nomination l'attend. */
function playerAtInvestiture(): GameState {
  const state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors.joueur!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULESET, 'joueur');
  return step(state);
}

describe('quinquennat', () => {
  it('le président joueur nomme son Premier ministre ; son agenda remplace la campagne', async () => {
    const state = playerAtInvestiture();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);

    const panel = await screen.findByRole('region', { name: /Quinquennat 2027–2032/ });
    expect(
      within(panel).getByText(/Vous êtes président\(e\) de la République/),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/Matignon est vacant/)).toBeInTheDocument();
    expect(screen.getByText('Nomination')).toBeInTheDocument();
    const decision = screen.getByRole('group', { name: 'Nommer le Premier ministre' });
    const profile = RULESET.quinquennat.profils[0]!;
    expect(
      within(decision).getByRole('radio', {
        name: new RegExp(`${profile.prenom} ${profile.nom} — profil fictif`),
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Agenda du président cette semaine' }),
    ).toBeVisible();
    const catalog = screen.getByRole('list', { name: 'Catalogue des actions' });
    expect(within(catalog).getAllByRole('listitem')).toHaveLength(
      RULESET.quinquennat.actions.length,
    );
    expect(within(catalog).getByText('Aucun gouvernement en place à remanier.')).toBeVisible();
    for (const action of RULESET.quinquennat.actions.filter((a) => !a.institution))
      expect(screen.getByRole('button', { name: `Ajouter ${action.libelle}` })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ajouter Remaniement du gouvernement' }),
    ).toBeDisabled();
    expect(screen.getByText(/Reste après le plan : 70 h · 0\/8 actions/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter Meeting public' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Résoudre la semaine 32' })).toBeDisabled();
  });

  it('le joueur battu suit le quinquennat en avance rapide', async () => {
    const calls = mockApi({
      ...base(elected),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: {
          game: gameFixture({ week: 83 }, elected),
          report: reportFixture({ week: 82, nextWeek: 83 }),
          avanceRapide: { demandees: 52, resolues: 52, arret: null },
        },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const panel = await screen.findByRole('region', { name: /Quinquennat 2027–2032/ });
    expect(within(panel).getByText(/Vous n’êtes pas président\(e\)/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Catalogue des actions' })).toBeNull();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Avance rapide'), '52');
    await user.click(screen.getByRole('button', { name: 'Avancer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      expectedWeek: elected.meta.week,
      actions: [],
      semaines: 52,
    });
    expect(
      await screen.findByText('Avance rapide : 52 semaine(s) résolue(s) sur 52.'),
    ).toBeInTheDocument();
  });

  it('présente le gouvernement, la nature de chaque membre et la feuille de route', async () => {
    let state = elected;
    while (!state.quinquennat!.gouvernement) state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/gouvernement`);
    expect(await screen.findByRole('heading', { name: 'Gouvernement n° 1' })).toBeInTheDocument();
    expect(screen.getByText('Premier ministre')).toBeInTheDocument();
    for (const poste of RULESET.quinquennat.postes)
      expect(screen.getByText(poste.libelle)).toBeInTheDocument();
    const government = state.quinquennat!.gouvernement!;
    const profiles = [government.premierMinistre, ...government.ministres].filter(
      (m) => m.nature === 'profil',
    );
    expect(screen.getAllByText('Profil fictif')).toHaveLength(profiles.length);
    expect(
      screen.getByText(/Mandat n° 1 du vendredi 14 mai 2027 au jeudi 13 mai 2032/),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Feuille de route' })).toBeInTheDocument();
    expect(
      screen.getByText(/seules celles que le Parlement adopte sont appliquées/),
    ).toBeInTheDocument();
  });

  it('le Parlement : groupes réels, textes et votes simulés par groupe', async () => {
    let state = elected;
    for (let i = 0; i < 40; i++) state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/parlement`);
    const assembly = await screen.findByRole('region', {
      name: /Assemblée nationale \(17e législature\)/,
    });
    const table = within(assembly).getByRole('table', { name: 'Groupes politiques et sièges' });
    expect(within(table).getAllByRole('row')).toHaveLength(RULESET.assemblee.groupes.length + 1);
    expect(within(assembly).getByText(/majorité des membres : \d+ voix/)).toBeInTheDocument();
    expect(within(assembly).getByText(/sans aucun nom de député/)).toBeInTheDocument();
    // Le président (candidat fictif) dépose son programme : des textes ont déjà été votés.
    expect(state.parlement!.textes.some((b) => b.votes.length > 0)).toBe(true);
    expect(screen.getAllByText(/votes de groupe simulés/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('table').length).toBeGreaterThan(1);
  });

  it('le président joueur conduit un texte incertain depuis le tableau de bord', async () => {
    const start = JSON.parse(JSON.stringify(elected)) as GameState;
    for (const actor of Object.values(start.actors))
      if (actor.status === 'elu') actor.status = 'battu';
    start.actors.joueur!.status = 'elu';
    // Programme fabriqué pour le test : propositions de centre droit, dans l'ordre.
    start.actors.joueur!.programme.propositions = [
      'eco-simplification-pme',
      'pa-prime-partage-valeur',
      'immi-integration-langue',
    ];
    start.quinquennat = null;
    openQuinquennat(start, RULESET, 'joueur');
    let state = start;
    for (let i = 0; i < 40 && !state.pendingDecisions.some((d) => d.kind === 'texte'); i++)
      state = step(state);
    const decision = state.pendingDecisions.find((d) => d.kind === 'texte');
    expect(decision).toBeDefined();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const decisions = await screen.findByRole('region', { name: 'Décisions à prendre' });
    expect(within(decisions).getByText('Parlement')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: decision!.label });
    expect(
      within(group).getByRole('radio', { name: /Négocier des amendements/ }),
    ).toBeInTheDocument();
    expect(within(group).getByText(/Projection du gouvernement/)).toBeInTheDocument();
  });

  it('l’économie : valeurs de départ de l’Insee, valeurs simulées et facteurs', async () => {
    let state = elected;
    for (let i = 0; i < 6; i++) state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/economie`);
    const unemployment = await screen.findByRole('listitem', { name: 'Taux de chômage' });
    expect(within(unemployment).getByText('Donnée Insee')).toBeInTheDocument();
    expect(
      within(unemployment).getByRole('link', { name: /Taux de chômage au sens du BIT/ }),
    ).toHaveAttribute('href', 'https://www.insee.fr/fr/statistiques/serie/001688527');
    const tensions = screen.getByRole('listitem', {
      name: 'Tensions sociales (indicateur de jeu, 0 à 100)',
    });
    expect(within(tensions).getByText('Convention du jeu')).toBeInTheDocument();
    expect(screen.getByText(/Aucune valeur simulée n’est une prévision/)).toBeInTheDocument();
  });

  it('les crises : catalogue fictif et décision en attente', async () => {
    mockApi(base(elected));
    renderRoute(`/parties/${GAME_ID}/crises`);
    const catalog = await screen.findByRole('region', { name: 'Crises possibles (fictives)' });
    expect(within(catalog).getAllByRole('listitem')).toHaveLength(RULESET.crises.length);
    expect(within(catalog).getAllByText('Fictif').length).toBe(RULESET.crises.length);
    expect(screen.getByText('Aucune crise n’attend de décision.')).toBeInTheDocument();
  });

  it('les législatives : Assemblée de 2024 réelle, filtre par département, sans nom', async () => {
    mockApi(base(elected));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const calendar = await screen.findByRole('region', { name: 'Calendrier' });
    expect(within(calendar).getByText(/premier tour le dimanche 10 juin 2029/)).toBeInTheDocument();
    expect(within(calendar).getByText(/Hypothèse : dates réelles fixées par décret/)).toBeVisible();
    expect(within(calendar).getByText(/possible depuis le lundi 7 juillet 2025/)).toBeVisible();
    const composition = screen.getByRole('region', { name: 'Dernières élections' });
    expect(within(composition).getByText('Résultats réels')).toBeInTheDocument();
    const blocs = within(composition).getByRole('table', {
      name: 'Sièges et voix du premier tour par bloc',
    });
    expect(within(blocs).getAllByRole('row')).toHaveLength(RULESET.legislatives.blocs.length + 1);
    const seats = within(blocs)
      .getAllByRole('row')
      .slice(1)
      .map((row) => Number(within(row).getAllByRole('cell')[0]!.textContent));
    expect(seats.reduce((a, b) => a + b, 0)).toBe(
      Object.values(elected.parlement!.groupes).reduce((sum, g) => sum + g.sieges, 0),
    );

    const districts = screen.getByRole('region', {
      name: 'Résultats par circonscription en 2024 (réels)',
    });
    const table = within(districts).getByRole('table');
    const ain = RULESET.legislatives2024.circonscriptions.filter((d) => d.departement === '01');
    expect(within(table).getAllByRole('row')).toHaveLength(ain.length + 1);
    expect(
      within(table).getByRole('rowheader', { name: 'Ain — 1ère circonscription' }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(within(districts).getByLabelText('Département'), '2A');
    const corse = RULESET.legislatives2024.circonscriptions.filter((d) => d.departement === '2A');
    expect(within(table).getAllByRole('row')).toHaveLength(corse.length + 1);
    expect(within(districts).getByText(/sans aucun nom de candidat/)).toBeInTheDocument();
  });

  it('les législatives après une dissolution : premier tour, puis nouvelle Assemblée simulée', async () => {
    let state = playerAtInvestiture();
    while (!state.quinquennat!.gouvernement) state = step(state);
    const dissolved = advanceWeek(
      state,
      { actions: [{ actionId: 'dissolution' }], decisions: [] },
      { ruleset: RULESET },
    ).state;
    let current = dissolved;
    while (!current.legislatives!.premierTour) current = step(current);
    mockApi(base(current));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const calendar = await screen.findByRole('region', { name: 'Calendrier' });
    expect(within(calendar).getByText(/Élections anticipées après la dissolution/)).toBeVisible();
    expect(within(calendar).getByText(/des élections législatives sont en cours/)).toBeVisible();
    const pending = screen.getByRole('region', {
      name: 'Premier tour en cours (résultats simulés)',
    });
    expect(within(pending).getAllByText('Second tour à venir').length).toBeGreaterThan(0);
    cleanup();

    while (current.legislatives!.premierTour) current = step(current);
    mockApi(base(current));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const composition = await screen.findByRole('region', { name: 'Dernières élections' });
    expect(
      within(composition).getByText(/anticipées après dissolution \(résultats simulés\)/),
    ).toBeInTheDocument();
    expect(within(composition).getByText('Simulation')).toBeInTheDocument();
    expect(within(composition).getByText(/Majorité absolue : 289 sièges sur 577/)).toBeVisible();
    expect(
      within(composition).getByText(/Aucun résultat simulé n’est une prévision/),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Résultats par circonscription (simulés)' }),
    ).toBeInTheDocument();
  });

  it('le président joueur ne peut pas dissoudre deux fois dans l’année', async () => {
    let state = playerAtInvestiture();
    while (!state.quinquennat!.gouvernement) state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const label = `Ajouter ${RULESET.quinquennat.actions.find((a) => a.id === 'dissolution')!.libelle}`;
    const dissolve = await screen.findByRole('button', { name: label });
    expect(dissolve).toBeEnabled();
    cleanup();

    let current = advanceWeek(
      state,
      { actions: [{ actionId: 'dissolution' }], decisions: [] },
      { ruleset: RULESET },
    ).state;
    while (current.legislatives!.derniere.motif === 'reelles-2024') current = step(current);
    mockApi(base(current));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const catalog = await screen.findByRole('list', { name: 'Catalogue des actions' });
    expect(
      within(catalog).getByText(/Pas de nouvelle dissolution dans l’année qui suit/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  });
});
