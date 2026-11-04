import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { suggestedProgramme } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
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
    // Le détail des ressources est replié en bas du QG : on le déplie sur place.
    const section = await screen.findByRole('button', { name: /^Toutes les ressources/ });
    expect(section).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('ressource-budgetCentimes')).not.toBeInTheDocument();
    await userEvent.click(section);
    expect(section).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('ressource-budgetCentimes')).toHaveTextContent(/8\s000\s000\s€/);
    expect(screen.getByTestId('ressource-notoriete')).toHaveTextContent(/60,00\s%/);
    expect(screen.getByTestId('ressource-tempsHeures')).toHaveTextContent('70 h');
    expect(screen.getByText('Valeurs simulées')).toBeInTheDocument();
  });

  it('déplie une section du QG depuis sa tuile et y amène le focus', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const overview = await screen.findByRole('region', { name: 'En un coup d’œil' });
    const section = await screen.findByRole('button', { name: /^Toutes les ressources/ });
    await userEvent.click(within(overview).getByRole('button', { name: /^Élan/ }));
    expect(section).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(section).toHaveFocus());
    expect(screen.getByTestId('ressource-dynamique')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Ajouter Interview dans un média' }));
    const planned = screen.getByRole('list', { name: 'Actions programmées' });
    expect(within(planned).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByText(/Reste après le plan : 7\s880\s000\s€ · 59 h · 2\/8 actions/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retirer Interview dans un média' }));
    await user.click(screen.getByRole('button', { name: 'Résoudre la semaine 0' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      expectedWeek: 0,
      actions: [{ actionId: 'meeting' }],
      programme: { ajouter: [], retirer: [] },
      alliances: { proposer: [] },
      decisions: [],
    });
    expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f]{32}$/);

    const debrief = await screen.findByRole('dialog', { name: 'Débriefing de la semaine 0' });
    await user.click(within(debrief).getByRole('button', { name: 'Continuer' }));
    // Le bilan détaillé reste au QG, replié sous son titre.
    await user.click(screen.getByRole('button', { name: /^Bilan de la semaine 0/ }));
    expect(screen.getByText('Meeting public : coût')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Catalogue des actions' })).toBeInTheDocument();
  });

  it('alerte sur un programme trop court et ajoute le programme de départ suggéré au plan', async () => {
    const game = gameFixture();
    const actor = game.state.actors.joueur!;
    expect(actor.programme.propositions.length).toBeLessThan(RULESET.programme.minimumRecommande);
    const calls = mockApi({
      ...base(game),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: {
          game: gameFixture({ week: 1, date: '2026-10-05', version: 4 }),
          report: reportFixture(),
        },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const note = await screen.findByRole('note', { name: 'Programme trop court' });
    expect(note).toHaveTextContent(
      `${actor.programme.propositions.length} proposition(s), pour un minimum recommandé de ${RULESET.programme.minimumRecommande}`,
    );
    const suggestion = suggestedProgramme(
      actor.candidate.positionnement,
      actor.programme.propositions,
      RULESET,
    );
    await user.click(within(note).getByRole('button', { name: /^Programme de départ suggéré/ }));
    // Le programme atteint le minimum : l'alerte disparaît, les annonces sont au plan.
    expect(screen.queryByRole('note', { name: 'Programme trop court' })).not.toBeInTheDocument();
    expect(screen.getByText(/^À annoncer :/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Résoudre la semaine 0' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      programme: { ajouter: suggestion, retirer: [] },
    });
  });

  it('choisit la posture d’un passage dans les médias et en montre la raison au bilan', async () => {
    const report = reportFixture({
      actions: [
        {
          actorId: 'joueur',
          index: 0,
          actionId: 'decryptage',
          label: 'Passage dans un format décryptage',
          status: 'validee',
          reason: null,
          cible: null,
          cost: { budgetCentimes: 0, tempsHeures: 3 },
          prestation: {
            posture: 'offensive',
            choisie: true,
            formatId: 'decryptage',
            format: 'Décryptage',
            score: -12,
            niveau: 'ratee',
            incident: false,
            raisons: [
              { label: 'Préparation (0 h sur 20 h utiles)', valeur: 0 },
              { label: 'Posture offensive, format « Décryptage »', valeur: -20 },
              { label: 'Popularité (34 %)', valeur: 8 },
            ],
          },
        },
      ],
    });
    const calls = mockApi({
      ...base(),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: { game: gameFixture({ week: 1, date: '2026-10-05', version: 4 }), report },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter Passage dans un format décryptage' }),
    );
    const posture = screen.getByRole('group', {
      name: /Posture du passage n° 1 — Décryptage/,
    });
    // Posture par défaut cochée, adéquation au format lue dans le jeu de règles.
    expect(within(posture).getByRole('radio', { name: 'Pédagogique' })).toBeChecked();
    expect(within(posture).getByText('Posture adaptée au format.')).toBeInTheDocument();
    await user.click(within(posture).getByRole('radio', { name: 'Offensive' }));
    expect(within(posture).getByText('Posture peu adaptée au format.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Résoudre la semaine 0' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      actions: [{ actionId: 'decryptage', posture: 'offensive' }],
    });
    // Débriefing plein écran : le passage, sa posture et ses raisons ; « Continuer » le ferme.
    const debrief = await screen.findByRole('dialog', { name: 'Débriefing de la semaine 0' });
    expect(within(debrief).getByText('Passage décevant')).toBeInTheDocument();
    expect(within(debrief).getByRole('list', { name: 'Raisons du score' })).toHaveTextContent(
      'Posture offensive, format « Décryptage »',
    );
    expect(debrief).toHaveFocus();
    await user.click(within(debrief).getByRole('button', { name: 'Continuer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Bilan de la semaine 0/ }));
    const reasons = screen.getByRole('list', { name: 'Raisons du score' });
    expect(within(reasons).getByText('Posture offensive, format « Décryptage »'));
    expect(within(reasons).getByText('−20')).toBeInTheDocument();
  });

  it('imprime brièvement la tuile de l’action ajoutée (phase 22)', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ajouter Meeting public' }));
    const catalog = screen.getByRole('list', { name: 'Catalogue des actions' });
    const tile = within(catalog).getByRole('listitem', { name: 'Meeting public' });
    expect(tile).toHaveAttribute('data-ajoutee');
    // L'aplat s'efface : la tuile redevient ordinaire.
    await waitFor(() => expect(tile).not.toHaveAttribute('data-ajoutee'), { timeout: 1500 });
    expect(
      within(catalog).getByRole('listitem', { name: 'Interview dans un média' }),
    ).not.toHaveAttribute('data-ajoutee');
  });

  it('désactive une action dont le prérequis n’est pas rempli', async () => {
    const game = gameFixture();
    game.state.actors.joueur!.resources.militants = 10;
    mockApi(base(game));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByRole('button', { name: 'Ajouter Meeting public' })).toBeDisabled();
    expect(screen.getByText('Nécessite 50 militants.')).toBeInTheDocument();
    // Le tiroir de détail rappelle la raison et n'ajoute rien.
    await userEvent.click(screen.getByRole('button', { name: 'Détails : Meeting public' }));
    const drawer = screen.getByRole('dialog', { name: 'Meeting public' });
    expect(within(drawer).getByText('Nécessite 50 militants.')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Ajouter au plan' })).toBeDisabled();
  });

  it('ouvre le détail d’une action dans un tiroir, sans changer d’adresse, puis l’ajoute au plan', async () => {
    mockApi(base());
    const { router } = renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Détails : Meeting public' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(trigger);
    const drawer = screen.getByRole('dialog', { name: 'Meeting public' });
    expect(within(drawer).getByText(/120\s000\s€ · 8 h · 50 militants requis/)).toBeInTheDocument();
    expect(within(drawer).getByText(/Notoriété \+0,60 pt/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(router.state.location.hash).toBe('');
    await user.click(within(drawer).getByRole('button', { name: 'Ajouter au plan' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const planned = screen.getByRole('list', { name: 'Actions programmées' });
    expect(within(planned).getAllByRole('listitem')).toHaveLength(1);
    expect(trigger).toHaveFocus();
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
    expect(screen.getByRole('button', { name: 'Voir les résultats' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.getByRole('button', { name: 'Résoudre la semaine 0' })).toBeDisabled();
    expect(screen.queryByRole('list', { name: 'Catalogue des actions' })).not.toBeInTheDocument();
  });

  it('situe le candidat dans le dernier sondage publié', async () => {
    const state = playedState((s) => s.meta.week >= 1);
    mockApi(base(gameFixture({}, state)));
    const { router } = renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const overview = await screen.findByRole('region', { name: 'En un coup d’œil' });
    const poll = [...state.polls].reverse().find((p) => p.kind === 'intentions_t1')!;
    const mine = poll.results.find((r) => r.actorId === state.player.actorId)!;
    const rank = [...poll.results].sort((a, b) => b.value - a.value).indexOf(mine) + 1;
    const tile = within(overview).getByRole('button', { name: /^Sondage clé/ });
    expect(tile).toHaveTextContent(`${rank === 1 ? '1er' : `${rank}e`} · `);
    expect(tile).toHaveTextContent('Institut Opinio (fictif), sem. 0');
    // Le détail s'ouvre dans un tiroir : l'adresse ne change pas.
    await userEvent.click(tile);
    const drawer = screen.getByRole('dialog', { name: 'Sondages' });
    expect(within(drawer).getByRole('region', { name: /^Dernier sondage/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(router.state.location.hash).toBe('');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tile).toHaveFocus();
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
    await userEvent.click(await screen.findByRole('button', { name: /^Calendrier électoral/ }));
    const calendar = screen.getByRole('region', { name: 'Calendrier électoral' });
    expect(
      within(calendar).getByText("Premier tour de l'élection présidentielle"),
    ).toBeInTheDocument();
    expect(within(calendar).getAllByText('Date annoncée, décret non publié').length).toBe(2);
    // Deux échéances déduites de la loi électorale, et les jours fériés de la campagne (phase 20,
    // code du travail) : Toussaint, 11-Novembre, Noël, jour de l'an, lundi de Pâques, 1er mai.
    const holidays = within(calendar).getAllByText(/^Jour férié : /);
    expect(holidays.map((h) => h.textContent)).toEqual([
      'Jour férié : Toussaint',
      'Jour férié : Armistice de 1918',
      'Jour férié : Noël',
      'Jour férié : Jour de l’an',
      'Jour férié : Lundi de Pâques',
      'Jour férié : Fête du Travail',
    ]);
    expect(within(calendar).getAllByText('Date déduite d’une règle').length).toBe(
      2 + holidays.length,
    );
    expect(
      within(calendar).getByText(/^Ouverture de la campagne officielle : égalité stricte/),
    ).toBeInTheDocument();
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
              report: reportFixture({
                events: [
                  {
                    id: 'e-0-fermeture-usine',
                    kind: 'evenement',
                    refId: 'fermeture-usine',
                    label: 'Fermeture d’usine annoncée — Somme (80)',
                    description: 'Un sous-traitant industriel (fictif) annonce la fermeture.',
                    nature: 'fictif',
                    majeur: false,
                    decisionId: null,
                  },
                ],
              }),
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
    // Événement fictif de la phase 11 : sa famille, lue dans le jeu de règles.
    await userEvent.setup().click(screen.getByText('Semaine 0 — lundi 28 septembre 2026'));
    const item = screen.getByText('Fermeture d’usine annoncée — Somme (80)').closest('li')!;
    expect(within(item).getByText('Événement fictif')).toBeInTheDocument();
    expect(within(item).getByText('Fait divers')).toBeInTheDocument();
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
      expect(router.state.location.pathname).toBe(`/parties/${imported.id}/plateau`),
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
