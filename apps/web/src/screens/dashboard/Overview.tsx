import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Vue d'ensemble du QG (phase 12) : les chiffres qui comptent, en tuiles, dans le premier écran.
// Une tuile ouvre le détail dans un tiroir, ou amène la section concernée de la page à l'écran.

export type OverviewTile = {
  id: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** Ton de la valeur : alerte (décision en attente, seuil non atteint), bonne nouvelle. */
  tone?: 'alerte' | 'succes';
  /** Ouvre un tiroir (dialogue) ou amène une section de la page. */
  action: { kind: 'tiroir' | 'section'; run: () => void; label: string };
};

const TONES = {
  alerte: 'text-amber-800 dark:text-amber-300',
  succes: 'text-emerald-700 dark:text-emerald-400',
} as const;

export function Overview({
  title,
  intro,
  tiles,
}: {
  title: string;
  intro?: ReactNode;
  tiles: readonly OverviewTile[];
}) {
  return (
    <section aria-labelledby="titre-ensemble" className="space-y-2.5">
      <h2 id="titre-ensemble" className="text-lg font-bold">
        {title}
      </h2>
      {intro && <div className="space-y-1 text-sm">{intro}</div>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <li key={tile.id} className="min-w-0">
              <button
                type="button"
                onClick={tile.action.run}
                aria-haspopup={tile.action.kind === 'tiroir' ? 'dialog' : undefined}
                data-tuile={tile.id}
                className="group flex h-full w-full flex-col items-start gap-0.5 rounded-card border border-slate-200/80 bg-white px-3 py-2 text-left sm:py-2.5 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-republique-300 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500 active:translate-y-0 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-republique-400/60 dark:hover:shadow-neon"
              >
                <span className="flex w-full items-center gap-1.5 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-400">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />
                  <span className="min-w-0 flex-1 truncate">{tile.label}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
                <span
                  className={`w-full truncate font-display text-lg leading-tight font-extrabold tabular-nums sm:text-xl ${tile.tone ? TONES[tile.tone] : ''}`}
                >
                  {tile.value}
                </span>
                {tile.detail && (
                  <span className="w-full truncate text-xs leading-snug text-slate-600 sm:line-clamp-2 sm:whitespace-normal dark:text-slate-400">
                    {tile.detail}
                  </span>
                )}
                <span className="sr-only">{tile.action.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
