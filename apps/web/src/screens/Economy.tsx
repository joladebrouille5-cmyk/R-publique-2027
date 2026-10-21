import {
  ECONOMIC_INDICATORS,
  type EconomicIndicator,
  type EconomyChange,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { useJournal, useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card } from '../components/ui';
import { formatIndicator, formatIndicatorDelta, formatGameDate, INDICATOR_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';

const REAL: readonly EconomicIndicator[] = [
  'croissance',
  'inflation',
  'chomage',
  'deficit',
  'dette',
  'confiance',
];
const STATUS = { estimation: 'Donnée Insee', deduit: 'Déduit de séries Insee' } as const;

function Origin({ ruleset, indicator }: { ruleset: Ruleset; indicator: EconomicIndicator }) {
  if (!REAL.includes(indicator)) {
    return (
      <span>
        <Badge tone="fictif">Convention du jeu</Badge> valeur de départ fixée par le jeu de règles
      </span>
    );
  }
  const real =
    ruleset.economieReelle.indicateurs[
      indicator as keyof typeof ruleset.economieReelle.indicateurs
    ];
  const sources = ruleset.economieReelle.sources.filter((s) => real.sourceIds.includes(s.id));
  return (
    <span>
      <Badge tone="reel">{STATUS[real.statut]}</Badge> {formatIndicator(indicator, real.valeur)} (
      {real.periode}) —{' '}
      {sources.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ', '}
          <a href={s.url} className="underline" rel="noreferrer" target="_blank">
            {s.titre.replace(/^Insee — /, '')}
          </a>
        </span>
      ))}
    </span>
  );
}

function Content({
  state,
  ruleset,
  lastChanges,
  lastWeek,
}: {
  state: GameState;
  ruleset: Ruleset;
  lastChanges: readonly EconomyChange[];
  lastWeek: number | null;
}) {
  const economy = state.economie;
  if (!economy) {
    return (
      <p className={`${card} text-sm`}>
        L’économie est simulée pendant le quinquennat : elle démarre après l’élection
        présidentielle, avec les dernières valeurs publiées par l’Insee.
      </p>
    );
  }
  // Référence : début du quinquennat en cours (ou du précédent pendant une campagne), à défaut
  // la première valeur enregistrée.
  const term = state.quinquennat?.depart ?? state.historique.quinquennats.at(-1)?.bilan.debut;
  const start =
    term?.indicateurs != null
      ? { semaine: term.semaine, valeurs: term.indicateurs }
      : economy.historique[0]!;
  const startLabel = state.quinquennat ? 'du quinquennat' : 'du quinquennat précédent';
  const changes = new Map(lastChanges.map((c) => [c.indicateur, c]));
  return (
    <>
      {!state.quinquennat && (
        <p className={`${card} text-sm`}>
          Campagne présidentielle en cours : l’économie n’est pas simulée (simplification du jeu).
          Elle reprend à ces valeurs avec le quinquennat suivant.
        </p>
      )}
      <section aria-labelledby="titre-indicateurs" className={`${card} space-y-3 text-sm`}>
        <h2 id="titre-indicateurs" className="text-lg font-semibold">
          Indicateurs
        </h2>
        <ul className="space-y-3">
          {ECONOMIC_INDICATORS.map((indicator) => {
            const value = economy.indicateurs[indicator] ?? 0;
            const since = value - (start.valeurs[indicator] ?? 0);
            const change = changes.get(indicator);
            return (
              <li
                key={indicator}
                aria-label={INDICATOR_LABELS[indicator].label}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{INDICATOR_LABELS[indicator].label}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatIndicator(indicator, value)}
                  </span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {formatIndicatorDelta(since)} depuis le début {startLabel} (semaine{' '}
                  {start.semaine}).
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Départ : <Origin ruleset={ruleset} indicator={indicator} />
                </p>
                {change && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer">
                      Semaine {lastWeek} : {formatIndicatorDelta(change.after - change.before)} —
                      facteurs
                    </summary>
                    <ul className="mt-1 list-inside list-disc">
                      {change.factors.map((f, i) => (
                        <li key={i}>
                          {f.label} : {formatIndicatorDelta(f.value)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Valeurs de départ : dernières séries publiées par l’Insee (consultées le{' '}
          {formatGameDate(ruleset.economieReelle.verifieLe)}). Leur évolution est une simulation :
          modèle de jeu simple (hypothèses du jeu de règles), réformes adoptées et crises fictives.
          Aucune valeur simulée n’est une prévision.
        </p>
      </section>
    </>
  );
}

export function Economy() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const journal = useJournal(game.id);
  const lastReport = journal.data?.pages[0]?.entries.find((entry) => entry.report)?.report ?? null;
  return (
    <section aria-labelledby="titre-ecran-economie" className="space-y-6">
      <h1 id="titre-ecran-economie" className="text-2xl font-bold">
        Économie
      </h1>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && (
        <Content
          state={game.state}
          ruleset={ruleset.data}
          lastChanges={lastReport?.economie ?? []}
          lastWeek={lastReport?.week ?? null}
        />
      )}
    </section>
  );
}
