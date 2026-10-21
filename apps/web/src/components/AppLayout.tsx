import { Link, Outlet } from 'react-router';
import { useHealth } from '../api/hooks';
import { ThemeToggle, useApplyTheme } from './ThemeToggle';

function ServerStatus() {
  const health = useHealth();
  const data = health.data;
  const ok = data?.status === 'ok';
  const text = health.isPending
    ? 'Connexion au serveur…'
    : ok
      ? `Serveur connecté · moteur ${data.versions.engine}`
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

export function AppLayout() {
  useApplyTheme();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900"
      >
        Aller au contenu
      </a>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span aria-hidden="true" className="flex h-5 overflow-hidden rounded-sm">
              <span className="w-2 bg-republique-600" />
              <span className="w-2 bg-slate-100" />
              <span className="w-2 bg-red-600" />
            </span>
            RÉPUBLIQUE 2027
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="contenu" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
          <ServerStatus />
          <p>
            Simulation : les événements et résultats affichés sont simulés sauf mention contraire.
          </p>
        </div>
      </footer>
    </div>
  );
}
