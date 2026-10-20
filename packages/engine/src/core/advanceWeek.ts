import type {
  DecisionAnswer,
  GameState,
  PlannedAction,
  Poll,
  ReportEvent,
  RoundResult,
  Ruleset,
  StepSummary,
  WeeklyReport,
} from '@r2027/shared';
import { planOpponentActions } from '../ai/opponents';
import { consumeActions, resolveActionEffects, validateActions } from '../campaign/actions';
import { distribute, summarize } from '../election/distribution';
import { concludeRound, holdDebate, scrutinOfWeek } from '../election/flow';
import { weeklyDrift } from '../election/opinion';
import { publishPolls } from '../election/polls';
import { resolveRound } from '../election/rounds';
import { applyDecisions, drawEvents, validateDecisionAnswers } from '../event/events';
import { nationalBaseline, type TerritorialBaseline } from '../territory/baseline';
import { enterNextWeek } from './calendar';
import { EngineInputError } from './errors';
import { compareStrings, Ledger } from './ledger';

export type AdvanceInput = {
  actions: readonly PlannedAction[];
  decisions: readonly DecisionAnswer[];
};

export type EngineContext = {
  ruleset: Ruleset;
  /** Base électorale territoriale (communes) ; à défaut, un électorat national sans géographie. */
  territory?: TerritorialBaseline;
};

export type AdvanceResult = {
  state: GameState;
  report: WeeklyReport;
  /** Vrai si un événement majeur ou un scrutin a eu lieu : l'API sauvegarde l'état d'avant (§12). */
  majorEvent: boolean;
};

/** Libellés des 12 étapes du cycle hebdomadaire (§2), dans l'ordre stable et documenté. */
export const WEEKLY_STEPS = [
  { step: 1, module: 'campagne', label: 'Valider les actions' },
  { step: 2, module: 'campagne', label: 'Consommer les ressources' },
  { step: 3, module: 'ia', label: 'Calculer les décisions adverses' },
  { step: 4, module: 'ia', label: 'Mettre à jour alliances et relations' },
  { step: 5, module: 'evenements', label: 'Résoudre les événements et les effets des actions' },
  { step: 6, module: 'opinion', label: 'Mettre à jour médias et opinion' },
  { step: 7, module: 'economie', label: 'Calculer indicateurs économiques et sociaux' },
  { step: 8, module: 'election', label: 'Mettre à jour intentions de vote' },
  { step: 9, module: 'calendrier', label: 'Vérifier échéances' },
  { step: 10, module: 'journal', label: 'Générer le journal' },
  { step: 11, module: 'sauvegarde', label: 'Sauvegarder' },
  { step: 12, module: 'bilan', label: 'Afficher le bilan hebdomadaire' },
] as const;

const HISTORY_LENGTH = 8;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Résout une semaine. Fonction pure : l'état reçu n'est jamais modifié, aucune horloge,
 * aucun réseau, aucune base ; l'aléa est dérivé de la graine (même entrée ⇒ même sortie).
 * L'étape 11 (sauvegarde) est effectuée par l'API.
 */
export function advanceWeek(
  input: GameState,
  plan: AdvanceInput,
  { ruleset, territory }: EngineContext,
): AdvanceResult {
  if (input.calendar.blockedBy) {
    throw new EngineInputError(
      'progression_bloquee',
      input.calendar.blockedMessage ?? 'La partie ne peut pas avancer davantage pour l’instant.',
    );
  }
  const state = JSON.parse(JSON.stringify(input)) as GameState;
  const ledger = new Ledger(state);
  const week = state.meta.week;
  const date = state.meta.date;
  const playerId = state.player.actorId;
  const player = playerId ? state.actors[playerId] : undefined;
  const playerActive =
    player !== undefined && (player.status === 'candidat' || player.status === 'qualifie');
  const summaries = new Map<number, { active: boolean; summary: string }>();
  const set = (step: number, active: boolean, summary: string) =>
    summaries.set(step, { active, summary });

  // 1. Valider les actions du joueur et ses réponses aux décisions en attente.
  const answers = validateDecisionAnswers(state, plan.decisions);
  if (plan.actions.length > 0) {
    if (!player)
      throw new EngineInputError('actions_interdites', 'Le mode observateur ne permet pas d’agir.');
    if (!playerActive) {
      throw new EngineInputError(
        'actions_interdites',
        'Vous n’êtes plus candidat : vous ne pouvez plus programmer d’actions de campagne.',
      );
    }
    if (plan.actions.length > ruleset.jeu.actionsMaxParSemaine) {
      throw new EngineInputError(
        'trop_d_actions',
        `Au plus ${ruleset.jeu.actionsMaxParSemaine} actions par semaine.`,
      );
    }
  }
  const own = playerActive
    ? validateActions(state, playerId!, plan.actions, ruleset)
    : { outcomes: [], validated: [] };
  const rejected = own.outcomes.filter((o) => o.status === 'rejetee').length;
  set(
    1,
    true,
    `${plural(own.validated.length, 'action retenue')}, ${plural(rejected, 'action rejetée')}` +
      (answers.length ? `, ${plural(answers.length, 'décision')} à appliquer` : ''),
  );

  // 2. Consommer les ressources du joueur.
  consumeActions(ledger, own.validated, 2);
  const spent = own.validated.reduce((sum, v) => sum + v.definition.cout.budgetCentimes, 0);
  const hours = own.validated.reduce((sum, v) => sum + v.definition.cout.tempsHeures, 0);
  set(2, true, `Dépenses : ${Math.round(spent / 100)} € et ${hours} h`);

  // 3. Décisions adverses : mêmes actions, mêmes coûts, mêmes règles de validation.
  const opponents = planOpponentActions(state, ruleset).map((p) =>
    validateActions(state, p.actorId, p.planned, ruleset),
  );
  const opponentValidated = opponents.flatMap((o) => o.validated);
  consumeActions(ledger, opponentValidated, 3);
  set(
    3,
    opponents.length > 0,
    `${plural(opponentValidated.length, 'action')} de ${plural(opponents.length, 'adversaire')}`,
  );

  // 4. Alliances : phase 5.
  set(4, false, 'Alliances et relations modélisées en phase 5.');

  // 5. Décisions de la semaine passée, débat, effets des actions, nouveaux événements.
  const decisions = applyDecisions(state, ruleset, ledger, answers, 5);
  const debate = holdDebate(state);
  const risks: ReportEvent[] = resolveActionEffects(
    state,
    ledger,
    [...own.validated, ...opponentValidated],
    5,
  );
  const events = drawEvents(state, ruleset, ledger, 5);
  set(
    5,
    true,
    `${plural(events.length, 'événement')}, ${plural(risks.length, 'aléa')} d'action, ${plural(decisions.length, 'décision appliquée')}` +
      (debate ? ', débat d’entre-deux-tours' : ''),
  );

  // 6. Opinion : dynamique hebdomadaire de chaque campagne, puis historique de popularité.
  weeklyDrift(state, ruleset, ledger, 6);
  for (const actor of Object.values(state.actors)) {
    actor.history.popularite = [...actor.history.popularite, actor.resources.popularite].slice(
      -HISTORY_LENGTH,
    );
  }
  set(6, true, 'Érosion, retour à la moyenne et attrition appliqués à chaque campagne.');

  // 7. Économie : phase 6.
  set(7, false, 'Indicateurs économiques et sociaux calculés à partir de la phase 6.');

  // 8. Intentions de vote et sondages (pendant la campagne et l'entre-deux-tours).
  let intentions: WeeklyReport['intentions'] = null;
  let polls: Poll[] = [];
  const phase = state.meta.phase;
  if (phase === 'campagne' || phase === 'entre_deux_tours') {
    const round = phase === 'campagne' ? 1 : 2;
    const opinion = summarize(distribute(state, ruleset, round, 'opinion'), week, round);
    state.opinion = opinion;
    if (opinion) {
      intentions = { round, participation: opinion.participation, values: opinion.intentions };
      polls = publishPolls(state, ruleset, round, opinion.intentions);
      state.polls.push(...polls);
    }
  }
  set(
    8,
    intentions !== null,
    intentions
      ? `Intentions du ${intentions.round === 1 ? 'premier' : 'second'} tour mises à jour ; ${plural(polls.length, 'sondage')} publié(s).`
      : 'Aucune élection en cours.',
  );

  // 9. Échéances : scrutin de la semaine, puis passage à la semaine suivante.
  let election: RoundResult | null = null;
  let phaseChange: WeeklyReport['phaseChange'] = null;
  const scrutin = scrutinOfWeek(state, ruleset);
  const electionEvents: ReportEvent[] = [];
  if (scrutin) {
    const expected = scrutin.round === 1 ? 'campagne' : 'entre_deux_tours';
    if (state.meta.phase !== expected) {
      throw new Error(
        `Scrutin ${scrutin.scrutin.id} hors de la phase attendue (${state.meta.phase})`,
      );
    }
    election = resolveRound(
      state,
      ruleset,
      scrutin.scrutin,
      scrutin.round,
      territory ?? nationalBaseline(ruleset),
    );
    const concluded = concludeRound(state, ruleset, election);
    phaseChange = concluded.phaseChange;
    electionEvents.push(...concluded.events);
  }
  const { notices, appliedScheduled } = enterNextWeek(state, ruleset, ledger, 9);
  set(
    9,
    true,
    (election ? `${election.round === 1 ? 'Premier' : 'Second'} tour dépouillé ; ` : '') +
      `semaine ${state.meta.week} : ${plural(appliedScheduled, 'effet différé')} appliqué(s), ` +
      `${plural(notices.length, 'échéance')} dans les 4 semaines.`,
  );

  // 10. Journal ; 11. sauvegarde (API) ; 12. bilan.
  const changes = ledger.list();
  set(10, true, `${plural(changes.length, 'variation')} journalisée(s) avec leurs facteurs.`);
  set(11, true, 'Sauvegarde automatique effectuée par le serveur après la résolution.');
  set(12, true, 'Bilan hebdomadaire généré.');

  const steps: StepSummary[] = WEEKLY_STEPS.map((s) => ({ ...s, ...summaries.get(s.step)! }));
  const allEvents = [...events, ...(debate ? [debate] : []), ...electionEvents, ...risks];
  // Actions du joueur d'abord, puis celles des adversaires par identifiant, dans l'ordre du plan.
  const rank = (actorId: string) => (actorId === playerId ? '' : actorId);
  const actions = [...own.outcomes, ...opponents.flatMap((o) => o.outcomes)].sort(
    (a, b) => compareStrings(rank(a.actorId), rank(b.actorId)) || a.index - b.index,
  );
  return {
    state,
    majorEvent: events.some((e) => e.majeur) || election !== null,
    report: {
      week,
      date,
      nextWeek: state.meta.week,
      nextDate: state.meta.date,
      steps,
      actions,
      changes,
      events: allEvents,
      decisions,
      notices,
      blocked: state.calendar.blockedBy
        ? { scrutinId: state.calendar.blockedBy, message: state.calendar.blockedMessage ?? '' }
        : null,
      intentions,
      polls,
      election,
      phaseChange,
    },
  };
}
