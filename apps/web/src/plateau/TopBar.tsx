import { RESOURCE_KEYS, type Actor, type GameState, type Ruleset } from '@r2027/shared';
import { useState } from 'react';
import { pastille } from '../components/ui';
import { formatGameDate, formatResource, RESOURCE_LABELS } from '../labels';

// Bandeau du plateau (phase 25) : semaine et compte à rebours, rang au dernier sondage (pastille
// dorée), popularité, budget, heures restantes après le plan ; un toucher déplie le détail.

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function TopBar({
  state,
  ruleset,
  actor,
  hoursLeft,
}: {
  state: GameState;
  ruleset: Ruleset;
  actor: Actor | undefined;
  hoursLeft: number;
}) {
  const [open, setOpen] = useState(false);
  const date = state.meta.date;
  const next = [...ruleset.calendrier.scrutins, ...ruleset.calendrier.echeances]
    .filter((e) => e.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const round = state.meta.phase === 'entre_deux_tours' ? 'intentions_t2' : 'intentions_t1';
  const poll = [...state.polls]
    .reverse()
    .find((p) => p.kind === round && !p.id.endsWith('-hypothese-t2'));
  const rank =
    poll && actor
      ? [...poll.results]
          .sort((a, b) => b.value - a.value)
          .findIndex((r) => r.actorId === actor.id) + 1
      : 0;
  return (
    <header className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="detail-ressources"
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-feutrine-3/70 px-3 py-2 text-left text-craie"
      >
        <span className="flex flex-col">
          <span className="font-display text-lg leading-none font-extrabold">
            Semaine {state.meta.week}
          </span>
          <span className="text-xs text-craie-2">
            {formatGameDate(date)}
            {next ? ` · J−${daysBetween(date, next.date)} ${next.libelle}` : ''}
          </span>
        </span>
        {rank > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-craie-2">
            <span className={pastille} aria-hidden="true">
              {rank}
            </span>
            <span>
              <span className="sr-only">Rang au dernier sondage : </span>
              {rank === 1 ? '1er' : `${rank}e`} au sondage
            </span>
          </span>
        )}
        {actor && (
          <span className="ml-auto flex gap-3 text-sm font-bold tabular-nums">
            <span>
              <span className="sr-only">Popularité </span>
              {formatResource('popularite', actor.resources.popularite)}
            </span>
            <span>
              <span className="sr-only">Budget </span>
              {formatResource('budgetCentimes', actor.resources.budgetCentimes)}
            </span>
            <span>
              <span className="sr-only">Heures restantes après le plan </span>
              {formatResource('tempsHeures', hoursLeft)}
            </span>
          </span>
        )}
      </button>
      {open && actor && (
        <dl
          id="detail-ressources"
          className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-feutrine-2 px-3 py-2 text-sm text-craie sm:grid-cols-4"
        >
          {RESOURCE_KEYS.map((key) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-craie-2">{RESOURCE_LABELS[key]}</dt>
              <dd className="font-bold tabular-nums">
                {formatResource(key, actor.resources[key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
