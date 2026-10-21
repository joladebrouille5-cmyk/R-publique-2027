import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ImportError } from './geometry/coverage';
import { apportion, buildRound, type RoundBuildInput } from './results/build';
import { inseeCode, parseResults } from './results/parse';
import { buildPassage } from './results/passage';
import { proclaimedValues } from './results/sources';

const HEADER =
  'Code du département;Libellé du département;Code de la commune;Libellé de la commune;Etat saisie;Inscrits;Abstentions;% Abs/Ins;Votants;% Vot/Ins;Blancs;% Blancs/Ins;% Blancs/Vot;Nuls;% Nuls/Ins;% Nuls/Vot;Exprimés;% Exp/Ins;% Exp/Vot;N°Panneau;Sexe;Nom;Prénom;Voix;% Voix/Ins;% Voix/Exp';

/** Ligne au format de l'Intérieur : inscrits, abstentions, votants, blancs, nuls, voix A, voix B. */
function line(
  dep: string,
  depName: string,
  com: string,
  name: string,
  v: [number, number, number, number, number, number, number],
) {
  const [ins, abs, vot, bl, nul, a, b] = v;
  const exp = a + b;
  return [
    dep,
    depName,
    com,
    name,
    'Complet',
    ins,
    abs,
    '0,00',
    vot,
    '0,00',
    bl,
    '0,00',
    '0,00',
    nul,
    '0,00',
    '0,00',
    exp,
    '0,00',
    '0,00',
    1,
    'F',
    'ALPHA',
    'Anne',
    a,
    '0,00',
    '0,00',
    2,
    'M',
    'BÊTA',
    'Bruno',
    b,
    '0,00',
    '0,00',
  ].join(';');
}

const FILE = [
  HEADER,
  line('01', 'Ain', '001', 'Commune A', [100, 20, 80, 2, 1, 40, 37]),
  line('01', 'Ain', '002', 'Commune B', [50, 10, 40, 1, 1, 20, 18]),
  line('01', 'Ain', '003', 'Commune C', [300, 60, 240, 5, 5, 130, 100]),
  line('ZM', 'Mayotte', '611', 'Mamoudzou', [40, 30, 10, 0, 0, 6, 4]),
  line('ZX', 'Saint-Martin/Saint-Barthélemy', '701', 'Saint-Barthélémy', [10, 5, 5, 0, 0, 3, 2]),
  line('ZZ', 'Français établis hors de France', '001', 'Abidjan', [20, 15, 5, 0, 0, 1, 4]),
  line('ZZ', 'Français établis hors de France', '002', 'Abou Dabi', [30, 20, 10, 1, 0, 5, 4]),
].join('\r\n');

describe('fichier de résultats de l’Intérieur', () => {
  it('lit les blocs de candidats et convertit les codes en codes INSEE', () => {
    const { candidats, lines } = parseResults(FILE);
    expect(candidats).toEqual([
      { panneau: 1, sexe: 'F', nom: 'ALPHA', prenom: 'Anne' },
      { panneau: 2, sexe: 'M', nom: 'BÊTA', prenom: 'Bruno' },
    ]);
    expect(lines.map((l) => [l.code, l.offMap])).toEqual([
      ['01001', false],
      ['01002', false],
      ['01003', false],
      ['97611', false],
      ['977', true],
      ['99', true],
      ['99', true],
    ]);
    expect(lines[0]!.valeurs).toEqual([100, 20, 80, 2, 1, 77, 40, 37]);
  });

  it('garde les codes en chaînes (Corse, zéros initiaux)', () => {
    expect(inseeCode('2A', '004')).toBe('2A004');
    expect(inseeCode('01', '1')).toBe('01001');
    expect(inseeCode('ZD', '411')).toBe('97411');
    expect(() => inseeCode('XX', '001')).toThrow(/inconnu/);
  });

  it('refuse une ligne incohérente', () => {
    const broken = FILE.replace('Commune A;Complet;100;20', 'Commune A;Complet;101;20');
    expect(() => parseResults(broken)).toThrow(/incohérents/);
  });
});

const MOVEMENTS = [
  '"MOD","DATE_EFF","TYPECOM_AV","COM_AV","TYPECOM_AP","COM_AP"',
  // 01001 et 01002 fusionnent en 2024 dans 01001 ; 01003 est scindée en 2025 (01003 + 01099).
  '"32","2024-01-01","COM","01001","COM","01001"',
  '"32","2024-01-01","COM","01002","COM","01001"',
  '"32","2024-01-01","COM","01002","COMD","01002"',
  '"21","2025-01-01","COM","01003","COM","01099"',
  '"21","2025-01-01","COM","01003","COM","01003"',
  // Mouvement antérieur à 2022 : ignoré.
  '"32","2019-01-01","COM","01050","COM","01001"',
].join('\n');

describe('passage à la géographie du référentiel', () => {
  it('regroupe fusions et scissions', () => {
    const groups = buildPassage(
      MOVEMENTS,
      '2022-01-01',
      ['01001', '01002', '01003', '97611'],
      ['01001', '01003', '01099', '97611', '55039'],
    );
    expect(groups).toEqual([
      { sources: ['01001', '01002'], targets: ['01001'] },
      { sources: ['01003'], targets: ['01003', '01099'] },
      { sources: [], targets: ['55039'] },
      { sources: ['97611'], targets: ['97611'] },
    ]);
  });

  it('refuse une commune source sans destination', () => {
    expect(() => buildPassage(MOVEMENTS, '2022-01-01', ['01001', '01777'], ['01001'])).toThrow(
      ImportError,
    );
  });
});

describe('construction d’un tour', () => {
  const { candidats, lines } = parseResults(FILE);
  const total = lines.reduce(
    (acc, l) => acc.map((v, i) => v + l.valeurs[i]!),
    new Array<number>(8).fill(0),
  );
  const input: RoundBuildInput = {
    election: 'test',
    tour: 1,
    date: '2022-04-10',
    millesimeGeographique: 'cog-2026',
    sources: [
      {
        id: 'test',
        titre: 'Test',
        producteur: 'Ministère de l’Intérieur',
        url: 'https://example.org/t1.txt',
        licence: 'non précisée',
        millesime: '2022',
        telechargeLe: '2026-10-20',
        sha256: 'b'.repeat(64),
        octets: 10,
      },
    ],
    proclamation: {
      reference: 'Décision test',
      url: 'https://example.org/decision',
      valeurs: total,
    },
    candidats,
    lines,
    passage: buildPassage(
      MOVEMENTS,
      '2022-01-01',
      ['01001', '01002', '01003', '97611'],
      ['01001', '01003', '01099', '97611', '55039'],
    ),
    population: new Map([
      ['01003', 300],
      ['01099', 100],
    ]),
  };

  it('additionne les fusions, ventile les scissions et isole le hors carte, totaux exacts', () => {
    const round = buildRound(input);
    expect(round.communes['01001']).toEqual([150, 30, 120, 3, 2, 115, 60, 55]);
    expect(round.estimations).toEqual(['01003', '01099']);
    expect(round.sansLigne).toEqual(['55039']);
    expect(round.communes['55039']).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const scission = [round.communes['01003']!, round.communes['01099']!];
    expect(scission[0]!.map((v, i) => v + scission[1]![i]!)).toEqual([
      300, 60, 240, 5, 5, 230, 130, 100,
    ]);
    expect(round.horsCarte['99']).toEqual({
      nom: 'Français établis hors de France',
      valeurs: [50, 35, 15, 1, 0, 14, 6, 8],
    });
    expect(round.horsCarte['977']!.valeurs[0]).toBe(10);
  });

  it('refuse un import dont la somme diffère de la proclamation', () => {
    const wrong = {
      ...input,
      proclamation: { ...input.proclamation, valeurs: total.map((v, i) => (i === 0 ? v + 1 : v)) },
    };
    expect(() => buildRound(wrong)).toThrow(/Totaux différents/);
  });

  it('associe les totaux proclamés aux candidats par leur nom', () => {
    const totaux = {
      inscrits: 10,
      votants: 8,
      blancs: 1,
      nuls: 1,
      exprimes: 6,
      voix: { BÊTA: 2, ALPHA: 4 },
    };
    expect(proclaimedValues(totaux, candidats)).toEqual([10, 2, 8, 1, 1, 6, 4, 2]);
    expect(() => proclaimedValues({ ...totaux, voix: { ALPHA: 6 } }, candidats)).toThrow(/BÊTA/);
  });
});

describe('ventilation', () => {
  it('conserve les totaux et la cohérence de chaque commune', () => {
    const arb = fc.tuple(
      fc.array(fc.nat(5000), { minLength: 2, maxLength: 5 }),
      fc.nat(100),
      fc.nat(100),
      fc.nat(1000),
      fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 6 }),
    );
    fc.assert(
      fc.property(arb, ([voix, blancs, nuls, abstentions, weights]) => {
        const exprimes = voix.reduce((a, b) => a + b, 0);
        const votants = exprimes + blancs + nuls;
        const values = [
          votants + abstentions,
          abstentions,
          votants,
          blancs,
          nuls,
          exprimes,
          ...voix,
        ];
        const parts = apportion(values, weights);
        expect(values.map((_, i) => parts.reduce((s, p) => s + p[i]!, 0))).toEqual(values);
        for (const [ins, abs, vot, bl, nul, exp, ...v] of parts) {
          expect(ins).toBe(abs! + vot!);
          expect(vot).toBe(bl! + nul! + exp!);
          expect(v.reduce((a, b) => a + b, 0)).toBe(exp);
        }
      }),
    );
  });
});
