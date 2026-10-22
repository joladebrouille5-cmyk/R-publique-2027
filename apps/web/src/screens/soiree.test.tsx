import { communeResults, demoBaselineFromTopologies } from '@r2027/engine';
import { SOIREE_TRANCHES, type GameState } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { percent } from './soiree/parts';
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

// Soirée électorale : un vrai premier tour dépouillé par le moteur, restitué tranche par tranche.
// jsdom n'a pas WebGL (la carte affiche son repli) : on vérifie l'horloge, le classement, le
// bandeau, le fil des départements, le suivi communal et le passage automatique en direct.
const FILES = import.meta.glob('../../../../packages/data-import/demo/cog-2026/**/*.json', {
  eager: true,
  import: 'default',
});
const demo = (name: string) => FILES[`../../../../packages/data-import/demo/cog-2026/${name}`];
const manifest = demo('manifest.json') as {
  departements: {
    code: string;
    region: string;
    population: number;
    fichier: string | null;
  }[];
};
// Même base de démonstration que l'API : départements entiers, communes de l'Ain, de la Corse,
// de la Somme et des DROM.
const BASE = demoBaselineFromTopologies(RULESET, manifest.departements, demo);

let state: GameState;
beforeAll(() => {
  state = playedState((s) => s.elections.t1 !== null, undefined, BASE);
});

const handlers = (game = gameFixture({}, state)) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: game }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
  'GET /api/geo/manifeste': () => ({ body: manifest }),
  'GET /api/geo/fichiers/france.topo.json': () => ({ body: demo('france.topo.json') }),
  ...Object.fromEntries(
    manifest.departements
      .filter((d) => d.fichier)
      .map((d) => [`GET /api/geo/fichiers/${d.fichier}`, () => ({ body: demo(d.fichier!) })]),
  ),
  [`GET /api/games/${GAME_ID}/resultats/1/communes?departement=80`]: () => ({
    body: {
      tour: 1,
      departement: '80',
      nature: 'fictif',
      communes: Object.fromEntries(communeResults(state.elections.t1!, BASE, RULESET, '80')),
    },
  }),
});

/** Mouvement réduit : le direct démarre en pause (aucune avance automatique pendant le test). */
function reducedMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('soirée électorale', () => {
  it('démarre à 20 h, avance tranche par tranche et finit sur le résultat définitif', async () => {
    reducedMotion();
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/soiree/1`);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Soirée électorale' })).toBeInTheDocument();
    expect(screen.getByText('En direct')).toBeInTheDocument();
    expect(screen.getByTestId('horloge-soiree')).toHaveTextContent('20 h 00');
    expect(screen.getByRole('heading', { name: 'Estimation à 20 h 00' })).toBeInTheDocument();
    const t1 = state.elections.t1!;
    const board = screen.getByRole('region', { name: 'Estimation à 20 h 00' });
    expect(within(board).getAllByRole('listitem')).toHaveLength(Object.keys(t1.voix).length);
    // En pause (mouvement réduit) : le bouton propose de reprendre.
    expect(screen.getByRole('button', { name: 'Reprendre le direct' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Passer à 20 h 30' }));
    expect(screen.getByTestId('horloge-soiree')).toHaveTextContent('20 h 30');

    await user.click(screen.getByRole('button', { name: 'Résultats définitifs' }));
    expect(screen.getByTestId('horloge-soiree')).toHaveTextContent(SOIREE_TRANCHES.at(-1)!);
    const final = screen.getByRole('region', { name: 'Résultats définitifs' });
    // À minuit, l'estimation est le résultat du moteur, à l'identique.
    const [leader, voix] = Object.entries(t1.voix).sort((a, b) => b[1] - a[1])[0]!;
    const actor = state.actors[leader]!.candidate;
    expect(within(final).getAllByRole('listitem')[0]!.getAttribute('aria-label')).toContain(
      percent(voix / t1.exprimes),
    );
    expect(within(final).getAllByRole('listitem')[0]).toHaveTextContent(actor.nom);
    expect(within(final).getAllByText('Qualifié(e)')).toHaveLength(2);
    const verdict = screen.getByRole('heading', { name: /^Qualifiés pour le second tour : / });
    expect(verdict).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir les résultats complets' })).toHaveAttribute(
      'href',
      `/parties/${GAME_ID}/resultats`,
    );
    // Tous les départements sont tombés dans le fil.
    const feed = screen.getByRole('list', { name: 'Départements dépouillés' });
    expect(within(feed).getAllByRole('listitem')).toHaveLength(
      Object.keys(t1.territoire!.departements).length,
    );
    expect(screen.getByRole('button', { name: 'Revoir depuis 20 h' })).toBeInTheDocument();
  });

  it('fait défiler un bandeau visuel et annonce chaque tranche aux lecteurs d’écran', async () => {
    reducedMotion();
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/soiree/1`);
    const ticker = await screen.findByTestId('bandeau-soiree');
    expect(ticker).toHaveAttribute('aria-hidden', 'true');
    expect(ticker).toHaveTextContent('Estimations');
    expect(ticker).toHaveTextContent(/des inscrits dépouillés/);
    const live = screen.getByText(/^20 h 00 : .* des inscrits dépouillés\. Estimation simulée : /);
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('progressbar', { name: 'Avancement du dépouillement' })).toBeVisible();
  });

  it('lit le direct automatiquement et le met en pause', async () => {
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/soiree/1`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mettre en pause' }));
    expect(screen.getByRole('button', { name: 'Reprendre le direct' })).toBeInTheDocument();
  });

  it('suit les communes de la Somme au fil du dépouillement', async () => {
    reducedMotion();
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/soiree/1`);
    const user = userEvent.setup();
    const select = await screen.findByLabelText('Suivre les communes d’un département');
    await waitFor(() => expect(within(select).getByText('Somme (80)')).toBeInTheDocument());
    await user.selectOptions(select, '80');
    expect(await screen.findByText(/^\d+ commune\(s\) dépouillée\(s\) sur 771$/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Résultats définitifs' }));
    expect(screen.getByText('771 commune(s) dépouillée(s) sur 771')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Vue nationale' }));
    expect(select).toHaveValue('');
  });

  it('attend le soir du scrutin', async () => {
    mockApi(handlers(gameFixture()));
    renderRoute(`/parties/${GAME_ID}/soiree/1`);
    expect(await screen.findByText(/Le premier tour n’a pas encore eu lieu/)).toBeInTheDocument();
  });

  it('passe en direct dès que la semaine du scrutin est résolue', async () => {
    const before = playedState((s) => s.meta.week + 1 >= state.meta.week, undefined, BASE);
    const calls = mockApi({
      ...handlers(gameFixture({}, before)),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: {
          game: gameFixture({}, state),
          report: reportFixture({ election: state.elections.t1 }),
        },
      }),
    });
    const { router } = renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `Résoudre la semaine ${before.meta.week}` }),
    );
    expect(await screen.findByRole('heading', { name: 'Soirée électorale' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/soiree/1`);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('propose de revivre la soirée depuis l’écran Résultats', async () => {
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/resultats`);
    expect(
      await screen.findByRole('link', { name: 'Revivre la soirée électorale' }),
    ).toHaveAttribute('href', `/parties/${GAME_ID}/soiree/1`);
  });
});
