import type {
  CrisisDefinition,
  GameState,
  PendingDecision,
  ReportEvent,
  Ruleset,
} from '@r2027/shared';
import type { FinanceBook } from '../campaign/finances';
import { applyOrSchedule } from '../core/effects';
import { compareStrings, type Ledger } from '../core/ledger';
import { drawAlea, stream } from '../core/random';
import type { CouncilBook } from './conseil';
import { addConsequence, crisisMultiplier } from './consequences';
import { scheduleEconomy, type EconomyBook } from './economy';
import { memberInCharge, memberName, postCompetenceOf } from './members';

// Crises du quinquennat (phase 6, P6-06) : bibliothèque de crises fictives du jeu de règles,
// tirées chaque semaine selon leurs conditions, leur saison, leur probabilité et leur fréquence ;
// une crise impose une décision au président (le joueur, sinon l'IA retient le choix par
// défaut). Effets immédiats et différés sur l'économie (registre de l'économie) et sur la
// popularité du président (registre des ressources). Phase 7 : probabilité modulée par le
// scénario de départ et les fragilités en cours ; séquelles durables de la crise et du choix.
// Phase 11 : la compétence du membre du gouvernement chargé de la crise (ministre du poste
// concerné, sinon le Premier ministre) module l'effet de la réponse sur la popularité.

const MAX_CRISES_PER_WEEK = 1;

type Context = {
  state: GameState;
  ruleset: Ruleset;
  ledger: Ledger;
  finances: FinanceBook;
  book: EconomyBook;
  presidentId: string;
  step: number;
  /** Faits de la semaine pour le Conseil des ministres (phase 15). */
  council?: CouncilBook;
};

function eligible(
  state: GameState,
  crisis: CrisisDefinition,
  presidentPopularity: number,
): boolean {
  const history = state.eventHistory[crisis.id];
  const week = state.meta.week;
  if (history && crisis.occurrencesMax !== null && history.count >= crisis.occurrencesMax)
    return false;
  if (history && week - history.lastWeek < crisis.delaiMinEntreOccurrences) return false;
  if (crisis.mois && !crisis.mois.includes(Number(state.meta.date.slice(5, 7)))) return false;
  const indicators = state.economie!.indicateurs;
  return crisis.conditions.every((c) => {
    const value = c.sur === 'popularite' ? presidentPopularity : (indicators[c.sur] ?? 0);
    return (c.min === null || value >= c.min) && (c.max === null || value <= c.max);
  });
}

/** Applique des effets économiques (immédiats ou différés) et des effets sur le président. */
function applyEffects(
  context: Context,
  origin: { ref: string; label: string; source: 'evenement' | 'decision' },
  economy: CrisisDefinition['economie'],
  effects: CrisisDefinition['effets'],
): void {
  const { state, book, ledger, finances, presidentId, step } = context;
  for (const e of economy) {
    if (e.delaiSemaines === 0)
      book.add(
        e.indicateur,
        origin.label,
        e.valeur,
        origin.source === 'decision' ? 'decision' : 'crise',
      );
    else scheduleEconomy(state, e.indicateur, e.valeur, e.delaiSemaines, origin.label);
  }
  const rng = stream(state.meta.seed, state.meta.week, 'crise', origin.ref);
  effects.forEach((effect, i) =>
    applyOrSchedule(
      {
        state,
        ledger,
        book: finances,
        actorId: presidentId,
        week: state.meta.week,
        step,
        label: origin.label,
        source: origin.source,
        ref: origin.ref,
      },
      effect,
      drawAlea(rng, effect),
      i,
    ),
  );
}

function crisisDecision(
  state: GameState,
  crisis: CrisisDefinition,
  presidentId: string,
): PendingDecision {
  return {
    id: `k-${state.meta.week}-${crisis.id}`,
    kind: 'crise',
    eventId: crisis.id,
    actorId: presidentId,
    createdWeek: state.meta.week,
    label: crisis.libelle,
    description: crisis.description,
    options: crisis.choix.map((c) => ({
      id: c.id,
      libelle: c.libelle,
      description: c.description,
    })),
    defaultOptionId: crisis.choixParDefaut,
  };
}

/** Réponse du président (joueur ou IA) à une crise : effets du choix retenu. */
export function answerCrisis(context: Context, crisisId: string, optionId: string): string {
  const crisis = context.ruleset.crises.find((c) => c.id === crisisId);
  const choice = crisis?.choix.find((c) => c.id === optionId);
  if (!crisis || !choice) throw new Error(`Crise ou choix inconnu : ${crisisId}/${optionId}`);
  const label = `${crisis.libelle} — ${choice.libelle}`;
  applyEffects(
    context,
    { ref: `${crisisId}-${context.state.meta.week}-${choice.id}`, label, source: 'decision' },
    choice.economie,
    choice.effets,
  );
  if (choice.durable)
    addConsequence(context.state, choice.durable, 'decision', `${crisisId}/${choice.id}`);
  crisisManagement(context, crisis);
  return label;
}

/** Gestion de la crise par le membre du gouvernement qui en a la charge (registre). */
function crisisManagement(context: Context, crisis: CrisisDefinition): void {
  const { state, ruleset, ledger, presidentId, step } = context;
  const member = memberInCharge(state, crisis.poste);
  if (!member) return;
  const competence = postCompetenceOf(state, ruleset, member, crisis.poste);
  const value = Math.round(ruleset.quinquennat.equipe.crise * (competence - 0.5));
  const poste = crisis.poste
    ? (ruleset.quinquennat.postes.find((p) => p.id === crisis.poste)?.libelle ?? crisis.poste)
    : 'Premier ministre';
  // Popularité prêtée du membre en charge (phase 15) : poids × (compétence − 0,5).
  context.council?.note(member.ref, `Crise « ${crisis.libelle} » : gestion de la crise`, {
    popularite: Math.round(ruleset.quinquennat.suivi.popularite.crise * (competence - 0.5)),
  });
  if (value === 0) return;
  ledger.apply(presidentId, 'popularite', [
    {
      label: `${crisis.libelle} : gestion par ${memberName(state, ruleset, member)} (${poste}, compétence ${Math.round(competence * 100)} %, hypothèse de jeu)`,
      value,
      source: 'decision',
      step,
    },
  ]);
}

/**
 * Tirage des crises de la semaine (au plus une, et aucune tant qu'une crise attend la décision
 * du président). La crise produit ses effets immédiats ; le président joueur doit décider la
 * semaine suivante, le président IA retient aussitôt le choix par défaut.
 */
export function drawCrises(context: Context, playerPresides: boolean): ReportEvent[] {
  const { state, ruleset, presidentId } = context;
  if (state.pendingDecisions.some((d) => d.kind === 'crise')) return [];
  const popularity = state.actors[presidentId]!.resources.popularite;
  const events: ReportEvent[] = [];
  const crises = [...ruleset.crises].sort((a, b) => compareStrings(a.id, b.id));
  for (const crisis of crises) {
    if (events.length >= MAX_CRISES_PER_WEEK) break;
    if (!eligible(state, crisis, popularity)) continue;
    const rng = stream(state.meta.seed, state.meta.week, 'crise', crisis.id, 'tirage');
    const probability = Math.min(
      1,
      crisis.probabiliteHebdomadaire * crisisMultiplier(state, ruleset, crisis.id),
    );
    if (rng.nextFloat() >= probability) continue;
    const history = state.eventHistory[crisis.id];
    state.eventHistory[crisis.id] = { count: (history?.count ?? 0) + 1, lastWeek: state.meta.week };
    applyEffects(
      context,
      { ref: `${crisis.id}-${state.meta.week}`, label: crisis.libelle, source: 'evenement' },
      crisis.economie,
      crisis.effets,
    );
    if (crisis.durable) addConsequence(state, crisis.durable, 'crise', crisis.id);
    let decisionId: string | null = null;
    let outcome = '';
    if (playerPresides) {
      const decision = crisisDecision(state, crisis, presidentId);
      state.pendingDecisions.push(decision);
      decisionId = decision.id;
    } else {
      outcome = ` Réponse du président (IA) : ${answerCrisis(context, crisis.id, crisis.choixParDefaut).split(' — ')[1]}.`;
    }
    events.push({
      id: `${crisis.id}-${state.meta.week}`,
      kind: 'evenement',
      refId: crisis.id,
      label: crisis.libelle,
      description: `${crisis.description}${outcome}`,
      nature: 'fictif',
      majeur: crisis.majeur,
      decisionId,
    });
  }
  return events;
}
