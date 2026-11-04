import type {
  Alignment,
  GameState,
  ParliamentTension,
  Ruleset,
  TensionFactor,
} from '@r2027/shared';
import { censureVote, filledSeats, membersMajority, sessionOf } from './parliament';

// Tension parlementaire (phase 13), de 0 à 100 : somme de facteurs nommés (hypothèses du jeu
// de règles), écrêtement compris — la même transparence que les registres. Elle nourrit la
// propension à censurer, renchérit le 49.3 et peut provoquer des motions de censure spontanées.
// La fronde de fond, l'apaisement et l'échauffement des questions au gouvernement (phase 15)
// décroissent chaque semaine.

const pct = (value: number) => `${Math.round(value / 100)} %`;

/** Tension du Parlement de l'état, avec ses facteurs et la projection d'une censure. */
export function computeTension(state: GameState, ruleset: Ruleset): ParliamentTension {
  const parliament = state.parlement!;
  const rules = ruleset.parlement.tension;
  const facteurs: TensionFactor[] = [];
  const add = (libelle: string, value: number) => {
    const valeur = Math.round(value) + 0;
    if (valeur !== 0) facteurs.push({ libelle, valeur });
  };
  const seats = (alignment: Alignment) =>
    Object.values(parliament.groupes)
      .filter((g) => g.alignement === alignment)
      .reduce((sum, g) => sum + g.sieges, 0);
  const filled = filledSeats(parliament);
  const majority = membersMajority(parliament);

  add('Débat parlementaire ordinaire (base du jeu)', rules.base);
  const opposition = seats('opposition');
  add(
    `Opposition : ${opposition} sièges sur ${filled}`,
    (rules.poidsOpposition * opposition) / Math.max(1, filled),
  );
  const supporters = seats('soutien');
  if (supporters < majority)
    add(
      `Majorité manquante : ${majority - supporters} voix (${supporters} soutiens pour ${majority} requises)`,
      (rules.poidsMinorite * (majority - supporters)) / majority,
    );
  const president = state.quinquennat
    ? state.actors[state.quinquennat.mandat.presidentId]
    : undefined;
  const reference = ruleset.jeu.opinion.popularite.reference;
  if (president && president.resources.popularite < reference)
    add(
      `Impopularité du président (${pct(president.resources.popularite)})`,
      (rules.poidsImpopularite * (reference - president.resources.popularite)) / reference,
    );
  const session = sessionOf(ruleset, state.meta.date);
  const engagements = parliament.usage49_3.session === session ? parliament.usage49_3.autres : 0;
  if (engagements > 0)
    add(
      `Engagement de responsabilité (49.3) dans la session : ${engagements}`,
      engagements * rules.par49_3,
    );
  const rebels = Object.entries(parliament.fronde)
    .filter(([id]) => parliament.groupes[id]?.alignement === 'soutien')
    .reduce((sum, [, n]) => sum + n, 0);
  if (rebels > 0)
    add(
      `Fronde dans la majorité : ${rebels} député(s)`,
      Math.min(rules.frondeMax, rebels * rules.parFrondeur),
    );
  const motions =
    parliament.motionsSession.session === session ? parliament.motionsSession.nombre : 0;
  if (motions > 0) add(`Motions de censure de la session : ${motions}`, motions * rules.parMotion);
  const social = state.economie?.indicateurs.tensions;
  if (social !== undefined && social > 5_000)
    add(
      `Tensions sociales (${Math.round(social / 100)}/100)`,
      ((social - 5_000) / 100) * rules.poidsTensionsSociales,
    );
  if (parliament.coalition) add('Coalition de gouvernement', -rules.coalition);
  if (parliament.echauffement > 0)
    add('Échauffement de l’hémicycle (questions au gouvernement)', parliament.echauffement);
  if (parliament.apaisement > 0)
    add(
      'Apaisement (discours, commémoration, sommet, réunion de la majorité)',
      -parliament.apaisement,
    );

  const raw = facteurs.reduce((sum, f) => sum + f.valeur, 0);
  const valeur = Math.min(100, Math.max(0, raw));
  if (valeur !== raw)
    facteurs.push({
      libelle: valeur === 0 ? 'Plancher du jeu (0)' : 'Plafond du jeu (100)',
      valeur: valeur - raw,
    });
  return { valeur, facteurs, censure: null };
}

/**
 * Recalcule la tension de l'état (la projection d'une censure tient compte de la nouvelle
 * valeur) : fin de l'étape 5 du quinquennat, ouverture d'un quinquennat, nouvelle Assemblée.
 */
export function updateTension(state: GameState, ruleset: Ruleset): void {
  const parliament = state.parlement;
  if (!parliament) return;
  parliament.tension = computeTension(state, ruleset);
  const projection = state.quinquennat ? censureVote(state, ruleset, null) : null;
  parliament.tension.censure = projection
    ? { pour: projection.pour, majorite: projection.majorite }
    : null;
}

/**
 * Semaine du Parlement (fin de l'étape 5) : la fronde de fond se résorbe en partie (et
 * disparaît dans les groupes qui ne soutiennent plus le président), l'apaisement décroît,
 * puis la tension est recalculée.
 */
export function weeklyTension(state: GameState, ruleset: Ruleset): void {
  const parliament = state.parlement;
  if (!parliament) return;
  const { baisseHebdomadaire } = ruleset.parlement.frondeurs;
  for (const [id, n] of Object.entries(parliament.fronde)) {
    // Au moins un député quitte la fronde chaque semaine.
    const kept = n - Math.max(1, Math.round(n * baisseHebdomadaire));
    if (parliament.groupes[id]?.alignement !== 'soutien' || kept <= 0) delete parliament.fronde[id];
    else parliament.fronde[id] = kept;
  }
  parliament.apaisement = Math.floor(
    parliament.apaisement * (1 - ruleset.parlement.tension.decroissanceApaisement),
  );
  // Questions au gouvernement (phase 15) : l'échauffement de l'hémicycle retombe peu à peu.
  parliament.echauffement = Math.floor(
    parliament.echauffement * (1 - ruleset.parlement.qag.decroissanceEchauffement),
  );
  updateTension(state, ruleset);
}
