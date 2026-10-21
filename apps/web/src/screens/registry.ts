// Écrans de partie du cahier des charges (§13). Un écran sans moteur derrière lui est
// marqué indisponible avec la phase prévue : aucune donnée factice n'est affichée.

export type GameScreen = {
  path: string;
  label: string;
  phase: number;
  available: boolean;
  description: string;
};

export const GAME_SCREENS: readonly GameScreen[] = [
  {
    path: 'tableau-de-bord',
    label: 'Tableau de bord',
    phase: 1,
    available: true,
    description: 'Ressources, décisions, plan d’actions, progression et bilan de la semaine.',
  },
  {
    path: 'carte',
    label: 'Carte électorale',
    phase: 4,
    available: true,
    description:
      'Carte interactive des communes de métropole et des DROM (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte), résultats par tour et par candidat.',
  },
  {
    path: 'candidats',
    label: 'Candidats',
    phase: 3,
    available: true,
    description: 'Candidats, positionnements, parrainages, stratégies, relations et alliances.',
  },
  {
    path: 'medias',
    label: 'Médias',
    phase: 5,
    available: true,
    description:
      'Médias réels : audiences, temps de parole, émissions politiques et couverture simulée.',
  },
  {
    path: 'programme',
    label: 'Programme',
    phase: 5,
    available: true,
    description: 'Propositions par domaine avec coût, délai, faisabilité et effets.',
  },
  {
    path: 'finances',
    label: 'Finances',
    phase: 5,
    available: true,
    description: 'Compte de campagne : recettes, dépenses, dons, plafonds.',
  },
  {
    path: 'sondages',
    label: 'Sondages',
    phase: 3,
    available: true,
    description: 'Sondages simulés avec échantillon, méthode et marge d’erreur.',
  },
  {
    path: 'resultats',
    label: 'Résultats',
    phase: 3,
    available: true,
    description: 'Résultats simulés des deux tours, participation, blancs et nuls.',
  },
  {
    path: 'gouvernement',
    label: 'Gouvernement',
    phase: 6,
    available: true,
    description: 'Président, mandat, Premier ministre, ministres et feuille de route.',
  },
  {
    path: 'parlement',
    label: 'Parlement',
    phase: 6,
    available: true,
    description:
      'Groupes et sièges réels de l’Assemblée nationale, textes de la feuille de route et votes simulés par groupe.',
  },
  {
    path: 'economie',
    label: 'Économie',
    phase: 6,
    available: true,
    description: 'Croissance, inflation, chômage, dette, déficit et pouvoir d’achat.',
  },
  {
    path: 'crises',
    label: 'Crises',
    phase: 6,
    available: true,
    description: 'Crises fictives en cours et passées, choix possibles et conséquences.',
  },
  {
    path: 'legislatives',
    label: 'Législatives',
    phase: 6,
    available: true,
    description:
      'Élections législatives sur les 577 circonscriptions, dissolution et recomposition de l’Assemblée.',
  },
  {
    path: 'bilan',
    label: 'Bilan du quinquennat',
    phase: 6,
    available: false,
    description:
      'Bilan de fin de mandat (indicateurs, réformes, popularité) avant la présidentielle suivante.',
  },
  {
    path: 'journal',
    label: 'Journal',
    phase: 2,
    available: true,
    description: 'Journal hebdomadaire des actions, événements et facteurs explicatifs.',
  },
  {
    path: 'sauvegardes',
    label: 'Sauvegardes',
    phase: 1,
    available: true,
    description: 'Sauvegardes manuelles et automatiques, restauration, export et import.',
  },
];
