import {
  REAL_MEDIA_TYPES,
  type ActionDefinition,
  type Actor,
  type CampaignEffect,
  type Effect,
  type PlannedAction,
  type Ruleset,
} from '@r2027/shared';
import { Clock, Crosshair, Plus, Users, Wallet, X } from 'lucide-react';
import { useId } from 'react';
import { Badge } from '../../components/Badge';
import { InfoPopover } from '../../components/InfoPopover';
import { MEDIA_TYPE_LABELS } from '../../components/RealMedia';
import { card, input } from '../../components/ui';
import {
  formatCount,
  formatDelta,
  formatEuros,
  formatResource,
  PORTEE_LABELS,
  RESOURCE_LABELS,
} from '../../labels';
import { actionIcon } from './actionIcons';

type Props = {
  ruleset: Ruleset;
  actor: Actor;
  plan: readonly PlannedAction[];
  /**
   * Campagne (actions du jeu de règles, budget et plafond légal) ou présidence (actions du
   * président, qui ne coûtent que du temps). Par défaut : campagne.
   */
  mode?: 'campagne' | 'presidence';
  /** Motif commun d'indisponibilité (par exemple : mandat pas encore commencé). */
  restriction?: (action: ActionDefinition) => string | null;
  /** Heures déjà réservées cette semaine (préparation des propositions du programme). */
  reservedHours: number;
  /** Plafond légal des dépenses applicable à la campagne. */
  cap: number;
  onAdd: (actionId: string) => void;
  onRemove: (index: number) => void;
  onTarget: (index: number, cible: string) => void;
};

const TARGET_LABELS = { departement: 'Département', media: 'Média', emission: 'Émission' } as const;
const TARGET_PROMPTS = {
  departement: 'Choisir un département…',
  media: 'Choisir un média…',
  emission: 'Choisir une émission…',
} as const;

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
  catalog: readonly ActionDefinition[],
  actor: Actor,
  reservedHours: number,
) {
  let budget = actor.resources.budgetCentimes;
  let time = actor.resources.tempsHeures - reservedHours;
  let spent = actor.finances.depenses;
  for (const { actionId } of plan) {
    const action = catalog.find((a) => a.id === actionId);
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
  presidency: boolean,
): string | null {
  if (full) return 'Nombre maximal d’actions atteint pour cette semaine.';
  // Le président ne dépense que du temps : ni militants, ni budget, ni plafond de campagne.
  if (presidency)
    return action.cout.tempsHeures > remaining.time ? 'Temps restant insuffisant.' : null;
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
  showSupport,
}: {
  ruleset: Ruleset;
  actor: Actor;
  action: ActionDefinition;
  value: string | undefined;
  index: number;
  onChange: (cible: string) => void;
  /** Soutiens de parrainage par département (campagne seulement). */
  showSupport: boolean;
}) {
  const id = useId();
  const departements = Object.entries(ruleset.parrainages.reservoir.departements).sort(
    ([a], [b]) => (a < b ? -1 : 1),
  );
  const p = actor.parrainages;
  const outlets = new Map(ruleset.mediasReels.organes.map((o) => [o.id, o]));
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
      <label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-400">
        {TARGET_LABELS[action.cible ?? 'media']}
      </label>
      <select
        id={id}
        className={`${input} py-1.5 sm:w-72`}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Cible de l’action n° ${index + 1} (${action.libelle})`}
        aria-invalid={value === undefined}
      >
        <option value="">{TARGET_PROMPTS[action.cible ?? 'media']}</option>
        {action.cible === 'departement' &&
          departements.map(([code, dep]) => {
            const held = showSupport
              ? (p.promesses[code] ?? 0) + (p.intentions[code] ?? 0) + (p.validees[code] ?? 0)
              : 0;
            return (
              <option key={code} value={code}>
                {dep.nom} ({code}){held ? ` — ${held} soutiens` : ''}
              </option>
            );
          })}
        {action.cible === 'media' &&
          REAL_MEDIA_TYPES.map((type) => (
            <optgroup key={type} label={MEDIA_TYPE_LABELS[type]}>
              {ruleset.mediasReels.organes
                .filter((outlet) => outlet.type === type)
                .map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.libelle}
                  </option>
                ))}
            </optgroup>
          ))}
        {action.cible === 'emission' &&
          ruleset.mediasReels.emissions.map((show) => (
            <option key={show.id} value={show.id}>
              {show.titre} ({outlets.get(show.organeId)?.libelle ?? show.organeId}) —{' '}
              {show.presentateurs.join(', ')}
            </option>
          ))}
      </select>
    </div>
  );
}

/** Coût court d'une tuile : « 120 k€ », « 8 h ». */
const compactEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const TARGET_BADGES = {
  departement: 'Choix du département',
  emission: 'Choix de l’émission',
  media: 'Choix du média',
} as const;

/** Effets décrits en clair (fiche de détails). */
function effectLines(action: ActionDefinition): string[] {
  return [
    ...(action.institution === 'remaniement'
      ? ['Fin du gouvernement en place ; vous nommez un nouveau Premier ministre']
      : action.institution === 'dissolution'
        ? [
            'Élections législatives 20 jours plus tard (577 circonscriptions, résultats simulés) ; travaux parlementaires suspendus ; nouveau gouvernement après le second tour',
          ]
        : []),
    ...action.effets.map(describeEffect),
    ...describeCampaign(action.campagne),
  ];
}

/** Jauge d'une ressource consommée par le plan (budget ou temps de la semaine). */
function Meter({
  icon: Icon,
  label,
  left,
  total,
  text,
}: {
  icon: typeof Wallet;
  label: string;
  left: number;
  total: number;
  text: string;
}) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const low = ratio < 0.15;
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </span>
        <span className="font-display text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
          {text}
        </span>
      </p>
      <span
        aria-hidden="true"
        className="mt-1 block h-1.5 rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-300 ${low ? 'bg-red-500' : 'bg-republique-500'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
    </div>
  );
}

export function ActionPlanner({
  ruleset,
  actor,
  plan,
  mode = 'campagne',
  restriction,
  reservedHours,
  cap,
  onAdd,
  onRemove,
  onTarget,
}: Props) {
  const presidency = mode === 'presidence';
  const catalog = presidency ? ruleset.quinquennat.actions : ruleset.actions;
  const remaining = remainingAfter(plan, catalog, actor, reservedHours);
  const full = plan.length >= ruleset.jeu.actionsMaxParSemaine;
  const summary = `Reste après le plan : ${
    presidency ? '' : `${formatResource('budgetCentimes', remaining.budget)} · `
  }${formatResource('tempsHeures', remaining.time)} · ${plan.length}/${ruleset.jeu.actionsMaxParSemaine} actions`;

  return (
    <section aria-labelledby="titre-plan" className="space-y-4">
      <h2 id="titre-plan" className="text-xl font-bold">
        {presidency ? 'Agenda du président cette semaine' : 'Plan d’actions de la semaine'}
      </h2>

      <div className={`${card} space-y-4`}>
        <div className="flex gap-4">
          {!presidency && (
            <Meter
              icon={Wallet}
              label="Budget"
              left={remaining.budget}
              total={actor.resources.budgetCentimes}
              text={compactEuros.format(remaining.budget / 100)}
            />
          )}
          <Meter
            icon={Clock}
            label="Temps"
            left={remaining.time}
            total={actor.resources.tempsHeures}
            text={`${remaining.time} h`}
          />
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Actions</p>
            <p className="font-display text-sm font-bold tabular-nums">
              {plan.length}/{ruleset.jeu.actionsMaxParSemaine}
            </p>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {summary}
        </p>

        {plan.length > 0 ? (
          <ol className="space-y-2" aria-label="Actions programmées">
            {plan.map((planned, index) => {
              const action = catalog.find((a) => a.id === planned.actionId);
              const Icon = actionIcon(planned.actionId);
              return (
                <li
                  key={`${planned.actionId}-${index}`}
                  className="flex animate-monte flex-col gap-2 rounded-2xl bg-slate-50 p-2 pl-3 text-sm sm:flex-row sm:items-center dark:bg-slate-800/60"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5 font-semibold">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-republique-600 text-white">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="truncate">{action?.libelle ?? planned.actionId}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {action?.cible && (
                      <TargetSelect
                        ruleset={ruleset}
                        actor={actor}
                        action={action}
                        value={planned.cible}
                        index={index}
                        onChange={(cible) => onTarget(index, cible)}
                        showSupport={!presidency}
                      />
                    )}
                    <button
                      type="button"
                      className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      onClick={() => onRemove(index)}
                      aria-label={`Retirer ${action?.libelle ?? planned.actionId}`}
                    >
                      <X aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aucune action programmée : touchez une action ci-dessous pour l’ajouter à la semaine.
          </p>
        )}
      </div>

      <ul
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4"
        aria-label="Catalogue des actions"
      >
        {catalog.map((action) => {
          const reason =
            restriction?.(action) ??
            unavailableReason(action, remaining, actor, cap, full, presidency);
          const Icon = actionIcon(action.id);
          const cost = presidency
            ? `${action.cout.tempsHeures} h`
            : `${action.cout.budgetCentimes > 0 ? `${compactEuros.format(action.cout.budgetCentimes / 100)} · ` : ''}${action.cout.tempsHeures} h`;
          return (
            <li key={action.id} className="relative" aria-label={action.libelle}>
              <button
                type="button"
                disabled={reason !== null}
                onClick={() => onAdd(action.id)}
                aria-label={`Ajouter ${action.libelle}`}
                className="group flex h-full min-h-32 w-full flex-col items-start gap-2 rounded-card border border-slate-200/80 bg-white p-3.5 pr-11 text-left shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-republique-300 hover:shadow-raised active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-republique-400/60 dark:hover:shadow-neon"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-republique-50 text-republique-700 transition-colors group-enabled:group-hover:bg-republique-600 group-enabled:group-hover:text-white dark:bg-republique-950 dark:text-republique-300">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
                </span>
                <span className="text-sm leading-snug font-bold">{action.libelle}</span>
                <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold tabular-nums">{cost}</span>
                  {action.cible && (
                    <span className="inline-flex items-center gap-0.5 text-amber-800 dark:text-amber-300">
                      <Crosshair aria-hidden="true" className="size-3" />
                      cible
                    </span>
                  )}
                  {action.prerequis.militantsMin > 0 && !presidency && (
                    <span className="inline-flex items-center gap-0.5">
                      <Users aria-hidden="true" className="size-3" />
                      {action.prerequis.militantsMin}
                    </span>
                  )}
                </span>
                {reason ? (
                  <span className="text-xs leading-snug text-red-700 dark:text-red-300">
                    {reason}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute right-3 bottom-3 inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-republique-600 group-hover:text-white dark:bg-slate-800"
                  >
                    <Plus className="size-4" />
                  </span>
                )}
              </button>
              <InfoPopover
                label={`Détails : ${action.libelle}`}
                title={action.libelle}
                className="absolute top-1 right-1"
              >
                <p className="text-slate-600 dark:text-slate-400">{action.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>Portée {PORTEE_LABELS[action.portee]}</Badge>
                  {action.cible && <Badge tone="alerte">{TARGET_BADGES[action.cible]}</Badge>}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-slate-500 dark:text-slate-400">Coût</dt>
                  <dd>
                    {presidency
                      ? ''
                      : `${formatResource('budgetCentimes', action.cout.budgetCentimes)} · `}
                    {formatResource('tempsHeures', action.cout.tempsHeures)}
                    {action.prerequis.militantsMin > 0 &&
                      ` · ${action.prerequis.militantsMin} militants requis`}
                  </dd>
                  <dt className="text-slate-500 dark:text-slate-400">Effet attendu</dt>
                  <dd>{effectLines(action).join(' ; ') || 'aucun effet direct'}</dd>
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Valeurs de jeu (hypothèses) ; l’effet réel est tiré au sort dans l’écart indiqué.
                </p>
              </InfoPopover>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {presidency
          ? 'Coûts, effets et probabilités sont des paramètres de jeu (hypothèses), pas des données officielles. Le serveur revalide chaque action.'
          : 'Coûts, effets et probabilités sont des paramètres de jeu (hypothèses), pas des données officielles ; le plafond des dépenses et les règles des dons sont, eux, ceux du guide de la CNCCFP. Le serveur revalide chaque action.'}
      </p>
    </section>
  );
}
