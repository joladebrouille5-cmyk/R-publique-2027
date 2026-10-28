import { Settings } from 'lucide-react';
import { Link, Outlet, useMatch } from 'react-router';
import { useHealth } from '../api/hooks';
import { platform } from '../platform';
import { ThemeToggle, useApplyTheme } from './ThemeToggle';

/**
 * État du serveur (web) ou du moteur local (application) : sur l'appareil, rien n'est affiché
 * quand le moteur fonctionne (phase 14, demande de l'utilisateur) ; seuls le démarrage et une
 * panne sont signalés. La version du moteur reste dans Paramètres.
 */
function ServerStatus() {
  const health = useHealth();
  const data = health.data;
  const ok = data?.status === 'ok';
  const local = platform().kind === 'local';
  if (local && ok) return null;
  const text = health.isPending
    ? local
      ? 'Démarrage du moteur local…'
      : 'Connexion au serveur…'
    : ok
      ? `Serveur connecté · moteur ${data.versions.engine}`
      : local
        ? 'Moteur local indisponible'
        : 'Serveur ou base de données indisponible';
  return (
    <p className="flex items-center gap-2" role="status">
      <span
        aria-hidden="true"
        className={`inline-block size-2 rounded-full ${health.isPending ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-red-500'}`}
      />
      {text}
    </p>
  );
}

/** Marque : trois bandes inclinées, comme un bulletin glissé dans l'urne. */
function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 rounded-full font-display text-base font-extrabold tracking-tight whitespace-nowrap sm:gap-2.5 sm:text-lg"
    >
      <span aria-hidden="true" className="flex h-5 -skew-x-12 overflow-hidden rounded-[3px]">
        <span className="w-1.5 bg-republique-600" />
        <span className="w-1.5 bg-slate-200 dark:bg-slate-100" />
        <span className="w-1.5 bg-red-500" />
      </span>
      RÉPUBLIQUE 2027
    </Link>
  );
}

export function AppLayout() {
  useApplyTheme();
  const { storageNotice } = platform();
  const inGame = useMatch('/parties/:gameId/*') !== null;
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900"
      >
        Aller au contenu
      </a>
      {/* Fond sous la barre d'état de l'appareil : le contenu qui défile ne passe pas dessous. */}
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-(--sat) bg-slate-50 dark:bg-slate-950"
      />
      <header className="bg-slate-50 pt-(--sat) pr-(--sar) pl-(--sal) dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 pt-3 pb-2 sm:gap-4">
          <Brand />
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link
              to="/parametres"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Settings aria-hidden="true" className="size-5" />
              <span className="sr-only sm:not-sr-only">Paramètres</span>
            </Link>
          </div>
        </div>
      </header>
      <main id="contenu" className="flex-1">
        <Outlet />
      </main>
      <footer
        className={`border-t border-slate-200 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400 ${inGame ? 'max-lg:pb-[calc(6rem+var(--sab))]' : ''}`}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:flex-row sm:justify-between">
          <ServerStatus />
          <p>
            Simulation : les événements et résultats affichés sont simulés sauf mention contraire.
          </p>
        </div>
        {storageNotice && (
          <p className="mx-auto max-w-7xl px-4 pb-3 text-amber-800 dark:text-amber-300">
            {storageNotice}
          </p>
        )}
      </footer>
    </div>
  );
}
