import {
  candidateName,
  type DecisionAnswer,
  type GameState,
  type ReportEvent,
  type Ruleset,
  type StepSummary,
  type WeeklyReport,
} from '@r2027/shared';
import { consumeActions, resolveActionEffects } from '../campaign/actions';
import { FinanceBook } from '../campaign/finances';
import { ParrainageBook } from '../campaign/parrainages';
import { enterNextWeek, formatFrenchDate } from '../core/calendar';
import { EngineInputError } from '../core/errors';
import { compareStrings, Ledger } from '../core/ledger';
import { stream } from '../core/random';
import { WEEKLY_STEPS } from '../core/steps';
import { weeklyDrift } from '../election/opinion';
import { applyDecisions, validateDecisionAnswers } from '../event/events';
import { planPresidentActions, validatePresidencyActions } from './actions';
import { answerCrisis, drawCrises } from './crises';
import { EconomyBook, weeklyEconomy } from './economy';
import { dissolve, legislativeNotices, legislativeWeek } from './legislatives';
import { advanceParliament } from './parliament';
import { openNextCampaign } from './cycle';
import { nextCampaignStart, weekReaches } from './dates';
import {
  aiPrimeMinister,
  answerGovernment,
  endGovernment,
  governmentDue,
  nominate,
  presidentOf,
  requestGovernment,
} from './government';

// Semaine du quinquennat (phase 6). Même découpage en 12 étapes que la campagne : actions du
// président (joueur ou IA, mêmes règles), nomination et remaniements du gouvernement, opinion
// et usure du pouvoir, Parlement, économie et crises, législatives, calendrier ; à la fin du
// quinquennat, bilan et ouverture de la présidentielle suivante (même moteur).

const HISTORY_LENGTH = 8;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export type PresidencyPlan = {
  actions: readonly { actionId: string; cible?: string | undefined }[];
  decisions: readonly DecisionAnswer[];
  /** Vrai si le plan annonce ou retire des propositions, ou propose des ralliements. */
  campaignRequests: boolean;
};

export type PresidencyResult = {
  state: GameState;
  report: WeeklyReport;
  majorEvent: boolean;
};

/** Dernier cycle du jeu de règles : la partie s'arrête à la fin du mandat. */
function endOfGame(state: GameState, ruleset: Ruleset): void {
  const mandate = state.quinquennat!.mandat;
  if (nextCampaignStart(state, ruleset) === null && state.meta.date > mandate.fin) {
    state.calendar = {
      blockedBy: 'fin-de-partie',
      blockedMessage: `Le jeu de règles ne prévoit pas de présidentielle après ${state.cycle.annee} : la partie s'arrête à la fin du mandat, le ${formatFrenchDate(mandate.fin)}.`,
    };
  }
}

/** Résout une semaine du quinquennat. Fonction pure (mêmes garanties que `advanceWeek`). */
export function advancePresidencyWeek(
  input: GameState,
  plan: PresidencyPlan,
  ruleset: Ruleset,
): PresidencyResult {
  const state = JSON.parse(JSON.stringify(input)) as GameState;
  const ledger = new Ledger(state);
  const finances = new FinanceBook(state, ruleset, ledger);
  const parrainages = new ParrainageBook();
  const week = state.meta.week;
  const date = state.meta.date;
  const playerId = state.player.actorId;
  const president = presidentOf(state);
  const playerPresides = president.id === playerId;
  const summaries = new Map<number, { active: boolean; summary: string }>();
  const set = (step: number, active: boolean, summary: string) =>
    summaries.set(step, { active, summary });
  const events: ReportEvent[] = [];
  const economy = state.economie ? new EconomyBook(state.economie) : null;

  // 1. Réponses aux décisions et actions du président joueur.
  const answers = validateDecisionAnswers(state, plan.decisions);
  if (plan.campaignRequests) {
    throw new EngineInputError(
      'actions_interdites',
      'Le programme de campagne et les ralliements ne concernent que la campagne présidentielle.',
    );
  }
  if (plan.actions.length > 0 && !playerPresides) {
    throw new EngineInputError(
      'actions_interdites',
      playerId
        ? 'Vous n’êtes pas président(e) de la République : le quinquennat se déroule sans vous. Vous pourrez vous présenter à la présidentielle suivante.'
        : 'Le mode observateur ne permet pas d’agir.',
    );
  }
  if (plan.actions.length > ruleset.jeu.actionsMaxParSemaine) {
    throw new EngineInputError(
      'trop_d_actions',
      `Au plus ${ruleset.jeu.actionsMaxParSemaine} actions par semaine.`,
    );
  }
  const own = playerPresides
    ? validatePresidencyActions(state, ruleset, president.id, plan.actions)
    : { outcomes: [], validated: [] };
  const rejected = own.outcomes.filter((o) => o.status === 'rejetee').length;
  set(
    1,
    true,
    `${plural(own.validated.length, 'action retenue')}, ${plural(rejected, 'action rejetée')}` +
      (answers.length ? `, ${plural(answers.length, 'décision')} à appliquer` : ''),
  );

  // 2. Temps du président joueur.
  consumeActions(ledger, finances, own.validated, 2);
  const hours = own.validated.reduce((sum, v) => sum + v.definition.cout.tempsHeures, 0);
  set(2, playerPresides, `Temps consacré : ${hours} h`);

  // 3. Président IA : nomination du gouvernement à l'investiture, puis actions de la semaine.
  let ai: ReturnType<typeof validatePresidencyActions> = { outcomes: [], validated: [] };
  if (!playerPresides) {
    if (governmentDue(state))
      events.push(nominate(state, ruleset, aiPrimeMinister(state, ruleset, president)));
    const rng = stream(state.meta.seed, week, 'president', president.id);
    const planned = planPresidentActions(
      state,
      ruleset,
      (codes) => codes[rng.nextInt(codes.length)]!,
    );
    ai = validatePresidencyActions(state, ruleset, president.id, planned);
    consumeActions(ledger, finances, ai.validated, 3);
  }
  set(
    3,
    !playerPresides,
    playerPresides
      ? 'Vous présidez : aucune décision de l’IA.'
      : `Président IA (${candidateName(president.candidate)}) : ${plural(ai.validated.length, 'action')}.`,
  );

  // 4. Relations entre candidats : sans objet hors campagne.
  set(4, false, 'Pas de campagne en cours : relations et ralliements inchangés.');

  // 5. Décisions, effets des actions, remaniement, Parlement.
  const institutional = new Set(['gouvernement', 'texte', 'crise']);
  const governmentAnswers = answers.filter((a) => a.decision.kind === 'gouvernement');
  const billAnswers = answers.filter((a) => a.decision.kind === 'texte');
  const crisisAnswers = answers.filter((a) => a.decision.kind === 'crise');
  const decisions = applyDecisions(
    state,
    ruleset,
    ledger,
    finances,
    answers.filter((a) => !institutional.has(a.decision.kind)),
    5,
  );
  for (const answer of [...governmentAnswers, ...billAnswers, ...crisisAnswers]) {
    const option = answer.decision.options.find((o) => o.id === answer.optionId)!;
    decisions.push({
      decisionId: answer.decision.id,
      eventId: answer.decision.eventId,
      optionId: answer.optionId,
      label: `${answer.decision.label} : ${option.libelle}`,
      automatic: answer.automatic,
    });
  }
  for (const answer of governmentAnswers)
    events.push(answerGovernment(state, ruleset, answer.optionId));
  const validated = [...own.validated, ...ai.validated];
  const { risks } = resolveActionEffects(
    state,
    ruleset,
    ledger,
    { finances, parrainages },
    validated,
    5,
  );
  for (const action of validated)
    if (action.definition.institution === 'dissolution') events.push(dissolve(state, ruleset));
  for (const action of validated) {
    if (action.definition.institution !== 'remaniement') continue;
    const quinquennat = state.quinquennat!;
    endGovernment(quinquennat, date, 'remaniement');
    events.push({
      id: `remaniement-${week}`,
      kind: 'evenement',
      refId: 'gouvernement',
      label: 'Remaniement : le gouvernement remet sa démission',
      description:
        'Le président met fin aux fonctions du gouvernement et nomme un nouveau Premier ministre.',
      nature: 'simule',
      majeur: false,
      decisionId: null,
    });
    if (!playerPresides)
      events.push(nominate(state, ruleset, aiPrimeMinister(state, ruleset, president)));
  }
  const crisisContext = economy
    ? { state, ruleset, ledger, finances, book: economy, presidentId: president.id, step: 5 }
    : null;
  if (crisisContext)
    for (const answer of crisisAnswers)
      answerCrisis(crisisContext, answer.decision.eventId, answer.optionId);
  const parliament = advanceParliament(
    { state, ruleset, ledger, economy, step: 5, playerPresides },
    billAnswers,
  );
  events.push(...parliament.events);
  if (parliament.censured) {
    endGovernment(state.quinquennat!, date, 'motion de censure');
    events.push({
      id: `censure-${week}`,
      kind: 'evenement',
      refId: 'gouvernement',
      label: 'Le gouvernement, renversé, remet sa démission',
      description:
        'Une motion de censure a réuni la majorité des membres de l’Assemblée nationale : le président nomme un nouveau Premier ministre.',
      nature: 'simule',
      majeur: true,
      decisionId: null,
    });
    if (!playerPresides)
      events.push(nominate(state, ruleset, aiPrimeMinister(state, ruleset, president)));
  }
  if (playerPresides) requestGovernment(state, ruleset);
  if (crisisContext && weekReaches(date, state.quinquennat!.mandat.debut))
    events.push(...drawCrises(crisisContext, playerPresides));
  set(
    5,
    true,
    `${plural(events.length, 'fait')} institutionnel(s), ${plural(risks.length, 'aléa')} d'action, ${plural(decisions.length, 'décision appliquée')}`,
  );

  // 6. Opinion : dynamique commune à tous, puis usure du pouvoir pour le président en fonction.
  weeklyDrift(state, ruleset, ledger, 6);
  const usure = ruleset.quinquennat.opinion.usureHebdomadaire;
  if (weekReaches(date, state.quinquennat!.mandat.debut)) {
    ledger.apply(president.id, 'popularite', [
      { label: 'Usure du pouvoir (hypothèse de jeu)', value: -usure, source: 'opinion', step: 6 },
    ]);
  }
  for (const actor of Object.values(state.actors)) {
    actor.history.popularite = [...actor.history.popularite, actor.resources.popularite].slice(
      -HISTORY_LENGTH,
    );
  }
  set(6, true, 'Érosion, retour à la moyenne, attrition et usure du pouvoir appliqués.');

  // 7. Économie : effets différés, dynamique des indicateurs, conjoncture et popularité.
  if (economy) {
    weeklyEconomy(
      state,
      ruleset,
      economy,
      ledger,
      president.id,
      weekReaches(date, state.quinquennat!.mandat.debut),
      7,
    );
  }
  set(
    7,
    economy !== null,
    economy
      ? `${plural(economy.list().length, 'indicateur')} mis à jour avec leurs facteurs (modèle de jeu).`
      : 'Économie non initialisée.',
  );
  // 8. Législatives : premier ou second tour de la semaine, nouvelle Assemblée.
  const legislatives = legislativeWeek(state, ruleset, president);
  events.push(...legislatives.events);
  if (legislatives.newAssembly) {
    endGovernment(state.quinquennat!, date, 'élections législatives');
    if (!playerPresides)
      events.push(nominate(state, ruleset, aiPrimeMinister(state, ruleset, president)));
  }
  set(
    8,
    legislatives.report !== null,
    legislatives.report
      ? `Législatives : ${legislatives.report.tour === 1 ? 'premier' : 'second'} tour dépouillé dans les 577 circonscriptions.`
      : 'Aucune élection en cours.',
  );

  // 9. Semaine suivante, décision de nomination à l'investiture, fin du quinquennat.
  const entered = enterNextWeek(state, ruleset, ledger, finances, 9);
  const appliedScheduled = entered.appliedScheduled;
  const notices = [...entered.notices, ...legislativeNotices(state, ruleset)];
  // Fin du quinquennat : bilan et nouvelle campagne présidentielle (même moteur).
  const transition = openNextCampaign(state, ruleset, ledger, 9);
  if (transition) {
    events.push(...transition);
  } else {
    requestGovernment(state, ruleset);
    endOfGame(state, ruleset);
  }
  set(
    9,
    true,
    `Semaine ${state.meta.week} : ${plural(appliedScheduled, 'effet différé')} appliqué(s)` +
      (transition ? ' ; quinquennat clos, campagne présidentielle ouverte.' : '.'),
  );

  // 10. Journal ; 11. sauvegarde (API) ; 12. bilan.
  const changes = ledger.list();
  set(10, true, `${plural(changes.length, 'variation')} journalisée(s) avec leurs facteurs.`);
  set(11, true, 'Sauvegarde automatique effectuée par le serveur après la résolution.');
  set(12, true, 'Bilan hebdomadaire généré.');
  const steps: StepSummary[] = WEEKLY_STEPS.map((s) => ({ ...s, ...summaries.get(s.step)! }));
  const rank = (actorId: string) => (actorId === playerId ? '' : actorId);
  const actions = [...own.outcomes, ...ai.outcomes].sort(
    (a, b) => compareStrings(rank(a.actorId), rank(b.actorId)) || a.index - b.index,
  );
  const allEvents = [...events, ...risks];
  return {
    state,
    majorEvent: allEvents.some((e) => e.majeur),
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
      intentions: null,
      polls: [],
      election: null,
      phaseChange: transition ? { from: 'presidence', to: 'campagne' } : null,
      programme: [],
      parrainages: [],
      finances: finances.list(),
      relations: [],
      alliances: [],
      strategies: [],
      economie: economy?.list() ?? [],
      legislatives: legislatives.report,
    },
  };
}
