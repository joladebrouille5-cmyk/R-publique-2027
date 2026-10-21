import { advanceWeek, openQuinquennat } from '@r2027/engine';
import type { GameState } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByText(/la feuille de route n’est pas encore appliquée/)).toBeInTheDocument();
  });
});
