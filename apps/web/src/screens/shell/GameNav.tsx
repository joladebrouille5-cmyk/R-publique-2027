import { NavLink } from 'react-router';
import { HUBS } from './navigation';

// Navigation de partie (phase 12) : les cinq espaces, et rien d'autre — rail latéral sur
// ordinateur, barre du bas sur téléphone (au-dessus de la barre de gestes). Pas de menu dans
// un menu : les écrans d'un espace sont des sections dépliables de sa page.

export function GameNav() {
  return (
    <nav
      aria-label="Espaces de la partie"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-(--sab) backdrop-blur-md lg:sticky lg:top-4 lg:z-auto lg:self-start lg:border-0 lg:bg-transparent lg:pb-0 lg:backdrop-blur-none dark:border-slate-800 dark:bg-slate-950/90 lg:dark:bg-transparent"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 lg:max-w-none lg:grid-cols-1 lg:gap-1">
        {HUBS.map((hub) => {
          const Icon = hub.icon;
          return (
            <li key={hub.path}>
              <NavLink
                to={hub.path}
                className={({ isActive }) =>
                  `group flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:text-sm ${
                    isActive
                      ? 'text-republique-700 lg:bg-republique-600 lg:font-bold lg:text-white lg:shadow-card dark:text-republique-300 lg:dark:bg-republique-500 lg:dark:text-white lg:dark:shadow-neon'
                      : 'text-slate-600 hover:text-republique-700 lg:text-slate-700 lg:hover:bg-slate-100 dark:text-slate-400 lg:dark:text-slate-300 lg:dark:hover:bg-white/[0.06] dark:hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors lg:w-auto ${
                        isActive
                          ? 'bg-republique-100 lg:bg-transparent dark:bg-republique-500/25 dark:shadow-[0_0_16px_rgb(98_134_255/0.55)] lg:dark:bg-transparent lg:dark:shadow-none'
                          : ''
                      }`}
                    >
                      <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
                    </span>
                    {hub.label}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
