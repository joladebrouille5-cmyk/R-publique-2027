import type { Difficulty, GameMode, GamePhase } from '@r2027/shared';

export const MODE_LABELS: Record<GameMode, string> = {
  candidat_reel: 'Candidat réel',
  candidat_personnalise: 'Candidat personnalisé',
  observateur: 'Observateur',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  accessible: 'Accessible',
  standard: 'Standard',
  expert: 'Expert',
};

export const PHASE_LABELS: Record<GamePhase, string> = {
  campagne: 'Campagne présidentielle',
  entre_deux_tours: 'Entre-deux-tours',
  presidence: 'Présidence',
  legislatives: 'Législatives',
  bilan: 'Bilan',
};

const longDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Date de jeu ISO (AAAA-MM-JJ) → « lundi 28 septembre 2026 ». */
export function formatGameDate(iso: string): string {
  return longDate.format(new Date(`${iso}T00:00:00Z`));
}

/** Horodatage réel (création, mise à jour). */
export function formatTimestamp(iso: string): string {
  return dateTime.format(new Date(iso));
}
