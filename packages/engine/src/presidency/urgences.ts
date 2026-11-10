import {
  describeIndicatorChange,
  signedHundredths,
  type GameState,
  type PendingDecision,
  type ReportEvent,
  type Ruleset,
  type UrgencyDefinition,
  DECISION_FOLLOW_UP_HISTORY,
  type DecisionFollowUp,
} from '@r2027/shared';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import type { CouncilBook } from './conseil';
import type { EconomyBook } from './economy';
import { memberInCharge, memberName, postCompetenceOf } from './members';

// Urgences ministérielles (phase 15) : bibliothèque d'urgences sectorielles fictives du jeu de
// règles (grève, pénurie, incendies, cyberattaque…), rattachées à un ministère. Au plus une par
// semaine, aucune tant qu'une urgence ou une crise attend la décision du président. Le président
// joueur tranche entre deux choix la semaine suivante (pop-up avec le ministre en charge,
// nomination simulée, aucun propos prêté) ; le président IA retient aussitôt le choix par défaut.
// Effets : popularité du président (modulée par la compétence du ministre : × (0,5 +
// compétence)), indicateurs économiques, popularité prêtée et loyauté du ministre.
// Phase 25 ter : chaque arbitrage enclenche un suivi 2 à 5 semaines plus tard (échéance tirée à la
// décision). Une part de l'effet sur l'opinion n'arrive qu'au suivi, dans le sens du bilan :
// favorable ou défavorable, selon la compétence du ministre et la nature du choix (tirage
// déterministe). Le bilan est simulé, dit clairement, et chiffré ; il reste au journal de mandat.

export type UrgencyContext = {
  state: GameState;
  ruleset: Ruleset;
  ledger: Ledger;
  economy: EconomyBook;
  council: CouncilBook;
  presidentId: string;
  step: number;
};

const pct = (value: number) => `${Math.round(value * 100)} %`;

function eligible(state: GameState, urgency: UrgencyDefinition): boolean {
  const history = state.eventHistory[urgency.id];
  const week = state.meta.week;
  if (history && urgency.occurrencesMax !== null && history.count >= urgency.occurrencesMax)
    return false;
  if (history && week - history.lastWeek < urgency.delaiMinEntreOccurrences) return false;
  if (urgency.mois && !urgency.mois.includes(Number(state.meta.date.slice(5, 7)))) return false;
  return memberInCharge(state, urgency.poste) !== null;
}

/** Effets d'un choix, en clair, pour le président (hypothèses du jeu). */
function choiceSummary(choice: UrgencyDefinition['choix'][number]): string {
  const parts = [
    `popularité du président ${signedHundredths(choice.popularite)} pt (selon la compétence du ministre)`,
  ];
  for (const e of choice.economie) parts.push(describeIndicatorChange(e.indicateur, e.valeur));
  if (choice.ministre.popularite)
    parts.push(`popularité prêtée du ministre ${signedHundredths(choice.ministre.popularite)} pt`);
  if (choice.ministre.loyaute)
    parts.push(`loyauté du ministre ${signedHundredths(choice.ministre.loyaute * 100)}`);
  return `${choice.description} Effets (hypothèses du jeu) : ${parts.join(', ')}.`;
}

function urgencyDecision(
  state: GameState,
  ruleset: Ruleset,
  urgency: UrgencyDefinition,
  presidentId: string,
): PendingDecision {
  const member = memberInCharge(state, urgency.poste)!;
  const poste =
    ruleset.quinquennat.postes.find((p) => p.id === urgency.poste)?.libelle ?? urgency.poste;
  return {
    id: `u-${state.meta.week}-${urgency.id}`,
    kind: 'urgence',
    eventId: urgency.id,
    actorId: presidentId,
    createdWeek: state.meta.week,
    label: urgency.libelle,
    description: `${urgency.description} Ministre en charge : ${memberName(state, ruleset, member)} (${poste}) — nomination simulée, aucun propos ne lui est attribué. Situation fictive.`,
    options: urgency.choix.map((c) => ({
      id: c.id,
      libelle: c.libelle,
      description: choiceSummary(c),
    })),
    defaultOptionId: urgency.choixParDefaut,
    posteId: urgency.poste,
  };
}

/**
 * Réponse du président (joueur ou IA) à une urgence : effets du choix retenu, par les
 * registres. Le ministre en charge est celui du poste au moment de la réponse. Renvoie le libellé.
 */
export function answerUrgency(
  context: UrgencyContext,
  urgencyId: string,
  optionId: string,
): string {
  const { state, ruleset, ledger, economy, council, presidentId, step } = context;
  const urgency = ruleset.urgences.liste.find((u) => u.id === urgencyId);
  const choice = urgency?.choix.find((c) => c.id === optionId);
  if (!urgency || !choice) throw new Error(`Urgence ou choix inconnu : ${urgencyId}/${optionId}`);
  const label = `${urgency.libelle} — ${choice.libelle}`;
  const member = memberInCharge(state, urgency.poste);
  const competence = member ? postCompetenceOf(state, ruleset, member, urgency.poste) : 0.5;
  const name = member ? memberName(state, ruleset, member) : 'Premier ministre';
  const total = Math.round(choice.popularite * (0.5 + competence));
  // Phase 25 ter : une part de l'effet attend le suivi, qui dira si la décision a porté.
  const followUp = state.quinquennat !== null;
  const deferred = followUp ? Math.round(total * ruleset.urgences.suivi.partDifferee) : 0;
  ledger.apply(presidentId, 'popularite', [
    {
      label: `${label} (ministre : ${name}, compétence ${pct(competence)}, hypothèse de jeu${followUp ? ', effet immédiat' : ''})`,
      value: total - deferred,
      source: 'decision',
      step,
    },
  ]);
  for (const e of choice.economie) economy.add(e.indicateur, label, e.valeur, 'decision');
  if (member)
    council.note(member.ref, `Urgence « ${urgency.libelle} » : ${choice.libelle}`, {
      popularite: choice.ministre.popularite,
      loyaute: choice.ministre.loyaute,
    });
  if (state.quinquennat) {
    const { delaiMin, delaiMax } = ruleset.urgences.suivi;
    const week = state.meta.week;
    const delay =
      delaiMin +
      Math.floor(
        stream(state.meta.seed, week, 'suivi', urgency.id).nextFloat() * (delaiMax - delaiMin + 1),
      );
    const suivi: DecisionFollowUp = {
      id: `${urgency.id}-${week}`,
      urgenceId: urgency.id,
      choixId: choice.id,
      libelle: `${urgency.libelle} : ${choice.libelle}`,
      ministre: member?.ref ?? null,
      competence,
      popularite: deferred,
      semaine: week,
      echeance: week + delay,
      statut: 'en-cours',
      bilan: null,
    };
    state.quinquennat.suivisDecisions = [...state.quinquennat.suivisDecisions, suivi].slice(
      -DECISION_FOLLOW_UP_HISTORY,
    );
  }
  return label;
}

/** Événement du bilan d'une décision ministérielle (phase 25 ter). */
export const FOLLOW_UP_EVENT = 'suivi-decision';

const REACTIONS = {
  favorable: [
    'l’opinion le relève (enquêtes simulées)',
    'les médias en dressent un bilan positif (couverture simulée)',
    'l’Assemblée en prend acte sans polémique (débats simulés)',
  ],
  defavorable: [
    'l’opinion s’en détourne (enquêtes simulées)',
    'les médias pointent un échec (couverture simulée)',
    'l’opposition s’en saisit à l’Assemblée (débats simulés)',
  ],
} as const;

/** Probabilité d'un bilan favorable : compétence du ministre et nature du choix (hypothèses). */
export function followUpChance(ruleset: Ruleset, suivi: DecisionFollowUp): number {
  const rules = ruleset.urgences.suivi;
  const choice = ruleset.urgences.liste
    .find((u) => u.id === suivi.urgenceId)
    ?.choix.find((c) => c.id === suivi.choixId);
  const bonus = (choice?.popularite ?? 0) >= 0 ? rules.bonusChoix : -rules.bonusChoix;
  const chance = rules.reussiteBase + rules.poidsCompetence * (suivi.competence - 0.5) + bonus;
  return Math.min(0.95, Math.max(0.05, chance));
}

/**
 * Suivis arrivés à échéance (début de l'étape 5) : bilan favorable ou défavorable (tirage
 * déterministe), part différée de l'effet sur la popularité du président, dans le sens du bilan
 * (au moins le plancher du jeu de règles), et popularité prêtée du ministre s'il est toujours au
 * gouvernement. Renvoie un événement court par bilan.
 */
export function resolveFollowUps(context: UrgencyContext): ReportEvent[] {
  const { state, ruleset, ledger, council, presidentId, step } = context;
  const quinquennat = state.quinquennat;
  if (!quinquennat) return [];
  const rules = ruleset.urgences.suivi;
  const week = state.meta.week;
  const government = quinquennat.gouvernement;
  const seated = new Set(
    government ? [government.premierMinistre, ...government.ministres].map((m) => m.ref) : [],
  );
  const events: ReportEvent[] = [];
  quinquennat.suivisDecisions = quinquennat.suivisDecisions.map((suivi) => {
    if (suivi.statut !== 'en-cours' || suivi.echeance > week) return suivi;
    const rng = stream(state.meta.seed, suivi.semaine, 'suivi', suivi.id, 'bilan');
    const favorable = rng.nextFloat() < followUpChance(ruleset, suivi);
    const magnitude = Math.max(Math.abs(suivi.popularite), rules.plancher);
    const popularite = favorable ? magnitude : -magnitude;
    const verdict = favorable ? 'favorable' : 'défavorable';
    ledger.apply(presidentId, 'popularite', [
      {
        label: `Suivi de décision : ${suivi.libelle} — bilan ${verdict} (simulé, hypothèse de jeu)`,
        value: popularite,
        source: 'decision',
        step,
      },
    ]);
    const ministre = suivi.ministre && seated.has(suivi.ministre) ? suivi.ministre : null;
    const ministrePopularite = ministre ? (favorable ? rules.ministre : -rules.ministre) : 0;
    if (ministre)
      council.note(ministre, `Bilan de la décision « ${suivi.libelle} » : ${verdict}`, {
        popularite: ministrePopularite,
      });
    const reactions = favorable ? REACTIONS.favorable : REACTIONS.defavorable;
    const reaction = reactions[Math.floor(rng.nextFloat() * reactions.length)]!;
    const effects = [`popularité du président ${signedHundredths(popularite)} pt`];
    if (ministre)
      effects.push(`popularité prêtée du ministre ${signedHundredths(ministrePopularite)} pt`);
    const texte = favorable
      ? `Bilan favorable : la décision a produit l’effet attendu ; ${reaction}. Effets : ${effects.join(', ')}.`
      : `Bilan défavorable : la décision n’a pas produit l’effet attendu ; ${reaction}. Effets : ${effects.join(', ')}.`;
    events.push({
      id: `suivi-${suivi.id}`,
      kind: 'evenement',
      refId: FOLLOW_UP_EVENT,
      label: `Suivi de décision : ${suivi.libelle}`,
      description: `Décision de la semaine ${suivi.semaine} : ${suivi.libelle}. ${texte}`,
      nature: 'simule',
      majeur: false,
      decisionId: null,
    });
    return {
      ...suivi,
      statut: 'fait',
      bilan: { favorable, texte, popularite, ministrePopularite },
    };
  });
  return events;
}

/**
 * Tirage de l'urgence de la semaine (fin de l'étape 5) : parmi les urgences éligibles (délais,
 * saison, ministre en place), une survient avec la probabilité qu'au moins une se produise, puis
 * est choisie au prorata des probabilités. Le président joueur décide la semaine suivante ; le
 * président IA retient aussitôt le choix par défaut.
 */
export function drawUrgencies(context: UrgencyContext, playerPresides: boolean): ReportEvent[] {
  const { state, ruleset, presidentId } = context;
  if (state.pendingDecisions.some((d) => d.kind === 'urgence' || d.kind === 'crise')) return [];
  const candidates = [...ruleset.urgences.liste]
    .sort((a, b) => compareStrings(a.id, b.id))
    .filter((u) => eligible(state, u));
  if (candidates.length === 0) return [];
  const rng = stream(state.meta.seed, state.meta.week, 'urgence');
  const none = candidates.reduce((p, u) => p * (1 - u.probabiliteHebdomadaire), 1);
  if (rng.nextFloat() >= 1 - none) return [];
  const total = candidates.reduce((sum, u) => sum + u.probabiliteHebdomadaire, 0);
  let target = rng.nextFloat() * total;
  const urgency =
    candidates.find((u) => (target -= u.probabiliteHebdomadaire) < 0) ?? candidates.at(-1)!;
  const history = state.eventHistory[urgency.id];
  state.eventHistory[urgency.id] = { count: (history?.count ?? 0) + 1, lastWeek: state.meta.week };
  let decisionId: string | null = null;
  let outcome = '';
  if (playerPresides) {
    const decision = urgencyDecision(state, ruleset, urgency, presidentId);
    state.pendingDecisions.push(decision);
    decisionId = decision.id;
  } else {
    const choice = urgency.choix.find((c) => c.id === urgency.choixParDefaut)!;
    answerUrgency(context, urgency.id, choice.id);
    outcome = ` Arbitrage du président (IA) : ${choice.libelle}.`;
  }
  return [
    {
      id: `${urgency.id}-${state.meta.week}`,
      kind: 'evenement',
      refId: urgency.id,
      label: urgency.libelle,
      description: `${urgency.description}${outcome}`,
      nature: 'fictif',
      majeur: false,
      decisionId,
    },
  ];
}
