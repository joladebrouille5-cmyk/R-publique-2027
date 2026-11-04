import {
  departmentInscrits,
  implantationTier,
  militantsByDepartment,
  startingImplantation,
  weekCombos,
  weightedImplantation,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { createGame, PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, RULESET as ruleset } from '../core/testing';
import { validateActions } from './actions';

// Implantation par département (phase 25) : règles partagées par le moteur et l'interface.

const departements = ruleset.parrainages.reservoir.departements;
const codes = Object.keys(departements).sort();

describe('paliers d’implantation', () => {
  it('nomme cinq paliers aux bornes du jeu de règles', () => {
    const tier = (v: number) => implantationTier(v).id;
    expect([0, 4].map(tier)).toEqual(['inconnue', 'inconnue']);
    expect([5, 24].map(tier)).toEqual(['presence', 'presence']);
    expect([25, 49].map(tier)).toEqual(['ancrage', 'ancrage']);
    expect([50, 74].map(tier)).toEqual(['bastion', 'bastion']);
    expect([75, 100].map(tier)).toEqual(['fief', 'fief']);
    expect(implantationTier(80).libelle).toBe('Fief');
    expect(implantationTier(0).libelle).toBe('Terre inconnue');
  });
});

describe('inscrits par département', () => {
  it('couvre les 101 départements, d’après les législatives de 2024', () => {
    const inscrits = departmentInscrits(ruleset);
    expect(Object.keys(inscrits).sort()).toEqual(codes);
    const expected = ruleset.legislatives2024.circonscriptions
      .filter((c) => c.departement in departements)
      .reduce((s, c) => s + c.inscrits, 0);
    expect(Object.values(inscrits).reduce((a, b) => a + b, 0)).toBe(expected);
    expect(inscrits['2A']).toBeGreaterThan(0);
    expect(inscrits['971']).toBeGreaterThan(0);
  });
});

describe('implantation de départ', () => {
  const regionsOf = (regions: readonly string[]) =>
    codes.filter((c) => regions.includes(departements[c]!.region));

  it('carte blanche pour le candidat personnalisé', () => {
    const map = startingImplantation(
      { candidate: { nature: 'personnalise' }, implantation: ['84'] },
      ruleset,
    );
    expect(Object.keys(map).sort()).toEqual(codes);
    expect(Object.values(map).every((v) => v === 0)).toBe(true);
  });

  it('30 dans les départements des régions d’implantation d’un fictif ou d’un réel', () => {
    for (const nature of ['fictif', 'reel'] as const) {
      const map = startingImplantation(
        { candidate: { nature }, implantation: ['84', '11'] },
        ruleset,
      );
      const inRegions = regionsOf(['84', '11']);
      for (const code of codes)
        expect(map[code]).toBe(inRegions.includes(code) ? ruleset.implantation.depart : 0);
    }
    expect(ruleset.implantation.depart).toBe(30);
  });
});

describe('partie neuve (format 25)', () => {
  it('donne à chaque candidat son implantation de départ : 0 pour le personnalisé', () => {
    const state = newGame();
    expect(Object.keys(state.implantation).sort()).toEqual(Object.keys(state.actors).sort());
    expect(Object.values(state.implantation[PLAYER_ACTOR_ID]!).every((v) => v === 0)).toBe(true);
    for (const actor of Object.values(state.actors))
      expect(state.implantation[actor.id]).toEqual(startingImplantation(actor, ruleset));
    expect(state.implantation['adv-aurore']!['75']).toBe(30);
    expect(state.opinion).toBeNull();
  });

  it('une personnalité réelle part de 30 dans ses régions, codes en chaînes (2A, 971)', () => {
    const state = createGame(
      {
        seed: 'implantation-reel',
        mode: 'candidat_reel',
        difficulty: 'standard',
        personnaliteId: 'reel-philippe',
        adversaires: 'reels',
      },
      ruleset,
    );
    const player = state.actors[PLAYER_ACTOR_ID]!;
    expect(player.candidate.nature).toBe('reel');
    const map = state.implantation[PLAYER_ACTOR_ID]!;
    expect(Object.keys(map)).toContain('2A');
    expect(Object.keys(map)).toContain('971');
    for (const code of codes)
      expect(map[code]).toBe(player.implantation.includes(departements[code]!.region) ? 30 : 0);
    expect(Object.values(map).some((v) => v === 30)).toBe(true);
  });
});

describe('moyenne pondérée et militants par département', () => {
  const inscrits = departmentInscrits(ruleset);

  it('pondère l’implantation par les inscrits', () => {
    const uniform = Object.fromEntries(codes.map((c) => [c, 40]));
    expect(weightedImplantation(uniform, inscrits)).toBeCloseTo(40, 10);
    const onlyParis = Object.fromEntries(codes.map((c) => [c, c === '75' ? 100 : 0]));
    const total = Object.values(inscrits).reduce((a, b) => a + b, 0);
    expect(weightedImplantation(onlyParis, inscrits)).toBeCloseTo((100 * inscrits['75']!) / total);
  });

  it('répartit exactement le total, au prorata des inscrits sans implantation', () => {
    const none = Object.fromEntries(codes.map((c) => [c, 0]));
    const spread = militantsByDepartment(1000, none, inscrits);
    expect(Object.values(spread).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(spread['59']!).toBeGreaterThan(spread['48']!);
    const fief = Object.fromEntries(codes.map((c) => [c, c === '48' ? 100 : 0]));
    const concentrated = militantsByDepartment(1000, fief, inscrits);
    expect(concentrated['48']).toBe(1000);
  });
});

describe('combos de la semaine', () => {
  it('série : +25 % pour la 2ᵉ carte d’une famille, +50 % ensuite, plafonné', () => {
    const plan = [
      { actionId: 'meeting', cible: '01' },
      { actionId: 'interview', cible: 'france-inter' },
      { actionId: 'tournee', cible: '69' },
      { actionId: 'porte-a-porte', cible: '38' },
      { actionId: 'recrutement', cible: '42' },
    ];
    const { series } = weekCombos(plan, ruleset);
    expect(series).toEqual([
      { index: 2, famille: 'terrain', rang: 2, taux: 0.25 },
      { index: 3, famille: 'terrain', rang: 3, taux: 0.5 },
      { index: 4, famille: 'terrain', rang: 4, taux: 0.5 },
    ]);
  });

  it('huit cartes au même endroit : un seul bastion, série plafonnée', () => {
    const plan = Array.from({ length: 8 }, () => ({ actionId: 'porte-a-porte', cible: '29' }));
    const combos = weekCombos(plan, ruleset);
    expect(combos.bastions).toEqual(['29']);
    expect(Math.max(...combos.series.map((s) => s.taux))).toBe(0.5);
    expect(combos.toursDeRegion).toEqual([]);
  });

  it('tour de région : trois départements distincts d’une même région', () => {
    const plan = ['29', '22', '56'].map((cible) => ({ actionId: 'porte-a-porte', cible }));
    expect(weekCombos(plan, ruleset).toursDeRegion).toEqual(['53']);
    const two = ['29', '22', '22'].map((cible) => ({ actionId: 'porte-a-porte', cible }));
    expect(weekCombos(two, ruleset).toursDeRegion).toEqual([]);
  });

  it('une carte Terrain sans département n’entre dans aucun combo de lieu', () => {
    const plan = [{ actionId: 'meeting' }, { actionId: 'meeting' }];
    const combos = weekCombos(plan, ruleset);
    expect(combos.bastions).toEqual([]);
    expect(combos.series).toEqual([{ index: 1, famille: 'terrain', rang: 2, taux: 0.25 }]);
  });
});

describe('cible facultative des cartes Terrain (Review Focus 2)', () => {
  const state = newGame();
  const statuses = (plan: { actionId: string; cible?: string }[]) =>
    validateActions(state, PLAYER_ACTOR_ID, plan, ruleset).outcomes.map((o) => [
      o.status,
      o.reason,
    ]);

  it('accepte un meeting sans département, ou dans un département connu', () => {
    expect(statuses([{ actionId: 'meeting' }, { actionId: 'tournee', cible: '2A' }])).toEqual([
      ['validee', null],
      ['validee', null],
    ]);
  });

  it('refuse un département inconnu ; la rencontre d’élus exige toujours son département', () => {
    expect(statuses([{ actionId: 'meeting', cible: '99' }])).toEqual([
      ['rejetee', 'Cible inconnue : 99.'],
    ]);
    expect(statuses([{ actionId: 'elus-locaux' }])).toEqual([
      ['rejetee', 'Choisissez le département de la rencontre.'],
    ]);
  });
});
