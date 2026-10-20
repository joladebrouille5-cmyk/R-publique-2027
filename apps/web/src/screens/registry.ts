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
    available: false,
    description:
      'Carte interactive des communes de métropole et des DROM (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte), résultats par tour et par candidat.',
  },
  {
    path: 'candidats',
    label: 'Candidats',
    phase: 3,
    available: false,
    description: 'Candidats en lice, profils sourcés et création d’un candidat personnalisé.',
  },
  {
    path: 'programme',
    label: 'Programme',
    phase: 5,
    available: false,
    description: 'Propositions par domaine avec coût, délai, faisabilité et effets.',
  },
  {
    path: 'finances',
    label: 'Finances',
    phase: 5,
    available: false,
    description: 'Compte de campagne : recettes, dépenses, dons, plafonds.',
  },
  {
    path: 'sondages',
    label: 'Sondages',
    phase: 3,
    available: false,
    description: 'Sondages simulés avec échantillon, méthode et marge d’erreur.',
  },
  {
    path: 'gouvernement',
    label: 'Gouvernement',
    phase: 6,
    available: false,
    description: 'Premier ministre, ministres et feuille de route après une victoire.',
  },
  {
    path: 'parlement',
    label: 'Parlement',
    phase: 6,
    available: false,
    description: 'Groupes, sièges, coalitions et votes à l’Assemblée nationale.',
  },
  {
    path: 'economie',
    label: 'Économie',
    phase: 6,
    available: false,
    description: 'Croissance, inflation, chômage, dette, déficit et pouvoir d’achat.',
  },
  {
    path: 'crises',
    label: 'Crises',
    phase: 6,
    available: false,
    description: 'Crises en cours, choix possibles et conséquences.',
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
