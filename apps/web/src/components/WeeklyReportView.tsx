import type { WeeklyReport } from '@r2027/shared';
import {
  DATA_STATUS_LABELS,
  FACTOR_SOURCE_LABELS,
  formatDelta,
  formatGameDate,
  formatResource,
  RESOURCE_LABELS,
} from '../labels';
import { Badge } from './Badge';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Bilan hebdomadaire : chaque variation est détaillée par les facteurs du moteur (§13). */
export function WeeklyReportView({ report }: { report: WeeklyReport }) {
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

      <section aria-label="Actions de la semaine">
        <h3 className="mb-2 font-semibold">Actions</h3>
        {report.actions.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">Aucune action programmée.</p>
        ) : (
          <ul className="space-y-1">
            {report.actions.map((action) => (
              <li key={action.index} className="flex flex-wrap items-baseline gap-2">
                <Badge tone={action.status === 'validee' ? 'succes' : 'danger'}>
                  {action.status === 'validee' ? 'Retenue' : 'Rejetée'}
                </Badge>
                <span>{action.label}</span>
                {action.reason && (
                  <span className="text-slate-600 dark:text-slate-400">— {action.reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
                    {event.nature === 'fictif' ? 'Événement fictif' : 'Aléa simulé'}
                  </Badge>
                  {event.majeur && <Badge tone="alerte">Majeur</Badge>}
                  <span className="font-medium">{event.label}</span>
                </span>
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

      <section aria-label="Variations des ressources">
        <h3 className="mb-2 font-semibold">Variations et facteurs</h3>
        {report.changes.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">Aucune variation.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {report.changes.map((change) => (
              <li key={`${change.actorId}-${change.ressource}`}>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{RESOURCE_LABELS[change.ressource]}</span>
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
