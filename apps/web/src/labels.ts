import type {
  DataStatus,
  Difficulty,
  FactorSource,
  GameMode,
  GamePhase,
  ResourceKey,
} from '@r2027/shared';

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

// --- Ressources, facteurs et statuts des données (phase 2) ---

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  budgetCentimes: 'Budget',
  tempsHeures: 'Temps disponible',
  militants: 'Militants',
  notoriete: 'Notoriété',
  popularite: 'Popularité',
};

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('fr-FR');
const twoDecimals = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Valeur d'une ressource dans son unité d'affichage (les valeurs internes sont entières). */
export function formatResource(resource: ResourceKey, value: number): string {
  switch (resource) {
    case 'budgetCentimes':
      return euros.format(value / 100);
    case 'tempsHeures':
      return `${integer.format(value)} h`;
    case 'militants':
      return integer.format(value);
    case 'notoriete':
    case 'popularite':
      return `${twoDecimals.format(value / 100)} %`;
  }
}

/** Variation signée : « −30 000 € », « +0,45 pt », « +12 ». */
export function formatDelta(resource: ResourceKey, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const magnitude = Math.abs(delta);
  switch (resource) {
    case 'budgetCentimes':
      return `${sign}${euros.format(magnitude / 100)}`;
    case 'tempsHeures':
      return `${sign}${integer.format(magnitude)} h`;
    case 'militants':
      return `${sign}${integer.format(magnitude)}`;
    case 'notoriete':
    case 'popularite':
      return `${sign}${twoDecimals.format(magnitude / 100)} pt`;
  }
}

export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  officiel: 'officielle',
  annonce: 'annoncée, décret non publié',
  deduit: 'déduite d’une règle',
  hypothese: 'hypothèse de jeu',
};

export const FACTOR_SOURCE_LABELS: Record<FactorSource, string> = {
  action: 'Action',
  risque: 'Aléa d’action',
  evenement: 'Événement',
  decision: 'Décision',
  differe: 'Effet différé',
  opinion: 'Dynamique de l’opinion',
  calendrier: 'Calendrier',
  limite: 'Borne',
};

export const PORTEE_LABELS = { locale: 'locale', regionale: 'régionale', nationale: 'nationale' };

export const JOURNAL_TYPE_LABELS: Record<string, string> = {
  semaine_resolue: 'Semaine résolue',
  partie_creee: 'Partie créée',
  partie_importee: 'Partie importée',
  sauvegarde_creee: 'Sauvegarde manuelle',
  sauvegarde_restauree: 'Sauvegarde restaurée',
  migration_de_sauvegarde: 'Migration du format de sauvegarde',
};
