import { NavLink } from 'react-router';
import { HUBS } from './navigation';

// Navigation de partie (phase 12) : les cinq espaces, et rien d'autre — rail latéral sur
// ordinateur, barre du bas sur téléphone (au-dessus de la barre de gestes). Pas de menu dans
// un menu : les écrans d'un espace sont des sections dépliables de sa page. L'espace ouvert
// porte un signet doré (phase 16) ; le passage d'un espace à l'autre est un fondu (transition
// de vue, quand le navigateur la prend en charge).

export function GameNav() {
  return (
    <nav
      aria-label="Espaces de la partie"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-(--sab) backdrop-blur-md lg:sticky lg:top-6 lg:z-auto lg:self-start lg:border-0 lg:bg-transparent lg:pb-0 lg:backdrop-blur-none dark:border-white/[0.08] dark:bg-slate-950/90 lg:dark:bg-transparent"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 lg:max-w-none lg:grid-cols-1 lg:gap-1">
        {HUBS.map((hub) => {
          const Icon = hub.icon;
          return (
            <li key={hub.path}>
              <NavLink
                to={hub.path}
                viewTransition
                className={({ isActive }) =>
                  `group relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold transition-colors lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-4 lg:text-[0.95rem] ${
                    isActive
                      ? 'text-republique-800 lg:bg-white lg:font-bold lg:text-slate-950 lg:shadow-card dark:text-white lg:dark:bg-white/[0.06] lg:dark:shadow-none'
                      : 'text-slate-600 hover:text-republique-700 lg:text-slate-700 lg:hover:bg-white/70 dark:text-slate-400 lg:dark:text-slate-300 lg:dark:hover:bg-white/[0.04] dark:hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Signet : barre dorée en haut de l'onglet (téléphone), à gauche (rail). */}
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 left-1/2 h-[3px] w-9 -translate-x-1/2 rounded-b-full bg-or-500 transition-[opacity,transform] duration-300 ease-sortie lg:top-1/2 lg:left-0 lg:h-6 lg:w-[3px] lg:translate-x-0 lg:-translate-y-1/2 lg:rounded-r-full lg:rounded-bl-none dark:bg-dorure dark:shadow-[0_0_12px_rgb(227_196_108/0.7)] ${
                        isActive ? 'opacity-100' : 'scale-50 opacity-0'
                      }`}
                    />
                    <span
                      className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors lg:w-auto ${
                        isActive
                          ? 'bg-republique-100 text-republique-700 lg:bg-transparent lg:text-or-600 dark:bg-dorure/15 dark:text-dorure lg:dark:bg-transparent'
                          : ''
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-5"
                        strokeWidth={isActive ? 2.25 : 1.75}
                      />
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
