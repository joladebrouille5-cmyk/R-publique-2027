import { RESOURCE_KEYS, type Actor, type GameState, type Ruleset } from '@r2027/shared';
import { useState, type ReactNode } from 'react';
import { formatResource, formatShare, RESOURCE_LABELS } from '../labels';

// Bandeau du plateau (phase 25, maquette validée) : « Semaine N » et le compte à rebours, le rang
// au dernier sondage dans sa pastille dorée, trois jauges en carton (popularité, budget, heures
// restantes après le plan) ; un toucher sur les jauges déplie toutes les ressources.

const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** « 1er tour », « 2d tour » ou le libellé de l'échéance. */
function deadlineLabel(libelle: string): string {
  if (/premier tour/i.test(libelle)) return '1er tour';
  if (/second tour/i.test(libelle)) return '2d tour';
  return libelle.charAt(0).toLowerCase() + libelle.slice(1);
}

export function TopBar({
  state,
  ruleset,
  actor,
  hoursLeft,
  menu,
}: {
  state: GameState;
  ruleset: Ruleset;
  actor: Actor | undefined;
  hoursLeft: number;
  /** Bouton de la boîte de jeu, en haut à droite. */
  menu: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const date = state.meta.date;
  const next = ruleset.calendrier.scrutins
    .filter((e) => e.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const round = state.meta.phase === 'entre_deux_tours' ? 'intentions_t2' : 'intentions_t1';
  const poll = [...state.polls]
    .reverse()
    .find((p) => p.kind === round && !p.id.endsWith('-hypothese-t2'));
  const ranked = poll ? [...poll.results].sort((a, b) => b.value - a.value) : [];
  const rank = actor ? ranked.findIndex((r) => r.actorId === actor.id) + 1 : 0;
  const share = rank > 0 ? ranked[rank - 1]!.value : null;
  const chip =
    'flex flex-col rounded-xl bg-carton px-2.5 py-1.5 text-left text-encre-carton shadow-carte';
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[1.9rem] leading-none font-extrabold text-craie">
            Semaine {state.meta.week}
          </p>
          {next && (
            <p className="mt-1 text-sm font-semibold text-craie-2">
              J−{daysBetween(date, next.date)} avant le {deadlineLabel(next.libelle)}
            </p>
          )}
          <p className="text-xs text-craie-2">
            <time dateTime={date}>{shortDate.format(new Date(`${date}T00:00:00Z`))}</time>
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {rank > 0 && share !== null && (
            <p className="flex min-w-16 flex-col items-center rounded-2xl bg-or px-3 py-1.5 text-sur-or shadow-pion">
              <span className="sr-only">Rang au dernier sondage : </span>
              <span className="font-display text-2xl leading-none font-extrabold">
                {rank}
                <sup className="text-xs">{rank === 1 ? 'er' : 'e'}</sup>
              </span>
              <span className="text-xs font-bold tabular-nums">{formatShare(share)}</span>
            </p>
          )}
          {menu}
        </div>
      </div>
      {actor && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="detail-ressources"
          aria-label="Ressources : popularité, budget, heures restantes"
          className="grid w-full grid-cols-3 gap-2"
        >
          <span className={chip}>
            <span className="text-[0.7rem] font-bold text-encre-carton-2">Popularité</span>
            <span className="font-display text-lg leading-tight font-extrabold tabular-nums">
              {formatResource('popularite', actor.resources.popularite)}
            </span>
          </span>
          <span className={chip}>
            <span className="text-[0.7rem] font-bold text-encre-carton-2">Budget</span>
            <span className="font-display text-lg leading-tight font-extrabold tabular-nums">
              {formatResource('budgetCentimes', actor.resources.budgetCentimes)}
            </span>
          </span>
          <span className={chip}>
            <span className="text-[0.7rem] font-bold text-encre-carton-2">Heures</span>
            <span className="font-display text-lg leading-tight font-extrabold tabular-nums">
              {hoursLeft} / {actor.resources.tempsHeures}
            </span>
          </span>
        </button>
      )}
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
