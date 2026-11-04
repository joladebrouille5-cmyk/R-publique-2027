import {
  addDays,
  daysFromCivil,
  holidaysBetween,
  holidaysInWorkWeek,
  parseIsoDate,
  type GameState,
  type Notice,
  type Ruleset,
} from '@r2027/shared';
import type { FinanceBook } from '../campaign/finances';
import { applyFactors, effectFactors } from './effects';
import { compareStrings, type Ledger } from './ledger';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const NOTICE_HORIZON_DAYS = 28;

function dayNumber(iso: string): number {
  const civil = parseIsoDate(iso);
  if (!civil) throw new Error(`Date ISO invalide : ${iso}`);
  return daysFromCivil(civil);
}

/** « dimanche 18 avril 2027 », sans dépendre de la langue du système. */
export function formatFrenchDate(iso: string): string {
  const civil = parseIsoDate(iso)!;
  const weekday = WEEKDAYS[(((dayNumber(iso) + 3) % 7) + 7) % 7]!;
  return `${weekday} ${civil.day === 1 ? '1er' : civil.day} ${MONTHS[civil.month - 1]} ${civil.year}`;
}

/**
 * Échéances, scrutins et jours fériés (phase 20) des quatre prochaines semaines, à partir du
 * lundi `weekStart`.
 */
export function upcomingNotices(weekStart: string, ruleset: Ruleset): Notice[] {
  const start = dayNumber(weekStart);
  const items = [
    ...ruleset.calendrier.scrutins.map((s) => ({ ...s, kind: 'scrutin' as const })),
    ...ruleset.calendrier.echeances.map((e) => ({ ...e, kind: 'echeance' as const })),
    ...holidaysBetween(weekStart, addDays(weekStart, NOTICE_HORIZON_DAYS)).map((h) => ({
      id: h.id,
      libelle: `Jour férié : ${h.libelle}`,
      date: h.date,
      statut: 'deduit' as const,
      kind: 'ferie' as const,
    })),
  ];
  return items
    .map((item) => ({ item, days: dayNumber(item.date) - start }))
    .filter(({ days }) => days >= 0 && days < NOTICE_HORIZON_DAYS)
    .sort((a, b) => a.days - b.days || compareStrings(a.item.id, b.item.id))
    .map(({ item, days }) => ({
      id: item.id,
      kind: item.kind,
      label: item.libelle,
      date: item.date,
      statut: item.statut,
      inWeeks: Math.floor(days / 7),
    }));
}

/** Scrutin tombant dans la semaine commençant le lundi `weekStart`, s'il y en a un. */
export function scrutinInWeek(weekStart: string, ruleset: Ruleset) {
  const start = dayNumber(weekStart);
  return ruleset.calendrier.scrutins.find((s) => {
    const days = dayNumber(s.date) - start;
    return days >= 0 && days < 7;
  });
}

/**
 * Étape 9 (fin) : passage à la semaine suivante. Remet à zéro le temps disponible de chaque
 * campagne, applique les effets différés arrivés à échéance et signale les échéances proches.
 */
export function enterNextWeek(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  book: FinanceBook,
  step: number,
): { notices: Notice[]; appliedScheduled: number } {
  const nextWeek = state.meta.week + 1;
  state.meta.week = nextWeek;
  state.meta.date = addDays(state.meta.date, 7);

  const capacity = ruleset.jeu.tempsHebdomadaireHeures;
  for (const actorId of Object.keys(state.actors).sort(compareStrings)) {
    const remaining = ledger.current(actorId, 'tempsHeures');
    ledger.apply(actorId, 'tempsHeures', [
      {
        label: `Nouvelle semaine : temps disponible remis à ${capacity} h`,
        value: capacity - remaining,
        source: 'calendrier',
        step,
      },
    ]);
  }

  // Phase 20 (calendrier réel) : une semaine qui compte un jour férié, du lundi au samedi,
  // retire des heures de campagne aux candidats en lice (hypothèse de jeu).
  const lost = ruleset.jeu.heuresSemaineFeriee;
  const holidays = holidaysInWorkWeek(state.meta.date);
  if (
    lost > 0 &&
    holidays.length > 0 &&
    (state.meta.phase === 'campagne' || state.meta.phase === 'entre_deux_tours')
  ) {
    const names = holidays.map((h) => h.libelle).join(', ');
    for (const actor of Object.values(state.actors).sort((a, b) => compareStrings(a.id, b.id))) {
      if (actor.status !== 'candidat' && actor.status !== 'qualifie') continue;
      const hours = Math.min(lost, ledger.current(actor.id, 'tempsHeures'));
      if (hours === 0) continue;
      ledger.apply(actor.id, 'tempsHeures', [
        {
          label: `Jour férié (${names}) : ${hours} h de campagne en moins (hypothèse de jeu)`,
          value: -hours,
          source: 'calendrier',
          step,
        },
      ]);
    }
  }

  const due = state.scheduled
    .filter((effect) => effect.dueWeek <= nextWeek)
    .sort((a, b) => compareStrings(a.id, b.id));
  state.scheduled = state.scheduled.filter((effect) => effect.dueWeek > nextWeek);
  for (const effect of due) {
    if (!state.actors[effect.actorId]) continue;
    const current = ledger.current(effect.actorId, effect.ressource);
    const label = `${effect.origin.label} (effet différé de la semaine ${effect.origin.week})`;
    applyFactors(
      ledger,
      book,
      effect.actorId,
      effect.ressource,
      effectFactors(effect, current, label, 'differe', step, effect.origin.variable),
    );
  }
  return { notices: upcomingNotices(state.meta.date, ruleset), appliedScheduled: due.length };
}
