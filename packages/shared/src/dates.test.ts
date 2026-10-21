import { describe, expect, it } from 'vitest';
import {
  addDays,
  civilFromDays,
  daysFromCivil,
  formatIsoDate,
  isoWeekday,
  isValidIsoDate,
  parseIsoDate,
} from './dates';

describe('dates civiles', () => {
  it('valide le format et le calendrier', () => {
    expect(isValidIsoDate('2026-09-28')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('1900-02-29')).toBe(false);
    expect(isValidIsoDate('2000-02-29')).toBe(true);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-9-28')).toBe(false);
    expect(isValidIsoDate('28/09/2026')).toBe(false);
  });

  it('calcule le jour de la semaine', () => {
    expect(isoWeekday(parseIsoDate('1970-01-01')!)).toBe(4);
    expect(isoWeekday(parseIsoDate('2026-09-28')!)).toBe(1);
    expect(isoWeekday(parseIsoDate('2027-04-18')!)).toBe(7);
  });

  it('concorde avec Date.UTC sur 1950–2100', () => {
    for (let days = daysFromCivil({ year: 1950, month: 1, day: 1 }); days < 47_500; days += 13) {
      const civil = civilFromDays(days);
      expect(Date.UTC(civil.year, civil.month - 1, civil.day) / 86_400_000).toBe(days);
      expect(daysFromCivil(civil)).toBe(days);
      expect(isoWeekday(civil)).toBe(((new Date(days * 86_400_000).getUTCDay() + 6) % 7) + 1);
    }
  });

  it('ajoute des jours', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(formatIsoDate(civilFromDays(0))).toBe('1970-01-01');
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});
