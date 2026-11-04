import { describe, expect, it } from 'vitest';
import { advanceWeek } from './advanceWeek';
import { effectFactors } from './effects';
import { planned, RULESET as ruleset, newGame } from './testing';

// Rattrapage de notoriété (phase 24) : un gain de notoriété d'une action est augmenté tant que
// le candidat est peu connu ; même règle pour tous les candidats.

const catchUp = ruleset.rattrapageNotoriete;
const gain = { ressource: 'notoriete' as const, base: 100, alea: 0, saturation: true };
const sum = (factors: { value: number }[]) => factors.reduce((a, f) => a + f.value, 0);

describe('rattrapage de notoriété', () => {
  it('lit ses paramètres (hypothèses) dans le jeu de règles', () => {
    expect(catchUp).toMatchObject({ statut: 'hypothese', seuil: 3000, coefficient: 2 });
  });

  it('augmente le gain sous le seuil, proportionnellement à l’écart', () => {
    const factors = effectFactors(gain, 600, 'Meeting', 'action', 3, 'aléa', catchUp);
    const bonus = factors.find((f) => f.label.includes('rattrapage de notoriété'))!;
    expect(bonus.value).toBe(Math.round((100 * 2 * (3000 - 600)) / 3000));
    // La somme des facteurs est exactement la variation appliquée : attendu, saturation, rattrapage.
    expect(sum(factors)).toBe(100 - Math.round((100 * 600) / 10_000) + bonus.value);
  });

  it('ne joue ni au-dessus du seuil, ni sur une perte, ni sans paramètre', () => {
    const labels = (f: { label: string }[]) => f.map((x) => x.label).join(' ');
    expect(
      labels(effectFactors(gain, 3000, 'Meeting', 'action', 3, 'aléa', catchUp)),
    ).not.toContain('rattrapage');
    expect(
      labels(effectFactors({ ...gain, base: -50 }, 600, 'Risque', 'action', 3, 'aléa', catchUp)),
    ).not.toContain('rattrapage');
    expect(
      labels(
        effectFactors(
          { ...gain, ressource: 'popularite' },
          600,
          'Meeting',
          'action',
          3,
          'aléa',
          catchUp,
        ),
      ),
    ).not.toContain('rattrapage');
    expect(labels(effectFactors(gain, 600, 'Meeting', 'action', 3))).not.toContain('rattrapage');
  });

  it('s’applique aux actions de la semaine, inscrit au registre', () => {
    const state = newGame({ seed: 'rattrapage-1' });
    const before = state.actors.joueur!.resources.notoriete;
    expect(before).toBeLessThan(catchUp.seuil);
    const { state: next, report } = advanceWeek(
      state,
      { actions: [planned('meeting')], decisions: [] },
      { ruleset },
    );
    const change = report.changes.find(
      (c) => c.actorId === 'joueur' && c.ressource === 'notoriete',
    )!;
    expect(change.factors.some((f) => f.label.includes('rattrapage de notoriété'))).toBe(true);
    expect(change.after - change.before).toBe(sum(change.factors));
    expect(next.actors.joueur!.resources.notoriete).toBeGreaterThan(before);
  });
});
