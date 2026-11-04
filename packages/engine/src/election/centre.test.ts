import { describe, expect, it } from 'vitest';
import { newGame, RULESET } from '../core/testing';
import { distribute } from './distribution';
import { utilityFactors, type Contender } from './model';

// Avantage structurel du centre (phase 24) : pistes générales derrière un paramètre ; à leur
// valeur neutre, le comportement est celui d'avant la phase.

const group = RULESET.electorat.groupes[0]!;
const contender = (economie: number, societe: number): Contender => ({
  id: `c-${economie}-${societe}`,
  position: { economie, societe },
  notoriete: 5000,
  popularite: 3000,
  dynamique: 0,
});
const proximity = (model: typeof RULESET.modele, c: Contender) =>
  utilityFactors(group, c, model, 0).find((f) => f.label === 'Proximité idéologique')!.value;

describe('saturation de la proximité', () => {
  it('à 3, la pénalité reste proportionnelle à la distance (comportement inchangé)', () => {
    const model = { ...RULESET.modele, saturationProximite: 3 };
    const far = contender(90, 90);
    const d = Math.hypot(90 - group.position.economie, 90 - group.position.societe) / 100;
    expect(proximity(model, far)).toBeCloseTo(-model.proximite * d, 10);
  });

  it('au-delà du seuil, deux candidats éloignés sont pénalisés de la même façon', () => {
    const model = { ...RULESET.modele, saturationProximite: 0.6 };
    expect(proximity(model, contender(90, 90))).toBeCloseTo(-model.proximite * 0.6, 10);
    expect(proximity(model, contender(60, 90))).toBeCloseTo(-model.proximite * 0.6, 10);
  });
});

describe('fidélité de camp', () => {
  const labels = (ruleset: typeof RULESET, round: 1 | 2) =>
    distribute(newGame(), ruleset, round, 'opinion').map((d) =>
      d.factors.map((f) => f.some((x) => x.label === 'Fidélité de camp')),
    );

  it('à 0, aucun facteur n’est ajouté', () => {
    expect(RULESET.modele.fideliteCamp).toBe(0);
    expect(labels(RULESET, 1).flat().some(Boolean)).toBe(false);
  });

  it('au premier tour, seul le candidat le plus proche de chaque groupe la reçoit', () => {
    const ruleset = { ...RULESET, modele: { ...RULESET.modele, fideliteCamp: 0.5 } };
    for (const perGroup of labels(ruleset, 1)) expect(perGroup.filter(Boolean)).toHaveLength(1);
  });
});
