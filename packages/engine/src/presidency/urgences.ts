import {
  describeIndicatorChange,
  signedHundredths,
  type GameState,
  type PendingDecision,
  type ReportEvent,
  type Ruleset,
  type UrgencyDefinition,
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
  ledger.apply(presidentId, 'popularite', [
    {
      label: `${label} (ministre : ${name}, compétence ${pct(competence)}, hypothèse de jeu)`,
      value: Math.round(choice.popularite * (0.5 + competence)),
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
  return label;
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
