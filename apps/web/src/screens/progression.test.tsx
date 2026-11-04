import { computeProgression } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  gameFixture,
  healthHandler,
  mockApi,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
  wizardTo,
} from '../test/utils';

// Phase 20 : palmarès et défi du jour à l'écran-titre, verrous et défi dans l'assistant. La
// progression servie est celle que calcule le serveur (même fonction partagée, sans partie).

const PROGRESSION = computeProgression([], RULESET, '2026-11-03');

const handlers = {
  'GET /api/health': healthHandler,
  'GET /api/rulesets/courant': rulesetHandler,
  [`GET ${RULESET_URL}`]: rulesetHandler,
  'GET /api/games': () => ({ body: [] }),
  'GET /api/progression': () => ({ body: PROGRESSION }),
};

async function fillCandidate(user: ReturnType<typeof userEvent.setup>) {
  await wizardTo(user, 'Votre candidat');
  await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
  await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti du renouveau');
}

describe('palmarès et défi du jour (phase 20)', () => {
  it('montre le niveau, les déblocages et le défi du jour à l’écran-titre', async () => {
    mockApi(handlers);
    renderRoute('/');
    const level = await screen.findByRole('region', { name: 'Votre niveau' });
    expect(within(level).getByText('Militant')).toBeInTheDocument();
    expect(within(level).getByText(/0 point, 50 avant « Colleur d’affiches »/)).toBeInTheDocument();
    expect(
      within(level).getByRole('meter', { name: 'Progression vers le niveau 2' }),
    ).toBeVisible();
    const unlocks = within(level).getByRole('list', { name: 'Déblocages' });
    expect(
      within(unlocks)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Niveau Légende : gagner une présidentielle pour le débloquer',
      'Scénario « Candidature d’outsider » : gagner une présidentielle pour le débloquer',
    ]);
    const defi = screen.getByRole('region', { name: 'Défi du jour' });
    expect(within(defi).getByText('Pas encore de score')).toBeInTheDocument();
    expect(within(defi).getByRole('link', { name: 'Relever le défi' })).toHaveAttribute(
      'href',
      '/nouvelle-partie?defi=1',
    );
  });

  it('signale un niveau verrouillé et empêche d’avancer tant qu’il est choisi', async () => {
    mockApi(handlers);
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await fillCandidate(user);
    await wizardTo(user, 'Le terrain');
    const group = await screen.findByRole('group', { name: 'Difficulté' });
    const legende = within(group).getByRole('radio', { name: /Légende/ });
    expect(legende.closest('label')).toHaveTextContent(
      'Verrouillé : gagner une présidentielle pour le débloquer',
    );
    await user.click(legende);
    // La fiche du niveau reste consultable ; l'étape suivante est refusée.
    expect(within(group).getByRole('region', { name: /Niveau Légende/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Niveau Légende : contenu verrouillé. Gagner une présidentielle pour le débloquer.',
    );
    await user.click(within(group).getByRole('radio', { name: /Expert/ }));
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Le format' })).toBeVisible();
  });

  it('lance le défi du jour : paramètres imposés, aucun observateur, requête « defi »', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    renderRoute('/nouvelle-partie?defi=1');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Défi du jour' })).toBeVisible();
    const modes = await screen.findByRole('group', { name: 'Mode de jeu' });
    expect(within(modes).queryByRole('radio', { name: /Observateur/ })).toBeNull();
    await fillCandidate(user);
    await wizardTo(user, 'Le terrain');
    expect(screen.getByText('Étape 4 sur 4')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Difficulté' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Récapitulatif' })).toHaveTextContent(
      'FormatCourt',
    );
    await user.click(screen.getByRole('button', { name: 'Relever le défi' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      defi: true,
      mode: 'candidat_personnalise',
      name: 'Défi du jour du mardi 3 novembre 2026',
    });
    for (const key of ['seed', 'difficulty', 'format', 'scenarioId', 'startDate'])
      expect(body, key).not.toHaveProperty(key);
  });
});
