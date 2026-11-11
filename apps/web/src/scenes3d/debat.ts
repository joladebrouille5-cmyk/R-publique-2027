import type { DebateSession } from '@r2027/shared';

// Habillage du débat (phase 26) : la tension du plateau et le cadrage qui en découle. Le moteur
// ne tient pas de jauge de tension pour un débat ; celle-ci se lit dans ce qu'il a déjà produit :
// la part d'attaques et de petites phrases des derniers échanges, les coups retournés, et l'écart
// d'approbation entre les deux premiers. Mise en scène seulement : rien n'est renvoyé au moteur.

const OFFENSIVES = new Set(['attaquer', 'petite-phrase', 'petite_phrase']);
const borne = (v: number) => Math.max(0, Math.min(1, v));

/** Tension du plateau (0 : échanges posés ; 1 : échanges vifs et débat serré). */
export function tensionDuDebat(session: DebateSession): number {
  const coups = session.sequences.slice(-2).flatMap((s) => s.coups);
  if (coups.length === 0) return 0.2;
  const offensifs = coups.filter((c) => OFFENSIVES.has(c.carte)).length / coups.length;
  const retournes = coups.filter((c) => c.issue === 'retourne').length / coups.length;
  const scores = Object.values(session.approbation).sort((a, b) => b - a);
  const serre = scores.length >= 2 ? borne(1 - (scores[0]! - scores[1]!) / 20) : 0;
  return borne(0.1 + 0.55 * offensifs + 0.35 * retournes + 0.25 * serre);
}

export const PLANS = ['large', 'serre', 'champ-contrechamp', 'ecran-partage'] as const;
export type Plan = (typeof PLANS)[number];

/**
 * Plans que la réalisation enchaîne selon la tension : plan large et plan serré sur le candidat
 * qui parle toujours ; champ-contrechamp sur son adversaire dès que le ton monte ; écran partagé
 * pendant les échanges vifs.
 */
export function plansDuDebat(tension: number): Plan[] {
  const plans: Plan[] = ['large', 'serre'];
  if (tension >= 0.35) plans.push('champ-contrechamp');
  if (tension >= 0.6) plans.push('ecran-partage');
  return plans;
}

/** Durée d'un plan, en secondes : la réalisation coupe plus vite quand le ton monte. */
export const dureeDuPlan = (tension: number) => 5.5 - 3 * borne(tension);

/** Candidat qui a la parole et son vis-à-vis, d'après le dernier coup joué. */
export function parole(session: DebateSession): { parle: string | null; cible: string | null } {
  const dernier = session.sequences.at(-1)?.coups.at(-1);
  return { parle: dernier?.acteurId ?? null, cible: dernier?.cible ?? null };
}
