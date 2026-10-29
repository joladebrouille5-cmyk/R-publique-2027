import {
  daysFromCivil,
  DEPARTEMENT_MARQUE,
  isOptionalDecision,
  parseIsoDate,
  type DecisionAnswer,
  type EventDefinition,
  type GameState,
  type PendingDecision,
  type ReportEvent,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import type { CampaignBooks } from '../campaign/actions';
import { processDonations, type FinanceBook } from '../campaign/finances';
import { answerRendezVous } from '../campaign/rendezvous';
import { applyOrSchedule } from '../core/effects';
import { EngineInputError } from '../core/errors';
import { compareStrings, type Ledger } from '../core/ledger';
import { drawAlea, stream } from '../core/random';

type AppliedDecision = WeeklyReport['decisions'][number];
type ResolvedAnswer = { decision: PendingDecision; optionId: string; automatic: boolean };

/**
 * Étape 1 : chaque décision en attente doit recevoir une réponse valide avant de résoudre
 * la semaine. En mode observateur, et pour une décision facultative (questions au
 * gouvernement, phase 15), l'option par défaut est retenue automatiquement.
 */
export function validateDecisionAnswers(
  state: GameState,
  answers: readonly DecisionAnswer[],
): ResolvedAnswer[] {
  const pending = new Map(state.pendingDecisions.map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const answer of answers) {
    if (seen.has(answer.decisionId)) {
      throw new EngineInputError('decision_en_double', `Décision répétée : ${answer.decisionId}`);
    }
    seen.add(answer.decisionId);
    const decision = pending.get(answer.decisionId);
    if (!decision) {
      throw new EngineInputError(
        'decision_inconnue',
        `Aucune décision en attente : ${answer.decisionId}`,
      );
    }
    if (!decision.options.some((o) => o.id === answer.optionId)) {
      throw new EngineInputError('option_inconnue', `Option inconnue pour « ${decision.label} ».`);
    }
  }
  const automatic = state.player.mode === 'observateur';
  return [...pending.values()]
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((decision) => {
      const answer = answers.find((a) => a.decisionId === decision.id);
      // Décision facultative (questions au gouvernement) : l'option par défaut s'applique.
      if (!answer && !automatic && !isOptionalDecision(decision)) {
        throw new EngineInputError(
          'decision_requise',
          `Décision à prendre avant de continuer : « ${decision.label} ».`,
        );
      }
      return {
        decision,
        optionId: answer?.optionId ?? decision.defaultOptionId,
        automatic: !answer,
      };
    });
}

/** Étape 5 : application des options choisies pour les décisions de la semaine précédente. */
export function applyDecisions(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  books: CampaignBooks,
  answers: readonly ResolvedAnswer[],
  step: number,
): AppliedDecision[] {
  const week = state.meta.week;
  const book = books.finances;
  const applied: AppliedDecision[] = [];
  for (const { decision, optionId, automatic } of answers) {
    if (decision.kind === 'parrainage') {
      // Rendez-vous d'élus (phase 15) : promesses si la délégation est reçue (heures : étape 2).
      applied.push({
        decisionId: decision.id,
        eventId: decision.eventId,
        optionId,
        label: answerRendezVous(state, ruleset, books.parrainages, decision, optionId),
        automatic,
      });
      continue;
    }
    if (decision.kind === 'consigne') {
      // Consigne de vote du joueur éliminé : pas d'effet sur les ressources, effet au second tour.
      const toActorId = optionId === 'aucune' ? null : optionId;
      state.elections.consignes.push({ fromActorId: decision.actorId, toActorId, automatic });
      const option = decision.options.find((o) => o.id === optionId)!;
      applied.push({
        decisionId: decision.id,
        eventId: decision.eventId,
        optionId,
        label: `${decision.label} : ${option.libelle}`,
        automatic,
      });
      continue;
    }
    const definition = ruleset.evenements.find((e) => e.id === decision.eventId);
    const option = definition?.choix.find((c) => c.id === optionId);
    if (!definition || !option) throw new Error(`Événement ou option introuvable : ${decision.id}`);
    if (state.actors[decision.actorId]) {
      const rng = stream(state.meta.seed, week, 'decision', decision.id, option.id);
      const context = {
        state,
        ledger,
        book,
        actorId: decision.actorId,
        week,
        step,
        ref: `${decision.id}-${option.id}`,
        label: `${decision.label} — ${option.libelle}`,
        source: 'decision' as const,
      };
      option.effets.forEach((effect, i) =>
        applyOrSchedule(context, effect, drawAlea(rng, effect), i),
      );
    }
    applied.push({
      decisionId: decision.id,
      eventId: definition.id,
      optionId: option.id,
      label: `${decision.label} : ${option.libelle}`,
      automatic,
    });
  }
  state.pendingDecisions = [];
  return applied;
}

/** Rang du joueur dans les dernières intentions (1 = en tête), sinon null. */
function rankOf(state: GameState, actorId: string): number | null {
  const intentions = state.opinion?.intentions;
  const mine = intentions?.[actorId];
  if (!intentions || mine === undefined) return null;
  return 1 + Object.values(intentions).filter((v) => v > mine).length;
}

const within = (value: number, bounds: { min: number | null; max: number | null }) =>
  (bounds.min === null || value >= bounds.min) && (bounds.max === null || value <= bounds.max);

/** Semaines pleines avant le prochain scrutin du calendrier (null s'il n'y en a plus). */
function weeksBeforeNextRound(state: GameState, ruleset: Ruleset): number | null {
  const today = daysFromCivil(parseIsoDate(state.meta.date)!);
  const next = ruleset.calendrier.scrutins
    .map((s) => daysFromCivil(parseIsoDate(s.date)!))
    .find((day) => day >= today);
  return next === undefined ? null : Math.floor((next - today) / 7);
}

/** Départements où le candidat a fait campagne (parrainages promis, envisagés ou validés). */
function campaignedDepartements(state: GameState, actorId: string): string[] {
  const p = state.actors[actorId]!.parrainages;
  return [
    ...new Set([
      ...Object.keys(p.promesses),
      ...Object.keys(p.intentions),
      ...Object.keys(p.validees),
    ]),
  ].sort(compareStrings);
}

function isEligible(
  state: GameState,
  ruleset: Ruleset,
  event: EventDefinition,
  actorId: string,
  departements: readonly string[],
): boolean {
  const resources = state.actors[actorId]!.resources;
  const history = state.eventHistory[event.id];
  const week = state.meta.week;
  if (history && event.occurrencesMax !== null && history.count >= event.occurrencesMax)
    return false;
  if (history && week - history.lastWeek < event.delaiMinEntreOccurrences) return false;
  const ok = event.conditions.every(
    (c) =>
      (c.min === null || resources[c.ressource] >= c.min) &&
      (c.max === null || resources[c.ressource] <= c.max),
  );
  if (!ok) return false;
  // Contexte (phase 11) : phase, calendrier, rang, actions récentes, département de campagne.
  const { phases, semainesAvantScrutin, rang, actionsRecentes, local } = event.contexte;
  const phase = state.meta.phase;
  if (phases && !(phase === 'campagne' || phase === 'entre_deux_tours')) return false;
  if (phases && !phases.includes(phase as 'campagne' | 'entre_deux_tours')) return false;
  if (semainesAvantScrutin) {
    const weeks = weeksBeforeNextRound(state, ruleset);
    if (weeks === null || !within(weeks, semainesAvantScrutin)) return false;
  }
  if (rang) {
    const rank = rankOf(state, actorId);
    if (rank === null || !within(rank, rang)) return false;
  }
  if (actionsRecentes) {
    const passages = state.numerique.passages[actorId] ?? {};
    const since = week - actionsRecentes.semaines;
    const recent = actionsRecentes.actions.some((id) =>
      (passages[id] ?? []).some((w) => w > since && w <= week),
    );
    if (!recent) return false;
  }
  return !local || departements.length > 0;
}

/** Libellés d'un événement, avec le département d'un événement local. */
function placed(text: string, departement: string | null, ruleset: Ruleset): string {
  if (departement === null) return text;
  const dep = ruleset.parrainages.reservoir.departements[departement];
  return text.replaceAll(DEPARTEMENT_MARQUE, dep ? `${dep.nom} (${departement})` : departement);
}

/**
 * Événements éligibles cette semaine pour le joueur, dans leur contexte, avec leur poids :
 * probabilité hebdomadaire × fréquence du scénario × fraîcheur (famille vue récemment).
 */
export function eventWeights(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
): { event: EventDefinition; weight: number }[] {
  const week = state.meta.week;
  // Scénario de départ (phase 7) : fréquence des événements de campagne.
  const frequency =
    ruleset.scenarios.find((s) => s.id === state.scenario)?.campagne.evenements ?? 1;
  const { facteur, semaines } = ruleset.jeu.fraicheurEvenements;
  const families = new Map(ruleset.evenements.map((e) => [e.id, e.famille]));
  const lastByFamily = new Map<string, number>();
  for (const [id, h] of Object.entries(state.eventHistory)) {
    const family = families.get(id);
    if (family)
      lastByFamily.set(family, Math.max(lastByFamily.get(family) ?? -Infinity, h.lastWeek));
  }
  const departements = campaignedDepartements(state, actorId);
  return [...ruleset.evenements]
    .sort((a, b) => compareStrings(a.id, b.id))
    .filter((event) => isEligible(state, ruleset, event, actorId, departements))
    .map((event) => {
      const recent = week - (lastByFamily.get(event.famille) ?? -Infinity) <= semaines;
      return {
        event,
        weight: Math.min(1, event.probabiliteHebdomadaire * frequency * (recent ? facteur : 1)),
      };
    })
    .filter((c) => c.weight > 0);
}

/**
 * Étape 5 : tirage des événements de la semaine (§8 : conditions, probabilité, fréquence,
 * effets immédiats et différés, choix). Phase 11 : parmi les événements éligibles dans leur
 * contexte, un événement survient avec la probabilité qu'au moins un se produise
 * (1 − Π(1 − p)), puis est choisi au prorata des probabilités, sans biais d'ordre ; une famille
 * vue dans les semaines récentes pèse moins (fraîcheur). Au plus `evenementsMaxParSemaine`
 * événements, de familles différentes, et une seule nouvelle décision par semaine.
 */
export function drawEvents(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  book: FinanceBook,
  step: number,
): ReportEvent[] {
  const actorId = state.player.actorId;
  const player = actorId ? state.actors[actorId] : undefined;
  // Événements de campagne : seulement pour un joueur encore en lice.
  if (!actorId || !player || (player.status !== 'candidat' && player.status !== 'qualifie'))
    return [];
  const week = state.meta.week;
  const triggered: ReportEvent[] = [];
  let decisionCreated = false;

  const departements = campaignedDepartements(state, actorId);
  let pool = eventWeights(state, ruleset, actorId);
  const draw = stream(state.meta.seed, week, 'evenements');

  while (triggered.length < ruleset.jeu.evenementsMaxParSemaine) {
    const candidates = pool.filter((c) => !(decisionCreated && c.event.choix.length > 0));
    if (candidates.length === 0) break;
    const none = candidates.reduce((p, c) => p * (1 - c.weight), 1);
    if (draw.nextFloat() >= 1 - none) break;
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let target = draw.nextFloat() * total;
    const picked = candidates.find((c) => (target -= c.weight) < 0) ?? candidates.at(-1)!;
    const event = picked.event;
    pool = pool.filter((c) => c.event.famille !== event.famille);
    const departement = event.contexte.local
      ? departements[draw.nextInt(departements.length)]!
      : null;
    const libelle = placed(event.libelle, departement, ruleset);
    const description = placed(event.description, departement, ruleset);
    const rng = stream(state.meta.seed, week, 'evenement', event.id);

    const previous = state.eventHistory[event.id];
    state.eventHistory[event.id] = { count: (previous?.count ?? 0) + 1, lastWeek: week };
    const id = `e-${week}-${event.id}`;
    let decisionId: string | null = null;

    if (event.choix.length > 0) {
      decisionId = `d-${week}-${event.id}`;
      decisionCreated = true;
      state.pendingDecisions.push({
        id: decisionId,
        kind: 'evenement',
        eventId: event.id,
        actorId,
        createdWeek: week,
        label: libelle,
        description,
        options: event.choix.map(({ id: optionId, libelle: optionLabel, description: text }) => ({
          id: optionId,
          libelle: optionLabel,
          description: text,
        })),
        defaultOptionId: event.choixParDefaut!,
      });
    }
    const context = {
      state,
      ledger,
      book,
      actorId,
      week,
      step,
      ref: id,
      label: libelle,
      source: 'evenement' as const,
    };
    event.effets.forEach((effect, i) => applyOrSchedule(context, effect, drawAlea(rng, effect), i));
    if (event.campagne?.dons) {
      processDonations(
        book,
        ruleset,
        actorId,
        event.campagne.dons,
        rng,
        libelle,
        'evenement',
        step,
        week,
      );
    }

    triggered.push({
      id,
      kind: 'evenement',
      refId: event.id,
      label: libelle,
      description,
      nature: event.nature,
      majeur: event.majeur,
      decisionId,
    });
  }
  return triggered;
}
