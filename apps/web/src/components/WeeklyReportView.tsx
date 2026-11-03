import {
  candidateName,
  type EconomyChange,
  type EventFamily,
  type GameState,
  type Prestation,
  type ResourceChange,
  type WeeklyReport,
} from '@r2027/shared';
import {
  DATA_STATUS_LABELS,
  EVENT_FAMILY_LABELS,
  FACTOR_SOURCE_LABELS,
  formatDelta,
  formatGameDate,
  formatIndicator,
  formatIndicatorDelta,
  formatPoints,
  formatRatio,
  formatResource,
  INDICATOR_LABELS,
  PHASE_LABELS,
  POSTURE_LABELS,
  PRESTATION_LABELS,
  RESOURCE_LABELS,
} from '../labels';
import { Badge } from './Badge';
import { CampaignReport } from './CampaignReport';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const PRESTATION_TONES = { reussie: 'succes', correcte: 'neutre', ratee: 'danger' } as const;

/**
 * Passage dans les médias (phase 11) : niveau, posture, format et raisons du score, sans tirage
 * au sort ; la somme des raisons donne le score (borné entre −100 et +100).
 */
export function PrestationDetail({ prestation }: { prestation: Prestation }) {
  return (
    <div className="w-full basis-full space-y-1 rounded-lg bg-slate-50 p-2 pl-3 dark:bg-slate-800/60">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={PRESTATION_TONES[prestation.niveau]}>
          {PRESTATION_LABELS[prestation.niveau]}
        </Badge>
        <span>
          Posture {POSTURE_LABELS[prestation.posture]}
          {prestation.choisie ? '' : ' (par défaut)'}, {prestation.format.toLowerCase()} : score{' '}
          <strong className="tabular-nums">{formatPoints(prestation.score)}</strong> sur 100
          {prestation.incident && ' : passage raté, l’aléa de l’action se produit'}.
        </span>
      </p>
      <ul className="text-xs text-slate-600 dark:text-slate-400" aria-label="Raisons du score">
        {prestation.raisons.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span>{r.label}</span>
            <span className="shrink-0 tabular-nums">{formatPoints(r.valeur)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangesList({
  changes,
  names,
}: {
  changes: ResourceChange[];
  names?: (actorId: string) => string;
}) {
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {changes.map((change) => (
        <li key={`${change.actorId}-${change.ressource}`}>
          <details>
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-3 py-2">
              <span className="font-medium">
                {names && `${names(change.actorId)} — `}
                {RESOURCE_LABELS[change.ressource]}
              </span>
              <span>
                {formatResource(change.ressource, change.before)} →{' '}
                {formatResource(change.ressource, change.after)}{' '}
                <span className="font-semibold">
                  ({formatDelta(change.ressource, change.after - change.before)})
                </span>
              </span>
            </summary>
            <table className="mx-3 mb-3 w-[calc(100%-1.5rem)] text-left text-xs">
              <caption className="sr-only">
                Facteurs de la variation de {RESOURCE_LABELS[change.ressource]}
              </caption>
              <thead>
                <tr className="text-slate-500 dark:text-slate-400">
                  <th scope="col" className="py-1 font-medium">
                    Facteur
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Origine
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Effet
                  </th>
                </tr>
              </thead>
              <tbody>
                {change.factors.map((factor, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-2">{factor.label}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {FACTOR_SOURCE_LABELS[factor.source]}
                    </td>
                    <td className="py-1 text-right whitespace-nowrap">
                      {formatDelta(change.ressource, factor.value)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 font-semibold dark:border-slate-700">
                  <td className="py-1" colSpan={2}>
                    Total
                  </td>
                  <td className="py-1 text-right">
                    {formatDelta(change.ressource, sum(change.factors.map((f) => f.value)))}
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
        </li>
      ))}
    </ul>
  );
}

const ECONOMY_SOURCE_LABELS: Record<EconomyChange['factors'][number]['source'], string> = {
  conjoncture: 'Conjoncture (modèle de jeu)',
  reforme: 'Réforme',
  crise: 'Crise fictive',
  decision: 'Décision',
  differe: 'Effet différé',
  limite: 'Borne',
  durable: 'Conséquence durable',
  action: 'Action du chef de l’État',
  gouvernement: 'Ministre du domaine',
};

/** Variations des indicateurs économiques de la semaine (quinquennat), avec leurs facteurs. */
function EconomyChanges({ changes }: { changes: EconomyChange[] }) {
  return (
    <section aria-label="Économie de la semaine">
      <h3 className="mb-2 flex flex-wrap items-center gap-2 font-semibold">
        Économie <Badge tone="simule">Simulation</Badge>
      </h3>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {changes.map((change) => (
          <li key={change.indicateur}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <span className="font-medium">{INDICATOR_LABELS[change.indicateur].label}</span>
                <span>
                  {formatIndicator(change.indicateur, change.before)} →{' '}
                  {formatIndicator(change.indicateur, change.after)}{' '}
                  <span className="font-semibold">
                    ({formatIndicatorDelta(change.after - change.before)})
                  </span>
                </span>
              </summary>
              <ul className="mx-3 mb-3 space-y-0.5 text-xs">
                {change.factors.map((factor, i) => (
                  <li key={i}>
                    {factor.label} ({ECONOMY_SOURCE_LABELS[factor.source]}) :{' '}
                    {formatIndicatorDelta(factor.value)}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Bilan hebdomadaire : chaque variation est détaillée par les facteurs du moteur (§13).
 * Les actions et variations du joueur sont séparées de celles des campagnes adverses.
 */
export function WeeklyReportView({
  report,
  state,
  proposalLabel,
  blocLabel = (id) => id,
  eventFamily = () => null,
}: {
  report: WeeklyReport;
  state?: GameState;
  /** Libellé d'une proposition du programme (jeu de règles chargé), sinon son identifiant. */
  proposalLabel?: (id: string) => string;
  /** Libellé d'un bloc des législatives (jeu de règles chargé), sinon son identifiant. */
  blocLabel?: (id: string) => string;
  /** Famille d'un événement de campagne (jeu de règles chargé), sinon null. */
  eventFamily?: (refId: string) => EventFamily | null;
}) {
  const playerId = state?.player.actorId ?? null;
  const nameOf = (actorId: string) => {
    const actor = state?.actors[actorId];
    return actor ? candidateName(actor.candidate) : actorId;
  };
  const ownActions = report.actions.filter((a) => a.actorId === playerId);
  const otherActions = report.actions.filter((a) => a.actorId !== playerId);
  const ownChanges = report.changes.filter((c) => c.actorId === playerId);
  const otherChanges = report.changes.filter((c) => c.actorId !== playerId);
  const election = report.election;

  return (
    <div className="space-y-5 text-sm">
      {report.blocked && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          {report.blocked.message}
        </p>
      )}

      {election && (
        <section
          aria-label="Scrutin de la semaine"
          className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950"
        >
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            {election.round === 1 ? 'Premier tour' : 'Second tour'} de l’élection présidentielle
            <Badge tone="simule">Résultat simulé</Badge>
          </h3>
          <p>
            Participation {formatRatio(election.votants, election.inscrits)}.{' '}
            {election.winner
              ? `${nameOf(election.winner)} est élu(e) avec ${formatRatio(election.voix[election.winner]!, election.exprimes)} des suffrages exprimés.`
              : `Qualifiés : ${election.qualified.map((id) => `${nameOf(id)} (${formatRatio(election.voix[id]!, election.exprimes)})`).join(' et ')}.`}
          </p>
        </section>
      )}
      {report.legislatives && (
        <section
          aria-label="Législatives de la semaine"
          className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950"
        >
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            Élections législatives : {report.legislatives.tour === 1 ? 'premier' : 'second'} tour (
            {formatGameDate(report.legislatives.date)})
            <Badge tone="simule">Résultats simulés</Badge>
          </h3>
          <p>
            {report.legislatives.tour === 1
              ? `${report.legislatives.elus} député(s) élu(s) dès le premier tour ; second tour la semaine suivante.`
              : `${report.legislatives.elus} député(s) élu(s) au second tour. Nouvelle Assemblée : ${Object.entries(
                  report.legislatives.siegesParBloc ?? {},
                )
                  .map(([bloc, seats]) => `${blocLabel(bloc)} ${seats}`)
                  .join(' ; ')}.`}
          </p>
        </section>
      )}
      {report.phaseChange && (
        <p>
          <Badge>Nouvelle phase</Badge> {PHASE_LABELS[report.phaseChange.to]}
        </p>
      )}

      <section aria-label="Actions de la semaine">
        <h3 className="mb-2 font-semibold">{playerId ? 'Vos actions' : 'Actions'}</h3>
        {playerId && ownActions.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">Aucune action programmée.</p>
        ) : !playerId ? null : (
          <ul className="space-y-1">
            {ownActions.map((action) => (
              <li
                key={`${action.actorId}-${action.index}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Badge tone={action.status === 'validee' ? 'succes' : 'danger'}>
                  {action.status === 'validee' ? 'Retenue' : 'Rejetée'}
                </Badge>
                <span>
                  {action.label}
                  {action.cible && ` — ${action.cible}`}
                </span>
                {action.reason && (
                  <span className="text-slate-600 dark:text-slate-400">— {action.reason}</span>
                )}
                {action.prestation && <PrestationDetail prestation={action.prestation} />}
              </li>
            ))}
          </ul>
        )}
        {otherActions.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer">
              Actions des campagnes adverses (
              {otherActions.filter((a) => a.status === 'validee').length})
            </summary>
            <ul className="mt-1 space-y-1">
              {otherActions
                .filter((a) => a.status === 'validee')
                .map((action) => (
                  <li key={`${action.actorId}-${action.index}`}>
                    <span className="font-medium">{nameOf(action.actorId)}</span> : {action.label}
                    {action.cible && ` — ${action.cible}`}
                    {action.prestation &&
                      ` — ${PRESTATION_LABELS[action.prestation.niveau].toLowerCase()} (posture ${POSTURE_LABELS[action.prestation.posture]}, score ${formatPoints(action.prestation.score)})`}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>

      {report.polls.length > 0 && (
        <p>
          <Badge tone="simule">Sondage simulé</Badge> {report.polls.length} sondage(s) publié(s)
          cette semaine (voir l’écran Sondages).
        </p>
      )}

      {(report.events.length > 0 || report.decisions.length > 0) && (
        <section aria-label="Événements de la semaine">
          <h3 className="mb-2 font-semibold">Événements</h3>
          <ul className="space-y-2">
            {report.decisions.map((decision) => (
              <li key={decision.decisionId}>
                <Badge>Décision</Badge> {decision.label}
                {decision.automatic && ' (option par défaut)'}
              </li>
            ))}
            {report.events.map((event) => (
              <li key={event.id}>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={event.nature === 'fictif' ? 'fictif' : 'simule'}>
                    {event.nature === 'fictif' ? 'Événement fictif' : 'Simulé'}
                  </Badge>
                  {event.majeur && <Badge tone="alerte">Majeur</Badge>}
                  {eventFamily(event.refId) && (
                    <Badge>{EVENT_FAMILY_LABELS[eventFamily(event.refId)!]}</Badge>
                  )}
                  <span className="font-medium">{event.label}</span>
                </span>
                {event.suiteDe && (
                  <span className="block text-sm font-semibold">Suite de « {event.suiteDe} »</span>
                )}
                <span className="block text-slate-600 dark:text-slate-400">
                  {event.description}
                </span>
                {event.decisionId && (
                  <span className="block text-amber-800 dark:text-amber-300">
                    Une décision est à prendre.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.economie.length > 0 && <EconomyChanges changes={report.economie} />}

      <CampaignReport
        report={report}
        playerId={playerId}
        nameOf={nameOf}
        {...(proposalLabel ? { proposalLabel } : {})}
      />

      <section aria-label="Variations des ressources">
        <h3 className="mb-2 font-semibold">Variations et facteurs</h3>
        {playerId && ownChanges.length === 0 && (
          <p className="text-slate-500 dark:text-slate-400">Aucune variation.</p>
        )}
        {playerId && ownChanges.length > 0 && <ChangesList changes={ownChanges} />}
        {otherChanges.length > 0 && (
          <details className="mt-2" open={!playerId}>
            <summary className="cursor-pointer">
              {playerId ? 'Campagnes adverses' : 'Campagnes'} ({otherChanges.length} variation(s))
            </summary>
            <div className="mt-2">
              <ChangesList changes={otherChanges} names={nameOf} />
            </div>
          </details>
        )}
      </section>

      {report.notices.length > 0 && (
        <section aria-label="Échéances proches">
          <h3 className="mb-2 font-semibold">Échéances proches</h3>
          <ul className="space-y-1">
            {report.notices.map((notice) => (
              <li key={notice.id}>
                {notice.inWeeks === 0
                  ? 'Cette semaine'
                  : `Dans ${notice.inWeeks} semaine${notice.inWeeks > 1 ? 's' : ''}`}{' '}
                : {notice.label} ({formatGameDate(notice.date)}, date{' '}
                {DATA_STATUS_LABELS[notice.statut]})
              </li>
            ))}
          </ul>
        </section>
      )}

      <details>
        <summary className="cursor-pointer font-semibold">Les 12 étapes de la semaine</summary>
        <ol className="mt-2 space-y-1">
          {report.steps.map((step) => (
            <li key={step.step} className={step.active ? '' : 'text-slate-500 dark:text-slate-400'}>
              {step.step}. {step.label} — {step.active ? step.summary : `inactif : ${step.summary}`}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
