import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GAME_SCREENS } from './registry';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  renderRoute,
  saveFixture,
} from '../test/utils';

const gameHandlers = {
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture() }),
};

describe('navigation de partie', () => {
  it('propose tous les écrans du cahier des charges (§13)', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const nav = await screen.findByRole('navigation', { name: 'Écrans de la partie' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toHaveLength(GAME_SCREENS.length);
    for (const expected of [
      'Tableau de bord',
      'Carte électorale',
      'Candidats',
      'Programme',
      'Finances',
      'Sondages',
      'Gouvernement',
      'Parlement',
      'Économie',
      'Crises',
      'Journal',
      'Sauvegardes',
    ]) {
      expect(labels.some((text) => text?.startsWith(expected))).toBe(true);
    }
  });

  it('affiche le tableau de bord avec la date en jeu', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}`);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getAllByText('lundi 28 septembre 2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Semaine suivante/ })).toBeDisabled();
  });

  it('annonce un écran non implémenté sans données factices', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}/carte`);
    expect(await screen.findByText('Non disponible — prévu en phase 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Carte électorale' })).toBeInTheDocument();
  });

  it('signale une partie introuvable', async () => {
    mockApi({ 'GET /api/health': healthHandler });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByText('Cette partie est introuvable.')).toBeInTheDocument();
  });
});

describe('création de partie', () => {
  it('désactive le mode candidat réel tant qu’il n’est pas implémenté', async () => {
    mockApi({ 'GET /api/health': healthHandler });
    renderRoute('/nouvelle-partie');
    expect(await screen.findByRole('radio', { name: /Candidat réel/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Candidat personnalisé/ })).toBeChecked();
  });

  it('envoie la requête puis ouvre le tableau de bord', async () => {
    const calls = mockApi({
      ...gameHandlers,
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    const { router } = renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nom de la partie'), 'Ma campagne');
    await user.click(screen.getByRole('radio', { name: /Expert/ }));
    await user.type(screen.getByLabelText('Graine (facultative)'), 'ma-graine');
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/tableau-de-bord`),
    );
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'Ma campagne',
      mode: 'candidat_personnalise',
      difficulty: 'expert',
      startDate: '2026-09-28',
      seed: 'ma-graine',
    });
  });

  it('affiche le message d’erreur du serveur', async () => {
    mockApi({
      'GET /api/health': healthHandler,
      'POST /api/games': () => ({
        status: 422,
        body: {
          error: {
            code: 'date_de_depart_invalide',
            message: 'La partie avance par semaines : la date de départ doit être un lundi.',
          },
        },
      }),
    });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nom de la partie'), 'X');
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('doit être un lundi');
  });
});

describe('sauvegardes', () => {
  const savesUrl = `/api/games/${GAME_ID}/saves`;

  it('sauvegarde dans un emplacement vide', async () => {
    const calls = mockApi({
      ...gameHandlers,
      [`GET ${savesUrl}`]: () => ({ body: [saveFixture()] }),
      [`POST ${savesUrl}`]: () => ({ status: 201, body: saveFixture({ slot: 1 }) }),
    });
    renderRoute(`/parties/${GAME_ID}/sauvegardes`);
    const user = userEvent.setup();
    const slot1 = await screen.findByRole('listitem', { name: 'Emplacement 1' });
    expect(within(slot1).getByText('Vide')).toBeInTheDocument();
    expect(
      within(screen.getByRole('listitem', { name: 'Emplacement 2' })).getByText(/Avant le débat/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem', { name: /Emplacement/ })).toHaveLength(5);

    await user.type(screen.getByLabelText(/Libellé/), 'Début');
    await user.click(within(slot1).getByRole('button', { name: 'Sauvegarder ici' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        slot: 1,
        overwrite: false,
        label: 'Début',
      }),
    );
    expect(await screen.findByText('Partie sauvegardée dans l’emplacement 1.')).toBeInTheDocument();
  });

  it('demande confirmation avant de restaurer et transmet la version vue', async () => {
    const save = saveFixture();
    const calls = mockApi({
      ...gameHandlers,
      [`GET ${savesUrl}`]: () => ({ body: [save] }),
      [`POST ${savesUrl}/${save.id}/restore`]: () => ({ body: gameFixture({ version: 4 }) }),
    });
    renderRoute(`/parties/${GAME_ID}/sauvegardes`);
    const user = userEvent.setup();
    const slot2 = await screen.findByRole('listitem', { name: 'Emplacement 2' });
    await user.click(within(slot2).getByRole('button', { name: 'Restaurer' }));
    expect(calls.some((call) => call.url.endsWith('/restore'))).toBe(false);

    await user.click(within(slot2).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() =>
      expect(calls.find((call) => call.url.endsWith('/restore'))?.body).toEqual({
        expectedVersion: 3,
      }),
    );
    expect(await screen.findByText('Emplacement 2 restauré (semaine 0).')).toBeInTheDocument();
  });
});

describe('thème', () => {
  it('applique le thème sombre', async () => {
    mockApi({ 'GET /api/health': healthHandler, 'GET /api/games': () => ({ body: [] }) });
    renderRoute('/');
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox'), 'sombre');
    expect(document.documentElement).toHaveClass('dark');
    await user.selectOptions(screen.getByRole('combobox'), 'clair');
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
