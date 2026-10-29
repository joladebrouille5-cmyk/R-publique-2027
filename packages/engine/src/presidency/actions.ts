import {
  actionCompetenceFactor,
  presidentialActionBlocked,
  recentCrisis,
  type ActionDefinition,
  type ActionOutcome,
  type GameState,
  type PlannedAction,
  type Ruleset,
} from '@r2027/shared';
import { POSTURE_WITHOUT_PLATEAU, targetLabel, type ValidatedAction } from '../campaign/actions';
import { formatFrenchDate } from '../core/calendar';
import { compareStrings, type Ledger } from '../core/ledger';
import { daysBetween, weekReaches } from './dates';
import type { EconomyBook } from './economy';
import { dissolutionBlocked } from './legislatives';
import { memberInCharge, memberName, postCompetenceOf } from './members';

// Actions du président pendant le quinquennat (jeu de règles, `quinquennat.actions`) : mêmes
// règles pour le joueur et pour l'IA. Elles ne coûtent que du temps : les dépenses de l'État ne
// sont pas celles d'un compte de campagne. Phase 13 : actions du chef de l'État (visites,
// sommet de crise, négociation sociale, discours devant le Congrès, commémoration,
// panthéonisation, réunion de la majorité) avec délai entre deux emplois, condition, effets sur
// l'économie et le Parlement, modulation par la compétence du ministre du poste et mobilisation
// du camp présidentiel pendant la campagne des législatives.

// Disponibilité d'une action (délai, condition) : règle partagée avec l'interface.
export { presidentialActionBlocked, recentCrisis };

/**
 * Validation des actions du président, dans l'ordre soumis : rejet motivé avant l'investiture,
 * pour une cible manquante ou inconnue, faute de temps, ou pour un remaniement sans
 * gouvernement en place (un seul par semaine). Phase 15 : un remaniement ciblé vise un
 * ministère pourvu, jamais la semaine d'un remaniement général.
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
  let dissolution = false;
  const plannedIds = new Set<string>();

  planned.forEach((action, index) => {
    const definition = ruleset.quinquennat.actions.find((a) => a.id === action.actionId);
    let reason: string | null;
    if (!definition) reason = 'Action inconnue pour le président dans ce jeu de règles.';
    else if (!started)
      reason = `Le mandat commence le ${formatFrenchDate(quinquennat.mandat.debut)}.`;
    else if (definition.cible === null && action.cible !== undefined)
      reason = 'Cette action ne se dirige pas vers une cible.';
    else if (action.posture !== undefined) reason = POSTURE_WITHOUT_PLATEAU;
    else if (definition.cible === 'departement' && action.cible === undefined)
      reason = 'Choisissez le département du déplacement.';
    else if (
      definition.cible === 'departement' &&
      !(action.cible! in ruleset.parrainages.reservoir.departements)
    )
      reason = `Cible inconnue : ${action.cible}.`;
    else if (definition.cible === 'poste' && action.cible === undefined)
      reason = 'Choisissez le ministère concerné.';
    else if (
      definition.cible === 'poste' &&
      !ruleset.quinquennat.postes.some((p) => p.id === action.cible)
    )
      reason = `Cible inconnue : ${action.cible}.`;
    else if (
      definition.institution === 'remaniement-cible' &&
      !quinquennat.gouvernement?.ministres.some((m) => m.posteId === action.cible)
    )
      reason = 'Aucun ministre en place à ce poste.';
    else if (
      definition.institution === 'remaniement-cible' &&
      planned.some(
        (p) =>
          ruleset.quinquennat.actions.find((a) => a.id === p.actionId)?.institution ===
          'remaniement',
      )
    )
      reason = 'Le remaniement général de la semaine remplace déjà tout le gouvernement.';
    else if (definition.cout.tempsHeures > time)
      reason = `Temps insuffisant : ${definition.cout.tempsHeures} h nécessaires, ${Math.max(0, time)} h restantes cette semaine.`;
    else if (definition.institution === 'remaniement' && quinquennat.gouvernement === null)
      reason = 'Aucun gouvernement en place à remanier.';
    else if (definition.institution === 'remaniement' && reshuffle)
      reason = 'Un seul remaniement par semaine.';
    else if (definition.institution === 'dissolution')
      reason =
        dissolutionBlocked(state, ruleset) ?? (dissolution ? 'Une seule dissolution.' : null);
    else if (definition.delaiSemaines !== undefined && plannedIds.has(definition.id))
      reason = 'Une seule fois par semaine.';
    else reason = presidentialActionBlocked(state, definition);

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
        prestation: null,
      });
      return;
    }
    if (definition.institution === 'remaniement') reshuffle = true;
    if (definition.institution === 'dissolution') dissolution = true;
    plannedIds.add(definition.id);
    time -= definition.cout.tempsHeures;
    const cible = action.cible ?? null;
    validated.push({ actorId, index, definition, cible, posture: null, postureChoisie: false });
    outcomes.push({
      actorId,
      index,
      actionId: definition.id,
      label: definition.libelle,
      status: 'validee',
      reason: null,
      cost: { ...definition.cout },
      cible: cible === null ? null : targetLabel(ruleset, definition, cible),
      prestation: null,
    });
  });
  return { outcomes, validated };
}

const pct = (value: number) => `${Math.round(value * 100)} %`;

type PresidentialContext = {
  state: GameState;
  ruleset: Ruleset;
  ledger: Ledger;
  /** Registre de l'économie (null sans économie simulée). */
  economy: EconomyBook | null;
  step: number;
};

/**
 * Effets propres aux actions du chef de l'État, après leurs effets sur les ressources (phase
 * 13) : modulation par la compétence du ministre du poste (facteur nommé du registre),
 * indicateurs économiques (registre de l'économie), apaisement de la tension et résorption de
 * la fronde, mobilisation du camp présidentiel pendant la campagne des législatives, dernier
 * emploi (délais).
 */
export function applyPresidentialEffects(
  context: PresidentialContext,
  validated: readonly ValidatedAction[],
): void {
  const { state, ruleset, ledger, economy, step } = context;
  const quinquennat = state.quinquennat!;
  const parliament = state.parlement;
  const postes = new Map(ruleset.quinquennat.postes.map((p) => [p.id, p.libelle]));
  for (const { actorId, definition, cible } of validated) {
    quinquennat.usages[definition.id] = state.meta.week;
    let factor = 1;
    if (definition.poste !== undefined) {
      const member = memberInCharge(state, definition.poste);
      if (member) {
        const competence = postCompetenceOf(state, ruleset, member, definition.poste);
        factor = actionCompetenceFactor(ruleset, competence);
        const post = definition.poste
          ? (postes.get(definition.poste) ?? definition.poste)
          : 'Premier ministre';
        for (const effect of definition.effets) {
          if (effect.ressource !== 'popularite' || effect.delaiSemaines !== 0) continue;
          const value = Math.round((factor - 1) * effect.base);
          if (value === 0) continue;
          ledger.apply(actorId, 'popularite', [
            {
              label: `${definition.libelle} : ${post}, ${memberName(state, ruleset, member)} (compétence ${pct(competence)}, hypothèse de jeu)`,
              value,
              source: 'action',
              step,
            },
          ]);
        }
      }
    }
    if (economy)
      for (const e of definition.economie ?? [])
        economy.add(e.indicateur, definition.libelle, e.valeur * factor, 'action');
    if (parliament && definition.parlement) {
      parliament.apaisement = Math.min(
        100,
        parliament.apaisement + definition.parlement.apaisement,
      );
      if (definition.parlement.fronde > 0)
        for (const [id, n] of Object.entries(parliament.fronde))
          parliament.fronde[id] = Math.round(n * (1 - definition.parlement.fronde));
    }
    // Trace des déplacements du président sur la carte (phase 15).
    if (cible && definition.cible === 'departement')
      quinquennat.deplacements[cible] = (quinquennat.deplacements[cible] ?? 0) + 1;
    const campagne = state.legislatives?.campagne;
    if (campagne && cible && definition.cible === 'departement') {
      const { parDeplacement, max } = ruleset.legislatives.alliances.mobilisation;
      campagne.mobilisation[cible] = Math.min(
        max,
        (campagne.mobilisation[cible] ?? 0) + parDeplacement,
      );
    }
  }
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
/** Fronde (députés) à partir de laquelle le président IA réunit sa majorité (phase 13). */
const AI_FRONDE = 8;
/** Tension parlementaire à partir de laquelle il s'adresse au Congrès (phase 13). */
const AI_TENSION = 60;
/** Popularité prêtée d'un ministre sous laquelle le président IA le remplace (phase 15). */
const AI_MINISTER_POPULARITY = 2_000;

/**
 * Plan hebdomadaire du président IA (règle déterministe, hors cible tirée au sort) : un
 * déplacement chaque semaine dans un département tiré au sort, une action nationale toutes
 * les quatre semaines (à tour de rôle), un remaniement si sa popularité passe sous 25 % et que
 * le gouvernement a au moins un an ; une dissolution si ses soutiens sont minoritaires à
 * l'Assemblée alors qu'il est populaire (seuils du jeu de règles, hypothèses). Phase 13 :
 * sommet de crise après une crise, réunion de la majorité quand la fronde grossit, discours
 * devant le Congrès quand la tension monte ; seulement des actions disponibles (délais).
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
  // Remaniement ciblé (phase 15) : le ministre le moins populaire, s'il est en poste depuis
  // assez longtemps et que sa popularité prêtée passe sous le seuil du jeu (hypothèse).
  const targeted = actions.find((a) => a.institution === 'remaniement-cible');
  if (targeted && !planned.length && presidentialActionBlocked(state, targeted) === null) {
    const { semainesMin } = ruleset.quinquennat.suivi.depart;
    const weakest = quinquennat.gouvernement.ministres
      .map((m) => ({ m, track: quinquennat.suivi[m.ref] }))
      .filter(
        (x) =>
          x.track &&
          x.track.popularite < AI_MINISTER_POPULARITY &&
          state.meta.week - x.track.depuis >= semainesMin,
      )
      .sort(
        (a, b) =>
          a.track!.popularite - b.track!.popularite || compareStrings(a.m.posteId, b.m.posteId),
      )[0];
    if (weakest) planned.push({ actionId: targeted.id, cible: weakest.m.posteId });
  }
  const dissolve = actions.find((a) => a.institution === 'dissolution');
  const parliament = state.parlement;
  if (dissolve && parliament && dissolutionBlocked(state, ruleset) === null) {
    const seats = Object.values(parliament.groupes);
    const filled = seats.reduce((sum, g) => sum + g.sieges, 0);
    const supporters = seats
      .filter((g) => g.alignement === 'soutien')
      .reduce((sum, g) => sum + g.sieges, 0);
    const { soutiensMax, populariteMin } = ruleset.legislatives.ia;
    if (supporters < soutiensMax * filled && president.resources.popularite >= populariteMin)
      planned.push({ actionId: dissolve.id });
  }
  const week = state.meta.week;
  const available = (a: ActionDefinition) => presidentialActionBlocked(state, a) === null;
  const byId = (id: string) => actions.find((a) => a.id === id && available(a));
  // Situations particulières (phase 13) : crise récente, fronde, tension élevée.
  const urgent: (ActionDefinition | undefined)[] = [];
  if (recentCrisis(state))
    urgent.push(actions.find((a) => a.condition === 'crise-recente' && available(a)));
  const fronde = Object.values(parliament?.fronde ?? {}).reduce((sum, n) => sum + n, 0);
  if (fronde >= AI_FRONDE) urgent.push(byId('reunion-majorite'));
  if ((parliament?.tension.valeur ?? 0) >= AI_TENSION) urgent.push(byId('discours-congres'));
  for (const action of urgent)
    if (action && !planned.some((p) => p.actionId === action.id))
      planned.push({ actionId: action.id });
  // Une action nationale toutes les quatre semaines, à tour de rôle parmi les disponibles.
  const national = actions.filter(
    (a) =>
      a.cible === null &&
      !a.institution &&
      a.condition === undefined &&
      a.id !== 'reunion-majorite',
  );
  if (national.length > 0 && week % AI_ADDRESS_PERIOD === 0) {
    const start = (week / AI_ADDRESS_PERIOD) % national.length;
    const next = [...national.slice(start), ...national.slice(0, start)].find(
      (a) => available(a) && !planned.some((p) => p.actionId === a.id),
    );
    if (next) planned.push({ actionId: next.id });
  }
  // Un déplacement chaque semaine, à tour de rôle parmi les visites disponibles.
  const visits = actions.filter((a) => a.cible === 'departement' && !a.institution);
  const visit = [
    ...visits.slice(week % Math.max(1, visits.length)),
    ...visits.slice(0, week % Math.max(1, visits.length)),
  ].find(available);
  if (visit) {
    const codes = Object.keys(ruleset.parrainages.reservoir.departements).sort(compareStrings);
    planned.push({ actionId: visit.id, cible: pickDepartement(codes) });
  }
  return planned.slice(0, ruleset.jeu.actionsMaxParSemaine);
}
