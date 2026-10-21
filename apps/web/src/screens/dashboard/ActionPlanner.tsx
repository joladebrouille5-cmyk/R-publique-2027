import type {
  ActionDefinition,
  Actor,
  CampaignEffect,
  Effect,
  PlannedAction,
  Ruleset,
} from '@r2027/shared';
import { useId } from 'react';
import { Badge } from '../../components/Badge';
import { buttonPrimary, buttonSecondary, card, input } from '../../components/ui';
import {
  formatCount,
  formatDelta,
  formatEuros,
  formatResource,
  PORTEE_LABELS,
  RESOURCE_LABELS,
} from '../../labels';

type Props = {
  ruleset: Ruleset;
  actor: Actor;
  plan: readonly PlannedAction[];
  /** Heures déjà réservées cette semaine (préparation des propositions du programme). */
  reservedHours: number;
  /** Plafond légal des dépenses applicable à la campagne. */
  cap: number;
  onAdd: (actionId: string) => void;
  onRemove: (index: number) => void;
  onTarget: (index: number, cible: string) => void;
};

function describeEffect(effect: Effect): string {
  const amount = formatDelta(effect.ressource, effect.base);
  const spread = effect.ecart ? ` (±${formatDelta(effect.ressource, effect.ecart).slice(1)})` : '';
  const delay = effect.delaiSemaines
    ? `, la semaine suivante${effect.delaiSemaines > 1 ? ` (+${effect.delaiSemaines})` : ''}`
    : '';
  return `${RESOURCE_LABELS[effect.ressource]} ${amount}${spread}${delay}`;
}

/** Effets de campagne (phase 5), décrits à partir du jeu de règles. */
export function describeCampaign(campagne: CampaignEffect | null): string[] {
  if (!campagne) return [];
  const lines: string[] = [];
  if (campagne.promesses) {
    lines.push(
      `Promesses de parrainage : ${campagne.promesses.base} (±${campagne.promesses.ecart}) dans le département choisi, si des élus y sont encore libres`,
    );
  }
  if (campagne.dons) {
    lines.push(
      `Dons : environ ${formatCount(campagne.dons.donateurs.base)} donateurs (±${formatCount(campagne.dons.donateurs.ecart)}), ${formatEuros(campagne.dons.montantMoyenCentimes)} en moyenne ; les dons interdits sont refusés`,
    );
  }
  if (campagne.emprunt) {
    lines.push(
      `Prêt demandé : ${formatEuros(campagne.emprunt.montantCentimes)}, accordé si le remboursement public attendu le couvre`,
    );
  }
  if (campagne.exposition) {
    lines.push(`Exposition médiatique : +${formatCount(campagne.exposition)} (sur 10 000)`);
  }
  if (campagne.preparationDebat) {
    lines.push(`Préparation des débats : +${campagne.preparationDebat} h`);
  }
  return lines;
}

/** Ce qui reste après les actions déjà programmées (coûts fixes, sans simulation). */
function remainingAfter(
  plan: readonly PlannedAction[],
  ruleset: Ruleset,
  actor: Actor,
  reservedHours: number,
) {
  let budget = actor.resources.budgetCentimes;
  let time = actor.resources.tempsHeures - reservedHours;
  let spent = actor.finances.depenses;
  for (const { actionId } of plan) {
    const action = ruleset.actions.find((a) => a.id === actionId);
    if (!action) continue;
    budget -= action.cout.budgetCentimes;
    time -= action.cout.tempsHeures;
    spent += action.cout.budgetCentimes;
  }
  return { budget, time, spent };
}

function unavailableReason(
  action: ActionDefinition,
  remaining: { budget: number; time: number; spent: number },
  actor: Actor,
  cap: number,
  full: boolean,
): string | null {
  if (full) return 'Nombre maximal d’actions atteint pour cette semaine.';
  if (actor.resources.militants < action.prerequis.militantsMin) {
    return `Nécessite ${action.prerequis.militantsMin} militants.`;
  }
  if (action.cout.budgetCentimes > remaining.budget) return 'Budget restant insuffisant.';
  if (action.cout.tempsHeures > remaining.time) return 'Temps restant insuffisant.';
  if (remaining.spent + action.cout.budgetCentimes > cap)
    return 'Plafond légal des dépenses atteint.';
  return null;
}

/** Choix de la cible d'une action programmée (département ou média). */
function TargetSelect({
  ruleset,
  actor,
  action,
  value,
  index,
  onChange,
}: {
  ruleset: Ruleset;
  actor: Actor;
  action: ActionDefinition;
  value: string | undefined;
  index: number;
  onChange: (cible: string) => void;
}) {
  const id = useId();
  const departements = Object.entries(ruleset.parrainages.reservoir.departements).sort(
    ([a], [b]) => (a < b ? -1 : 1),
  );
  const p = actor.parrainages;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
      <label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-400">
        {action.cible === 'departement' ? 'Département' : 'Média'}
      </label>
      <select
        id={id}
        className={`${input} py-1.5 sm:w-72`}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Cible de l’action n° ${index + 1} (${action.libelle})`}
        aria-invalid={value === undefined}
      >
        <option value="">
          {action.cible === 'departement' ? 'Choisir un département…' : 'Choisir un média…'}
        </option>
        {action.cible === 'departement'
          ? departements.map(([code, dep]) => {
              const held =
                (p.promesses[code] ?? 0) + (p.intentions[code] ?? 0) + (p.validees[code] ?? 0);
              return (
                <option key={code} value={code}>
                  {dep.nom} ({code}){held ? ` — ${held} soutiens` : ''}
                </option>
              );
            })
          : ruleset.medias.organes.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.libelle} — audience {Math.round(outlet.audience * 100)} %
              </option>
            ))}
      </select>
    </div>
  );
}

export function ActionPlanner({
  ruleset,
  actor,
  plan,
  reservedHours,
  cap,
  onAdd,
  onRemove,
  onTarget,
}: Props) {
  const remaining = remainingAfter(plan, ruleset, actor, reservedHours);
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
          {plan.map((planned, index) => {
            const action = ruleset.actions.find((a) => a.id === planned.actionId);
            return (
              <li
                key={`${planned.actionId}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"
              >
                <span>
                  {index + 1}. {action?.libelle ?? planned.actionId}
                </span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {action?.cible && (
                    <TargetSelect
                      ruleset={ruleset}
                      actor={actor}
                      action={action}
                      value={planned.cible}
                      index={index}
                      onChange={(cible) => onTarget(index, cible)}
                    />
                  )}
                  <button
                    type="button"
                    className={`${buttonSecondary} px-3 py-1`}
                    onClick={() => onRemove(index)}
                    aria-label={`Retirer ${action?.libelle ?? planned.actionId}`}
                  >
                    Retirer
                  </button>
                </div>
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
          const reason = unavailableReason(action, remaining, actor, cap, full);
          const effects = [
            ...action.effets.map(describeEffect),
            ...describeCampaign(action.campagne),
          ];
          return (
            <li
              key={action.id}
              className={`${card} flex flex-col gap-2`}
              aria-label={action.libelle}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{action.libelle}</p>
                <Badge>Portée {PORTEE_LABELS[action.portee]}</Badge>
                {action.cible && (
                  <Badge tone="alerte">
                    {action.cible === 'departement' ? 'Choix du département' : 'Choix du média'}
                  </Badge>
                )}
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
                <dd>{effects.join(' ; ')}</dd>
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
        officielles ; le plafond des dépenses et les règles des dons sont, eux, ceux du guide de la
        CNCCFP. Le serveur revalide chaque action.
      </p>
    </section>
  );
}
