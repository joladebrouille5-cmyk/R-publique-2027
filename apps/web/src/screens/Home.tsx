import { candidateName, type GameSummary, type Ruleset } from '@r2027/shared';
import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useCurrentRuleset, useGame, useGames, useRuleset } from '../api/hooks';
import { Affiche } from '../components/Affiche';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrestige, buttonSecondary, cardRaised, listPanel } from '../components/ui';
import { formatGameDate, formatTimestamp, MODE_LABELS, PHASE_LABELS } from '../labels';
import { portraitOf, portraitOfFictional } from '../portraits';
import { nextBallot } from './shell/GameHud';

// Écran-titre (phase 16) : le nom du jeu en Didone, puis le mur d'affichage d'un soir de
// campagne — les panneaux numérotés devant l'école, une affiche par candidat fictif du jeu de
// règles (jamais une personne réelle), le dernier panneau laissé libre pour le joueur. La
// dernière partie se reprend d'un geste ; les autres suivent en liste.

const PANELS = 8;

/** Mur d'affichage : panneaux métalliques numérotés, affiches collées l'une après l'autre. */
function MurDAffichage({ ruleset }: { ruleset: Ruleset | undefined }) {
  const candidates = ruleset?.candidatsFictifs ?? [];
  return (
    <figure className="relative mt-10 sm:mt-14">
      {/* Lumière du réverbère sur le mur. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-4 -top-24 -bottom-8 bg-[radial-gradient(50%_50%_at_50%_45%,rgb(201_162_39/0.12),transparent_100%)] dark:bg-[radial-gradient(50%_50%_at_50%_45%,rgb(227_196_108/0.13),transparent_100%)]"
      />
      <ol
        aria-label="Mur d’affichage : les candidats fictifs de la campagne"
        className="relative grid grid-cols-4 gap-x-2.5 gap-y-4 text-[9px] min-[400px]:text-[10px] sm:gap-x-4 sm:text-[13px] lg:grid-cols-8 lg:gap-x-3.5 lg:text-[11.5px] xl:text-[12.5px]"
      >
        {Array.from({ length: PANELS }, (_, index) => {
          const candidate = candidates[index];
          const free = ruleset !== undefined && candidate === undefined;
          return (
            <li key={index} className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="relative z-10 -mb-[0.7em] min-w-[2.4em] rounded-[2px] border border-slate-400/70 bg-white px-[0.4em] text-center font-display text-[1.15em] leading-[1.45] font-bold text-slate-950 shadow-sm"
              >
                {index + 1}
              </span>
              <div className="w-full rounded-[3px] bg-[linear-gradient(180deg,#d6dbe5,#a3acbd)] p-[0.45em] pt-[1em] shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_14px_24px_-16px_rgb(5_10_28/0.6)] dark:bg-[linear-gradient(180deg,#3a4566,#232b48)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_18px_30px_-16px_rgb(0_0_0/0.9)]">
                {candidate ? (
                  <Affiche
                    portrait={portraitOfFictional(candidate, ruleset)}
                    parti={candidate.parti}
                    className="animate-colle"
                    style={{ animationDelay: `${350 + index * 110}ms` }}
                  />
                ) : (
                  <div className="flex aspect-[3/4.1] items-center justify-center rounded-affiche border border-dashed border-slate-500/50 bg-white/40 text-center dark:border-white/20 dark:bg-white/[0.03]">
                    {free && (
                      <span className="px-[0.5em] font-display text-[1.15em] leading-tight font-semibold text-slate-700 italic dark:text-slate-300">
                        Votre affiche
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Pieds du panneau. */}
              <span aria-hidden="true" className="flex w-[64%] justify-between">
                <span className="h-[1.6em] w-[0.4em] bg-slate-400 dark:bg-slate-700" />
                <span className="h-[1.6em] w-[0.4em] bg-slate-400 dark:bg-slate-700" />
              </span>
            </li>
          );
        })}
      </ol>
      {/* Le trottoir : un filet d'or. */}
      <span
        aria-hidden="true"
        className="block h-px bg-[linear-gradient(90deg,transparent,rgb(201_162_39/0.7),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgb(227_196_108/0.6),transparent)]"
      />
      <figcaption className="mt-3 text-center text-xs text-slate-600 dark:text-slate-400">
        Candidats fictifs du jeu : noms, mouvements et visages sont inventés.
      </figcaption>
    </figure>
  );
}

/** Dernière partie jouée : le candidat en affiche, la semaine, le prochain scrutin. */
function Reprendre({ summary }: { summary: GameSummary }) {
  const game = useGame(summary.id);
  const ruleset = useRuleset(game.data?.rulesetVersion ?? '', game.data?.state.cycle);
  const state = game.data?.state;
  const player = state?.player.actorId ? state.actors[state.player.actorId] : undefined;
  const ballot = ruleset.data ? nextBallot(ruleset.data, summary.date) : null;
  return (
    <section aria-labelledby="titre-reprendre" className={`${cardRaised} animate-revele`}>
      <h2 id="titre-reprendre" className="text-xl">
        Dernière partie
      </h2>
      <div className="mt-4 flex gap-4">
        {player && (
          <Affiche
            portrait={portraitOf(player, ruleset.data)}
            parti={player.candidate.parti}
            className="w-[5.5rem] shrink-0 text-[9px] sm:w-24 sm:text-[10px]"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl leading-tight font-bold">
            {player ? candidateName(player.candidate) : summary.name}
          </p>
          <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-300">
            Partie « {summary.name} »
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {PHASE_LABELS[summary.phase]}, semaine {summary.week}
          </p>
          {ballot && (
            <p className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl leading-none font-bold text-or-700 dark:text-dorure">
                {ballot.jours === 0 ? 'Aujourd’hui' : `J−${ballot.jours}`}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {ballot.libelle}
              </span>
            </p>
          )}
        </div>
      </div>
      <Link
        to={`/parties/${summary.id}/tableau-de-bord`}
        viewTransition
        className={`${buttonPrestige} mt-5 w-full`}
      >
        Reprendre la partie
      </Link>
    </section>
  );
}

function GameList({ games }: { games: GameSummary[] }) {
  return (
    <ul className={listPanel}>
      {games.map((game) => (
        <li key={game.id}>
          <Link
            to={`/parties/${game.id}/tableau-de-bord`}
            viewTransition
            className="group flex min-h-16 items-center gap-4 px-4 py-3.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-republique-500 sm:px-6 dark:hover:bg-white/[0.04] dark:focus-visible:outline-dorure"
          >
            <span className="flex w-12 shrink-0 flex-col items-center">
              <span className="font-display text-3xl leading-none font-bold">{game.week}</span>
              <span className="text-[0.7rem] text-slate-600 dark:text-slate-400">semaine</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{game.name}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-400">
                {MODE_LABELS[game.mode]}, {PHASE_LABELS[game.phase].toLocaleLowerCase('fr-FR')}
                <span className="hidden sm:inline"> — {formatGameDate(game.date)}</span>
              </span>
            </span>
            <span className="hidden text-right text-xs text-slate-600 md:block dark:text-slate-400">
              Modifiée le {formatTimestamp(game.updatedAt)}
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Home() {
  const games = useGames();
  const ruleset = useCurrentRuleset();
  const sorted = [...(games.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latest = sorted[0];
  return (
    <div className="pb-14">
      <section aria-labelledby="titre-jeu" className="mx-auto max-w-6xl px-4 pt-6 sm:pt-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end lg:gap-12">
          <div>
            <p className="animate-apparait text-sm font-semibold text-slate-600 dark:text-slate-400">
              Simulation politique française
            </p>
            <h1
              id="titre-jeu"
              className="mt-3 animate-titre font-display leading-[0.86] font-bold tracking-normal"
            >
              <span className="block text-[2.55rem] tracking-[0.05em] min-[400px]:text-[2.8rem] sm:text-7xl lg:text-[5.4rem]">
                RÉPUBLIQUE
              </span>{' '}
              <span className="block mt-[0.04em] text-[7.6rem] tracking-[-0.035em] text-or-600 min-[400px]:text-[8.4rem] sm:text-[11rem] lg:text-[13.5rem] dark:text-dorure dark:[text-shadow:0_0_80px_rgb(227_196_108/0.35)]">
                2027
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-slate-700 sm:text-lg dark:text-slate-300">
              Menez une campagne présidentielle semaine après semaine, affrontez des adversaires
              autonomes, vivez les soirées électorales des deux tours, puis gouvernez.
            </p>
          </div>
          <div className="mt-8 space-y-3 lg:mt-0">
            {latest && <Reprendre summary={latest} />}
            <Link
              to="/nouvelle-partie"
              className={`${latest ? buttonSecondary : buttonPrestige} w-full`}
            >
              <Plus aria-hidden="true" className="size-5" />
              Nouvelle partie
            </Link>
          </div>
        </div>
        <MurDAffichage ruleset={ruleset.data} />
      </section>

      <section aria-labelledby="titre-parties" className="mx-auto mt-14 max-w-6xl space-y-4 px-4">
        <h2 id="titre-parties" className="text-3xl">
          Vos parties
        </h2>
        {games.isPending && <p>Chargement des parties…</p>}
        {games.isError && <ErrorMessage error={games.error} onRetry={() => void games.refetch()} />}
        {games.data?.length === 0 && (
          <p className="text-slate-600 dark:text-slate-400">
            Aucune partie pour l’instant. Créez-en une pour commencer.
          </p>
        )}
        {sorted.length > 0 && <GameList games={sorted} />}
      </section>
    </div>
  );
}
