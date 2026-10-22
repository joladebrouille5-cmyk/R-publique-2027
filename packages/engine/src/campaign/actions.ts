import type {
  ActionDefinition,
  ActionOutcome,
  GameState,
  PlannedAction,
  ReportEvent,
  Ruleset,
} from '@r2027/shared';
import { applyOrSchedule } from '../core/effects';
import type { Ledger } from '../core/ledger';
import { drawAlea, stream } from '../core/random';
import {
  formatEuros,
  processDonations,
  requestLoan,
  spendingCap,
  type FinanceBook,
} from './finances';
import { gainPromises, type ParrainageBook } from './parrainages';

export type ValidatedAction = {
  actorId: string;
  index: number;
  definition: ActionDefinition;
  /** Département, organe de presse ou émission choisi, si l'action en demande un. */
  cible: string | null;
};

/** Libellé lisible d'une cible : « Ain (01) », « France Inter », « C politique (France 5) ». */
export function targetLabel(ruleset: Ruleset, action: ActionDefinition, cible: string): string {
  if (action.cible === 'departement') {
    const dep = ruleset.parrainages.reservoir.departements[cible];
    return dep ? `${dep.nom} (${cible})` : cible;
  }
  const outlets = ruleset.mediasReels.organes;
  if (action.cible === 'emission') {
    const show = ruleset.mediasReels.emissions.find((e) => e.id === cible);
    if (!show) return cible;
    const outlet = outlets.find((o) => o.id === show.organeId);
    return outlet ? `${show.titre} (${outlet.libelle})` : show.titre;
  }
  return outlets.find((o) => o.id === cible)?.libelle ?? cible;
}

const MISSING_TARGET = {
  departement: 'Choisissez le département de la rencontre.',
  media: 'Choisissez le média de l’interview.',
  emission: 'Choisissez l’émission politique.',
} as const;

function targetError(ruleset: Ruleset, definition: ActionDefinition, cible: string | undefined) {
  if (definition.cible === null) {
    return cible === undefined ? null : 'Cette action ne se dirige pas vers une cible.';
  }
  if (cible === undefined) return MISSING_TARGET[definition.cible];
  const known =
    definition.cible === 'departement'
      ? cible in ruleset.parrainages.reservoir.departements
      : definition.cible === 'emission'
        ? ruleset.mediasReels.emissions.some((e) => e.id === cible)
        : ruleset.mediasReels.organes.some((o) => o.id === cible);
  return known ? null : `Cible inconnue : ${cible}.`;
}

/**
 * Validation des actions programmées par un acteur, dans l'ordre soumis. Une action est
 * rejetée avec son motif si sa cible manque ou est inconnue, si son prérequis n'est pas rempli,
 * si le budget ou le temps restants ne suffisent pas, ou si elle porterait les dépenses au-delà
 * du plafond légal. Mêmes règles pour le joueur et pour les adversaires.
 */
export function validateActions(
  state: GameState,
  actorId: string,
  planned: readonly PlannedAction[],
  ruleset: Ruleset,
  reservedHours = 0,
): { outcomes: ActionOutcome[]; validated: ValidatedAction[] } {
  const outcomes: ActionOutcome[] = [];
  const validated: ValidatedAction[] = [];
  const actor = state.actors[actorId]!;
  const resources = actor.resources;
  const cap = spendingCap(state, actorId, ruleset);
  let budget = resources.budgetCentimes;
  let time = resources.tempsHeures - reservedHours;
  let spent = actor.finances.depenses;

  planned.forEach((action, index) => {
    const definition = ruleset.actions.find((a) => a.id === action.actionId);
    let reason: string | null;
    if (!definition) reason = 'Action inconnue dans ce jeu de règles.';
    else {
      const { cout, prerequis } = definition;
      reason = targetError(ruleset, definition, action.cible);
      if (!reason && resources.militants < prerequis.militantsMin) {
        reason = `Il faut au moins ${prerequis.militantsMin} militants (vous en avez ${resources.militants}).`;
      } else if (!reason && cout.budgetCentimes > budget) {
        reason = `Budget insuffisant : ${formatEuros(cout.budgetCentimes)} nécessaires, ${formatEuros(budget)} restants.`;
      } else if (!reason && cout.tempsHeures > time) {
        reason = `Temps insuffisant : ${cout.tempsHeures} h nécessaires, ${Math.max(0, time)} h restantes cette semaine.`;
      } else if (!reason && spent + cout.budgetCentimes > cap) {
        reason = `Plafond légal des dépenses atteint : ${formatEuros(spent)} déjà dépensés sur ${formatEuros(cap)} autorisés.`;
      }
    }
    const cible = definition && action.cible !== undefined && !reason ? action.cible : null;
    if (!definition || reason) {
      outcomes.push({
        actorId,
        index,
        actionId: action.actionId,
        label: definition?.libelle ?? action.actionId,
        status: 'rejetee',
        reason,
        cost: { budgetCentimes: 0, tempsHeures: 0 },
        cible: null,
      });
      return;
    }
    const { cout } = definition;
    budget -= cout.budgetCentimes;
    time -= cout.tempsHeures;
    spent += cout.budgetCentimes;
    validated.push({ actorId, index, definition, cible });
    outcomes.push({
      actorId,
      index,
      actionId: definition.id,
      label: definition.libelle,
      status: 'validee',
      reason: null,
      cost: { ...cout },
      cible: cible === null ? null : targetLabel(ruleset, definition, cible),
    });
  });
  return { outcomes, validated };
}

/** Étape 2 : débit exact du coût des actions retenues (dépenses électorales) et de leur temps. */
export function consumeActions(
  ledger: Ledger,
  book: FinanceBook,
  validated: readonly ValidatedAction[],
  step: number,
): void {
  for (const { actorId, definition } of validated) {
    const label = `${definition.libelle} : coût`;
    book.spend(actorId, definition.cout.budgetCentimes, label, 'action', step);
    ledger.apply(actorId, 'tempsHeures', [
      { label, value: -definition.cout.tempsHeures, source: 'action', step },
    ]);
  }
}

/**
 * Probabilité d'un aléa d'action, majorée le cas échéant (phase 10, interview longue) par les
 * revirements de programme du candidat et par ses passages récents dans le même format.
 */
export function riskProbability(
  state: GameState,
  actorId: string,
  definition: ActionDefinition,
  risk: NonNullable<ActionDefinition['risque']>,
): number {
  const extra = risk.majoration;
  if (!extra) return risk.probabilite;
  const actor = state.actors[actorId]!;
  const since = state.meta.week - extra.semainesRepetition;
  const repeats = (state.numerique.passages[actorId]?.[definition.id] ?? []).filter(
    (w) => w >= since && w < state.meta.week,
  ).length;
  return Math.min(
    extra.max,
    risk.probabilite +
      extra.parRevirement * actor.programme.revirements +
      extra.parRepetition * repeats,
  );
}

export type CampaignBooks = { finances: FinanceBook; parrainages: ParrainageBook };

/**
 * Étape 5 : effets des actions (immédiats ou programmés), effets de campagne (promesses de
 * parrainage, dons, prêt, préparation des débats) et tirage de leur risque éventuel.
 */
export function resolveActionEffects(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  books: CampaignBooks,
  validated: readonly ValidatedAction[],
  step: number,
): { risks: ReportEvent[]; incidents: Set<string> } {
  const week = state.meta.week;
  const risks: ReportEvent[] = [];
  const incidents = new Set<string>();
  for (const { actorId, index, definition, cible } of validated) {
    const rng = stream(state.meta.seed, week, 'action', actorId, index, definition.id);
    const ref = `a-${week}-${actorId}-${index}`;
    const base = { state, ledger, book: books.finances, actorId, week, step, ref };
    definition.effets.forEach((effect, i) =>
      applyOrSchedule(
        { ...base, label: definition.libelle, source: 'action' },
        effect,
        drawAlea(rng, effect),
        i,
      ),
    );
    const campagne = definition.campagne;
    if (campagne?.promesses && cible) {
      const { base: n, ecart } = campagne.promesses;
      const wanted = n + (ecart ? rng.nextInt(2 * ecart + 1) - ecart : 0);
      const label = `${definition.libelle} — ${targetLabel(ruleset, definition, cible)}`;
      const got = gainPromises(state, ruleset, books.parrainages, actorId, cible, wanted, label);
      if (got < wanted) {
        books.finances.note(
          actorId,
          `${label} : ${got} promesse(s) sur ${wanted} espérées, les élus disponibles du département étant déjà engagés.`,
        );
      }
    }
    if (campagne?.dons) {
      processDonations(
        books.finances,
        ruleset,
        actorId,
        campagne.dons,
        rng,
        definition.libelle,
        'action',
        step,
        week,
      );
    }
    if (campagne?.emprunt) {
      requestLoan(
        books.finances,
        state,
        ruleset,
        actorId,
        campagne.emprunt.montantCentimes,
        definition.libelle,
        step,
      );
    }
    if (campagne?.preparationDebat) {
      state.actors[actorId]!.preparationDebat += campagne.preparationDebat;
    }
    const risk = definition.risque;
    const probability = risk ? riskProbability(state, actorId, definition, risk) : 0;
    if (risk && rng.nextFloat() < probability) {
      const riskRef = `${ref}-risque`;
      risk.effets.forEach((effect, i) =>
        applyOrSchedule(
          {
            ...base,
            ref: riskRef,
            label: `${definition.libelle} — ${risk.libelle}`,
            source: 'risque',
          },
          effect,
          drawAlea(rng, effect),
          i,
        ),
      );
      incidents.add(actorId);
      risks.push({
        id: riskRef,
        kind: 'risque',
        refId: definition.id,
        label: risk.libelle,
        description: `Aléa de l'action « ${definition.libelle} » de ${state.actors[actorId]!.label} (probabilité ${Math.round(probability * 100)} %).`,
        nature: 'simule',
        majeur: false,
        decisionId: null,
      });
    }
  }
  return { risks, incidents };
}
