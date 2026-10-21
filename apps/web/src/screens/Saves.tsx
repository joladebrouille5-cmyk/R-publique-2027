import { MAX_SAVE_SLOTS, type SaveSummary } from '@r2027/shared';
import { useState } from 'react';
import { useCreateSave, useRestoreSave, useSaves } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonDanger, buttonPrimary, buttonSecondary, card, input, label } from '../components/ui';
import { formatGameDate, formatTimestamp } from '../labels';
import { useCurrentGame } from './GameLayout';
import { AutoSaves } from './saves/AutoSaves';
import { ExchangePanel } from './saves/ExchangePanel';

type Pending = { kind: 'ecraser' | 'restaurer'; slot: number } | null;

export function Saves() {
  const game = useCurrentGame();
  const saves = useSaves(game.id);
  const createSave = useCreateSave(game.id);
  const restoreSave = useRestoreSave(game.id);
  const [saveLabel, setSaveLabel] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState('');

  const bySlot = new Map<number, SaveSummary>();
  for (const save of saves.data ?? []) if (save.slot !== null) bySlot.set(save.slot, save);
  const slots = Array.from({ length: MAX_SAVE_SLOTS }, (_, index) => index + 1);

  const save = (slot: number, overwrite: boolean) => {
    setPending(null);
    setMessage('');
    createSave.mutate(
      { slot, overwrite, ...(saveLabel.trim() ? { label: saveLabel.trim() } : {}) },
      {
        onSuccess: () => {
          setSaveLabel('');
          setMessage(`Partie sauvegardée dans l’emplacement ${slot}.`);
        },
      },
    );
  };

  const restore = (slot: number, existing: SaveSummary) => {
    setPending(null);
    setMessage('');
    restoreSave.mutate(
      { saveId: existing.id, expectedVersion: game.version },
      { onSuccess: () => setMessage(`Emplacement ${slot} restauré (semaine ${existing.week}).`) },
    );
  };

  return (
    <section aria-labelledby="titre-sauvegardes" className="space-y-6">
      <h1 id="titre-sauvegardes" className="text-2xl font-bold">
        Sauvegardes
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Les sauvegardes sont conservées sur le serveur. Chaque sauvegarde garde l’empreinte de
        l’état : une restauration redonne exactement la même partie.
      </p>

      <h2 className="text-lg font-semibold">Emplacements manuels</h2>
      <div className="max-w-md space-y-1">
        <label htmlFor="libelle" className={label}>
          Libellé de la prochaine sauvegarde (facultatif)
        </label>
        <input
          id="libelle"
          className={input}
          value={saveLabel}
          maxLength={60}
          onChange={(event) => setSaveLabel(event.target.value)}
        />
      </div>

      <p
        role="status"
        className="min-h-5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
      >
        {message}
      </p>
      {createSave.isError && <ErrorMessage error={createSave.error} />}
      {restoreSave.isError && <ErrorMessage error={restoreSave.error} />}
      {saves.isError && <ErrorMessage error={saves.error} onRetry={() => void saves.refetch()} />}
      {saves.isPending && <p>Chargement des sauvegardes…</p>}

      {saves.data && (
        <ol className="space-y-3">
          {slots.map((slot) => {
            const existing = bySlot.get(slot);
            const confirming = pending?.slot === slot ? pending.kind : null;
            const busy = createSave.isPending || restoreSave.isPending;
            return (
              <li key={slot} className={card} aria-label={`Emplacement ${slot}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Emplacement {slot}</p>
                    {existing ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {existing.label ? `${existing.label} — ` : ''}Semaine {existing.week},{' '}
                        {formatGameDate(existing.date)} · enregistrée le{' '}
                        {formatTimestamp(existing.createdAt)}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-500">Vide</p>
                    )}
                  </div>

                  {confirming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">
                        {confirming === 'restaurer'
                          ? 'Restaurer ? La partie en cours reviendra à cet état.'
                          : 'Écraser la sauvegarde existante ?'}
                      </span>
                      <button
                        type="button"
                        className={buttonDanger}
                        onClick={() =>
                          confirming === 'restaurer' ? restore(slot, existing!) : save(slot, true)
                        }
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => setPending(null)}
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {existing ? (
                        <>
                          <button
                            type="button"
                            className={buttonPrimary}
                            disabled={busy}
                            onClick={() => setPending({ kind: 'restaurer', slot })}
                          >
                            Restaurer
                          </button>
                          <button
                            type="button"
                            className={buttonSecondary}
                            disabled={busy}
                            onClick={() => setPending({ kind: 'ecraser', slot })}
                          >
                            Écraser
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={buttonPrimary}
                          disabled={busy}
                          onClick={() => save(slot, false)}
                        >
                          Sauvegarder ici
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {saves.data && <AutoSaves gameId={game.id} version={game.version} saves={saves.data} />}
      <ExchangePanel gameId={game.id} />
    </section>
  );
}
