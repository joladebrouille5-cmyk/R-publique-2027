import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GAME_SCREENS } from './registry';
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
  saveFixture,
} from '../test/utils';

const gameHandlers = {
  'GET /api/health': healthHandler,
  'GET /api/rulesets/courant': rulesetHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture() }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
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
      'Résultats',
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
    expect(await screen.findByRole('button', { name: 'Résoudre la semaine 0' })).toBeEnabled();
    expect(screen.getByText('Aucune semaine résolue pour l’instant.')).toBeInTheDocument();
  });

  it('annonce un écran non implémenté sans données factices', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}/gouvernement`);
    expect(await screen.findByText('Non disponible — prévu en phase 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gouvernement' })).toBeInTheDocument();
  });

  it('signale une partie introuvable', async () => {
    mockApi({ 'GET /api/health': healthHandler });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByText('Cette partie est introuvable.')).toBeInTheDocument();
  });
});

describe('création de partie', () => {
  it('propose d’incarner une personnalité réelle sourcée, face aux adversaires réels', async () => {
    const calls = mockApi({
      ...gameHandlers,
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    expect(await screen.findByRole('radio', { name: /Candidat personnalisé/ })).toBeChecked();
    await user.type(screen.getByLabelText('Nom de la partie'), 'Réel');
    await user.click(screen.getByRole('radio', { name: /Candidat réel/ }));
    const group = await screen.findByRole('group', { name: 'Personnalité incarnée' });
    expect(within(group).getByText(/sont simulés par le jeu/)).toBeInTheDocument();
    // Sans choix, la création est refusée côté interface.
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('personnalité que vous incarnez');

    await user.click(within(group).getByRole('radio', { name: /Marine Tondelier/ }));
    expect(within(group).getByText(/Désignée candidate par Les Écologistes/)).toBeInTheDocument();
    expect(
      within(group).getAllByText(
        (_, el) =>
          el?.tagName === 'P' && /^Photo : Greenbox, CC BY-SA 4\.0/.test(el.textContent ?? ''),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(group).getByRole('img', { name: 'Portrait de Marine Tondelier' }),
    ).toHaveAttribute('src', '/personnalites/reel-tondelier.webp');
    await user.click(screen.getByRole('radio', { name: /Personnalités réelles/ }));
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      name: 'Réel',
      mode: 'candidat_reel',
      difficulty: 'standard',
      startDate: '2026-09-28',
      personnaliteId: 'reel-tondelier',
      adversaires: 'reels',
    });
  });

  it('envoie la requête puis ouvre le tableau de bord', async () => {
    const calls = mockApi({
      ...gameHandlers,
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    const { router } = renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nom de la partie'), 'Ma campagne');
    await user.type(screen.getByLabelText('Prénom'), 'Lou');
    await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
    await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti du renouveau');
    await user.click(await screen.findByRole('radio', { name: /Figure de la société civile/ }));
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
      candidate: {
        prenom: 'Lou',
        nom: 'Martin',
        parti: 'Parti du renouveau',
        parcours: '',
        profilId: 'societe-civile',
        positionnement: { economie: 0, societe: 0 },
      },
      adversaires: 'fictifs',
    });
  });

  it('exige le nom du candidat et de son parti avant d’envoyer', async () => {
    const calls = mockApi({ ...gameHandlers });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nom de la partie'), 'X');
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nom du candidat et son parti');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('indique les électorats proches du positionnement choisi', async () => {
    mockApi({ ...gameHandlers });
    renderRoute('/nouvelle-partie');
    expect(
      await screen.findByText(/Électorats les plus proches : Centre gauche/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Positionnement économique/)).toHaveAttribute(
      'aria-valuetext',
      '0 (centre)',
    );
  });

  it('n’affiche pas de candidat en mode observateur', async () => {
    mockApi({ ...gameHandlers });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Observateur/ }));
    expect(screen.queryByRole('group', { name: 'Votre candidat' })).not.toBeInTheDocument();
  });

  it('affiche le message d’erreur du serveur', async () => {
    mockApi({
      ...gameHandlers,
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
    await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
    await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti');
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('doit être un lundi');
  });
});

describe('élection présidentielle', () => {
  const withState = (state = playedState(() => true)) => ({
    ...gameHandlers,
    [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  });

  it('présente les candidats, fictifs étiquetés comme tels, et leur positionnement', async () => {
    mockApi(withState());
    renderRoute(`/parties/${GAME_ID}/candidats`);
    expect(await screen.findByRole('heading', { name: 'Candidats' })).toBeInTheDocument();
    expect(screen.getAllByText('Fictif')).toHaveLength(RULESET.candidatsFictifs.length);
    const mine = screen.getByRole('listitem', { name: 'Camille Test' });
    expect(within(mine).getByText('Votre candidat')).toBeInTheDocument();
    expect(within(mine).getByText('En campagne')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Positionnement des candidats/ })).toBeInTheDocument();
  });

  it('affiche les sondages avec leur fiche technique et leur marge d’erreur', async () => {
    mockApi(withState(playedState((s) => s.meta.week >= 2)));
    renderRoute(`/parties/${GAME_ID}/sondages`);
    const latest = await screen.findByRole('region', { name: /Dernier sondage/ });
    expect(within(latest).getByText(/Baromètre Civis \(fictif\), terrain du/)).toBeInTheDocument();
    expect(within(latest).getByText(/1\s500 personnes/)).toBeInTheDocument();
    expect(within(latest).getAllByText(/^± /).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sondage simulé').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /Tous les sondages publiés/ })).toBeInTheDocument();
  });

  it('annonce l’absence de sondage avant la première semaine', async () => {
    mockApi(withState());
    renderRoute(`/parties/${GAME_ID}/sondages`);
    expect(await screen.findByText(/Aucun sondage publié pour l’instant/)).toBeInTheDocument();
  });

  it('affiche les résultats simulés des deux tours', async () => {
    const state = playedState(() => false);
    mockApi(withState(state));
    renderRoute(`/parties/${GAME_ID}/resultats`);
    const t2 = await screen.findByRole('region', { name: 'Second tour' });
    const winner = state.actors[state.elections.t2!.winner!]!.candidate;
    expect(
      within(t2).getByText(
        `${winner.prenom} ${winner.nom} est élu(e) président(e) de la République.`,
      ),
    ).toBeInTheDocument();
    expect(within(t2).getByText('Résultat simulé')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Premier tour' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entre-deux-tours' })).toBeInTheDocument();
  });

  it('annonce les dates des scrutins tant qu’aucun n’a eu lieu', async () => {
    mockApi(withState());
    renderRoute(`/parties/${GAME_ID}/resultats`);
    expect(await screen.findByText(/Aucun scrutin dépouillé/)).toBeInTheDocument();
    expect(
      await screen.findByText(/Premier tour de l'élection présidentielle : dimanche 18 avril 2027/),
    ).toBeInTheDocument();
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
