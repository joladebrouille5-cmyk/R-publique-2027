import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Écran-titre (phase 16) : mur d'affichage des candidats fictifs, reprise de la dernière partie.

const OLDER_ID = '22222222-2222-4222-8222-222222222222';

function summary(id: string, name: string, updatedAt: string) {
  const { state: _state, seed: _seed, ...rest } = gameFixture({ id, name, updatedAt });
  return rest;
}

describe('écran-titre', () => {
  it('affiche un panneau numéroté par candidat fictif et un panneau libre', async () => {
    mockApi({
      'GET /api/health': healthHandler,
      'GET /api/games': () => ({ body: [] }),
      'GET /api/rulesets/courant': rulesetHandler,
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('RÉPUBLIQUE 2027');
    const wall = await screen.findByRole('list', {
      name: 'Mur d’affichage : les candidats fictifs de la campagne',
    });
    expect(await within(wall).findByText(RULESET.candidatsFictifs[0]!.nom)).toBeInTheDocument();
    const panels = within(wall).getAllByRole('listitem');
    expect(panels).toHaveLength(8);
    RULESET.candidatsFictifs.forEach((candidate, index) => {
      expect(within(panels[index]!).getByText(candidate.prenom)).toBeInTheDocument();
      expect(within(panels[index]!).getByText(candidate.parti)).toBeInTheDocument();
    });
    expect(within(panels[7]!).getByText('Votre affiche')).toBeInTheDocument();
    // Sans partie : une seule invitation, la création.
    expect(
      await screen.findByText('Aucune partie pour l’instant. Créez-en une pour commencer.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nouvelle partie' })).toHaveAttribute(
      'href',
      '/nouvelle-partie',
    );
    expect(screen.queryByRole('link', { name: 'Reprendre la partie' })).not.toBeInTheDocument();
  });

  it('propose de reprendre la dernière partie modifiée, avec son candidat et son échéance', async () => {
    mockApi({
      'GET /api/health': healthHandler,
      'GET /api/games': () => ({
        body: [
          summary(OLDER_ID, 'Ancienne campagne', '2026-10-01T10:00:00.000Z'),
          summary(GAME_ID, 'Campagne en cours', '2026-10-25T10:00:00.000Z'),
        ],
      }),
      'GET /api/rulesets/courant': rulesetHandler,
      [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({ name: 'Campagne en cours' }) }),
      [`GET ${RULESET_URL}`]: rulesetHandler,
    });
    renderRoute('/');
    const latest = await screen.findByRole('region', { name: 'Dernière partie' });
    expect(await within(latest).findByText('Camille Test')).toBeInTheDocument();
    expect(within(latest).getByText('Partie « Campagne en cours »')).toBeInTheDocument();
    // Compte à rebours du prochain scrutin du calendrier du jeu de règles.
    expect(await within(latest).findByText(/^J−\d+$/)).toBeInTheDocument();
    expect(within(latest).getByRole('link', { name: 'Reprendre la partie' })).toHaveAttribute(
      'href',
      `/parties/${GAME_ID}/plateau`,
    );
    // La liste suit l'ordre des modifications, la plus récente d'abord.
    const list = screen
      .getByRole('heading', { name: 'Vos parties' })
      .parentElement!.querySelector('ul')!;
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/parties/${GAME_ID}/plateau`, `/parties/${OLDER_ID}/plateau`]);
    expect(screen.getAllByRole('link', { name: /Nouvelle partie/ })).toHaveLength(1);
  });
});
