import { describe, expect, it } from 'vitest';
import type { ChesParty } from '../personnalites/ches';
import { buildAssembly, GROUPES } from './build';

const HEADER =
  '"identifiant","Prénom","Nom","Région","Département","Numéro de circonscription","Profession","Groupe politique (complet)","Groupe politique (abrégé)"';
const row = (i: number, sigle: string, libelle: string) =>
  `"${1000 + i}","Prénom${i}","Nom${i}","Région","Département","${i}","Profession","${libelle}","${sigle}"`;

const CHES: ChesParty[] = [
  { party: 'RN', partyId: '610', year: 2024, family: 1, lrecon: 6, galtan: 8.36 },
  { party: 'LR', partyId: '609', year: 2024, family: 2, lrecon: 7.82, galtan: 7.18 },
  { party: 'REC', partyId: '630', year: 2024, family: 1, lrecon: 8.33, galtan: 9.1 },
  { party: 'PS', partyId: '602', year: 2024, family: 5, lrecon: 3.36, galtan: 2.73 },
];

function csv(groups: [string, string, number][]): string {
  let i = 0;
  const lines = [HEADER];
  for (const [sigle, libelle, n] of groups)
    for (let k = 0; k < n; k++) lines.push(row(++i, sigle, libelle));
  return `${lines.join('\r\n')}\r\n`;
}

const build = (text: string) =>
  buildAssembly({
    verifieLe: '2026-10-21',
    legislature: 17,
    csv: text,
    ches2024: CHES,
    sources: [
      {
        id: 'an-deputes-en-exercice',
        titre: 'Liste des députés',
        url: 'https://data.assemblee-nationale.fr/liste.csv',
        licence: 'Licence Ouverte',
        version: 'test',
        consulteLe: '2026-10-21',
        sha256: 'a'.repeat(64),
      },
    ],
  });

describe('composition de l’Assemblée nationale', () => {
  const text = csv([
    ['SOC', 'Socialistes et apparentés', 300],
    ['RN', 'Rassemblement National', 200],
    ['UDR', 'Union des droites pour la République', 50],
    ['NI', 'Non inscrit', 20],
  ]);

  it('compte les sièges par groupe, déduit les vacants et ne garde aucun nom', () => {
    const assembly = build(text);
    expect(assembly.groupes.map((g) => [g.id, g.sieges])).toEqual([
      ['soc', 300],
      ['rn', 200],
      ['udr', 50],
      ['ni', 20],
    ]);
    expect(assembly.vacants).toBe(7);
    const json = JSON.stringify(assembly);
    expect(json).not.toMatch(/Prénom|Nom\d|Profession|Département/);
  });

  it('positionne un groupe d’après son parti CHES ou une hypothèse motivée', () => {
    const groups = new Map(build(text).groupes.map((g) => [g.id, g]));
    expect(groups.get('rn')).toMatchObject({
      position: { economie: 20, societe: 67 },
      positionStatut: 'estimation',
      ches: { parti: 'RN', lrecon: 6, galtan: 8.36 },
    });
    // Moyenne des familles « droite radicale » et « conservateurs » (RN, LR, REC).
    expect(groups.get('udr')).toMatchObject({
      position: { economie: 48, societe: 64 },
      positionStatut: 'hypothese',
      ches: null,
    });
    expect(groups.get('ni')).toMatchObject({ nonInscrits: true, positionStatut: 'hypothese' });
    for (const g of groups.values()) expect(g.positionDetail.length).toBeGreaterThan(20);
  });

  it('échoue sur un groupe inconnu, un intitulé incohérent ou trop de députés', () => {
    expect(() => build(csv([['NOUV', 'Nouveau groupe', 10]]))).toThrow(/absent de la sélection/);
    expect(() =>
      build(
        csv([
          ['SOC', 'Socialistes', 1],
          ['SOC', 'Autre intitulé', 1],
        ]),
      ),
    ).toThrow(/intitulés différents/);
    expect(() => build(csv([['SOC', 'Socialistes et apparentés', 578]]))).toThrow(/577 sièges/);
    expect(() =>
      build(
        csv([
          ['DR', 'Droite Républicaine', 10],
          ['SOC', 'Socialistes', 10],
        ]),
      ),
    ).not.toThrow();
  });

  it('couvre les groupes de la 17e législature', () => {
    expect(Object.keys(GROUPES).sort()).toEqual(
      [
        'DR',
        'Dem',
        'EPR',
        'EcoS',
        'GDR',
        'HOR',
        'LFI-NFP',
        'LIOT',
        'NI',
        'RN',
        'SOC',
        'UDR',
      ].sort(),
    );
  });
});
