import { Link, Outlet, useMatch } from 'react-router';
import { useHealth } from '../api/hooks';
import { platform } from '../platform';
import { ThemeToggle, useApplyTheme } from './ThemeToggle';

function ServerStatus() {
  const health = useHealth();
  const data = health.data;
  const ok = data?.status === 'ok';
  const local = platform().kind === 'local';
  const text = health.isPending
    ? local
      ? 'Démarrage du moteur local…'
      : 'Connexion au serveur…'
    : ok
      ? local
        ? `Hors ligne · moteur ${data.versions.engine} sur l’appareil`
        : `Serveur connecté · moteur ${data.versions.engine}`
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
      className="flex items-center gap-2.5 rounded-full font-display text-lg font-extrabold tracking-tight"
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
      <header className="bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pt-3 pb-2">
          <Brand />
          <ThemeToggle />
        </div>
      </header>
      <main id="contenu" className="flex-1">
        <Outlet />
      </main>
      <footer
        className={`border-t border-slate-200 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400 ${inGame ? 'max-lg:pb-24' : ''}`}
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
