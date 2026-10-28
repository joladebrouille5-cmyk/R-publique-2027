// Sélection éditoriale des figures politiques proposées pour le gouvernement (phase 11,
// demande 2 de l'utilisateur du 22/10/2026 ; vivier élargi en phase 14, demande du 28/10/2026).
// Chaque fiche est vérifiée à l'import : article Wikipédia avec une infobox de fonctions,
// personne vivante (Wikidata), parti en cours suivi par le jeu d'après le champ « parti » de
// l'infobox (sinon « Sans étiquette » avec la position du dernier parti suivi quitté), parti noté
// par l'enquête CHES 2024 (ou ancien parti attesté), groupe de l'Assemblée nationale connu. Une
// fiche qui ne passe pas ces contrôles est écartée avec son motif (liste publiée dans le fichier
// produit) ; elle ne fait pas échouer l'import.

export const DECISION =
  'Demandes de l’utilisateur du 22/10/2026 (phase 11 : figures clés des partis, dont Jordan Bardella et Jean-Philippe Tanguy) et du 28/10/2026 (phase 14 : « augmenter significativement le nombre de personnalités politiques présentes avec leurs photos », pour les ministères et les législatives). Sélection éditoriale : membres du gouvernement en fonction (article « Gouvernement Lecornu II », révision 240680163), anciens Premiers ministres et ministres encore actifs, dirigeants nationaux et présidents de groupe (Assemblée nationale et Sénat) des partis suivis par le jeu ; les personnalités candidates à la présidentielle sont nominables comme acteurs de la partie et ne figurent pas ici. Fonctions et parti relevés dans l’infobox des articles ; compétence estimée et notoriété déduites par des règles documentées ; aucun propos attribué ; nominations, refus et action au gouvernement simulés.';

/** Vague de l'enquête CHES utilisée pour la position des partis. */
export const VAGUE = 2024;

export type FigurePosition =
  | { methode: 'parti'; ches: string }
  /** Parti actuel absent de l'enquête : ancien parti (article) attesté par l'infobox. */
  | { methode: 'ancien_parti'; ches: string; ancien: string };

/** Parti suivi par le jeu : affichage, articles qui le désignent, position, groupe. */
export type PartyConfig = {
  /** Parti affiché. */
  parti: string;
  /**
   * Articles Wikipédia qui désignent le parti dans le champ « parti » des infobox : nom actuel,
   * anciens noms du même parti et redirections (« Front national », « La République en marche »).
   */
  articles: readonly string[];
  position: FigurePosition;
  /** Groupe de l'Assemblée nationale associé au parti (identifiant de assemblee-2026.json). */
  groupe: string | null;
};

/** Personnalité retenue par la sélection : identité seulement, le parti vient de l'infobox. */
export type FigureSelection = {
  id: string;
  /** Titre de l'article Wikipédia en français. */
  article: string;
  prenom: string;
  nom: string;
  /**
   * Photo choisie à la main après revue visuelle (fichier de Wikimedia Commons, sans le préfixe
   * « File: ») et motif du choix ; sa licence est vérifiée comme celle des autres candidates.
   */
  photo?: { fichier: string; motif: string };
};

/**
 * Fiche résolue : identité, parti suivi et groupe ; `ancienParti` pour une personne sans parti en
 * cours (« Sans étiquette »), dont la position est celle du dernier parti suivi quitté.
 */
export type ResolvedFigure = FigureSelection & {
  parti: string;
  groupe: string | null;
  position: FigurePosition;
  ancienParti: { parti: string; periode: string | null } | null;
};

/** Parti affiché d'une personne sans parti en cours d'après l'infobox. */
export const SANS_ETIQUETTE = 'Sans étiquette';

const RN: PartyConfig = {
  parti: 'Rassemblement national',
  articles: ['Rassemblement national', 'Front national'],
  position: { methode: 'parti', ches: 'RN' },
  groupe: 'rn',
};
const LFI: PartyConfig = {
  parti: 'La France insoumise',
  articles: ['La France insoumise'],
  position: { methode: 'parti', ches: 'FI' },
  groupe: 'lfi-nfp',
};
const RE: PartyConfig = {
  parti: 'Renaissance',
  articles: [
    'Renaissance (parti)',
    'La République en marche',
    'La République en marche !',
    'En marche',
    'En marche !',
  ],
  position: { methode: 'parti', ches: 'RE' },
  groupe: 'epr',
};
const PS: PartyConfig = {
  parti: 'Parti socialiste',
  articles: ['Parti socialiste (France)'],
  position: { methode: 'parti', ches: 'PS' },
  groupe: 'soc',
};
const LR: PartyConfig = {
  parti: 'Les Républicains',
  articles: ['Les Républicains'],
  position: { methode: 'parti', ches: 'LR' },
  groupe: 'dr',
};
const LE: PartyConfig = {
  parti: 'Les Écologistes',
  articles: ['Les Écologistes', 'Europe Écologie Les Verts', 'Europe Écologie'],
  position: { methode: 'parti', ches: 'LE/EELV' },
  groupe: 'ecos',
};
const MODEM: PartyConfig = {
  parti: 'Mouvement démocrate',
  articles: ['Mouvement démocrate (France)', 'Mouvement démocrate'],
  position: { methode: 'parti', ches: 'MoDem' },
  groupe: 'dem',
};
const HORIZONS: PartyConfig = {
  parti: 'Horizons',
  articles: ['Horizons', 'Horizons (parti politique)'],
  position: { methode: 'parti', ches: 'Horizons' },
  groupe: 'hor',
};
const PCF: PartyConfig = {
  parti: 'Parti communiste français',
  articles: ['Parti communiste français'],
  position: { methode: 'parti', ches: 'PCF' },
  groupe: 'gdr',
};
const UDR: PartyConfig = {
  parti: 'Union des droites pour la République',
  articles: ['Union des droites pour la République'],
  position: { methode: 'ancien_parti', ches: 'LR', ancien: 'Les Républicains' },
  groupe: 'udr',
};
const REC: PartyConfig = {
  parti: 'Reconquête',
  articles: ['Reconquête (parti politique)', 'Reconquête !', 'Reconquête'],
  position: { methode: 'parti', ches: 'REC' },
  groupe: null,
};

/** Partis suivis par le jeu (positions dans l'enquête CHES 2024, groupe de l'Assemblée). */
export const PARTIS: readonly PartyConfig[] = [
  RN,
  UDR,
  REC,
  LR,
  HORIZONS,
  MODEM,
  RE,
  PS,
  LE,
  LFI,
  PCF,
];

const figure = (
  id: string,
  prenom: string,
  nom: string,
  options: { article?: string; photo?: { fichier: string; motif: string } } = {},
): FigureSelection => ({
  id,
  article: options.article ?? `${prenom} ${nom}`,
  prenom,
  nom,
  ...(options.photo ? { photo: options.photo } : {}),
});

export const SELECTION: FigureSelection[] = [
  // Phase 11 : figures clés des partis.
  figure('figure-bardella', 'Jordan', 'Bardella', {
    photo: {
      fichier: 'Jordan Bardella - Strasbourg European Parliament September 2022 (Cropped).jpg',
      motif: 'portrait de face ; la photo retenue par défaut est une scène de groupe',
    },
  }),
  figure('figure-tanguy', 'Jean-Philippe', 'Tanguy', {
    photo: {
      fichier: 'J-P. Tanguy en 2025.jpg',
      motif: 'photo récente (2025), visage lisible ; celle de Wikidata est un plan en pied',
    },
  }),
  figure('figure-chenu', 'Sébastien', 'Chenu'),
  figure('figure-ciotti', 'Éric', 'Ciotti'),
  figure('figure-panot', 'Mathilde', 'Panot'),
  figure('figure-bompard', 'Manuel', 'Bompard', {
    photo: {
      fichier: 'Manuel Bompard 20181222.jpg',
      motif: 'portrait de face ; la photo retenue par défaut est prise dans une manifestation',
    },
  }),
  figure('figure-coquerel', 'Éric', 'Coquerel'),
  figure('figure-borne', 'Élisabeth', 'Borne'),
  figure('figure-darmanin', 'Gérald', 'Darmanin'),
  figure('figure-braun-pivet', 'Yaël', 'Braun-Pivet'),
  figure('figure-lecornu', 'Sébastien', 'Lecornu'),
  figure('figure-faure', 'Olivier', 'Faure'),
  figure('figure-vallaud', 'Boris', 'Vallaud'),
  figure('figure-delga', 'Carole', 'Delga'),
  figure('figure-wauquiez', 'Laurent', 'Wauquiez'),
  figure('figure-pecresse', 'Valérie', 'Pécresse'),
  figure('figure-chatelain', 'Cyrielle', 'Chatelain'),
  figure('figure-jadot', 'Yannick', 'Jadot'),
  figure('figure-bayrou', 'François', 'Bayrou'),
  figure('figure-fesneau', 'Marc', 'Fesneau'),
  figure('figure-estrosi', 'Christian', 'Estrosi'),
  figure('figure-brossat', 'Ian', 'Brossat'),

  // Phase 14 — membres du gouvernement Lecornu II (révision 240680163 de l'article).
  figure('figure-nunez', 'Laurent', 'Nuñez'),
  figure('figure-vautrin', 'Catherine', 'Vautrin'),
  figure('figure-farandou', 'Jean-Pierre', 'Farandou'),
  figure('figure-barbut', 'Monique', 'Barbut'),
  figure('figure-lescure', 'Roland', 'Lescure'),
  figure('figure-papin', 'Serge', 'Papin'),
  figure('figure-genevard', 'Annie', 'Genevard'),
  figure('figure-geffray', 'Édouard', 'Geffray'),
  figure('figure-barrot', 'Jean-Noël', 'Barrot'),
  figure('figure-dati', 'Rachida', 'Dati'),
  figure('figure-rist', 'Stéphanie', 'Rist', {
    photo: {
      fichier: 'Rist Ministère Santé (cropped).jpg',
      motif: 'portrait recadré ; la photo de Wikidata est un plan large',
    },
  }),
  figure('figure-moutchou', 'Naïma', 'Moutchou'),
  figure('figure-gatel', 'Françoise', 'Gatel'),
  figure('figure-montchalin', 'Amélie', 'de Montchalin'),
  figure('figure-baptiste', 'Philippe', 'Baptiste'),
  figure('figure-ferrari', 'Marina', 'Ferrari'),
  figure('figure-tabarot', 'Philippe', 'Tabarot'),
  figure('figure-jeanbrun', 'Vincent', 'Jeanbrun'),
  figure('figure-panifous', 'Laurent', 'Panifous'),
  figure('figure-bregeon', 'Maud', 'Bregeon'),
  figure('figure-berge', 'Aurore', 'Bergé'),
  figure('figure-vedrenne', 'Marie-Pierre', 'Vedrenne'),
  figure('figure-rufo', 'Alice', 'Rufo'),
  figure('figure-chabaud', 'Catherine', 'Chabaud', {
    photo: {
      fichier: 'Chabaud Portrait officiel (cropped).jpg',
      motif: 'portrait officiel recadré ; la photo de Wikidata est un plan large',
    },
  }),
  figure('figure-lefevre', 'Mathieu', 'Lefèvre', {
    photo: {
      fichier: 'Mathieu Lefèvre (cropped).jpg',
      motif: 'portrait recadré ; la photo de Wikidata est un plan large d’une cérémonie',
    },
  }),
  figure('figure-sebastien-martin', 'Sébastien', 'Martin'),
  figure('figure-le-henanff', 'Anne', 'Le Hénanff'),
  figure('figure-haddad', 'Benjamin', 'Haddad'),
  figure('figure-forissier', 'Nicolas', 'Forissier'),
  figure('figure-caroit', 'Éléonore', 'Caroit'),
  figure('figure-parmentier-lecocq', 'Charlotte', 'Parmentier-Lecocq'),
  figure('figure-fournier', 'Michel', 'Fournier', { article: 'Michel Fournier (homme politique)' }),
  figure('figure-amiel', 'David', 'Amiel', {
    photo: {
      fichier: 'David-amiel (cropped).jpg',
      motif: 'version recadrée de la même photo ; celle de Wikidata est un plan en pied',
    },
  }),
  figure('figure-berger', 'Jean-Didier', 'Berger', {
    photo: {
      fichier: '10072024-P1060240 Jean-Didier-Berger-Wikipedia (cropped).jpg',
      motif: 'version recadrée de la même photo ; celle de Wikidata est un plan en pied',
    },
  }),
  figure('figure-agresti-roubache', 'Sabrina', 'Agresti-Roubache'),
  figure('figure-galliard-minier', 'Camille', 'Galliard-Minier', {
    photo: {
      fichier:
        "Camille Galliard-Minier — Discours à l'inauguration de la Tour Perret de Grenoble.jpg",
      motif: 'visage lisible ; la photo de Wikidata est une vue d’ensemble de l’hémicycle',
    },
  }),
  figure('figure-pegard', 'Catherine', 'Pégard'),

  // Anciens Premiers ministres encore actifs.
  figure('figure-barnier', 'Michel', 'Barnier'),
  figure('figure-castex', 'Jean', 'Castex', {
    photo: {
      fichier: 'Portrait Jean Castex (cropped).jpg',
      motif: 'portrait rapproché ; la photo de Wikidata est prise de loin',
    },
  }),
  figure('figure-valls', 'Manuel', 'Valls'),

  // Présidents de groupe et présidence des assemblées (Assemblée nationale, Sénat).
  figure('figure-paul-christophe', 'Paul', 'Christophe', {
    article: 'Paul Christophe (homme politique)',
  }),
  figure('figure-peu', 'Stéphane', 'Peu'),
  figure('figure-larcher', 'Gérard', 'Larcher'),
  figure('figure-darnaud', 'Mathieu', 'Darnaud'),
  figure('figure-kanner', 'Patrick', 'Kanner'),
  figure('figure-patriat', 'François', 'Patriat'),
  figure('figure-cukierman', 'Cécile', 'Cukierman'),
  figure('figure-gontard', 'Guillaume', 'Gontard', {
    photo: {
      fichier: 'Guillaume Gontard.jpg',
      motif: 'portrait rapproché ; la photo de Wikidata est un plan large',
    },
  }),
  figure('figure-malhuret', 'Claude', 'Malhuret'),
  figure('figure-marseille', 'Hervé', 'Marseille'),

  // Dirigeants et figures nationales des partis suivis.
  figure('figure-aliot', 'Louis', 'Aliot'),
  figure('figure-diaz', 'Edwige', 'Diaz'),
  figure('figure-jacobelli', 'Laurent', 'Jacobelli'),
  figure('figure-odoul', 'Julien', 'Odoul'),
  figure('figure-lavalette', 'Laure', 'Lavalette', {
    photo: {
      fichier: 'Laure Lavalette.jpg',
      motif: 'portrait ; la photo de Wikidata est un plan large',
    },
  }),
  figure('figure-ballard', 'Philippe', 'Ballard', {
    photo: {
      fichier: 'Philippe Ballard (cropped).jpg',
      motif: 'portrait recadré ; la photo de Wikidata est prise dans un cortège',
    },
  }),
  figure('figure-knafo', 'Sarah', 'Knafo'),
  figure('figure-guette', 'Clémence', 'Guetté'),
  figure('figure-trouve', 'Aurélie', 'Trouvé'),
  figure('figure-aubry', 'Manon', 'Aubry'),
  figure('figure-vannier', 'Paul', 'Vannier', { article: 'Paul Vannier (homme politique)' }),
  figure('figure-boyard', 'Louis', 'Boyard'),
  figure('figure-leaument', 'Antoine', 'Léaument', {
    photo: {
      fichier: 'Antoine Léaument le 21 juillet 2024 (cropped).jpg',
      motif: 'portrait recadré ; la photo de Wikidata est prise dans un cortège',
    },
  }),
  figure('figure-hollande', 'François', 'Hollande'),
  figure('figure-guedj', 'Jérôme', 'Guedj'),
  figure('figure-geoffroy', 'Hélène', 'Geoffroy'),
  figure('figure-mayer-rossignol', 'Nicolas', 'Mayer-Rossignol'),
  figure('figure-rolland', 'Johanna', 'Rolland'),
  figure('figure-jouvet', 'Pierre', 'Jouvet'),
  figure('figure-vallaud-belkacem', 'Najat', 'Vallaud-Belkacem'),
  figure('figure-hidalgo', 'Anne', 'Hidalgo'),
  figure('figure-rousseau', 'Sandrine', 'Rousseau'),
  figure('figure-piolle', 'Éric', 'Piolle', {
    photo: {
      fichier: 'Éric Piolle en juin 2024.jpg',
      motif: 'photo récente (2024), visage lisible ; celle de Wikidata est un plan en pied',
    },
  }),
  figure('figure-doucet', 'Grégory', 'Doucet', {
    photo: {
      fichier: 'Grégory Doucet (cropped) (cropped).jpg',
      motif: 'portrait recadré ; la photo de Wikidata est un plan large',
    },
  }),
  figure('figure-toussaint', 'Marie', 'Toussaint', {
    photo: {
      fichier: '20220125 toussaint marie 9418b (cropped).jpg',
      motif:
        'portrait ; la photo retenue par défaut est un plan large dans l’hémicycle du Parlement européen',
    },
  }),
  figure('figure-bellamy', 'François-Xavier', 'Bellamy'),
  figure('figure-juvin', 'Philippe', 'Juvin'),
  figure('figure-cope', 'Jean-François', 'Copé'),
  figure('figure-neuder', 'Yannick', 'Neuder'),
  figure('figure-sejourne', 'Stéphane', 'Séjourné'),
  figure('figure-pannier-runacher', 'Agnès', 'Pannier-Runacher'),
  figure('figure-thevenot', 'Prisca', 'Thevenot'),
  figure('figure-veran', 'Olivier', 'Véran'),
  figure('figure-beaune', 'Clément', 'Beaune'),
  figure('figure-le-maire', 'Bruno', 'Le Maire'),
  figure('figure-hayer', 'Valérie', 'Hayer'),
  figure('figure-saint-martin', 'Laurent', 'Saint-Martin'),
  figure('figure-ferracci', 'Marc', 'Ferracci'),
  figure('figure-darrieussecq', 'Geneviève', 'Darrieussecq'),
  figure('figure-el-hairy', 'Sarah', 'El Haïry'),
  figure('figure-mignola', 'Patrick', 'Mignola'),
  figure('figure-bechu', 'Christophe', 'Béchu'),
  figure('figure-firmin-le-bodo', 'Agnès', 'Firmin Le Bodo', {
    article: 'Agnès Firmin-Le Bodo',
  }),
  figure('figure-valletoux', 'Frédéric', 'Valletoux'),
  figure('figure-marcangeli', 'Laurent', 'Marcangeli'),
  figure('figure-chassaigne', 'André', 'Chassaigne'),
  figure('figure-deffontaines', 'Léon', 'Deffontaines', {
    photo: {
      fichier: 'Léon Deffontaines 2023.jpg',
      motif: 'visage lisible ; la photo de Wikidata est un plan large',
    },
  }),
  figure('figure-pierre-laurent', 'Pierre', 'Laurent', {
    article: 'Pierre Laurent (homme politique)',
  }),
];

/**
 * Groupe de l'Assemblée nationale associé à un parti (table du jeu) : sert au rattachement des
 * personnalités candidates, d'après l'étiquette de leur fiche (une des parties de « A / B »).
 */
export const GROUPE_PAR_PARTI: Record<string, string> = Object.fromEntries(
  PARTIS.filter((p) => p.groupe !== null).map((p) => [p.parti, p.groupe!]),
);

/** Seuil (députés du groupe) au-delà duquel la direction du parti vaut le niveau 3 de notoriété. */
export const GRAND_GROUPE = 60;

export const METHODE = {
  fonctions:
    'Fonctions de l’infobox « Personnalité politique » de l’article Wikipédia (révision importée), avec leurs dates ; un libellé sur plusieurs lignes est lu en une phrase, et un retour à la ligne suivi d’un second titre (ministre, garde des Sceaux, porte-parole, secrétaire, président…) devient une virgule. Nature déduite du libellé : présidence de la République ; Premier ministre ; ministre ou garde des Sceaux ; secrétaire d’État ou ministre délégué ; mandat parlementaire (député, sénateur, député européen) ; exécutif local (maire, présidence d’un conseil régional, départemental ou général, d’une métropole ou d’une communauté) ; direction (présidence ou secrétariat national d’un parti, présidence d’un groupe, d’une assemblée, d’une commission, d’une association d’élus) ; autre.',
  competence:
    'Estimation de jeu, sans prétention de mesure : 0,30 ; + 0,30 si président de la République ou Premier ministre (en fonction ou ancien) ; + 0,15 pour une fonction de ministre et + 0,05 par fonction de ministre supplémentaire (plafond + 0,25) ; + 0,05 par fonction de secrétaire d’État ou de ministre délégué (plafond + 0,10) ; + 0,05 à partir de 5 ans de mandats parlementaires cumulés, + 0,10 à partir de 10 ans ; + 0,05 pour un exécutif local ; + 0,05 pour une fonction de direction ; plafond 0,90.',
  notoriete:
    'Niveau 3 : président de la République ou Premier ministre (en fonction ou ancien), ou direction nationale en cours d’un parti dont le groupe compte au moins 60 députés. Niveau 2 : ministre, secrétaire d’État ou ministre délégué (en fonction ou ancien), autre fonction de direction en cours, ou présidence en cours d’un conseil régional. Niveau 1 : autres. Le jeu en tire une popularité de départ (hypothèse, jamais un sondage).',
  position:
    'Position du parti dans l’enquête d’experts Chapel Hill 2024, convertie par (x − 5) × 20 sur chaque axe (économie = lrecon, société = galtan) — estimation. Parti actuel absent de l’enquête (Union des droites pour la République) : position de l’ancien parti attesté par l’infobox — hypothèse. Personne sans parti en cours (« Sans étiquette ») : position du dernier parti suivi qu’elle a quitté, d’après l’infobox — hypothèse.',
  groupe:
    'Groupe de l’Assemblée nationale associé au parti (table du jeu, composition du 19/10/2026) ; pour les personnalités candidates, d’après l’étiquette de leur fiche. Une personnalité sans parti associé à un groupe n’apporte le soutien d’aucun groupe.',
  parti:
    'Champ « parti » de l’infobox de l’article (révision importée), plus à jour que Wikidata pour la vie politique française. Chaque ligne cite un ou plusieurs partis (liens vers leurs articles, anciens noms compris : Front national, La République en marche, Europe Écologie Les Verts) et une période ; elle est en cours si sa période porte « depuis » ou si elle n’a pas de période (« A puis B » : A est close). Parti retenu : le dernier parti suivi par le jeu cité dans une ligne en cours (Rassemblement national, Union des droites pour la République, Reconquête, Les Républicains, Horizons, Mouvement démocrate, Renaissance, Parti socialiste, Les Écologistes, La France insoumise, Parti communiste français). Aucune ligne en cours : « Sans étiquette », sans groupe, position du dernier parti suivi quitté. Fiche écartée : parti en cours non suivi par le jeu, aucun parti suivi dans l’infobox, personne décédée (Wikidata, P570), article sans infobox de fonctions ou page d’homonymie.',
  photo:
    'Photo choisie à la main après revue visuelle (motif consigné) quand il y en a une, sinon photos de Wikidata (P18 ; rang préféré d’abord, toutes essayées), sinon fichiers de la catégorie Commons de la personne (P373) dont le titre porte son nom et n’annonce pas plusieurs personnes (année la plus récente d’abord). Licence et auteur lus dans les métadonnées de Wikimedia Commons (API imageinfo) ; seule une licence libre reconnue est acceptée (auteur et licence affichés), pour une image JPEG, PNG ou WebP d’au moins 150 pixels de large. Photos réduites (240 pixels de large au plus, WebP), métadonnées retirées, revues une à une sur une planche contact. À défaut, la fiche affiche les initiales et le motif.',
};
