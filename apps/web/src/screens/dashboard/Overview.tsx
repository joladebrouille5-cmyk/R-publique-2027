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
      <h2 id="titre-ensemble" className="text-xl sm:text-2xl">
        {title}
      </h2>
      {intro && <div className="space-y-1 text-sm">{intro}</div>}
      {/* Tableau d'affichage : des cases séparées par des filets (bordures des cases, rognées
          sur le pourtour par le cadre), sans carte par chiffre. */}
      <div className="overflow-hidden rounded-dossier border border-slate-200/90 bg-white shadow-card dark:border-white/[0.08] dark:bg-slate-900/55 dark:shadow-none">
        <ul className="-m-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <li
                key={tile.id}
                className="min-w-0 border-t border-l border-slate-200/90 dark:border-white/[0.07]"
              >
                <button
                  type="button"
                  onClick={tile.action.run}
                  aria-haspopup={tile.action.kind === 'tiroir' ? 'dialog' : undefined}
                  data-tuile={tile.id}
                  className="group flex h-full w-full flex-col items-start gap-0.5 px-3.5 py-2 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-republique-500 sm:px-4 sm:py-3 dark:hover:bg-white/[0.04] dark:focus-visible:outline-dorure"
                >
                  <span className="flex w-full items-center gap-1.5 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-400">
                    <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />
                    <span className="min-w-0 flex-1 truncate">{tile.label}</span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500"
                    />
                  </span>
                  <span
                    className={`w-full truncate font-display text-xl leading-tight font-bold tabular-nums sm:text-2xl ${tile.tone ? TONES[tile.tone] : 'text-slate-950 dark:text-white'}`}
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
      </div>
    </section>
  );
}
