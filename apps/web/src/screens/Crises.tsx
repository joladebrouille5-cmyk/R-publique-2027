import type { Consequence, GameState, LongTermEffect, Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card } from '../components/ui';
import { formatIndicatorDelta, INDICATOR_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, i, 1)),
  ),
);
const ORIGIN_LABELS: Record<Consequence['origine'], string> = {
  crise: 'Séquelle d’une crise',
  decision: 'Suite d’une décision',
  scenario: 'Scénario de départ',
};
const multiplier = (value: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);

/** Effets hebdomadaires et fragilités d'une conséquence durable, en clair. */
function describeLasting(
  effect: Pick<LongTermEffect, 'economie' | 'popularite' | 'vulnerabilites'>,
  ruleset: Ruleset,
): string {
  const names = new Map(ruleset.crises.map((c) => [c.id, c.libelle]));
  const parts = [
    ...effect.economie.map(
      (e) =>
        `${INDICATOR_LABELS[e.indicateur].label} ${formatIndicatorDelta(e.valeur)} par semaine`,
    ),
    ...(effect.popularite
      ? [`popularité du président ${formatIndicatorDelta(effect.popularite)} pt par semaine`]
      : []),
    ...effect.vulnerabilites.map(
      (v) =>
        `${names.get(v.crise) ?? v.crise} ${v.multiplicateur > 1 ? 'plus' : 'moins'} probable (× ${multiplier(v.multiplicateur)})`,
    ),
  ];
  return parts.join(' ; ') || 'sans effet chiffré';
}

function Consequences({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const week = state.meta.week;
  const current = state.consequences.filter((c) => c.fin >= week);
  const past = state.consequences.filter((c) => c.fin < week);
  return (
    <section aria-labelledby="titre-consequences" className={`${card} space-y-2 text-sm`}>
      <h2 id="titre-consequences" className="text-lg font-semibold">
        Conséquences durables
      </h2>
      {current.length > 0 ? (
        <ul className="space-y-2">
          {current.map((c) => (
            <li key={c.id}>
              <p className="flex flex-wrap items-center gap-2">
                <Badge tone="simule">{ORIGIN_LABELS[c.origine]}</Badge>
                <strong>{c.libelle}</strong>
                <span className="text-slate-600 dark:text-slate-400">
                  {c.debut > week
                    ? `à partir de la semaine ${c.debut}`
                    : `encore ${c.fin - week + 1} semaine(s), jusqu’à la semaine ${c.fin}`}
                </span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {describeLasting(c, ruleset)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucune conséquence durable en cours.</p>
      )}
      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer">Conséquences achevées ({past.length})</summary>
          <ul className="mt-1 list-inside list-disc">
            {past.map((c) => (
              <li key={c.id}>
                {c.libelle} (semaines {c.debut} à {c.fin})
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Effets et durées sont des hypothèses de jeu ; chaque effet hebdomadaire apparaît dans les
        facteurs de l’économie et de la popularité. Pendant une campagne présidentielle, ils ne
        s’appliquent pas (le quinquennat n’est pas simulé).
      </p>
    </section>
  );
}

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const pending = state.pendingDecisions.filter((d) => d.kind === 'crise');
  const happened = ruleset.crises.filter((c) => state.eventHistory[c.id]);
  const scenario = ruleset.scenarios.find((s) => s.id === state.scenario);
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

      <Consequences state={state} ruleset={ruleset} />

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
              {c.mois && (
                <p className="text-xs">Saison : {c.mois.map((m) => MONTHS[m - 1]).join(', ')}.</p>
              )}
              {c.durable && (
                <p className="text-xs">
                  Séquelles : {c.durable.libelle}, {c.durable.semaines} semaines —{' '}
                  {describeLasting(c.durable, ruleset)}.
                </p>
              )}
              <ul className="list-inside list-disc text-xs">
                {c.choix.map((choice) => (
                  <li key={choice.id}>
                    {choice.libelle}
                    {choice.id === c.choixParDefaut && ' (choix par défaut)'}
                    {choice.durable &&
                      ` — durable : ${choice.durable.libelle}, ${choice.durable.semaines} semaines (${describeLasting(choice.durable, ruleset)})`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Crises inventées pour le jeu : probabilités, conditions et effets sont des paramètres de
          jeu. Une crise impose une décision au président avant de continuer.
          {scenario && scenario.quinquennat.crises !== 1
            ? ` Scénario « ${scenario.libelle} » : probabilité des crises × ${multiplier(scenario.quinquennat.crises)}.`
            : ''}
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
