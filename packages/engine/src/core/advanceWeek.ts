import type {
  AlliancePlan,
  DecisionAnswer,
  GameState,
  PlannedAction,
  Poll,
  ProgrammeChange,
  ProgrammeReport,
  ReportEvent,
  RoundResult,
  Ruleset,
  StepSummary,
  WeeklyReport,
} from '@r2027/shared';
import { planOpponentActions } from '../ai/opponents';
import { resolveAlliances, updateRelations } from '../ai/relations';
import { consumeActions, resolveActionEffects, validateActions } from '../campaign/actions';
import { FinanceBook } from '../campaign/finances';
import { updateMedia } from '../campaign/medias';
import {
  ParrainageBook,
  presentationWindow,
  projectedPresentations,
  weeklyParrainages,
} from '../campaign/parrainages';
import { applyProgramme, programmeReport, validateProgrammeChange } from '../campaign/programme';
import { distribute, summarize } from '../election/distribution';
import { concludeRound, holdDebate, scrutinOfWeek } from '../election/flow';
import { weeklyDrift } from '../election/opinion';
import { publishPolls } from '../election/polls';
import { resolveRound } from '../election/rounds';
import { applyDecisions, drawEvents, validateDecisionAnswers } from '../event/events';
import { requestGovernment } from '../presidency/government';
import { advancePresidencyWeek } from '../presidency/week';
import { nationalBaseline, type TerritorialBaseline } from '../territory/baseline';
import { enterNextWeek } from './calendar';
import { EngineInputError } from './errors';
import { WEEKLY_STEPS } from './steps';
import { compareStrings, Ledger } from './ledger';

export { WEEKLY_STEPS };

export type AdvanceInput = {
  actions: readonly PlannedAction[];
  decisions: readonly DecisionAnswer[];
  /** Annonces et retraits de propositions du programme (phase 5). */
  programme?: ProgrammeChange;
  /** Propositions de ralliement adressées à d'autres candidats (phase 5). */
  alliances?: AlliancePlan;
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

const HISTORY_LENGTH = 8;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const NO_CHANGE: ProgrammeChange = { ajouter: [], retirer: [] };

/**
 * Candidats dont les parrainages semblent hors d'atteinte à l'approche de la clôture : ils
 * envisagent plus volontiers un ralliement.
 */
function hopelessCandidates(state: GameState, ruleset: Ruleset): Set<string> {
  const hopeless = new Set<string>();
  if (state.campagne.parrainages !== 'modelise' || state.meta.phase !== 'campagne') return hopeless;
  const window = presentationWindow(state.meta.date, ruleset);
  if (window.closed || !window.open) return hopeless;
  for (const actor of Object.values(state.actors)) {
    if (actor.status !== 'candidat') continue;
    if (projectedPresentations(actor, ruleset).counted < 0.8 * ruleset.parrainages.seuil)
      hopeless.add(actor.id);
  }
  return hopeless;
}

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
  if (input.meta.phase === 'presidence') {
    const campaignRequests =
      (plan.programme?.ajouter.length ?? 0) + (plan.programme?.retirer.length ?? 0) > 0 ||
      (plan.alliances?.proposer.length ?? 0) > 0;
    return advancePresidencyWeek(
      input,
      { actions: plan.actions, decisions: plan.decisions, campaignRequests },
      ruleset,
    );
  }
  const state = JSON.parse(JSON.stringify(input)) as GameState;
  const ledger = new Ledger(state);
  const finances = new FinanceBook(state, ruleset, ledger);
  const parrainages = new ParrainageBook();
  const week = state.meta.week;
  const date = state.meta.date;
  const playerId = state.player.actorId;
  const player = playerId ? state.actors[playerId] : undefined;
  const playerActive =
    player !== undefined && (player.status === 'candidat' || player.status === 'qualifie');
  const programmeChange = plan.programme ?? NO_CHANGE;
  const proposals = plan.alliances?.proposer ?? [];
  const summaries = new Map<number, { active: boolean; summary: string }>();
  const set = (step: number, active: boolean, summary: string) =>
    summaries.set(step, { active, summary });

  // 1. Valider les actions du joueur, son programme et ses réponses aux décisions en attente.
  const answers = validateDecisionAnswers(state, plan.decisions);
  const wantsToAct =
    plan.actions.length > 0 ||
    programmeChange.ajouter.length + programmeChange.retirer.length > 0 ||
    proposals.length > 0;
  if (wantsToAct) {
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
  const programmeReports: ProgrammeReport[] = [];
  let programmeHours = 0;
  if (playerActive && player) {
    const validation = validateProgrammeChange(
      player.programme,
      programmeChange,
      ruleset,
      player.resources.tempsHeures,
    );
    player.programme = applyProgramme(player.programme, validation);
    programmeHours = validation.hours;
    const report = programmeReport(player.id, validation);
    if (report) programmeReports.push(report);
  }
  const own = playerActive
    ? validateActions(state, playerId!, plan.actions, ruleset, programmeHours)
    : { outcomes: [], validated: [] };
  const rejected = own.outcomes.filter((o) => o.status === 'rejetee').length;
  const announced = programmeReports[0]?.ajoutees.length ?? 0;
  set(
    1,
    true,
    `${plural(own.validated.length, 'action retenue')}, ${plural(rejected, 'action rejetée')}` +
      (announced ? `, ${plural(announced, 'proposition annoncée')}` : '') +
      (answers.length ? `, ${plural(answers.length, 'décision')} à appliquer` : ''),
  );

  // 2. Consommer les ressources du joueur (dépenses électorales et temps).
  if (programmeHours > 0) {
    ledger.apply(playerId!, 'tempsHeures', [
      {
        label: 'Préparation des propositions du programme',
        value: -programmeHours,
        source: 'action',
        step: 2,
      },
    ]);
  }
  consumeActions(ledger, finances, own.validated, 2);
  const spent = own.validated.reduce((sum, v) => sum + v.definition.cout.budgetCentimes, 0);
  const hours = own.validated.reduce((sum, v) => sum + v.definition.cout.tempsHeures, 0);
  set(2, true, `Dépenses : ${Math.round(spent / 100)} € et ${hours + programmeHours} h`);

  // 3. Décisions adverses : analyse, stratégie, actions ciblées ; mêmes règles que le joueur.
  const plans = planOpponentActions(state, ruleset);
  for (const p of plans) state.actors[p.actorId]!.strategie = p.strategie;
  const opponents = plans.map((p) => validateActions(state, p.actorId, p.planned, ruleset));
  const opponentValidated = opponents.flatMap((o) => o.validated);
  consumeActions(ledger, finances, opponentValidated, 3);
  set(
    3,
    plans.length > 0,
    `${plural(opponentValidated.length, 'action')} de ${plural(plans.length, 'adversaire')}`,
  );

  // 4. Relations et alliances.
  const relationNotes = updateRelations(state);
  const allianceOutcome = resolveAlliances(
    state,
    ruleset,
    proposals,
    hopelessCandidates(state, ruleset),
  );
  relationNotes.push(...allianceOutcome.notes);
  set(
    4,
    true,
    `${plural(allianceOutcome.alliances.length, 'ralliement')}, ${plural(relationNotes.length, 'fait')} marquant(s) entre candidats.`,
  );

  // 5. Décisions de la semaine passée, débat, effets des actions, nouveaux événements.
  const decisions = applyDecisions(state, ruleset, ledger, finances, answers, 5);
  const debate = holdDebate(state, ruleset);
  const allValidated = [...own.validated, ...opponentValidated];
  const { risks, incidents } = resolveActionEffects(
    state,
    ruleset,
    ledger,
    { finances, parrainages },
    allValidated,
    5,
  );
  const events = drawEvents(state, ruleset, ledger, finances, 5);
  set(
    5,
    true,
    `${plural(events.length, 'événement')}, ${plural(risks.length, 'aléa')} d'action, ${plural(decisions.length, 'décision appliquée')}` +
      (debate ? ', débat d’entre-deux-tours' : ''),
  );

  // 6. Médias, puis dynamique de l'opinion et historique de popularité.
  state.medias = updateMedia(state, ruleset, ledger, allValidated, incidents, 6) ?? state.medias;
  weeklyDrift(state, ruleset, ledger, 6);
  for (const actor of Object.values(state.actors)) {
    actor.history.popularite = [...actor.history.popularite, actor.resources.popularite].slice(
      -HISTORY_LENGTH,
    );
  }
  set(6, true, 'Couverture médiatique, érosion, retour à la moyenne et attrition appliqués.');

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

  // 9. Échéances : parrainages, scrutin de la semaine, puis passage à la semaine suivante.
  const nominationEvents = weeklyParrainages(state, ruleset, parrainages, finances, 9);
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
  const { notices, appliedScheduled } = enterNextWeek(state, ruleset, ledger, finances, 9);
  // Victoire : nomination du Premier ministre dès la semaine de l'investiture.
  if (state.quinquennat) requestGovernment(state, ruleset);
  set(
    9,
    true,
    (nominationEvents.length ? 'Liste des candidats arrêtée ; ' : '') +
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
  const allEvents = [
    ...events,
    ...allianceOutcome.events,
    ...(debate ? [debate] : []),
    ...nominationEvents,
    ...electionEvents,
    ...risks,
  ];
  // Actions du joueur d'abord, puis celles des adversaires par identifiant, dans l'ordre du plan.
  const rank = (actorId: string) => (actorId === playerId ? '' : actorId);
  const actions = [...own.outcomes, ...opponents.flatMap((o) => o.outcomes)].sort(
    (a, b) => compareStrings(rank(a.actorId), rank(b.actorId)) || a.index - b.index,
  );
  return {
    state,
    majorEvent: allEvents.some((e) => e.majeur) || election !== null,
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
      programme: programmeReports,
      parrainages: parrainages.list(),
      finances: finances.list(),
      relations: relationNotes,
      alliances: allianceOutcome.alliances,
      strategies: plans.map((p) => ({
        actorId: p.actorId,
        priorite: p.strategie.priorite,
        motif: p.strategie.motif,
      })),
      economie: [],
    },
  };
}
