import type { HistoricalRound } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { newGame, QUIET, RULESET } from '../core/testing';
import { resolveRound } from '../election/rounds';
import { aggregateCounts, checkCounts } from './aggregate';
import {
  demoBaseline,
  historicalBaseline,
  nationalBaseline,
  type TerritorialBaseline,
} from './baseline';
import { BaselineMismatchError, communeResults } from './communes';

const T1 = RULESET.calendrier.scrutins[0]!;
const G = RULESET.electorat.groupes.length;
const flat = (value: number) => new Array<number>(G).fill(value);

/** Petite base : deux départements de deux régions, une commune sans électeurs, un territoire hors carte. */
const BASE: TerritorialBaseline = {
  id: 'test-base',
  nature: 'fictif',
  description: 'test',
  units: [
    {
      code: '01001',
      niveau: 'commune',
      departement: '01',
      region: '84',
      inscrits: 1200,
      affinite: flat(1),
      participation: 1,
    },
    {
      code: '01002',
      niveau: 'commune',
      departement: '01',
      region: '84',
      inscrits: 830,
      affinite: RULESET.electorat.groupes.map((_, i) => (i === 0 ? 3 : 0.8)),
      participation: 1.2,
    },
    {
      code: '2A004',
      niveau: 'commune',
      departement: '2A',
      region: '94',
      inscrits: 52_000,
      affinite: flat(1),
      participation: 0.8,
    },
    {
      code: '55039',
      niveau: 'commune',
      departement: '55',
      region: '44',
      inscrits: 0,
      affinite: flat(1),
      participation: 1,
    },
    {
      code: '99',
      niveau: 'hors-carte',
      departement: null,
      region: null,
      inscrits: 1_400_000,
      affinite: flat(1),
      participation: 0.5,
    },
  ],
};

describe('dépouillement territorial', () => {
  const state = newGame();
  const result = resolveRound(state, RULESET, T1, 1, BASE);
  const territoire = result.territoire!;

  it('chaque niveau est la somme exacte du niveau inférieur', () => {
    const national = {
      inscrits: result.inscrits,
      votants: result.votants,
      blancs: result.blancs,
      nuls: result.nuls,
      exprimes: result.exprimes,
      voix: result.voix,
    };
    expect(national).toEqual(
      aggregateCounts([
        ...Object.values(territoire.regions),
        ...Object.values(territoire.horsCarte),
      ]),
    );
    expect(territoire.regions['84']).toEqual(territoire.departements['01']);
    expect(result.inscrits).toBe(BASE.units.reduce((s, u) => s + u.inscrits, 0));
    for (const counts of [
      ...Object.values(territoire.departements),
      ...Object.values(territoire.horsCarte),
    ]) {
      expect(checkCounts(counts)).toEqual([]);
    }
    expect(aggregateCounts(result.groups.map(({ groupId: _, ...c }) => c))).toEqual(national);
  });

  it('recalcule à l’identique les communes d’un département', () => {
    const communes = communeResults(result, BASE, RULESET, '01');
    expect([...communes.keys()]).toEqual(['01001', '01002']);
    expect(aggregateCounts([...communes.values()])).toEqual(territoire.departements['01']);
    expect(communeResults(result, BASE, RULESET, '55').get('55039')).toMatchObject({
      inscrits: 0,
      votants: 0,
    });
  });

  it('refuse de recalculer avec une autre base électorale', () => {
    expect(() => communeResults(result, { ...BASE, id: 'autre' }, RULESET, '01')).toThrow(
      BaselineMismatchError,
    );
  });

  it('une commune où un groupe est surreprésenté vote davantage pour son candidat le plus proche', () => {
    const communes = communeResults(result, BASE, RULESET, '01');
    const etincelle = (code: string) =>
      communes.get(code)!.voix['adv-etincelle']! / communes.get(code)!.exprimes;
    expect(etincelle('01002')).toBeGreaterThan(etincelle('01001'));
  });

  it('enregistre la base et le comportement des groupes', () => {
    expect(territoire).toMatchObject({ baselineId: 'test-base', nature: 'fictif' });
    expect(territoire.comportement).toHaveLength(G);
    for (const behavior of territoire.comportement) {
      expect(behavior.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('la base nationale donne les inscrits du jeu de règles', () => {
    expect(resolveRound(state, RULESET, T1, 1, nationalBaseline(RULESET)).inscrits).toBe(
      RULESET.electorat.inscrits.valeur,
    );
  });

  it('une présidentielle complète se joue sur la base territoriale', () => {
    let s = newGame({}, QUIET);
    for (let i = 0; i < 40 && !s.quinquennat; i++) {
      const decisions = s.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      s = advanceWeek(s, { actions: [], decisions }, { ruleset: QUIET, territory: BASE }).state;
    }
    expect(s.quinquennat?.mandat.presidentId).toBe(s.elections.t2!.winner);
    expect(s.elections.t1!.territoire!.baselineId).toBe('test-base');
    expect(s.elections.t2!.inscrits).toBe(s.elections.t1!.inscrits);
    expect(Object.keys(s.elections.t2!.territoire!.departements).sort()).toEqual([
      '01',
      '2A',
      '55',
    ]);
  });
});

/** Tour historique minimal : deux candidats (« LE PEN », « MACRON »), deux communes et l'étranger. */
function historical(
  tour: 1 | 2,
  communes: Record<string, number[]>,
  horsCarte: Record<string, number[]>,
): HistoricalRound {
  return {
    format: 'republique-2027/resultats',
    formatVersion: 1,
    election: 'presidentielle-2022',
    tour,
    date: '2022-04-10',
    nature: 'reel',
    millesimeGeographique: 'cog-2026',
    importeur: 'test',
    sources: [],
    proclamation: { reference: 'test', url: 'https://example.org', valeurs: [] },
    candidats: [
      { panneau: 1, nom: 'MACRON', prenom: 'Emmanuel', sexe: 'M' },
      { panneau: 2, nom: 'LE PEN', prenom: 'Marine', sexe: 'F' },
    ],
    communes,
    estimations: [],
    sansLigne: [],
    horsCarte: Object.fromEntries(
      Object.entries(horsCarte).map(([code, valeurs]) => [code, { nom: code, valeurs }]),
    ),
  } as HistoricalRound;
}

describe('base électorale historique', () => {
  // [inscrits, abstentions, votants, blancs, nuls, exprimés, voix MACRON, voix LE PEN]
  const first = historical(
    1,
    {
      '01001': [1000, 200, 800, 10, 10, 780, 600, 180],
      '2A004': [1000, 400, 600, 10, 10, 580, 100, 480],
      '55039': [0, 0, 0, 0, 0, 0, 0, 0],
    },
    { '99': [500, 300, 200, 0, 0, 200, 150, 50] },
  );
  const last = historical(
    2,
    {
      '01001': [1010, 0, 1010, 0, 0, 1010, 600, 410],
      '2A004': [990, 0, 990, 0, 0, 990, 400, 590],
      '55039': [0, 0, 0, 0, 0, 0, 0, 0],
    },
    { '99': [520, 0, 520, 0, 0, 520, 400, 120] },
  );
  const communes = [
    { code: '01001', departement: '01', region: '84' },
    { code: '2A004', departement: '2A', region: '94' },
    { code: '55039', departement: '55', region: '44' },
  ];
  const baseline = historicalBaseline(RULESET, first, last, communes);
  const unit = (code: string) => baseline.units.find((u) => u.code === code)!;
  const index = (id: string) => RULESET.electorat.groupes.findIndex((g) => g.id === id);

  it('reprend les inscrits du dernier tour et marque la base comme réelle', () => {
    expect(baseline.nature).toBe('reel');
    expect(baseline.units.map((u) => [u.code, u.niveau, u.inscrits])).toEqual([
      ['01001', 'commune', 1010],
      ['2A004', 'commune', 990],
      ['55039', 'commune', 0],
      ['99', 'hors-carte', 520],
    ]);
  });

  it('situe les groupes selon les votes passés, lissés et bornés', () => {
    const nationale = index('droite-nationale');
    expect(unit('2A004').affinite[nationale]).toBeGreaterThan(unit('01001').affinite[nationale]!);
    expect(unit('55039').affinite.every((a) => a === 1)).toBe(true);
    for (const u of baseline.units) {
      expect(u.participation).toBeGreaterThanOrEqual(
        RULESET.electorat.baseHistorique.participationLocale.min,
      );
      expect(u.participation).toBeLessThanOrEqual(
        RULESET.electorat.baseHistorique.participationLocale.max,
      );
    }
    expect(unit('2A004').participation).toBeLessThan(unit('01001').participation);
  });

  it('refuse un candidat absent du jeu de règles et change d’empreinte avec les données', () => {
    const unknown = {
      ...first,
      candidats: [first.candidats[0]!, { ...first.candidats[1]!, nom: 'INCONNU' }],
    };
    expect(() => historicalBaseline(RULESET, unknown, last, communes)).toThrow(/INCONNU/);
    const other = historicalBaseline(
      RULESET,
      first,
      historical(
        2,
        { ...last.communes, '01001': [1011, 0, 1011, 0, 0, 1011, 600, 411] },
        { '99': [520, 0, 520, 0, 0, 520, 400, 120] },
      ),
      communes,
    );
    expect(other.id).not.toBe(baseline.id);
  });
});

describe('base de démonstration', () => {
  const demo = demoBaseline(
    RULESET,
    [
      { code: '2A004', departement: '2A', region: '94', population: 75_000 },
      { code: '2A006', departement: '2A', region: '94', population: 3_000 },
    ],
    [{ code: '75', region: '11', population: 2_100_000 }],
  );

  it('est fictive, déterministe et totalise les inscrits du jeu de règles', () => {
    expect(demo.nature).toBe('fictif');
    expect(demo.units.reduce((s, u) => s + u.inscrits, 0)).toBe(RULESET.electorat.inscrits.valeur);
    expect(demo.units.find((u) => u.code === '75')).toMatchObject({
      niveau: 'departement',
      affinite: flat(1),
    });
    expect(
      demoBaseline(
        RULESET,
        [
          { code: '2A004', departement: '2A', region: '94', population: 75_000 },
          { code: '2A006', departement: '2A', region: '94', population: 3_000 },
        ],
        [{ code: '75', region: '11', population: 2_100_000 }],
      ),
    ).toEqual(demo);
  });
});
