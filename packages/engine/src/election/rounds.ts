import type { GameState, GroupBehavior, RoundResult, Ruleset } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import type { TerritorialBaseline } from '../territory/baseline';
import { tallyBaseline } from '../territory/tally';
import { distribute, type Round } from './distribution';
import { implantationMultipliers } from './implantation';

/**
 * Dépouillement simulé d'un tour (§5.1, §3.3) : le comportement de chaque groupe d'électeurs
 * (participation, blancs, nuls, probabilités de vote) est calculé une fois, puis appliqué à
 * chaque unité de la base territoriale (commune ou territoire hors carte) en nombres entiers.
 * Départements, régions et national sont des sommes exactes. Le résultat ne dépend pas de la
 * difficulté.
 */
export function resolveRound(
  state: GameState,
  ruleset: Ruleset,
  scrutin: { id: string; date: string },
  round: Round,
  baseline: TerritorialBaseline,
): RoundResult {
  const distributions = distribute(state, ruleset, round, 'scrutin');
  if (distributions.length === 0) throw new Error('Aucun candidat en lice');
  const candidats = distributions[0]!.contenders.map((c) => c.id);
  const comportement: GroupBehavior[] = distributions.map((d) => ({
    groupId: d.group.id,
    turnout: d.turnout,
    blancs: d.blancs,
    nuls: d.nuls,
    probabilities: d.probabilities,
  }));
  // Phase 25 : l'implantation déplace le score d'un département à l'autre (multiplicateur
  // enregistré avec le résultat, pour recalculer le détail communal à l'identique).
  const multipliers = implantationMultipliers(state, ruleset, candidats, baseline);
  const tally = tallyBaseline(baseline, ruleset, candidats, comportement, multipliers);
  const { national } = tally;
  const { voix, exprimes } = national;

  // Classement : voix décroissantes ; égalité parfaite départagée par l'identifiant (déterministe).
  const ranking = [...candidats].sort((a, b) => voix[b]! - voix[a]! || compareStrings(a, b));
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
    groups: distributions.map((d, g) => ({ groupId: d.group.id, ...tally.groups[g]! })),
    qualified,
    winner,
    nature: 'simule',
    territoire: {
      baselineId: baseline.id,
      nature: baseline.nature,
      candidats,
      comportement,
      ...(Object.keys(multipliers).length > 0 ? { implantation: multipliers } : {}),
      departements: tally.departements,
      regions: tally.regions,
      horsCarte: tally.horsCarte,
    },
  };
}
