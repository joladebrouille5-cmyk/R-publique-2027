import {
  addDays,
  daysFromCivil,
  formatIsoDate,
  isLeapYear,
  parseIsoDate,
  type Cycle,
  type GameState,
  type Ruleset,
} from '@r2027/shared';

// Calendrier institutionnel (phase 6). Les dates de campagne du jeu de règles sont celles de
// 2027 ; un cycle ultérieur les décale de semaines entières (jours de la semaine conservés).
// Les dates du mandat, elles, avancent de cinq ans jour pour jour (Constitution, art. 6).

/** Cycle de la présidentielle de 2027 (calendrier du jeu de règles, sans décalage). */
export const FIRST_CYCLE: Cycle = { annee: 2027, decalageSemaines: 0 };

function dayNumber(iso: string): number {
  const civil = parseIsoDate(iso);
  if (!civil) throw new Error(`Date ISO invalide : ${iso}`);
  return daysFromCivil(civil);
}

/** Même jour, `years` ans plus tard (un 29 février devient un 28 février hors année bissextile). */
export function addYears(iso: string, years: number): string {
  const civil = parseIsoDate(iso);
  if (!civil) throw new Error(`Date ISO invalide : ${iso}`);
  const year = civil.year + years;
  const day = civil.month === 2 && civil.day === 29 && !isLeapYear(year) ? 28 : civil.day;
  return formatIsoDate({ year, month: civil.month, day });
}

/** Nombre de jours entre deux dates ISO (positif si `b` est postérieure à `a`). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Date du calendrier de 2027 transposée dans le cycle `cycle`. */
export function shiftToCycle(iso: string, cycle: Cycle): string {
  return addDays(iso, 7 * cycle.decalageSemaines);
}

/** Cycle électoral suivant (jeu de règles), ou null si le jeu de règles n'en prévoit plus. */
export function nextCycle(ruleset: Ruleset, cycle: Cycle): Cycle | null {
  const next = ruleset.quinquennat.cycles.find((c) => c.annee > cycle.annee);
  return next ? { annee: next.annee, decalageSemaines: next.decalageSemaines } : null;
}

/**
 * Début et fin du mandat issu de la présidentielle du cycle : ceux de 2027 (déduits de la
 * proclamation de 2022) avancés de la durée du mandat pour chaque cycle écoulé.
 */
export function mandateDates(ruleset: Ruleset, cycle: Cycle): { debut: string; fin: string } {
  const { investiture, finMandat, mandat } = ruleset.quinquennat;
  const elapsed = cycle.annee - FIRST_CYCLE.annee;
  if (elapsed % mandat.dureeAnnees !== 0)
    throw new Error(`Cycle ${cycle.annee} hors du rythme des mandats de ${mandat.dureeAnnees} ans`);
  return { debut: addYears(investiture.date, elapsed), fin: addYears(finMandat.date, elapsed) };
}

/**
 * Lundi où commence la campagne du cycle suivant : la date de départ de la partie décalée du
 * cycle suivant. Le quinquennat se joue jusqu'à cette date ; null si aucun cycle n'est prévu.
 */
export function nextCampaignStart(state: GameState, ruleset: Ruleset): string | null {
  const next = nextCycle(ruleset, state.cycle);
  return next ? shiftToCycle(state.meta.startDate, next) : null;
}

/** Vrai si la semaine commençant le lundi `weekStart` contient la date `iso` ou la suit. */
export function weekReaches(weekStart: string, iso: string): boolean {
  return daysBetween(weekStart, iso) < 7;
}
