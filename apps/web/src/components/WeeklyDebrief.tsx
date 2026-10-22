import {
  candidateName,
  type ActionOutcome,
  type EventFamily,
  type Factor,
  type GameState,
  type Poll,
  type ReportEvent,
  type ResourceKey,
  type WeeklyReport,
} from '@r2027/shared';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import {
  EVENT_FAMILY_LABELS,
  formatDelta,
  formatGameDate,
  formatPollDelta,
  formatShare,
  POLL_KIND_LABELS,
  PRESTATION_LABELS,
  RESOURCE_LABELS,
} from '../labels';
import { Badge } from './Badge';
import { buttonPrimary, buttonSecondary } from './ui';
import { PrestationDetail } from './WeeklyReportView';

// Débriefing de la semaine (phase 11) : écran plein, ouvert après « Résoudre la semaine ». Il ne
// montre que le bilan calculé par le moteur — impact des actions, passages dans les médias et
// leurs raisons, imprévus, initiatives adverses, sondages publiés — sans rien recalculer.

/** Ressources résumées en tête du débriefing (le temps, rechargé chaque semaine, n'y figure pas). */
const SUMMARY: ResourceKey[] = [
  'popularite',
  'notoriete',
  'dynamique',
  'jeunesse',
  'militants',
  'budgetCentimes',
];

type Impact = { ressource: ResourceKey; delta: number };

/** Somme, par ressource du joueur, des facteurs retenus (l'ordre des ressources du bilan). */
function impactOf(report: WeeklyReport, playerId: string, keep: (f: Factor) => boolean): Impact[] {
  return report.changes
    .filter((c) => c.actorId === playerId)
    .map((c) => ({
      ressource: c.ressource,
      delta: c.factors.filter(keep).reduce((sum, f) => sum + f.value, 0),
    }))
    .filter((i) => i.delta !== 0);
}

/** Actions retenues du joueur, regroupées par libellé (même action programmée deux fois). */
function groupActions(actions: readonly ActionOutcome[]) {
  const groups = new Map<string, ActionOutcome[]>();
  for (const a of actions) groups.set(a.label, [...(groups.get(a.label) ?? []), a]);
  return [...groups.values()];
}

/**
 * Facteurs du registre nés d'une origine : « Libellé : effet attendu », « Libellé : aléa »…
 * (le coût d'une action, déjà connu au plan, n'est pas un impact).
 */
const from = (source: Factor['source'], label: string) => (f: Factor) =>
  f.source === source && f.label.startsWith(`${label} : `) && !f.label.endsWith(' : coût');

/** Effets d'un imprévu : événement, ou aléa d'action (« Action — aléa : … »). */
const eventFactor = (event: ReportEvent) => (f: Factor) =>
  event.kind === 'risque'
    ? f.source === 'risque' && f.label.includes(` — ${event.label} : `)
    : from('evenement', event.label)(f);

const isMainPoll = (poll: Poll) => poll.kind !== 'popularite' && !poll.id.endsWith('-hypothese-t2');

function Delta({ ressource, delta }: Impact) {
  const tone =
    delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400';
  return (
    <span className={`whitespace-nowrap ${tone}`}>
      <span aria-hidden="true" className="mr-0.5 text-[0.7em]">
        {delta > 0 ? '▲' : '▼'}
      </span>
      {RESOURCE_LABELS[ressource]} {formatDelta(ressource, delta)}
    </span>
  );
}

function Impacts({ impacts }: { impacts: Impact[] }) {
  if (impacts.length === 0)
    return <p className="text-xs text-slate-600 dark:text-slate-400">Sans effet mesurable.</p>;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold">
      {impacts.map((i) => (
        <Delta key={i.ressource} {...i} />
      ))}
    </p>
  );
}

const section = 'space-y-2 rounded-card border border-slate-200/80 p-4 dark:border-slate-800';
const title = 'text-base font-bold';

export function WeeklyDebrief({
  report,
  state,
  gameId,
  eventFamily = () => null,
  onClose,
}: {
  report: WeeklyReport;
  state: GameState;
  gameId: string;
  eventFamily?: (refId: string) => EventFamily | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const playerId = state.player.actorId;
  const nameOf = (actorId: string) => {
    const actor = state.actors[actorId];
    return actor ? candidateName(actor.candidate) : actorId;
  };

  // Ouverture : focus sur la fenêtre, page figée ; fermeture : focus rendu à son auteur.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // Clavier : Échap ferme ; Tab reste dans la fenêtre.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = [
      ...dialog.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const own = playerId ? report.actions.filter((a) => a.actorId === playerId) : [];
  const done = groupActions(own.filter((a) => a.status === 'validee'));
  const rejected = own.filter((a) => a.status === 'rejetee');
  const summary = playerId
    ? SUMMARY.map((ressource) => {
        const change = report.changes.find(
          (c) => c.actorId === playerId && c.ressource === ressource,
        );
        return { ressource, delta: change ? change.after - change.before : 0 };
      }).filter((i) => i.delta !== 0)
    : [];
  const unexpected = report.events;
  const decisionsImpact = playerId
    ? impactOf(report, playerId, (f) => f.source === 'decision')
    : [];
  const opponents = new Map<string, ActionOutcome[]>();
  for (const a of report.actions)
    if (a.actorId !== playerId && a.status === 'validee')
      opponents.set(a.actorId, [...(opponents.get(a.actorId) ?? []), a]);
  const polls = report.polls.filter(isMainPoll);
  const pendingDecisions = report.events.filter((e) => e.decisionId !== null).length;

  // Portail sur le corps du document : aucun parent animé ne peut le placer sous la navigation.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-apparait items-stretch justify-center bg-slate-950/70 sm:items-center sm:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-3xl animate-feuille flex-col bg-white outline-none sm:max-h-[90vh] sm:rounded-dossier sm:shadow-raised dark:bg-slate-900"
      >
        <header className="relative shrink-0 border-b border-slate-200 px-4 pt-[calc(1rem+var(--sat))] pb-4 sm:px-6 sm:pt-6 dark:border-slate-800">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1.5">
            <span className="flex-1 bg-republique-500" />
            <span className="flex-1 bg-white" />
            <span className="flex-1 bg-red-500" />
          </span>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Semaine du {formatGameDate(report.date)}
          </p>
          <h2 id={titleId} className="font-display text-3xl leading-tight font-extrabold">
            Débriefing de la semaine {report.week}
          </h2>
          {summary.length > 0 && (
            <ul
              aria-label="Votre semaine en bref"
              className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold"
            >
              {summary.map((i) => (
                <li key={i.ressource}>
                  <Delta {...i} />
                </li>
              ))}
            </ul>
          )}
        </header>

        <div
          role="region"
          aria-label="Détail de la semaine"
          tabIndex={0}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-republique-500 focus-visible:ring-inset sm:px-6"
        >
          {playerId && (
            <section aria-labelledby={`${titleId}-actions`} className={section}>
              <h3 id={`${titleId}-actions`} className={title}>
                Vos actions et leur impact
              </h3>
              {done.length === 0 && rejected.length === 0 && (
                <p className="text-slate-600 dark:text-slate-400">Aucune action cette semaine.</p>
              )}
              <ul className="space-y-3">
                {done.map((group) => {
                  const [first] = group;
                  const impacts = impactOf(report, playerId, from('action', first!.label));
                  return (
                    <li key={first!.label} className="space-y-1">
                      <p className="font-semibold">
                        {first!.label}
                        {group.length > 1 && ` (×${group.length})`}
                        {first!.cible && (
                          <span className="font-normal text-slate-600 dark:text-slate-400">
                            {' '}
                            — {group.map((a) => a.cible).join(', ')}
                          </span>
                        )}
                      </p>
                      <Impacts impacts={impacts} />
                      {group.map(
                        (a) =>
                          a.prestation && (
                            <PrestationDetail key={a.index} prestation={a.prestation} />
                          ),
                      )}
                    </li>
                  );
                })}
                {rejected.map((a) => (
                  <li key={a.index}>
                    <Badge tone="danger">Rejetée</Badge> {a.label} — {a.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby={`${titleId}-imprevus`} className={section}>
            <h3 id={`${titleId}-imprevus`} className={title}>
              Imprévus et décisions
            </h3>
            {unexpected.length === 0 && report.decisions.length === 0 && (
              <p className="text-slate-600 dark:text-slate-400">Aucun imprévu cette semaine.</p>
            )}
            <ul className="space-y-3">
              {unexpected.map((event) => (
                <li key={event.id} className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={event.nature === 'fictif' ? 'fictif' : 'simule'}>
                      {event.kind === 'risque' ? 'Aléa simulé' : 'Événement fictif'}
                    </Badge>
                    {eventFamily(event.refId) && (
                      <Badge>{EVENT_FAMILY_LABELS[eventFamily(event.refId)!]}</Badge>
                    )}
                    <span className="font-semibold">{event.label}</span>
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">{event.description}</p>
                  {playerId && <Impacts impacts={impactOf(report, playerId, eventFactor(event))} />}
                </li>
              ))}
              {report.decisions.map((decision) => (
                <li key={decision.decisionId}>
                  <Badge>Décision</Badge> {decision.label}
                  {decision.automatic && ' (option par défaut)'}
                </li>
              ))}
            </ul>
            {decisionsImpact.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold">Effet de vos décisions</p>
                <Impacts impacts={decisionsImpact} />
              </div>
            )}
            {pendingDecisions > 0 && (
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                {pendingDecisions === 1
                  ? 'Une décision vous attend avant la semaine prochaine.'
                  : `${pendingDecisions} décisions vous attendent avant la semaine prochaine.`}
              </p>
            )}
          </section>

          {opponents.size > 0 && (
            <section aria-labelledby={`${titleId}-adversaires`} className={section}>
              <h3 id={`${titleId}-adversaires`} className={title}>
                Initiatives adverses
              </h3>
              <ul className="space-y-1">
                {[...opponents].map(([actorId, actions]) => (
                  <li key={actorId}>
                    <span className="font-semibold">{nameOf(actorId)}</span> :{' '}
                    {groupActions(actions)
                      .map(
                        (group) =>
                          `${group[0]!.label}${group.length > 1 ? ` ×${group.length}` : ''}${group
                            .filter((a) => a.prestation)
                            .map(
                              (a) => ` (${PRESTATION_LABELS[a.prestation!.niveau].toLowerCase()})`,
                            )
                            .join('')}`,
                      )
                      .join(' ; ')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby={`${titleId}-sondages`} className={section}>
            <h3 id={`${titleId}-sondages`} className={title}>
              Sondages de la semaine
            </h3>
            {polls.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400">
                Aucun sondage d’intentions publié cette semaine.
              </p>
            ) : (
              <ul className="space-y-2">
                {polls.map((poll) => {
                  const ranked = [...poll.results].sort((a, b) => b.value - a.value);
                  const mine = ranked.findIndex((r) => r.actorId === playerId);
                  const shown = mine >= 0 ? [ranked[mine]!] : ranked.slice(0, 3);
                  return (
                    <li key={poll.id}>
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone="simule">Sondage simulé</Badge>
                        <span className="font-semibold">
                          {POLL_KIND_LABELS[poll.kind]} — {poll.institute}
                        </span>
                      </p>
                      <p>
                        {shown
                          .map(
                            (r) =>
                              `${r.actorId === playerId ? `Vous (${mine === 0 ? '1er' : `${mine + 1}e`} sur ${ranked.length})` : nameOf(r.actorId)} : ${formatShare(r.value)}, ${formatPollDelta(r.variation)}${r.variation === null ? ' (première vague)' : ' depuis la vague précédente'}`,
                          )
                          .join(' ; ')}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 pt-3 pb-[calc(0.75rem+var(--sab))] sm:px-6 sm:pb-4 dark:border-slate-800">
          {polls.length > 0 && (
            <Link to={`/parties/${gameId}/sondages`} className={buttonSecondary} onClick={onClose}>
              Pourquoi les sondages bougent
            </Link>
          )}
          <button type="button" className={buttonPrimary} onClick={onClose}>
            Continuer
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
