import {
  Armchair,
  Award,
  Briefcase,
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
//
// Phase 20 (« moins d'écrans ») : quatre paires d'écrans voisins forment une seule section
// (archives, opinion, exécutif, économie). Aucun écran ne disparaît : chacun garde son contenu et
// son ancre (`opinion#resultats`), qui déplie la section commune et amène l'écran à la vue.

export type Hub = {
  path: string;
  /** Libellé de l'onglet (barre du bas et rail). */
  label: string;
  /** Titre de la page de l'espace. */
  titre: string;
  intro: string;
  icon: LucideIcon;
  /** Sections dépliables, dans l'ordre : un écran du registre, ou une section commune. */
  sections: readonly string[];
};

export const HUBS: readonly Hub[] = [
  {
    path: 'tableau-de-bord',
    label: 'QG',
    titre: 'Tableau de bord',
    intro: 'Votre QG : la situation en un coup d’œil, les décisions, le plan de la semaine.',
    icon: Flag,
    sections: ['archives'],
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
    intro: 'Sondages simulés et résultats des scrutins, sur une seule page.',
    icon: ChartColumn,
    sections: ['sondages-resultats'],
  },
  {
    path: 'pouvoir',
    label: 'Pouvoir',
    titre: 'Pouvoir',
    intro:
      'Gouvernement, Conseil des ministres, Parlement, économie, crises, législatives et bilan du quinquennat : dépliez une section.',
    icon: Landmark,
    sections: ['executif', 'parlement', 'economie-crises', 'legislatives', 'bilan'],
  },
];

/** Section commune à plusieurs écrans du registre (phase 20). */
export type MergedSection = { id: string; label: string; parts: readonly string[] };

export const MERGED_SECTIONS: readonly MergedSection[] = [
  { id: 'archives', label: 'Archives de la partie', parts: ['journal', 'sauvegardes'] },
  { id: 'sondages-resultats', label: 'Sondages et résultats', parts: ['sondages', 'resultats'] },
  {
    id: 'executif',
    label: 'Gouvernement et Conseil des ministres',
    parts: ['gouvernement', 'conseil'],
  },
  { id: 'economie-crises', label: 'Économie et crises', parts: ['economie', 'crises'] },
];

/** Section commune d'identifiant donné, s'il en est une. */
export function mergedSection(id: string): MergedSection | undefined {
  return MERGED_SECTIONS.find((m) => m.id === id);
}

/** Section dépliable qui présente un écran : la section commune qui le contient, ou lui-même. */
export function sectionOf(path: string): string {
  return MERGED_SECTIONS.find((m) => m.parts.includes(path))?.id ?? path;
}

/** Écrans présentés par une section, dans l'ordre. */
export function partsOf(section: string): readonly string[] {
  return mergedSection(section)?.parts ?? [section];
}

/** Icône de chaque section (titre dépliable). */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  archives: NotebookText,
  'sondages-resultats': ChartColumn,
  executif: Landmark,
  'economie-crises': TrendingUp,
  programme: ScrollText,
  candidats: Users,
  medias: Megaphone,
  finances: Wallet,
  sondages: ChartColumn,
  resultats: Vote,
  gouvernement: Landmark,
  conseil: Briefcase,
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
  const section = sectionOf(path);
  return HUBS.find((h) => h.path === path || h.sections.includes(section));
}

/** Adresse d'un écran, relative à la partie : l'espace, et la section à déplier. */
export function screenHref(path: string): string {
  const hub = hubOf(path);
  if (!hub) return path;
  return hub.path === path ? path : `${hub.path}#${path}`;
}
