import {
  Banknote,
  DoorOpen,
  Footprints,
  Globe,
  HandCoins,
  Handshake,
  MessagesSquare,
  Mic,
  Plane,
  Presentation,
  RefreshCw,
  Smartphone,
  Sparkles,
  Swords,
  Tv,
  UserPlus,
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
  recrutement: UserPlus,
  collecte: HandCoins,
  'porte-a-porte': DoorOpen,
  'elus-locaux': Handshake,
  'emprunt-bancaire': Banknote,
  'preparation-debat': Swords,
  allocution: Tv,
  'deplacement-presidentiel': Plane,
  'sommet-international': Globe,
  remaniement: RefreshCw,
  dissolution: Zap,
};

export const actionIcon = (id: string): LucideIcon => ICONS[id] ?? Sparkles;
