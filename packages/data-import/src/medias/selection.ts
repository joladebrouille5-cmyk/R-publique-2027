// Sélection des médias réels (phase 5 ter) : organes retenus avec leur libellé dans chaque
// source, émissions politiques examinées et motifs des titres de presse non retenus. Toute
// modification de cette liste impose une réimportation et une nouvelle version du jeu de règles.
import type { RealMediaType } from '@r2027/shared';

export const DECISION =
  'Décision de l’utilisateur du 21/10/2026 : médias réels (presse, télévision, radio), comportement des chaînes de télévision et de radio fondé sur les temps de parole mesurés par l’Arcom, presse écrite identique pour tous les candidats, émissions politiques réelles avec leur chaîne et leurs présentateurs (interviews simulées, aucun propos attribué), logos seulement sous licence libre.';

export type AudienceSource = 'mediamat' | 'ear' | 'onenext-pqn' | 'onenext-pqr';

export type OutletSelection = {
  id: string;
  libelle: string;
  type: RealMediaType;
  portee: 'nationale' | 'regionale';
  /** Titre de l'article Wikipédia (infobox : logo). */
  article: string;
  /** Libellé du service dans les relevés de l'Arcom (télévision et radio). */
  arcom: string | null;
  audience: { source: AudienceSource; libelle: string };
};

export const OUTLETS: readonly OutletSelection[] = [
  {
    id: 'tf1',
    libelle: 'TF1',
    type: 'television',
    portee: 'nationale',
    article: 'TF1',
    arcom: 'TF1',
    audience: { source: 'mediamat', libelle: 'TF1' },
  },
  {
    id: 'france-2',
    libelle: 'France 2',
    type: 'television',
    portee: 'nationale',
    article: 'France 2',
    arcom: 'France 2',
    audience: { source: 'mediamat', libelle: 'FRANCE 2' },
  },
  {
    id: 'france-3',
    libelle: 'France 3',
    type: 'television',
    portee: 'nationale',
    article: 'France 3',
    arcom: 'France 3',
    audience: { source: 'mediamat', libelle: 'FRANCE 3' },
  },
  {
    id: 'france-5',
    libelle: 'France 5',
    type: 'television',
    portee: 'nationale',
    article: 'France 5',
    arcom: 'France 5',
    audience: { source: 'mediamat', libelle: 'FRANCE 5' },
  },
  {
    id: 'm6',
    libelle: 'M6',
    type: 'television',
    portee: 'nationale',
    article: 'M6',
    arcom: 'M6',
    audience: { source: 'mediamat', libelle: 'M6' },
  },
  {
    id: 'tmc',
    libelle: 'TMC',
    type: 'television',
    portee: 'nationale',
    article: 'TMC (chaîne de télévision)',
    arcom: 'TMC',
    audience: { source: 'mediamat', libelle: 'TMC' },
  },
  {
    id: 'bfmtv',
    libelle: 'BFMTV',
    type: 'television',
    portee: 'nationale',
    article: 'BFM TV',
    arcom: 'BFMTV',
    audience: { source: 'mediamat', libelle: 'BFM TV' },
  },
  {
    id: 'cnews',
    libelle: 'CNews',
    type: 'television',
    portee: 'nationale',
    article: 'CNews',
    arcom: 'CNews',
    audience: { source: 'mediamat', libelle: 'CNEWS' },
  },
  {
    id: 'lci',
    libelle: 'LCI',
    type: 'television',
    portee: 'nationale',
    article: 'LCI',
    arcom: 'LCI',
    audience: { source: 'mediamat', libelle: 'LCI' },
  },
  {
    id: 'franceinfo-tv',
    libelle: 'France Info (télévision)',
    type: 'television',
    portee: 'nationale',
    article: 'France Info (chaîne de télévision)',
    arcom: 'franceinfo:',
    audience: { source: 'mediamat', libelle: 'FRANCEINFO:' },
  },
  {
    id: 'rmc-story',
    libelle: 'RMC Story',
    type: 'television',
    portee: 'nationale',
    article: 'RMC Story',
    arcom: 'RMC Story',
    audience: { source: 'mediamat', libelle: 'RMC STORY' },
  },
  {
    id: 't18',
    libelle: 'T18',
    type: 'television',
    portee: 'nationale',
    article: 'T18 (chaîne de télévision)',
    arcom: 'T18',
    audience: { source: 'mediamat', libelle: 'T18' },
  },
  {
    id: 'france-inter',
    libelle: 'France Inter',
    type: 'radio',
    portee: 'nationale',
    article: 'France Inter',
    arcom: 'France Inter',
    audience: { source: 'ear', libelle: 'FRANCE INTER' },
  },
  {
    id: 'franceinfo-radio',
    libelle: 'France Info (radio)',
    type: 'radio',
    portee: 'nationale',
    article: 'France Info',
    arcom: 'France Info',
    audience: { source: 'ear', libelle: 'FRANCE INFO' },
  },
  {
    id: 'rtl',
    libelle: 'RTL',
    type: 'radio',
    portee: 'nationale',
    article: 'RTL',
    arcom: 'RTL',
    audience: { source: 'ear', libelle: 'RTL' },
  },
  {
    id: 'rmc',
    libelle: 'RMC',
    type: 'radio',
    portee: 'nationale',
    article: 'RMC',
    arcom: 'RMC',
    audience: { source: 'ear', libelle: 'RMC' },
  },
  {
    id: 'europe-1',
    libelle: 'Europe 1',
    type: 'radio',
    portee: 'nationale',
    article: 'Europe 1',
    arcom: 'Europe 1',
    audience: { source: 'ear', libelle: 'EUROPE 1' },
  },
  {
    id: 'france-culture',
    libelle: 'France Culture',
    type: 'radio',
    portee: 'nationale',
    article: 'France Culture',
    arcom: 'France Culture',
    audience: { source: 'ear', libelle: 'FRANCE CULTURE' },
  },
  {
    id: 'le-parisien',
    libelle: 'Le Parisien / Aujourd’hui en France',
    type: 'presse',
    portee: 'nationale',
    article: 'Le Parisien',
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: "Le Parisien / Aujourd'hui en France" },
  },
  {
    id: 'le-monde',
    libelle: 'Le Monde',
    type: 'presse',
    portee: 'nationale',
    article: 'Le Monde',
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: 'Le Monde' },
  },
  {
    id: 'le-figaro',
    libelle: 'Le Figaro',
    type: 'presse',
    portee: 'nationale',
    article: 'Le Figaro',
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: 'Le Figaro' },
  },
  {
    id: 'liberation',
    libelle: 'Libération',
    type: 'presse',
    portee: 'nationale',
    article: 'Libération (journal)',
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: 'Libération' },
  },
  {
    id: 'les-echos',
    libelle: 'Les Échos',
    type: 'presse',
    portee: 'nationale',
    article: 'Les Échos',
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: 'Les Echos' },
  },
  {
    id: 'la-croix',
    libelle: 'La Croix',
    type: 'presse',
    portee: 'nationale',
    article: 'La Croix',
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: 'La Croix' },
  },
  {
    id: 'l-humanite',
    libelle: 'L’Humanité',
    type: 'presse',
    portee: 'nationale',
    article: "L'Humanité",
    arcom: null,
    audience: { source: 'onenext-pqn', libelle: "L'Humanité" },
  },
  {
    id: 'pqr',
    libelle: 'Presse quotidienne régionale (66 titres)',
    type: 'presse',
    portee: 'regionale',
    article: 'Presse quotidienne régionale',
    arcom: null,
    audience: { source: 'onenext-pqr', libelle: 'PQR66' },
  },
];

/** Lignes du classement de la presse quotidienne nationale non retenues, avec le motif. */
export const PQN_EXCLUSIONS: Readonly<Record<string, string>> = {
  'Total PQN': 'total de la catégorie, pas un titre',
  "L'Equipe": 'quotidien sportif',
  'Le Parisien IDFO':
    'édition Île-de-France et Oise, déjà comprise dans Le Parisien / Aujourd’hui en France',
};

/** Motif commun des lignes du classement de la presse régionale autres que l'agrégat PQR66. */
export const PQR_EXCLUSION =
  'titres et groupes régionaux, représentés par l’agrégat PQR66 du même classement';

/**
 * Articles Wikipédia d'émissions d'entretien ou de débat politique examinés. Une émission est
 * retenue si sa source la présente comme toujours diffusée, sur un organe retenu, avec au moins
 * un présentateur ; l'import échoue si un article examiné n'indique ni chaîne ni présentateur.
 */
export const SHOW_ARTICLES: readonly string[] = [
  'C politique',
  "L'Événement (émission politique)",
  "L'Heure de vérité",
  'Les Quatre Vérités (émission de télévision)',
  'Vie politique',
  "L'Heure des pros",
  'Questions politiques',
  'Le Grand Jury',
  'Le Grand Rendez-vous (émission de radio)',
];

/** Seuil de suivi d'un parti : temps cumulé sur l'ensemble des services retenus (secondes). */
export const SEUIL_PARTI_SECONDES = 10 * 3600;

/** Seuil de retenue d'un service : temps de parole moyen par mois (exécutif et partis, secondes). */
export const SEUIL_SERVICE_SECONDES_PAR_MOIS = 3600;

/** Nombre de mois de la période de référence des temps de parole. */
export const MOIS_REFERENCE = 12;

/** Méthode publiée avec les données (fichier importé, écran des médias). */
export const METHODE = {
  selection:
    'Télévision et radio : services dont l’Arcom publie les temps de parole, avec au moins une heure par mois en moyenne sur la période de référence (pouvoir exécutif et partis) et une part d’audience publiée par Médiamétrie (Médiamat mensuel, EAR National). Presse : quotidiens nationaux d’information générale et politique du classement OneNext de l’ACPM et agrégat de la presse quotidienne régionale (PQR66).',
  audience:
    'Mesure publiée reprise telle quelle : part d’audience mensuelle des individus de 4 ans et plus (Médiamat), part d’audience du lundi au vendredi des 13 ans et plus (EAR National), lecteurs au numéro moyen (OneNext). Dans le jeu, chaque organe pèse selon sa part dans l’audience cumulée des organes retenus de son type ; le poids relatif des types est une hypothèse de jeu (jeu de règles).',
  tempsDeParole:
    'Temps de parole des partis politiques relevés chaque mois par l’Arcom, cumulés sur la période de référence ; le temps du pouvoir exécutif (président de la République et gouvernement) est affiché à part et n’entre pas dans les parts. Partis suivis : au moins dix heures cumulées sur l’ensemble des services retenus ; les autres sont réunis.',
  propension:
    'Estimation : part du parti sur le service divisée par sa part sur l’ensemble des services retenus (1 : exposition moyenne). Elle décrit l’exposition observée sur la période, pas une ligne éditoriale. Un candidat sans parti suivi reçoit l’exposition moyenne (hypothèse de jeu) ; la presse écrite, non mesurée, traite tous les candidats de la même façon.',
  emissions:
    'Émissions d’entretien ou de débat politique dont l’article Wikipédia (révision consultée) indique la chaîne ou la station, les présentateurs et une diffusion en cours. Seuls ces faits sont repris ; les interviews dans la partie sont simulées et aucune question ni aucun propos n’est attribué aux journalistes.',
  logos:
    'Logo de l’infobox de l’article, repris seulement si le fichier est sur Wikimedia Commons sous licence libre ou dans le domaine public, avec son auteur ; sinon le nom du média est affiché en texte. Un logo reste une marque de son titulaire.',
} as const;
