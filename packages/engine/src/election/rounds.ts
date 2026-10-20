import type { GameState, RoundResult, Ruleset } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { aggregateCounts } from '../territory/aggregate';
import { largestRemainder } from './apportion';
import { distribute, type Round } from './distribution';

/**
 * Dépouillement simulé d'un tour (§5.1) : pour chaque groupe, votants, blancs, nuls et
 * exprimés en nombres entiers, puis voix réparties au plus fort reste. Les totaux nationaux
 * sont la somme exacte des groupes (§3.3). Le résultat ne dépend pas de la difficulté.
 */
export function resolveRound(
  state: GameState,
  ruleset: Ruleset,
  scrutin: { id: string; date: string },
  round: Round,
): RoundResult {
  const distributions = distribute(state, ruleset, round, 'scrutin');
  if (distributions.length === 0) throw new Error('Aucun candidat en lice');
  const contenders = distributions[0]!.contenders;

  const groups = distributions.map((d) => {
    const votants = Math.round(d.inscrits * d.turnout);
    const blancs = Math.round(votants * d.blancs);
    const nuls = Math.round(votants * d.nuls);
    const exprimes = votants - blancs - nuls;
    const counts = largestRemainder(exprimes, d.probabilities);
    const voix: Record<string, number> = {};
    contenders.forEach((c, i) => (voix[c.id] = counts[i]!));
    return { groupId: d.group.id, inscrits: d.inscrits, votants, blancs, nuls, exprimes, voix };
  });

  // National = somme exacte des groupes.
  const national = aggregateCounts(groups);
  const { voix, exprimes } = national;
  // Classement : voix décroissantes ; égalité parfaite départagée par l'identifiant (déterministe).
  const ranking = contenders
    .map((c) => c.id)
    .sort((a, b) => voix[b]! - voix[a]! || compareStrings(a, b));
  let qualified: string[];
  let winner: string | null;
  if (round === 1) {
    // Majorité absolue des suffrages exprimés : élu dès le premier tour ; sinon les deux premiers.
    winner = voix[ranking[0]!]! * 2 > exprimes ? ranking[0]! : null;
    qualified = winner ? [winner] : ranking.slice(0, 2);
  } else {
    winner = ranking[0]!;
    qualified = ranking.slice(0, 2);
  }

  return {
    scrutinId: scrutin.id,
    round,
    date: scrutin.date,
    inscrits: national.inscrits,
    votants: national.votants,
    abstentions: national.inscrits - national.votants,
    blancs: national.blancs,
    nuls: national.nuls,
    exprimes,
    voix,
    groups,
    qualified,
    winner,
    nature: 'simule',
  };
}
