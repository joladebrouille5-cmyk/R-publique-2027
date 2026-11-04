import {
  DIGITAL_HISTORY_WEEKS,
  type ActionDefinition,
  type ActionOutcome,
  type Effect,
  type GameState,
  type PlannedAction,
  type Posture,
  type Prestation,
  type ReportEvent,
  type Ruleset,
  weekCombos,
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
import { seriesLabel } from './implantation';
import { gainPromises, type ParrainageBook } from './parrainages';
import { isPlateau, scoredAlea, scorePrestation } from './prestations';
import { negotiate, negotiationError } from './soutiens';

export type ValidatedAction = {
  actorId: string;
  index: number;
  definition: ActionDefinition;
  /** Département, organe de presse ou émission choisi, si l'action en demande un. */
  cible: string | null;
  /** Posture d'un passage dans les médias (phase 11), sinon null. */
  posture: Posture | null;
  /** Posture choisie dans le plan (sinon : posture par défaut du jeu de règles). */
  postureChoisie: boolean;
};

/** Motif de rejet d'une posture demandée pour une action qui n'est pas un passage. */
export const POSTURE_WITHOUT_PLATEAU =
  'Cette action n’est pas un passage dans les médias : aucune posture à choisir.';

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
  if (action.cible === 'personnalite') {
    const figure = ruleset.figures.figures.find((f) => f.id === cible);
    return figure ? `${figure.prenom} ${figure.nom}` : cible;
  }
  if (action.cible === 'poste')
    return ruleset.quinquennat.postes.find((p) => p.id === cible)?.libelle ?? cible;
  return outlets.find((o) => o.id === cible)?.libelle ?? cible;
}

const MISSING_TARGET = {
  departement: 'Choisissez le département de la rencontre.',
  media: 'Choisissez le média de l’interview.',
  emission: 'Choisissez l’émission politique.',
  personnalite: 'Choisissez la personnalité à rencontrer.',
  poste: 'Choisissez le ministère concerné.',
} as const;

function targetError(ruleset: Ruleset, definition: ActionDefinition, cible: string | undefined) {
  if (definition.cible === null) {
    return cible === undefined ? null : 'Cette action ne se dirige pas vers une cible.';
  }
  // Phase 25 : une carte Terrain peut se jouer sans lieu (effets nationaux seuls).
  if (cible === undefined)
    return definition.cibleFacultative ? null : MISSING_TARGET[definition.cible];
  const known =
    definition.cible === 'departement'
      ? cible in ruleset.parrainages.reservoir.departements
      : definition.cible === 'emission'
        ? ruleset.mediasReels.emissions.some((e) => e.id === cible)
        : definition.cible === 'personnalite'
          ? ruleset.figures.figures.some((f) => f.id === cible)
          : definition.cible === 'poste'
            ? ruleset.quinquennat.postes.some((p) => p.id === cible)
            : ruleset.mediasReels.organes.some((o) => o.id === cible);
  return known ? null : `Cible inconnue : ${cible}.`;
}

/**
 * Séries de la semaine (phase 25), par carte acceptée : la règle partagée `weekCombos` sur les
 * cartes retenues de chaque acteur, dans l'ordre du plan ; une carte hors catalogue de campagne
 * (action présidentielle) n'entre dans aucune série.
 */
function weekSeries(
  ruleset: Ruleset,
  validated: readonly ValidatedAction[],
): Map<string, { label: string; taux: number }> {
  const byActor = new Map<string, ValidatedAction[]>();
  for (const v of validated) {
    if (!byActor.has(v.actorId)) byActor.set(v.actorId, []);
    byActor.get(v.actorId)!.push(v);
  }
  const series = new Map<string, { label: string; taux: number }>();
  for (const [actorId, cards] of byActor) {
    const ordered = [...cards].sort((a, b) => a.index - b.index);
    const plan = ordered.map((v) => ({
      actionId: v.definition.id,
      ...(v.cible === null ? {} : { cible: v.cible }),
    }));
    for (const s of weekCombos(plan, ruleset).series) {
      const card = ordered[s.index]!;
      series.set(actionKey(actorId, card.index), {
        label: seriesLabel(card.definition.libelle, s.famille, s.rang, s.taux),
        taux: s.taux,
      });
    }
  }
  return series;
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
  // Négociations de soutien déjà retenues dans le plan (phase 15).
  const negotiations: string[] = [];

  planned.forEach((action, index) => {
    const definition = ruleset.actions.find((a) => a.id === action.actionId);
    let reason: string | null;
    if (!definition) reason = 'Action inconnue dans ce jeu de règles.';
    else {
      const { cout, prerequis } = definition;
      reason = targetError(ruleset, definition, action.cible);
      if (!reason && definition.campagne?.soutien && action.cible !== undefined) {
        reason = negotiationError(state, ruleset, actorId, action.cible, negotiations);
      }
      if (!reason && action.posture !== undefined && !isPlateau(ruleset, definition)) {
        reason = POSTURE_WITHOUT_PLATEAU;
      } else if (!reason && resources.militants < prerequis.militantsMin) {
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
        prestation: null,
      });
      return;
    }
    const { cout } = definition;
    budget -= cout.budgetCentimes;
    time -= cout.tempsHeures;
    spent += cout.budgetCentimes;
    if (definition.campagne?.soutien && cible) negotiations.push(cible);
    const plateau = isPlateau(ruleset, definition);
    validated.push({
      actorId,
      index,
      definition,
      cible,
      posture: plateau ? (action.posture ?? ruleset.prestations.postureParDefaut) : null,
      postureChoisie: plateau && action.posture !== undefined,
    });
    outcomes.push({
      actorId,
      index,
      actionId: definition.id,
      label: definition.libelle,
      status: 'validee',
      reason: null,
      cost: { ...cout },
      cible: cible === null ? null : targetLabel(ruleset, definition, cible),
      prestation: null,
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

export type CampaignBooks = { finances: FinanceBook; parrainages: ParrainageBook };

/** Clé d'une action de la semaine (acteur et rang dans son plan). */
export const actionKey = (actorId: string, index: number) => `${actorId}#${index}`;

/** Positions des cartes acceptées de chaque acteur dans son plan (implantation, phase 25). */
export function acceptedIndices(validated: readonly ValidatedAction[]): Record<string, number[]> {
  const accepted: Record<string, number[]> = {};
  for (const { actorId, index } of validated) (accepted[actorId] ??= []).push(index);
  return accepted;
}

/**
 * Passages dans les médias de la semaine (phase 11), notés avant tout effet : préparation
 * acquise plus celle de la semaine (quel que soit l'ordre du plan), passages antérieurs dans
 * la même action, situation et programme en début d'étape.
 */
export function scorePlateaux(
  state: GameState,
  ruleset: Ruleset,
  validated: readonly ValidatedAction[],
): Map<string, Prestation> {
  const preparation = new Map<string, number>();
  for (const v of validated)
    if (v.definition.campagne?.preparationDebat)
      preparation.set(
        v.actorId,
        (preparation.get(v.actorId) ?? 0) + v.definition.campagne.preparationDebat,
      );
  const prestations = new Map<string, Prestation>();
  for (const v of validated) {
    if (v.posture === null) continue;
    const passagesSemaine = validated.filter(
      (o) => o.actorId === v.actorId && o.definition.id === v.definition.id && o.index < v.index,
    ).length;
    prestations.set(
      actionKey(v.actorId, v.index),
      scorePrestation(state, ruleset, {
        actorId: v.actorId,
        definition: v.definition,
        cible: v.cible,
        posture: v.posture,
        choisie: v.postureChoisie,
        preparationSemaine: preparation.get(v.actorId) ?? 0,
        passagesSemaine,
      }),
    );
  }
  return prestations;
}

/**
 * Étape 5 : effets des actions (immédiats ou programmés), effets de campagne (promesses de
 * parrainage, dons, prêt, préparation des débats) et tirage de leur risque éventuel. Pour un
 * passage dans les médias, rien n'est tiré : la part variable des effets suit le score du
 * passage et l'aléa ne survient que sous le seuil d'incident (phase 11).
 */
export function resolveActionEffects(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  books: CampaignBooks,
  validated: readonly ValidatedAction[],
  step: number,
): {
  risks: ReportEvent[];
  incidents: Set<string>;
  prestations: Map<string, Prestation>;
  supports: ReportEvent[];
} {
  const week = state.meta.week;
  const risks: ReportEvent[] = [];
  const supports: ReportEvent[] = [];
  const incidents = new Set<string>();
  const prestations = scorePlateaux(state, ruleset, validated);
  const series = weekSeries(ruleset, validated);
  for (const { actorId, index, definition, cible } of validated) {
    const rng = stream(state.meta.seed, week, 'action', actorId, index, definition.id);
    const prestation = prestations.get(actionKey(actorId, index));
    const variable = (effect: Effect) =>
      prestation ? scoredAlea(effect.ecart, prestation.score) : drawAlea(rng, effect);
    const ref = `a-${week}-${actorId}-${index}`;
    const base = {
      state,
      ledger,
      book: books.finances,
      actorId,
      week,
      step,
      ref,
      ...(prestation ? { variable: `selon le passage (score ${prestation.score})` } : {}),
    };
    definition.effets.forEach((effect, i) =>
      applyOrSchedule(
        {
          ...base,
          label: definition.libelle,
          source: 'action',
          rattrapage: ruleset.rattrapageNotoriete,
          ...(series.has(actionKey(actorId, index))
            ? { serie: series.get(actionKey(actorId, index))! }
            : {}),
        },
        effect,
        variable(effect),
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
    if (campagne?.soutien && cible) {
      supports.push(
        negotiate(state, ruleset, ledger, actorId, cible, campagne.soutien.contrepartie, step),
      );
    }
    const risk = definition.risque;
    const happens = prestation ? prestation.incident : !!risk && rng.nextFloat() < risk.probabilite;
    if (risk && happens) {
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
          variable(effect),
          i,
        ),
      );
      incidents.add(actorId);
      risks.push({
        id: riskRef,
        kind: 'risque',
        refId: definition.id,
        label: risk.libelle,
        description: prestation
          ? `Passage raté de ${state.actors[actorId]!.label} (« ${definition.libelle} », score ${prestation.score} : seuil d'incident ${ruleset.prestations.seuils.incident}).`
          : `Aléa de l'action « ${definition.libelle} » de ${state.actors[actorId]!.label} (probabilité ${Math.round(risk.probabilite * 100)} %).`,
        nature: 'simule',
        majeur: false,
        decisionId: null,
      });
    }
  }
  recordPassages(state, validated);
  return { risks, incidents, prestations, supports };
}

/**
 * Relevé des actions récentes de la semaine, par candidat et par action : lassitude du public
 * et de l'IA, contexte des événements (phase 11) ; le fil des publications ne suffit pas.
 */
function recordPassages(state: GameState, validated: readonly ValidatedAction[]): void {
  const week = state.meta.week;
  for (const { actorId, definition } of validated) {
    const byAction = (state.numerique.passages[actorId] ??= {});
    byAction[definition.id] = [
      ...(byAction[definition.id] ?? []).filter((w) => w > week - DIGITAL_HISTORY_WEEKS),
      week,
    ].slice(-DIGITAL_HISTORY_WEEKS);
  }
}
