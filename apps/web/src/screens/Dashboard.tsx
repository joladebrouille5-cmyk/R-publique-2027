import {
  addDays,
  candidateName,
  debateAwaitingPlayer,
  delegationHours,
  isOptionalDecision,
  MAX_FAST_FORWARD_WEEKS,
  membersMajority,
  presidentialActionBlocked,
  supportSeats,
  type GameState,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import {
  Activity,
  Armchair,
  Award,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Clapperboard,
  Flame,
  Gavel,
  Hourglass,
  Landmark,
  ListChecks,
  Scale,
  ScrollText,
  Siren,
  Stamp,
  TrendingUp,
  TriangleAlert,
  Tv,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiRequestError, newIdempotencyKey } from '../api/client';
import { nominationsClosed, presentationSummary, spendingCapOf } from '../campaign';
import { useAdvance, useJournal, useRuleset, useSupports } from '../api/hooks';
import { Achievements } from '../components/Achievements';
import { DifficultySheet } from '../components/DifficultySheet';
import { Disclosure, DisclosureGroup, Embedded } from '../components/Disclosure';
import { Drawer } from '../components/Drawer';
import { tensionLevel } from '../components/ParliamentGauges';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  buttonGhost,
  buttonPrestige,
  buttonPrimary,
  buttonSecondary,
  card,
  cardRaised,
  inputCompact,
  screenTitle,
} from '../components/ui';
import { WeeklyDebrief } from '../components/WeeklyDebrief';
import { WeeklyReportView } from '../components/WeeklyReportView';
import {
  CANDIDATE_STATUS_LABELS,
  DIFFICULTY_LABELS,
  formatGameDate,
  formatIndicator,
  formatPollDelta,
  formatResource,
  formatShare,
  MODE_LABELS,
  PHASE_LABELS,
} from '../labels';
import { useWeeklyPlan } from '../stores/plan';
import { useOpenSections, ScreenSection } from './Espace';
import { memberInfo } from './Government';
import { ActionPlanner, remainingAfter } from './dashboard/ActionPlanner';
import { CampaignPanel } from './dashboard/CampaignPanel';
import { CalendarPanel } from './dashboard/CalendarPanel';
import { DecisionSpotlight } from './dashboard/DecisionSpotlight';
import { DecisionsPanel } from './dashboard/DecisionsPanel';
import { ParrainagesRace } from './dashboard/ParrainagesRace';
import { SupportsCard } from './dashboard/SupportsCard';
import { DebatesPanel } from './dashboard/DebatesPanel';
import { Overview, type OverviewTile } from './dashboard/Overview';
import { ResourcesPanel } from './dashboard/ResourcesPanel';
import { useCurrentGame } from './GameLayout';
import { GAME_SCREENS } from './registry';
import { SECTION_SCREENS } from './sections';

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
  debat: 'un débat télévisé vous attend',
  scrutin: 'un scrutin a eu lieu',
  changement_de_phase: 'la partie change de phase',
  evenement_majeur: 'un événement majeur est survenu',
  blocage: 'la partie ne peut pas aller plus loin pour l’instant',
} as const;

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const rankLabel = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);
/** Montant court d'une tuile : « 3 M€ », « 120 k€ ». */
const compactEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Tiroirs du QG (phase 12) : un écran intégré, ou un panneau propre au QG. */
type Panel =
  | 'sondages'
  | 'resultats'
  | 'programme'
  | 'candidats'
  | 'finances'
  | 'gouvernement'
  | 'parlement'
  | 'economie'
  | 'crises'
  | 'legislatives'
  | 'calendrier'
  | 'parrainages';

const PANEL_TITLES: Partial<Record<Panel, string>> = {
  calendrier: 'Calendrier électoral',
  parrainages: 'Parrainages et compte de campagne',
};

/** Sections repliées en bas du QG (le bilan de la semaine, puis les écrans du QG). */
const QG_SECTIONS = [
  'bilan-semaine',
  'succes',
  'ressources',
  'campagne-detail',
  'calendrier',
  'journal',
  'sauvegardes',
  'partie',
];

export function Dashboard() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const journal = useJournal(game.id);
  const advance = useAdvance(game.id);
  const navigate = useNavigate();
  const plan = useWeeklyPlan(game.id, game.week);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fastWeeks, setFastWeeks] = useState(13);
  // Débriefing de la semaine résolue (phase 11), en plein écran jusqu'à « Continuer ».
  const [debrief, setDebrief] = useState<WeeklyReport | null>(null);
  // Détail ouvert dans un tiroir (phase 12) : la page reste en place.
  const [panel, setPanel] = useState<Panel | null>(null);
  const { open, toggle, show } = useOpenSections(QG_SECTIONS);
  // Une clé par tentative ; conservée si le réseau coupe, pour qu'un renvoi ne rejoue rien.
  const attemptKey = useRef<string | null>(null);
  // Pop-up d'intervention (phase 15) : décision ouverte, et celles que le joueur a refermées.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

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
  // Une décision facultative (questions au gouvernement) ne bloque pas la semaine.
  // Débat obligatoire (phase 17, règle partagée avec le moteur) : la semaine attend le débat.
  const debateDue = observer ? undefined : debateAwaitingPlayer(state);
  const unanswered = observer
    ? []
    : state.pendingDecisions.filter(
        (decision) => !answers[decision.id] && !isOptionalDecision(decision),
      );
  // Vivier des négociations de soutien (phase 15), calculé par le serveur pour la semaine.
  const supports = useSupports(
    game.id,
    game.week,
    campaigning && state.meta.phase !== 'presidence' && !blocked,
  );
  // Pop-up : la décision ouverte par le joueur, sinon la première urgence ou séance de questions
  // au gouvernement sans réponse ni refermée (après le débriefing de la semaine).
  const spotlight = observer
    ? undefined
    : spotlightId
      ? state.pendingDecisions.find((d) => d.id === spotlightId)
      : debrief
        ? undefined
        : state.pendingDecisions.find(
            (d) =>
              (d.kind === 'urgence' || d.kind === 'qag') && !answers[d.id] && !dismissed.has(d.id),
          );
  const closeSpotlight = () => {
    if (spotlight) setDismissed((current) => new Set([...current, spotlight.id]));
    setSpotlightId(null);
  };
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
  // Heures réservées avant les actions : propositions annoncées et délégations d'élus reçues
  // (phase 15, même règle que le moteur).
  const reservedHours = ruleset.data
    ? plan.ajouter.length * ruleset.data.programme.heuresParProposition +
      delegationHours(
        ruleset.data,
        state.pendingDecisions.map((d) => ({ kind: d.kind, optionId: answers[d.id] })),
      )
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
  // Un tiroir peut modifier le plan (programme, alliances) : nouvelle tentative à sa fermeture.
  const closePanel = () => {
    attemptKey.current = null;
    setPanel(null);
  };
  /** Amène une partie de la page à l'écran et y place le focus (titre rendu focalisable). */
  const reveal = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.focus({ preventScroll: true });
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
          // Soir de scrutin : la partie passe en direct de la soirée électorale ; sinon, une
          // semaine résolue (hors avance rapide) ouvre son débriefing.
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

  // Vue d'ensemble : uniquement des valeurs servies par l'API (état, jeu de règles).
  const tiles: OverviewTile[] = [];
  const drawer = (id: Panel, label: string) => ({
    kind: 'tiroir' as const,
    run: () => setPanel(id),
    label,
  });
  const section = (id: string, label: string) => ({
    kind: 'section' as const,
    run: () => reveal(id),
    label,
  });
  const data = ruleset.data;
  if (data && actor && (campaigning || presiding) && !blocked) {
    const catalog = presiding ? data.quinquennat.actions : data.actions;
    const left = remainingAfter(plan.actions, catalog, actor, reservedHours);
    tiles.push({
      id: 'actions',
      icon: ListChecks,
      label: presiding ? 'Agenda de la semaine' : 'Actions programmées',
      value: `${plan.actions.length}/${data.jeu.actionsMaxParSemaine}`,
      detail: `Reste ${presiding ? '' : `${compactEuros.format(left.budget / 100)} · `}${formatResource('tempsHeures', left.time)}`,
      action: section('titre-plan', 'Aller au plan de la semaine'),
    });
  }
  if (!observer) {
    tiles.push({
      id: 'decisions',
      icon: Stamp,
      label: 'Décisions',
      value: unanswered.length > 0 ? `${unanswered.length} à prendre` : 'Aucune',
      detail:
        state.pendingDecisions.length > 0
          ? `${state.pendingDecisions.length} en attente cette semaine`
          : 'Rien ne bloque la semaine',
      tone: unanswered.length > 0 ? 'alerte' : undefined,
      action:
        state.pendingDecisions.length > 0
          ? section('titre-decisions', 'Aller aux décisions')
          : section('titre-plan', 'Aller au plan de la semaine'),
    });
  }
  if (!quinquennat && latestPoll) {
    const top = [...latestPoll.results].sort((a, b) => b.value - a.value)[0]!;
    tiles.push({
      id: 'sondage',
      icon: ChartColumn,
      label: 'Sondage clé',
      value:
        playerPoll && playerRank
          ? `${rankLabel(playerRank)} · ${formatShare(playerPoll.value)}`
          : `${nameOf(top.actorId)} ${formatShare(top.value)}`,
      detail: `${latestPoll.institute}, sem. ${latestPoll.week}${
        playerPoll?.variation !== null && playerPoll?.variation !== undefined
          ? ` · ${formatPollDelta(playerPoll.variation)}`
          : ''
      }`,
      tone: playerRank === 1 ? 'succes' : undefined,
      action: drawer('sondages', 'Ouvrir les sondages'),
    });
  }
  if (data && actor && campaigning && !quinquennat) {
    const summary = presentationSummary(actor.parrainages, data);
    if (state.campagne.parrainages === 'modelise' && !nominationsClosed(data, state.meta.date))
      tiles.push({
        id: 'parrainages',
        icon: Gavel,
        label: 'Parrainages',
        value: `${summary.comptees}/${summary.seuil}`,
        detail: `${summary.departements}/${summary.departementsMin} départements`,
        tone: summary.atteint ? 'succes' : 'alerte',
        action: drawer('parrainages', 'Ouvrir les parrainages et le compte de campagne'),
      });
    const cap = spendingCapOf(state, actor, data);
    tiles.push({
      id: 'compte',
      icon: Wallet,
      label: 'Compte de campagne',
      value: compactEuros.format(actor.finances.depenses / 100),
      detail: `dépensés sur ${compactEuros.format(cap / 100)} autorisés`,
      tone: actor.finances.depassement ? 'alerte' : undefined,
      action: drawer('finances', 'Ouvrir les finances'),
    });
    tiles.push({
      id: 'programme',
      icon: ScrollText,
      label: 'Programme',
      value: `${actor.programme.propositions.length}`,
      detail:
        plan.ajouter.length + plan.retirer.length > 0
          ? `propositions ; ${plan.ajouter.length + plan.retirer.length} changement(s) prévu(s)`
          : 'propositions annoncées',
      action: drawer('programme', 'Ouvrir le programme'),
    });
    tiles.push({
      id: 'elan',
      icon: Flame,
      label: 'Élan',
      value: formatResource('dynamique', actor.resources.dynamique),
      detail: `Dynamique · Jeunesse ${formatResource('jeunesse', actor.resources.jeunesse)}`,
      action: {
        kind: 'section',
        run: () => show('ressources'),
        label: 'Voir toutes les ressources',
      },
    });
  }
  if (quinquennat && data) {
    const government = quinquennat.gouvernement;
    tiles.push({
      id: 'gouvernement',
      icon: Landmark,
      label: 'Gouvernement',
      value: government
        ? memberInfo(state, data, government.premierMinistre).name
        : 'Matignon vacant',
      detail: government
        ? `Premier ministre · gouvernement n° ${government.numero}`
        : mandateStarted
          ? 'Matignon est vacant : un Premier ministre doit être nommé'
          : 'Nomination la semaine de l’investiture',
      tone: government ? undefined : 'alerte',
      action: drawer('gouvernement', 'Ouvrir le gouvernement'),
    });
    if (state.parlement) {
      const parliament = state.parlement;
      const majority = membersMajority(parliament);
      const supporters = supportSeats(parliament);
      const seuil = data.parlement.tension.seuilMotion;
      tiles.push({
        id: 'majorite',
        icon: Users,
        label: 'Majorité',
        value: `${supporters}/${majority}`,
        detail:
          supporters >= majority
            ? 'majorité absolue des membres'
            : `il manque ${majority - supporters} voix`,
        tone: supporters >= majority ? 'succes' : 'alerte',
        action: drawer('parlement', 'Ouvrir le Parlement'),
      });
      tiles.push({
        id: 'tension',
        icon: Activity,
        label: 'Tension parlementaire',
        value: `${parliament.tension.valeur}/100`,
        detail: tensionLevel(parliament.tension.valeur, seuil).label,
        tone: parliament.tension.valeur >= seuil ? 'alerte' : undefined,
        action: drawer('parlement', 'Ouvrir le Parlement'),
      });
      tiles.push({
        id: 'parlement',
        icon: Scale,
        label: 'Parlement',
        value: `${parliament.textes.filter((b) => !b.issue).length} texte(s)`,
        detail: `en cours · ${parliament.reformes.filter((r) => r.appliquee).length} réforme(s) en vigueur`,
        action: drawer('parlement', 'Ouvrir le Parlement'),
      });
    }
    if (state.economie)
      tiles.push({
        id: 'economie',
        icon: TrendingUp,
        label: 'Économie (simulée)',
        value: `Chômage ${formatIndicator('chomage', state.economie.indicateurs.chomage ?? 0)}`,
        detail: `Croissance ${formatIndicator('croissance', state.economie.indicateurs.croissance ?? 0)} · inflation ${formatIndicator('inflation', state.economie.indicateurs.inflation ?? 0)}`,
        action: drawer('economie', 'Ouvrir l’économie'),
      });
    const crises = Object.keys(state.eventHistory).filter((id) => id.startsWith('crise-')).length;
    tiles.push({
      id: 'crises',
      icon: Siren,
      label: 'Crises',
      value: state.pendingDecisions.some((d) => d.kind === 'crise') ? 'En cours' : `${crises}`,
      detail: crises > 0 ? 'crise(s) survenue(s) ; scénarios fictifs' : 'aucune crise survenue',
      tone: state.pendingDecisions.some((d) => d.kind === 'crise') ? 'alerte' : undefined,
      action: drawer('crises', 'Ouvrir les crises'),
    });
    const legislatives = state.legislatives;
    tiles.push({
      id: 'legislatives',
      icon: Armchair,
      label: 'Législatives',
      value: legislatives?.prochaine
        ? formatGameDate(legislatives.prochaine.t1).replace(/^\S+ /, '')
        : 'Assemblée élue',
      detail: legislatives?.prochaine
        ? legislatives.prochaine.motif === 'dissolution'
          ? 'Assemblée dissoute : législatives anticipées'
          : 'Prochaines législatives'
        : legislatives?.derniere.cohabitation
          ? 'Cohabitation en cours'
          : `Élue en ${legislatives?.derniere.t2.slice(0, 4) ?? '2024'}`,
      action: drawer('legislatives', 'Ouvrir les législatives'),
    });
  }
  if (data) {
    const next = quinquennat
      ? { libelle: 'Fin du mandat', date: quinquennat.mandat.fin }
      : [...data.calendrier.scrutins, ...data.calendrier.echeances]
          .filter((e) => e.date >= game.date)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      const days = daysBetween(game.date, next.date);
      tiles.push({
        id: 'echeance',
        icon: CalendarDays,
        label: 'Prochaine échéance',
        value: days === 0 ? 'Aujourd’hui' : `J−${days}`,
        detail: next.libelle,
        action: drawer('calendrier', 'Ouvrir le calendrier électoral'),
      });
    }
  }
  if (!quinquennat && state.elections.t1) {
    tiles.push({
      id: 'resultats',
      icon: Vote,
      label: 'Résultats',
      value: state.elections.t2?.winner ? nameOf(state.elections.t2.winner) : '1er tour',
      detail: state.elections.t2?.winner ? 'élu(e) au second tour' : 'dépouillé',
      action: drawer('resultats', 'Ouvrir les résultats'),
    });
  }

  const overviewIntro: ReactNode = quinquennat ? (
    <>
      <p>
        {presiding
          ? 'Vous êtes président(e) de la République'
          : `${nameOf(quinquennat.mandat.presidentId)} est président(e) de la République`}{' '}
        : mandat du {formatGameDate(quinquennat.mandat.debut)} au{' '}
        {formatGameDate(quinquennat.mandat.fin)}.
      </p>
      {!presiding && actor && (
        <p>
          Vous n’êtes pas président(e) : le quinquennat se déroule sans vous, sous la conduite de
          l’IA (mêmes règles que pour le joueur). Utilisez l’avance rapide ; vous pourrez vous
          présenter à la présidentielle suivante.
        </p>
      )}
    </>
  ) : null;

  const scenarioLabel =
    data?.scenarios.find((s) => s.id === state.scenario)?.libelle ?? state.scenario;
  const facts = [
    { label: 'Date en jeu', value: formatGameDate(game.date) },
    { label: 'Semaine', value: String(game.week) },
    { label: 'Phase', value: PHASE_LABELS[game.phase] },
    { label: 'Mode', value: MODE_LABELS[game.mode] },
    { label: 'Difficulté', value: DIFFICULTY_LABELS[game.difficulty] },
    { label: 'Scénario', value: scenarioLabel },
    ...(actor
      ? [
          {
            label: 'Votre candidat',
            value: `${candidateName(actor.candidate)} — ${CANDIDATE_STATUS_LABELS[actor.status]}`,
          },
        ]
      : []),
  ];

  const PanelScreen = panel ? SECTION_SCREENS[panel] : undefined;
  const panelTitle = panel
    ? (PANEL_TITLES[panel] ?? GAME_SCREENS.find((s) => s.path === panel)?.label ?? panel)
    : '';

  return (
    <section aria-labelledby="titre-tableau" className="space-y-6">
      {debrief && (
        <WeeklyDebrief
          report={debrief}
          state={state}
          gameId={game.id}
          eventFamily={(id) => data?.evenements.find((e) => e.id === id)?.famille ?? null}
          achievement={(id) => data?.succes.liste.find((a) => a.id === id) ?? null}
          onClose={() => setDebrief(null)}
        />
      )}
      {panel && (
        <Drawer title={panelTitle} onClose={closePanel}>
          <Embedded>
            {panel === 'calendrier' && data ? (
              <CalendarPanel ruleset={data} today={game.date} />
            ) : panel === 'parrainages' && data && actor ? (
              <CampaignPanel state={state} actor={actor} ruleset={data} />
            ) : (
              PanelScreen && <PanelScreen />
            )}
          </Embedded>
        </Drawer>
      )}
      <div className="space-y-1">
        <h1 id="titre-tableau" className={screenTitle}>
          Tableau de bord
        </h1>
        <p className="text-slate-600 max-sm:sr-only dark:text-slate-400">
          {quinquennat
            ? presiding
              ? 'Vous gouvernez : fixez l’agenda de la semaine, tranchez, puis avancez.'
              : 'Le quinquennat suit son cours sans vous : avancez jusqu’à la prochaine campagne.'
            : campaigning
              ? 'Votre QG de campagne : tout est ici. Tranchez, programmez la semaine, puis résolvez-la.'
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
            <button
              type="button"
              className="font-semibold underline"
              aria-haspopup="dialog"
              onClick={() => setPanel('resultats')}
            >
              Voir les résultats
            </button>
          </div>
        </div>
      )}

      {debateDue && (
        <section
          aria-labelledby="titre-debat-requis"
          className={`${cardRaised} flex flex-wrap items-center gap-4`}
        >
          <Tv aria-hidden="true" className="size-9 shrink-0 text-or-600 dark:text-dorure" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="titre-debat-requis" className="text-2xl">
              {debateDue.libelle}
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Débat télévisé de la semaine : vous êtes sur le plateau. La semaine ne se résout
              qu’une fois le débat joué jusqu’au bout (ou sa fin simulée depuis le plateau), ou
              refusé avant le premier échange (chaise vide, malus de popularité).
            </p>
          </div>
          <Link to={`../debat/${debateDue.id}`} className={buttonPrimary}>
            <Clapperboard aria-hidden="true" className="size-4" />
            {debateDue.statut === 'en_cours' ? 'Reprendre le débat' : 'Aller sur le plateau'}
          </Link>
        </section>
      )}

      {tiles.length > 0 && (
        <Overview
          title={
            quinquennat
              ? `Quinquennat ${quinquennat.mandat.debut.slice(0, 4)}–${quinquennat.mandat.fin.slice(0, 4)}`
              : 'En un coup d’œil'
          }
          intro={overviewIntro}
          tiles={tiles}
        />
      )}

      {spotlight && (
        <DecisionSpotlight
          key={spotlight.id}
          decision={spotlight}
          state={state}
          ruleset={data}
          answer={answers[spotlight.id]}
          onAnswer={answer}
          onClose={closeSpotlight}
          announce={spotlightId === null}
        />
      )}

      {!observer && state.pendingDecisions.length > 0 && (
        <DecisionsPanel
          decisions={state.pendingDecisions}
          answers={answers}
          onAnswer={answer}
          state={state}
          ruleset={data}
          onSpotlight={setSpotlightId}
        />
      )}

      {data &&
        actor &&
        campaigning &&
        !quinquennat &&
        !blocked &&
        state.campagne.parrainages === 'modelise' &&
        !nominationsClosed(data, state.meta.date) && (
          <ParrainagesRace state={state} actor={actor} ruleset={data} />
        )}

      {data && actor && campaigning && !quinquennat && !blocked && (
        <SupportsCard
          state={state}
          actor={actor}
          ruleset={data}
          onNegotiate={
            data.actions.some((a) => a.id === 'negocier-soutien') &&
            plan.actions.length < data.jeu.actionsMaxParSemaine
              ? () => {
                  changePlan(plan.addAction)('negocier-soutien');
                  requestAnimationFrame(() => reveal('titre-plan'));
                }
              : undefined
          }
        />
      )}

      {!quinquennat && data && <DebatesPanel gameId={game.id} state={state} ruleset={data} />}

      {!quinquennat && previousTerm && (
        <section aria-labelledby="titre-nouveau-cycle" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-nouveau-cycle" className="text-2xl">
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
            <Link
              to="../pouvoir#bilan"
              className="inline-flex min-h-11 items-center font-semibold text-republique-700 hover:underline dark:text-republique-300"
            >
              Le bilan du quinquennat
            </Link>
          </p>
        </section>
      )}

      {actor && !campaigning && !blocked && !quinquennat && (
        <p className="rounded-card border border-slate-300 p-4 text-sm dark:border-slate-700">
          <strong className="font-semibold">{CANDIDATE_STATUS_LABELS[actor.status]}.</strong> Vous
          n’êtes plus candidat : vous ne programmez plus d’actions de campagne, mais vous pouvez
          suivre la suite de l’élection semaine après semaine.
        </p>
      )}

      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}

      {data && actor && campaigning && !blocked && (
        <>
          <ActionPlanner
            ruleset={data}
            actor={actor}
            plan={plan.actions}
            reservedHours={reservedHours}
            cap={spendingCapOf(state, actor, data)}
            onAdd={changePlan(plan.addAction)}
            onRemove={changePlan(plan.removeAction)}
            onTarget={changePlan(plan.setTarget)}
            onPosture={changePlan(plan.setPosture)}
            supports={{ prospects: supports.data, error: supports.isError }}
          />
          <section aria-labelledby="titre-engagements" className={`${card} space-y-2 text-sm`}>
            <h2 id="titre-engagements" className="text-xl">
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
            <p className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonGhost}
                aria-haspopup="dialog"
                onClick={() => setPanel('programme')}
              >
                Composer le programme
              </button>
              <button
                type="button"
                className={buttonGhost}
                aria-haspopup="dialog"
                onClick={() => setPanel('candidats')}
              >
                Relations et alliances
              </button>
            </p>
          </section>
        </>
      )}

      {data && actor && presiding && !blocked && (
        <ActionPlanner
          ruleset={data}
          actor={actor}
          plan={plan.actions}
          mode="presidence"
          restriction={(action) =>
            !mandateStarted
              ? `Le mandat commence le ${formatGameDate(quinquennat.mandat.debut)}.`
              : (action.institution === 'remaniement' ||
                    action.institution === 'remaniement-cible') &&
                  !quinquennat.gouvernement
                ? 'Aucun gouvernement en place à remanier.'
                : action.institution === 'dissolution'
                  ? dissolutionRestriction(state, data)
                  : action.delaiSemaines !== undefined &&
                      plan.actions.some((p) => p.actionId === action.id)
                    ? 'Une seule fois par semaine.'
                    : // Délai et condition : la règle du moteur (`@r2027/shared`), à l'identique.
                      presidentialActionBlocked(state, action)
          }
          reservedHours={0}
          cap={0}
          onAdd={changePlan(plan.addAction)}
          onRemove={changePlan(plan.removeAction)}
          onTarget={changePlan(plan.setTarget)}
          ministries={(quinquennat.gouvernement?.ministres ?? []).map((m) => ({
            posteId: m.posteId,
            libelle: data.quinquennat.postes.find((p) => p.id === m.posteId)?.libelle ?? m.posteId,
            ministre: memberInfo(state, data, m).name,
          }))}
        />
      )}

      {/* Barre de résolution : toujours à portée de pouce, au-dessus de la navigation. */}
      <div className="sticky bottom-[calc(4.25rem+var(--sab))] z-20 lg:bottom-4">
        {/* Compacte sur téléphone : elle ne doit pas masquer les cartes d'actions qui défilent. */}
        <div className="space-y-1.5 rounded-dossier border border-or-300/60 bg-white/90 px-2.5 py-2 shadow-raised backdrop-blur-md sm:space-y-2 sm:p-3 dark:border-dorure/25 dark:bg-slate-950/85 dark:shadow-[inset_0_1px_0_rgb(227_196_108/0.12),0_24px_48px_-20px_rgb(0_0_0/0.85)]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${buttonPrestige} flex-1 sm:flex-none sm:px-8`}
              disabled={
                blocked ||
                advance.isPending ||
                debateDue !== undefined ||
                unanswered.length > 0 ||
                missingTargets > 0
              }
              onClick={() => submit()}
            >
              {advance.isPending ? (
                <>
                  <Hourglass aria-hidden="true" className="size-4 animate-pulse" />
                  Résolution de la semaine…
                </>
              ) : (
                <>
                  <CalendarClock aria-hidden="true" className="size-5" />
                  {`Résoudre la semaine ${game.week}`}
                </>
              )}
            </button>
            {quinquennat && (
              // Une seule ligne sur téléphone : étiquette, sélecteur compact et bouton.
              <span className="flex flex-wrap items-center gap-2">
                <label htmlFor="avance-rapide" className="text-sm font-semibold">
                  Avance rapide
                </label>
                <select
                  id="avance-rapide"
                  className={inputCompact}
                  aria-describedby="avance-rapide-aide"
                  value={fastWeeks}
                  onChange={(event) => setFastWeeks(Number(event.target.value))}
                >
                  {[4, 13, 26, MAX_FAST_FORWARD_WEEKS].map((n) => (
                    <option key={n} value={n}>
                      {n} semaines
                    </option>
                  ))}
                </select>
                <span id="avance-rapide-aide" className="sr-only">
                  Nombre maximal de semaines : l’avance s’arrête plus tôt quand une décision vous
                  attend, après un scrutin ou un événement majeur.
                </span>
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
            <p className="text-xs leading-snug text-slate-600 sm:text-sm dark:text-slate-400">
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
          {debateDue && (
            <p className="text-xs leading-snug font-semibold text-amber-800 sm:text-sm dark:text-amber-300">
              {debateDue.libelle} vous attend : jouez-le (ou refusez-le) avant de résoudre la
              semaine.{' '}
              <Link to={`../debat/${debateDue.id}`} className="underline">
                Le plateau
              </Link>
            </p>
          )}
          {unanswered.length > 0 && (
            <p className="text-xs leading-snug font-semibold text-amber-800 sm:text-sm dark:text-amber-300">
              Répondez d’abord aux décisions en attente.
            </p>
          )}
          {missingTargets > 0 && (
            <p className="text-xs leading-snug font-semibold text-amber-800 sm:text-sm dark:text-amber-300">
              Choisissez la cible (département, média, personnalité ou ministère) de chaque action
              qui en demande une.
            </p>
          )}
          {advance.isError && <ErrorMessage error={advance.error} />}
        </div>
      </div>

      {observer && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Mode observateur : aucune campagne n’est contrôlée. Les candidats fictifs mènent leur
          campagne de façon autonome ; les décisions éventuelles prennent l’option par défaut.
        </p>
      )}

      {/* Le reste du QG, replié : on déplie ce dont on a besoin. */}
      <DisclosureGroup>
        <Disclosure
          id="bilan-semaine"
          key={lastReport?.week ?? 'aucun'}
          title={
            lastReport
              ? `Bilan de la semaine ${lastReport.week} (${formatGameDate(lastReport.date)})`
              : 'Bilan hebdomadaire'
          }
          status={
            lastReport
              ? `${lastReport.actions.length} action(s), ${lastReport.events.length} événement(s), ${lastReport.changes.length} variation(s) expliquée(s)`
              : 'Aucune semaine résolue pour l’instant.'
          }
          open={open.has('bilan-semaine')}
          onToggle={() => toggle('bilan-semaine')}
          icon={<ListChecks className="size-5" strokeWidth={2} />}
        >
          {lastReport ? (
            <WeeklyReportView
              report={lastReport}
              state={state}
              proposalLabel={programmeLabel}
              blocLabel={(id) => data?.legislatives.blocs.find((b) => b.id === id)?.libelle ?? id}
              eventFamily={(id) => data?.evenements.find((e) => e.id === id)?.famille ?? null}
            />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucune semaine résolue pour l’instant.
            </p>
          )}
        </Disclosure>

        {data && actor && (
          <Disclosure
            id="succes"
            title="Succès"
            status={`${state.succes.length} débloqué(s) sur ${data.succes.liste.length}`}
            open={open.has('succes')}
            onToggle={() => toggle('succes')}
            icon={<Award className="size-5" strokeWidth={2} />}
          >
            <Achievements state={state} ruleset={data} />
          </Disclosure>
        )}

        {data && actor && (
          <Disclosure
            id="ressources"
            title="Toutes les ressources"
            status={`Temps ${formatResource('tempsHeures', actor.resources.tempsHeures)} · militants ${formatResource('militants', actor.resources.militants)} · jeunesse ${formatResource('jeunesse', actor.resources.jeunesse)}`}
            open={open.has('ressources')}
            onToggle={() => toggle('ressources')}
            icon={<Flame className="size-5" strokeWidth={2} />}
          >
            <ResourcesPanel resources={actor.resources} ruleset={data} />
          </Disclosure>
        )}

        {data && actor && !quinquennat && (
          <Disclosure
            id="campagne-detail"
            title="Parrainages et compte de campagne"
            status="Présentations des élus, dépenses et plafond légal"
            open={open.has('campagne-detail')}
            onToggle={() => toggle('campagne-detail')}
            icon={<Gavel className="size-5" strokeWidth={2} />}
          >
            <CampaignPanel state={state} actor={actor} ruleset={data} />
          </Disclosure>
        )}

        {data && (
          <Disclosure
            id="calendrier"
            title="Calendrier électoral"
            status="Scrutins et échéances, avec leur statut"
            open={open.has('calendrier')}
            onToggle={() => toggle('calendrier')}
            icon={<CalendarDays className="size-5" strokeWidth={2} />}
          >
            <CalendarPanel ruleset={data} today={game.date} />
          </Disclosure>
        )}

        {['journal', 'sauvegardes'].map((path) => (
          <ScreenSection
            key={path}
            path={path}
            game={game}
            ruleset={data}
            open={open.has(path)}
            onToggle={() => toggle(path)}
          />
        ))}

        <Disclosure
          id="partie"
          title="La partie"
          status={`${scenarioLabel} · ${MODE_LABELS[game.mode]} · ${DIFFICULTY_LABELS[game.difficulty]}`}
          open={open.has('partie')}
          onToggle={() => toggle('partie')}
          icon={<Landmark className="size-5" strokeWidth={2} />}
        >
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
          {data && (
            <div className="mt-4">
              <DifficultySheet ruleset={data} difficulty={game.difficulty} mode={game.mode} />
            </div>
          )}
          {/* Phase 13 : à plat, sans volet dans la section dépliée. */}
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <h3 className="font-semibold">Paramètres techniques</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[12rem_1fr]">
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
          </div>
        </Disclosure>
      </DisclosureGroup>
    </section>
  );
}
