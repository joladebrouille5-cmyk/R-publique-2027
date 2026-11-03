import { candidateName, type GameState, type Poll, type Ruleset } from '@r2027/shared';
import { useState } from 'react';
import { useRuleset } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { ShareBar } from '../components/ShareBar';
import { buttonSecondary, card } from '../components/ui';
import {
  formatCount,
  formatGameDate,
  formatPollDelta,
  formatShare,
  POLL_KIND_LABELS,
  pollFactorLabel,
} from '../labels';
import { colorOf, portraitOf } from '../portraits';
import { useCurrentGame } from './GameLayout';
import { ScreenHeading } from '../components/Disclosure';

const PAGE = 8;

function nameOf(state: GameState, actorId: string): string {
  const actor = state.actors[actorId];
  return actor ? candidateName(actor.candidate) : actorId;
}

type PollResult = Poll['results'][number];

/** Écart depuis la vague précédente de l'institut, avec une flèche (le texte fait foi). */
function Variation({ value }: { value: number | null }) {
  const tone =
    value === null || value === 0
      ? 'text-encre-2'
      : value > 0
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-red-700 dark:text-red-400';
  return (
    <span className={tone}>
      {value !== null && value !== 0 && (
        <span aria-hidden="true" className="mr-0.5 text-[0.7em]">
          {value > 0 ? '▲' : '▼'}
        </span>
      )}
      {formatPollDelta(value)}
    </span>
  );
}

/**
 * Résultats d'un sondage : valeur, écart, marge d'erreur et barre (la valeur écrite fait foi),
 * chaque candidat à la couleur de sa famille politique (convention du jeu).
 */
export function PollResults({
  poll,
  state,
  ruleset,
}: {
  poll: Poll;
  state: GameState;
  ruleset?: Ruleset;
}) {
  const results = [...poll.results].sort((a, b) => b.value - a.value);
  const max = Math.max(...results.map((r) => r.value + r.margin));
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{`${POLL_KIND_LABELS[poll.kind]} — ${poll.institute}, semaine ${poll.week}`}</caption>
      <thead>
        <tr className="text-xs text-encre-3">
          <th scope="col" className="py-1 font-medium">
            Candidat
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {poll.kind === 'popularite' ? 'Opinions favorables' : 'Intentions'}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Écart
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Marge
          </th>
          <th scope="col" className="w-1/4 py-1 font-medium">
            <span className="sr-only">Barre</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => {
          const player = result.actorId === state.player.actorId;
          return (
            <tr key={result.actorId} className="border-t border-slate-100 dark:border-white/[0.06]">
              <td className={`py-1.5 pr-2 ${player ? 'font-semibold' : ''}`}>
                <span className="flex items-center gap-2">
                  {state.actors[result.actorId] && (
                    <Avatar
                      portrait={portraitOf(state.actors[result.actorId]!, ruleset)}
                      size="xs"
                    />
                  )}
                  <span className="min-w-0">
                    {nameOf(state, result.actorId)}
                    {player && ' (vous)'}
                  </span>
                </span>
              </td>
              <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums">
                {formatShare(result.value)}
              </td>
              <td className="py-1 pr-2 text-right text-xs whitespace-nowrap tabular-nums">
                <Variation value={result.variation} />
              </td>
              <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums text-encre-2">
                ± {formatShare(result.margin).replace(' %', ' pt')}
              </td>
              <td className="py-1">
                <ShareBar
                  value={result.value}
                  max={max}
                  margin={result.margin}
                  emphasis={player}
                  color={colorOf(state.actors[result.actorId], ruleset)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Décomposition d'une variation : chaque fait et sa part, jusqu'au total (somme exacte). */
function Contributions({ result }: { result: PollResult }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {result.explication.map((c) => (
        <li key={c.label} className="flex justify-between gap-3">
          <span>{pollFactorLabel(c.label)}</span>
          <span className="shrink-0 tabular-nums">
            <Variation value={c.valeur} />
          </span>
        </li>
      ))}
      <li className="flex justify-between gap-3 border-t border-slate-200 pt-0.5 font-semibold dark:border-slate-700">
        <span>Total</span>
        <span className="shrink-0 tabular-nums">
          <Variation value={result.variation} />
        </span>
      </li>
    </ul>
  );
}

/**
 * « Pourquoi ça bouge ? » (phase 11) : l'écart de chaque candidat depuis la vague précédente du
 * même institut, décomposé par facteur du modèle d'opinion. Le vôtre est ouvert ; les autres se
 * déplient.
 */
export function PollExplanation({ poll, state }: { poll: Poll; state: GameState }) {
  const explained = [...poll.results]
    .filter((r) => r.variation !== null && r.explication.length > 0)
    .sort((a, b) => b.value - a.value);
  if (explained.length === 0) return null;
  const mine = explained.find((r) => r.actorId === state.player.actorId);
  const others = explained.filter((r) => r !== mine);
  return (
    <section aria-labelledby={`pourquoi-${poll.id}`} className="space-y-2">
      <h3 id={`pourquoi-${poll.id}`} className="font-semibold">
        Pourquoi ça bouge ?
      </h3>
      <p className="text-xs text-encre-2">
        Écart depuis la vague précédente de {poll.institute}, en points, décomposé par facteur du
        modèle d’opinion simulé. L’échantillon est redressé : sans fait nouveau, les intentions
        bougent peu.
      </p>
      {mine && (
        <div>
          <p className="text-sm font-semibold">{nameOf(state, mine.actorId)} (vous)</p>
          <Contributions result={mine} />
        </div>
      )}
      {others.map((result) => (
        <details key={result.actorId}>
          <summary className="cursor-pointer text-sm">
            {nameOf(state, result.actorId)} : <Variation value={result.variation} />
          </summary>
          <div className="mt-1 pl-4">
            <Contributions result={result} />
          </div>
        </details>
      ))}
    </section>
  );
}

/** Fiche technique (§5.2) : institut, terrain, publication, échantillon, méthode, limites. */
export function PollSheet({ poll }: { poll: Poll }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
      <dt className="text-encre-3">Institut</dt>
      <dd>{poll.institute}</dd>
      <dt className="text-encre-3">Terrain</dt>
      <dd>
        du {formatGameDate(poll.fieldStart)} au {formatGameDate(poll.fieldEnd)}
      </dd>
      <dt className="text-encre-3">Publication</dt>
      <dd>{formatGameDate(poll.publishedAt)}</dd>
      <dt className="text-encre-3">Échantillon</dt>
      <dd>{formatCount(poll.sampleSize)} personnes</dd>
      <dt className="text-encre-3">Méthode</dt>
      <dd>{poll.method}</dd>
      <dt className="text-encre-3">Limites</dt>
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
  const ruleset = useRuleset(game.rulesetVersion, state.cycle).data;
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
      <ScreenHeading id="titre-sondages">Sondages</ScreenHeading>
      <p className="text-sm text-encre-2">
        <Badge tone="simule">Sondage simulé</Badge> Les instituts sont fictifs. Chaque sondage
        interroge un échantillon tiré de l’opinion simulée : il comporte une marge d’erreur et un
        biais propre à l’institut, atténués par le redressement. Ce n’est jamais une prédiction du
        résultat.
      </p>

      {polls.length === 0 && (
        <p className={card}>
          Aucun sondage publié pour l’instant : le premier paraît à la fin de la première semaine.
        </p>
      )}

      {latest && (
        <section aria-labelledby="titre-dernier" className={`${card} space-y-3`}>
          <h2 id="titre-dernier" className="text-2xl">
            Dernier sondage : {POLL_KIND_LABELS[latest.kind].toLowerCase()}
          </h2>
          <p className="text-xs text-encre-3">
            {latest.institute}, terrain du {formatGameDate(latest.fieldStart)} au{' '}
            {formatGameDate(latest.fieldEnd)}, {formatCount(latest.sampleSize)} personnes. Le trait
            fin indique la marge d’erreur à 95 %.
          </p>
          <PollResults poll={latest} state={state} ruleset={ruleset} />
          <PollExplanation poll={latest} state={state} />
        </section>
      )}

      {evolution.length > 1 && (
        // Défilement horizontal possible sur téléphone : la zone se prend au clavier.
        <section
          aria-labelledby="titre-evolution"
          tabIndex={0}
          className={`${card} space-y-3 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-republique-500 dark:focus-visible:ring-dorure`}
        >
          <h2 id="titre-evolution" className="text-2xl">
            Évolution des intentions au premier tour
          </h2>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Intentions de vote au premier tour, derniers sondages
            </caption>
            <thead>
              <tr className="text-xs text-encre-3">
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
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30"
                        style={{ backgroundColor: colorOf(state.actors[actorId], ruleset) }}
                      />
                      {nameOf(state, actorId)}
                    </span>
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
          <h2 id="titre-tous" className="text-2xl">
            Tous les sondages publiés ({polls.length})
          </h2>
          <ol className="space-y-3">
            {polls.slice(0, shown).map((poll) => (
              <li key={poll.id} className={card}>
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{title(poll)}</span>
                    <span className="block text-xs text-encre-3">
                      Semaine {poll.week} · publié le {formatGameDate(poll.publishedAt)}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <PollResults poll={poll} state={state} ruleset={ruleset} />
                    <PollExplanation poll={poll} state={state} />
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
