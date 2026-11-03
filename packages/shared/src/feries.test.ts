import { describe, expect, it } from 'vitest';
import { isoWeekday, parseIsoDate } from './dates';
import { easterSunday, holidaysBetween, holidaysInWorkWeek, publicHolidays } from './feries';

// Jours fériés (phase 20) : onze jours du code du travail, Pâques par le comput grégorien.

describe('jours fériés en France', () => {
  it('calcule Pâques pour des années connues', () => {
    // Dates de Pâques de 2022 à 2027, et deux cas limites du comput (22 mars, 25 avril).
    expect([2022, 2023, 2024, 2025, 2026, 2027, 2032, 2037].map((y) => easterSunday(y))).toEqual([
      '2022-04-17',
      '2023-04-09',
      '2024-03-31',
      '2025-04-20',
      '2026-04-05',
      '2027-03-28',
      '2032-03-28',
      '2037-04-05',
    ]);
    expect(easterSunday(1818)).toBe('1818-03-22');
    expect(easterSunday(1943)).toBe('1943-04-25');
    for (let year = 1900; year <= 2100; year++)
      expect(isoWeekday(parseIsoDate(easterSunday(year))!)).toBe(7);
  });

  it('liste les onze jours fériés de 2027, mobiles compris', () => {
    const days = publicHolidays(2027);
    expect(days).toHaveLength(11);
    expect(days.map((d) => `${d.date} ${d.libelle}`)).toEqual([
      '2027-01-01 Jour de l’an',
      '2027-03-29 Lundi de Pâques',
      '2027-05-01 Fête du Travail',
      '2027-05-06 Ascension',
      '2027-05-08 Victoire de 1945',
      '2027-05-17 Lundi de Pentecôte',
      '2027-07-14 Fête nationale',
      '2027-08-15 Assomption',
      '2027-11-01 Toussaint',
      '2027-11-11 Armistice de 1918',
      '2027-12-25 Noël',
    ]);
    // Ascension un jeudi, lundis de Pâques et de Pentecôte un lundi.
    const weekday = (id: string) => isoWeekday(parseIsoDate(days.find((d) => d.id === id)!.date)!);
    expect(weekday('ascension-2027')).toBe(4);
    expect(weekday('lundi-de-paques-2027')).toBe(1);
    expect(weekday('lundi-de-pentecote-2027')).toBe(1);
  });

  it('trouve les jours fériés d’une campagne et d’une semaine de travail', () => {
    expect(holidaysBetween('2026-10-05', '2027-05-03').map((d) => d.id)).toEqual([
      'toussaint-2026',
      'armistice-1918-2026',
      'noel-2026',
      'jour-de-l-an-2027',
      'lundi-de-paques-2027',
      'fete-du-travail-2027',
    ]);
    // Semaine du lundi 9 novembre 2026 : le mercredi 11 ; semaine du 26 octobre 2026 : aucun
    // (la Toussaint 2026 tombe un dimanche, hors de la semaine de travail).
    expect(holidaysInWorkWeek('2026-11-09').map((d) => d.libelle)).toEqual(['Armistice de 1918']);
    expect(holidaysInWorkWeek('2026-10-26')).toEqual([]);
    expect(holidaysInWorkWeek('2026-12-28').map((d) => d.libelle)).toEqual(['Jour de l’an']);
  });
});
