import type { GamePhase } from '@r2027/shared';
import { LayoutGrid, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { GAME_SCREENS, type GameScreen } from '../registry';
import { SCREEN_GROUPS, SCREEN_ICONS, SHORT_LABELS, shortcutsFor } from './navigation';

// Navigation de partie (phase 9). Un seul menu complet « Écrans de la partie » : rail
// latéral sur ordinateur, feuille glissant du bas sur mobile (bouton « Tous les écrans »).
// Sur mobile, une barre du bas garde quatre raccourcis selon la phase.

const screenByPath = new Map(GAME_SCREENS.map((s) => [s.path, s]));

function ScreenLink({ screen, onNavigate }: { screen: GameScreen; onNavigate: () => void }) {
  const Icon = SCREEN_ICONS[screen.path]!;
  return (
    <NavLink
      to={screen.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-republique-600 font-bold text-white shadow-card dark:bg-republique-500 dark:shadow-neon'
            : 'font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            aria-hidden="true"
            className={`size-[1.15rem] shrink-0 ${isActive ? '' : 'text-slate-500 group-hover:text-republique-600 dark:text-slate-400'}`}
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1 truncate">{screen.label}</span>
          {!screen.available && (
            <span
              className={`text-xs ${isActive ? 'text-white' : 'text-slate-600 dark:text-slate-400'}`}
              aria-label={`prévu en phase ${screen.phase}`}
            >
              P{screen.phase}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function GameNav({ phase }: { phase: GamePhase }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const shortcuts = shortcutsFor(phase);
  const shortcutPaths = new Set(shortcuts.map((s) => s.path));
  const current = location.pathname.split('/').at(-1) ?? '';

  // Feuille mobile : Échap la ferme, le focus va au premier lien puis revient au bouton.
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    if (!open) return;
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 animate-apparait bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
          onClick={close}
        />
      )}
      <div
        ref={sheet}
        id="tous-les-ecrans"
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label={open ? 'Tous les écrans' : undefined}
        className={`${
          open
            ? 'fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] animate-monte overflow-y-auto rounded-t-dossier bg-white px-4 pt-3 pb-[calc(1.25rem+var(--sab))] shadow-raised dark:bg-slate-900'
            : 'max-lg:hidden'
        } lg:sticky lg:top-4 lg:block lg:self-start`}
      >
        {open && (
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <span aria-hidden="true" className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
            <button
              type="button"
              onClick={close}
              className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Fermer la liste des écrans</span>
            </button>
          </div>
        )}
        <nav aria-label="Écrans de la partie">
          {SCREEN_GROUPS.map((group) => (
            <div key={group.titre} className="mb-4">
              <p className="mb-1 px-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                {group.titre}
              </p>
              <ul className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                {group.paths.map((path) => (
                  <li key={path}>
                    <ScreenLink screen={screenByPath.get(path)!} onNavigate={close} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <nav
        aria-label="Raccourcis"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-(--sab) backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-950/90"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {shortcuts.map((screen) => {
            const Icon = SCREEN_ICONS[screen.path]!;
            return (
              <li key={screen.path}>
                <NavLink
                  to={screen.path}
                  className={({ isActive }) =>
                    `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold ${
                      isActive
                        ? 'text-republique-700 dark:text-republique-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                          isActive
                            ? 'bg-republique-100 dark:bg-republique-500/25 dark:shadow-[0_0_16px_rgb(98_134_255/0.55)]'
                            : ''
                        }`}
                      >
                        <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
                      </span>
                      {SHORT_LABELS[screen.path] ?? screen.label}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          <li>
            <button
              ref={opener}
              type="button"
              aria-expanded={open}
              aria-controls="tous-les-ecrans"
              onClick={() => setOpen((value) => !value)}
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold ${
                !shortcutPaths.has(current) && !open
                  ? 'text-republique-700 dark:text-republique-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <span
                className={`inline-flex h-7 w-12 items-center justify-center rounded-full ${
                  open || !shortcutPaths.has(current)
                    ? 'bg-republique-100 dark:bg-republique-900'
                    : ''
                }`}
              >
                <LayoutGrid aria-hidden="true" className="size-5" strokeWidth={2} />
              </span>
              <span aria-hidden="true">Écrans</span>
              <span className="sr-only">Tous les écrans</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
