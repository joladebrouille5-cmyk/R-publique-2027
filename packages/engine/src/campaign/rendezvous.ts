import {
  delegationHours,
  RECEIVE_DELEGATION,
  type GameState,
  type PendingDecision,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { stream } from '../core/random';
import {
  available,
  committedByDepartement,
  departements,
  gainPromises,
  presentationWindow,
  type ParrainageBook,
} from './parrainages';

// Rendez-vous d'élus (phase 15) : pendant la course aux parrainages, jusqu'à la semaine qui
// précède la clôture des présentations, une délégation d'élus locaux d'un département (fictive et
// anonyme : aucun élu n'est nommé) propose des promesses de parrainage au candidat du joueur.
// Choix binaire : la recevoir (promesses dans la limite des élus encore libres, heures prises sur
// la semaine suivante) ou décliner. Paramètres de jeu (hypothèses, `parrainages.rendezVous`).

export const RENDEZ_VOUS_EVENT = 'rendez-vous-elus';
export const RECEIVE_OPTION = RECEIVE_DELEGATION;
const DECLINE_OPTION = 'decliner';

/** Nom lisible d'un département : « Ain (01) ». */
function departementLabel(ruleset: Ruleset, dep: string): string {
  const entry = ruleset.parrainages.reservoir.departements[dep];
  return entry ? `${entry.nom} (${dep})` : dep;
}

/**
 * Promesses proposées par la délégation : tirage propre à la semaine et au département du
 * rendez-vous, refait à l'identique au moment de la réponse.
 */
function offeredPromises(state: GameState, ruleset: Ruleset, week: number, dep: string): number {
  const { min, max } = ruleset.parrainages.rendezVous.promesses;
  return (
    min + stream(state.meta.seed, week, 'rendez-vous', dep, 'promesses').nextInt(max - min + 1)
  );
}

/** Heures du candidat prises par les délégations reçues (réservées avant ses actions). */
export function meetingHours(
  ruleset: Ruleset,
  answers: readonly { decision: PendingDecision; optionId: string }[],
): number {
  return delegationHours(
    ruleset,
    answers.map((a) => ({ kind: a.decision.kind, optionId: a.optionId })),
  );
}

/**
 * Étape 5 : tirage d'un rendez-vous d'élus pour le joueur candidat (au plus un en attente,
 * délai minimal entre deux). Département tiré au prorata des élus encore libres, deux fois plus
 * souvent là où le candidat n'a encore aucun engagement. Renvoie l'événement du bilan.
 */
export function drawRendezVous(state: GameState, ruleset: Ruleset): ReportEvent | null {
  const actorId = state.player.actorId;
  const player = actorId ? state.actors[actorId] : undefined;
  if (!actorId || !player || player.status !== 'candidat') return null;
  if (state.campagne.parrainages !== 'modelise' || state.meta.phase !== 'campagne') return null;
  const window = presentationWindow(state.meta.date, ruleset);
  if (window.closed || window.closingWeek) return null;
  if (state.pendingDecisions.some((d) => d.kind === 'parrainage')) return null;
  const rules = ruleset.parrainages.rendezVous;
  const week = state.meta.week;
  const history = state.eventHistory[RENDEZ_VOUS_EVENT];
  if (history && week - history.lastWeek < rules.delaiSemaines) return null;
  const rng = stream(state.meta.seed, week, 'rendez-vous');
  if (rng.nextFloat() >= rules.probabiliteHebdo) return null;

  const engaged = committedByDepartement(state);
  const p = player.parrainages;
  const options = departements(ruleset)
    .map((dep) => {
      const free = available(state, ruleset, dep, engaged);
      const mine = (p.promesses[dep] ?? 0) + (p.intentions[dep] ?? 0) + (p.recues[dep] ?? 0);
      return { dep, free, weight: free * (mine === 0 ? 2 : 1) };
    })
    .filter((o) => o.free >= rules.promesses.min);
  if (options.length === 0) return null;
  let target = rng.nextFloat() * options.reduce((sum, o) => sum + o.weight, 0);
  const picked = options.find((o) => (target -= o.weight) < 0) ?? options.at(-1)!;
  const dep = picked.dep;
  const offered = Math.min(offeredPromises(state, ruleset, week, dep), picked.free);
  const place = departementLabel(ruleset, dep);

  state.eventHistory[RENDEZ_VOUS_EVENT] = { count: (history?.count ?? 0) + 1, lastWeek: week };
  const decision: PendingDecision = {
    id: `p-${week}-${dep}`,
    kind: 'parrainage',
    eventId: RENDEZ_VOUS_EVENT,
    actorId,
    createdWeek: week,
    label: `Rendez-vous d’élus : ${place}`,
    description: `Une délégation d’élus locaux de ${place} (délégation fictive, aucun élu n’est nommé) demande à vous rencontrer : jusqu’à ${offered} promesses de parrainage sont en jeu, dans la limite des élus encore libres du département.`,
    options: [
      {
        id: RECEIVE_OPTION,
        libelle: 'Recevoir la délégation',
        description: `Jusqu’à ${offered} promesses de parrainage en ${place} ; ${rules.tempsHeures} h de votre semaine, réservées avant vos actions.`,
      },
      {
        id: DECLINE_OPTION,
        libelle: 'Décliner',
        description: 'Aucune promesse ; votre temps reste disponible pour vos actions.',
      },
    ],
    defaultOptionId: RECEIVE_OPTION,
    departement: dep,
  };
  state.pendingDecisions.push(decision);
  return {
    id: `rendez-vous-${week}-${dep}`,
    kind: 'evenement',
    refId: RENDEZ_VOUS_EVENT,
    label: decision.label,
    description: decision.description,
    nature: 'fictif',
    majeur: false,
    decisionId: decision.id,
  };
}

/** Réponse au rendez-vous : promesses obtenues si la délégation est reçue. Libellé du bilan. */
export function answerRendezVous(
  state: GameState,
  ruleset: Ruleset,
  book: ParrainageBook,
  decision: PendingDecision,
  optionId: string,
): string {
  const dep = decision.departement;
  if (!dep) throw new Error(`Rendez-vous d’élus sans département : ${decision.id}`);
  const place = departementLabel(ruleset, dep);
  if (optionId !== RECEIVE_OPTION) return `Rendez-vous d’élus : ${place} — délégation déclinée`;
  const offered = offeredPromises(state, ruleset, decision.createdWeek, dep);
  const label = `Rendez-vous d’élus — ${place}`;
  const got = gainPromises(state, ruleset, book, decision.actorId, dep, offered, label);
  return `Rendez-vous d’élus : ${place} — délégation reçue, ${got} promesse(s) de parrainage`;
}
