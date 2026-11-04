import { addDays, daysFromCivil, formatIsoDate, parseIsoDate } from './dates';

// Jours fériés en France (phase 20, « calendrier réel ») : les onze jours fériés du droit
// national (articles L. 3133-1 à 3 du code du travail, SOURCES §4.2), calculés pour toute
// année : huit dates fixes et trois dates qui suivent Pâques (lundi de Pâques, jeudi de
// l'Ascension, lundi de Pentecôte). Aucune date n'est écrite en dur : la règle vaut pour les
// cycles de 2032 et 2037. Les jours propres à l'Alsace-Moselle et aux outre-mer ne sont pas
// retenus (jeu national).

export type JourFerie = { id: string; libelle: string; date: string };

/** Dimanche de Pâques du calendrier grégorien (algorithme anonyme de Meeus, Jones et Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatIsoDate({ year, month, day });
}

const FIXED: readonly { id: string; libelle: string; month: number; day: number }[] = [
  { id: 'jour-de-l-an', libelle: 'Jour de l’an', month: 1, day: 1 },
  { id: 'fete-du-travail', libelle: 'Fête du Travail', month: 5, day: 1 },
  { id: 'victoire-1945', libelle: 'Victoire de 1945', month: 5, day: 8 },
  { id: 'fete-nationale', libelle: 'Fête nationale', month: 7, day: 14 },
  { id: 'assomption', libelle: 'Assomption', month: 8, day: 15 },
  { id: 'toussaint', libelle: 'Toussaint', month: 11, day: 1 },
  { id: 'armistice-1918', libelle: 'Armistice de 1918', month: 11, day: 11 },
  { id: 'noel', libelle: 'Noël', month: 12, day: 25 },
];

/** Les onze jours fériés de l'année, dans l'ordre du calendrier. */
export function publicHolidays(year: number): JourFerie[] {
  const easter = easterSunday(year);
  const days = [
    ...FIXED.map((f) => ({
      id: `${f.id}-${year}`,
      libelle: f.libelle,
      date: formatIsoDate({ year, month: f.month, day: f.day }),
    })),
    { id: `lundi-de-paques-${year}`, libelle: 'Lundi de Pâques', date: addDays(easter, 1) },
    // « 40e jour à partir du dimanche de Pâques » : le jeudi, 39 jours après.
    { id: `ascension-${year}`, libelle: 'Ascension', date: addDays(easter, 39) },
    { id: `lundi-de-pentecote-${year}`, libelle: 'Lundi de Pentecôte', date: addDays(easter, 50) },
  ];
  return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const day = (iso: string) => daysFromCivil(parseIsoDate(iso)!);

/** Jours fériés compris entre `from` (inclus) et `to` (exclu). */
export function holidaysBetween(from: string, to: string): JourFerie[] {
  const start = parseIsoDate(from)!.year;
  const end = parseIsoDate(to)!.year;
  const out: JourFerie[] = [];
  for (let year = start; year <= end; year++)
    for (const holiday of publicHolidays(year))
      if (day(holiday.date) >= day(from) && day(holiday.date) < day(to)) out.push(holiday);
  return out;
}

/** Jours fériés tombant du lundi `weekStart` au samedi suivant (le dimanche est déjà chômé). */
export function holidaysInWorkWeek(weekStart: string): JourFerie[] {
  return holidaysBetween(weekStart, addDays(weekStart, 6));
}
