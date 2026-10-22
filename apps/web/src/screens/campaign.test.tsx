import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  initialState,
  mockApi,
  playedState,
  renderRoute,
  reportFixture,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Écrans de la phase 5 : programme, actions ciblées, finances, relations, débat.

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (game = gameFixture()) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: game }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
  [`POST /api/games/${GAME_ID}/advance`]: () => ({
    body: {
      game: gameFixture({ week: 1, date: '2026-10-05', version: 4 }),
      report: reportFixture(),
    },
  }),
});

/** Résumé (balise <summary>) du domaine du programme, pour l'ouvrir. */
const domain = (name: string) =>
  [...document.querySelectorAll('summary')].find((el) => el.textContent?.startsWith(`${name} `))!;

describe('programme', () => {
  it('annonce une proposition, signale une dépendance manquante, puis l’envoie avec la semaine', async () => {
    const calls = mockApi(base());
    renderRoute(`/parties/${GAME_ID}/programme`);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Programme', level: 1 });
    await user.click(domain('Emploi'));
    const guarantee = screen.getByRole('listitem', {
      name: 'Garantie d’emploi pour les chômeurs de longue durée',
    });
    expect(within(guarantee).getByRole('button', { name: /^Annoncer/ })).toBeDisabled();
    expect(
      within(guarantee).getByText(/Suppose d’abord : Plan d’investissement public/),
    ).toBeInTheDocument();

    await user.click(domain('Économie'));
    await user.click(screen.getByRole('button', { name: 'Annoncer Plan d’investissement public' }));
    expect(screen.getAllByText('Annonce prévue')).toHaveLength(1);
    expect(within(guarantee).getByRole('button', { name: /^Annoncer/ })).toBeEnabled();
    expect(
      screen.getByText(/Prévu cette semaine : 1 annonce\(s\) \(3 h de préparation\)/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'tableau de bord' }));
    expect(
      await screen.findByText(/À annoncer : Plan d’investissement public/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Résoudre la semaine 0' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      programme: { ajouter: ['eco-investissement-public'], retirer: [] },
    });
  });

  it('montre les programmes des adversaires', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/programme`);
    const section = await screen.findByRole('region', { name: 'Programmes des autres candidats' });
    expect(within(section).getByText(/Claire Delorme \(Boussole\)/)).toBeInTheDocument();
  });
});

describe('actions ciblées', () => {
  it('exige un département pour une rencontre d’élus et l’envoie avec l’action', async () => {
    const calls = mockApi(base());
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter Rencontre avec des élus locaux' }),
    );
    const submit = screen.getByRole('button', { name: 'Résoudre la semaine 0' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Choisissez la cible/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText(/Cible de l’action n° 1 \(Rencontre avec des élus locaux\)/),
      '2A',
    );
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      actions: [{ actionId: 'elus-locaux', cible: '2A' }],
    });
  });

  it('présente les parrainages et le compte de campagne sur le tableau de bord', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const panel = await screen.findByRole('region', { name: 'Parrainages' });
    expect(within(panel).getByText(/présentations comptées sur 500 requises/)).toBeInTheDocument();
    expect(within(panel).getByText('Seuil non atteint')).toBeInTheDocument();
    const account = screen.getByRole('region', { name: 'Compte de campagne' });
    expect(within(account).getByText(/plafond légal de 16\s851\s000\s€/)).toBeInTheDocument();
  });
});

describe('finances', () => {
  it('détaille le compte, les dons refusés et les règles sourcées', async () => {
    const state = initialState();
    const player = state.actors.joueur!;
    player.finances.refus = {
      nombre: 1,
      montantCentimes: 1_200_000,
      derniers: [
        {
          semaine: 3,
          origine: 'personne_morale',
          montantCentimes: 1_200_000,
          motif: 'Offre d’une entreprise refusée (art. L. 52-8 du Code électoral).',
        },
      ],
    };
    mockApi(base(gameFixture({}, state)));
    renderRoute(`/parties/${GAME_ID}/finances`);
    const summary = await screen.findByRole('region', { name: 'Votre compte de campagne' });
    expect(within(summary).getByText(/Trésorerie = recettes − dépenses/)).toBeInTheDocument();
    const refused = screen.getByRole('region', { name: 'Dons refusés' });
    expect(within(refused).getByText(/Semaine 3 — Don d’une personne morale/)).toBeInTheDocument();
    const rules = screen.getByRole('region', { name: 'Règles appliquées' });
    expect(within(rules).getByText('Règles officielles')).toBeInTheDocument();
    // Phase 11 : la source (guide de la CNCCFP) est dans Paramètres → Crédits, pas à l'écran.
    expect(within(rules).getByText(/Sources : Paramètres → Crédits/)).toBeInTheDocument();
    expect(within(rules).queryAllByRole('link')).toEqual([]);
  });
});

describe('candidats, relations et débat', () => {
  it('affiche statuts, stratégies et relations ; un ralliement se propose avant le premier tour', async () => {
    const state = playedState((s) => s.meta.week === 22);
    mockApi(base(gameFixture({}, state)));
    renderRoute(`/parties/${GAME_ID}/candidats`);
    const user = userEvent.setup();
    expect(await screen.findAllByText(/Présentations validées/)).not.toHaveLength(0);
    expect(screen.getAllByText(/priorité de la semaine/).length).toBeGreaterThan(0);
    const relations = screen.getByRole('region', {
      name: 'Vos relations avec les autres candidats',
    });
    const propose = within(relations).getByRole('button', {
      name: 'Proposer un ralliement à Julien Castaing',
    });
    expect(propose).toBeEnabled();
    await user.click(propose);
    expect(within(relations).getByText(/Proposition\(s\) envoyée\(s\)/)).toBeInTheDocument();
  });

  it('refuse les propositions de ralliement loin du premier tour', async () => {
    mockApi(base());
    renderRoute(`/parties/${GAME_ID}/candidats`);
    const relations = await screen.findByRole('region', {
      name: 'Vos relations avec les autres candidats',
    });
    expect(
      within(relations).getByRole('button', { name: 'Proposer un ralliement à Julien Castaing' }),
    ).toBeDisabled();
  });

  it('décompose la prestation de chaque finaliste au débat', async () => {
    const state = playedState((s) => s.elections.debate !== null);
    mockApi(base(gameFixture({}, state)));
    renderRoute(`/parties/${GAME_ID}/resultats`);
    const table = await screen.findByRole('table', {
      name: 'Composantes de la prestation au débat (0 à 1)',
    });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });
});
