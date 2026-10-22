import { advanceWeek, createGame, playDebate } from '@r2027/engine';
import type { DebateRequest, GameState } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  playedState,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
  TEST_CANDIDATE,
} from '../test/utils';

// Débats télévisés (phase 10) : annonce au tableau de bord, plateau en direct (cartes, attaque
// ciblée), relecture du débat terminé. Les états viennent du vrai moteur ; le faux serveur joue
// chaque demande avec le moteur, comme l'API.

const URL = `/api/games/${GAME_ID}/debats/debat-t1-tous`;
let state: GameState;
beforeAll(() => {
  state = playedState((s) =>
    s.debats.seances.some((d) => d.id === 'debat-t1-tous' && d.semaine === s.meta.week),
  );
});

function handlers(start: GameState) {
  let current = start;
  return {
    'GET /api/health': healthHandler,
    [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, current) }),
    [`GET ${RULESET_URL}`]: rulesetHandler,
    [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
      body: { entries: [], nextBefore: null },
    }),
    [`POST ${URL}`]: (body: unknown) => {
      current = playDebate(current, RULESET, 'debat-t1-tous', body as DebateRequest).state;
      return { body: gameFixture({}, current) };
    },
  };
}

const session = (s: GameState) => s.debats.seances.find((d) => d.id === 'debat-t1-tous')!;

describe('débats télévisés', () => {
  it('annonce le débat de la semaine au tableau de bord et permet la chaise vide', async () => {
    const calls = mockApi(handlers(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const panel = await screen.findByRole('region', { name: 'Débats télévisés' });
    expect(within(panel).getByText('Débat de tous les candidats')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Entrer sur le plateau' })).toHaveAttribute(
      'href',
      `/parties/${GAME_ID}/debat/debat-t1-tous`,
    );
    await user.click(within(panel).getByRole('button', { name: 'Refuser ce débat' }));
    await user.click(within(panel).getByRole('button', { name: 'Confirmer la chaise vide' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ action: 'refuser' }),
    );
    expect(await within(panel).findByText(/Vous avez refusé : chaise vide/)).toBeInTheDocument();
  });

  it('annonce un débat à venir et la préparation en cours', async () => {
    const early = playedState((s) => s.meta.date >= '2027-03-08');
    mockApi(handlers(early));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const panel = await screen.findByRole('region', { name: 'Débats télévisés' });
    expect(within(panel).getByText('Grand débat à cinq')).toBeInTheDocument();
    expect(
      within(panel).getByText(/Votre préparation : \d+ h sur 40 h utiles/),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText(/date hypothèse du jeu/).length).toBeGreaterThan(0);
  });

  it('joue une carte, puis une attaque ciblée, sur le plateau en direct', async () => {
    const calls = mockApi(handlers(state));
    renderRoute(`/parties/${GAME_ID}/debat/debat-t1-tous`);
    const user = userEvent.setup();
    expect(
      await screen.findByRole('heading', { name: 'Débat de tous les candidats' }),
    ).toBeInTheDocument();
    expect(screen.getByText('En direct')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pupitres' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Courbe d’approbation du public/ })).toBeInTheDocument();
    const cards = screen.getByRole('list', { name: 'Cartes de la séquence' });
    expect(within(cards).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: /^Séquence 1 :/ })).toBeInTheDocument();

    const first = session(state).enCours!.cartes[0]!.carte;
    await user.click(within(cards).getAllByRole('button')[0]!);
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')[0]?.body).toEqual({
        action: 'jouer',
        sequence: 0,
        carte: first,
      }),
    );
    expect(await screen.findByRole('heading', { name: /^Séquence 2 :/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Déroulé du débat' })).toBeInTheDocument();

    // Attaque : cible et angle choisis par le joueur.
    const next = screen.getByRole('list', { name: 'Cartes de la séquence' });
    await user.click(within(next).getByRole('button', { name: /^Attaquer/ }));
    const form = screen.getByRole('form', { name: 'Préparer l’attaque' });
    await user.click(within(form).getByRole('radio', { name: /Comptes de campagne/ }));
    await user.click(within(form).getByRole('button', { name: 'Lancer l’attaque' }));
    await waitFor(() => {
      const posted = calls.filter((c) => c.method === 'POST')[1]?.body as Record<string, unknown>;
      expect(posted).toMatchObject({
        action: 'jouer',
        sequence: 1,
        carte: 'attaquer',
        angle: 'finances',
      });
      expect(typeof posted.cible).toBe('string');
    });
    expect(await screen.findByRole('heading', { name: /^Séquence 3 :/ })).toBeInTheDocument();
  });

  it('simule la fin du débat, puis montre le sondage flash et la relecture', async () => {
    mockApi(handlers(state));
    renderRoute(`/parties/${GAME_ID}/debat/debat-t1-tous`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Simuler la fin du débat' }));
    expect(await screen.findByText('Débat terminé')).toBeInTheDocument();
    const poll = screen.getByRole('region', { name: 'Le plus convaincant' });
    expect(within(poll).getByText('Sondage flash simulé')).toBeInTheDocument();
    expect(within(poll).getAllByRole('listitem').length).toBe(
      session(state).invites.length - session(state).refus.length,
    );
    expect(screen.getByRole('button', { name: 'Revoir en accéléré' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Cartes de la séquence' })).not.toBeInTheDocument();
  });

  it('n’attribue aucune réplique à une personnalité réelle', async () => {
    // Partie face aux personnalités réelles, débat mené jusqu'au bout par le moteur.
    const reels = playedState(
      (s) => s.debats.seances.some((d) => d.id === 'debat-t1-tous' && d.semaine === s.meta.week),
      createGame(
        {
          seed: 'graine-test',
          mode: 'candidat_personnalise',
          difficulty: 'standard',
          candidate: TEST_CANDIDATE,
          adversaires: 'reels',
        },
        RULESET,
      ),
    );
    // Débat mené à son terme à la résolution de la semaine (fin simulée si le joueur y est).
    const done = advanceWeek(
      reels,
      {
        actions: [],
        decisions: reels.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset: RULESET },
    ).state;
    mockApi(handlers(done));
    renderRoute(`/parties/${GAME_ID}/debat/debat-t1-tous`);
    expect(await screen.findByRole('heading', { name: 'Déroulé du débat' })).toBeInTheDocument();
    const realMoves = session(done)
      .sequences.flatMap((s) => s.coups)
      .filter((m) => done.actors[m.acteurId]!.candidate.nature === 'reel');
    expect(realMoves.length).toBeGreaterThan(0);
    for (const m of realMoves) expect(m.replique).toBeNull();
    expect(
      screen.getAllByText('Coup simulé : aucune réplique n’est prêtée à une personnalité réelle.')
        .length,
    ).toBe(realMoves.length);
  });

  it('liste les débats tenus dans l’écran Résultats', async () => {
    const done = playDebate(state, RULESET, 'debat-t1-tous', {
      action: 'finir',
      sequence: 0,
    }).state;
    mockApi(handlers(done));
    renderRoute(`/parties/${GAME_ID}/resultats`);
    const section = await screen.findByRole('region', { name: 'Débats télévisés' });
    expect(within(section).getByText('Débat de tous les candidats')).toBeInTheDocument();
    expect(within(section).getAllByRole('link', { name: 'Revoir' }).length).toBeGreaterThan(0);
  });
});
