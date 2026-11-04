import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { clampInsets } from '../map/ElectionMap';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  playedState,
  renderRoute,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Écran Carte : jsdom n'a pas WebGL, la carte affiche donc son message de repli et tout le
// reste (recherche, fiche, tableau, hors carte) reste utilisable — c'est ce qui est testé ici.
const FILES = import.meta.glob('../../../../packages/data-import/demo/cog-2026/**/*.json', {
  eager: true,
  import: 'default',
});
const demo = (name: string) => FILES[`../../../../packages/data-import/demo/cog-2026/${name}`];
const manifest = demo('manifest.json') as { departements: { fichier: string | null }[] };

const handlers = {
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture() }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  'GET /api/geo/manifeste': () => ({ body: manifest }),
  'GET /api/geo/historique': () => ({
    body: { disponible: false, raison: 'Résultats 2022 non chargés (test).' },
  }),
  'GET /api/geo/fichiers/france.topo.json': () => ({ body: demo('france.topo.json') }),
  ...Object.fromEntries(
    manifest.departements
      .filter((d) => d.fichier)
      .map((d) => [`GET /api/geo/fichiers/${d.fichier}`, () => ({ body: demo(d.fichier!) })]),
  ),
  'GET /api/geo/recherche?q=Ajaccio': () => ({
    body: [
      {
        level: 'commune',
        code: '2A004',
        nom: 'Ajaccio',
        departement: '2A',
        zone: 'metropole',
        bbox: [8.5, 41.8, 8.8, 42],
      },
    ],
  }),
};

describe('carte électorale', () => {
  it('annonce l’absence de WebGL et garde l’équivalent textuel', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    expect(await screen.findByRole('heading', { name: 'Carte électorale' })).toBeInTheDocument();
    expect(screen.getAllByText(/La carte nécessite WebGL/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Jeu de démonstration : 1\s651 communes/)).toBeInTheDocument();
    expect(screen.getByText(/Résultats 2022 non chargés \(test\)/)).toBeInTheDocument();
    const table = screen.getByRole('region', { name: /Tableau des territoires/ });
    expect(within(table).getByText('Corse-du-Sud')).toBeInTheDocument();
  });

  it('liste les régions puis filtre le tableau', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Région'));
    const table = screen.getByRole('region', { name: /Tableau des territoires \(régions\)/ });
    expect(within(table).getAllByRole('row')).toHaveLength(19);
    await user.type(within(table).getByLabelText('Filtrer par nom ou code'), 'guy');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Guyane')).toBeInTheDocument();
  });

  it('trouve une commune et ouvre sa fiche (population, nature des données)', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Rechercher un territoire/), 'Ajaccio');
    await user.click(await screen.findByRole('button', { name: /Ajaccio \(commune 2A004\)/ }));
    const sheet = await screen.findByRole('region', { name: 'Fiche : Ajaccio' });
    expect(
      within(sheet).getByText(/Commune · code 2A004 · Corse-du-Sud \(2A\)/),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(/Population légale/)).toHaveTextContent(/76\s320/);
    expect(screen.getByLabelText('Commune')).toBeChecked();
  });

  it('présente les territoires hors carte', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    const offMap = await screen.findByRole('region', { name: 'Hors carte' });
    expect(within(offMap).getByText('Français établis hors de France')).toBeInTheDocument();
    expect(within(offMap).getByText('Polynésie française')).toBeInTheDocument();
  });

  it('explique qu’aucun résultat n’est affiché avant le premier tour', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    await waitFor(() =>
      expect(
        screen.getByText(/le premier tour de la partie n’a pas encore eu lieu/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Résultats affichés')).toHaveDisplayValue(
      'Géographie seule (sans résultats)',
    );
  });

  it('compare deux candidats avec une palette divergente et une légende textuelle', async () => {
    const state = playedState((x) => x.elections.t1 !== null);
    mockApi({
      ...handlers,
      [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
    });
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Filtres' }));
    await user.selectOptions(await screen.findByLabelText('Couleurs'), 'ecart');
    const legend = screen.getByRole('region', { name: 'Légende' });
    expect(
      within(legend).getByText(/^Écart entre .+ et .+ \(points de % des exprimés\)$/),
    ).toBeInTheDocument();
    expect(within(legend).getByText('Écart de moins de 2 pts')).toBeInTheDocument();
    expect(within(legend).getAllByText(/devant de 20 pts et plus$/)).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Comparé à (rouge)'), '2');
    expect(screen.getByLabelText('Comparé à (rouge)')).toHaveValue('2');
  });

  it('signale le refus du détail communal quand la géographie électorale a changé', async () => {
    const state = playedState((x) => x.elections.t1 !== null);
    const message = 'Détail communal indisponible : la géographie électorale a changé.';
    mockApi({
      ...handlers,
      [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
      [`GET /api/games/${GAME_ID}/resultats/1/communes?departement=2A`]: () => ({
        status: 409,
        body: { error: { code: 'base_differente', message } },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Rechercher un territoire/), 'Ajaccio');
    await user.click(await screen.findByRole('button', { name: /Ajaccio \(commune 2A004\)/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('ajoute des motifs aux couleurs sur demande, légende comprise', async () => {
    const state = playedState((x) => x.elections.t1 !== null);
    mockApi({
      ...handlers,
      [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
    });
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Filtres' }));
    const toggle = await screen.findByLabelText('Motifs (daltonisme, impression)');
    const legend = screen.getByRole('region', { name: 'Légende' });
    const motifs = () =>
      [...legend.querySelectorAll('[data-motif]')].map((e) => e.getAttribute('data-motif'));
    expect(new Set(motifs())).toEqual(new Set(['aucun']));
    await user.click(toggle);
    expect(motifs()).toEqual(['aucun', 'hachures', 'hachures-inverses', 'croisillons']);
    await user.selectOptions(screen.getByLabelText('Couleurs'), 'participation');
    expect(screen.getByText(/Ce dégradé se lit par sa clarté/)).toBeInTheDocument();
  });

  it('replie les filtres par défaut, les ouvre et les referme au clavier', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: 'Filtres' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Filtres de la carte' })).toBeNull();
    // Le niveau reste accessible sur la carte, filtres fermés.
    expect(screen.getByRole('radio', { name: 'Département' })).toBeChecked();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Filtres de la carte' });
    expect(within(panel).getByLabelText('Résultats affichés')).toBeVisible();
    await user.click(within(panel).getByLabelText('Résultats affichés'));
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('ouvre la fiche dans un panneau refermable', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Rechercher un territoire/), 'Ajaccio');
    await user.click(await screen.findByRole('button', { name: /Ajaccio \(commune 2A004\)/ }));
    const sheet = await screen.findByRole('region', { name: 'Fiche : Ajaccio' });
    await user.click(within(sheet).getByRole('button', { name: 'Fermer la fiche' }));
    expect(screen.queryByRole('region', { name: 'Fiche : Ajaccio' })).toBeNull();
  });
});

describe('cadrage de la carte', () => {
  it('garde les marges des panneaux quand elles tiennent', () => {
    expect(clampInsets({ top: 60, right: 380, bottom: 16, left: 16 }, 1000, 600)).toEqual({
      top: 60,
      right: 380,
      bottom: 16,
      left: 16,
    });
  });

  it('réduit proportionnellement des marges trop grandes pour laisser de la carte', () => {
    const insets = clampInsets({ top: 120, right: 16, bottom: 400, left: 16 }, 400, 500);
    expect(insets.top + insets.bottom).toBeLessThanOrEqual(500 - 64);
    expect(insets.bottom).toBeGreaterThan(insets.top);
    expect(insets.left).toBe(16);
  });
});
