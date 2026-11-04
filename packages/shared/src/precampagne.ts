import { z } from 'zod';

// Pré-campagne (phase 15) : négociations de soutien menées par un candidat auprès des
// personnalités réelles nominables (figures du jeu de règles). Tout est simulé : une
// personnalité qui « soutient » un candidat ne tient aucun propos ; son soutien est un fait de
// jeu, étiqueté comme tel, décidé par le moteur (proximité, rapport de forces, contrepartie).

const Id = z.string().min(1).max(120);

/** Contrepartie offerte : aucune, ou la promesse d'un ministère en cas de victoire. */
export const COUNTERPARTS = ['aucune', 'ministere'] as const;
export const CounterpartSchema = z.enum(COUNTERPARTS);
export type Counterpart = z.infer<typeof CounterpartSchema>;

/** Négociation de soutien d'un candidat avec une figure réelle et son issue (simulée). */
export const NegotiationSchema = z
  .object({
    figureId: Id,
    actorId: Id,
    /** Année de la présidentielle du cycle : un soutien vaut pour une campagne. */
    annee: z.number().int().min(2027),
    semaine: z.number().int().min(0),
    contrepartie: CounterpartSchema,
    issue: z.enum(['soutien', 'refus']),
  })
  .strict();
export type Negotiation = z.infer<typeof NegotiationSchema>;

type WithNegotiations = {
  negociations: readonly Negotiation[];
  cycle: { annee: number };
};

/** Soutiens obtenus par un candidat pendant la campagne du cycle en cours. */
export function supportsOf(state: WithNegotiations, actorId: string): Negotiation[] {
  return state.negociations.filter(
    (n) => n.actorId === actorId && n.issue === 'soutien' && n.annee === state.cycle.annee,
  );
}

/** Soutien en cours d'une figure pendant la campagne du cycle (au plus un candidat), ou null. */
export function supportOfFigure(state: WithNegotiations, figureId: string): Negotiation | null {
  return (
    state.negociations.find(
      (n) => n.figureId === figureId && n.issue === 'soutien' && n.annee === state.cycle.annee,
    ) ?? null
  );
}

/**
 * Personnalités à qui un ministère a été promis pendant la campagne d'un cycle (soutiens obtenus
 * avec cette contrepartie), dans l'ordre des négociations.
 */
export function promisedMinistries(
  state: WithNegotiations,
  actorId: string,
  annee: number,
): string[] {
  return state.negociations
    .filter(
      (n) =>
        n.actorId === actorId &&
        n.annee === annee &&
        n.issue === 'soutien' &&
        n.contrepartie === 'ministere',
    )
    .map((n) => n.figureId);
}

/** Réponse « recevoir la délégation » d'un rendez-vous d'élus (phase 15). */
export const RECEIVE_DELEGATION = 'recevoir';

/**
 * Heures du candidat prises par les délégations d'élus reçues cette semaine, réservées avant ses
 * actions : règle partagée par le moteur (validation du plan) et l'interface (temps restant).
 */
export function delegationHours(
  ruleset: { parrainages: { rendezVous: { tempsHeures: number } } },
  answers: readonly { kind: string; optionId: string | undefined }[],
): number {
  return (
    answers.filter((a) => a.kind === 'parrainage' && a.optionId === RECEIVE_DELEGATION).length *
    ruleset.parrainages.rendezVous.tempsHeures
  );
}
