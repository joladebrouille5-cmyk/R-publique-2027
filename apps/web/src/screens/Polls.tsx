import { candidateName, type GameState, type Poll } from '@r2027/shared';
import { useState } from 'react';
import { Badge } from '../components/Badge';
import { ShareBar } from '../components/ShareBar';
import { buttonSecondary, card } from '../components/ui';
import { formatCount, formatGameDate, formatShare, POLL_KIND_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';

const PAGE = 8;

function nameOf(state: GameState, actorId: string): string {
  const actor = state.actors[actorId];
  return actor ? candidateName(actor.candidate) : actorId;
}

/** Résultats d'un sondage : valeur, marge d'erreur et barre (la valeur écrite fait foi). */
export function PollResults({ poll, state }: { poll: Poll; state: GameState }) {
  const results = [...poll.results].sort((a, b) => b.value - a.value);
  const max = Math.max(...results.map((r) => r.value + r.margin));
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{`${POLL_KIND_LABELS[poll.kind]} — ${poll.institute}, semaine ${poll.week}`}</caption>
      <thead>
        <tr className="text-xs text-slate-500 dark:text-slate-400">
          <th scope="col" className="py-1 font-medium">
            Candidat
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {poll.kind === 'popularite' ? 'Opinions favorables' : 'Intentions'}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Marge
          </th>
          <th scope="col" className="w-1/3 py-1 font-medium">
            <span className="sr-only">Barre</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => {
          const player = result.actorId === state.player.actorId;
          return (
            <tr key={result.actorId} className="border-t border-slate-100 dark:border-slate-800">
              <td className={`py-1 pr-2 ${player ? 'font-semibold' : ''}`}>
                {nameOf(state, result.actorId)}
                {player && ' (vous)'}
              </td>
              <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums">
                {formatShare(result.value)}
              </td>
              <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                ± {formatShare(result.margin).replace(' %', ' pt')}
              </td>
              <td className="py-1">
                <ShareBar value={result.value} max={max} margin={result.margin} emphasis={player} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Fiche technique (§5.2) : institut, terrain, publication, échantillon, méthode, limites. */
export function PollSheet({ poll }: { poll: Poll }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
      <dt className="text-slate-500 dark:text-slate-400">Institut</dt>
      <dd>{poll.institute}</dd>
      <dt className="text-slate-500 dark:text-slate-400">Terrain</dt>
      <dd>
        du {formatGameDate(poll.fieldStart)} au {formatGameDate(poll.fieldEnd)}
      </dd>
      <dt className="text-slate-500 dark:text-slate-400">Publication</dt>
      <dd>{formatGameDate(poll.publishedAt)}</dd>
      <dt className="text-slate-500 dark:text-slate-400">Échantillon</dt>
      <dd>{formatCount(poll.sampleSize)} personnes</dd>
      <dt className="text-slate-500 dark:text-slate-400">Méthode</dt>
      <dd>{poll.method}</dd>
      <dt className="text-slate-500 dark:text-slate-400">Limites</dt>
      <dd>{poll.limits}</dd>
    </dl>
  );
}

/** Sondage de second tour publié avant le premier : hypothèse entre les deux premiers. */
const isHypothesis = (poll: Poll) => poll.id.endsWith('-hypothese-t2');

function title(poll: Poll): string {
  return `${POLL_KIND_LABELS[poll.kind]}${isHypothesis(poll) ? ' (hypothèse)' : ''} — ${poll.institute}`;
}

export function Polls() {
  const game = useCurrentGame();
  const { state } = game;
  const [shown, setShown] = useState(PAGE);
  const polls = [...state.polls].reverse();
  const round = state.meta.phase === 'entre_deux_tours' ? 'intentions_t2' : 'intentions_t1';
  // Avant le premier sondage de second tour, le dernier sondage publié reste celui du premier.
  const latest =
    polls.find((p) => p.kind === round && !isHypothesis(p)) ??
    polls.find((p) => p.kind === 'intentions_t1');
  const evolution = polls
    .filter((p) => p.kind === 'intentions_t1')
    .slice(0, 6)
    .reverse();
  const evolutionIds = [...(evolution.at(-1)?.results ?? [])]
    .sort((a, b) => b.value - a.value)
    .map((r) => r.actorId);

  return (
    <section aria-labelledby="titre-sondages" className="space-y-6">
      <h1 id="titre-sondages" className="text-2xl font-bold">
        Sondages
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        <Badge tone="simule">Sondage simulé</Badge> Les instituts sont fictifs. Chaque sondage
        interroge un échantillon tiré de l’opinion simulée : il comporte une marge d’erreur et un
        biais propre à l’institut. Ce n’est jamais une prédiction du résultat.
      </p>

      {polls.length === 0 && (
        <p className={card}>
          Aucun sondage publié pour l’instant : le premier paraît à la fin de la première semaine.
        </p>
      )}

      {latest && (
        <section aria-labelledby="titre-dernier" className={`${card} space-y-3`}>
          <h2 id="titre-dernier" className="text-lg font-semibold">
            Dernier sondage : {POLL_KIND_LABELS[latest.kind].toLowerCase()}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {latest.institute}, terrain du {formatGameDate(latest.fieldStart)} au{' '}
            {formatGameDate(latest.fieldEnd)}, {formatCount(latest.sampleSize)} personnes. Le trait
            noir indique la marge d’erreur à 95 %.
          </p>
          <PollResults poll={latest} state={state} />
        </section>
      )}

      {evolution.length > 1 && (
        <section aria-labelledby="titre-evolution" className={`${card} space-y-3 overflow-x-auto`}>
          <h2 id="titre-evolution" className="text-lg font-semibold">
            Évolution des intentions au premier tour
          </h2>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Intentions de vote au premier tour, derniers sondages
            </caption>
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Candidat
                </th>
                {evolution.map((poll) => (
                  <th
                    key={poll.id}
                    scope="col"
                    className="py-1 pr-2 text-right align-bottom font-medium"
                  >
                    Sem. {poll.week}
                    <span className="block font-normal">{poll.institute}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evolutionIds.map((actorId) => (
                <tr key={actorId} className="border-t border-slate-100 dark:border-slate-800">
                  <th
                    scope="row"
                    className={`py-1 pr-2 text-left ${actorId === state.player.actorId ? 'font-semibold' : 'font-normal'}`}
                  >
                    {nameOf(state, actorId)}
                  </th>
                  {evolution.map((poll) => {
                    const result = poll.results.find((r) => r.actorId === actorId);
                    return (
                      <td
                        key={poll.id}
                        className="py-1 pr-2 text-right tabular-nums whitespace-nowrap"
                      >
                        {result ? formatShare(result.value) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {polls.length > 0 && (
        <section aria-labelledby="titre-tous" className="space-y-3">
          <h2 id="titre-tous" className="text-lg font-semibold">
            Tous les sondages publiés ({polls.length})
          </h2>
          <ol className="space-y-3">
            {polls.slice(0, shown).map((poll) => (
              <li key={poll.id} className={card}>
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{title(poll)}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Semaine {poll.week} · publié le {formatGameDate(poll.publishedAt)}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <PollResults poll={poll} state={state} />
                    <PollSheet poll={poll} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
          {shown < polls.length && (
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => setShown(shown + PAGE)}
            >
              Afficher les sondages plus anciens
            </button>
          )}
        </section>
      )}
    </section>
  );
}
