import type { GameDetail } from '@r2027/shared';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useGame } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { formatGameDate } from '../labels';
import { GAME_SCREENS } from './registry';

export function useCurrentGame(): GameDetail {
  return useOutletContext<GameDetail>();
}

export function GameLayout() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId);

  if (game.isPending) {
    return <p className="mx-auto max-w-6xl px-4 py-8">Chargement de la partie…</p>;
  }
  if (game.isError) {
    const notFound =
      game.error instanceof ApiRequestError && [400, 404].includes(game.error.status);
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        {notFound ? (
          <p role="alert">Cette partie est introuvable.</p>
        ) : (
          <ErrorMessage error={game.error} onRetry={() => void game.refetch()} />
        )}
        <Link to="/" className="text-republique-600 underline dark:text-republique-100">
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:py-8">
      <div className="mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Semaine {game.data.week} · {formatGameDate(game.data.date)}
        </p>
        <p className="text-lg font-semibold">{game.data.name}</p>
      </div>
      <div className="md:grid md:grid-cols-[14rem_1fr] md:gap-8">
        <nav aria-label="Écrans de la partie" className="-mx-4 mb-6 md:mx-0 md:mb-0">
          <ul className="flex gap-2 overflow-x-auto px-4 pb-2 md:flex-col md:gap-1 md:overflow-visible md:px-0">
            {GAME_SCREENS.map((screen) => (
              <li key={screen.path} className="shrink-0">
                <NavLink
                  to={screen.path}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-republique-600 font-semibold text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 md:bg-transparent'
                    }`
                  }
                >
                  <span>{screen.label}</span>
                  {!screen.available && (
                    <span
                      className="text-xs opacity-70"
                      aria-label={`prévu en phase ${screen.phase}`}
                    >
                      P{screen.phase}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet context={game.data} />
        </div>
      </div>
    </div>
  );
}
