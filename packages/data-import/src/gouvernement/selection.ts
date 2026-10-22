// Sélection éditoriale des figures politiques proposées pour le gouvernement (phase 11,
// demande 2 de l'utilisateur du 22/10/2026). Chaque fiche est vérifiée à l'import : article
// Wikipédia avec une infobox de fonctions, appartenance actuelle au parti dans Wikidata (P102,
// sans date de fin), parti noté par l'enquête CHES 2024 (ou ancien parti attesté), groupe de
// l'Assemblée nationale connu. Sinon l'import échoue et la sélection est à revoir.

export const DECISION =
  'Demande de l’utilisateur du 22/10/2026 (phase 11) : figures clés des partis, nominables au gouvernement, dont Jordan Bardella et Jean-Philippe Tanguy. Sélection éditoriale : responsables nationaux (présidence de parti ou de groupe parlementaire, anciens Premiers ministres ou ministres) des partis représentés par un groupe à l’Assemblée nationale ; les personnalités candidates à la présidentielle sont nominables comme acteurs de la partie et ne figurent pas ici. Fonctions relevées dans les articles ; compétence estimée et notoriété déduites par des règles documentées ; aucun propos attribué ; nominations, refus et action au gouvernement simulés.';

/** Vague de l'enquête CHES utilisée pour la position des partis. */
export const VAGUE = 2024;

export type FigurePosition =
  | { methode: 'parti'; ches: string }
  /** Parti actuel absent de l'enquête : ancien parti attesté par Wikidata (P102). */
  | { methode: 'ancien_parti'; ches: string; partiWikidata: string };

export type FigureSelection = {
  id: string;
  /** Titre de l'article Wikipédia en français. */
  article: string;
  prenom: string;
  nom: string;
  /** Parti affiché. */
  parti: string;
  /** Titre de l'article du parti tel que Wikidata le rattache (appartenance sans date de fin). */
  partiWikidata: string;
  position: FigurePosition;
  /** Groupe de l'Assemblée nationale associé au parti (identifiant de assemblee-2026.json). */
  groupe: string | null;
};

const RN = {
  parti: 'Rassemblement national',
  partiWikidata: 'Rassemblement national',
  position: { methode: 'parti', ches: 'RN' },
  groupe: 'rn',
} as const;
const LFI = {
  parti: 'La France insoumise',
  partiWikidata: 'La France insoumise',
  position: { methode: 'parti', ches: 'FI' },
  groupe: 'lfi-nfp',
} as const;
const RE = {
  parti: 'Renaissance',
  partiWikidata: 'Renaissance (parti)',
  position: { methode: 'parti', ches: 'RE' },
  groupe: 'epr',
} as const;
const PS = {
  parti: 'Parti socialiste',
  partiWikidata: 'Parti socialiste (France)',
  position: { methode: 'parti', ches: 'PS' },
  groupe: 'soc',
} as const;
const LR = {
  parti: 'Les Républicains',
  partiWikidata: 'Les Républicains',
  position: { methode: 'parti', ches: 'LR' },
  groupe: 'dr',
} as const;
const LE = {
  parti: 'Les Écologistes',
  partiWikidata: 'Les Écologistes',
  position: { methode: 'parti', ches: 'LE/EELV' },
  groupe: 'ecos',
} as const;
const MODEM = {
  parti: 'Mouvement démocrate',
  partiWikidata: 'Mouvement démocrate (France)',
  position: { methode: 'parti', ches: 'MoDem' },
  groupe: 'dem',
} as const;
const HORIZONS = {
  parti: 'Horizons',
  partiWikidata: 'Horizons',
  position: { methode: 'parti', ches: 'Horizons' },
  groupe: 'hor',
} as const;
const PCF = {
  parti: 'Parti communiste français',
  partiWikidata: 'Parti communiste français',
  position: { methode: 'parti', ches: 'PCF' },
  groupe: 'gdr',
} as const;

const figure = (
  id: string,
  prenom: string,
  nom: string,
  parti: Omit<FigureSelection, 'id' | 'article' | 'prenom' | 'nom'>,
  article = `${prenom} ${nom}`,
): FigureSelection => ({ id, article, prenom, nom, ...parti });

export const SELECTION: FigureSelection[] = [
  figure('figure-bardella', 'Jordan', 'Bardella', RN),
  figure('figure-tanguy', 'Jean-Philippe', 'Tanguy', RN),
  figure('figure-chenu', 'Sébastien', 'Chenu', RN),
  figure('figure-ciotti', 'Éric', 'Ciotti', {
    parti: 'Union des droites pour la République',
    partiWikidata: 'Union des droites pour la République',
    position: { methode: 'ancien_parti', ches: 'LR', partiWikidata: 'Les Républicains' },
    groupe: 'udr',
  }),
  figure('figure-panot', 'Mathilde', 'Panot', LFI),
  figure('figure-bompard', 'Manuel', 'Bompard', LFI),
  figure('figure-coquerel', 'Éric', 'Coquerel', LFI),
  figure('figure-borne', 'Élisabeth', 'Borne', RE),
  figure('figure-darmanin', 'Gérald', 'Darmanin', RE),
  figure('figure-braun-pivet', 'Yaël', 'Braun-Pivet', RE),
  figure('figure-lecornu', 'Sébastien', 'Lecornu', RE),
  figure('figure-faure', 'Olivier', 'Faure', PS),
  figure('figure-vallaud', 'Boris', 'Vallaud', PS),
  figure('figure-delga', 'Carole', 'Delga', PS),
  figure('figure-wauquiez', 'Laurent', 'Wauquiez', LR),
  figure('figure-pecresse', 'Valérie', 'Pécresse', LR),
  figure('figure-chatelain', 'Cyrielle', 'Chatelain', LE),
  figure('figure-jadot', 'Yannick', 'Jadot', LE),
  figure('figure-bayrou', 'François', 'Bayrou', MODEM),
  figure('figure-fesneau', 'Marc', 'Fesneau', MODEM),
  figure('figure-estrosi', 'Christian', 'Estrosi', HORIZONS),
  figure('figure-brossat', 'Ian', 'Brossat', PCF),
];

/**
 * Groupe de l'Assemblée nationale associé à un parti (table du jeu) : sert au rattachement des
 * personnalités candidates, d'après l'étiquette de leur fiche (une des parties de « A / B »).
 */
export const GROUPE_PAR_PARTI: Record<string, string> = {
  'Rassemblement national': 'rn',
  Renaissance: 'epr',
  'La France insoumise': 'lfi-nfp',
  'Parti socialiste': 'soc',
  'Les Républicains': 'dr',
  'Les Écologistes': 'ecos',
  'Mouvement démocrate': 'dem',
  Horizons: 'hor',
  'Parti communiste français': 'gdr',
  'Union des droites pour la République': 'udr',
};

/** Seuil (députés du groupe) au-delà duquel la direction du parti vaut le niveau 3 de notoriété. */
export const GRAND_GROUPE = 60;

export const METHODE = {
  fonctions:
    'Fonctions de l’infobox « Personnalité politique » de l’article Wikipédia (révision importée), avec leurs dates. Nature déduite du libellé : Premier ministre ; ministre ou garde des Sceaux ; secrétaire d’État ou ministre délégué ; mandat parlementaire (député, sénateur, député européen) ; exécutif local (maire, présidence d’un conseil régional, départemental ou général, d’une métropole ou d’une communauté) ; direction (présidence ou secrétariat national d’un parti, présidence d’un groupe, d’une assemblée, d’une commission, d’une association d’élus) ; autre.',
  competence:
    'Estimation de jeu, sans prétention de mesure : 0,30 ; + 0,30 si Premier ministre ; + 0,15 pour une fonction de ministre et + 0,05 par fonction de ministre supplémentaire (plafond + 0,25) ; + 0,05 par fonction de secrétaire d’État ou de ministre délégué (plafond + 0,10) ; + 0,05 à partir de 5 ans de mandats parlementaires cumulés, + 0,10 à partir de 10 ans ; + 0,05 pour un exécutif local ; + 0,05 pour une fonction de direction ; plafond 0,90.',
  notoriete:
    'Niveau 3 : Premier ministre (en fonction ou ancien), ou direction nationale en cours d’un parti dont le groupe compte au moins 60 députés. Niveau 2 : ministre, secrétaire d’État ou ministre délégué (en fonction ou ancien), autre fonction de direction en cours, ou présidence en cours d’un conseil régional. Niveau 1 : autres. Le jeu en tire une popularité de départ (hypothèse, jamais un sondage).',
  position:
    'Position du parti dans l’enquête d’experts Chapel Hill 2024, convertie par (x − 5) × 20 sur chaque axe (économie = lrecon, société = galtan) — estimation. Parti actuel absent de l’enquête : position de l’ancien parti dont Wikidata atteste l’appartenance (P102) — hypothèse.',
  groupe:
    'Groupe de l’Assemblée nationale associé au parti (table du jeu, composition du 19/10/2026) ; pour les personnalités candidates, d’après l’étiquette de leur fiche. Une personnalité sans parti associé à un groupe n’apporte le soutien d’aucun groupe.',
};
