// Sélection éditoriale des personnalités réelles, décidée par l'utilisateur le 21/10/2026
// (question Q2, phase 5 bis) : candidatures déclarées dont le parti est noté par l'enquête
// d'experts Chapel Hill (CHES), plus Nathalie Arthaud, François Asselineau, David Lisnard et
// François Ruffin, demandés explicitement, avec une position « hypothèse » à rattachement
// documenté. Chaque fait cité ici doit figurer mot pour mot dans la ligne de la personnalité
// (texte lisible de la révision importée), sinon l'import échoue.

import type { RealPersonality } from '@r2027/shared';

export const DECISION =
  'Décision de l’utilisateur du 21/10/2026 : personnalités réelles jouables et adversaires ; candidatures déclarées seulement ; photos sous licence libre créditées ; position d’après l’enquête d’experts Chapel Hill (CHES) ; candidatures dont aucun parti n’est noté par CHES non intégrées, sauf Nathalie Arthaud, François Asselineau, David Lisnard et François Ruffin (position « hypothèse ») ; décision du 10/11/2026 : Teddy Riner ajouté à la main (candidature du 9 novembre 2026, sans parti, position « hypothèse »).';

export const ARTICLE = "Candidatures à l'élection présidentielle française de 2027";
export const SECTION_PRINCIPALE = 'Candidats déclarés';
export const SECTION_PRIMAIRE = "Candidats déclarés dans le cadre d'une primaire";

/**
 * Groupes de l'Assemblée nationale (députés en exercice, fichier de l'Assemblée du 19/10/2026 :
 * docs/SOURCES.md §7) et parti correspondant (étiquette de la source).
 */
export const GROUPES: Record<string, { groupe: string; deputes: number }> = {
  'Rassemblement national': { groupe: 'RN', deputes: 121 },
  Renaissance: { groupe: 'EPR', deputes: 90 },
  'La France insoumise': { groupe: 'LFI-NFP', deputes: 70 },
  'Parti socialiste': { groupe: 'SOC', deputes: 68 },
  'Les Républicains': { groupe: 'DR', deputes: 47 },
  'Les Écologistes': { groupe: 'EcoS', deputes: 38 },
  Horizons: { groupe: 'HOR', deputes: 35 },
  'Parti communiste français': { groupe: 'GDR', deputes: 17 },
};

/** Partis notés par CHES 2024 (abréviation du fichier) : étiquette de la source → parti CHES. */
export const PARTIS_CHES: Record<string, string> = {
  'Rassemblement national': 'RN',
  Renaissance: 'RE',
  'Les Républicains': 'LR',
  'Parti socialiste': 'PS',
  'Parti communiste français': 'PCF',
  'La France insoumise': 'FI',
  'Les Écologistes': 'LE/EELV',
  Horizons: 'Horizons',
  Reconquête: 'REC',
  'Mouvement démocrate': 'MoDem',
  'Debout la France': 'DLF',
};

export type PositionChoice =
  | { methode: 'parti'; ches: string; vague: number; fait: string }
  | { methode: 'parti_soutien'; ches: string; vague: number; fait: string }
  /** Ancien parti attesté par Wikidata (P102), noté par CHES à la vague indiquée. */
  | { methode: 'ancien_parti'; ches: string; vague: number; partiWikidata: string; fait?: string }
  /**
   * Famille CHES du parti de référence (son parti actuel ou un ancien parti attesté par
   * Wikidata, noté à une vague ancienne) ; position = moyenne des partis français de cette
   * famille à la vague 2024.
   */
  | {
      methode: 'famille';
      reference: { ches: string; vague: number };
      partiWikidata?: string;
      fait?: string;
    };

export type Implantation =
  { departement: string; fait: string; commune?: string } | { region: string; fait: string };

export type Selected = {
  id: string;
  /** Clé de la ligne dans le tableau (« Prénom Nom »). */
  nom: string;
  section: 'principale' | 'primaire';
  article: string;
  candidature: {
    date: string;
    statut: 'declaree' | 'designee';
    libelle: string;
    /** Texte à trouver quand la date n'est pas écrite en entier (sans l'année). */
    ancre?: string;
    /**
     * « article » : la candidature est sourcée par l'article lui-même (révision figée), quand
     * aucune référence de la ligne ne porte sur la candidature ; le motif est consigné.
     */
    source?: { article: string };
  };
  position: PositionChoice;
  notoriete: { niveau: 1 | 2 | 3; motif: string; fait: string | null };
  organisation: {
    niveau: 'grande' | 'moyenne' | 'petite' | 'aucune';
    motif: string;
    fait: string | null;
  };
  implantation: Implantation[];
  /**
   * Photo choisie sur Wikimedia Commons quand celle de la source n'est pas sous licence libre :
   * fichier Commons et motif consigné ; sa licence est vérifiée comme celle des autres photos.
   */
  photo?: { fichier: string; motif: string };
};

export const METHODE = {
  position:
    'Position du parti dans l’enquête d’experts Chapel Hill (vague 2024, sinon la plus récente), convertie par (x − 5) × 20 sur chaque axe : économie = lrecon, société = galtan. Parti soutien : parti qui soutient officiellement la candidature (source). Ancien parti : dernier parti noté par CHES dont la personne a été membre selon Wikidata (P102) — hypothèse. Famille : moyenne des partis français de la même famille CHES (vague 2024) que le parti de référence — hypothèse. Sans parti (phase 25 ter) : ni parti ni rattachement noté par CHES, milieu de l’échelle du jeu (0, 0) — hypothèse, aucune prise de position prêtée.',
  notoriete:
    'Niveau 3 : ancien Premier ministre ou au moins 5 % des exprimés à un premier tour présidentiel, ou personnalité de premier plan hors politique (titres olympiques multiples ; phase 25 ter). Niveau 2 : ancien ministre, ancien candidat à la présidentielle, candidat désigné par un parti, dirigeant national d’un parti représenté à l’Assemblée nationale, présidence d’une région ou d’une association nationale d’élus. Niveau 1 : autres. Faits cités de la source ; niveaux convertis en moyens par le jeu de règles (hypothèse de jeu).',
  organisation:
    'Taille du groupe à l’Assemblée nationale du parti sous l’étiquette duquel la personnalité est candidate (relevé du 19/10/2026) : grande (60 députés ou plus), moyenne (30 à 59), petite (moins de 30) ; si plusieurs candidatures déclarées partagent un parti, seule celle que le parti a désignée ou que dirige un de ses responsables nationaux en bénéficie ; au moins « petite » pour la présidence d’une région ou d’une association nationale d’élus ; sinon « aucune » (hypothèse de jeu).',
  implantation:
    'Départements des mandats en cours cités par la source (député, sénateur, maire, conseil départemental ; les départements de la région pour une présidence de région), et leurs régions selon le COG 2026.',
};

const aucune = (motif: string) => ({ niveau: 'aucune' as const, motif, fait: null });

export const SELECTION: Selected[] = [
  {
    id: 'reel-arthaud',
    nom: 'Nathalie Arthaud',
    section: 'principale',
    article: 'Nathalie Arthaud',
    candidature: {
      date: '2025-12-08',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 8 décembre 2025.',
    },
    position: {
      methode: 'famille',
      reference: { ches: 'LO-LCR', vague: 1999 },
      fait: 'Lutte ouvrière',
    },
    notoriete: {
      niveau: 2,
      motif: 'ancienne candidate à la présidentielle',
      fait: "Candidate à l'élection présidentielle de 2012",
    },
    organisation: aucune('parti sans groupe à l’Assemblée nationale'),
    implantation: [],
  },
  {
    id: 'reel-asselineau',
    nom: 'François Asselineau',
    section: 'principale',
    article: 'François Asselineau',
    candidature: {
      date: '2023-08-31',
      statut: 'declaree',
      libelle: 'Intention de se présenter en 2027 annoncée le 31 août 2023.',
      source: {
        article:
          'Les références de la phrase portent sur une procédure judiciaire ou sur une autre personnalité, pas sur la candidature : l’article lui-même (liste des candidatures déclarées) sert de source.',
      },
    },
    position: {
      methode: 'famille',
      reference: { ches: 'RPF', vague: 1999 },
      partiWikidata: 'Rassemblement pour la France',
    },
    notoriete: {
      niveau: 2,
      motif: 'ancien candidat à la présidentielle',
      fait: "Candidat à l'élection présidentielle en 2017",
    },
    organisation: aucune('parti sans groupe à l’Assemblée nationale'),
    implantation: [],
  },
  {
    id: 'reel-attal',
    nom: 'Gabriel Attal',
    section: 'principale',
    article: 'Gabriel Attal',
    candidature: {
      date: '2026-05-22',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 22 mai 2026.',
    },
    position: { methode: 'parti', ches: 'RE', vague: 2024, fait: 'Renaissance' },
    notoriete: { niveau: 3, motif: 'ancien Premier ministre', fait: 'Premier ministre (2024)' },
    organisation: {
      niveau: 'grande',
      motif: 'secrétaire général de Renaissance (groupe EPR : 90 députés)',
      fait: 'Secrétaire général de Renaissance',
    },
    implantation: [
      { departement: '92', fait: 'Député de la 10e circonscription (Hauts-de-Seine)' },
    ],
  },
  {
    id: 'reel-becht',
    nom: 'Olivier Becht',
    section: 'principale',
    article: 'Olivier Becht',
    candidature: {
      date: '2026-09-24',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 24 septembre 2026.',
    },
    position: { methode: 'parti', ches: 'RE', vague: 2024, fait: 'Renaissance / Agir' },
    notoriete: {
      niveau: 2,
      motif: 'ancien ministre',
      fait: 'Ministre délégué chargé du Commerce extérieur',
    },
    organisation: aucune(
      'Renaissance compte une autre candidature déclarée, portée par son secrétaire général',
    ),
    implantation: [{ departement: '68', fait: 'Député de la 5e circonscription du Haut-Rhin' }],
  },
  {
    id: 'reel-bertrand',
    nom: 'Xavier Bertrand',
    section: 'principale',
    article: 'Xavier Bertrand',
    candidature: {
      date: '2024-02-03',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 3 février 2024.',
    },
    position: { methode: 'parti', ches: 'LR', vague: 2024, fait: 'Nous France / Les Républicains' },
    notoriete: {
      niveau: 2,
      motif: 'ancien ministre',
      fait: "Ministre du Travail, de l'Emploi et de la Santé",
    },
    organisation: {
      niveau: 'petite',
      motif: 'président de région (Les Républicains ont désigné une autre candidature)',
      fait: 'Président du conseil régional des Hauts-de-France',
    },
    implantation: [{ region: '32', fait: 'Président du conseil régional des Hauts-de-France' }],
  },
  {
    id: 'reel-bouamrane',
    nom: 'Karim Bouamrane',
    section: 'principale',
    article: 'Karim Bouamrane',
    candidature: {
      date: '2026-06-09',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 9 juin 2026.',
    },
    position: { methode: 'parti', ches: 'PS', vague: 2024, fait: 'Parti socialiste' },
    notoriete: { niveau: 1, motif: 'aucun critère des niveaux 2 et 3', fait: null },
    organisation: aucune(
      'le Parti socialiste soutient une autre candidature (vainqueur de la primaire socialiste)',
    ),
    implantation: [
      { departement: '93', commune: 'Saint-Ouen-sur-Seine', fait: 'Maire de Saint-Ouen-sur-Seine' },
    ],
  },
  {
    id: 'reel-dupont-aignan',
    nom: 'Nicolas Dupont-Aignan',
    section: 'principale',
    article: 'Nicolas Dupont-Aignan',
    candidature: {
      date: '2026-09-19',
      statut: 'declaree',
      libelle: 'Candidature officialisée le 19 septembre 2026.',
    },
    position: { methode: 'parti', ches: 'DLF', vague: 2019, fait: 'Debout la France' },
    notoriete: {
      niveau: 2,
      motif: 'ancien candidat à la présidentielle',
      fait: "Candidat à l'élection présidentielle de 2012",
    },
    organisation: aucune('parti sans groupe à l’Assemblée nationale'),
    implantation: [
      { departement: '91', commune: 'Yerres', fait: "Maire d'Yerres (depuis mars 2026)" },
    ],
  },
  {
    id: 'reel-glucksmann',
    nom: 'Raphaël Glucksmann',
    section: 'principale',
    article: 'Raphaël Glucksmann',
    candidature: {
      date: '2026-10-11',
      statut: 'designee',
      libelle: 'Vainqueur de la primaire socialiste le 11 octobre 2026.',
      ancre: "l'emporte le 11 octobre",
    },
    position: {
      methode: 'parti_soutien',
      ches: 'PS',
      vague: 2024,
      fait: 'Candidature soutenue par : * Parti socialiste',
    },
    notoriete: {
      niveau: 2,
      motif: 'candidat désigné par une primaire de parti',
      fait: "l'emporte le 11 octobre",
    },
    organisation: {
      niveau: 'grande',
      motif:
        'candidature soutenue par le Parti socialiste (groupe SOC : 68 députés), vainqueur de sa primaire',
      fait: "l'emporte le 11 octobre",
    },
    implantation: [],
    photo: {
      fichier: 'Raphaël_Glucksmann.jpg',
      motif:
        'La photo de la source, diffusée par le Parlement européen, n’est pas sous licence libre ; portrait sous licence libre choisi sur Wikimedia Commons.',
    },
  },
  {
    id: 'reel-le-pen',
    nom: 'Marine Le Pen',
    section: 'principale',
    article: 'Marine Le Pen',
    candidature: {
      date: '2026-07-07',
      statut: 'declaree',
      libelle: 'Candidature confirmée le 7 juillet 2026.',
    },
    position: { methode: 'parti', ches: 'RN', vague: 2024, fait: 'Rassemblement national' },
    notoriete: {
      niveau: 3,
      motif: 'plus de 5 % au premier tour de la présidentielle de 2022',
      fait: '23,15 %',
    },
    organisation: {
      niveau: 'grande',
      motif: 'présidente du groupe RN (121 députés)',
      fait: "Présidente du groupe RN à l'Assemblée nationale",
    },
    implantation: [
      { departement: '62', fait: 'Députée de la 11e circonscription (Pas-de-Calais)' },
    ],
  },
  {
    id: 'reel-lisnard',
    nom: 'David Lisnard',
    section: 'primaire',
    article: 'David Lisnard',
    candidature: {
      date: '2026-03-31',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 31 mars 2026, en faveur d’une primaire de la droite.',
    },
    position: {
      methode: 'ancien_parti',
      ches: 'LR',
      vague: 2024,
      partiWikidata: 'Les Républicains',
      fait: 'son départ du parti Les Républicains',
    },
    notoriete: {
      niveau: 2,
      motif: 'président d’une association nationale d’élus',
      fait: "Président de l'Association des maires de France",
    },
    organisation: {
      niveau: 'petite',
      motif:
        'président d’une association nationale d’élus ; parti sans groupe à l’Assemblée nationale',
      fait: "Président de l'Association des maires de France",
    },
    implantation: [{ departement: '06', commune: 'Cannes', fait: 'Maire de Cannes' }],
  },
  {
    id: 'reel-melenchon',
    nom: 'Jean-Luc Mélenchon',
    section: 'principale',
    article: 'Jean-Luc Mélenchon',
    candidature: {
      date: '2026-05-03',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 3 mai 2026.',
    },
    position: { methode: 'parti', ches: 'FI', vague: 2024, fait: 'La France insoumise' },
    notoriete: {
      niveau: 3,
      motif: 'plus de 5 % au premier tour de la présidentielle de 2022',
      fait: '21,95 %',
    },
    organisation: {
      niveau: 'grande',
      motif: 'seule candidature déclarée de La France insoumise (groupe LFI-NFP : 70 députés)',
      fait: 'La France insoumise',
    },
    implantation: [],
  },
  {
    id: 'reel-philippe',
    nom: 'Édouard Philippe',
    section: 'principale',
    article: 'Édouard Philippe',
    candidature: {
      date: '2024-09-03',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 3 septembre 2024.',
    },
    position: { methode: 'parti', ches: 'Horizons', vague: 2024, fait: 'Horizons' },
    notoriete: {
      niveau: 3,
      motif: 'ancien Premier ministre',
      fait: 'Premier ministre (2017-2020)',
    },
    organisation: {
      niveau: 'moyenne',
      motif: 'président d’Horizons (groupe HOR : 35 députés)',
      fait: "Président d'Horizons",
    },
    implantation: [{ departement: '76', commune: 'Le Havre', fait: 'Maire du Havre' }],
  },
  {
    id: 'reel-retailleau',
    nom: 'Bruno Retailleau',
    section: 'principale',
    article: 'Bruno Retailleau',
    candidature: {
      date: '2026-04-19',
      statut: 'designee',
      libelle: 'Désigné candidat par Les Républicains le 19 avril 2026.',
    },
    position: { methode: 'parti', ches: 'LR', vague: 2024, fait: 'Les Républicains' },
    notoriete: { niveau: 2, motif: 'ancien ministre', fait: "Ministre de l'Intérieur" },
    organisation: {
      niveau: 'moyenne',
      motif: 'président des Républicains, désigné par son parti (groupe DR : 47 députés)',
      fait: 'Président des Républicains',
    },
    implantation: [{ departement: '85', fait: 'Sénateur de la Vendée (depuis 2025)' }],
  },
  {
    id: 'reel-roussel',
    nom: 'Fabien Roussel',
    section: 'principale',
    article: 'Fabien Roussel',
    candidature: {
      date: '2026-09-06',
      statut: 'designee',
      libelle: 'Désigné candidat par le Parti communiste français le 6 septembre 2026.',
    },
    position: { methode: 'parti', ches: 'PCF', vague: 2024, fait: 'Parti communiste français' },
    notoriete: {
      niveau: 2,
      motif: 'ancien candidat à la présidentielle, dirigeant national de son parti',
      fait: 'Secrétaire national du Parti communiste français',
    },
    organisation: {
      niveau: 'petite',
      motif: 'secrétaire national du PCF (groupe GDR : 17 députés)',
      fait: 'Secrétaire national du Parti communiste français',
    },
    implantation: [
      { departement: '59', commune: 'Saint-Amand-les-Eaux', fait: 'Maire de Saint-Amand-les-Eaux' },
    ],
  },
  {
    id: 'reel-ruffin',
    nom: 'François Ruffin',
    section: 'principale',
    article: 'François Ruffin',
    candidature: {
      date: '2025-04-01',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 1er avril 2025.',
    },
    position: {
      methode: 'ancien_parti',
      ches: 'PCF',
      vague: 2024,
      partiWikidata: 'Parti communiste français',
    },
    notoriete: {
      niveau: 2,
      motif: 'dirigeant national d’un parti représenté à l’Assemblée nationale',
      fait: 'Président de Debout !',
    },
    organisation: aucune('parti sans groupe à l’Assemblée nationale'),
    implantation: [{ departement: '80', fait: 'Député de la 1re circonscription (Somme)' }],
  },
  {
    id: 'reel-tondelier',
    nom: 'Marine Tondelier',
    section: 'principale',
    article: 'Marine Tondelier',
    candidature: {
      date: '2026-09-21',
      statut: 'designee',
      libelle: 'Désignée candidate par Les Écologistes le 21 septembre 2026.',
    },
    position: { methode: 'parti', ches: 'LE/EELV', vague: 2024, fait: 'Les Écologistes' },
    notoriete: {
      niveau: 2,
      motif: 'dirigeante nationale de son parti',
      fait: 'Secrétaire nationale des Écologistes',
    },
    organisation: {
      niveau: 'moyenne',
      motif: 'secrétaire nationale des Écologistes (groupe EcoS : 38 députés)',
      fait: 'Secrétaire nationale des Écologistes',
    },
    implantation: [],
  },
  {
    id: 'reel-zemmour',
    nom: 'Éric Zemmour',
    section: 'principale',
    article: 'Éric Zemmour',
    candidature: {
      date: '2026-09-17',
      statut: 'declaree',
      libelle: 'Candidature confirmée le 17 septembre 2026.',
    },
    position: { methode: 'parti', ches: 'REC', vague: 2024, fait: 'Reconquête' },
    notoriete: {
      niveau: 3,
      motif: 'plus de 5 % au premier tour de la présidentielle de 2022',
      fait: '7,07 %',
    },
    organisation: aucune('parti sans groupe à l’Assemblée nationale'),
    implantation: [],
  },
];

/**
 * Fiches ajoutées à la main (phase 25 ter, décision de l'utilisateur du 10/11/2026) : candidature
 * postérieure à la révision importée de l'article, sourcée par la presse datée. Elles sont jointes
 * telles quelles à chaque import, après les fiches importées, et retirées des « non intégrées ».
 * Faits seulement : aucun propos, slogan ni programme n'est repris.
 */
export const AJOUTS_MANUELS: RealPersonality[] = [
  {
    id: 'reel-riner',
    prenom: 'Teddy',
    nom: 'Riner',
    parti: 'Sans parti',
    fonctions: ['Judoka en activité, quintuple champion olympique'],
    wikidata: null,
    article: 'https://fr.wikipedia.org/wiki/Teddy_Riner',
    candidature: {
      statut: 'declaree',
      date: '2026-11-09',
      libelle: 'Candidature annoncée le 9 novembre 2026, sans parti ni élus.',
      source: {
        titre: 'Présidentielle 2027 : Teddy Riner annonce sa candidature',
        url: 'https://www.rts.ch/info/monde/2026/article/presidentielle-2027-teddy-riner-annonce-sa-candidature-29410550.html',
        site: 'RTS',
        date: null,
      },
    },
    position: {
      economie: 0,
      societe: 0,
      statut: 'hypothese',
      methode: 'sans_parti',
      partisReference: [],
      vague: 2024,
      ches: null,
      detail:
        'Aucun parti ni rattachement noté par l’enquête d’experts CHES : milieu de l’échelle du jeu (0, 0), hypothèse de jeu ; aucune prise de position ne lui est prêtée.',
    },
    photo: {
      fichier: 'personnalites/reel-riner.webp',
      auteur: 'Georges Biard',
      licence: 'CC BY-SA 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Teddy_Riner_Cannes_2016.jpg',
      modification:
        'Redimensionnée (240 pixels de large) et convertie en WebP ; métadonnées retirées.',
      choix:
        'Photo de l’infobox de l’article Wikipédia (Cannes, 21 mai 2016), choisie à la main sur Wikimedia Commons : fiche ajoutée hors de l’importeur.',
    },
    photoAbsente: null,
    implantation: { departements: [], regions: [], faits: [] },
    moyens: {
      notoriete: 3,
      motifNotoriete: 'personnalité de premier plan hors politique (quintuple champion olympique)',
      organisation: 'aucune',
      motifOrganisation:
        'aucun parti ni élu ; campagne financée par dons et fonds propres (hypothèse de jeu)',
    },
  },
];
