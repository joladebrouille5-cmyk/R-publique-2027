import {
  debateAwaitingPlayer,
  delegationHours,
  isOptionalDecision,
  type GameDetail,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError, newIdempotencyKey } from '../api/client';
import { useAdvance } from '../api/hooks';
import { useWeeklyPlan } from '../stores/plan';

// La semaine en cours (phase 25, extraite du QG) : plan, réponses aux décisions, conditions de
// résolution et demande d'avance idempotente. Une seule implémentation pour le plateau et le
// QG : la requête envoyée est la même, quel que soit l'écran.

export function useWeek(game: GameDetail, ruleset: Ruleset | undefined) {
  const advance = useAdvance(game.id);
  const navigate = useNavigate();
  const plan = useWeeklyPlan(game.id, game.week);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Bilan de la semaine résolue, affiché jusqu'à « Semaine suivante ».
  const [debrief, setDebrief] = useState<WeeklyReport | null>(null);
  // Une clé par tentative ; conservée si le réseau coupe, pour qu'un renvoi ne rejoue rien.
  const attemptKey = useRef<string | null>(null);
  const { state } = game;
  const observer = state.player.mode === 'observateur';
  const blocked = state.calendar.blockedBy !== null;

  /** Toute modification du plan invalide la clé d'idempotence de la tentative précédente. */
  const invalidate = () => {
    attemptKey.current = null;
  };
  const changePlan = <T extends unknown[]>(change: (...args: T) => void) => {
    return (...args: T) => {
      invalidate();
      change(...args);
    };
  };
  const answer = (decisionId: string, optionId: string) => {
    invalidate();
    setAnswers((current) => ({ ...current, [decisionId]: optionId }));
  };

  // Débat obligatoire (phase 17, règle partagée avec le moteur) : la semaine attend le débat.
  const debateDue = observer ? undefined : debateAwaitingPlayer(state);
  // Une décision facultative (questions au gouvernement) ne bloque pas la semaine.
  const unanswered = observer
    ? []
    : state.pendingDecisions.filter(
        (decision) => !answers[decision.id] && !isOptionalDecision(decision),
      );
  // Heures réservées avant les actions : propositions annoncées et délégations d'élus reçues
  // (phase 15, même règle que le moteur).
  const reservedHours = ruleset
    ? plan.ajouter.length * ruleset.programme.heuresParProposition +
      delegationHours(
        ruleset,
        state.pendingDecisions.map((d) => ({ kind: d.kind, optionId: answers[d.id] })),
      )
    : 0;
  const missingTargets = ruleset
    ? plan.actions.filter((a) => {
        if (a.cible !== undefined) return false;
        const definition = [...ruleset.actions, ...ruleset.quinquennat.actions].find(
          (d) => d.id === a.actionId,
        );
        // Phase 25 : une carte Terrain se joue aussi sans lieu (effets nationaux seuls).
        return Boolean(definition?.cible) && !definition?.cibleFacultative;
      }).length
    : 0;
  const canResolve =
    !blocked &&
    !advance.isPending &&
    debateDue === undefined &&
    unanswered.length === 0 &&
    missingTargets === 0;

  const submit = (semaines?: number) => {
    attemptKey.current ??= newIdempotencyKey();
    advance.mutate(
      {
        idempotencyKey: attemptKey.current,
        body: {
          expectedWeek: game.week,
          actions: plan.actions,
          programme: { ajouter: plan.ajouter, retirer: plan.retirer },
          alliances: { proposer: plan.proposer },
          decisions: Object.entries(answers)
            .filter(([decisionId]) => state.pendingDecisions.some((d) => d.id === decisionId))
            .map(([decisionId, optionId]) => ({ decisionId, optionId })),
          ...(semaines === undefined ? {} : { semaines }),
        },
      },
      {
        onSuccess: (response) => {
          attemptKey.current = null;
          plan.clear();
          setAnswers({});
          // Soir de scrutin : la partie passe en direct de la soirée électorale ; sinon, une
          // semaine résolue (hors avance rapide) ouvre son bilan.
          if (response.report.election)
            void navigate(`../soiree/${response.report.election.round}`);
          else if (semaines === undefined) setDebrief(response.report);
        },
        onError: (error) => {
          if (!(error instanceof ApiRequestError && error.code === 'serveur_injoignable')) {
            attemptKey.current = null;
          }
        },
      },
    );
  };

  return {
    advance,
    plan,
    answers,
    answer,
    changePlan,
    invalidate,
    submit,
    debrief,
    setDebrief,
    debateDue,
    unanswered,
    reservedHours,
    missingTargets,
    canResolve,
    blocked,
    observer,
  };
}
