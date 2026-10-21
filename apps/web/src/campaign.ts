import type { Actor, GameState, ParrainagesState, Ruleset } from '@r2027/shared';

// Présentation des données de campagne (phase 5). Ces fonctions ne simulent rien : elles
// résument l'état calculé par le serveur pour l'affichage.

const sum = (counts: Readonly<Record<string, number>>) =>
  Object.values(counts).reduce((total, n) => total + n, 0);

/** Résumé des parrainages : effectifs par étape et présentations comptées pour le seuil. */
export function presentationSummary(p: ParrainagesState, ruleset: Ruleset) {
  const { seuil, departementsMin, partMaxParDepartement } = ruleset.parrainages;
  const cap = Math.floor(seuil * partMaxParDepartement);
  const valid = Object.values(p.validees).filter((n) => n > 0);
  const counted = valid.reduce((total, n) => total + Math.min(n, cap), 0);
  return {
    promesses: sum(p.promesses),
    intentions: sum(p.intentions),
    recues: sum(p.recues),
    validees: sum(p.validees),
    invalides: p.invalides.formulaire_irregulier ?? 0,
    comptees: counted,
    departements: valid.length,
    seuil,
    departementsMin,
    cap,
    atteint: counted >= seuil && valid.length >= departementsMin,
  };
}

/** Plafond des dépenses applicable : second tour pour un finaliste, sinon premier tour. */
export function spendingCapOf(state: GameState, actor: Actor, ruleset: Ruleset): number {
  const t1 = state.elections.t1;
  const finalist = t1 !== null && t1.winner === null && t1.qualified.includes(actor.id);
  return finalist ? ruleset.finances.plafondT2Centimes : ruleset.finances.plafondT1Centimes;
}

export function echeanceDate(ruleset: Ruleset, id: string): string | null {
  return ruleset.calendrier.echeances.find((e) => e.id === id)?.date ?? null;
}

/** Les présentations sont-elles closes à la date de jeu ? */
export function nominationsClosed(ruleset: Ruleset, date: string): boolean {
  const closing = echeanceDate(ruleset, ruleset.parrainages.clotureEcheanceId);
  return closing !== null && date > closing;
}
