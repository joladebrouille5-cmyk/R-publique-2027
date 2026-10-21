import type {
  AiObjective,
  CandidateStatus,
  DataStatus,
  Difficulty,
  FactorSource,
  GameMode,
  GamePhase,
  Poll,
  ReceiptKind,
  RefusalOrigin,
  ResourceKey,
  StrategyPriority,
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
  estimation: 'estimation',
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

// --- Élection (phase 3) ---

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  candidat: 'En campagne',
  qualifie: 'Qualifié(e) au second tour',
  elimine: 'Éliminé(e)',
  elu: 'Élu(e)',
  battu: 'Battu(e) au second tour',
  ecarte: 'Écarté(e) : parrainages insuffisants',
  retire: 'Retiré(e) : ralliement',
};

// --- Campagne (phase 5) ---

export const RECEIPT_LABELS: Record<ReceiptKind, string> = {
  parti: 'Contribution du parti',
  apportPersonnel: 'Apport personnel du candidat',
  dons: 'Dons de personnes physiques',
  emprunts: 'Emprunts bancaires',
  avance: 'Avance forfaitaire de l’État',
  autres: 'Autres recettes',
};

export const REFUSAL_LABELS: Record<RefusalOrigin, string> = {
  personne_morale: 'Don d’une personne morale',
  depassement: 'Part au-delà du maximum légal',
  especes: 'Espèces au-delà du seuil',
};

export const PRIORITY_LABELS: Record<StrategyPriority, string> = {
  parrainages: 'Parrainages',
  financement: 'Financement',
  notoriete: 'Notoriété',
  popularite: 'Conquête d’électeurs',
  mobilisation: 'Mobilisation',
  debat: 'Préparation du débat',
};

export const OBJECTIVE_LABELS: Record<AiObjective, string> = {
  victoire: 'Gagner l’élection',
  qualification: 'Se qualifier au second tour',
  visibilite: 'Faire entendre ses idées',
};

export const CONFIDENCE_LABELS = {
  faible: 'faible',
  moyenne: 'moyenne',
  elevee: 'élevée',
} as const;

/** Montant en centimes → « 1 234 567 € ». */
export function formatEuros(centimes: number): string {
  return euros.format(centimes / 100);
}

/** Millions d'euros (estimation de jeu) → « 2,5 Md€ / an », « 300 M€ / an », « économie de 3 Md€ ». */
export function formatAnnualCost(millions: number): string {
  const magnitude = Math.abs(millions);
  const text =
    magnitude >= 1_000
      ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(magnitude / 1_000)} Md€`
      : `${integer.format(magnitude)} M€`;
  if (millions < 0) return `économie de ${text} par an`;
  return millions === 0 ? 'sans coût budgétaire' : `${text} par an`;
}

export const POLL_KIND_LABELS: Record<Poll['kind'], string> = {
  intentions_t1: 'Intentions de vote au premier tour',
  intentions_t2: 'Intentions de vote au second tour',
  popularite: 'Cote de popularité',
};

/** Part en centièmes de point (0 à 10 000) → « 23,45 % ». */
export function formatShare(value: number): string {
  return `${twoDecimals.format(value / 100)} %`;
}

/** Part d'un total entier → « 23,45 % » (deux décimales, arrondi). */
export function formatRatio(part: number, total: number): string {
  return total > 0 ? formatShare(Math.round((part * 10_000) / total)) : '—';
}

/** Nombre entier avec séparateurs français : « 48 752 339 ». */
export function formatCount(value: number): string {
  return integer.format(value);
}

/** Axe économique (−100 gauche … +100 droite) et sociétal (−100 progressiste … +100 conservateur). */
export function describePosition(position: { economie: number; societe: number }): string {
  const axis = (value: number, left: string, right: string) =>
    value === 0 ? 'centre' : `${value < 0 ? left : right} ${Math.abs(value)}`;
  return `économie : ${axis(position.economie, 'gauche', 'droite')} · société : ${axis(position.societe, 'progressiste', 'conservateur')}`;
}
