import type { ActionDefinition, Effect, Resources, Ruleset } from '@r2027/shared';
import { Badge } from '../../components/Badge';
import { buttonPrimary, buttonSecondary, card } from '../../components/ui';
import { formatDelta, formatResource, PORTEE_LABELS, RESOURCE_LABELS } from '../../labels';

type Props = {
  ruleset: Ruleset;
  resources: Resources;
  plan: readonly string[];
  onAdd: (actionId: string) => void;
  onRemove: (index: number) => void;
};

function describeEffect(effect: Effect): string {
  const amount = formatDelta(effect.ressource, effect.base);
  const spread = effect.ecart ? ` (±${formatDelta(effect.ressource, effect.ecart).slice(1)})` : '';
  const delay = effect.delaiSemaines
    ? `, la semaine suivante${effect.delaiSemaines > 1 ? ` (+${effect.delaiSemaines})` : ''}`
    : '';
  return `${RESOURCE_LABELS[effect.ressource]} ${amount}${spread}${delay}`;
}

/** Ce qui reste après les actions déjà programmées (coûts fixes, sans simulation). */
function remainingAfter(plan: readonly string[], ruleset: Ruleset, resources: Resources) {
  let budget = resources.budgetCentimes;
  let time = resources.tempsHeures;
  for (const id of plan) {
    const action = ruleset.actions.find((a) => a.id === id);
    if (!action) continue;
    budget -= action.cout.budgetCentimes;
    time -= action.cout.tempsHeures;
  }
  return { budget, time };
}

function unavailableReason(
  action: ActionDefinition,
  remaining: { budget: number; time: number },
  resources: Resources,
  full: boolean,
): string | null {
  if (full) return 'Nombre maximal d’actions atteint pour cette semaine.';
  if (resources.militants < action.prerequis.militantsMin) {
    return `Nécessite ${action.prerequis.militantsMin} militants.`;
  }
  if (action.cout.budgetCentimes > remaining.budget) return 'Budget restant insuffisant.';
  if (action.cout.tempsHeures > remaining.time) return 'Temps restant insuffisant.';
  return null;
}

export function ActionPlanner({ ruleset, resources, plan, onAdd, onRemove }: Props) {
  const remaining = remainingAfter(plan, ruleset, resources);
  const full = plan.length >= ruleset.jeu.actionsMaxParSemaine;

  return (
    <section aria-labelledby="titre-plan" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-plan" className="text-lg font-semibold">
          Plan d’actions de la semaine
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
          Reste après le plan : {formatResource('budgetCentimes', remaining.budget)} ·{' '}
          {formatResource('tempsHeures', remaining.time)} · {plan.length}/
          {ruleset.jeu.actionsMaxParSemaine} actions
        </p>
      </div>

      {plan.length > 0 ? (
        <ol className="space-y-2" aria-label="Actions programmées">
          {plan.map((id, index) => {
            const action = ruleset.actions.find((a) => a.id === id);
            return (
              <li
                key={`${id}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <span>
                  {index + 1}. {action?.libelle ?? id}
                </span>
                <button
                  type="button"
                  className={`${buttonSecondary} px-3 py-1`}
                  onClick={() => onRemove(index)}
                  aria-label={`Retirer ${action?.libelle ?? id}`}
                >
                  Retirer
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucune action programmée : la semaine passera sans initiative de votre part.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2" aria-label="Catalogue des actions">
        {ruleset.actions.map((action) => {
          const reason = unavailableReason(action, remaining, resources, full);
          return (
            <li
              key={action.id}
              className={`${card} flex flex-col gap-2`}
              aria-label={action.libelle}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{action.libelle}</p>
                <Badge>Portée {PORTEE_LABELS[action.portee]}</Badge>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">{action.description}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500 dark:text-slate-400">Coût</dt>
                <dd>
                  {formatResource('budgetCentimes', action.cout.budgetCentimes)} ·{' '}
                  {formatResource('tempsHeures', action.cout.tempsHeures)}
                  {action.prerequis.militantsMin > 0 &&
                    ` · ${action.prerequis.militantsMin} militants requis`}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Effet attendu</dt>
                <dd>{action.effets.map(describeEffect).join(' ; ')}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Risque</dt>
                <dd>
                  {action.risque
                    ? `${Math.round(action.risque.probabilite * 100)} % : ${action.risque.libelle} (${action.risque.effets.map(describeEffect).join(' ; ')})`
                    : 'aucun'}
                </dd>
              </dl>
              {action.note && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{action.note}</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className={`${buttonPrimary} px-3 py-1.5`}
                  disabled={reason !== null}
                  onClick={() => onAdd(action.id)}
                  aria-label={`Ajouter ${action.libelle}`}
                >
                  Ajouter
                </button>
                {reason && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{reason}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Coûts, effets et probabilités sont des paramètres de jeu (hypothèses), pas des données
        officielles. Le serveur revalide chaque action.
      </p>
    </section>
  );
}
