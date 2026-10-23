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

// Navigation de partie (phase 12) : cinq espaces, sans menu imbriqué. Chaque écran du cahier
// des charges (§13) est une section dépliable d'un espace ; ses anciennes adresses
// (`…/programme`) ouvrent l'espace avec la section dépliée.

export type Hub = {
  path: string;
  /** Libellé de l'onglet (barre du bas et rail). */
  label: string;
  /** Titre de la page de l'espace. */
  titre: string;
  intro: string;
  icon: LucideIcon;
  /** Écrans du registre présentés en sections dépliables, dans l'ordre. */
  sections: readonly string[];
};

export const HUBS: readonly Hub[] = [
  {
    path: 'tableau-de-bord',
    label: 'QG',
    titre: 'Tableau de bord',
    intro: 'Votre QG : la situation en un coup d’œil, les décisions, le plan de la semaine.',
    icon: Flag,
    sections: ['journal', 'sauvegardes'],
  },
  {
    path: 'carte',
    label: 'Carte',
    titre: 'Carte électorale',
    intro: 'Carte des communes et des départements, résultats par tour et par candidat.',
    icon: Map,
    sections: [],
  },
  {
    path: 'campagne',
    label: 'Campagne',
    titre: 'Campagne',
    intro:
      'Programme, adversaires et alliances, médias et réseaux, finances : dépliez une section.',
    icon: Megaphone,
    sections: ['programme', 'candidats', 'medias', 'finances'],
  },
  {
    path: 'opinion',
    label: 'Opinion',
    titre: 'Opinion',
    intro: 'Sondages simulés et résultats des scrutins : dépliez une section.',
    icon: ChartColumn,
    sections: ['sondages', 'resultats'],
  },
  {
    path: 'pouvoir',
    label: 'Pouvoir',
    titre: 'Pouvoir',
    intro:
      'Gouvernement, Parlement, économie, crises, législatives et bilan du quinquennat : dépliez une section.',
    icon: Landmark,
    sections: ['gouvernement', 'parlement', 'economie', 'crises', 'legislatives', 'bilan'],
  },
];

/** Icône de chaque section (titre dépliable). */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  programme: ScrollText,
  candidats: Users,
  medias: Megaphone,
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

/** Espace qui présente un écran (lui-même pour un espace, sinon celui de sa section). */
export function hubOf(path: string): Hub | undefined {
  return HUBS.find((h) => h.path === path || h.sections.includes(path));
}

/** Adresse d'un écran, relative à la partie : l'espace, et la section à déplier. */
export function screenHref(path: string): string {
  const hub = hubOf(path);
  if (!hub) return path;
  return hub.path === path ? path : `${hub.path}#${path}`;
}
