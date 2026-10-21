import { Link } from 'react-router';
import { useGames } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, card } from '../components/ui';
import { formatGameDate, formatTimestamp, MODE_LABELS, PHASE_LABELS } from '../labels';

export function Home() {
  const games = useGames();
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">RÉPUBLIQUE 2027</h1>
        <p className="max-w-2xl text-slate-600 dark:text-slate-300">
          Simulation politique française : menez une campagne présidentielle semaine après semaine,
          affrontez des adversaires autonomes, passez les deux tours, puis gouvernez.
        </p>
        <Link to="/nouvelle-partie" className={buttonPrimary}>
          Nouvelle partie
        </Link>
      </section>

      <section aria-labelledby="titre-parties" className="space-y-4">
        <h2 id="titre-parties" className="text-xl font-semibold">
          Vos parties
        </h2>
        {games.isPending && <p>Chargement des parties…</p>}
        {games.isError && <ErrorMessage error={games.error} onRetry={() => void games.refetch()} />}
        {games.data?.length === 0 && (
          <p className="text-slate-600 dark:text-slate-400">
            Aucune partie pour l’instant. Créez-en une pour commencer.
          </p>
        )}
        {games.data && games.data.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.data.map((game) => (
              <li key={game.id}>
                <Link
                  to={`/parties/${game.id}/tableau-de-bord`}
                  className={`${card} block hover:border-republique-500`}
                >
                  <p className="font-semibold">{game.name}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {MODE_LABELS[game.mode]} · {PHASE_LABELS[game.phase]}
                  </p>
                  <p className="mt-2 text-sm">
                    Semaine {game.week} — {formatGameDate(game.date)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                    Modifiée le {formatTimestamp(game.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
