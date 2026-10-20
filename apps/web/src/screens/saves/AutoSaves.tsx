import type { SaveSummary } from '@r2027/shared';
import { useState } from 'react';
import { useRestoreSave } from '../../api/hooks';
import { Badge } from '../../components/Badge';
import { ErrorMessage } from '../../components/ErrorMessage';
import { buttonDanger, buttonPrimary, buttonSecondary, card } from '../../components/ui';
import { formatGameDate, formatTimestamp } from '../../labels';

const KIND_LABELS: Record<string, string> = {
  auto: 'Automatique (hebdomadaire)',
  avant_evenement: 'Avant événement majeur',
  import: 'Import',
};

type Props = { gameId: string; version: number; saves: readonly SaveSummary[] };

/** Sauvegardes créées par le serveur : chaque semaine, avant un événement majeur, à l'import. */
export function AutoSaves({ gameId, version, saves }: Props) {
  const restore = useRestoreSave(gameId);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const automatic = saves
    .filter((save) => save.slot === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section aria-labelledby="titre-auto" className="space-y-3">
      <h2 id="titre-auto" className="text-lg font-semibold">
        Sauvegardes automatiques
      </h2>
      <p
        role="status"
        className="min-h-5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
      >
        {message}
      </p>
      {restore.isError && <ErrorMessage error={restore.error} />}
      {automatic.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucune pour l’instant : une sauvegarde est créée à chaque semaine résolue.
        </p>
      ) : (
        <ul className="space-y-2">
          {automatic.map((save) => (
            <li
              key={save.id}
              className={card}
              aria-label={`Sauvegarde automatique semaine ${save.week}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    Semaine {save.week} — {formatGameDate(save.date)}
                    <Badge tone={save.kind === 'avant_evenement' ? 'alerte' : 'neutre'}>
                      {KIND_LABELS[save.kind] ?? save.kind}
                    </Badge>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Enregistrée le {formatTimestamp(save.createdAt)}
                  </p>
                </div>
                {confirming === save.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">Revenir à cet état ?</span>
                    <button
                      type="button"
                      className={buttonDanger}
                      onClick={() => {
                        setConfirming(null);
                        restore.mutate(
                          { saveId: save.id, expectedVersion: version },
                          {
                            onSuccess: () =>
                              setMessage(`Partie ramenée à la semaine ${save.week}.`),
                          },
                        );
                      }}
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      className={buttonSecondary}
                      onClick={() => setConfirming(null)}
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={buttonPrimary}
                    disabled={restore.isPending}
                    onClick={() => setConfirming(save.id)}
                  >
                    Restaurer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
