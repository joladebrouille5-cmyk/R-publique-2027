import { WeeklyReportSchema, type GameState, type PlannedAction } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { advance, newGame, planned, playerChange, QUIET } from '../core/testing';
import { applyWeekImplantation } from './implantation';

// Implantation de la semaine (phase 25) : gains des cartes Terrain, combos de lieu, érosion,
// plafond, registre des variations ; bonus de série dans le registre des ressources.

const ruleset = QUIET;
const departements = ruleset.parrainages.reservoir.departements;
const inRegion = (region: string) =>
  Object.keys(departements)
    .filter((code) => departements[code]!.region === region)
    .sort();
const sum = (factors: readonly { value: number }[]) => factors.reduce((s, f) => s + f.value, 0);

/** Semaine d'implantation d'un acteur : toutes ses cartes acceptées, sauf mention. */
function week(state: GameState, plan: string[], actorId = PLAYER_ACTOR_ID, accepted?: number[]) {
  const cards: PlannedAction[] = plan.map(planned);
  return applyWeekImplantation(
    state,
    ruleset,
    { [actorId]: cards },
    { [actorId]: accepted ?? cards.map((_, i) => i) },
  );
}

const changeOf = (
  result: ReturnType<typeof applyWeekImplantation>,
  departement: string,
  actorId = PLAYER_ACTOR_ID,
) => result.changes.find((c) => c.actorId === actorId && c.departement === departement);

const playerChanges = (result: ReturnType<typeof applyWeekImplantation>) =>
  result.changes.filter((c) => c.actorId === PLAYER_ACTOR_ID);

describe('gains des cartes Terrain', () => {
  it('fait gagner à chaque carte son gain au département visé, au libellé de la carte', () => {
    const state = newGame();
    const result = week(state, [
      'porte-a-porte@29',
      'elus-locaux@13',
      'recrutement@59',
      'meeting@69',
    ]);
    expect(playerChanges(result)).toEqual([
      {
        actorId: PLAYER_ACTOR_ID,
        departement: '13',
        before: 0,
        after: 10,
        factors: [{ label: 'Rencontre avec des élus locaux', value: 10 }],
      },
      {
        actorId: PLAYER_ACTOR_ID,
        departement: '29',
        before: 0,
        after: 8,
        factors: [{ label: 'Porte-à-porte', value: 8 }],
      },
      {
        actorId: PLAYER_ACTOR_ID,
        departement: '59',
        before: 0,
        after: 6,
        factors: [{ label: 'Opération de recrutement de militants', value: 6 }],
      },
      {
        actorId: PLAYER_ACTOR_ID,
        departement: '69',
        before: 0,
        after: 12,
        factors: [{ label: 'Meeting public', value: 12 }],
      },
    ]);
    expect(state.implantation[PLAYER_ACTOR_ID]!['69']).toBe(12);
    expect(state.implantation[PLAYER_ACTOR_ID]!['01']).toBe(0);
  });

  it('grand meeting : +20 au département, +5 aux autres départements de sa région', () => {
    const state = newGame();
    const result = week(state, ['grand-meeting@35']);
    for (const code of inRegion('53')) {
      const change = changeOf(result, code)!;
      expect(change.after).toBe(code === '35' ? 20 : 5);
      expect(change.factors).toEqual([
        code === '35'
          ? { label: 'Grand meeting national', value: 20 }
          : { label: 'Grand meeting national (région)', value: 5 },
      ]);
    }
    expect(playerChanges(result)).toHaveLength(inRegion('53').length);
  });

  it('tournée : +6 dans chacun des départements de la région du département visé', () => {
    const state = newGame();
    const result = week(state, ['tournee@69']);
    const region = inRegion('84');
    expect(playerChanges(result).map((c) => c.departement)).toEqual(region);
    for (const code of region) expect(changeOf(result, code)!.after).toBe(6);
    expect(changeOf(result, '69')!.factors).toEqual([
      { label: 'Tournée de terrain (3 jours)', value: 6 },
    ]);
  });

  it('ne compte que les cartes acceptées', () => {
    const state = newGame();
    const result = week(state, ['meeting@29', 'porte-a-porte@29'], PLAYER_ACTOR_ID, [1]);
    expect(changeOf(result, '29')!.factors).toEqual([{ label: 'Porte-à-porte', value: 8 }]);
    expect(result.combos.filter((c) => c.kind === 'bastion')).toEqual([]);
  });
});

describe('combos de lieu', () => {
  it('bastion : deux cartes au même département, gain ×1,5', () => {
    const state = newGame();
    const result = week(state, ['porte-a-porte@29', 'porte-a-porte@29']);
    expect(changeOf(result, '29')).toMatchObject({
      before: 0,
      after: 24,
      factors: [
        { label: 'Porte-à-porte', value: 8 },
        { label: 'Porte-à-porte', value: 8 },
        { label: 'Bastion ×1,5', value: 8 },
      ],
    });
    expect(result.combos).toContainEqual({
      actorId: PLAYER_ACTOR_ID,
      kind: 'bastion',
      libelle: 'Bastion ×1,5 : Finistère (29)',
      cible: '29',
    });
  });

  it('tour de région : trois départements distincts, +5 à toute la région', () => {
    const state = newGame();
    const result = week(state, ['porte-a-porte@29', 'porte-a-porte@22', 'porte-a-porte@56']);
    for (const code of ['29', '22', '56'])
      expect(changeOf(result, code)!.factors).toEqual([
        { label: 'Porte-à-porte', value: 8 },
        { label: 'Tour de région', value: 5 },
      ]);
    expect(changeOf(result, '35')!.factors).toEqual([{ label: 'Tour de région', value: 5 }]);
    expect(result.combos).toContainEqual({
      actorId: PLAYER_ACTOR_ID,
      kind: 'tour-de-region',
      libelle: 'Tour de région : +5 dans ses 4 départements',
      cible: '53',
    });
    // Les deuxième et troisième cartes Terrain forment une série.
    expect(result.combos.filter((c) => c.kind === 'serie').map((c) => c.libelle)).toEqual([
      'Série Terrain ×2 (+25 %) : Porte-à-porte',
      'Série Terrain ×3 (+50 %) : Porte-à-porte',
    ]);
  });

  it('huit cartes au même endroit : un seul bastion, série plafonnée, implantation plafonnée', () => {
    const fresh = newGame();
    const plan = Array.from({ length: 8 }, () => 'porte-a-porte@29');
    const result = week(fresh, plan);
    const factors = changeOf(result, '29')!.factors;
    expect(factors.filter((f) => f.label.startsWith('Bastion'))).toEqual([
      { label: 'Bastion ×1,5', value: 32 },
    ]);
    expect(changeOf(result, '29')!.after).toBe(96);
    expect(result.combos.filter((c) => c.kind === 'bastion')).toHaveLength(1);
    const series = result.combos.filter((c) => c.kind === 'serie');
    expect(series).toHaveLength(7);
    expect(series.at(-1)!.libelle).toBe('Série Terrain ×8 (+50 %) : Porte-à-porte');

    const anchored = newGame();
    anchored.implantation[PLAYER_ACTOR_ID]!['29'] = 50;
    const capped = changeOf(week(anchored, plan), '29')!;
    expect(capped.after).toBe(100);
    expect(capped.factors.at(-1)).toEqual({ label: 'Plafond', value: -46 });
    expect(capped.before + sum(capped.factors)).toBe(capped.after);
  });

  it('une carte Terrain sans département : aucun gain, aucun combo de lieu', () => {
    const state = newGame();
    const result = week(state, ['meeting', 'meeting']);
    expect(playerChanges(result)).toEqual([]);
    expect(result.combos).toEqual([
      {
        actorId: PLAYER_ACTOR_ID,
        kind: 'serie',
        libelle: 'Série Terrain ×2 (+25 %) : Meeting public',
        cible: null,
      },
    ]);
  });
});

describe('érosion, départ et plafond', () => {
  it('érode de 1 par semaine au-dessus du départ, sauf là où une carte est posée', () => {
    const state = newGame();
    state.implantation['adv-aurore']!['75'] = 35; // départ 30 (région 11)
    state.implantation['adv-aurore']!['13'] = 31; // départ 30 (région 93)
    state.implantation[PLAYER_ACTOR_ID]!['29'] = 20;
    state.implantation[PLAYER_ACTOR_ID]!['22'] = 1;
    const result = week(state, ['porte-a-porte@29']);
    expect(changeOf(result, '75', 'adv-aurore')).toEqual({
      actorId: 'adv-aurore',
      departement: '75',
      before: 35,
      after: 34,
      factors: [{ label: 'Érosion', value: -1 }],
    });
    expect(changeOf(result, '13', 'adv-aurore')!.after).toBe(30);
    // Au départ, rien ne bouge ; un département visé ne s'érode pas.
    expect(changeOf(result, '92', 'adv-aurore')).toBeUndefined();
    expect(changeOf(result, '29')!.factors).toEqual([{ label: 'Porte-à-porte', value: 8 }]);
    expect(changeOf(result, '22')!.after).toBe(0);

    const next = week(state, []);
    expect(changeOf(next, '13', 'adv-aurore')).toBeUndefined();
    expect(state.implantation['adv-aurore']!['13']).toBe(30);
    expect(changeOf(next, '22')).toBeUndefined();
  });

  it('plafonne à 100', () => {
    const state = newGame();
    state.implantation[PLAYER_ACTOR_ID]!['29'] = 95;
    const change = changeOf(week(state, ['meeting@29']), '29')!;
    expect(change).toMatchObject({
      before: 95,
      after: 100,
      factors: [
        { label: 'Meeting public', value: 12 },
        { label: 'Plafond', value: -7 },
      ],
    });
  });

  it('chaque variation est la somme exacte de ses facteurs', () => {
    const state = newGame();
    state.implantation[PLAYER_ACTOR_ID]!['35'] = 98;
    const result = week(state, [
      'grand-meeting@29',
      'porte-a-porte@29',
      'tournee@22',
      'porte-a-porte@56',
    ]);
    expect(result.changes.length).toBeGreaterThan(0);
    for (const change of result.changes)
      expect(change.before + sum(change.factors), change.departement).toBe(change.after);
  });
});

describe('déplacement du président', () => {
  it('fait gagner 8 au département visité', () => {
    const state = newGame();
    const result = week(state, ['deplacement-presidentiel@2A']);
    expect(changeOf(result, '2A')).toEqual({
      actorId: PLAYER_ACTOR_ID,
      departement: '2A',
      before: 0,
      after: 8,
      factors: [{ label: 'Déplacement de terrain en région', value: 8 }],
    });
    expect(result.combos).toEqual([]);
  });
});

describe('semaine de campagne', () => {
  it('remplit report.implantation et report.combos, de façon déterministe', () => {
    const state = newGame();
    const plan = ['porte-a-porte@29', 'porte-a-porte@29', 'meeting'];
    const first = advance(state, plan, [], ruleset);
    expect(() => WeeklyReportSchema.parse(first.report)).not.toThrow();
    const change = first.report.implantation.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.departement === '29',
    );
    expect(change).toMatchObject({ before: 0, after: 24 });
    expect(first.state.implantation[PLAYER_ACTOR_ID]!['29']).toBe(24);
    expect(first.report.combos).toContainEqual(
      expect.objectContaining({ actorId: PLAYER_ACTOR_ID, kind: 'bastion', cible: '29' }),
    );
    const again = advance(state, plan, [], ruleset);
    expect(again.report.implantation).toEqual(first.report.implantation);
    expect(again.state.implantation).toEqual(first.state.implantation);
  });

  it('une carte Terrain sans département garde ses effets nationaux', () => {
    const { report } = advance(newGame(), ['meeting'], [], ruleset);
    expect(report.actions[0]).toMatchObject({ actionId: 'meeting', status: 'validee' });
    expect(report.implantation.filter((c) => c.actorId === PLAYER_ACTOR_ID)).toEqual([]);
    expect(playerChange(report, 'notoriete')!.factors).toContainEqual(
      expect.objectContaining({ label: 'Meeting public : effet attendu', value: 60 }),
    );
  });

  it('série : +25 % puis +50 % sur les effets de base positifs, dans le registre', () => {
    const { report } = advance(newGame(), ['meeting', 'meeting@01', 'tournee@69'], [], ruleset);
    const notoriete = playerChange(report, 'notoriete')!;
    expect(notoriete.factors).toContainEqual(
      expect.objectContaining({ label: 'Meeting public : série Terrain ×2 (+25 %)', value: 15 }),
    );
    expect(notoriete.factors).toContainEqual(
      expect.objectContaining({
        label: 'Tournée de terrain (3 jours) : série Terrain ×3 (+50 %)',
        value: 15,
      }),
    );
    expect(notoriete.before + sum(notoriete.factors)).toBe(notoriete.after);
    const popularite = playerChange(report, 'popularite')!;
    expect(popularite.factors).toContainEqual(
      expect.objectContaining({
        label: 'Tournée de terrain (3 jours) : série Terrain ×3 (+50 %)',
        value: 20,
      }),
    );
    const militants = playerChange(report, 'militants')!;
    expect(militants.factors).toContainEqual(
      expect.objectContaining({ label: 'Meeting public : série Terrain ×2 (+25 %)', value: 4 }),
    );
    // La première carte d'une famille n'a pas de bonus.
    expect(
      notoriete.factors.filter((f) => f.label === 'Meeting public : série Terrain ×1 (+0 %)'),
    ).toEqual([]);
  });
});
