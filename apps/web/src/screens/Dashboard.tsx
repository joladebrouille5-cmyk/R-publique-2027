import {
  addDays,
  candidateName,
  MAX_FAST_FORWARD_WEEKS,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiRequestError, newIdempotencyKey } from '../api/client';
import { spendingCapOf } from '../campaign';
import { useAdvance, useJournal, useRuleset } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { CalendarClock, ChevronRight, Hourglass, TriangleAlert } from 'lucide-react';
import { buttonPrimary, buttonSecondary, card, input, screenTitle } from '../components/ui';
import { WeeklyReportView } from '../components/WeeklyReportView';
import {
  CANDIDATE_STATUS_LABELS,
  DIFFICULTY_LABELS,
  formatGameDate,
  formatIndicator,
  formatPollDelta,
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
import { DebatesPanel } from './dashboard/DebatesPanel';
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
  const navigate = useNavigate();
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
        onSuccess: (response) => {
          attemptKey.current = null;
          plan.clear();
          setAnswers({});
          // Soir de scrutin : la partie passe en direct de la soirée électorale.
          if (response.report.election)
            void navigate(`../soiree/${response.report.election.round}`);
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
    {
      label: 'Scénario',
      value:
        ruleset.data?.scenarios.find((s) => s.id === state.scenario)?.libelle ?? state.scenario,
    },
    ...(actor
      ? [
          {
            label: 'Votre candidat',
            value: `${candidateName(actor.candidate)} — ${CANDIDATE_STATUS_LABELS[actor.status]}`,
          },
        ]
      : []),
  ];

  const link =
    'inline-flex min-h-11 items-center gap-1 rounded-full px-1 font-semibold text-republique-700 hover:underline dark:text-republique-300';

  return (
    <section aria-labelledby="titre-tableau" className="space-y-8">
      <div className="space-y-1">
        <h1 id="titre-tableau" className={screenTitle}>
          Tableau de bord
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          {quinquennat
            ? presiding
              ? 'Vous gouvernez : fixez l’agenda de la semaine, tranchez, puis avancez.'
              : 'Le quinquennat suit son cours sans vous : avancez jusqu’à la prochaine campagne.'
            : campaigning
              ? 'Votre QG de campagne : tranchez les dossiers, programmez la semaine, puis résolvez-la.'
              : 'Suivez la campagne semaine après semaine.'}
        </p>
      </div>

      {blocked && (
        <div
          role="alert"
          className="flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1">
            <p>
              {state.calendar.blockedMessage ??
                'La partie ne peut pas avancer davantage pour l’instant.'}
            </p>
            <Link to="../resultats" className="font-semibold underline">
              Voir les résultats
            </Link>
          </div>
        </div>
      )}

      {!observer && state.pendingDecisions.length > 0 && (
        <DecisionsPanel decisions={state.pendingDecisions} answers={answers} onAnswer={answer} />
      )}

      {!quinquennat && ruleset.data && (
        <DebatesPanel gameId={game.id} state={state} ruleset={ruleset.data} />
      )}

      {quinquennat && ruleset.data && (
        <section aria-labelledby="titre-quinquennat" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-quinquennat" className="text-xl font-bold">
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
          <p className="flex flex-wrap gap-x-3">
            <Link to="../gouvernement" className={link}>
              Le gouvernement
            </Link>
            <Link to="../parlement" className={link}>
              Le Parlement
            </Link>
            <Link to="../economie" className={link}>
              L’économie
            </Link>
            <Link to="../legislatives" className={link}>
              Les législatives
            </Link>
            <Link to="../resultats" className={link}>
              Résultats de la présidentielle
            </Link>
          </p>
        </section>
      )}

      {!quinquennat && previousTerm && (
        <section aria-labelledby="titre-nouveau-cycle" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-nouveau-cycle" className="text-xl font-bold">
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
            <Link to="../bilan" className={link}>
              Le bilan du quinquennat
            </Link>
          </p>
        </section>
      )}

      {!quinquennat && (latestPoll || state.elections.t1) && (
        <section
          aria-labelledby="titre-course"
          className="relative overflow-hidden rounded-dossier bg-slate-900 p-5 text-white shadow-raised sm:p-7 dark:bg-slate-800"
        >
          <span aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1.5">
            <span className="flex-1 bg-republique-500" />
            <span className="flex-1 bg-white" />
            <span className="flex-1 bg-red-500" />
          </span>
          <h2 id="titre-course" className="text-xl font-bold">
            La course présidentielle
          </h2>
          {latestPoll && playerPoll && playerRank && (
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="font-display leading-none font-extrabold">
                <span className="text-6xl tracking-tight">
                  {playerRank === 1 ? '1er' : `${playerRank}e`}
                </span>
                <span className="ml-2 text-lg font-semibold text-slate-300">
                  sur {latestPoll.results.length}
                </span>
              </p>
              <p className="text-sm text-slate-300">
                Dernier sondage ({latestPoll.institute}, semaine {latestPoll.week}) : vous êtes{' '}
                <strong className="text-white">
                  {playerRank === 1 ? '1er' : `${playerRank}e`}
                </strong>{' '}
                sur {latestPoll.results.length} avec{' '}
                <strong className="text-white">{formatShare(playerPoll.value)}</strong> (±{' '}
                {formatShare(playerPoll.margin).replace(' %', ' pt')})
                {playerPoll.variation !== null &&
                  `, ${formatPollDelta(playerPoll.variation)} depuis sa vague précédente`}
                .
              </p>
            </div>
          )}
          {latestPoll && !playerPoll && (
            <p className="mt-2 text-sm text-slate-300">
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
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              to="../sondages"
              className="inline-flex min-h-11 items-center gap-1 font-semibold text-white hover:underline"
            >
              Tous les sondages
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              to="../candidats"
              className="inline-flex min-h-11 items-center gap-1 font-semibold text-white hover:underline"
            >
              Les candidats
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
            {state.elections.t1 && (
              <Link
                to="../resultats"
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-white hover:underline"
              >
                Résultats
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </p>
        </section>
      )}

      {actor && !campaigning && !blocked && !quinquennat && (
        <p className="rounded-card border border-slate-300 p-4 text-sm dark:border-slate-700">
          Vous n’êtes plus candidat : vous ne programmez plus d’actions de campagne, mais vous
          pouvez suivre la suite de l’élection semaine après semaine.
        </p>
      )}

      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}

      {ruleset.data && actor && campaigning && !blocked && (
        <>
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
          <section aria-labelledby="titre-engagements" className={`${card} space-y-2 text-sm`}>
            <h2 id="titre-engagements" className="text-lg font-bold">
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
            <p className="flex flex-wrap gap-x-3">
              <Link to="../programme" className={link}>
                Composer le programme
              </Link>
              <Link to="../candidats" className={link}>
                Relations et alliances
              </Link>
            </p>
          </section>
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

      {/* Barre de résolution : toujours à portée de pouce, au-dessus de la navigation. */}
      <div className="sticky bottom-[calc(4.25rem+var(--sab))] z-20 lg:bottom-4">
        {/* Compacte sur téléphone : elle ne doit pas masquer les cartes d'actions qui défilent. */}
        <div className="space-y-1.5 rounded-card border border-slate-200/80 bg-white/95 px-2.5 py-2 shadow-raised backdrop-blur-md sm:space-y-2 sm:p-3 dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${buttonPrimary} flex-1 sm:flex-none`}
              disabled={blocked || advance.isPending || unanswered.length > 0 || missingTargets > 0}
              onClick={() => submit()}
            >
              {advance.isPending ? (
                <>
                  <Hourglass aria-hidden="true" className="size-4 animate-pulse" />
                  Résolution de la semaine…
                </>
              ) : (
                <>
                  <CalendarClock aria-hidden="true" className="size-4" />
                  {`Résoudre la semaine ${game.week}`}
                </>
              )}
            </button>
            {quinquennat && (
              <span className="flex flex-wrap items-center gap-2">
                <label htmlFor="avance-rapide" className="text-sm font-semibold">
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
            <p className="text-xs leading-snug sm:text-sm text-slate-600 dark:text-slate-400">
              L’avance rapide résout des semaines sans action : videz l’agenda pour l’utiliser.
            </p>
          )}
          {advance.data?.avanceRapide && (
            <p role="status" className="text-xs leading-snug sm:text-sm">
              Avance rapide : {advance.data.avanceRapide.resolues} semaine(s) résolue(s) sur{' '}
              {advance.data.avanceRapide.demandees}
              {advance.data.avanceRapide.arret
                ? ` — arrêt : ${FAST_FORWARD_STOP_LABELS[advance.data.avanceRapide.arret]}.`
                : '.'}
            </p>
          )}
          {unanswered.length > 0 && (
            <p className="text-xs leading-snug sm:text-sm font-semibold text-amber-800 dark:text-amber-300">
              Répondez d’abord aux décisions en attente.
            </p>
          )}
          {missingTargets > 0 && (
            <p className="text-xs leading-snug sm:text-sm font-semibold text-amber-800 dark:text-amber-300">
              Choisissez la cible (département ou média) de chaque action qui en demande une.
            </p>
          )}
          {advance.isError && <ErrorMessage error={advance.error} />}
        </div>
      </div>

      <section
        aria-labelledby="titre-bilan"
        key={lastReport?.week ?? 'aucun'}
        className={`${card} animate-revele space-y-3`}
      >
        <h2 id="titre-bilan" className="text-xl font-bold">
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

      {ruleset.data && <CalendarPanel ruleset={ruleset.data} today={game.date} />}

      <section aria-labelledby="titre-partie" className={`${card} space-y-3`}>
        <h2 id="titre-partie" className="text-lg font-bold">
          La partie
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {fact.label}
              </dt>
              <dd className="mt-0.5 font-semibold">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <details className="border-t border-slate-200 pt-3 dark:border-slate-800">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            Paramètres techniques
          </summary>
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
    </section>
  );
}
