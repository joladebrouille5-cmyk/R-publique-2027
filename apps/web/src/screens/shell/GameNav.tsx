import { NavLink } from 'react-router';
import { HUBS } from './navigation';

// Navigation de partie (phase 12) : les cinq espaces, et rien d'autre — rail latéral sur
// ordinateur, barre du bas sur téléphone (au-dessus de la barre de gestes). Pas de menu dans
// un menu : les écrans d'un espace sont des sections dépliables de sa page. Phase 21 : comme les
// intercalaires d'un classeur de campagne, l'espace ouvert est un onglet imprimé à l'encre
// (aplat sombre, texte papier) ; le passage d'un espace à l'autre est un fondu (transition de
// vue, quand le navigateur la prend en charge).

export function GameNav() {
  return (
    <nav
      aria-label="Espaces de la partie"
      className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-slate-900 bg-papier/95 pb-(--sab) backdrop-blur-md lg:sticky lg:top-6 lg:z-auto lg:self-start lg:border-0 lg:bg-transparent lg:pb-0 lg:backdrop-blur-none dark:border-white/25 dark:bg-slate-950/95 lg:dark:bg-transparent"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 gap-1 px-1 pt-1 lg:max-w-none lg:grid-cols-1 lg:gap-1.5 lg:p-0">
        {HUBS.map((hub) => {
          const Icon = hub.icon;
          return (
            <li key={hub.path}>
              <NavLink
                to={hub.path}
                viewTransition
                className={({ isActive }) =>
                  `group relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-md font-display text-[0.78rem] font-bold [font-stretch:88%] transition-colors lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-[1.05rem] ${
                    isActive
                      ? 'bg-slate-900 text-papier dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.08]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      aria-hidden="true"
                      className="size-5"
                      strokeWidth={isActive ? 2.25 : 1.75}
                    />
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
