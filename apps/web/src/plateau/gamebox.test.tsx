import type { GameState } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  initialState,
  mockApi,
  renderRoute,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Boîte de jeu (phase 25) : une grille de tuiles ouvre chaque écran dans un panneau en carton,
// par-dessus le plateau ; les anciennes adresses d'écran ouvrent le plateau sur le bon panneau.

const FILES = import.meta.glob('../../../../packages/data-import/demo/cog-2026/*.json', {
  eager: true,
  import: 'default',
});
const demo = (name: string) => FILES[`../../../../packages/data-import/demo/cog-2026/${name}`];

const handlers = (state: GameState = initialState()) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({ state }) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
  [`GET /api/games/${GAME_ID}/saves`]: () => ({ body: [] }),
  'GET /api/geo/manifeste': () => ({ body: demo('manifest.json') }),
  'GET /api/geo/fichiers/france.topo.json': () => ({ body: demo('france.topo.json') }),
});

describe('boîte de jeu', () => {
  it('ouvre une tuile dans son panneau, que Échap referme en rendant le focus', async () => {
    mockApi(handlers());
    const { router } = renderRoute(`/parties/${GAME_ID}/plateau`);
    const user = userEvent.setup();
    const box = await screen.findByRole('button', { name: 'Boîte de jeu' });
    await user.click(box);
    const grid = await screen.findByRole('dialog', { name: 'Boîte de jeu' });
    const tiles = within(grid).getAllByRole('button');
    expect(tiles.map((t) => t.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Candidats/),
        expect.stringMatching(/^Sondages/),
        expect.stringMatching(/^Programme/),
        expect.stringMatching(/^Journal/),
      ]),
    );
    await user.click(within(grid).getByRole('button', { name: /^Programme/ }));
    const panel = await screen.findByRole('dialog', { name: 'Programme' });
    expect(router.state.location.search).toBe('?panneau=programme');
    expect(within(panel).getByRole('region', { name: 'Programme' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.search).toBe('');
    expect(box).toHaveFocus();
  });

  it('les écrans du quinquennat n’apparaissent qu’avec un quinquennat', async () => {
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/plateau?panneau=boite`);
    const grid = await screen.findByRole('dialog', { name: 'Boîte de jeu' });
    expect(within(grid).queryByRole('button', { name: /^Gouvernement/ })).toBeNull();
  });

  it.each([
    ['programme', 'Programme'],
    ['candidats', 'Candidats'],
    ['sondages', 'Sondages'],
  ])('redirige l’ancienne adresse « %s » vers le plateau, panneau ouvert', async (path, title) => {
    mockApi(handlers());
    const { router } = renderRoute(`/parties/${GAME_ID}/${path}`);
    expect(await screen.findByRole('dialog', { name: title })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/plateau`);
    expect(router.state.location.search).toBe(`?panneau=${path}`);
  });
});
