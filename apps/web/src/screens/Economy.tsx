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
import { formatIndicator, formatIndicatorDelta, INDICATOR_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';
import { ScreenHeading } from '../components/Disclosure';

const REAL: readonly EconomicIndicator[] = [
  'croissance',
  'inflation',
  'chomage',
  'deficit',
  'dette',
  'confiance',
];
const STATUS = { estimation: 'Donnée réelle', deduit: 'Déduite de données réelles' } as const;

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
  return (
    <span>
      <Badge tone="reel">{STATUS[real.statut]}</Badge> {formatIndicator(indicator, real.valeur)} (
      {real.periode})
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
        présidentielle, avec les dernières valeurs réelles publiées.
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
                <p className="text-xs text-encre-2">
                  {formatIndicatorDelta(since)} depuis le début {startLabel} (semaine{' '}
                  {start.semaine}).
                </p>
                <p className="text-xs text-encre-2">
                  Départ : <Origin ruleset={ruleset} indicator={indicator} />
                </p>
                {/* Phase 13 : facteurs à plat, sans volet dans la section dépliée. */}
                {change && (
                  <div className="mt-1 text-xs">
                    <p className="font-medium">
                      Semaine {lastWeek} : {formatIndicatorDelta(change.after - change.before)}
                    </p>
                    {change.factors.length > 0 && (
                      <ul className="list-inside list-disc text-encre-2">
                        {change.factors.map((f, i) => (
                          <li key={i}>
                            {f.label} : {formatIndicatorDelta(f.value)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-encre-3">
          Valeurs de départ réelles ; leur évolution est une simulation (hypothèses du jeu, réformes
          adoptées, crises fictives), jamais une prévision. Sources : Paramètres → Crédits.
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
      <ScreenHeading id="titre-ecran-economie">Économie</ScreenHeading>
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
