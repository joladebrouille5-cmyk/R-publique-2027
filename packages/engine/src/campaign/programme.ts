import type {
  ElectorateGroup,
  ProgrammeChange,
  ProgrammeReport,
  ProgrammeState,
  Proposal,
  Ruleset,
} from '@r2027/shared';
import { distance } from '../election/model';

// Programme (§6) : propositions des 17 domaines, avec coût, délai, faisabilité, dépendances,
// incompatibilités, effets et niveau de confiance (estimations de jeu). Le programme entre dans
// le score latent par deux facteurs : son attrait pour chaque groupe et sa crédibilité (§5.1).

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const INDEX = new WeakMap<Ruleset, Map<string, Proposal>>();

/** Propositions indexées par identifiant (calculé une fois par jeu de règles). */
export function proposalsById(ruleset: Ruleset): Map<string, Proposal> {
  let index = INDEX.get(ruleset);
  if (!index) {
    index = new Map(ruleset.programme.propositions.map((p) => [p.id, p]));
    INDEX.set(ruleset, index);
  }
  return index;
}

export type ProgrammeValidation = {
  next: string[];
  added: string[];
  removed: string[];
  refused: { id: string; motif: string }[];
  hours: number;
};

/**
 * Valide les changements de programme demandés pour la semaine : retraits d'abord (refusés si
 * une proposition conservée en dépend), puis annonces dans l'ordre (proposition connue, non
 * déjà retenue, dépendances présentes, aucune incompatibilité, taille maximale, temps
 * disponible). Chaque refus est motivé.
 */
export function validateProgrammeChange(
  programme: ProgrammeState,
  change: ProgrammeChange,
  ruleset: Ruleset,
  hoursAvailable: number,
): ProgrammeValidation {
  const proposals = proposalsById(ruleset);
  const label = (id: string) => proposals.get(id)?.libelle ?? id;
  const next = [...programme.propositions];
  const refused: ProgrammeValidation['refused'] = [];
  const removed: string[] = [];
  const added: string[] = [];

  for (const id of change.retirer) {
    if (!next.includes(id)) {
      refused.push({ id, motif: `« ${label(id)} » ne figure pas dans le programme.` });
      continue;
    }
    const dependent = next.find(
      (other) => other !== id && proposals.get(other)?.dependances.includes(id),
    );
    if (dependent) {
      refused.push({
        id,
        motif: `« ${label(dependent)} » dépend de « ${label(id)} » : retirez-la d'abord.`,
      });
      continue;
    }
    next.splice(next.indexOf(id), 1);
    removed.push(id);
  }

  let hours = 0;
  const { heuresParProposition, maxPropositions } = ruleset.programme;
  for (const id of change.ajouter) {
    const proposal = proposals.get(id);
    if (!proposal) {
      refused.push({ id, motif: 'Proposition inconnue dans ce jeu de règles.' });
      continue;
    }
    if (next.includes(id)) {
      refused.push({ id, motif: `« ${proposal.libelle} » figure déjà dans le programme.` });
      continue;
    }
    const missing = proposal.dependances.filter((dep) => !next.includes(dep));
    if (missing.length > 0) {
      refused.push({
        id,
        motif: `« ${proposal.libelle} » suppose d'abord : ${missing.map((m) => `« ${label(m)} »`).join(', ')}.`,
      });
      continue;
    }
    const conflict = proposal.incompatibilites.find((other) => next.includes(other));
    if (conflict) {
      refused.push({
        id,
        motif: `« ${proposal.libelle} » est incompatible avec « ${label(conflict)} ».`,
      });
      continue;
    }
    if (next.length >= maxPropositions) {
      refused.push({ id, motif: `Le programme compte déjà ${maxPropositions} propositions.` });
      continue;
    }
    if (hours + heuresParProposition > hoursAvailable) {
      refused.push({
        id,
        motif: `Temps insuffisant : ${heuresParProposition} h de préparation par proposition.`,
      });
      continue;
    }
    hours += heuresParProposition;
    next.push(id);
    added.push(id);
  }
  return { next, added, removed, refused, hours };
}

export function applyProgramme(
  programme: ProgrammeState,
  validation: ProgrammeValidation,
): ProgrammeState {
  return {
    propositions: validation.next,
    revirements: programme.revirements + validation.removed.length,
  };
}

export function programmeReport(actorId: string, v: ProgrammeValidation): ProgrammeReport | null {
  if (v.added.length + v.removed.length + v.refused.length === 0) return null;
  return { actorId, ajoutees: v.added, retirees: v.removed, refusees: v.refused };
}

/** Coût annuel total du programme, en millions d'euros (estimation de jeu). */
export function programmeCost(programme: ProgrammeState, ruleset: Ruleset): number {
  const proposals = proposalsById(ruleset);
  return programme.propositions.reduce(
    (sum, id) => sum + (proposals.get(id)?.coutMillionsEuros ?? 0),
    0,
  );
}

export type CredibilityBreakdown = {
  value: number;
  factors: { label: string; value: number }[];
};

/**
 * Crédibilité du programme (−1 à +1) : base, faisabilité moyenne, coût au-delà du soutenable,
 * revirements. Un candidat sans programme part d'une crédibilité négative.
 */
export function credibility(programme: ProgrammeState, ruleset: Ruleset): CredibilityBreakdown {
  const proposals = proposalsById(ruleset);
  const items = programme.propositions
    .map((id) => proposals.get(id))
    .filter((p) => p !== undefined);
  const { coutSoutenable, penaliteRevirement } = ruleset.programme;
  const factors: CredibilityBreakdown['factors'] = [];
  if (items.length === 0) {
    factors.push({ label: 'Aucune proposition annoncée', value: -0.2 });
  } else {
    factors.push({ label: 'Programme annoncé', value: 0.3 });
    const feasibility = items.reduce((sum, p) => sum + p.faisabilite, 0) / items.length;
    factors.push({ label: 'Faisabilité moyenne des propositions', value: feasibility - 0.5 });
    const cost = items.reduce((sum, p) => sum + p.coutMillionsEuros, 0);
    if (cost > coutSoutenable) {
      factors.push({
        label: 'Coût jugé insoutenable',
        value: -Math.min(1, (cost - coutSoutenable) / coutSoutenable),
      });
    }
  }
  if (programme.revirements > 0) {
    factors.push({
      label: `Revirements (${programme.revirements})`,
      value: -penaliteRevirement * programme.revirements,
    });
  }
  const value = clamp(
    factors.reduce((sum, f) => sum + f.value, 0),
    -1,
    1,
  );
  return { value, factors };
}

/**
 * Attrait du programme pour un groupe d'électeurs : moyenne, sur ses propositions, de la
 * proximité entre la mesure et le groupe (bonus pour les groupes particulièrement concernés),
 * pondérée par l'étendue du programme. Nul sans programme.
 */
export function programmeAppeal(
  programme: ProgrammeState,
  group: ElectorateGroup,
  ruleset: Ruleset,
): number {
  const proposals = proposalsById(ruleset);
  const items = programme.propositions
    .map((id) => proposals.get(id))
    .filter((p) => p !== undefined);
  if (items.length === 0) return 0;
  const appeal =
    items.reduce(
      (sum, p) =>
        sum +
        clamp(1 - distance(group.position, p.position), -1, 1) +
        (p.publics.includes(group.id) ? 0.3 : 0),
      0,
    ) / items.length;
  const coverage = Math.min(1, items.length / 6);
  return appeal * coverage;
}
