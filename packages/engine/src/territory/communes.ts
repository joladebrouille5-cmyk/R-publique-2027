import type { RoundResult, Ruleset } from '@r2027/shared';
import type { VoteCounts } from './aggregate';
import type { TerritorialBaseline } from './baseline';
import { tallyUnit } from './tally';

export class BaselineMismatchError extends Error {
  override name = 'BaselineMismatchError';
}

/**
 * Résultats des communes d'un département pour un tour déjà dépouillé, recalculés à l'identique
 * à partir du comportement des groupes enregistré dans le résultat. Refuse une autre base
 * électorale que celle du dépouillement (les résultats ne seraient plus ceux de la partie).
 */
export function communeResults(
  result: RoundResult,
  baseline: TerritorialBaseline,
  ruleset: Ruleset,
  departement: string,
): Map<string, VoteCounts> {
  const territoire = result.territoire;
  if (!territoire)
    throw new BaselineMismatchError(
      'Ce tour a été dépouillé sans géographie (ancienne sauvegarde).',
    );
  if (territoire.baselineId !== baseline.id) {
    throw new BaselineMismatchError(
      `Base électorale différente de celle du dépouillement (${territoire.baselineId} ≠ ${baseline.id}).`,
    );
  }
  const results = new Map<string, VoteCounts>();
  for (const unit of baseline.units) {
    if (unit.niveau !== 'commune' || unit.departement !== departement) continue;
    results.set(
      unit.code,
      tallyUnit(unit, ruleset, territoire.candidats, territoire.comportement).total,
    );
  }
  return results;
}
