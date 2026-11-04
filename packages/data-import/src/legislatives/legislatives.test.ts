import { describe, expect, it } from 'vitest';
import {
  buildDistricts,
  buildLegislatives,
  normalizeCirconscription,
  normalizeDepartement,
} from './build';

const HEADER = [
  'Code département',
  'Libellé département',
  'Code circonscription législative',
  'Libellé circonscription législative',
  'Inscrits',
  'Votants',
  'Exprimés',
  ...[1, 2, 3].flatMap((n) => [
    `Nuance candidat ${n}`,
    `Nom candidat ${n}`,
    `Prénom candidat ${n}`,
    `Voix ${n}`,
    `Elu ${n}`,
  ]),
].join(';');

type Candidate = [string, number, boolean];
const line = (dep: string, code: string, label: string, numbers: number[], cands: Candidate[]) =>
  [
    dep,
    'Département',
    code,
    label,
    ...numbers,
    ...[0, 1, 2].flatMap((i) => {
      const c = cands[i];
      return c ? [c[0], 'NOM', 'Prénom', c[1], c[2] ? 'élu' : ''] : ['', '', '', '', ''];
    }),
  ].join(';');

/** Premier tour sans zéros initiaux (comme le fichier publié), second tour avec. */
const T1 = [
  HEADER,
  line(
    '1',
    '101',
    '1ère circonscription',
    [1000, 600, 590],
    [
      ['RN', 300, false],
      ['UG', 290, false],
    ],
  ),
  line(
    '2A',
    '2A01',
    '1ère circonscription',
    [800, 500, 490],
    [
      ['LR', 400, true],
      ['UG', 90, false],
    ],
  ),
  line(
    'ZZ',
    'ZZ09',
    '9ème circonscription',
    [900, 300, 292],
    [
      ['ENS', 150, false],
      ['UG', 140, false],
    ],
  ),
].join('\n');
const T2 = [
  HEADER,
  line(
    '01',
    '0101',
    '1ère circonscription',
    [1000, 650, 630],
    [
      ['RN', 300, false],
      ['UG', 330, true],
    ],
  ),
  line(
    'ZZ',
    'ZZ09',
    '9ème circonscription',
    [900, 320, 310],
    [
      ['ENS', 160, true],
      ['UG', 150, false],
    ],
  ),
].join('\n');

const build = (t1 = T1, t2 = T2) =>
  buildLegislatives({
    verifieLe: '2026-10-21',
    t1,
    t2,
    sources: [
      {
        id: 'legislatives-2024-t1',
        titre: 'Résultats',
        url: 'https://static.data.gouv.fr/t1.csv',
        licence: 'Licence Ouverte',
        version: 'test',
        consulteLe: '2026-10-21',
        sha256: 'a'.repeat(64),
      },
    ],
  });

describe('législatives de 2024 par circonscription', () => {
  it('rétablit les zéros initiaux et garde les codes en chaînes', () => {
    expect(normalizeDepartement('1')).toBe('01');
    expect(normalizeDepartement('2A')).toBe('2A');
    expect(normalizeCirconscription('1', '101')).toBe('0101');
    expect(normalizeCirconscription('971', '97104')).toBe('97104');
    expect(normalizeCirconscription('ZZ', 'ZZ09')).toBe('ZZ09');
    expect(() => normalizeCirconscription('02', '0101')).toThrow(/hors du département/);
  });

  it('agrège les voix par nuance, conserve l’écart publié et le tour de l’élu, sans nom', () => {
    const districts = buildDistricts(T1, T2);
    expect(districts.map((d) => [d.code, d.departement, d.elu])).toEqual([
      ['0101', '01', { nuance: 'UG', tour: 2 }],
      ['2A01', '2A', { nuance: 'LR', tour: 1 }],
      ['ZZ09', 'ZZ', { nuance: 'ENS', tour: 2 }],
    ]);
    expect(districts[0]).toMatchObject({
      inscrits: 1000,
      votants: 600,
      exprimes: 590,
      voix: { RN: 300, UG: 290 },
      ecart: 0,
    });
    expect(districts[2]!.ecart).toBe(2);
    expect(JSON.stringify(districts)).not.toMatch(/NOM|Prénom/);
    // Fichier de test incomplet : le jeu complet exige 577 circonscriptions.
    expect(() => build()).toThrow(/577/);
  });

  it('refuse un second tour sans premier tour ou une circonscription sans élu', () => {
    const orphan = `${T2}\n${line('03', '0301', '1ère circonscription', [10, 5, 5], [['RN', 5, true]])}`;
    expect(() => build(T1, orphan)).toThrow(/Second tour sans premier tour : 0301/);
    const noWinner = T2.split('\n').slice(0, 2).join('\n');
    expect(() => build(T1, noWinner)).toThrow(/ZZ09 : élu au premier tour et au second, ou jamais/);
  });
});
