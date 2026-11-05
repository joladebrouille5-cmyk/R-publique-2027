import type { GameState } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  initialState,
  jingles,
  mockApi,
  playedState,
  recordSound,
  renderRoute,
  reportFixture,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Écran Plateau (phase 25) : la main, la pose des cartes sur la France des départements, les
// combos annoncés, les décisions en cartes, la résolution de la semaine (même requête que le QG).

const FILES = import.meta.glob('../../../../packages/data-import/demo/cog-2026/*.json', {
  eager: true,
  import: 'default',
});
const demo = (name: string) => FILES[`../../../../packages/data-import/demo/cog-2026/${name}`];

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState = initialState()) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({ state }) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
  'GET /api/geo/manifeste': () => ({ body: demo('manifest.json') }),
  'GET /api/geo/fichiers/france.topo.json': () => ({ body: demo('france.topo.json') }),
  [`POST /api/games/${GAME_ID}/advance`]: () => ({
    body: {
      game: gameFixture({ week: 1, date: '2026-10-05', version: 4 }),
      report: reportFixture(),
    },
  }),
});

const department = (name: RegExp) => screen.findByRole('button', { name });
/** Ligne de l'infobulle de lecture, texte complet (le score y est un élément à part). */
const line = (text: string) => (_: string, element: Element | null) =>
  element?.classList.contains('block') === true && element.textContent === text;
const handCard = (name: string) =>
  screen.findByRole('button', { name: new RegExp(`^Carte « ${name} »`) });

describe('plateau de jeu', () => {
  it('pose une carte Terrain au toucher, puis résout la semaine avec la même requête que le QG', async () => {
    const calls = mockApi(base());
    const sounds = recordSound();
    renderRoute(`/parties/${GAME_ID}/plateau`);
    const user = userEvent.setup();
    await user.click(await handCard('Porte-à-porte'));
    expect(screen.getByText(/Touchez un département du plateau/)).toBeVisible();
    await user.click(await department(/^Finistère \(29\)/));
    expect(jingles(sounds)).toContain('jingle:glisser');
    const placed = screen.getByRole('list', { name: /Cartes posées/ });
    expect(within(placed).getByText(/Porte-à-porte/)).toBeVisible();
    expect(within(placed).getByText(/Finistère \(29\)/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Finistère \(29\).*1 carte posée/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Jouer la semaine 0' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      expectedWeek: 0,
      actions: [{ actionId: 'porte-a-porte', cible: '29' }],
      programme: { ajouter: [], retirer: [] },
      alliances: { proposer: [] },
      decisions: [],
    });
    expect(post.headers['idempotency-key']).toMatch(/.+/);
  });

  it('pose une carte au clavier par la liste des départements, et la retire', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/plateau`);
    const user = userEvent.setup();
    (await handCard('Meeting public')).focus();
    await user.keyboard('{Enter}');
    await user.selectOptions(
      screen.getByLabelText('Département de la carte « Meeting public »'),
      '2A',
    );
    const placed = screen.getByRole('list', { name: /Cartes posées/ });
    expect(within(placed).getByText(/Corse-du-Sud \(2A\)/)).toBeVisible();
    await user.click(within(placed).getByRole('button', { name: 'Retirer Meeting public' }));
    expect(screen.queryByRole('list', { name: /Cartes posées/ })).not.toBeInTheDocument();
  });

  it('grise une carte indisponible et en donne la raison', async () => {
    const state = initialState();
    state.actors.joueur!.resources.budgetCentimes = 0;
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/plateau`);
    const card = await handCard('Grand meeting national');
    expect(card).toBeDisabled();
    expect(card).toHaveAccessibleDescription(/Budget restant insuffisant/);
  });

  it('annonce les combos : série et bastion', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/plateau`);
    const user = userEvent.setup();
    for (let i = 0; i < 2; i++) {
      await user.click(await handCard('Porte-à-porte'));
      await user.click(await department(/^Finistère \(29\)/));
    }
    const combos = screen.getByRole('status', { name: 'Combos de la semaine' });
    expect(within(combos).getByText(/Bastion ×1,5 : Finistère \(29\)/)).toBeVisible();
    expect(within(combos).getByText(/Série Terrain ×2 \(\+25 %\)/)).toBeVisible();
  });

  it('ouvre chaque décision en carte plein écran et bloque la semaine sans réponse', async () => {
    const state = playedState((s) => s.pendingDecisions.length > 0);
    expect(state.pendingDecisions.length).toBeGreaterThan(0);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/plateau`);
    expect(await screen.findByRole('dialog')).toBeVisible();
    // Derrière la carte plein écran (modale), la barre de résolution attend la réponse.
    expect(screen.getByRole('button', { name: /^Jouer la semaine/, hidden: true })).toBeDisabled();
  });

  it('garde l’alerte « Programme trop court »', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/plateau`);
    expect(await screen.findByRole('note', { name: 'Programme trop court' })).toBeVisible();
  });

  it('infobulle de lecture : au toucher d’un département, le leader, son score et le vôtre', async () => {
    const state = initialState();
    state.opinion = {
      week: 1,
      round: 1,
      participation: 7_000,
      intentions: {},
      breakdown: {},
      departements: {
        '29': { joueur: 3_100, 'adv-aurore': 2_400 },
        '13': { joueur: 900, 'adv-aurore': 2_600, 'adv-pilier': 1_800 },
      },
    };
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/plateau`);
    const user = userEvent.setup();
    await user.click(await department(/^Bouches-du-Rhône \(13\)/));
    const board = screen.getByRole('figure');
    expect(within(board).getByText(line('En tête : Élise Marchetti 26,0 %'))).toBeInTheDocument();
    expect(within(board).getByText(line('Vous : 9,0 % (3e)'))).toBeInTheDocument();
    // Le mini-sondage de la fiche, sous la carte.
    expect(
      screen.getByRole('table', { name: /^Intentions de vote dans Bouches-du-Rhône \(13\)/ }),
    ).toBeInTheDocument();
    // Même infobulle dans les deux autres lectures.
    await user.click(screen.getByRole('radio', { name: 'Sondage local' }));
    expect(within(board).getByText(line('Vous : 9,0 % (3e)'))).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Qui mène' }));
    await user.click(await department(/^Finistère \(29\)/));
    expect(within(board).getByText(line('Vous menez : 31,0 %'))).toBeInTheDocument();
    expect(within(board).getByText(line('Puis : Élise Marchetti 24,0 %'))).toBeInTheDocument();
    // L'infobulle n'est pas annoncée : le nom du département porte déjà le classement.
    expect(
      within(board).getByText(line('Vous menez : 31,0 %')).closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it('infobulle de lecture en semaine 0 : la projection viendra', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/plateau`);
    const user = userEvent.setup();
    await user.click(await department(/^Finistère \(29\)/));
    expect(
      within(screen.getByRole('figure')).getByText(/Projection disponible après une semaine/),
    ).toBeInTheDocument();
  });

  it('en observateur : le plateau sans main, la semaine se résout', async () => {
    mockApi(base(initialState('observateur')));
    renderRoute(`/parties/${GAME_ID}/plateau`);
    expect(await screen.findByText(/Mode observateur : aucune campagne/)).toBeVisible();
    expect(screen.queryByRole('region', { name: /^Main/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jouer la semaine 0' })).toBeEnabled();
  });
});
