import {
  candidateName,
  implantationTier,
  type ActionOutcome,
  type EventFamily,
  type Factor,
  type Famille,
  type GameState,
  type Poll,
  type ReportEvent,
  type ResourceKey,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play } from 'lucide-react';
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
import { useCue } from '../audio/hooks';
import { sound } from '../audio/systeme';
import { Badge } from '../components/Badge';
import { CampaignTeam } from '../components/CampaignTeam';
import { boutonCraie, boutonOr } from '../components/ui';
import { useCountUp } from '../components/useCountUp';
import { useModal } from '../components/useModal';
import { candidacies, CandidaciesSection, withoutCandidacies } from '../components/Candidacies';
import { PrestationDetail } from '../components/WeeklyReportView';
import { BOARD_VIEWBOX, type BoardShape } from './geometry';
import { paintDepartment } from './readings';

// Verdict de la semaine (phase 25, maquette validée ; ancien débriefing de la phase 11) : plein
// écran sur la feutrine, ouvert après « Jouer la semaine ». « Le verdict » en lettres dorées, la
// carte avec les gains d'implantation qui flottent sur les départements joués, les tuiles des
// cartes qui se retournent une à une (la suivante hachurée « ? »), la bannière dorée des combos,
// les paliers franchis, la carte « Votre sondage » avant → après, puis le reste du bilan. Un
// toucher affiche tout ; mouvement réduit : tout d'un coup. Il ne montre que le bilan calculé par
// le moteur, sans rien recalculer.

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
    : event.refId === 'suivi-decision'
      ? // Phase 25 ter : le bilan d'une décision ministérielle, au registre des décisions.
        f.source === 'decision' && f.label.startsWith(`${event.label} — bilan `)
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
  if (impacts.length === 0) return <p className="text-xs text-encre-2">Sans effet mesurable.</p>;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold">
      {impacts.map((i) => (
        <Delta key={i.ressource} {...i} />
      ))}
    </p>
  );
}

/**
 * Variation d'une ressource en tête du débriefing : le chiffre défile jusqu'à la valeur du
 * moteur (texte final seul lu par les lecteurs d'écran).
 */
function BriefDelta({ ressource, delta, index }: Impact & { index: number }) {
  const progress = useCountUp(900, 250 + index * 90);
  const text = formatDelta(ressource, Math.round(delta * progress));
  // Le signe en caractères de l'interface : les filets du Didone l'effaceraient presque.
  const sign = /^[+−-]/.test(text) ? text.charAt(0) : '';
  return (
    <>
      <span className="sr-only">
        {RESOURCE_LABELS[ressource]} {formatDelta(ressource, delta)}
      </span>
      <span
        aria-hidden="true"
        className="block truncate text-[0.7rem] font-bold text-encre-carton-2"
      >
        {RESOURCE_LABELS[ressource]}
      </span>{' '}
      <span
        aria-hidden="true"
        className={`block font-display text-xl leading-tight font-extrabold whitespace-nowrap tabular-nums ${
          delta > 0 ? 'text-gain' : 'text-perte'
        }`}
      >
        <span className="mr-0.5 font-sans text-[0.8em] font-bold">{sign}</span>
        {text.slice(sign.length)}
      </span>
    </>
  );
}

/** La feuille de papier (thème clair ou nuit) posée sur la feutrine : le bilan détaillé. */
const sheet =
  'rounded-plateau bg-papier p-3 text-encre shadow-carte sm:p-4 dark:bg-slate-900 dark:text-slate-100';
const section =
  'space-y-2 rounded-card border border-slate-200/90 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]';
const title = 'text-lg';
/** Sections du spectacle : à même la feutrine, titres à la craie. */
const stage = 'space-y-2';
const stageTitle = 'font-display text-lg font-extrabold text-craie';

/** Effet d'une carte en tuile : couleurs lisibles sur le carton, de jour comme de nuit. */
function TileImpacts({ impacts }: { impacts: Impact[] }) {
  if (impacts.length === 0)
    return <p className="text-xs text-encre-carton-2">Sans effet mesurable.</p>;
  return (
    <p className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-sm font-extrabold">
      {impacts.map((i) => (
        <span
          key={i.ressource}
          className={`whitespace-nowrap ${i.delta > 0 ? 'text-gain' : 'text-perte'}`}
        >
          {RESOURCE_LABELS[i.ressource]} {formatDelta(i.ressource, i.delta)}
        </span>
      ))}
    </p>
  );
}

/**
 * La carte de la semaine : les départements à leur implantation d'après la semaine, et le gain
 * d'implantation qui flotte sur chaque département joué (dévoilé avec sa carte).
 */
function VerdictMap({
  shapes,
  state,
  ruleset,
  chips,
}: {
  shapes: readonly BoardShape[];
  state: GameState;
  ruleset: Ruleset;
  chips: { code: string; text: string }[];
}) {
  const [x, y, width, height] = BOARD_VIEWBOX;
  return (
    <div className="relative mx-auto aspect-[1000/1180] w-full max-w-[calc(34dvh*1000/1180)]">
      <svg
        viewBox={`${x} ${y} ${width} ${height}`}
        role="img"
        aria-label="Votre implantation par département après la semaine"
        className="absolute inset-0 h-full w-full"
      >
        {shapes.map((shape) => (
          <path
            key={shape.code}
            d={shape.d}
            className={`${paintDepartment(state, ruleset, 'implantation', shape.code).fillClass} stroke-trait`}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {chips.map((chip) => {
        const anchor = shapes.find((s) => s.code === chip.code);
        if (!anchor) return null;
        return (
          <span
            key={chip.code}
            aria-hidden="true"
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 animate-tampon rounded-full border-2 border-sur-or bg-or px-2 py-0.5 font-display text-xs font-extrabold whitespace-nowrap text-sur-or shadow-pion"
            style={{
              left: `${Math.min(85, Math.max(15, (anchor.label[0] / width) * 100))}%`,
              top: `${(anchor.label[1] / height) * 100}%`,
            }}
          >
            {chip.text}
          </span>
        );
      })}
    </div>
  );
}

const FAMILY_BAND: Record<Famille, string> = {
  terrain: 'bg-famille-terrain',
  medias: 'bg-famille-medias',
  numerique: 'bg-famille-numerique',
  organisation: 'bg-famille-organisation',
};

/** Délai entre deux cartes retournées (le toucher ou le mouvement réduit l'abolit). */
export const VERDICT_STEP_MS = 520;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Verdict({
  report,
  state,
  gameId,
  ruleset,
  eventFamily = () => null,
  achievement = () => null,
  shapes = null,
  onDone,
}: {
  report: WeeklyReport;
  state: GameState;
  gameId: string;
  /** Jeu de règles (noms des départements) ; facultatif. */
  ruleset?: Ruleset | undefined;
  eventFamily?: (refId: string) => EventFamily | null;
  /** Libellé et description d'un succès du jeu de règles (phase 15). */
  achievement?: (id: string) => { libelle: string; description: string } | null;
  /** Formes des départements (la carte du verdict) ; sans elles, pas de carte. */
  shapes?: readonly BoardShape[] | null;
  onDone: () => void;
}) {
  const onClose = onDone;
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const playerId = state.player.actorId;
  const nameOf = (actorId: string) => {
    const actor = state.actors[actorId];
    return actor ? candidateName(actor.candidate) : actorId;
  };

  // Focus pris puis rendu, page figée, Échap et Tab confinés (fenêtre modale).
  const onKeyDown = useModal(dialog, onClose);

  const own = playerId ? report.actions.filter((a) => a.actorId === playerId) : [];
  const summary = playerId
    ? SUMMARY.map((ressource) => {
        const change = report.changes.find(
          (c) => c.actorId === playerId && c.ressource === ressource,
        );
        return { ressource, delta: change ? change.after - change.before : 0 };
      }).filter((i) => i.delta !== 0)
    : [];
  // Phase 23 : les annonces de candidature ont leur propre section.
  const candidacy = candidacies(report.events);
  const unexpected = withoutCandidacies(report.events, candidacy);
  // Son (phase 19) : un événement majeur dans la semaine s'annonce par le jingle d'une nouvelle.
  // Phase 21 : sinon, le coup de tampon de la semaine bouclée.
  useCue(unexpected.some((e) => e.majeur) ? 'flash' : 'tampon');
  const decisionsImpact = playerId
    ? impactOf(report, playerId, (f) => f.source === 'decision')
    : [];
  const opponents = new Map<string, ActionOutcome[]>();
  for (const a of report.actions)
    if (a.actorId !== playerId && a.status === 'validee')
      opponents.set(a.actorId, [...(opponents.get(a.actorId) ?? []), a]);
  const polls = report.polls.filter(isMainPoll);
  const pendingDecisions = report.events.filter((e) => e.decisionId !== null).length;

  // Phase 25 : séquence du verdict. Les cartes du joueur, dans l'ordre du plan, puis combos,
  // paliers, sondage, et le reste du bilan ; tout d'un coup au toucher ou en mouvement réduit.
  const cards = [...own].sort((a, b) => a.index - b.index);
  const combos = report.combos.filter((c) => c.actorId === playerId);
  const tiers = report.implantation
    .filter((c) => c.actorId === playerId)
    .filter((c) => implantationTier(c.before).id !== implantationTier(c.after).id);
  const total = cards.length + 4;
  const [step, setStep] = useState(() => (prefersReducedMotion() ? total : 0));
  const comboPlayed = useRef(false);
  useEffect(() => {
    if (step >= total) return;
    const timer = setTimeout(() => setStep((s) => s + 1), VERDICT_STEP_MS);
    return () => clearTimeout(timer);
  }, [step, total]);
  useEffect(() => {
    // Bruitages (phase 25) : chaque carte retournée claque ; un combo résonne une fois.
    if (step >= 1 && step <= cards.length && step < total) sound().play('retourner');
    if (step > cards.length && combos.length > 0 && !comboPlayed.current) {
      comboPlayed.current = true;
      sound().play('combo');
    }
  }, [step, cards.length, combos.length, total]);
  const showAll = () => setStep(total);
  const shown = (n: number) => step > n;
  const depName = (code: string) => {
    const dep = ruleset?.parrainages.reservoir.departements[code];
    return dep ? `${dep.nom} (${code})` : code;
  };
  const mainPoll = polls[0];
  const mine = mainPoll?.results.find((r) => r.actorId === playerId);
  const myRank = mainPoll
    ? [...mainPoll.results]
        .sort((a, b) => b.value - a.value)
        .findIndex((r) => r.actorId === playerId) + 1
    : 0;
  const leader = mainPoll ? Math.max(...mainPoll.results.map((r) => r.value), 1) : 1;
  // Gains d'implantation par département joué, dévoilés avec la première carte qui le vise.
  // Le bilan porte la cible en libellé (« Finistère (29) ») : son code vient du jeu de règles.
  const departements = ruleset?.parrainages.reservoir.departements ?? {};
  const codeOf = (cible: string | null) =>
    cible === null
      ? undefined
      : cible in departements
        ? cible
        : Object.entries(departements).find(([code, d]) => `${d.nom} (${code})` === cible)?.[0];
  const ownImplantation = report.implantation.filter((c) => c.actorId === playerId);
  const chips = cards.flatMap((a, i) => {
    const code = codeOf(a.cible);
    if (!shown(i) || !code || cards.findIndex((c) => c.cible === a.cible) !== i) return [];
    const change = ownImplantation.find((c) => c.departement === code);
    if (!change || change.after === change.before) return [];
    const delta = change.after - change.before;
    return [{ code, text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)} implantation` }];
  });

  // Portail sur le corps du document : aucun parent animé ne peut le placer sous la navigation.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-apparait items-stretch justify-center bg-feutrine-3/80 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="feutrine flex w-full max-w-3xl animate-feuille flex-col overflow-hidden text-craie outline-none sm:max-h-[92vh] sm:rounded-plateau sm:shadow-plateau"
      >
        <header className="shrink-0 px-4 pt-[calc(1rem+var(--sat))] pb-2 text-center sm:px-6 sm:pt-6">
          <p className="font-display text-base font-extrabold text-craie-2">
            Semaine {report.week}
            <span className="ml-2 font-sans text-xs font-semibold">
              du {formatGameDate(report.date)}
            </span>
          </p>
          <h2
            id={titleId}
            className="font-display text-[2.75rem] leading-none font-extrabold text-or [text-shadow:0_3px_0_var(--color-or-ombre)] sm:text-6xl"
          >
            <span className="sr-only">Verdict de la semaine {report.week}</span>
            <span aria-hidden="true">Le verdict</span>
          </h2>
        </header>

        <div
          role="region"
          aria-label="Détail de la semaine"
          tabIndex={0}
          onPointerDown={step < total ? showAll : undefined}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pt-2 pb-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-or focus-visible:ring-inset sm:px-6"
        >
          {shapes && ruleset && playerId && (
            <div className="rounded-plateau bg-carton p-3 shadow-plateau">
              <VerdictMap shapes={shapes} state={state} ruleset={ruleset} chips={chips} />
            </div>
          )}

          {summary.length > 0 && (
            <ul
              aria-label="Votre semaine en bref"
              className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2"
            >
              {summary.map((i, index) => (
                <li
                  key={i.ressource}
                  className="min-w-0 rounded-xl bg-carton px-2.5 py-1.5 text-encre-carton shadow-carte"
                >
                  <BriefDelta {...i} index={index} />
                </li>
              ))}
            </ul>
          )}

          {playerId && (
            <section aria-labelledby={`${titleId}-actions`} className={stage}>
              <h3 id={`${titleId}-actions`} className={stageTitle}>
                Vos cartes de la semaine
              </h3>
              {cards.length === 0 && (
                <p className="text-craie-2">Aucune carte jouée cette semaine.</p>
              )}
              <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {cards.map((a, i) => {
                  const famille = ruleset?.actions.find((d) => d.id === a.actionId)?.famille;
                  return shown(i) ? (
                    <li
                      key={a.index}
                      className="flex animate-revele flex-col overflow-hidden rounded-2xl border-2 border-bord-carte bg-carton text-encre-carton shadow-carte"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 ${famille ? FAMILY_BAND[famille] : 'bg-encre-carton'}`}
                      />
                      <span className="flex flex-1 flex-col gap-1 p-2.5">
                        <span className="font-display text-[0.95rem] leading-tight font-extrabold">
                          {a.label}
                        </span>
                        {a.cible && (
                          <span className="text-xs text-encre-carton-2">{depName(a.cible)}</span>
                        )}
                        {a.status === 'validee' ? (
                          <TileImpacts
                            impacts={impactOf(report, playerId, from('action', a.label))}
                          />
                        ) : (
                          <span className="text-xs">
                            <span className="mr-1 rounded bg-famille-medias px-1.5 font-extrabold text-white">
                              Refusée
                            </span>
                            {a.reason}
                          </span>
                        )}
                      </span>
                    </li>
                  ) : (
                    <li
                      key={a.index}
                      aria-hidden="true"
                      className="grid min-h-24 place-items-center rounded-2xl border-2 border-dashed border-craie-2/60 bg-feutrine-2 bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgb(255_255_255/0.07)_8px_16px)] font-display text-3xl font-extrabold text-craie-2"
                    >
                      ?
                    </li>
                  );
                })}
              </ol>
              {cards.some((a, i) => shown(i) && a.prestation) && (
                <div className={`${sheet} space-y-3`}>
                  {cards.map((a, i) =>
                    shown(i) && a.prestation ? (
                      <div key={a.index} className="space-y-1">
                        <p className="text-xs font-bold">Passage « {a.label} »</p>
                        <PrestationDetail prestation={a.prestation} />
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </section>
          )}

          {shown(cards.length) && combos.length > 0 && (
            <section aria-labelledby={`${titleId}-combos`} className={stage}>
              <h3 id={`${titleId}-combos`} className="sr-only">
                Combos
              </h3>
              <ul className="space-y-2">
                {combos.map((c, i) => (
                  <li
                    key={`${c.kind}-${i}`}
                    className="animate-banniere rounded-2xl border-[3px] border-sur-or bg-or px-4 py-2.5 text-center text-sur-or shadow-[0_5px_0_0_var(--color-or-ombre)]"
                  >
                    <span aria-hidden="true" className="block text-xs font-extrabold uppercase">
                      Combo
                    </span>
                    <span className="block font-display text-lg leading-tight font-extrabold uppercase">
                      {c.libelle}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {shown(cards.length + 1) && tiers.length > 0 && (
            <section
              aria-labelledby={`${titleId}-paliers`}
              className="space-y-1.5 rounded-2xl bg-carton p-3 text-encre-carton shadow-carte"
            >
              <h3 id={`${titleId}-paliers`} className="font-display text-base font-extrabold">
                Départements qui changent de palier
              </h3>
              <ul className="space-y-0.5">
                {tiers.map((c) => (
                  <li key={c.departement}>
                    <span className="font-semibold">{depName(c.departement)}</span> :{' '}
                    {implantationTier(c.before).libelle} → {implantationTier(c.after).libelle} (
                    {c.after - c.before > 0 ? '+' : '−'}
                    {Math.abs(c.after - c.before)})
                  </li>
                ))}
              </ul>
            </section>
          )}

          {shown(cards.length + 2) && mainPoll && mine && (
            <section
              aria-labelledby={`${titleId}-verdict-sondage`}
              className="animate-revele space-y-2 rounded-2xl bg-carton p-3 text-encre-carton shadow-carte"
            >
              <h3 id={`${titleId}-verdict-sondage`} className="sr-only">
                Le sondage dévoilé
              </h3>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0">
                  <span className="block text-xs font-bold text-encre-carton-2">Votre sondage</span>
                  <span className="font-display text-2xl leading-tight font-extrabold tabular-nums">
                    {mine.variation === null
                      ? formatShare(mine.value)
                      : `${formatShare(mine.value - mine.variation)} → ${formatShare(mine.value)}`}
                  </span>
                </p>
                {mine.variation !== null && mine.variation !== 0 && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-display text-sm font-extrabold tabular-nums text-white ${
                      mine.variation > 0 ? 'bg-famille-terrain' : 'bg-famille-medias'
                    }`}
                  >
                    {formatPollDelta(mine.variation)}
                  </span>
                )}
              </div>
              <span
                aria-hidden="true"
                className="relative block h-3 overflow-hidden rounded-full bg-carton-2"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-or"
                  style={{ width: `${Math.min(100, (mine.value / leader) * 100)}%` }}
                />
                {mine.variation !== null && (
                  <span
                    className="absolute inset-y-0 w-0.5 bg-encre-carton"
                    style={{
                      left: `${Math.min(100, Math.max(0, ((mine.value - mine.variation) / leader) * 100))}%`,
                    }}
                  />
                )}
              </span>
              <p className="text-xs text-encre-carton-2">
                {myRank === 1 ? '1er' : `${myRank}e`} sur {mainPoll.results.length} (barre : la part
                du premier), {mainPoll.institute}, sondage simulé
              </p>
            </section>
          )}

          {shown(cards.length + 3) && (
            <div className={`${sheet} space-y-4`}>
              {/* Phase 20 : l'équipe de campagne résume la semaine, le détail suit. */}
              <CampaignTeam report={report} state={state} />

              {report.succes.length > 0 && (
                <section
                  aria-labelledby={`${titleId}-succes`}
                  className="space-y-2 rounded-card border-[1.5px] border-slate-900 bg-or-100 p-4 shadow-dore dark:border-dorure dark:bg-dorure/[0.08]"
                >
                  <h3 id={`${titleId}-succes`} className={title}>
                    {report.succes.length > 1 ? 'Succès débloqués' : 'Succès débloqué'}
                  </h3>
                  <ul className="space-y-1">
                    {report.succes.map((id) => {
                      const a = achievement(id);
                      return (
                        <li key={id}>
                          <span className="font-semibold">{a?.libelle ?? id}</span>
                          {a && <span className="text-encre-2"> — {a.description}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <CandidaciesSection
                candidacy={candidacy}
                nameOf={nameOf}
                playerId={playerId}
                className={section}
                headingClass={`${title} flex flex-wrap items-center gap-2`}
              />

              <section aria-labelledby={`${titleId}-imprevus`} className={section}>
                <h3 id={`${titleId}-imprevus`} className={title}>
                  Imprévus et décisions
                </h3>
                {unexpected.length === 0 && report.decisions.length === 0 && (
                  <p className="text-encre-2">Aucun imprévu cette semaine.</p>
                )}
                <ul className="space-y-3">
                  {unexpected.map((event) => (
                    <li key={event.id} className="space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={event.nature === 'fictif' ? 'fictif' : 'simule'}>
                          {event.kind === 'risque'
                            ? 'Aléa simulé'
                            : event.nature === 'fictif'
                              ? 'Événement fictif'
                              : 'Fait simulé'}
                        </Badge>
                        {eventFamily(event.refId) && (
                          <Badge>{EVENT_FAMILY_LABELS[eventFamily(event.refId)!]}</Badge>
                        )}
                        {/* Phase 25 ter : bilan d'une décision ministérielle (journal de mandat). */}
                        {event.refId === 'suivi-decision' && <Badge>Suivi de décision</Badge>}
                        <span className="font-semibold">{event.label}</span>
                      </p>
                      {/* Phase 20 : un événement en chaîne rappelle celui dont il découle. */}
                      {event.suiteDe && (
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Suite de « {event.suiteDe} »
                        </p>
                      )}
                      <p className="text-encre-2">{event.description}</p>
                      {playerId && (
                        <Impacts impacts={impactOf(report, playerId, eventFactor(event))} />
                      )}
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

              {report.conseil && (
                <section aria-labelledby={`${titleId}-conseil`} className={section}>
                  <h3 id={`${titleId}-conseil`} className={title}>
                    Conseil des ministres
                  </h3>
                  <p className="text-encre-2">
                    {report.conseil.ministres.length} membre(s) du gouvernement suivi(s) :
                    popularité prêtée et loyauté (hypothèses du jeu).
                  </p>
                  {report.conseil.departs.length > 0 && (
                    <ul className="space-y-0.5">
                      {report.conseil.departs.map((d) => (
                        <li key={d.ref}>
                          <Badge tone="danger">Départ</Badge> {d.motif}
                        </li>
                      ))}
                    </ul>
                  )}
                  {report.conseil.alertes.length > 0 && (
                    <ul className="space-y-0.5 text-amber-800 dark:text-amber-300">
                      {report.conseil.alertes.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

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
                                  (a) =>
                                    ` (${PRESTATION_LABELS[a.prestation!.niveau].toLowerCase()})`,
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
                {!(mainPoll && mine) && polls.length > 0 && (
                  <Link
                    to={`/parties/${gameId}/sondages`}
                    className="text-sm font-bold underline"
                    onClick={onClose}
                  >
                    Pourquoi les sondages bougent
                  </Link>
                )}
                {polls.length === 0 ? (
                  <p className="text-encre-2">Aucun sondage d’intentions publié cette semaine.</p>
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
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-feutrine-3/60 px-4 pt-3 pb-[calc(0.75rem+var(--sab))] sm:justify-end sm:px-6 sm:pb-4">
          {step < total && (
            <button type="button" className={`${boutonCraie} px-3`} onClick={showAll}>
              Tout afficher
            </button>
          )}
          <button
            type="button"
            className={`${boutonOr} min-h-14 flex-1 px-8 text-lg sm:flex-none`}
            onClick={onClose}
          >
            Semaine suivante
            <Play aria-hidden="true" className="size-5 fill-current" />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
