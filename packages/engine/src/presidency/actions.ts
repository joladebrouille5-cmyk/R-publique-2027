import type { ActionOutcome, GameState, PlannedAction, Ruleset } from '@r2027/shared';
import { targetLabel, type ValidatedAction } from '../campaign/actions';
import { formatFrenchDate } from '../core/calendar';
import { compareStrings } from '../core/ledger';
import { daysBetween, weekReaches } from './dates';

// Actions du président pendant le quinquennat (jeu de règles, `quinquennat.actions`) : mêmes
// règles pour le joueur et pour l'IA. Elles ne coûtent que du temps : les dépenses de l'État ne
// sont pas celles d'un compte de campagne.

/**
 * Validation des actions du président, dans l'ordre soumis : rejet motivé avant l'investiture,
 * pour une cible manquante ou inconnue, faute de temps, ou pour un remaniement sans
 * gouvernement en place (un seul par semaine).
 */
export function validatePresidencyActions(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
  planned: readonly PlannedAction[],
): { outcomes: ActionOutcome[]; validated: ValidatedAction[] } {
  const outcomes: ActionOutcome[] = [];
  const validated: ValidatedAction[] = [];
  const quinquennat = state.quinquennat!;
  const started = weekReaches(state.meta.date, quinquennat.mandat.debut);
  let time = state.actors[actorId]!.resources.tempsHeures;
  let reshuffle = false;

  planned.forEach((action, index) => {
    const definition = ruleset.quinquennat.actions.find((a) => a.id === action.actionId);
    let reason: string | null = null;
    if (!definition) reason = 'Action inconnue pour le président dans ce jeu de règles.';
    else if (!started)
      reason = `Le mandat commence le ${formatFrenchDate(quinquennat.mandat.debut)}.`;
    else if (definition.cible === null && action.cible !== undefined)
      reason = 'Cette action ne se dirige pas vers une cible.';
    else if (definition.cible === 'departement' && action.cible === undefined)
      reason = 'Choisissez le département du déplacement.';
    else if (
      definition.cible === 'departement' &&
      !(action.cible! in ruleset.parrainages.reservoir.departements)
    )
      reason = `Cible inconnue : ${action.cible}.`;
    else if (definition.cout.tempsHeures > time)
      reason = `Temps insuffisant : ${definition.cout.tempsHeures} h nécessaires, ${Math.max(0, time)} h restantes cette semaine.`;
    else if (definition.institution === 'remaniement' && quinquennat.gouvernement === null)
      reason = 'Aucun gouvernement en place à remanier.';
    else if (definition.institution === 'remaniement' && reshuffle)
      reason = 'Un seul remaniement par semaine.';

    if (!definition || reason) {
      outcomes.push({
        actorId,
        index,
        actionId: action.actionId,
        label: definition?.libelle ?? action.actionId,
        status: 'rejetee',
        reason,
        cost: { budgetCentimes: 0, tempsHeures: 0 },
        cible: null,
      });
      return;
    }
    if (definition.institution === 'remaniement') reshuffle = true;
    time -= definition.cout.tempsHeures;
    const cible = action.cible ?? null;
    validated.push({ actorId, index, definition, cible });
    outcomes.push({
      actorId,
      index,
      actionId: definition.id,
      label: definition.libelle,
      status: 'validee',
      reason: null,
      cost: { ...definition.cout },
      cible: cible === null ? null : targetLabel(ruleset, definition, cible),
    });
  });
  return { outcomes, validated };
}

/** Âge du gouvernement en place, en semaines (0 s'il n'y en a pas). */
export function governmentAgeWeeks(state: GameState): number {
  const government = state.quinquennat?.gouvernement;
  return government ? Math.floor(daysBetween(government.nommeLe, state.meta.date) / 7) : 0;
}

/** Seuils de la règle de l'IA (hypothèses de jeu, documentées dans le plan). */
const AI_RESHUFFLE_POPULARITY = 2_500;
const AI_RESHUFFLE_MIN_WEEKS = 52;
const AI_ADDRESS_PERIOD = 4;

/**
 * Plan hebdomadaire du président IA (règle déterministe, hors cible tirée au sort) : un
 * déplacement chaque semaine dans un département tiré au sort, une action nationale toutes
 * les quatre semaines (à tour de rôle), un remaniement si sa popularité passe sous 25 % et que
 * le gouvernement a au moins un an.
 */
export function planPresidentActions(
  state: GameState,
  ruleset: Ruleset,
  pickDepartement: (codes: readonly string[]) => string,
): PlannedAction[] {
  const quinquennat = state.quinquennat!;
  if (!weekReaches(state.meta.date, quinquennat.mandat.debut) || !quinquennat.gouvernement)
    return [];
  const president = state.actors[quinquennat.mandat.presidentId]!;
  const actions = ruleset.quinquennat.actions;
  const planned: PlannedAction[] = [];
  const reshuffle = actions.find((a) => a.institution === 'remaniement');
  if (
    reshuffle &&
    president.resources.popularite < AI_RESHUFFLE_POPULARITY &&
    governmentAgeWeeks(state) >= AI_RESHUFFLE_MIN_WEEKS
  )
    planned.push({ actionId: reshuffle.id });
  const national = actions.filter((a) => a.cible === null && !a.institution);
  const week = state.meta.week;
  if (national.length > 0 && week % AI_ADDRESS_PERIOD === 0)
    planned.push({ actionId: national[(week / AI_ADDRESS_PERIOD) % national.length]!.id });
  const visit = actions.find((a) => a.cible === 'departement' && !a.institution);
  if (visit) {
    const codes = Object.keys(ruleset.parrainages.reservoir.departements).sort(compareStrings);
    planned.push({ actionId: visit.id, cible: pickDepartement(codes) });
  }
  return planned;
}
