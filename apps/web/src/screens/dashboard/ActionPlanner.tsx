import {
  REAL_MEDIA_TYPES,
  type ActionDefinition,
  type Actor,
  type CampaignEffect,
  type Counterpart,
  type Effect,
  type PlannedAction,
  type Posture,
  type Ruleset,
  type SupportProspects,
} from '@r2027/shared';
import { Clock, Crosshair, Info, Plus, Users, Wallet, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Drawer } from '../../components/Drawer';
import { MEDIA_TYPE_LABELS } from '../../components/RealMedia';
import { buttonPrimary, card, input } from '../../components/ui';
import {
  formatCount,
  formatDelta,
  formatEuros,
  formatIndicatorDelta,
  formatResource,
  INDICATOR_LABELS,
  PORTEE_LABELS,
  RESOURCE_LABELS,
} from '../../labels';
import { portraitOfPersonality } from '../../portraits';
import { actionIcon, actionTint } from './actionIcons';
import { PostureSelect, isPlateau } from './PostureSelect';

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
  /** Heures déjà réservées cette semaine (propositions du programme, délégations d’élus reçues). */
  reservedHours: number;
  /** Plafond légal des dépenses applicable à la campagne. */
  cap: number;
  onAdd: (actionId: string) => void;
  onRemove: (index: number) => void;
  onTarget: (index: number, cible: string) => void;
  /** Posture d'un passage dans les médias (campagne, phase 11). */
  onPosture?: (index: number, posture: Posture) => void;
  /** Vivier des négociations de soutien (campagne, phase 15). */
  supports?: SupportsView;
  /** Ministères pourvus, cibles d'un remaniement ciblé (présidence, phase 15). */
  ministries?: readonly MinistryChoice[];
};

const TARGET_LABELS = {
  departement: 'Département',
  media: 'Média',
  emission: 'Émission',
  personnalite: 'Personnalité',
  poste: 'Ministère',
} as const;
const TARGET_PROMPTS = {
  departement: 'Choisir un département…',
  media: 'Choisir un média…',
  emission: 'Choisir une émission…',
  personnalite: 'Choisir une personnalité…',
  poste: 'Choisir un ministère…',
} as const;

/** Vivier des négociations de soutien servi par l'API (phase 15), ou son chargement. */
export type SupportsView = { prospects: SupportProspects | undefined; error: boolean };
/** Ministère pourvu, pour le remaniement ciblé (phase 15). */
export type MinistryChoice = { posteId: string; libelle: string; ministre: string };

const percent = (value: number) => `${Math.round(value * 100)} %`;

/** Contrepartie offerte par une action de négociation (sans contrepartie par défaut). */
const counterpartOf = (action: ActionDefinition): Counterpart =>
  action.campagne?.soutien?.contrepartie ?? 'aucune';

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
  if (campagne.soutien) {
    lines.push(
      campagne.soutien.contrepartie === 'ministere'
        ? 'Négociation simulée avec la personnalité choisie, contre la promesse d’un ministère : en cas d’accord, notoriété, militants et vote des électeurs proches d’elle ; elle sera proposée en tête à l’investiture (promesse non tenue : popularité perdue)'
        : 'Négociation simulée avec la personnalité choisie, sans contrepartie : en cas d’accord, notoriété, militants et vote des électeurs proches d’elle ; aucun propos ne lui est attribué',
    );
  }
  return lines;
}

/** Ce qui reste après les actions déjà programmées (coûts fixes, sans simulation). */
export function remainingAfter(
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

/**
 * Personnalités d'une négociation de soutien (phase 15) : celles dont l'accord est possible, de
 * la plus à la moins probable (probabilités calculées par le serveur, hypothèses du jeu), puis
 * celles qu'un motif exclut (désactivées). Sans vivier, toutes les personnalités, par nom.
 */
function personalityOptions(ruleset: Ruleset, action: ActionDefinition, supports?: SupportsView) {
  const figures = new Map(ruleset.figures.figures.map((f) => [f.id, f]));
  const label = (id: string) => {
    const f = figures.get(id);
    return f ? `${f.prenom} ${f.nom} — ${f.parti}` : id;
  };
  const prospects = supports?.prospects;
  if (!prospects)
    return (
      <optgroup
        label={
          supports?.error
            ? 'Vivier indisponible (accord non estimé)'
            : 'Vivier en cours de chargement'
        }
      >
        {[...ruleset.figures.figures]
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
          .map((f) => (
            <option key={f.id} value={f.id}>
              {label(f.id)}
            </option>
          ))}
      </optgroup>
    );
  const counterpart = counterpartOf(action);
  const open = prospects.personnalites
    .filter((p) => p.probabilites)
    .sort((a, b) => b.probabilites![counterpart] - a.probabilites![counterpart]);
  const closed = prospects.personnalites.filter((p) => !p.probabilites);
  return (
    <>
      <optgroup label={`Accord possible (${open.length})`}>
        {open.map((p) => (
          <option key={p.figureId} value={p.figureId}>
            {`${label(p.figureId)} · accord ${percent(p.probabilites![counterpart])}`}
          </option>
        ))}
      </optgroup>
      <optgroup label={`Accord exclu (${closed.length})`}>
        {closed.map((p) => (
          <option key={p.figureId} value={p.figureId} disabled>
            {`${label(p.figureId)} · ${p.soutient ? 'soutient déjà un candidat' : 'exclue'}`}
          </option>
        ))}
      </optgroup>
    </>
  );
}

/**
 * Personnalité choisie pour une négociation : photo, parti, proximité et probabilités d'accord
 * servies par l'API, ou le motif qui exclut l'accord. Aucun propos n'est attribué.
 */
function SupportHint({
  ruleset,
  action,
  figureId,
  supports,
}: {
  ruleset: Ruleset;
  action: ActionDefinition;
  figureId: string;
  supports?: SupportsView;
}) {
  const figure = ruleset.figures.figures.find((f) => f.id === figureId);
  if (!figure) return null;
  const prospect = supports?.prospects?.personnalites.find((p) => p.figureId === figureId);
  const counterpart = counterpartOf(action);
  return (
    <div className="flex w-full items-start gap-2.5 rounded-xl bg-white/70 p-2 text-xs dark:bg-slate-900/50">
      <Avatar portrait={portraitOfPersonality(figure, ruleset)} size="sm" />
      <p className="min-w-0 space-y-0.5">
        <span className="block font-semibold">
          {figure.prenom} {figure.nom} — {figure.parti}
        </span>
        {prospect ? (
          prospect.probabilites ? (
            <span className="block text-slate-600 dark:text-slate-400">
              Proximité {prospect.proximite}/100 · probabilité d’accord (hypothèse du jeu){' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {percent(prospect.probabilites[counterpart])}
              </strong>
              {counterpart === 'aucune'
                ? ` sans contrepartie (${percent(prospect.probabilites.ministere)} en promettant un ministère)`
                : ' avec la promesse d’un ministère'}
              . Issue simulée, aucun propos attribué.
            </span>
          ) : (
            <span className="block text-red-700 dark:text-red-300">{prospect.motif}</span>
          )
        ) : (
          <span className="block text-slate-600 dark:text-slate-400">
            Probabilité d’accord indisponible pour l’instant : le serveur l’évaluera à la
            résolution.
          </span>
        )}
      </p>
    </div>
  );
}

/** Choix de la cible d'une action programmée (département, média, personnalité, ministère). */
function TargetSelect({
  ruleset,
  actor,
  action,
  value,
  index,
  onChange,
  showSupport,
  supports,
  ministries,
}: {
  ruleset: Ruleset;
  actor: Actor;
  action: ActionDefinition;
  value: string | undefined;
  index: number;
  onChange: (cible: string) => void;
  /** Soutiens de parrainage par département (campagne seulement). */
  showSupport: boolean;
  supports?: SupportsView | undefined;
  ministries?: readonly MinistryChoice[] | undefined;
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
        {action.cible === 'personnalite' && personalityOptions(ruleset, action, supports)}
        {action.cible === 'poste' &&
          (ministries ?? []).map((m) => (
            <option key={m.posteId} value={m.posteId}>
              {m.libelle} — {m.ministre}
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
  personnalite: 'Choix de la personnalité',
  poste: 'Choix du ministère',
} as const;

/** Effets décrits en clair (fiche de détails). */
function effectLines(action: ActionDefinition): string[] {
  return [
    ...(action.institution === 'remaniement'
      ? ['Fin du gouvernement en place ; vous nommez un nouveau Premier ministre']
      : action.institution === 'remaniement-cible'
        ? [
            'Le ministre choisi quitte le gouvernement ; le Premier ministre propose un remplaçant (experts du poste d’abord), que vous confirmez ou remplacez',
          ]
        : action.institution === 'dissolution'
          ? [
              'Élections législatives 20 jours plus tard (577 circonscriptions, résultats simulés) ; travaux parlementaires suspendus ; nouveau gouvernement après le second tour',
            ]
          : []),
    ...action.effets.map(describeEffect),
    ...describeCampaign(action.campagne),
  ];
}

/**
 * Règles propres aux actions du chef de l'État (phase 13) : fréquence, condition, effets sur
 * l'économie et le Parlement, ministre qui en module l'effet, mobilisation pendant la campagne
 * des législatives, source d'une règle ou d'un usage réel.
 */
function PresidentialDetails({ action, ruleset }: { action: ActionDefinition; ruleset: Ruleset }) {
  const poste =
    action.poste === undefined
      ? null
      : action.poste === null
        ? 'le Premier ministre'
        : `le ministre « ${ruleset.quinquennat.postes.find((p) => p.id === action.poste)?.libelle ?? action.poste} »`;
  const source = action.sourceId ? ruleset.sources[action.sourceId] : undefined;
  const rows: [string, string][] = [];
  if (action.delaiSemaines !== undefined)
    rows.push(['Fréquence', `une fois toutes les ${action.delaiSemaines} semaines au plus`]);
  if (action.condition === 'crise-recente')
    rows.push(['Condition', 'une crise dans les quatre dernières semaines']);
  if (action.economie?.length)
    rows.push([
      'Économie',
      action.economie
        .map((e) => `${INDICATOR_LABELS[e.indicateur].label} ${formatIndicatorDelta(e.valeur)}`)
        .join(' ; '),
    ]);
  if (action.parlement) {
    const parts = [
      action.parlement.apaisement > 0
        ? `apaisement de ${action.parlement.apaisement} point(s) de tension, qui décroît ensuite`
        : null,
      action.parlement.fronde > 0
        ? `fronde de la majorité réduite de ${Math.round(action.parlement.fronde * 100)} %`
        : null,
    ].filter((p): p is string => p !== null);
    if (parts.length > 0) rows.push(['Parlement', parts.join(' ; ')]);
  }
  if (poste) rows.push(['Ministre', `l’effet est modulé par la compétence de ${poste}`]);
  if (action.cible === 'departement')
    rows.push([
      'Législatives',
      'pendant la campagne, mobilise votre camp dans le département visité (hypothèse de jeu)',
    ]);
  if (rows.length === 0 && !source) return null;
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
          {rows.map(([term, text]) => (
            <div key={term} className="contents">
              <dt className="text-slate-500 dark:text-slate-400">{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {source && (
        <p className="text-xs">
          Source :{' '}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-republique-700 underline dark:text-republique-300"
            >
              {source.titre.split(' (')[0]}
            </a>
          ) : (
            source.titre.split(' (')[0]
          )}
        </p>
      )}
    </div>
  );
}

/** Fiche d'une action (tiroir de détail) : portée, coût, effets, risque, note. */
function ActionDetails({
  action,
  ruleset,
  presidency,
}: {
  action: ActionDefinition;
  ruleset: Ruleset;
  presidency: boolean;
}) {
  const plateau = !presidency && isPlateau(ruleset, action);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge>Portée {PORTEE_LABELS[action.portee]}</Badge>
        {action.cible && <Badge tone="alerte">{TARGET_BADGES[action.cible]}</Badge>}
        {plateau && <Badge tone="simule">Passage noté sans tirage</Badge>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
        <dt className="text-slate-500 dark:text-slate-400">Coût</dt>
        <dd>
          {presidency ? '' : `${formatResource('budgetCentimes', action.cout.budgetCentimes)} · `}
          {formatResource('tempsHeures', action.cout.tempsHeures)}
          {action.prerequis.militantsMin > 0 &&
            ` · ${action.prerequis.militantsMin} militants requis`}
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">Effet attendu</dt>
        <dd>
          {effectLines(action).length > 0 ? (
            <ul className="list-inside list-disc space-y-0.5">
              {effectLines(action).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            'aucun effet direct'
          )}
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">Risque</dt>
        <dd>
          {!action.risque
            ? 'aucun'
            : plateau
              ? `si le passage est raté (score de ${ruleset.prestations.seuils.incident} ou moins) : ${action.risque.libelle} (${action.risque.effets.map(describeEffect).join(' ; ')})`
              : `${Math.round(action.risque.probabilite * 100)} % : ${action.risque.libelle} (${action.risque.effets.map(describeEffect).join(' ; ')})`}
        </dd>
      </dl>
      {presidency && <PresidentialDetails action={action} ruleset={ruleset} />}
      {action.note && <p className="text-xs text-slate-500 dark:text-slate-400">{action.note}</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {plateau
          ? 'Passage dans les médias, sans tirage au sort : l’effet se place dans l’écart indiqué selon la préparation, la posture choisie, le format et votre situation (valeurs de jeu, hypothèses).'
          : 'Valeurs de jeu (hypothèses) ; l’effet réel est tiré au sort dans l’écart indiqué.'}
      </p>
    </div>
  );
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
  onPosture,
  supports,
  ministries,
}: Props) {
  const presidency = mode === 'presidence';
  const catalog = presidency ? ruleset.quinquennat.actions : ruleset.actions;
  // Fiche d'une action ouverte dans un tiroir (phase 12), sans quitter le QG.
  const [details, setDetails] = useState<string | null>(null);
  const remaining = remainingAfter(plan, catalog, actor, reservedHours);
  const full = plan.length >= ruleset.jeu.actionsMaxParSemaine;
  const summary = `Reste après le plan : ${
    presidency ? '' : `${formatResource('budgetCentimes', remaining.budget)} · `
  }${formatResource('tempsHeures', remaining.time)} · ${plan.length}/${ruleset.jeu.actionsMaxParSemaine} actions`;

  return (
    <section aria-labelledby="titre-plan" className="space-y-4">
      <h2 id="titre-plan" tabIndex={-1} className="text-2xl outline-none sm:text-[1.75rem]">
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
              const plateau = !presidency && action && onPosture && isPlateau(ruleset, action);
              return (
                <li
                  key={`${planned.actionId}-${index}`}
                  className="flex animate-monte flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2 pl-2.5 text-sm dark:border-white/[0.06] dark:bg-white/[0.04]"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5 font-semibold">
                    <span
                      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${actionTint(planned.actionId)}`}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="truncate">{action?.libelle ?? planned.actionId}</span>
                  </span>
                  <div
                    className={`flex items-center gap-2 ${action?.cible ? 'max-sm:w-full' : ''}`}
                  >
                    {action?.cible && (
                      <TargetSelect
                        ruleset={ruleset}
                        actor={actor}
                        action={action}
                        value={planned.cible}
                        index={index}
                        onChange={(cible) => onTarget(index, cible)}
                        showSupport={!presidency}
                        supports={supports}
                        ministries={ministries}
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
                  {action?.cible === 'personnalite' && planned.cible && (
                    <SupportHint
                      ruleset={ruleset}
                      action={action}
                      figureId={planned.cible}
                      supports={supports}
                    />
                  )}
                  {plateau && (
                    <PostureSelect
                      ruleset={ruleset}
                      action={action}
                      planned={planned}
                      index={index}
                      onChange={(posture) => onPosture(index, posture)}
                    />
                  )}
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
                className="group flex h-full min-h-32 w-full flex-col items-start gap-2 rounded-2xl border border-slate-200/90 bg-white p-3.5 pr-11 text-left shadow-card transition duration-200 ease-sortie hover:border-or-400 hover:shadow-raised active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none dark:hover:border-dorure/50 dark:hover:bg-white/[0.06]"
              >
                <span
                  className={`inline-flex size-10 items-center justify-center rounded-xl transition-transform duration-200 ease-sortie group-enabled:group-hover:-rotate-6 ${actionTint(action.id)}`}
                >
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
                    className="absolute right-3 bottom-3 inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors group-hover:bg-or-400 group-hover:text-or-900 dark:bg-white/[0.08] dark:text-slate-300 dark:group-hover:bg-dorure dark:group-hover:text-[#1d1503]"
                  >
                    <Plus className="size-4" />
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setDetails(action.id)}
                className="absolute top-1 right-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-republique-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-republique-300"
              >
                <Info aria-hidden="true" className="size-5" />
                <span className="sr-only">{`Détails : ${action.libelle}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {(() => {
        const action = catalog.find((a) => a.id === details);
        if (!action) return null;
        const reason =
          restriction?.(action) ??
          unavailableReason(action, remaining, actor, cap, full, presidency);
        return (
          <Drawer
            title={action.libelle}
            subtitle={action.description}
            onClose={() => setDetails(null)}
            footer={
              <div className="space-y-2">
                {reason && <p className="text-sm text-red-700 dark:text-red-300">{reason}</p>}
                <button
                  type="button"
                  className={`${buttonPrimary} w-full`}
                  disabled={reason !== null}
                  onClick={() => {
                    onAdd(action.id);
                    setDetails(null);
                  }}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Ajouter au plan
                </button>
              </div>
            }
          >
            <ActionDetails action={action} ruleset={ruleset} presidency={presidency} />
          </Drawer>
        );
      })()}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {presidency
          ? 'Coûts, effets et probabilités sont des paramètres de jeu (hypothèses), pas des données officielles. Le serveur revalide chaque action.'
          : 'Coûts, effets et probabilités sont des paramètres de jeu (hypothèses), pas des données officielles ; le plafond des dépenses et les règles des dons sont, eux, des règles réelles. Le serveur revalide chaque action.'}
      </p>
    </section>
  );
}
