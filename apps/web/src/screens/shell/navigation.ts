import {
  Armchair,
  Award,
  ChartColumn,
  Flag,
  Landmark,
  Map,
  Megaphone,
  NotebookText,
  Save,
  Scale,
  ScrollText,
  Siren,
  TrendingUp,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { GamePhase } from '@r2027/shared';
import { GAME_SCREENS, type GameScreen } from '../registry';

// Navigation de partie (phase 9) : icônes, libellés courts de la barre du bas (mobile) et
// regroupement des écrans du rail (ordinateur) et de la feuille « Tous les écrans ».

export const SCREEN_ICONS: Record<string, LucideIcon> = {
  'tableau-de-bord': Flag,
  carte: Map,
  candidats: Users,
  medias: Megaphone,
  programme: ScrollText,
  finances: Wallet,
  sondages: ChartColumn,
  resultats: Vote,
  gouvernement: Landmark,
  parlement: Scale,
  economie: TrendingUp,
  crises: Siren,
  legislatives: Armchair,
  bilan: Award,
  journal: NotebookText,
  sauvegardes: Save,
};

/** Libellé court de la barre du bas : mot du libellé complet, sauf le QG. */
export const SHORT_LABELS: Record<string, string> = {
  'tableau-de-bord': 'QG',
  carte: 'Carte',
  medias: 'Médias',
  sondages: 'Sondages',
  gouvernement: 'Gouvernement',
  parlement: 'Parlement',
  economie: 'Économie',
};

export const SCREEN_GROUPS: { titre: string; paths: string[] }[] = [
  {
    titre: 'Campagne',
    paths: [
      'tableau-de-bord',
      'carte',
      'candidats',
      'medias',
      'programme',
      'finances',
      'sondages',
      'resultats',
    ],
  },
  {
    titre: 'Pouvoir',
    paths: ['gouvernement', 'parlement', 'economie', 'crises', 'legislatives', 'bilan'],
  },
  { titre: 'Suivi', paths: ['journal', 'sauvegardes'] },
];

/** Raccourcis de la barre du bas selon la phase : la campagne, ou l'exercice du pouvoir. */
export function shortcutsFor(phase: GamePhase): GameScreen[] {
  const paths =
    phase === 'presidence'
      ? ['tableau-de-bord', 'gouvernement', 'parlement', 'economie']
      : ['tableau-de-bord', 'carte', 'medias', 'sondages'];
  return paths.map((path) => GAME_SCREENS.find((s) => s.path === path)!);
}
