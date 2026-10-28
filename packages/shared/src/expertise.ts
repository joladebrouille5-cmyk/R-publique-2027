import type { GovernmentFigure } from './figures';
import type { MemberRef } from './quinquennat';
import type { Ruleset } from './ruleset';

// Expertise ministérielle (phase 14) : règle partagée par le moteur (composition du gouvernement,
// compétence du ministre en charge d'un poste) et par l'interface (affichage), pour qu'ils
// donnent toujours le même résultat. Une fonction de ministre, de secrétaire d'État ou de
// ministre délégué, en cours ou passée, relevée dans la fiche d'une figure réelle, dont le
// libellé cite un mot-clé d'un poste du jeu, donne un bonus de compétence sur ce poste ; la
// meilleure fonction est retenue. Table et bonus : paramètres du jeu de règles (hypothèses).

export type ExpertiseRules = Ruleset['quinquennat']['equipe']['expertise'];

/** Expertise d'une personnalité sur un poste : fonction qui la fonde, niveau et bonus. */
export type PostExpertise = {
  posteId: string;
  /** Libellé de la fonction (fiche de la figure). */
  fonction: string;
  enCours: boolean;
  niveau: 'ministre' | 'secretaire-etat';
  bonus: number;
};

/** Texte comparable : minuscules, sans accents, apostrophes droites. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/’/g, "'")
    .toLowerCase();

/** Expertises d'une figure réelle, dans l'ordre des postes de la table (au plus une par poste). */
export function figureExpertise(
  figure: Pick<GovernmentFigure, 'fonctions'>,
  rules: ExpertiseRules,
): PostExpertise[] {
  const result: PostExpertise[] = [];
  for (const poste of rules.postes) {
    const keywords = poste.motsCles.map(fold);
    let best: PostExpertise | null = null;
    for (const f of figure.fonctions) {
      if (f.nature !== 'ministre' && f.nature !== 'secretaire-etat') continue;
      const libelle = fold(f.libelle);
      if (!keywords.some((k) => libelle.includes(k))) continue;
      const niveau = f.nature === 'ministre' ? 'ministre' : 'secretaire-etat';
      const bonus = niveau === 'ministre' ? rules.ministre : rules.secretaireEtat;
      // Meilleur bonus ; à bonus égal, une fonction en cours, puis la première de la fiche.
      if (!best || bonus > best.bonus || (bonus === best.bonus && f.enCours && !best.enCours))
        best = { posteId: poste.posteId, fonction: f.libelle, enCours: f.enCours, niveau, bonus };
    }
    if (best) result.push(best);
  }
  return result;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Compétence sur un poste : compétence de gestion, plus le bonus d'expertise sur ce poste, dans
 * la limite du plafond (jamais abaissée par le plafond).
 */
export function postCompetence(
  competence: number,
  expertise: readonly PostExpertise[],
  posteId: string | null,
  rules: ExpertiseRules,
): number {
  const bonus = posteId ? (expertise.find((e) => e.posteId === posteId)?.bonus ?? 0) : 0;
  if (bonus === 0) return competence;
  return Math.max(competence, Math.min(rules.plafond, round2(competence + bonus)));
}

/**
 * Compétence de gestion d'un membre du gouvernement (0 à 1) : estimation pour une figure réelle,
 * paramètre du jeu pour un profil fictif ou un candidat de la partie.
 */
export function memberCompetence(ruleset: Ruleset, member: MemberRef): number {
  if (member.nature === 'profil') {
    const profile = ruleset.quinquennat.profils.find((p) => p.id === member.ref);
    if (!profile) throw new Error(`Profil inconnu : ${member.ref}`);
    return profile.competence;
  }
  if (member.nature === 'figure') {
    const figure = ruleset.figures.figures.find((f) => f.id === member.ref);
    if (!figure) throw new Error(`Figure inconnue : ${member.ref}`);
    return figure.competence.valeur;
  }
  return ruleset.quinquennat.equipe.competenceActeur;
}

/** Expertises des figures réelles, calculées une fois par jeu de règles. */
const EXPERTISE = new WeakMap<Ruleset, Map<string, PostExpertise[]>>();

/** Expertise ministérielle d'un membre : celle d'une figure réelle, aucune sinon. */
export function memberExpertise(ruleset: Ruleset, member: MemberRef): PostExpertise[] {
  if (member.nature !== 'figure') return [];
  let byFigure = EXPERTISE.get(ruleset);
  if (!byFigure) {
    const rules = ruleset.quinquennat.equipe.expertise;
    byFigure = new Map(ruleset.figures.figures.map((f) => [f.id, figureExpertise(f, rules)]));
    EXPERTISE.set(ruleset, byFigure);
  }
  return byFigure.get(member.ref) ?? [];
}

/**
 * Compétence d'un membre sur un poste (expertise comprise) ; `posteId` null (Matignon) : sa
 * compétence de gestion seule. Même valeur pour le moteur et pour l'affichage.
 */
export function memberPostCompetence(
  ruleset: Ruleset,
  member: MemberRef,
  posteId: string | null,
): number {
  return postCompetence(
    memberCompetence(ruleset, member),
    memberExpertise(ruleset, member),
    posteId,
    ruleset.quinquennat.equipe.expertise,
  );
}
