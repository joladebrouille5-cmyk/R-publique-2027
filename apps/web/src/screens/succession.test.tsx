import { advanceWeek, openQuinquennat } from '@r2027/engine';
import { candidateName, type GameState, type WeeklyReport } from '@r2027/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Verdict } from '../plateau/Verdict';
import { WeeklyReportView } from '../components/WeeklyReportView';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  playedState,
  reduceMotion,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Phase 23 : présidentielle suivante à l'écran — décision de candidature (cartes des
// successeurs), section « Candidatures » du bilan et badges de l'écran Candidats, sur des états
// produits par le vrai moteur (président joueur jusqu'à la campagne de 2032).

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
});

/** Semaine jouée, décisions par défaut sauf la candidature (`choice`). */
function step(state: GameState, choice?: string) {
  return advanceWeek(
    state,
    {
      actions: [],
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.kind === 'candidature' && choice ? choice : d.defaultOptionId,
      })),
    },
    { ruleset: RULESET },
  );
}

const asked = (() => {
  const state = JSON.parse(JSON.stringify(playedState((s) => s.quinquennat !== null))) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors.joueur!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULESET, 'joueur');
  let current = state;
  for (let i = 0; i < 300 && !current.pendingDecisions.some((d) => d.kind === 'candidature'); i++)
    current = step(current).state;
  return current;
})();
const decision = asked.pendingDecisions.find((d) => d.kind === 'candidature')!;
const figureOption = decision.options.find((o) => o.id.startsWith('successeur-figure-'))!;

/** Ouverture de la campagne de 2032 après la passation à la figure : état et bilan. */
const opening = (() => {
  let current = asked;
  let report: WeeklyReport | null = null;
  for (let i = 0; i < 10 && current.meta.phase === 'presidence'; i++) {
    const result = step(current, figureOption.id);
    current = result.state;
    report = result.report;
  }
  return { state: current, report: report! };
})();

describe('présidentielle suivante (phase 23)', () => {
  it('ouvre la décision de candidature en pop-up, une carte par option avec sa nature', async () => {
    mockApi(base(asked));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const dialog = await screen.findByRole('dialog', {
      name: 'Votre candidature à la présidentielle 2032',
    });
    expect(within(dialog).getByText('Présidentielle suivante')).toBeInTheDocument();
    const choices = within(dialog).getByRole('list', { name: 'Choix possibles' });
    const buttons = within(choices).getAllByRole('button');
    expect(buttons).toHaveLength(decision.options.length);
    expect(within(buttons[0]!).getByText('Me représenter')).toBeInTheDocument();
    expect(within(buttons[0]!).getByText('Choix proposé')).toBeInTheDocument();
    // Successeurs : nature de chacun (une fois le jeu de règles chargé), portrait (photo libre
    // pour une figure réelle).
    await within(dialog).findAllByText(
      /^(Personnalité réelle — candidature simulée|Personnage fictif)$/,
    );
    for (const [index, option] of decision.options.slice(1).entries()) {
      const card = buttons[index + 1]!;
      expect(within(card).getByText(option.libelle)).toBeInTheDocument();
      expect(
        within(card).getByText(/^(Personnalité réelle — candidature simulée|Personnage fictif)$/),
      ).toBeInTheDocument();
    }
    const figureCard = buttons[decision.options.indexOf(figureOption)]!;
    const figure = RULESET.figures.figures.find((f) => figureOption.id.endsWith(f.id))!;
    if (figure.photo)
      expect(figureCard.querySelector('img')!.getAttribute('src')).toContain(figure.photo.fichier);
    expect(
      within(dialog).getByText(
        'Candidatures simulées : aucun propos n’est prêté à une personne réelle.',
      ),
    ).toBeInTheDocument();
  });

  it('le bilan d’ouverture liste les candidatures, classées, avec leur motif', () => {
    const { state, report } = opening;
    render(<WeeklyReportView report={report} state={state} />);
    const section = screen.getByRole('region', { name: 'Candidatures 2032' });
    expect(within(section).getByText('Simulation')).toBeInTheDocument();
    const successor = state.actors[state.player.actorId!]!;
    expect(
      within(section).getByText(`${candidateName(successor.candidate)} porte votre camp en 2032`),
    ).toBeInTheDocument();
    expect(within(section).getByText('Ne se présentent pas')).toBeInTheDocument();
    // L'ancien candidat du joueur se retire en passant la main.
    const former = state.actors.joueur!;
    const item = within(section).getByText(candidateName(former.candidate)).closest('li')!;
    expect(item).toHaveTextContent(`passe la main à ${candidateName(successor.candidate)}`);
    expect(section.textContent).not.toMatch(/[«»]/);
    // Les annonces ne sont pas répétées parmi les événements de la semaine.
    const events = screen.getByRole('region', { name: 'Événements de la semaine' });
    expect(within(events).queryByText(/^Candidature simulée/)).toBeNull();
  });

  it('le débriefing plein écran présente les candidatures à part des imprévus', () => {
    const { state, report } = opening;
    reduceMotion();
    render(<Verdict report={report} state={state} gameId={GAME_ID} onDone={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const section = within(dialog).getByRole('region', { name: 'Candidatures 2032' });
    expect(within(section).getByText('Votre camp')).toBeInTheDocument();
    const imprevus = within(dialog).getByRole('region', { name: 'Imprévus et décisions' });
    expect(within(imprevus).queryByText(/^Candidature simulée/)).toBeNull();
    // La fin du quinquennat et l'ouverture de la campagne restent des faits de la semaine.
    expect(
      within(imprevus).getByText('Présidentielle 2032 : la campagne commence'),
    ).toBeInTheDocument();
  });

  it('Candidats : le successeur est « vous », badges « Nouveau en 2032 » et « Ne se présente pas »', async () => {
    const { state } = opening;
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/candidats`);
    const successor = state.actors[state.player.actorId!]!;
    const card = await screen.findByRole('listitem', { name: candidateName(successor.candidate) });
    expect(within(card).getByText('Votre candidat')).toBeInTheDocument();
    expect(within(card).getByText('Nouveau en 2032')).toBeInTheDocument();
    expect(within(card).getByText('Personnalité réelle — simulée')).toBeInTheDocument();
    const figure = RULESET.figures.figures.find((f) => f.id === successor.candidate.figureId)!;
    if (figure.photo)
      expect(card.querySelector('img')!.getAttribute('src')).toContain(figure.photo.fichier);
    const former = screen.getByRole('listitem', {
      name: candidateName(state.actors.joueur!.candidate),
    });
    expect(within(former).getByText('Ne se présente pas')).toBeInTheDocument();
    expect(
      within(former).getByText(/Candidature simulée à la présidentielle 2032/),
    ).toBeInTheDocument();
  });
});
