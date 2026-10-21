import type { Ruleset, Scenario } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { Badge } from '../../components/Badge';
import { label } from '../../components/ui';
import { formatDelta, formatIndicatorDelta, INDICATOR_LABELS, RESOURCE_LABELS } from '../../labels';

// Choix du scénario de départ (phase 7). Chaque scénario non standard est une situation
// fictive : ses écarts (moyens de départ, choc économique, fréquence des crises) sont des
// hypothèses de jeu, affichées telles quelles.

const multiplier = (value: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);

function effects(scenario: Scenario, ruleset: Ruleset): string[] {
  const lines: string[] = [];
  const means = (who: string, modifiers: Scenario['campagne']['joueur']) => {
    const entries = Object.entries(modifiers) as [keyof typeof RESOURCE_LABELS, number][];
    if (entries.length)
      lines.push(
        `${who} : ${entries.map(([k, v]) => `${RESOURCE_LABELS[k]} ${formatDelta(k, v)}`).join(', ')}`,
      );
  };
  means('Votre campagne', scenario.campagne.joueur);
  means('Adversaires', scenario.campagne.adversaires);
  if (scenario.campagne.evenements !== 1)
    lines.push(`Événements de campagne × ${multiplier(scenario.campagne.evenements)}`);
  if (scenario.quinquennat.economie.length)
    lines.push(
      `Début du quinquennat : ${scenario.quinquennat.economie
        .map((e) => `${INDICATOR_LABELS[e.indicateur].label} ${formatIndicatorDelta(e.valeur)}`)
        .join(', ')}`,
    );
  if (scenario.quinquennat.crises !== 1)
    lines.push(`Crises × ${multiplier(scenario.quinquennat.crises)}`);
  const durable = scenario.quinquennat.durable;
  if (durable) {
    const names = new Map(ruleset.crises.map((c) => [c.id, c.libelle]));
    lines.push(
      `${durable.libelle} pendant ${durable.semaines} semaines` +
        (durable.vulnerabilites.length
          ? ` (plus probables : ${durable.vulnerabilites.map((v) => names.get(v.crise) ?? v.crise).join(', ')})`
          : ''),
    );
  }
  return lines;
}

export function ScenarioPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const ruleset = useCurrentRuleset();
  if (!ruleset.data) return null;
  return (
    <fieldset className="space-y-2">
      <legend className={label}>Scénario de départ</legend>
      <div className="grid gap-2">
        {ruleset.data.scenarios.map((scenario) => (
          <label
            key={scenario.id}
            className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <input
              type="radio"
              name="scenario"
              value={scenario.id}
              checked={value === scenario.id}
              onChange={() => onChange(scenario.id)}
              className="mt-1"
            />
            <span className="space-y-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{scenario.libelle}</span>
                {scenario.nature === 'fictif' && <Badge tone="fictif">Scénario fictif</Badge>}
              </span>
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                {scenario.description}
              </span>
              {effects(scenario, ruleset.data).map((line) => (
                <span key={line} className="block text-xs text-slate-600 dark:text-slate-400">
                  {line}
                </span>
              ))}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Les écarts des scénarios sont des hypothèses de jeu ; ils ne changent ni les règles
        constitutionnelles ni le décompte des voix.
      </p>
    </fieldset>
  );
}
