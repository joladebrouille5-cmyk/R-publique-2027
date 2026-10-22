import { Link } from 'react-router';
import { useGames } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, cardInteractive } from '../components/ui';
import { formatGameDate, formatTimestamp, MODE_LABELS, PHASE_LABELS } from '../labels';

export function Home() {
  const games = useGames();
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* Générique d'ouverture de plateau : le titre en grand, liseré tricolore. */}
      <section className="relative overflow-hidden rounded-dossier border border-slate-200/80 bg-white px-6 pt-8 pb-7 shadow-raised sm:px-10 sm:pt-12 dark:border-republique-400/20 dark:bg-slate-900/70">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1">
          <span className="flex-1 bg-republique-500" />
          <span className="flex-1 bg-slate-200 dark:bg-slate-100" />
          <span className="flex-1 bg-red-500" />
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-24 hidden size-96 rounded-full bg-republique-500/30 blur-3xl dark:block"
        />
        <p className="relative text-sm font-semibold text-slate-600 dark:text-slate-300">
          Simulation politique française
        </p>
        <h1 className="relative mt-1 font-display leading-[0.82] font-black tracking-tight">
          <span className="block text-5xl sm:text-7xl">RÉPUBLIQUE</span>{' '}
          <span className="block text-8xl text-republique-600 sm:text-[10rem] dark:text-white dark:[text-shadow:0_0_42px_rgb(98_134_255/0.65)]">
            2027
          </span>
        </h1>
        <p className="relative mt-5 max-w-2xl text-lg text-slate-700 dark:text-slate-300">
          Menez une campagne présidentielle semaine après semaine, affrontez des adversaires
          autonomes, vivez les soirées électorales des deux tours, puis gouvernez.
        </p>
        <Link to="/nouvelle-partie" className={`${buttonPrimary} relative mt-6 px-7 text-base`}>
          Nouvelle partie
        </Link>
      </section>

      <section aria-labelledby="titre-parties" className="space-y-4">
        <h2 id="titre-parties" className="text-2xl">
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
                  className={`${cardInteractive} block`}
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
