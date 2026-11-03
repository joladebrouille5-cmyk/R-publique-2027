import { useState } from 'react';
import { platform } from '../platform';
import { REMINDER_HOURS, useRappels } from '../stores/rappels';
import { input, label } from './ui';

// Rappel quotidien du défi du jour (phase 20) : notification locale de l'application Android,
// désactivée par défaut ; l'autorisation n'est demandée qu'à l'activation. Dans le navigateur,
// rien n'est programmé : la section le dit.

export function ReminderSettings() {
  const reminders = platform().reminders;
  const { actif, heure, setActif, setHeure } = useRappels();
  const [problem, setProblem] = useState<string | null>(null);
  if (!reminders)
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Le rappel quotidien du défi du jour est proposé dans l’application Android, où il est
        programmé sur l’appareil. Le navigateur n’envoie aucune notification.
      </p>
    );
  const apply = async (enabled: boolean, hour: number) => {
    setProblem(null);
    if (!enabled) {
      await reminders.cancel();
      setActif(false);
      return;
    }
    const granted = await reminders.schedule(hour).catch(() => false);
    setActif(granted);
    if (!granted)
      setProblem(
        'Notifications refusées : autorisez-les pour RÉPUBLIQUE 2027 dans les réglages d’Android, puis réessayez.',
      );
  };
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={actif}
          onChange={(event) => void apply(event.target.checked, heure)}
          className="size-4 accent-republique-600 dark:accent-dorure"
        />
        Me rappeler le défi du jour chaque jour
      </label>
      <div className="max-w-48 space-y-1">
        <label htmlFor="heure-rappel" className={label}>
          Heure du rappel
        </label>
        <select
          id="heure-rappel"
          className={input}
          value={heure}
          disabled={!actif}
          onChange={(event) => {
            const hour = Number(event.target.value);
            setHeure(hour);
            void apply(true, hour);
          }}
        >
          {REMINDER_HOURS.map((h) => (
            <option key={h} value={h}>
              {h} h
            </option>
          ))}
        </select>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {problem}
        </p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Notification programmée sur l’appareil, sans réseau ; l’heure peut varier de quelques
        minutes (alarme non exacte, qui ménage la batterie).
      </p>
    </div>
  );
}
