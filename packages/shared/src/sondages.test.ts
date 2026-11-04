import { describe, expect, it } from 'vitest';
import { duelAverage, pollAverage, type RealPolls } from './sondages';

// Phase 24 : moyenne des sondages réels et des duels de second tour.

const polls: RealPolls = {
  verifieLe: '2026-11-04',
  source: {
    titre: 'Liste',
    revision: 1,
    url: 'https://fr.wikipedia.org/w/index.php?oldid=1',
    note: 'n',
  },
  methode: 'm',
  enquetes: [
    {
      id: 'a',
      institut: 'A',
      commanditaire: 'X',
      terrain: { debut: '2026-10-01', fin: '2026-10-02' },
      echantillon: 1000,
      hypothese: 'h',
      intentions: { 'reel-a': 4000, 'reel-b': 6000 },
      inferieursA1: [],
      source: 'https://exemple.fr/a',
    },
    {
      id: 'b',
      institut: 'B',
      commanditaire: 'Y',
      terrain: { debut: '2026-10-05', fin: '2026-10-06' },
      echantillon: 1000,
      hypothese: 'h',
      intentions: { 'reel-a': 3000, 'reel-b': 7000 },
      inferieursA1: [],
      source: 'https://exemple.fr/b',
    },
  ],
  duels: [
    {
      a: 'reel-a',
      b: 'reel-b',
      partA: 4000,
      partB: 6000,
      institut: 'A',
      terrain: { debut: '2026-10-01', fin: '2026-10-02' },
      echantillon: 1000,
      source: 'https://exemple.fr/a',
    },
    {
      a: 'reel-b',
      b: 'reel-a',
      partA: 5800,
      partB: 4200,
      institut: 'B',
      terrain: { debut: '2026-10-05', fin: '2026-10-06' },
      echantillon: 1000,
      source: 'https://exemple.fr/b',
    },
  ],
};

describe('sondages réels (phase 24)', () => {
  it('moyenne les enquêtes qui testent chaque personnalité, non testée au socle minimal, total 100 %', () => {
    const { date, cibles } = pollAverage(polls, ['reel-a', 'reel-b', 'reel-c'], 50);
    expect(date).toBe('2026-10-06');
    expect(cibles['reel-c']).toEqual({ valeur: 50, statut: 'non-testee' });
    expect(cibles['reel-a']!.statut).toBe('testee');
    // 3 500 et 6 500 avant renormalisation avec les 50 de reel-c : 10 050 → 10 000.
    expect(cibles['reel-a']!.valeur).toBe(3482);
    expect(Object.values(cibles).reduce((s, c) => s + c.valeur, 0)).toBe(10_000);
  });

  it('moyenne les duels dans les deux sens, null sans duel', () => {
    expect(duelAverage(polls, 'reel-a', 'reel-b')).toBe(4100);
    expect(duelAverage(polls, 'reel-b', 'reel-a')).toBe(5900);
    expect(duelAverage(polls, 'reel-a', 'reel-c')).toBeNull();
  });
});
