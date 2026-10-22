import {
  candidateName,
  type DebateDetail,
  type GamePhase,
  type GameState,
  type ReportEvent,
  type RoundResult,
  type Ruleset,
} from '@r2027/shared';
import { provisionalReimbursement } from '../campaign/finances';
import { credibility } from '../campaign/programme';
import { scrutinInWeek } from '../core/calendar';
import { compareStrings } from '../core/ledger';
import { openQuinquennat } from '../presidency/government';
import { distance } from './model';

/** Scrutin (et numéro de tour) qui a lieu pendant la semaine en cours de résolution. */
export function scrutinOfWeek(state: GameState, ruleset: Ruleset) {
  const scrutin = scrutinInWeek(state.meta.date, ruleset);
  if (!scrutin) return null;
  const round = ruleset.calendrier.scrutins.indexOf(scrutin) + 1;
  if (round !== 1 && round !== 2) throw new Error(`Tour de scrutin non pris en charge : ${round}`);
  return { scrutin, round: round as 1 | 2 };
}

/**
 * Conséquences d'un tour : statuts des candidats, phase de jeu, consignes de vote des
 * éliminés (§5.3 : un soutien ne transfère pas toutes les voix), ouverture du quinquennat.
 */
export function concludeRound(
  state: GameState,
  ruleset: Ruleset,
  result: RoundResult,
): { phaseChange: { from: GamePhase; to: GamePhase }; events: ReportEvent[] } {
  const from = state.meta.phase;
  const events: ReportEvent[] = [];
  const week = state.meta.week;
  if (result.round === 1) state.elections.t1 = result;
  else state.elections.t2 = result;
  updateReimbursements(state, ruleset, result);

  if (result.winner) {
    for (const actor of Object.values(state.actors)) {
      if (actor.status === 'candidat' || actor.status === 'qualifie') {
        actor.status = actor.id === result.winner ? 'elu' : 'battu';
      }
    }
    state.pendingDecisions = state.pendingDecisions.filter((d) => d.kind !== 'consigne');
    // Phase 6 : le vainqueur (joueur ou IA) entre en fonctions à l'investiture.
    openQuinquennat(state, ruleset, result.winner);
    return { phaseChange: { from, to: state.meta.phase }, events };
  }

  // Premier tour sans majorité absolue : deux qualifiés.
  const [first, second] = result.qualified as [string, string];
  for (const actor of Object.values(state.actors)) {
    if (actor.status !== 'candidat') continue;
    actor.status = result.qualified.includes(actor.id) ? 'qualifie' : 'elimine';
  }
  state.meta.phase = 'entre_deux_tours';

  const finalists = [first, second].map((id) => state.actors[id]!);
  const { seuilConsigne } = ruleset.modele.secondTour;
  const eliminated = Object.values(state.actors)
    .filter((a) => a.status === 'elimine')
    .sort((a, b) => compareStrings(a.id, b.id));
  for (const actor of eliminated) {
    if (actor.id === state.player.actorId) {
      state.pendingDecisions.push({
        id: `c-${week}-consigne`,
        kind: 'consigne',
        eventId: 'consigne-second-tour',
        actorId: actor.id,
        createdWeek: week,
        label: 'Consigne de vote pour le second tour',
        description: `Vous êtes éliminé(e). Appelez-vous à voter pour l'un des finalistes ? Un soutien ne transfère qu'une partie de vos électeurs.`,
        options: [
          ...finalists.map((f) => ({
            id: f.id,
            libelle: `Appeler à voter pour ${candidateName(f.candidate)}`,
            description: `${f.candidate.parti}`,
          })),
          {
            id: 'aucune',
            libelle: 'Ne donner aucune consigne',
            description: 'Laisser vos électeurs libres.',
          },
        ],
        defaultOptionId: 'aucune',
      });
      continue;
    }
    // Adversaire éliminé : soutien au finaliste le plus proche s'il l'est suffisamment.
    const nearest = [...finalists].sort(
      (a, b) =>
        distance(actor.candidate.positionnement, a.candidate.positionnement) -
          distance(actor.candidate.positionnement, b.candidate.positionnement) ||
        compareStrings(a.id, b.id),
    )[0]!;
    const close =
      distance(actor.candidate.positionnement, nearest.candidate.positionnement) <= seuilConsigne;
    state.elections.consignes.push({
      fromActorId: actor.id,
      toActorId: close ? nearest.id : null,
      automatic: true,
    });
    events.push({
      id: `consigne-${week}-${actor.id}`,
      kind: 'evenement',
      refId: 'consigne-second-tour',
      label: close
        ? `${candidateName(actor.candidate)} appelle à voter pour ${candidateName(nearest.candidate)}`
        : `${candidateName(actor.candidate)} ne donne aucune consigne de vote`,
      description:
        'Consigne de vote simulée d’un candidat éliminé : seule une partie de ses électeurs la suivra.',
      nature: 'simule',
      majeur: false,
      decisionId: null,
    });
  }
  return { phaseChange: { from, to: 'entre_deux_tours' }, events };
}

/**
 * Remboursement forfaitaire prévisionnel de chaque candidat présent au tour, d'après son score
 * au premier tour ; recalculé au second tour pour les finalistes (plafond du second tour).
 */
function updateReimbursements(state: GameState, ruleset: Ruleset, result: RoundResult) {
  const t1 = state.elections.t1;
  if (!t1) return;
  for (const actorId of Object.keys(result.voix)) {
    const actor = state.actors[actorId];
    if (!actor) continue;
    const share = t1.exprimes > 0 ? (t1.voix[actorId] ?? 0) / t1.exprimes : 0;
    const secondRound = result.round === 2;
    actor.finances.remboursementPrevisionnel = provisionalReimbursement(
      actor,
      ruleset,
      share,
      secondRound,
    );
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100 + 0; // −0 → 0
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Composantes de la prestation d'un finaliste (§8) : préparation (heures consacrées),
 * maîtrise (notoriété et équipe), cohérence (crédibilité du programme), réponse (part
 * d'aléa, d'autant plus resserrée que le candidat s'est préparé).
 */
export function debateComponents(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
  u: number,
): DebateDetail {
  const actor = state.actors[actorId]!;
  const preparation = clamp01(actor.preparationDebat / ruleset.debats.preparationMaxHeures);
  const maitrise = clamp01(0.5 * (actor.resources.notoriete / 10_000) + 0.5 * actor.equipe);
  const coherence =
    actor.programme.propositions.length === 0
      ? 0.4
      : clamp01((credibility(actor.programme, ruleset).value + 1) / 2);
  const reponse = clamp01(
    0.5 + (u - 0.5) * (1.2 - 0.6 * preparation) + (actor.style === 'offensif' ? 0.05 : 0),
  );
  return {
    preparation: round2(preparation),
    maitrise: round2(maitrise),
    coherence: round2(coherence),
    reponse: round2(reponse),
  };
}

/** Prestation (−1 à +1) à partir des composantes pondérées par le jeu de règles. */
export function debatePerformance(detail: DebateDetail, ruleset: Ruleset): number {
  const w = ruleset.debats.poids;
  const total =
    w.preparation * detail.preparation +
    w.maitrise * detail.maitrise +
    w.coherence * detail.coherence +
    w.reponse * detail.reponse;
  return round2(Math.max(-1, Math.min(1, 2 * total - 1)));
}
