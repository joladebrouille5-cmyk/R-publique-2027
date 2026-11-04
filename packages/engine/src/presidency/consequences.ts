import type { Consequence, GameState, LongTermEffect, Ruleset } from '@r2027/shared';
import type { Ledger } from '../core/ledger';
import type { EconomyBook } from './economy';

// Conséquences à long terme (phase 7) : un choix, une crise ou le scénario de départ laisse un
// effet hebdomadaire pendant plusieurs semaines (indicateurs, popularité du président) et des
// fragilités qui modifient la probabilité d'autres crises. Les effets passent par les registres
// (économie et ressources) avec un facteur nommé « conséquence durable » ; les conséquences
// achevées restent dans l'état pour le bilan du quinquennat.

type Origin = Consequence['origine'];

/** Enregistre une conséquence durable, effective à partir de la semaine suivante. */
export function addConsequence(
  state: GameState,
  effect: LongTermEffect,
  origine: Origin,
  ref: string,
): Consequence {
  const debut = state.meta.week + 1;
  const consequence: Consequence = {
    id: `${origine}-${ref}-${state.meta.week}`,
    libelle: effect.libelle,
    origine,
    ref,
    debut,
    fin: debut + effect.semaines - 1,
    economie: effect.economie.map((e) => ({ ...e })),
    popularite: effect.popularite,
    vulnerabilites: effect.vulnerabilites.map((v) => ({ ...v })),
  };
  state.consequences.push(consequence);
  return consequence;
}

/** Conséquences actives pendant la semaine `week`. */
export function activeConsequences(state: GameState, week = state.meta.week): Consequence[] {
  return state.consequences.filter((c) => c.debut <= week && week <= c.fin);
}

/**
 * Multiplicateur de probabilité d'une crise : scénario de départ, puis fragilités des
 * conséquences actives (produit des multiplicateurs).
 */
export function crisisMultiplier(state: GameState, ruleset: Ruleset, crisisId: string): number {
  const scenario = ruleset.scenarios.find((s) => s.id === state.scenario);
  let factor = scenario?.quinquennat.crises ?? 1;
  for (const c of activeConsequences(state))
    for (const v of c.vulnerabilites) if (v.crise === crisisId) factor *= v.multiplicateur;
  return factor;
}

/**
 * Effets hebdomadaires des conséquences actives : indicateurs (registre de l'économie) et
 * popularité du président (registre des ressources), chacun avec son facteur nommé.
 */
export function applyConsequences(
  state: GameState,
  book: EconomyBook | null,
  ledger: Ledger,
  presidentId: string,
  step: number,
): number {
  const active = activeConsequences(state);
  for (const c of active) {
    const label = `Conséquence durable : ${c.libelle} (semaine ${state.meta.week - c.debut + 1} sur ${c.fin - c.debut + 1})`;
    if (book) for (const e of c.economie) book.add(e.indicateur, label, e.valeur, 'durable');
    if (c.popularite !== 0)
      ledger.apply(presidentId, 'popularite', [
        { label, value: c.popularite, source: 'durable', step },
      ]);
  }
  return active.length;
}
