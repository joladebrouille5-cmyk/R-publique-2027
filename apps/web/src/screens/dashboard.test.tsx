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
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (game = gameFixture()) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: game }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
});

describe('tableau de bord', () => {
  it('affiche les ressources de la campagne avec leur unité', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByTestId('ressource-budgetCentimes')).toHaveTextContent(/800\s000\s€/);
    expect(screen.getByTestId('ressource-notoriete')).toHaveTextContent(/6,00\s%/);
    expect(screen.getByTestId('ressource-tempsHeures')).toHaveTextContent('70 h');
    expect(screen.getByText('Valeurs simulées')).toBeInTheDocument();
  });

  it('programme des actions puis résout la semaine avec une clé d’idempotence', async () => {
    const calls = mockApi({
      ...base(),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: {
          game: gameFixture({ week: 1, date: '2026-10-05', version: 4 }),
          report: reportFixture(),
        },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ajouter Meeting public' }));
    await user.click(
      screen.getByRole('button', { name: 'Ajouter Interview dans un média national' }),
    );
    const planned = screen.getByRole('list', { name: 'Actions programmées' });
    expect(within(planned).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByText(/Reste après le plan : 770\s000\s€ · 59 h · 2\/8 actions/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Retirer Interview dans un média national' }),
    );
    await user.click(screen.getByRole('button', { name: 'Résoudre la semaine 0' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      expectedWeek: 0,
      actions: [{ actionId: 'meeting' }],
      decisions: [],
    });
    expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f]{32}$/);

    expect(
      await screen.findByRole('heading', { name: /Bilan de la semaine 0/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Meeting public : coût')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Catalogue des actions' })).toBeInTheDocument();
  });

  it('désactive une action dont le prérequis n’est pas rempli', async () => {
    const game = gameFixture();
    game.state.actors.joueur!.resources.militants = 10;
    mockApi(base(game));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByRole('button', { name: 'Ajouter Meeting public' })).toBeDisabled();
    expect(screen.getByText('Nécessite 50 militants.')).toBeInTheDocument();
  });

  it('exige une réponse aux décisions avant de résoudre la semaine', async () => {
    const game = gameFixture();
    game.state.pendingDecisions = [
      {
        id: 'd-0-polemique-reseaux',
        kind: 'evenement',
        eventId: 'polemique-reseaux',
        actorId: 'joueur',
        createdWeek: 0,
        label: 'Polémique sur les réseaux sociaux',
        description: 'Une ancienne publication est exhumée.',
        options: [
          { id: 'repondre', libelle: 'Répondre publiquement', description: 'a' },
          { id: 'ignorer', libelle: 'Laisser passer', description: 'b' },
        ],
        defaultOptionId: 'ignorer',
      },
    ];
    const calls = mockApi({
      ...base(game),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: { game: gameFixture({ week: 1, date: '2026-10-05' }), report: reportFixture() },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Résoudre la semaine 0' });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Répondre publiquement/ }));
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
        decisions: [{ decisionId: 'd-0-polemique-reseaux', optionId: 'repondre' }],
      }),
    );
  });

  it('annonce la fin de la présidentielle et retire le plan d’actions', async () => {
    const game = gameFixture();
    game.state.calendar = {
      blockedBy: 'fin-de-la-presidentielle',
      blockedMessage: 'Claire Delorme est élu(e). La suite arrive en phase 6.',
    };
    mockApi(base(game));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByText(/Claire Delorme est élu\(e\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir les résultats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Résoudre la semaine 0' })).toBeDisabled();
    expect(screen.queryByRole('list', { name: 'Catalogue des actions' })).not.toBeInTheDocument();
  });

  it('situe le candidat dans le dernier sondage publié', async () => {
    const state = playedState((s) => s.meta.week >= 1);
    mockApi(base(gameFixture({}, state)));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const race = await screen.findByRole('region', { name: 'La course présidentielle' });
    expect(
      within(race).getByText(/Dernier sondage \(Institut Opinio \(fictif\), semaine 0\)/),
    ).toBeInTheDocument();
    expect(within(race).getByRole('link', { name: 'Tous les sondages' })).toBeInTheDocument();
  });

  it('demande une consigne de vote au candidat éliminé, sans plan d’actions', async () => {
    const state = playedState((s) => s.meta.phase === 'entre_deux_tours');
    expect(state.actors.joueur!.status).toBe('elimine');
    mockApi(base(gameFixture({}, state)));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByText('Consigne de vote')).toBeInTheDocument();
    const [first] = state.elections.t1!.qualified;
    const finalist = state.actors[first!]!.candidate;
    expect(
      screen.getByRole('radio', {
        name: new RegExp(`Appeler à voter pour ${finalist.prenom} ${finalist.nom}`),
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Ne donner aucune consigne/ })).toBeInTheDocument();
    expect(screen.getByText(/Vous n’êtes plus candidat/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Catalogue des actions' })).not.toBeInTheDocument();
  });

  it('affiche le calendrier avec le statut et la source de chaque date', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const calendar = await screen.findByRole('region', { name: 'Calendrier électoral' });
    expect(
      within(calendar).getByText("Premier tour de l'élection présidentielle"),
    ).toBeInTheDocument();
    expect(within(calendar).getAllByText('Date annoncée, décret non publié').length).toBe(2);
    expect(within(calendar).getAllByText('Date déduite d’une règle').length).toBe(2);
  });
});

describe('journal', () => {
  it('affiche les semaines résolues et les événements techniques', async () => {
    mockApi({
      ...base(),
      [`GET ${JOURNAL_URL}`]: () => ({
        body: {
          entries: [
            {
              id: 'e2',
              week: 0,
              type: 'semaine_resolue',
              nature: 'simule',
              createdAt: '2026-10-20T10:10:00.000Z',
              report: reportFixture(),
              details: {},
            },
            {
              id: 'e1',
              week: 0,
              type: 'partie_creee',
              nature: 'systeme',
              createdAt: '2026-10-20T10:00:00.000Z',
              report: null,
              details: { seed: 'graine-test', startDate: '2026-09-28' },
            },
          ],
          nextBefore: null,
        },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/journal`);
    expect(await screen.findByText('Semaine 0 — lundi 28 septembre 2026')).toBeInTheDocument();
    expect(screen.getByText('Partie créée')).toBeInTheDocument();
    expect(screen.getByText(/Graine graine-test/)).toBeInTheDocument();
  });
});

describe('export et import', () => {
  const savesUrl = `/api/games/${GAME_ID}/saves`;

  it('propose l’export et importe un fichier dans une nouvelle partie', async () => {
    const imported = gameFixture({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Copie (importée)',
    });
    const calls = mockApi({
      ...base(),
      [`GET ${savesUrl}`]: () => ({ body: [] }),
      'POST /api/games/import': () => ({ status: 201, body: imported }),
      [`GET /api/games/${imported.id}`]: () => ({ body: imported }),
      [`GET /api/games/${imported.id}/journal?limit=10`]: () => ({
        body: { entries: [], nextBefore: null },
      }),
    });
    const { router } = renderRoute(`/parties/${GAME_ID}/sauvegardes`);
    const user = userEvent.setup();
    expect(await screen.findByRole('link', { name: 'Exporter la partie (JSON)' })).toHaveAttribute(
      'href',
      `/api/games/${GAME_ID}/export`,
    );
    const file = new File([JSON.stringify({ format: 'republique-2027/partie' })], 'partie.json', {
      type: 'application/json',
    });
    await user.upload(screen.getByLabelText('Importer un fichier de partie'), file);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/parties/${imported.id}/tableau-de-bord`),
    );
    expect(calls.find((c) => c.url === '/api/games/import')?.body).toEqual({
      format: 'republique-2027/partie',
    });
  });

  it('signale un fichier qui n’est pas du JSON', async () => {
    mockApi({ ...base(), [`GET ${savesUrl}`]: () => ({ body: [] }) });
    renderRoute(`/parties/${GAME_ID}/sauvegardes`);
    const user = userEvent.setup();
    const file = new File(['pas du json'], 'x.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('Importer un fichier de partie'), file);
    expect(await screen.findByText('Ce fichier n’est pas un JSON lisible.')).toBeInTheDocument();
  });
});
