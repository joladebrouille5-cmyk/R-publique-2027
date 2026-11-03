import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { buttonGhost } from './ui';

// Sommaire collant (phase 22) : dans un espace (Campagne, Opinion, Pouvoir) ou dans Paramètres,
// une pastille par section, sous le bandeau de campagne. Toucher une pastille déplie la section
// et l'amène à la vue (l'espace s'en charge, `onShow`) ; l'entrée courante suit le défilement.
// Des liens vers les ancres : l'adresse partagée (`#finances`) ouvre la même section.

export type SectionNavItem = { id: string; label: string; icon?: ReactNode; open?: boolean };

/** Décale la liste horizontale pour que la pastille courante reste visible. */
function revealChip(list: HTMLUListElement | null) {
  const chip = list?.querySelector<HTMLElement>('[aria-current="location"]');
  if (!list || !chip) return;
  const left = chip.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth)
    list.scrollLeft = Math.max(0, left - 16);
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SectionNav({
  items,
  label,
  onShow,
  onCollapseAll,
}: {
  items: readonly SectionNavItem[];
  label: string;
  /** Déplie et amène la section ; à défaut, la page défile simplement jusqu'à l'ancre. */
  onShow?: (id: string) => void;
  onCollapseAll?: () => void;
}) {
  const [current, setCurrent] = useState(items[0]?.id);
  const list = useRef<HTMLUListElement>(null);
  const ids = items.map((item) => item.id).join('|');

  // Entrée courante : la section qui occupe la bande haute de l'écran.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const targets = ids
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el) => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [ids]);

  useEffect(() => revealChip(list.current), [current]);

  if (items.length < 2) return null;
  const openCount = items.filter((item) => item.open).length;

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    setCurrent(id);
    if (onShow) onShow(id);
    else
      document
        .getElementById(id)
        ?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <nav
      aria-label={label}
      className="sticky top-[calc(var(--sat)+var(--hud,0px))] z-20 -mx-4 border-b-[1.5px] border-slate-900 bg-papier/95 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-papier/85 sm:px-4 lg:mx-0 lg:px-1 dark:border-white/25 dark:bg-slate-950/90 dark:supports-[backdrop-filter]:bg-slate-950/80"
    >
      <div className="flex items-center gap-1">
        <ul
          ref={list}
          className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => {
            const isCurrent = item.id === current;
            return (
              <li key={item.id} className="shrink-0">
                <a
                  href={`#${item.id}`}
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={(event) => go(event, item.id)}
                  className={`relative inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 font-display text-[0.86rem] font-bold whitespace-nowrap [font-stretch:88%] transition-colors duration-150 hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-republique-600 dark:hover:bg-white/[0.08] dark:focus-visible:outline-dorure ${
                    isCurrent
                      ? 'text-encre after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:rounded-full after:bg-red-600 dark:after:bg-red-400'
                      : 'text-encre-2'
                  }`}
                >
                  {item.icon && (
                    <span aria-hidden="true" className="[&_svg]:size-4">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                  {item.open && (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-republique-600 dark:bg-dorure"
                      />{' '}
                      <span className="sr-only">(dépliée)</span>
                    </>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        {onCollapseAll && openCount >= 2 && (
          <button
            type="button"
            onClick={onCollapseAll}
            className={`${buttonGhost} shrink-0 text-xs whitespace-nowrap`}
          >
            Tout replier
          </button>
        )}
      </div>
    </nav>
  );
}
