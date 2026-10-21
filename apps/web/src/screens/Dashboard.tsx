import {
  addDays,
  candidateName,
  MAX_FAST_FORWARD_WEEKS,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiRequestError, newIdempotencyKey } from '../api/client';
import { spendingCapOf } from '../campaign';
import { useAdvance, useJournal, useRuleset } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, buttonSecondary, card, input } from '../components/ui';
import { WeeklyReportView } from '../components/WeeklyReportView';
import {
  CANDIDATE_STATUS_LABELS,
  DIFFICULTY_LABELS,
  formatGameDate,
  formatIndicator,
  formatShare,
  MODE_LABELS,
  PHASE_LABELS,
} from '../labels';
import { useWeeklyPlan } from '../stores/plan';
import { memberInfo } from './Government';
import { ActionPlanner } from './dashboard/ActionPlanner';
import { CampaignPanel } from './dashboard/CampaignPanel';
import { CalendarPanel } from './dashboard/CalendarPanel';
import { DecisionsPanel } from './dashboard/DecisionsPanel';
import { ResourcesPanel } from './dashboard/ResourcesPanel';
import { useCurrentGame } from './GameLayout';

/** Même règle que le moteur (qui reste seul juge) : affichée avant de programmer la dissolution. */
function dissolutionRestriction(state: GameState, ruleset: Ruleset): string | null {
  const legislatives = state.legislatives;
  if (!legislatives) return 'Aucune Assemblée à dissoudre.';
  if (legislatives.prochaine?.motif === 'dissolution' || legislatives.premierTour)
    return 'Des élections législatives sont déjà en cours.';
  const { moratoireJours, delaiMaxJours } = ruleset.legislatives.regles;
  const allowed = addDays(legislatives.derniere.t2, moratoireJours);
  if (state.meta.date < allowed)
    return `Pas de nouvelle dissolution dans l’année qui suit les dernières élections (possible à partir du ${formatGameDate(allowed)}).`;
  const next = ruleset.quinquennat.cycles.find((c) => c.annee > state.cycle.annee);
  const campaign = next ? addDays(state.meta.startDate, 7 * next.decalageSemaines) : null;
  return campaign && addDays(state.meta.date, delaiMaxJours) >= campaign
    ? `Plus de dissolution à l’approche de la campagne présidentielle du ${formatGameDate(campaign)} (simplification du jeu).`
    : null;
}

const FAST_FORWARD_STOP_LABELS = {
  decision: 'une décision vous attend',
  scrutin: 'un scrutin a eu lieu',
  changement_de_phase: 'la partie change de phase',
  evenement_majeur: 'un événement majeur est survenu',
  blocage: 'la partie ne peut pas aller plus loin pour l’instant',
} as const;

export function Dashboard() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const journal = useJournal(game.id);
  const advance = useAdvance(game.id);
  const plan = useWeeklyPlan(game.id, game.week);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fastWeeks, setFastWeeks] = useState(13);
  // Une clé par tentative ; conservée si le réseau coupe, pour qu'un renvoi ne rejoue rien.
  const attemptKey = useRef<string | null>(null);

  const { state } = game;
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const blocked = state.calendar.blockedBy !== null;
  const observer = state.player.mode === 'observateur';
  const campaigning =
    actor !== undefined && (actor.status === 'candidat' || actor.status === 'qualifie');
  // Phase 6 : quinquennat (président joueur ou IA).
  const quinquennat = state.meta.phase === 'presidence' ? state.quinquennat : null;
  // Phase 6 (P6-08) : campagne d'un cycle suivant, après un quinquennat achevé.
  const previousTerm =
    state.cycle.annee > 2027 ? (state.historique.quinquennats.at(-1) ?? null) : null;
  const presiding = quinquennat !== null && quinquennat.mandat.presidentId === actor?.id;
  const mandateStarted = quinquennat !== null && addDays(game.date, 6) >= quinquennat.mandat.debut;
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
          a.cible === undefined &&
          [...ruleset.data.actions, ...ruleset.data.quinquennat.actions].find(
            (d) => d.id === a.actionId,
          )?.cible,
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

      {quinquennat && ruleset.data && (
        <section aria-labelledby="titre-quinquennat" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-quinquennat" className="text-lg font-semibold">
            Quinquennat {quinquennat.mandat.debut.slice(0, 4)}–{quinquennat.mandat.fin.slice(0, 4)}
          </h2>
          <p>
            {presiding
              ? 'Vous êtes président(e) de la République'
              : `${nameOf(quinquennat.mandat.presidentId)} est président(e) de la République`}{' '}
            : mandat du {formatGameDate(quinquennat.mandat.debut)} au{' '}
            {formatGameDate(quinquennat.mandat.fin)}.
          </p>
          <p>
            {quinquennat.gouvernement
              ? `Premier ministre : ${memberInfo(state, ruleset.data, quinquennat.gouvernement.premierMinistre).name} (gouvernement n° ${quinquennat.gouvernement.numero}).`
              : mandateStarted
                ? 'Matignon est vacant : un Premier ministre doit être nommé.'
                : `Le Premier ministre sera nommé la semaine de l’investiture.`}
          </p>
          {!presiding && actor && (
            <p>
              Vous n’êtes pas président(e) : le quinquennat se déroule sans vous, sous la conduite
              de l’IA (mêmes règles que pour le joueur). Utilisez l’avance rapide ; vous pourrez
              vous présenter à la présidentielle suivante.
            </p>
          )}
          {state.parlement && (
            <p>
              Assemblée nationale : {state.parlement.textes.filter((b) => !b.issue).length} texte(s)
              en cours, {state.parlement.reformes.filter((r) => r.appliquee).length} réforme(s) en
              vigueur.
            </p>
          )}
          {state.economie && (
            <p>
              Économie (simulée) : croissance{' '}
              {formatIndicator('croissance', state.economie.indicateurs.croissance ?? 0)}, chômage{' '}
              {formatIndicator('chomage', state.economie.indicateurs.chomage ?? 0)}, inflation{' '}
              {formatIndicator('inflation', state.economie.indicateurs.inflation ?? 0)}.
            </p>
          )}
          {state.legislatives?.prochaine && (
            <p>
              {state.legislatives.prochaine.motif === 'dissolution'
                ? 'Assemblée dissoute : législatives anticipées'
                : 'Prochaines législatives'}{' '}
              : premier tour le {formatGameDate(state.legislatives.prochaine.t1)}
              {state.legislatives.derniere.cohabitation ? ' ; cohabitation en cours' : ''}.
            </p>
          )}
          <p className="flex flex-wrap gap-x-4">
            <Link
              to="../gouvernement"
              className="text-republique-600 underline dark:text-republique-100"
            >
              Le gouvernement
            </Link>
            <Link
              to="../parlement"
              className="text-republique-600 underline dark:text-republique-100"
            >
              Le Parlement
            </Link>
            <Link
              to="../economie"
              className="text-republique-600 underline dark:text-republique-100"
            >
              L’économie
            </Link>
            <Link
              to="../legislatives"
              className="text-republique-600 underline dark:text-republique-100"
            >
              Les législatives
            </Link>
            <Link
              to="../resultats"
              className="text-republique-600 underline dark:text-republique-100"
            >
              Résultats de la présidentielle
            </Link>
          </p>
        </section>
      )}

      {!quinquennat && previousTerm && (
        <section aria-labelledby="titre-nouveau-cycle" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-nouveau-cycle" className="text-lg font-semibold">
            Présidentielle {state.cycle.annee}
          </h2>
          <p>
            Le quinquennat {previousTerm.mandat.debut.slice(0, 4)}–
            {previousTerm.mandat.fin.slice(0, 4)} de {nameOf(previousTerm.mandat.presidentId)} est
            terminé : son bilan est arrêté ; le mandat s’achève le{' '}
            {formatGameDate(previousTerm.mandat.fin)}.
          </p>
          {actor?.status === 'ineligible' && (
            <p>
              Vous avez accompli deux mandats consécutifs : vous ne pouvez pas vous représenter
              (Constitution, art. 6). La campagne se déroule sans vous.
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Calendrier : celui de 2027 transposé en {state.cycle.annee} (hypothèse, dates réelles
            fixées par décret). Parrainages et comptes de campagne repartent de zéro. Pendant la
            campagne, l’action du gouvernement sortant, le Parlement et l’économie ne sont pas
            simulés (simplification du jeu).
          </p>
          <p>
            <Link to="../bilan" className="text-republique-600 underline dark:text-republique-100">
              Le bilan du quinquennat
            </Link>
          </p>
        </section>
      )}

      {!quinquennat && (latestPoll || state.elections.t1) && (
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

      {actor && !campaigning && !blocked && !quinquennat && (
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
      {ruleset.data && actor && !quinquennat && (
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

      {ruleset.data && actor && presiding && !blocked && (
        <ActionPlanner
          ruleset={ruleset.data}
          actor={actor}
          plan={plan.actions}
          mode="presidence"
          restriction={(action) =>
            !mandateStarted
              ? `Le mandat commence le ${formatGameDate(quinquennat.mandat.debut)}.`
              : action.institution === 'remaniement' && !quinquennat.gouvernement
                ? 'Aucun gouvernement en place à remanier.'
                : action.institution === 'dissolution'
                  ? dissolutionRestriction(state, ruleset.data!)
                  : null
          }
          reservedHours={0}
          cap={0}
          onAdd={changePlan(plan.addAction)}
          onRemove={changePlan(plan.removeAction)}
          onTarget={changePlan(plan.setTarget)}
        />
      )}

      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonPrimary}
            disabled={blocked || advance.isPending || unanswered.length > 0 || missingTargets > 0}
            onClick={() => submit()}
          >
            {advance.isPending ? 'Résolution de la semaine…' : `Résoudre la semaine ${game.week}`}
          </button>
          {quinquennat && (
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor="avance-rapide" className="text-sm">
                Avance rapide
              </label>
              <select
                id="avance-rapide"
                className={`${input} w-auto py-1.5`}
                value={fastWeeks}
                onChange={(event) => setFastWeeks(Number(event.target.value))}
              >
                {[4, 13, 26, MAX_FAST_FORWARD_WEEKS].map((n) => (
                  <option key={n} value={n}>
                    {n} semaines au plus
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={buttonSecondary}
                disabled={
                  blocked || advance.isPending || unanswered.length > 0 || plan.actions.length > 0
                }
                onClick={() => submit(fastWeeks)}
              >
                Avancer
              </button>
            </span>
          )}
        </div>
        {quinquennat && plan.actions.length > 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            L’avance rapide résout des semaines sans action : videz l’agenda pour l’utiliser.
          </p>
        )}
        {advance.data?.avanceRapide && (
          <p role="status" className="text-sm">
            Avance rapide : {advance.data.avanceRapide.resolues} semaine(s) résolue(s) sur{' '}
            {advance.data.avanceRapide.demandees}
            {advance.data.avanceRapide.arret
              ? ` — arrêt : ${FAST_FORWARD_STOP_LABELS[advance.data.avanceRapide.arret]}.`
              : '.'}
          </p>
        )}
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
          <WeeklyReportView
            report={lastReport}
            state={state}
            proposalLabel={programmeLabel}
            blocLabel={(id) =>
              ruleset.data?.legislatives.blocs.find((b) => b.id === id)?.libelle ?? id
            }
          />
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
