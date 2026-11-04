import {
  Banknote,
  Clapperboard,
  DoorOpen,
  Factory,
  Flame,
  Footprints,
  Globe,
  HandCoins,
  Handshake,
  HeartHandshake,
  Hospital,
  Landmark,
  Lightbulb,
  MessagesSquare,
  Mic,
  Plane,
  Podcast,
  Presentation,
  Radio,
  RefreshCw,
  Siren,
  Smartphone,
  Sparkles,
  Star,
  Swords,
  Tv,
  UserPlus,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Icône de chaque action du jeu de règles (une icône générique pour une action nouvelle). */
const ICONS: Record<string, LucideIcon> = {
  meeting: Mic,
  'grand-meeting': Presentation,
  tournee: Footprints,
  interview: MessagesSquare,
  'emission-politique': Tv,
  numerique: Smartphone,
  'interview-longue': Podcast,
  decryptage: Lightbulb,
  'vague-video-courte': Clapperboard,
  'live-twitch': Radio,
  recrutement: UserPlus,
  collecte: HandCoins,
  'porte-a-porte': DoorOpen,
  'elus-locaux': Handshake,
  'emprunt-bancaire': Banknote,
  'preparation-debat': Swords,
  allocution: Tv,
  'deplacement-presidentiel': Plane,
  'sommet-international': Globe,
  // Actions du chef de l'État (phase 13).
  'visite-usine': Factory,
  'visite-chu': Hospital,
  'sommet-crise': Siren,
  'negociation-sociale': HeartHandshake,
  'discours-congres': Landmark,
  'reunion-majorite': UsersRound,
  commemoration: Flame,
  pantheonisation: Star,
  remaniement: RefreshCw,
  dissolution: Zap,
};

export const actionIcon = (id: string): LucideIcon => ICONS[id] ?? Sparkles;

/**
 * Familles d'actions (phase 16) : regroupement d'affichage propre à l'interface, pour teinter la
 * pastille de chaque action ; il ne change rien aux règles. Une action inconnue n'a pas de teinte
 * particulière.
 */
const FAMILIES = {
  terrain: 'bg-or-100 text-or-800 dark:bg-dorure/10 dark:text-dorure',
  medias:
    'bg-republique-100 text-republique-800 dark:bg-republique-500/15 dark:text-republique-200',
  numerique: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200',
  elus: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200',
  finances: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
  crise: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200',
  neutre: 'bg-slate-100 text-slate-700 dark:bg-white/[0.07] dark:text-slate-200',
} as const;

const FAMILY_OF: Record<string, keyof typeof FAMILIES> = {
  meeting: 'terrain',
  'grand-meeting': 'terrain',
  tournee: 'terrain',
  'porte-a-porte': 'terrain',
  recrutement: 'terrain',
  interview: 'medias',
  'emission-politique': 'medias',
  'preparation-debat': 'medias',
  allocution: 'medias',
  numerique: 'numerique',
  'interview-longue': 'numerique',
  decryptage: 'numerique',
  'vague-video-courte': 'numerique',
  'live-twitch': 'numerique',
  'elus-locaux': 'elus',
  'negocier-soutien': 'elus',
  'negocier-soutien-ministere': 'elus',
  'reunion-majorite': 'elus',
  collecte: 'finances',
  'emprunt-bancaire': 'finances',
  'deplacement-presidentiel': 'terrain',
  'visite-usine': 'terrain',
  'visite-chu': 'terrain',
  commemoration: 'terrain',
  pantheonisation: 'terrain',
  'sommet-international': 'medias',
  'discours-congres': 'medias',
  'sommet-crise': 'crise',
  'negociation-sociale': 'crise',
  remaniement: 'neutre',
  'remaniement-cible': 'neutre',
  dissolution: 'crise',
};

/** Classes de la pastille d'une action (fond et icône), selon sa famille d'affichage. */
export const actionTint = (id: string): string => FAMILIES[FAMILY_OF[id] ?? 'neutre'];
