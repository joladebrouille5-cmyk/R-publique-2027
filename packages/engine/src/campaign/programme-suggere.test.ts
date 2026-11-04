import { suggestedProgramme } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { RULESET as ruleset } from '../core/testing';
import { validateProgrammeChange } from './programme';

// Programme de départ suggéré (phase 24) : règle partagée par le moteur et l'interface.

const { minimumRecommande, propositions } = ruleset.programme;
const byId = new Map(propositions.map((p) => [p.id, p]));
const centre = { economie: 0, societe: 0 };

describe('programme de départ suggéré', () => {
  it('complète un programme vide jusqu’au minimum, une proposition par domaine d’abord', () => {
    const suggestion = suggestedProgramme(centre, [], ruleset);
    expect(minimumRecommande).toBe(8);
    expect(suggestion).toHaveLength(minimumRecommande);
    expect(new Set(suggestion).size).toBe(suggestion.length);
    const domains = suggestion.map((id) => byId.get(id)!.domaine);
    expect(new Set(domains).size).toBe(domains.length);
    // Déterministe.
    expect(suggestedProgramme(centre, [], ruleset)).toEqual(suggestion);
  });

  it('ne propose que des propositions absentes, sans dépasser le minimum', () => {
    const current = suggestedProgramme({ economie: 60, societe: 40 }, [], ruleset).slice(0, 5);
    const suggestion = suggestedProgramme({ economie: 60, societe: 40 }, current, ruleset);
    expect(suggestion).toHaveLength(minimumRecommande - current.length);
    for (const id of suggestion) expect(current).not.toContain(id);
    expect(suggestedProgramme(centre, [...current, ...suggestion], ruleset)).toEqual([]);
  });

  it('respecte dépendances et incompatibilités : le flux normal du programme l’accepte', () => {
    for (const position of [
      { economie: -80, societe: -60 },
      { economie: 80, societe: 70 },
      centre,
    ]) {
      const suggestion = suggestedProgramme(position, [], ruleset);
      const result = validateProgrammeChange(
        { propositions: [], revirements: 0 },
        { ajouter: suggestion, retirer: [] },
        ruleset,
        1_000,
      );
      expect(result.refused).toEqual([]);
      expect(result.added).toEqual(suggestion);
    }
  });
});
