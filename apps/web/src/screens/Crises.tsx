import type { GameState, Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card } from '../components/ui';
import { useCurrentGame } from './GameLayout';

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const pending = state.pendingDecisions.filter((d) => d.kind === 'crise');
  const happened = ruleset.crises.filter((c) => state.eventHistory[c.id]);
  return (
    <>
      <section aria-labelledby="titre-crises-en-cours" className={`${card} space-y-2 text-sm`}>
        <h2 id="titre-crises-en-cours" className="text-lg font-semibold">
          Crise en cours
        </h2>
        {pending.length > 0 ? (
          pending.map((d) => (
            <p key={d.id}>
              <Badge tone="fictif">Crise fictive</Badge> <strong>{d.label}</strong> : décision à
              prendre depuis le{' '}
              <Link to="../tableau-de-bord" className="underline">
                tableau de bord
              </Link>
              .
            </p>
          ))
        ) : (
          <p>Aucune crise n’attend de décision.</p>
        )}
      </section>

      <section aria-labelledby="titre-crises-passees" className={`${card} space-y-2 text-sm`}>
        <h2 id="titre-crises-passees" className="text-lg font-semibold">
          Crises survenues
        </h2>
        {happened.length > 0 ? (
          <ul className="list-inside list-disc">
            {happened.map((c) => (
              <li key={c.id}>
                {c.libelle} — {state.eventHistory[c.id]!.count} fois, dernière en semaine{' '}
                {state.eventHistory[c.id]!.lastWeek}
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucune crise pour l’instant.</p>
        )}
      </section>

      <section aria-labelledby="titre-catalogue-crises" className="space-y-3">
        <h2 id="titre-catalogue-crises" className="text-lg font-semibold">
          Crises possibles (fictives)
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {ruleset.crises.map((c) => (
            <li key={c.id} className={`${card} space-y-1 text-sm`} aria-label={c.libelle}>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {c.libelle} <Badge tone="fictif">Fictif</Badge>
                {c.majeur && <Badge tone="alerte">Majeure</Badge>}
              </p>
              <p className="text-slate-600 dark:text-slate-400">{c.description}</p>
              <p className="text-xs">
                Réponses possibles : {c.choix.map((choice) => choice.libelle).join(' ; ')}.
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Crises inventées pour le jeu : probabilités, conditions et effets sont des paramètres de
          jeu. Une crise impose une décision au président avant de continuer.
        </p>
      </section>
    </>
  );
}

export function Crises() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  return (
    <section aria-labelledby="titre-ecran-crises" className="space-y-6">
      <h1 id="titre-ecran-crises" className="text-2xl font-bold">
        Crises
      </h1>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
