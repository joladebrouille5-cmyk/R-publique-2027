import type {
  DecisionAnswer,
  GameState,
  PlannedAction,
  ReportEvent,
  Ruleset,
  StepSummary,
  WeeklyReport,
} from '@r2027/shared';
import { consumeActions, resolveActionEffects, validateActions } from '../campaign/actions';
import { weeklyDrift } from '../election/opinion';
import { applyDecisions, drawEvents, validateDecisionAnswers } from '../event/events';
import { enterNextWeek } from './calendar';
import { EngineInputError } from './errors';
import { Ledger } from './ledger';

export type AdvanceInput = {
  actions: readonly PlannedAction[];
  decisions: readonly DecisionAnswer[];
};

export type EngineContext = { ruleset: Ruleset };

export type AdvanceResult = {
  state: GameState;
  report: WeeklyReport;
  /** Vrai si un événement majeur a eu lieu : l'API sauvegarde alors l'état d'avant (§12). */
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

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Résout une semaine. Fonction pure : l'état reçu n'est jamais modifié, aucune horloge,
 * aucun réseau, aucune base ; l'aléa est dérivé de la graine (même entrée ⇒ même sortie).
 * L'étape 11 (sauvegarde) est effectuée par l'API, qui complète le bilan.
 */
export function advanceWeek(
  input: GameState,
  plan: AdvanceInput,
  { ruleset }: EngineContext,
): AdvanceResult {
  if (input.calendar.blockedBy) {
    throw new EngineInputError(
      'progression_bloquee',
      'La partie est arrivée à un scrutin que le moteur électoral (phase 3) doit résoudre.',
    );
  }
  const state = JSON.parse(JSON.stringify(input)) as GameState;
  const ledger = new Ledger(state);
  const week = state.meta.week;
  const date = state.meta.date;
  const actorId =
    state.player.actorId && state.actors[state.player.actorId] ? state.player.actorId : null;
  const summaries = new Map<number, { active: boolean; summary: string }>();
  const set = (step: number, active: boolean, summary: string) =>
    summaries.set(step, { active, summary });

  // 1. Valider les actions (et les réponses aux décisions en attente).
  const answers = validateDecisionAnswers(state, plan.decisions);
  const { outcomes, validated } = validateActions(state, plan.actions, ruleset);
  const rejected = outcomes.filter((o) => o.status === 'rejetee').length;
  set(
    1,
    true,
    `${plural(validated.length, 'action retenue')}, ${plural(rejected, 'action rejetée')}` +
      (answers.length ? `, ${plural(answers.length, 'décision')} à appliquer` : ''),
  );

  // 2. Consommer les ressources.
  if (actorId) consumeActions(ledger, actorId, validated, 2);
  const spent = validated.reduce((sum, v) => sum + v.definition.cout.budgetCentimes, 0);
  const hours = validated.reduce((sum, v) => sum + v.definition.cout.tempsHeures, 0);
  set(2, true, `Dépenses : ${Math.round(spent / 100)} € et ${hours} h`);

  // 3 et 4. Adversaires et alliances : moteurs non encore implémentés (aucun effet simulé).
  set(3, false, 'Aucun adversaire avant la phase 3 (candidats et IA adverse).');
  set(4, false, 'Alliances et relations modélisées en phase 5.');

  // 5. Événements : décisions de la semaine passée, effets des actions, nouveaux événements.
  const decisions = applyDecisions(state, ruleset, ledger, answers, 5);
  const risks: ReportEvent[] = actorId
    ? resolveActionEffects(state, ledger, actorId, validated, 5)
    : [];
  const events = drawEvents(state, ruleset, ledger, 5);
  set(
    5,
    true,
    actorId
      ? `${plural(events.length, 'événement')}, ${plural(risks.length, 'aléa')} d'action, ${plural(decisions.length, 'décision appliquée')}`
      : 'Aucun acteur en mode observateur avant la phase 3.',
  );

  // 6. Médias et opinion : dynamique hebdomadaire (médias individuels en phase 5).
  weeklyDrift(state, ruleset, ledger, 6);
  set(
    6,
    actorId !== null,
    actorId ? 'Érosion, retour à la moyenne et attrition appliqués.' : 'Aucun acteur.',
  );

  // 7 et 8. Économie et intentions de vote : phases 6 et 3.
  set(7, false, 'Indicateurs économiques et sociaux calculés à partir de la phase 6.');
  set(8, false, 'Intentions de vote calculées à partir de la phase 3.');

  // 9. Échéances : passage à la semaine suivante.
  const { notices, blocked, appliedScheduled } = enterNextWeek(state, ruleset, ledger, 9);
  set(
    9,
    true,
    `Semaine ${state.meta.week} : ${plural(appliedScheduled, 'effet différé')} appliqué(s), ` +
      `${plural(notices.length, 'échéance')} dans les 4 semaines` +
      (blocked ? ' ; progression bloquée avant le scrutin.' : '.'),
  );

  // 10. Journal ; 11. sauvegarde (API) ; 12. bilan.
  const changes = ledger.list();
  set(10, true, `${plural(changes.length, 'variation')} journalisée(s) avec leurs facteurs.`);
  set(11, true, 'Sauvegarde automatique effectuée par le serveur après la résolution.');
  set(12, true, 'Bilan hebdomadaire généré.');

  const steps: StepSummary[] = WEEKLY_STEPS.map((s) => ({ ...s, ...summaries.get(s.step)! }));
  const allEvents = [...events, ...risks];
  return {
    state,
    majorEvent: events.some((e) => e.majeur),
    report: {
      week,
      date,
      nextWeek: state.meta.week,
      nextDate: state.meta.date,
      steps,
      actions: outcomes,
      changes,
      events: allEvents,
      decisions,
      notices,
      blocked,
    },
  };
}
