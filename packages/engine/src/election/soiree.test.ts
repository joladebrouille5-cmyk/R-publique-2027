import {
  avancement,
  communeDepouillee,
  heureSoiree,
  rythmeDepartements,
  SOIREE_DERNIERE,
  SOIREE_MINUTES,
  SOIREE_PAS,
  SOIREE_TRANCHES,
  soireeElectorale,
  soireeInstant,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { newGame, RULESET } from '../core/testing';
import { demoBaseline } from '../territory/baseline';
import { resolveRound } from './rounds';

// Soirée électorale (phases 9 et 11) : restitution minute par minute d'un tour dépouillé par le
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
      expect(r.fin).toBeLessThanOrEqual(SOIREE_MINUTES);
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
    const rythme = { debut: 60, fin: 150 };
    expect(avancement(rythme, 30)).toBe(0);
    expect(avancement(rythme, 105)).toBeCloseTo(0.5);
    expect(avancement(rythme, 150)).toBe(1);
    expect(avancement(undefined, SOIREE_MINUTES - 1)).toBe(0);
    expect(avancement(undefined, SOIREE_MINUTES)).toBe(1);
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

  it('avance minute par minute sans jamais reculer, et ne dépend que de l’heure', () => {
    const rythme = rythmeDepartements(result, 'graine-test');
    let previous = soireeInstant(result, 'graine-test', 0, rythme);
    for (let minute = 1; minute <= SOIREE_MINUTES; minute++) {
      const now = soireeInstant(result, 'graine-test', minute, rythme);
      expect(now.depouille.inscrits).toBeGreaterThanOrEqual(previous.depouille.inscrits);
      for (const [k, v] of Object.entries(now.depouille.voix))
        expect(v).toBeGreaterThanOrEqual(previous.depouille.voix[k] ?? 0);
      expect(now.departementsTermines).toBeGreaterThanOrEqual(previous.departementsTermines);
      previous = now;
    }
    expect(previous.depouille).toEqual(result);
    // Même minute ⇒ même état, quelle que soit la façon d'y arriver (vitesse de lecture) ;
    // une minute fractionnaire compte pour la minute entamée.
    expect(soireeInstant(result, 'graine-test', 77.9)).toEqual(
      soireeInstant(result, 'graine-test', 77),
    );
    // Les points par demi-heure sont les états à leur minute.
    for (const t of soiree) {
      const { nouveaux: _, ...point } = t;
      expect(point).toEqual(soireeInstant(result, 'graine-test', t.tranche * SOIREE_PAS));
    }
    // Les fins de dépouillement s'étalent dans la soirée (pas seulement aux demi-heures).
    const fins = Object.values(rythme).map((r) => r.fin);
    expect(fins.some((f) => f % SOIREE_PAS !== 0)).toBe(true);
  });

  it('affiche l’heure à la minute, de 20 h 00 à 0 h 00', () => {
    expect(heureSoiree(0)).toBe('20 h 00');
    expect(heureSoiree(37.6)).toBe('20 h 37');
    expect(heureSoiree(61)).toBe('21 h 01');
    expect(heureSoiree(SOIREE_MINUTES)).toBe('0 h 00');
    expect(heureSoiree(SOIREE_MINUTES + 10)).toBe('0 h 00');
  });
});
