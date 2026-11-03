import type { GameDetail } from '@r2027/shared';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useGame, useRuleset } from '../api/hooks';
import { ambianceForPhase } from '../audio/ambiance';
import { useAmbiance } from '../audio/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { GameHud } from './shell/GameHud';
import { GameNav } from './shell/GameNav';

export function useCurrentGame(): GameDetail {
  return useOutletContext<GameDetail>();
}

function Game({ game }: { game: GameDetail }) {
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  useAmbiance(ambianceForPhase(game.phase), 1);
  const withRealPeople = Object.values(game.state.actors).some(
    (a) => a.candidate.nature === 'reel',
  );
  return (
    <div className="mx-auto max-w-7xl px-4 pb-28 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8 lg:pb-10">
      <GameNav />
      <div className="min-w-0">
        <GameHud game={game} ruleset={ruleset.data} />
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:mb-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Partie{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{game.name}</span>
          </p>
          {withRealPeople && (
            <p className="text-xs text-teal-800 dark:text-teal-200">
              Partie avec des personnalités réelles : tout ce qu’elles font ici est simulé.{' '}
              <Link to="campagne#candidats" className="underline">
                Fiches et sources
              </Link>
            </p>
          )}
        </div>
        <Outlet context={game} />
      </div>
    </div>
  );
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
  return <Game game={game.data} />;
}
