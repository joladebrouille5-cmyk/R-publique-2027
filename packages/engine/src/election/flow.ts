import {
  candidateName,
  type GamePhase,
  type GameState,
  type ReportEvent,
  type RoundResult,
  type Ruleset,
} from '@r2027/shared';
import { scrutinInWeek } from '../core/calendar';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from './model';

const nameOf = (state: GameState, id: string) => {
  const actor = state.actors[id];
  return actor ? candidateName(actor.candidate) : id;
};

/** Scrutin (et numéro de tour) qui a lieu pendant la semaine en cours de résolution. */
export function scrutinOfWeek(state: GameState, ruleset: Ruleset) {
  const scrutin = scrutinInWeek(state.meta.date, ruleset);
  if (!scrutin) return null;
  const round = ruleset.calendrier.scrutins.indexOf(scrutin) + 1;
  if (round !== 1 && round !== 2) throw new Error(`Tour de scrutin non pris en charge : ${round}`);
  return { scrutin, round: round as 1 | 2 };
}

function finalMessage(state: GameState, winnerId: string): string {
  const player = state.player.actorId;
  const winner = nameOf(state, winnerId);
  if (player === winnerId) {
    return `Vous êtes élu(e) à la présidence de la République. La formation du gouvernement, les législatives et le quinquennat arrivent en phase 6 : la partie ne peut pas encore continuer.`;
  }
  if (player) {
    return `${winner} est élu(e). Votre bilan de campagne et la poursuite de la partie (élections suivantes) arrivent en phases 6 et 7.`;
  }
  return `${winner} est élu(e). La suite de la partie (gouvernement, quinquennat) arrive en phase 6.`;
}

/**
 * Conséquences d'un tour : statuts des candidats, phase de jeu, consignes de vote des
 * éliminés (§5.3 : un soutien ne transfère pas toutes les voix), fin de la phase 3.
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

  if (result.winner) {
    for (const actor of Object.values(state.actors)) {
      if (actor.status === 'candidat' || actor.status === 'qualifie') {
        actor.status = actor.id === result.winner ? 'elu' : 'battu';
      }
    }
    state.meta.phase = state.player.actorId === result.winner ? 'presidence' : 'bilan';
    state.pendingDecisions = state.pendingDecisions.filter((d) => d.kind !== 'consigne');
    state.calendar = {
      blockedBy: 'fin-de-la-presidentielle',
      blockedMessage: finalMessage(state, result.winner),
    };
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

/** Débat d'entre-deux-tours : prestation simulée de chaque finaliste, de −1 à +1 (§5.3). */
export function holdDebate(state: GameState): ReportEvent | null {
  if (state.meta.phase !== 'entre_deux_tours' || state.elections.debate) return null;
  const finalists = Object.values(state.actors)
    .filter((a) => a.status === 'qualifie')
    .sort((a, b) => compareStrings(a.id, b.id));
  if (finalists.length !== 2) return null;
  const debate: Record<string, number> = {};
  for (const finalist of finalists) {
    const rng = stream(state.meta.seed, state.meta.week, 'debat', finalist.id);
    const raw = rng.nextFloat() * 2 - 1 + (finalist.resources.popularite - 3000) / 10_000;
    debate[finalist.id] = Math.round(Math.max(-1, Math.min(1, raw)) * 100) / 100 + 0; // −0 → 0
  }
  state.elections.debate = debate;
  const [a, b] = finalists as [(typeof finalists)[0], (typeof finalists)[0]];
  const leader = debate[a.id]! >= debate[b.id]! ? a : b;
  return {
    id: `debat-${state.meta.week}`,
    kind: 'evenement',
    refId: 'debat-entre-deux-tours',
    label: `Débat d’entre-deux-tours : ${candidateName(leader.candidate)} jugé(e) plus convaincant(e)`,
    description: `Prestations simulées : ${finalists
      .map(
        (f) =>
          `${candidateName(f.candidate)} ${debate[f.id]! >= 0 ? '+' : ''}${debate[f.id]!.toFixed(2).replace('.', ',')}`,
      )
      .join(' ; ')} (échelle de −1 à +1). La préparation des débats sera modélisée en phase 5.`,
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}
