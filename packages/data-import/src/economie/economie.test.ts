import { describe, expect, it } from 'vitest';
import {
  buildEconomy,
  parseInseeNumber,
  parseInseeSeries,
  SERIES,
  type InseeSeries,
  type SeriesRole,
} from './build';

const quarterly = (rows: [number, string, string][]) =>
  rows
    .map(([y, p, v]) => `<tr>\n<td>${y}</td>\n<td>${p}</td>\n<td class="nombre">${v}</td>\n</tr>`)
    .join('\n');
const monthly = (rows: [number, string, string, string][]) =>
  rows
    .map(
      ([y, m, name, v]) =>
        `<tr><td>${y}</td><td><span data-i18n="series.mois.${m}">${name}</span></td><td class="nombre">${v}</td></tr>`,
    )
    .join('\n');
const response = (idbank: string, html: string) =>
  JSON.stringify({
    series: [{ idbank, titreFR: `Série ${idbank}`, frequence: 'T', lastUpdate: '2026-08-28' }],
    html: `<table><tbody>${html}</tbody></table>`,
  });

describe('séries de l’Insee', () => {
  it('lit les nombres publiés (révisés, séparateurs, virgule décimale)', () => {
    expect(parseInseeNumber('(r) 759\u202f713')).toBe(759_713);
    expect(parseInseeNumber('-39 075')).toBe(-39_075);
    expect(parseInseeNumber('3,1')).toBe(3.1);
    expect(() => parseInseeNumber('')).toThrow(/illisible/);
  });

  it('lit les observations trimestrielles et mensuelles, de la plus récente à la plus ancienne', () => {
    const q = parseInseeSeries(
      response(
        '001688527',
        quarterly([
          [2026, 'T2', '8,3'],
          [2026, 'T1', '8,1'],
        ]),
      ),
    );
    expect(q.observations).toEqual([
      { annee: 2026, periode: 'T2', valeur: 8.3 },
      { annee: 2026, periode: 'T1', valeur: 8.1 },
    ]);
    const m = parseInseeSeries(response('001587668', monthly([[2026, '09', 'Septembre', '86']])));
    expect(m.observations).toEqual([{ annee: 2026, periode: 'septembre', valeur: 86 }]);
    expect(() => parseInseeSeries(response('x', ''))).toThrow(/sans observation/);
  });

  const LAST4: [number, string][] = [
    [2026, 'T2'],
    [2026, 'T1'],
    [2025, 'T4'],
    [2025, 'T3'],
  ];
  const series = (overrides: Partial<Record<SeriesRole, InseeSeries>> = {}) => {
    const make = (role: SeriesRole, values: string[], periods = LAST4) =>
      parseInseeSeries(
        response(SERIES[role], quarterly(periods.map(([y, p], i) => [y, p, values[i]!]))),
      );
    return {
      'insee-pib-evolution': make('insee-pib-evolution', ['0,0', '-0,2', '0,3', '0,4']),
      'insee-ipc-glissement': parseInseeSeries(
        response(SERIES['insee-ipc-glissement'], monthly([[2026, '09', 'Septembre', '(r) 3,1']])),
      ),
      'insee-chomage-bit': make('insee-chomage-bit', ['8,3', '8,1', '7,9', '7,7']),
      'insee-dette-maastricht': make('insee-dette-maastricht', [
        '119,0',
        '117,5',
        '115,7',
        '117,0',
      ]),
      'insee-solde-apu': make('insee-solde-apu', ['-39 075', '-38 734', '-33 007', '-40 213']),
      'insee-pib-valeur': make('insee-pib-valeur', ['759 713', '756 553', '755 703', '750 640']),
      'insee-confiance-menages': parseInseeSeries(
        response(SERIES['insee-confiance-menages'], monthly([[2026, '09', 'Septembre', '86']])),
      ),
      ...overrides,
    };
  };
  const sources = Object.keys(SERIES).map((id) => ({
    id,
    titre: id,
    url: 'https://www.insee.fr/fr/statistiques/serie/0',
    licence: 'test',
    version: 'test',
    consulteLe: '2026-10-21',
    sha256: 'a'.repeat(64),
  }));

  it('déduit la croissance sur un an et le déficit sur quatre trimestres', () => {
    const economy = buildEconomy({ verifieLe: '2026-10-21', series: series(), sources });
    expect(economy.indicateurs).toMatchObject({
      croissance: {
        valeur: 50,
        statut: 'deduit',
        periode: '4 trimestres jusqu’au T2 2026',
      },
      inflation: { valeur: 310, statut: 'estimation', periode: 'septembre 2026' },
      chomage: { valeur: 830 },
      dette: { valeur: 11_900 },
      deficit: {
        valeur: -500,
        statut: 'deduit',
        sourceIds: ['insee-solde-apu', 'insee-pib-valeur'],
      },
      confiance: { valeur: 8_600 },
    });
    expect(economy.pibAnnuelMillions.valeur).toBe(3_022_609);
  });

  it('échoue sur des trimestres incohérents ou une série inattendue', () => {
    const shifted = series({
      'insee-pib-valeur': parseInseeSeries(
        response(
          SERIES['insee-pib-valeur'],
          quarterly([
            [2026, 'T1', '1'],
            [2025, 'T4', '1'],
            [2025, 'T3', '1'],
            [2025, 'T2', '1'],
          ]),
        ),
      ),
    });
    expect(() => buildEconomy({ verifieLe: '2026-10-21', series: shifted, sources })).toThrow(
      /trimestres différents/,
    );
    const wrong = series({
      'insee-chomage-bit': { ...series()['insee-chomage-bit'], idbank: '000000000' },
    });
    expect(() => buildEconomy({ verifieLe: '2026-10-21', series: wrong, sources })).toThrow(
      /idbank 001688527 attendu/,
    );
  });
});
