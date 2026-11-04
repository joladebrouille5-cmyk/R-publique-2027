import { formatGameDate } from '../labels';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Unavailable } from '../components/Unavailable';
import { GAME_SCREENS } from './registry';
import { HUBS, hubOf, partsOf, screenHref } from './shell/navigation';
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
  advancedOptions,
  wizardTo,
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
  it('propose cinq espaces à plat, qui rassemblent tous les écrans du cahier des charges (§13)', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const nav = await screen.findByRole('navigation', { name: 'Espaces de la partie' });
    // Un seul niveau : cinq onglets, aucun menu ni sous-menu à ouvrir.
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Plateau', 'Carte', 'Campagne', 'Opinion', 'Pouvoir']);
    expect(within(nav).queryByRole('button')).not.toBeInTheDocument();
    // Chaque écran est un espace, ou une section d'un espace : deux gestes au plus.
    for (const s of GAME_SCREENS) {
      const hub = hubOf(s.path);
      expect(hub, s.path).toBeDefined();
      expect(screenHref(s.path)).toBe(hub!.path === s.path ? s.path : `${hub!.path}#${s.path}`);
    }
    expect(HUBS.flatMap((h) => h.sections.flatMap(partsOf)).sort()).toEqual(
      GAME_SCREENS.map((s) => s.path)
        .filter((path) => !HUBS.some((h) => h.path === path))
        .sort(),
    );
  });

  it('redirige une ancienne adresse d’écran vers sa section dépliée', async () => {
    mockApi(gameHandlers);
    const { router } = renderRoute(`/parties/${GAME_ID}/conseil`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pouvoir' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/pouvoir`));
    expect(router.state.location.hash).toBe('#conseil');
    // Phase 20 : le Conseil des ministres est présenté avec le gouvernement, dans une section.
    expect(
      screen.getByRole('button', { name: /^Gouvernement et Conseil des ministres/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('conseil')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Conseil des ministres' })).toBeVisible();
    // Les autres sections restent repliées : leur contenu n'est pas rendu.
    const parliament = screen.getByRole('button', { name: /^Parlement/ });
    expect(parliament).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(parliament);
    expect(parliament).toHaveAttribute('aria-expanded', 'true');
  });

  it('fusionne les sondages et les résultats en une seule section, ouverte d’emblée (phase 20)', async () => {
    mockApi(gameHandlers);
    const { router } = renderRoute(`/parties/${GAME_ID}/resultats`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Opinion' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe('#resultats'));
    expect(screen.getByRole('button', { name: /^Sondages et résultats/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Sondages' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Résultats' })).toBeInTheDocument();
    // Sans ancre aussi : l'espace d'une seule section l'ouvre.
    await router.navigate(`/parties/${GAME_ID}/opinion`);
    expect(await screen.findByRole('region', { name: 'Sondages' })).toBeInTheDocument();
  });

  it('ouvre la partie sur le plateau, avec la date en jeu', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}`);
    expect(await screen.findByRole('heading', { name: 'Plateau' })).toBeInTheDocument();
    expect(screen.getAllByText(/28 sept\. 2026/).length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: 'Résoudre la semaine 0' })).toBeEnabled();
  });

  it('garde le QG détaillé à son adresse', async () => {
    mockApi(gameHandlers);
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText('Aucune semaine résolue pour l’instant.')).toBeInTheDocument();
  });

  it('tous les écrans du cahier des charges ont désormais leur moteur', () => {
    expect(GAME_SCREENS.filter((s) => !s.available)).toEqual([]);
  });

  it('annoncerait un écran non implémenté sans données factices', () => {
    render(
      <Unavailable
        screen={{
          path: 'exemple',
          label: 'Écran à venir',
          phase: 7,
          available: false,
          description: 'Description de l’écran prévu.',
        }}
      />,
    );
    expect(screen.getByText('Non disponible — prévu en phase 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Écran à venir' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('radio', { name: /Candidat réel/ }));
    await wizardTo(user, 'Votre candidat');
    const group = await screen.findByRole('group', { name: 'Personnalité incarnée' });
    expect(within(group).getByText(/sont simulés par le jeu/)).toBeInTheDocument();
    // Sans choix, l'assistant ne passe pas à l'étape suivante.
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('personnalité que vous incarnez');

    await user.click(within(group).getByRole('radio', { name: /Marine Tondelier/ }));
    expect(within(group).getByText(/Désignée candidate par Les Écologistes/)).toBeInTheDocument();
    // Phase 11 : crédits des photos et sources dans Paramètres, pas sur le formulaire.
    expect(
      within(group).getByText(/Sources et crédits des photos : Paramètres/),
    ).toBeInTheDocument();
    expect(within(group).queryAllByRole('link')).toEqual([]);
    expect(
      within(group).getByRole('img', { name: 'Portrait de Marine Tondelier' }),
    ).toHaveAttribute('src', '/personnalites/reel-tondelier.webp');
    await wizardTo(user, 'Le terrain');
    // Phase 24 : point de départ « Sondages actuels » par défaut, avec son étiquette fixe.
    expect(screen.queryByRole('group', { name: 'Point de départ' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Personnalités réelles/ }));
    const depart = screen.getByRole('group', { name: 'Point de départ' });
    expect(within(depart).getByRole('radio', { name: /Sondages actuels/ })).toBeChecked();
    expect(
      screen.getByText(
        'Simulation : point de départ issu des sondages publiés, la suite est simulée.',
      ),
    ).toBeInTheDocument();
    await user.click(within(depart).getByRole('radio', { name: /Départ équitable/ }));
    expect(screen.queryByText(/la suite est simulée/)).not.toBeInTheDocument();
    await advancedOptions(user, { name: 'Réel' });
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      format: 'complet',
      name: 'Réel',
      mode: 'candidat_reel',
      difficulty: 'standard',
      startDate: '2026-09-28',
      personnaliteId: 'reel-tondelier',
      adversaires: 'reels',
      depart: 'equitable',
      scenarioId: 'standard',
    });
  });

  it('envoie la requête puis ouvre le plateau', async () => {
    const calls = mockApi({
      ...gameHandlers,
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    const { router } = renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'La partie' });
    await wizardTo(user, 'Votre candidat');
    await user.type(screen.getByLabelText('Prénom'), 'Lou');
    await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
    await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti du renouveau');
    await wizardTo(user, 'Votre parcours');
    await user.click(await screen.findByRole('radio', { name: /Figure de la société civile/ }));
    await wizardTo(user, 'Le terrain');
    await user.click(screen.getByRole('radio', { name: /Expert/ }));
    // Scénario de départ (phase 7) : situation fictive, écarts affichés.
    const scenarios = screen.getByRole('group', { name: 'Scénario de départ' });
    const storm = within(scenarios).getByRole('radio', { name: /Tempête économique/ });
    expect(storm.closest('label')).toHaveTextContent('Scénario fictif');
    expect(storm.closest('label')).toHaveTextContent(/Crises × 1,2/);
    await user.click(storm);
    await advancedOptions(user, { name: 'Ma campagne', seed: 'ma-graine' });
    await user.click(screen.getByRole('radio', { name: /Court/ }));
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/plateau`));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'Ma campagne',
      mode: 'candidat_personnalise',
      difficulty: 'expert',
      startDate: '2026-09-28',
      seed: 'ma-graine',
      scenarioId: 'tempete-economique',
      format: 'court',
      candidate: {
        prenom: 'Lou',
        nom: 'Martin',
        parti: 'Parti du renouveau',
        parcours: '',
        profilId: 'societe-civile',
        photo: null,
        positionnement: { economie: 0, societe: 0 },
      },
      adversaires: 'fictifs',
    });
  });

  it('exige le nom du candidat et de son parti avant d’envoyer', async () => {
    const calls = mockApi({ ...gameHandlers });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'La partie' });
    await wizardTo(user, 'Votre candidat');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nom du candidat et son parti');
    expect(screen.getByRole('heading', { level: 2, name: 'Votre candidat' })).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('indique les électorats proches du positionnement choisi', async () => {
    mockApi({ ...gameHandlers });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'La partie' });
    await wizardTo(user, 'Votre candidat');
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
    await screen.findByRole('heading', { level: 2, name: 'La partie' });
    await wizardTo(user, 'Votre candidat');
    await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
    await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti');
    await wizardTo(user, 'Le format');
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
    expect(await screen.findByRole('region', { name: 'Candidats' })).toBeInTheDocument();
    expect(screen.getAllByText('Fictif')).toHaveLength(RULESET.candidatsFictifs.length);
    const mine = screen.getByRole('listitem', { name: 'Camille Test' });
    expect(within(mine).getByText('Votre candidat')).toBeInTheDocument();
    expect(within(mine).getByText('En campagne')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Positionnement des candidats/ })).toBeInTheDocument();
  });

  it('affiche les sondages avec leur fiche technique et leur marge d’erreur', async () => {
    mockApi(withState(playedState((s) => s.meta.week >= 2)));
    renderRoute(`/parties/${GAME_ID}/sondages`);
    const latest = await screen.findByRole('region', { name: /^Dernier sondage/ });
    expect(within(latest).getByText(/Baromètre Civis \(fictif\), terrain du/)).toBeInTheDocument();
    expect(within(latest).getByText(/1\s500 personnes/)).toBeInTheDocument();
    expect(within(latest).getAllByText(/^± /).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sondage simulé').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /Tous les sondages publiés/ })).toBeInTheDocument();
  });

  it('explique l’écart de chaque candidat depuis la vague précédente de l’institut', async () => {
    const state = playedState((s) => s.meta.week >= 4);
    mockApi(withState(state));
    renderRoute(`/parties/${GAME_ID}/sondages`);
    const latest = await screen.findByRole('region', { name: /^Dernier sondage/ });
    expect(within(latest).getByRole('columnheader', { name: 'Écart' })).toBeInTheDocument();
    const why = within(latest).getByRole('region', { name: 'Pourquoi ça bouge ?' });
    // Votre décomposition est ouverte : chaque fait, puis le total, égal à l'écart affiché.
    const poll = [...state.polls].reverse().find((p) => p.kind === 'intentions_t1')!;
    const mine = poll.results.find((r) => r.actorId === state.player.actorId)!;
    expect(mine.variation).not.toBeNull();
    expect(mine.explication.reduce((sum, c) => sum + c.valeur, 0)).toBe(mine.variation);
    expect(within(why).getByText('Camille Test (vous)')).toBeInTheDocument();
    // Les autres candidats se déplient, chacun avec sa décomposition et son total.
    const explained = poll.results.filter((r) => r.explication.length > 0);
    expect(within(why).getAllByText('Total')).toHaveLength(explained.length);
    expect(within(why).getAllByRole('group')).toHaveLength(explained.length - 1);
  });

  it('annonce l’absence de sondage avant la première semaine', async () => {
    mockApi(withState());
    renderRoute(`/parties/${GAME_ID}/sondages`);
    const polls = await screen.findByRole('region', { name: 'Sondages' });
    expect(within(polls).getByText(/Aucun sondage publié pour l’instant/)).toBeInTheDocument();
    // Départ équitable : aucune mention des sondages réels.
    expect(within(polls).queryByText(/la suite est simulée/)).not.toBeInTheDocument();
  });

  it('signale le départ « Sondages actuels » (phase 24)', async () => {
    const state = playedState(() => true);
    mockApi(withState({ ...state, socle: { date: '2026-10-29', t1: {}, t2: {} } }));
    renderRoute(`/parties/${GAME_ID}/sondages`);
    const polls = await screen.findByRole('region', { name: 'Sondages' });
    const notice = within(polls).getByText(/la suite est simulée/);
    expect(notice).toHaveTextContent(
      'Sondages actuels Simulation : point de départ issu des sondages publiés, la suite est simulée',
    );
    expect(notice).toHaveTextContent(`publiés au ${formatGameDate('2026-10-29')}`);
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
    const results = await screen.findByRole('region', { name: 'Résultats' });
    expect(within(results).getByText(/Aucun scrutin dépouillé/)).toBeInTheDocument();
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
