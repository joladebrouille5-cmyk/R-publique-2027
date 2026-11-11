import { SCENE_LIGHTINGS, SCENE_MATERIALS } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { authorsText, sizeMeters } from './build';
import { SCENE_PLATES } from '@r2027/shared';
import { LIGHTING_SELECTION, MATERIAL_SELECTION, PLATE_SELECTION } from './selection';

describe('import des actifs des scènes 3D', () => {
  it('choisit un actif par matière et par éclairage, sans doublon', () => {
    expect(MATERIAL_SELECTION.map((m) => m.id).sort()).toEqual([...SCENE_MATERIALS].sort());
    expect(LIGHTING_SELECTION.map((l) => l.id).sort()).toEqual([...SCENE_LIGHTINGS].sort());
    const actifs = [...MATERIAL_SELECTION, ...LIGHTING_SELECTION].map((s) => s.actif);
    expect(new Set(actifs).size).toBe(actifs.length);
  });

  it('repère chaque plan photographique : pied de la façade sous l’horizon, drapeaux dans l’image', () => {
    expect(PLATE_SELECTION.map((p) => p.id).sort()).toEqual([...SCENE_PLATES].sort());
    for (const plan of PLATE_SELECTION) {
      expect(plan.repere.pied).toBeGreaterThan(plan.repere.horizon);
      expect(plan.repere.oeilM).toBeGreaterThan(1);
      for (const d of plan.drapeaux) {
        expect(d.x + d.largeur).toBeLessThanOrEqual(1);
        expect(d.y + d.hauteur).toBeLessThanOrEqual(1);
      }
    }
  });

  it('crédite les auteurs dans un ordre stable et refuse un actif sans auteur', () => {
    expect(authorsText({ 'Rob Tuytel': 'All', 'Dimitrios Savva': 'Photography' })).toBe(
      'Dimitrios Savva, Rob Tuytel',
    );
    expect(() => authorsText({})).toThrow();
  });

  it('lit les dimensions d’une fiche', () => {
    expect(sizeMeters([1830.0000429153442, 1830])).toBe(1.83);
    expect(() => sizeMeters(undefined)).toThrow();
  });
});
