import {
  candidateName,
  supportOfFigure,
  supportsOf,
  type Actor,
  type Counterpart,
  type ElectorateGroup,
  type GameState,
  type GovernmentFigure,
  type ReportEvent,
  type Ruleset,
  type SupportProspects,
  type UtilityFactor,
} from '@r2027/shared';
import { proximity } from '../ai/relations';
import { EngineInputError } from '../core/errors';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';

// Négociations de soutien (phase 15) : un candidat rencontre une personnalité réelle nominable
// (figure du jeu de règles) pour obtenir son soutien, avec ou sans la promesse d'un ministère.
// Tout est simulé : la personnalité ne tient aucun propos ; son soutien ou son refus est un fait
// de jeu décidé par le moteur (règles d'exclusion, puis tirage selon la proximité, les intentions
// de vote et la contrepartie), étiqueté comme tel. Mêmes règles pour le joueur et pour l'IA.

const ACTIVE = new Set(['candidat', 'qualifie']);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pct = (value: number) => `${Math.round(value * 100)} %`;
const sameParty = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const figureName = (figure: GovernmentFigure) => `${figure.prenom} ${figure.nom}`;

/** Proximité (0 à 100) entre un candidat et une personnalité. */
export function figureProximity(actor: Actor, figure: GovernmentFigure): number {
  return proximity(actor, { id: figure.id, candidate: { positionnement: figure.position } });
}

/** Ce que le moteur sait, avant toute rencontre, du soutien possible d'une personnalité. */
export type SupportAssessment = {
  figureId: string;
  proximite: number;
  /** Candidat que la personnalité soutient pendant cette campagne, sinon null. */
  soutient: string | null;
  /** Motif factuel qui exclut tout accord, sinon null. */
  motif: string | null;
  /** Probabilités d'accord (0 à 1) selon la contrepartie ; null si un motif exclut l'accord. */
  probabilites: Record<Counterpart, number> | null;
};

/** Dernier refus de la personnalité à ce candidat pendant la campagne du cycle, sinon null. */
function lastRefusal(state: GameState, actorId: string, figureId: string) {
  return (
    state.negociations.findLast(
      (n) =>
        n.actorId === actorId &&
        n.figureId === figureId &&
        n.issue === 'refus' &&
        n.annee === state.cycle.annee,
    ) ?? null
  );
}

/**
 * Situation d'une personnalité vis-à-vis d'un candidat : soutien déjà acquis à un candidat,
 * candidat de son parti en lice, proximité insuffisante ou refus récent excluent l'accord ;
 * sinon, probabilité = base + poids × (proximité − 50) / 100 + poids × intentions + bonus de la
 * promesse d'un ministère, entre 5 % et 90 % (hypothèses du jeu de règles).
 */
export function assessSupport(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
  figure: GovernmentFigure,
): SupportAssessment {
  const rules = ruleset.negociations;
  const actor = state.actors[actorId]!;
  const proximite = figureProximity(actor, figure);
  const support = supportOfFigure(state, figure.id);
  const result = (motif: string | null, probabilites: SupportAssessment['probabilites']) => ({
    figureId: figure.id,
    proximite,
    soutient: support?.actorId ?? null,
    motif,
    probabilites,
  });
  if (support) {
    const other = state.actors[support.actorId];
    return result(
      support.actorId === actorId
        ? `${figureName(figure)} vous soutient déjà (soutien simulé).`
        : `${figureName(figure)} soutient déjà ${other ? candidateName(other.candidate) : support.actorId} (soutien simulé).`,
      null,
    );
  }
  const rival = Object.values(state.actors)
    .filter((a) => a.id !== actorId && ACTIVE.has(a.status))
    .find((a) => sameParty(a.candidate.parti, figure.parti));
  if (rival && !sameParty(actor.candidate.parti, figure.parti)) {
    return result(
      `Un candidat de son parti (${figure.parti}) est en lice : ${candidateName(rival.candidate)}.`,
      null,
    );
  }
  if (proximite < rules.proximiteMin) {
    return result(
      `Trop éloignée de vos positions : proximité ${proximite}/100, il faut au moins ${rules.proximiteMin}/100.`,
      null,
    );
  }
  const refusal = lastRefusal(state, actorId, figure.id);
  if (refusal && state.meta.week - refusal.semaine < rules.delaiApresRefus) {
    return result(
      `A décliné en semaine ${refusal.semaine} : nouvelle rencontre possible à partir de la semaine ${refusal.semaine + rules.delaiApresRefus}.`,
      null,
    );
  }
  const intentions = (state.opinion?.intentions[actorId] ?? 0) / 10_000;
  const base =
    rules.probabiliteBase +
    (rules.poidsProximite * (proximite - 50)) / 100 +
    rules.poidsIntentions * intentions;
  return result(null, {
    aucune: clamp(base, 0.05, 0.9),
    ministere: clamp(base + rules.bonusMinistere, 0.05, 0.9),
  });
}

/**
 * Vivier des négociations d'un candidat : situation de chaque personnalité nominable, de la plus
 * à la moins proche ; calculé par le moteur, l'interface ne fait que l'afficher.
 */
export function supportProspects(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
): SupportProspects {
  return {
    annee: state.cycle.annee,
    obtenus: supportsOf(state, actorId).length,
    maximum: ruleset.negociations.soutiensMax,
    personnalites: ruleset.figures.figures
      .map((f) => assessSupport(state, ruleset, actorId, f))
      .sort((a, b) => b.proximite - a.proximite || compareStrings(a.figureId, b.figureId)),
  };
}

/**
 * Vivier des négociations du candidat du joueur (route de l'API et du moteur local) : seulement
 * pendant la campagne présidentielle, pour un candidat du joueur encore en lice.
 */
export function playerSupportProspects(state: GameState, ruleset: Ruleset): SupportProspects {
  const actorId = state.player.actorId;
  const player = actorId ? state.actors[actorId] : undefined;
  const campaigning = state.meta.phase === 'campagne' || state.meta.phase === 'entre_deux_tours';
  if (!actorId || !player || !campaigning || !ACTIVE.has(player.status))
    throw new EngineInputError(
      'soutiens_indisponibles',
      'Les négociations de soutien n’ont lieu que pendant la campagne présidentielle, pour votre candidat encore en lice.',
    );
  return supportProspects(state, ruleset, actorId);
}

/**
 * Motif de rejet d'une négociation programmée (aucun coût n'est alors engagé) : même
 * personnalité deux fois dans le plan, accord exclu, ou nombre maximal de soutiens atteint.
 * `planned` : personnalités des négociations déjà retenues dans le plan de la semaine.
 */
export function negotiationError(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
  figureId: string,
  planned: readonly string[],
): string | null {
  const figure = ruleset.figures.figures.find((f) => f.id === figureId)!;
  if (planned.includes(figureId))
    return `Une seule rencontre avec ${figureName(figure)} par semaine.`;
  const { soutiensMax } = ruleset.negociations;
  const obtained = supportsOf(state, actorId).length;
  if (obtained + planned.length >= soutiensMax) {
    return `Au plus ${soutiensMax} soutiens par campagne : ${obtained} obtenu(s)${planned.length ? `, ${planned.length} négociation(s) déjà prévue(s) cette semaine` : ''}.`;
  }
  return assessSupport(state, ruleset, actorId, figure).motif;
}

/**
 * Négociation menée cette semaine (étape 5) : issue simulée, enregistrée dans l'état ; un
 * soutien apporte notoriété et militants (registre) et pèsera sur le vote des groupes proches de
 * la personnalité. Si un autre candidat a obtenu son soutien plus tôt dans la semaine, elle
 * décline. Renvoie l'événement du bilan.
 */
export function negotiate(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  actorId: string,
  figureId: string,
  contrepartie: Counterpart,
  step: number,
): ReportEvent {
  const rules = ruleset.negociations;
  const figure = ruleset.figures.figures.find((f) => f.id === figureId)!;
  const actor = state.actors[actorId]!;
  const week = state.meta.week;
  const name = figureName(figure);
  const candidate = candidateName(actor.candidate);
  const assessment = assessSupport(state, ruleset, actorId, figure);
  const offer =
    contrepartie === 'ministere' ? 'avec la promesse d’un ministère' : 'sans contrepartie';
  let accepted = false;
  let reason: string;
  if (assessment.probabilites) {
    const probability = assessment.probabilites[contrepartie];
    accepted =
      stream(state.meta.seed, week, 'negociation', actorId, figureId).nextFloat() < probability;
    reason = `Négociation ${offer} : proximité ${assessment.proximite}/100, probabilité d’accord ${pct(probability)} (hypothèses du jeu).`;
  } else {
    reason = `Négociation ${offer} : ${assessment.motif}`;
  }
  state.negociations.push({
    figureId,
    actorId,
    annee: state.cycle.annee,
    semaine: week,
    contrepartie,
    issue: accepted ? 'soutien' : 'refus',
  });
  const majeur = actorId === state.player.actorId;
  const unattributed = `Aucun propos n’est attribué à ${name} : son ${accepted ? 'soutien' : 'refus'} est un fait de jeu simulé.`;
  if (!accepted) {
    return {
      id: `negociation-${week}-${actorId}-${figureId}`,
      kind: 'evenement',
      refId: 'negociation-soutien',
      label: `${name} décline la demande de soutien de ${candidate} (refus simulé)`,
      description: `${reason} Nouvelle rencontre possible dans ${rules.delaiApresRefus} semaines. ${unattributed}`,
      nature: 'simule',
      majeur,
      decisionId: null,
    };
  }
  const level = figure.notoriete.niveau;
  const label = `Soutien de ${name} (simulé)`;
  ledger.apply(actorId, 'notoriete', [
    { label, value: rules.notoriete[level - 1]!, source: 'action', step },
  ]);
  ledger.apply(actorId, 'militants', [
    { label, value: rules.militants[level - 1]!, source: 'action', step },
  ]);
  const promise =
    contrepartie === 'ministere'
      ? ' En cas de victoire, un ministère lui est promis : elle sera proposée en tête à l’investiture ; une promesse non tenue coûtera de la popularité.'
      : '';
  return {
    id: `negociation-${week}-${actorId}-${figureId}`,
    kind: 'evenement',
    refId: 'negociation-soutien',
    label: `${name} soutient ${candidate} (soutien simulé)`,
    description: `${reason}${promise} ${unattributed}`,
    nature: 'simule',
    majeur,
    decisionId: null,
  };
}

/**
 * Facteurs de vote des soutiens obtenus pendant la campagne du cycle (hypothèses) : poids ×
 * notoriété de la personnalité (niveau sur 3) × proximité du groupe d'électeurs à sa position.
 */
export function supportFactors(
  state: GameState,
  ruleset: Ruleset,
  group: ElectorateGroup,
  actorId: string,
): UtilityFactor[] {
  const factors: UtilityFactor[] = [];
  for (const support of supportsOf(state, actorId)) {
    const figure = ruleset.figures.figures.find((f) => f.id === support.figureId);
    if (!figure) continue;
    const closeness = Math.max(0, 1 - distance(group.position, figure.position));
    factors.push({
      label: `Soutien de ${figureName(figure)} (simulé)`,
      value: (ruleset.negociations.poids * figure.notoriete.niveau * closeness) / 3,
    });
  }
  return factors;
}

/**
 * Personnalité que l'IA sollicite (au plus une négociation par semaine) : la plus susceptible
 * d'accepter, sans contrepartie à partir de 40 % ; un ministère n'est promis qu'à défaut, quand
 * aucune personnalité n'atteint 40 % sans contrepartie mais qu'une atteint 55 % avec.
 */
export function aiSupportTarget(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
  contrepartie: Counterpart,
): { cible: string; probabilite: number } | null {
  if (supportsOf(state, actorId).length >= ruleset.negociations.soutiensMax) return null;
  const best: Record<Counterpart, { cible: string; probabilite: number } | null> = {
    aucune: null,
    ministere: null,
  };
  for (const figure of ruleset.figures.figures) {
    const p = assessSupport(state, ruleset, actorId, figure).probabilites;
    if (!p) continue;
    for (const key of ['aucune', 'ministere'] as const) {
      if (!best[key] || p[key] > best[key].probabilite)
        best[key] = { cible: figure.id, probabilite: p[key] };
    }
  }
  const without = best.aucune && best.aucune.probabilite >= 0.4 ? best.aucune : null;
  if (contrepartie === 'aucune') return without;
  return !without && best.ministere && best.ministere.probabilite >= 0.55 ? best.ministere : null;
}
