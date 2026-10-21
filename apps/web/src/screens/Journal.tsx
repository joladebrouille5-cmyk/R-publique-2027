import { useJournal, useRuleset } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonSecondary, card } from '../components/ui';
import { WeeklyReportView } from '../components/WeeklyReportView';
import { formatGameDate, formatTimestamp, JOURNAL_TYPE_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';

function describe(type: string, details: Record<string, unknown>): string {
  switch (type) {
    case 'sauvegarde_creee':
      return `Emplacement ${String(details.slot)}${details.overwrite ? ' (écrasé)' : ''}`;
    case 'sauvegarde_restauree':
      return `Retour à l’état enregistré (depuis la semaine ${String(details.fromWeek)})`;
    case 'migration_de_sauvegarde':
      return `Format ${String(details.from)} → ${String(details.to)}`;
    case 'partie_importee':
      return `Depuis « ${String(details.originalName)} »`;
    case 'partie_creee':
      return `Graine ${String(details.seed)}, départ le ${formatGameDate(String(details.startDate))}`;
    default:
      return '';
  }
}

export function Journal() {
  const game = useCurrentGame();
  const journal = useJournal(game.id);
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const entries = journal.data?.pages.flatMap((page) => page.entries) ?? [];
  const blocLabel = (id: string) =>
    ruleset.data?.legislatives.blocs.find((b) => b.id === id)?.libelle ?? id;

  return (
    <section aria-labelledby="titre-journal" className="space-y-4">
      <h1 id="titre-journal" className="text-2xl font-bold">
        Journal
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Historique immuable de la partie, du plus récent au plus ancien. Une restauration de
        sauvegarde n’efface rien : elle apparaît comme une entrée.
      </p>
      {journal.isPending && <p>Chargement du journal…</p>}
      {journal.isError && (
        <ErrorMessage error={journal.error} onRetry={() => void journal.refetch()} />
      )}

      <ol className="space-y-3">
        {entries.map((entry) =>
          entry.report ? (
            <li key={entry.id} className={card}>
              <details>
                <summary className="cursor-pointer">
                  <span className="font-semibold">
                    Semaine {entry.report.week} — {formatGameDate(entry.report.date)}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {entry.report.election &&
                      `${entry.report.election.round === 1 ? 'Premier' : 'Second'} tour · `}
                    {
                      entry.report.actions.filter(
                        (a) => a.status === 'validee' && a.actorId === game.state.player.actorId,
                      ).length
                    }{' '}
                    action(s) de votre campagne, {entry.report.events.length} événement(s) · résolue
                    le {formatTimestamp(entry.createdAt)}
                  </span>
                </summary>
                <div className="mt-4">
                  <WeeklyReportView
                    report={entry.report}
                    state={game.state}
                    blocLabel={blocLabel}
                  />
                </div>
              </details>
            </li>
          ) : (
            <li
              key={entry.id}
              className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
            >
              <span className="font-medium">{JOURNAL_TYPE_LABELS[entry.type] ?? entry.type}</span>
              {describe(entry.type, entry.details) && ` — ${describe(entry.type, entry.details)}`}
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Semaine {entry.week} · {formatTimestamp(entry.createdAt)}
              </span>
            </li>
          ),
        )}
      </ol>

      {journal.hasNextPage && (
        <button
          type="button"
          className={buttonSecondary}
          disabled={journal.isFetchingNextPage}
          onClick={() => void journal.fetchNextPage()}
        >
          {journal.isFetchingNextPage ? 'Chargement…' : 'Afficher les entrées plus anciennes'}
        </button>
      )}
    </section>
  );
}
