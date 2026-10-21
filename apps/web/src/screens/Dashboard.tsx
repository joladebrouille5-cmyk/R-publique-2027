import { candidateName } from '@r2027/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiRequestError, newIdempotencyKey } from '../api/client';
import { spendingCapOf } from '../campaign';
import { useAdvance, useJournal, useRuleset } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, card } from '../components/ui';
import { WeeklyReportView } from '../components/WeeklyReportView';
import {
  CANDIDATE_STATUS_LABELS,
  DIFFICULTY_LABELS,
  formatGameDate,
  formatShare,
  MODE_LABELS,
  PHASE_LABELS,
} from '../labels';
import { useWeeklyPlan } from '../stores/plan';
import { ActionPlanner } from './dashboard/ActionPlanner';
import { CampaignPanel } from './dashboard/CampaignPanel';
import { CalendarPanel } from './dashboard/CalendarPanel';
import { DecisionsPanel } from './dashboard/DecisionsPanel';
import { ResourcesPanel } from './dashboard/ResourcesPanel';
import { useCurrentGame } from './GameLayout';

export function Dashboard() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion);
  const journal = useJournal(game.id);
  const advance = useAdvance(game.id);
  const plan = useWeeklyPlan(game.id, game.week);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Une clé par tentative ; conservée si le réseau coupe, pour qu'un renvoi ne rejoue rien.
  const attemptKey = useRef<string | null>(null);

  const { state } = game;
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const blocked = state.calendar.blockedBy !== null;
  const observer = state.player.mode === 'observateur';
  const campaigning =
    actor !== undefined && (actor.status === 'candidat' || actor.status === 'qualifie');
  const round = state.meta.phase === 'entre_deux_tours' ? 'intentions_t2' : 'intentions_t1';
  const latestPoll = [...state.polls]
    .reverse()
    .find((p) => p.kind === round && !p.id.endsWith('-hypothese-t2'));
  const playerPoll = latestPoll?.results.find((r) => r.actorId === actor?.id);
  const playerRank =
    latestPoll && playerPoll
      ? [...latestPoll.results]
          .sort((a, b) => b.value - a.value)
          .findIndex((r) => r.actorId === actor?.id) + 1
      : null;
  const unanswered = observer
    ? []
    : state.pendingDecisions.filter((decision) => !answers[decision.id]);
  const lastReport =
    advance.data?.report ??
    journal.data?.pages[0]?.entries.find((entry) => entry.report)?.report ??
    null;

  // Toute modification du plan invalide la clé d'idempotence de la tentative précédente.
  const changePlan = <T extends unknown[]>(change: (...args: T) => void) => {
    return (...args: T) => {
      attemptKey.current = null;
      change(...args);
    };
  };
  const reservedHours = ruleset.data
    ? plan.ajouter.length * ruleset.data.programme.heuresParProposition
    : 0;
  const missingTargets = ruleset.data
    ? plan.actions.filter(
        (a) =>
          a.cible === undefined && ruleset.data.actions.find((d) => d.id === a.actionId)?.cible,
      ).length
    : 0;
  const nameOf = (id: string) =>
    state.actors[id] ? candidateName(state.actors[id].candidate) : id;
  const programmeLabel = (id: string) =>
    ruleset.data?.programme.propositions.find((p) => p.id === id)?.libelle ?? id;
  const answer = (decisionId: string, optionId: string) => {
    attemptKey.current = null;
    setAnswers((current) => ({ ...current, [decisionId]: optionId }));
  };

  const submit = () => {
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
        },
      },
      {
        onSuccess: () => {
          attemptKey.current = null;
          plan.clear();
          setAnswers({});
        },
        onError: (error) => {
          if (!(error instanceof ApiRequestError && error.code === 'serveur_injoignable')) {
            attemptKey.current = null;
          }
        },
      },
    );
  };

  const facts = [
    { label: 'Date en jeu', value: formatGameDate(game.date) },
    { label: 'Semaine', value: String(game.week) },
    { label: 'Phase', value: PHASE_LABELS[game.phase] },
    { label: 'Mode', value: MODE_LABELS[game.mode] },
    { label: 'Difficulté', value: DIFFICULTY_LABELS[game.difficulty] },
    ...(actor
      ? [
          {
            label: 'Votre candidat',
            value: `${candidateName(actor.candidate)} — ${CANDIDATE_STATUS_LABELS[actor.status]}`,
          },
        ]
      : []),
  ];

  return (
    <section aria-labelledby="titre-tableau" className="space-y-8">
      <h1 id="titre-tableau" className="text-2xl font-bold">
        Tableau de bord
      </h1>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className={card}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{fact.label}</dt>
            <dd className="mt-1 font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {blocked && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p>
            {state.calendar.blockedMessage ??
              'La partie ne peut pas avancer davantage pour l’instant.'}
          </p>
          <Link to="../resultats" className="font-semibold underline">
            Voir les résultats
          </Link>
        </div>
      )}

      {(latestPoll || state.elections.t1) && (
        <section aria-labelledby="titre-course" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-course" className="text-lg font-semibold">
            La course présidentielle
          </h2>
          {latestPoll && playerPoll && playerRank && (
            <p>
              Dernier sondage ({latestPoll.institute}, semaine {latestPoll.week}) : vous êtes{' '}
              <strong>{playerRank === 1 ? '1er' : `${playerRank}e`}</strong> sur{' '}
              {latestPoll.results.length} avec <strong>{formatShare(playerPoll.value)}</strong> (±{' '}
              {formatShare(playerPoll.margin).replace(' %', ' pt')}).
            </p>
          )}
          {latestPoll && !playerPoll && (
            <p>
              Dernier sondage ({latestPoll.institute}, semaine {latestPoll.week}) :{' '}
              {[...latestPoll.results]
                .sort((a, b) => b.value - a.value)
                .slice(0, 3)
                .map(
                  (r) =>
                    `${state.actors[r.actorId] ? candidateName(state.actors[r.actorId]!.candidate) : r.actorId} ${formatShare(r.value)}`,
                )
                .join(' · ')}
            </p>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              to="../sondages"
              className="text-republique-600 underline dark:text-republique-100"
            >
              Tous les sondages
            </Link>
            <Link
              to="../candidats"
              className="text-republique-600 underline dark:text-republique-100"
            >
              Les candidats
            </Link>
            {state.elections.t1 && (
              <Link
                to="../resultats"
                className="text-republique-600 underline dark:text-republique-100"
              >
                Résultats
              </Link>
            )}
          </p>
        </section>
      )}

      {actor && !campaigning && !blocked && (
        <p className="rounded-lg border border-slate-300 p-4 text-sm dark:border-slate-700">
          Vous n’êtes plus candidat : vous ne programmez plus d’actions de campagne, mais vous
          pouvez suivre la suite de l’élection semaine après semaine.
        </p>
      )}

      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}

      {ruleset.data && actor && (
        <ResourcesPanel resources={actor.resources} ruleset={ruleset.data} />
      )}
      {ruleset.data && actor && (
        <CampaignPanel state={state} actor={actor} ruleset={ruleset.data} />
      )}
      {observer && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Mode observateur : aucune campagne n’est contrôlée. Les candidats fictifs mènent leur
          campagne de façon autonome ; les décisions éventuelles prennent l’option par défaut.
        </p>
      )}

      {!observer && state.pendingDecisions.length > 0 && (
        <DecisionsPanel decisions={state.pendingDecisions} answers={answers} onAnswer={answer} />
      )}

      {ruleset.data && actor && campaigning && !blocked && (
        <>
          <section aria-labelledby="titre-engagements" className={`${card} space-y-2 text-sm`}>
            <h2 id="titre-engagements" className="text-lg font-semibold">
              Programme et alliances cette semaine
            </h2>
            {plan.ajouter.length + plan.retirer.length > 0 ? (
              <p>
                {plan.ajouter.length > 0 &&
                  `À annoncer : ${plan.ajouter.map(programmeLabel).join(', ')} (${reservedHours} h de préparation). `}
                {plan.retirer.length > 0 &&
                  `À retirer : ${plan.retirer.map(programmeLabel).join(', ')} (un revirement coûte de la crédibilité).`}
              </p>
            ) : (
              <p className="text-slate-600 dark:text-slate-400">
                Aucun changement de programme prévu ({actor.programme.propositions.length}{' '}
                proposition(s) annoncée(s)).
              </p>
            )}
            {plan.proposer.length > 0 && (
              <p>Propositions de ralliement : {plan.proposer.map(nameOf).join(', ')}.</p>
            )}
            <p className="flex flex-wrap gap-x-4">
              <Link
                to="../programme"
                className="text-republique-600 underline dark:text-republique-100"
              >
                Composer le programme
              </Link>
              <Link
                to="../candidats"
                className="text-republique-600 underline dark:text-republique-100"
              >
                Relations et alliances
              </Link>
            </p>
          </section>
          <ActionPlanner
            ruleset={ruleset.data}
            actor={actor}
            plan={plan.actions}
            reservedHours={reservedHours}
            cap={spendingCapOf(state, actor, ruleset.data)}
            onAdd={changePlan(plan.addAction)}
            onRemove={changePlan(plan.removeAction)}
            onTarget={changePlan(plan.setTarget)}
          />
        </>
      )}

      <div className={`${card} space-y-3`}>
        <button
          type="button"
          className={buttonPrimary}
          disabled={blocked || advance.isPending || unanswered.length > 0 || missingTargets > 0}
          onClick={submit}
        >
          {advance.isPending ? 'Résolution de la semaine…' : `Résoudre la semaine ${game.week}`}
        </button>
        {unanswered.length > 0 && (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Répondez d’abord aux décisions en attente.
          </p>
        )}
        {missingTargets > 0 && (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Choisissez la cible (département ou média) de chaque action qui en demande une.
          </p>
        )}
        {advance.isError && <ErrorMessage error={advance.error} />}
      </div>

      <section aria-labelledby="titre-bilan" className={`${card} space-y-3`}>
        <h2 id="titre-bilan" className="text-lg font-semibold">
          {lastReport
            ? `Bilan de la semaine ${lastReport.week} (${formatGameDate(lastReport.date)})`
            : 'Bilan hebdomadaire'}
        </h2>
        {lastReport ? (
          <WeeklyReportView report={lastReport} state={state} proposalLabel={programmeLabel} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aucune semaine résolue pour l’instant.
          </p>
        )}
      </section>

      {ruleset.data && <CalendarPanel ruleset={ruleset.data} today={game.date} />}

      <details className={card}>
        <summary className="cursor-pointer font-semibold">Paramètres techniques</summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-slate-500 dark:text-slate-400">Graine</dt>
          <dd className="font-mono break-all">{game.seed}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Version du moteur</dt>
          <dd className="font-mono">{game.engineVersion}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Jeu de règles</dt>
          <dd className="font-mono">{game.rulesetVersion}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Format de sauvegarde</dt>
          <dd className="font-mono">{game.saveSchemaVersion}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Empreinte de l’état</dt>
          <dd className="font-mono break-all" data-testid="empreinte">
            {game.stateHash}
          </dd>
        </dl>
      </details>
    </section>
  );
}
