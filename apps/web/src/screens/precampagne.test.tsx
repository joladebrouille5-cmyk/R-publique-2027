import { advanceWeek, supportProspects } from '@r2027/engine';
import type { GameState, Ruleset } from '@r2027/shared';
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
  RULESET,
  RULESET_URL,
  rulesetHandler,
  wizardTo,
} from '../test/utils';

// Phase 15 : pré-campagne à l'écran — orientation du mouvement à la création, course aux
// parrainages, rendez-vous d'élus et négociations de soutien. États produits par le vrai moteur ;
// le vivier des négociations est celui que le moteur calcule pour la route de l'API.

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState) => ({
  'GET /api/health': healthHandler,
  'GET /api/rulesets/courant': rulesetHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
  [`GET /api/games/${GAME_ID}/soutiens`]: () => ({
    body: supportProspects(state, RULESET, state.player.actorId!),
  }),
});

/** Jeu de règles du test : aucun imprévu, et un rendez-vous d'élus à chaque semaine possible. */
const MEETINGS = (() => {
  const rules = JSON.parse(JSON.stringify(RULESET)) as Ruleset;
  for (const event of rules.evenements) event.probabiliteHebdomadaire = 0;
  rules.parrainages.rendezVous.probabiliteHebdo = 1;
  return rules;
})();

describe('création : orientation stratégique du mouvement', () => {
  it('présente les orientations et leurs écarts, puis envoie celle qui est choisie', async () => {
    const calls = mockApi({
      ...base(initialState()),
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'La partie' });
    await wizardTo(user, 'Votre candidat');
    await user.type(screen.getByLabelText('Prénom'), 'Lou');
    await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
    await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti du renouveau');
    await wizardTo(user, 'Votre parcours');
    const group = await screen.findByRole('group', {
      name: 'Variante de campagne (facultative)',
    });
    expect(within(group).getAllByRole('radio')).toHaveLength(RULESET.orientations.liste.length + 1);
    expect(
      within(group).getByRole('radio', { name: /Sans orientation particulière/ }),
    ).toBeChecked();
    const camp = within(group).getByRole('radio', { name: /Mobiliser son camp/ });
    // Écarts affichés tels que le jeu de règles les fixe (hypothèses du jeu).
    const card = camp.closest('label')!;
    expect(card).toHaveTextContent('Promesses de parrainage de départ : +20');
    expect(card).toHaveTextContent(
      `Base électorale de départ chez le groupe d’électeurs le plus proche de vous, qui s’estompe en ${RULESET.orientations.dureeSemaines} semaines`,
    );
    await user.click(camp);
    expect(camp).toBeChecked();
    await wizardTo(user, 'Le format');
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      mode: 'candidat_personnalise',
      orientationId: 'camp',
    });
  });

  it('n’en propose pas en mode observateur', async () => {
    mockApi(base(initialState()));
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Observateur/ }));
    // En observateur, l'assistant saute le candidat et le parcours.
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Le terrain' })).toBeInTheDocument();
    expect(screen.getByText('Étape 2 sur 3')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Variante de campagne (facultative)' }),
    ).not.toBeInTheDocument();
  });
});

describe('QG de pré-campagne', () => {
  it('suit la course aux parrainages : seuil, départements, clôture et classement', async () => {
    const state = initialState();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const race = await screen.findByRole('region', { name: 'Course aux parrainages' });
    expect(within(race).getByText('Présentations comptées')).toBeInTheDocument();
    expect(within(race).getByText('Départements')).toBeInTheDocument();
    expect(within(race).getByText(/^J−\d+$/)).toBeInTheDocument();
    expect(within(race).getByText('Seuil non atteint')).toBeInTheDocument();
    const candidates = Object.values(state.actors).filter((a) => a.status === 'candidat');
    expect(within(race).getAllByRole('listitem')).toHaveLength(Math.min(6, candidates.length));
    // Départage visible : promesses et intentions en réserve de chaque candidat classé.
    expect(within(race).getAllByText(/^\d[\d\u202f\u00a0 ]* en réserve$/)).toHaveLength(
      Math.min(6, candidates.length),
    );
    expect(
      within(race).getByText(/^Classement des candidats — vous êtes \d+(er|e)$/),
    ).toBeVisible();
  });

  it('négocie un soutien : vivier servi par l’API, accords exclus désactivés, probabilité', async () => {
    // Quelques semaines de campagne : un adversaire a déjà obtenu un soutien (accord exclu).
    const state = playedState((s) =>
      s.negociations.some((n) => n.issue === 'soutien' && n.actorId !== s.player.actorId),
    );
    const prospects = supportProspects(state, RULESET, state.player.actorId!);
    const open = prospects.personnalites.filter((p) => p.probabilites);
    const closed = prospects.personnalites.filter((p) => !p.probabilites);
    expect(open.length).toBeGreaterThan(0);
    expect(closed.some((p) => p.soutient !== null)).toBe(true);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const supports = await screen.findByRole('region', { name: 'Soutiens et ralliements' });
    expect(
      within(supports).getByText(`0/${RULESET.negociations.soutiensMax} soutien(s)`),
    ).toBeInTheDocument();
    expect(within(supports).getByText(/aucun propos n’est attribué/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(supports).getByRole('button', { name: 'Négocier un soutien' }));
    const planned = screen.getByRole('list', { name: 'Actions programmées' });
    const action = RULESET.actions.find((a) => a.id === 'negocier-soutien')!;
    expect(within(planned).getByText(action.libelle)).toBeInTheDocument();
    const select = within(planned).getByRole('combobox', {
      name: `Cible de l’action n° 1 (${action.libelle})`,
    });
    // Accords possibles du plus au moins probable, puis accords exclus (désactivés).
    await waitFor(() =>
      expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual([
        `Accord possible (${open.length})`,
        `Accord exclu (${closed.length})`,
      ]),
    );
    expect(select.querySelectorAll('option:disabled')).toHaveLength(closed.length);
    const best = [...open].sort((a, b) => b.probabilites!.aucune - a.probabilites!.aucune)[0]!;
    expect(select.querySelector('optgroup option')).toHaveValue(best.figureId);

    await user.selectOptions(select, best.figureId);
    const figure = RULESET.figures.figures.find((f) => f.id === best.figureId)!;
    const row = select.closest('li')!;
    expect(within(row).getByText(`${figure.prenom} ${figure.nom} — ${figure.parti}`)).toBeVisible();
    expect(row).toHaveTextContent(
      `Proximité ${best.proximite}/100 · probabilité d’accord (hypothèse du jeu)`,
    );
    expect(row).toHaveTextContent(/Issue simulée, aucun propos attribué\./);
    // Une personnalité qui soutient déjà un adversaire n'est pas proposée à la négociation.
    const taken = closed.find((p) => p.soutient !== null)!;
    expect(select.querySelector(`option[value="${taken.figureId}"]`)).toBeDisabled();
    expect(select.querySelector(`option[value="${taken.figureId}"]`)).toHaveTextContent(
      /soutient déjà un candidat$/,
    );
  });

  it('signale un vivier indisponible sans inventer de probabilité', async () => {
    const state = initialState();
    mockApi({
      ...base(state),
      [`GET /api/games/${GAME_ID}/soutiens`]: () => ({
        status: 409,
        body: { error: { code: 'soutiens_indisponibles', message: 'Indisponible.' } },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const supports = await screen.findByRole('region', { name: 'Soutiens et ralliements' });
    const user = userEvent.setup();
    await user.click(within(supports).getByRole('button', { name: 'Négocier un soutien' }));
    const select = within(screen.getByRole('list', { name: 'Actions programmées' })).getByRole(
      'combobox',
    );
    await waitFor(() =>
      expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual([
        'Vivier indisponible (accord non estimé)',
      ]),
    );
    await user.selectOptions(select, RULESET.figures.figures[0]!.id);
    expect(select.closest('li')).toHaveTextContent(
      /Probabilité d’accord indisponible pour l’instant/,
    );
  });

  it('présente un rendez-vous d’élus au QG, sans pop-up imposé, et l’ouvre en dossier', async () => {
    const { state } = advanceWeek(
      initialState(),
      { actions: [], decisions: [] },
      { ruleset: MEETINGS },
    );
    const meeting = state.pendingDecisions.find((d) => d.kind === 'parrainage');
    expect(meeting).toBeDefined();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const group = await screen.findByRole('group', { name: meeting!.label });
    expect(within(group).getByText('Rendez-vous d’élus (fictif)')).toBeInTheDocument();
    // Seules les urgences et les questions au gouvernement s'ouvrent d'elles-mêmes.
    expect(screen.queryByRole('dialog', { name: meeting!.label })).not.toBeInTheDocument();
    const race = await screen.findByRole('region', { name: 'Course aux parrainages' });
    expect(
      within(race).getByText(
        `${meeting!.label} : une délégation attend votre réponse (décision de la semaine).`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(within(group).getByRole('button', { name: 'Ouvrir le dossier' }));
    const dialog = screen.getByRole('dialog', { name: meeting!.label });
    expect(dialog).toHaveAccessibleDescription(meeting!.description);
    const choices = within(dialog).getByRole('list', { name: 'Choix possibles' });
    expect(
      within(choices).getByRole('button', { name: /^Recevoir la délégation/ }),
    ).toHaveAttribute('aria-pressed', 'false');
    await user.click(within(choices).getByRole('button', { name: /^Décliner/ }));
    expect(screen.queryByRole('dialog', { name: meeting!.label })).not.toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: /^Décliner/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeEnabled();
    // Recevoir la délégation prend ses heures sur la semaine, avant les actions (règle du moteur).
    const time = state.actors[state.player.actorId!]!.resources.tempsHeures;
    expect(screen.getByText(new RegExp(` · ${time} h · 0/\\d+ actions$`))).toBeInTheDocument();
    await user.click(within(group).getByRole('radio', { name: /^Recevoir la délégation/ }));
    const left = time - RULESET.parrainages.rendezVous.tempsHeures;
    expect(screen.getByText(new RegExp(` · ${left} h · 0/\\d+ actions$`))).toBeInTheDocument();
  });
});
