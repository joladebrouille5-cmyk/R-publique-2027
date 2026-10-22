import {
  avancement,
  communeDepouillee,
  rythmeDepartements,
  SOIREE_DERNIERE,
  SOIREE_TRANCHES,
  soireeElectorale,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { newGame, RULESET } from '../core/testing';
import { demoBaseline } from '../territory/baseline';
import { resolveRound } from './rounds';

// Soirée électorale (phase 9) : restitution par tranches horaires d'un tour dépouillé par le
// moteur, sur une base de démonstration (communes de Corse et de la Somme, départements entiers).

const BASE = demoBaseline(
  RULESET,
  [
    { code: '2A004', departement: '2A', region: '94', population: 75_000 },
    { code: '2A006', departement: '2A', region: '94', population: 3_000 },
    { code: '80021', departement: '80', region: '32', population: 133_000 },
    { code: '80001', departement: '80', region: '32', population: 600 },
  ],
  [
    { code: '75', region: '11', population: 2_100_000 },
    { code: '13', region: '93', population: 2_000_000 },
    { code: '48', region: '76', population: 76_000 },
    { code: '23', region: '75', population: 115_000 },
    { code: '59', region: '32', population: 2_600_000 },
    { code: '974', region: '04', population: 880_000 },
  ],
);
const result = resolveRound(newGame(), RULESET, RULESET.calendrier.scrutins[0]!, 1, BASE);
const soiree = soireeElectorale(result, 'graine-test');

describe('soirée électorale', () => {
  it('compte une tranche par horaire, de 20 h à minuit, et finit sur le résultat définitif', () => {
    expect(soiree.map((t) => t.heure)).toEqual([...SOIREE_TRANCHES]);
    const last = soiree[SOIREE_DERNIERE]!;
    expect(last.depouille.voix).toEqual(result.voix);
    expect(last.depouille.exprimes).toBe(result.exprimes);
    expect(last.partInscrits).toBe(1);
    expect(last.departementsTermines).toBe(last.departements);
    for (const [k, v] of Object.entries(last.estimation))
      expect(v).toBeCloseTo(result.voix[k]! / result.exprimes, 12);
  });

  it('progresse sans jamais reculer, en fractions exactes du résultat final', () => {
    for (let i = 1; i < soiree.length; i++) {
      expect(soiree[i]!.partInscrits).toBeGreaterThanOrEqual(soiree[i - 1]!.partInscrits);
      expect(soiree[i]!.departementsTermines).toBeGreaterThanOrEqual(
        soiree[i - 1]!.departementsTermines,
      );
      for (const [k, v] of Object.entries(soiree[i]!.depouille.voix))
        expect(v).toBeGreaterThanOrEqual(soiree[i - 1]!.depouille.voix[k] ?? 0);
    }
    for (const t of soiree)
      for (const [k, v] of Object.entries(t.depouille.voix))
        expect(v).toBeLessThanOrEqual(result.voix[k]!);
    // Rien n'est encore dépouillé partout à 20 h ; chaque département se termine une seule fois.
    expect(soiree[0]!.partInscrits).toBeLessThan(1);
    const finished = soiree.flatMap((t) => t.nouveaux);
    expect(new Set(finished).size).toBe(finished.length);
  });

  it('annonce l’outre-mer dès 20 h et les grands départements plus tard', () => {
    const rythme = rythmeDepartements(result, 'graine-test');
    expect(rythme['974']).toEqual({ debut: 0, fin: 0 });
    expect(soiree[0]!.nouveaux).toContain('974');
    expect(rythme['48']!.fin).toBeLessThanOrEqual(rythme['59']!.fin);
    for (const r of Object.values(rythme)) {
      expect(r.debut).toBeLessThanOrEqual(r.fin);
      expect(r.fin).toBeLessThanOrEqual(SOIREE_DERNIERE);
    }
  });

  it('resserre l’estimation simulée vers le résultat à mesure de la soirée', () => {
    const gap = (i: number) =>
      Math.max(
        ...Object.entries(soiree[i]!.estimation).map(([k, v]) =>
          Math.abs(v - result.voix[k]! / result.exprimes),
        ),
      );
    expect(gap(0)).toBeLessThanOrEqual(0.03);
    expect(gap(SOIREE_DERNIERE - 1)).toBeLessThanOrEqual(gap(0) + 1e-9);
    for (const t of soiree)
      expect(Object.values(t.estimation).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
  });

  it('est déterministe et dépend de la graine', () => {
    expect(soireeElectorale(result, 'graine-test')).toEqual(soiree);
    const other = rythmeDepartements(result, 'autre-graine');
    expect(other).not.toEqual(rythmeDepartements(result, 'graine-test'));
  });

  it('dépouille les communes au fil de l’avancement de leur département', () => {
    const rythme = { debut: 2, fin: 5 };
    expect(avancement(rythme, 1)).toBe(0);
    expect(avancement(rythme, 3)).toBeCloseTo(0.5);
    expect(avancement(rythme, 5)).toBe(1);
    expect(avancement(undefined, SOIREE_DERNIERE)).toBe(1);
    const codes = Array.from({ length: 200 }, (_, i) => `80${String(i).padStart(3, '0')}`);
    const counted = (part: number) =>
      codes.filter((c) => communeDepouillee('graine-test', 1, c, part)).length;
    expect(counted(0)).toBe(0);
    expect(counted(0.5)).toBeGreaterThan(60);
    expect(counted(0.5)).toBeLessThan(140);
    expect(counted(1)).toBe(200);
    // Une commune dépouillée le reste ensuite.
    for (const c of codes)
      if (communeDepouillee('graine-test', 1, c, 0.3))
        expect(communeDepouillee('graine-test', 1, c, 0.6)).toBe(true);
  });
});
