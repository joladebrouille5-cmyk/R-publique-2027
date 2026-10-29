import {
  describeIndicatorChange,
  FAVORABLE_RISE,
  QAG_HISTORY,
  signedHundredths,
  type GameState,
  type PendingDecision,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import type { CouncilBook } from './conseil';
import { weekReaches } from './dates';
import type { EconomyBook } from './economy';
import { memberInCharge, memberName, postCompetenceOf } from './members';

// Questions au gouvernement (phase 15). Règle citée (Constitution, art. 48) : une séance par
// semaine au moins est réservée aux questions des parlementaires et aux réponses du gouvernement.
// Chaque semaine de session ordinaire (hors intersession), un groupe d'opposition — jamais un
// député nommé — interpelle le gouvernement sur un thème (plus probable quand son indicateur
// s'est dégradé depuis le début du mandat) ; le ministre du thème répond (réponse simulée, aucun
// propos attribué) selon la ligne choisie par le président : répondre sur le fond, annoncer une
// mesure, contre-attaquer. Effets : échauffement ou apaisement de l'hémicycle (tension
// parlementaire), popularité du président modulée par la compétence du ministre, économie.

export const QAG_EVENT = 'questions-au-gouvernement';

export type QagContext = {
  state: GameState;
  ruleset: Ruleset;
  ledger: Ledger;
  economy: EconomyBook | null;
  council: CouncilBook;
  presidentId: string;
  step: number;
};

const pct = (value: number) => `${Math.round(value * 100)} %`;

/** Semaine de séance (session ordinaire, hors intersession du jeu de règles). */
export function qagSitting(state: GameState, ruleset: Ruleset): boolean {
  return !ruleset.parlement.qag.moisSansSeance.includes(Number(state.meta.date.slice(5, 7)));
}

/** Groupe qui interpelle : un groupe d'opposition (sinon non aligné), au prorata des sièges. */
function questioningGroup(state: GameState, ruleset: Ruleset): string | null {
  const parliament = state.parlement!;
  const pick = (alignment: 'opposition' | 'independant') =>
    ruleset.assemblee.groupes
      .filter((g) => !g.nonInscrits)
      .map((g) => ({ id: g.id, seats: parliament.groupes[g.id] }))
      .filter((g) => g.seats && g.seats.alignement === alignment && g.seats.sieges > 0)
      .map((g) => ({ id: g.id, weight: g.seats!.sieges }))
      .sort((a, b) => compareStrings(a.id, b.id));
  const groups = pick('opposition').length > 0 ? pick('opposition') : pick('independant');
  if (groups.length === 0) return null;
  const rng = stream(state.meta.seed, state.meta.week, 'qag', 'groupe');
  let target = rng.nextFloat() * groups.reduce((sum, g) => sum + g.weight, 0);
  return (groups.find((g) => (target -= g.weight) < 0) ?? groups.at(-1)!).id;
}

/** Thème de la semaine : poids plus fort quand son indicateur s'est dégradé depuis le départ. */
function questionTheme(state: GameState, ruleset: Ruleset): string {
  const rules = ruleset.parlement.qag;
  const start = state.quinquennat?.depart.indicateurs;
  const now = state.economie?.indicateurs;
  const themes = rules.themes.map((t) => {
    let weight = 1;
    if (t.indicateur && start && now) {
      const before = start[t.indicateur];
      const after = now[t.indicateur];
      if (before !== undefined && after !== undefined) {
        const worse = FAVORABLE_RISE[t.indicateur] ? after < before : after > before;
        if (worse) weight = rules.poidsDegradation;
      }
    }
    return { id: t.id, weight };
  });
  const rng = stream(state.meta.seed, state.meta.week, 'qag', 'theme');
  let target = rng.nextFloat() * themes.reduce((sum, t) => sum + t.weight, 0);
  return (themes.find((t) => (target -= t.weight) < 0) ?? themes.at(-1)!).id;
}

function groupName(ruleset: Ruleset, groupeId: string): string {
  const group = ruleset.assemblee.groupes.find((g) => g.id === groupeId);
  return group ? `${group.libelle} (${group.sigle})` : groupeId;
}

/** Effets d'une réplique, en clair (hypothèses du jeu). */
function replySummary(reply: Ruleset['parlement']['qag']['reponses'][number]): string {
  const parts = [
    `tension de l’hémicycle ${signedHundredths(reply.tension * 100)} (${reply.tension > 0 ? 'échauffement' : 'apaisement'})`,
    `popularité du président ${signedHundredths(reply.popularite)} pt (selon la compétence du ministre)`,
    ...reply.economie.map((e) => describeIndicatorChange(e.indicateur, e.valeur)),
  ];
  return `${reply.description} Effets (hypothèses du jeu) : ${parts.join(', ')}.`;
}

/**
 * Séance de questions au gouvernement de la semaine (fin de l'étape 5), en session ordinaire,
 * une fois le gouvernement en place : le président joueur choisit la ligne de la réplique (la
 * semaine suivante) ; le président IA retient la réplique par défaut. Renvoie l'événement.
 */
export function holdQag(context: QagContext, playerPresides: boolean): ReportEvent[] {
  const { state, ruleset, presidentId } = context;
  const quinquennat = state.quinquennat;
  if (!quinquennat?.gouvernement || !state.parlement) return [];
  if (!weekReaches(state.meta.date, quinquennat.mandat.debut)) return [];
  if (!qagSitting(state, ruleset)) return [];
  if (state.pendingDecisions.some((d) => d.kind === 'qag')) return [];
  const groupeId = questioningGroup(state, ruleset);
  if (!groupeId) return [];
  const rules = ruleset.parlement.qag;
  const theme = rules.themes.find((t) => t.id === questionTheme(state, ruleset))!;
  const member = memberInCharge(state, theme.poste)!;
  const poste = theme.poste
    ? (ruleset.quinquennat.postes.find((p) => p.id === theme.poste)?.libelle ?? theme.poste)
    : 'Premier ministre';
  const group = groupName(ruleset, groupeId);
  const sigle = ruleset.assemblee.groupes.find((g) => g.id === groupeId)?.sigle ?? groupeId;
  const week = state.meta.week;
  const label = `Questions au gouvernement : le groupe ${sigle} interpelle sur ${theme.libelle}`;
  const description = `Séance de questions au gouvernement (Constitution, art. 48) : le groupe ${group} interpelle le gouvernement sur ${theme.libelle}. Répond pour le gouvernement : ${memberName(state, ruleset, member)} (${poste}) — réponse simulée, aucun propos n’est attribué, aucun député n’est nommé.`;
  let decisionId: string | null = null;
  let outcome = '';
  if (playerPresides) {
    const decision: PendingDecision = {
      id: `q-${week}`,
      kind: 'qag',
      eventId: QAG_EVENT,
      actorId: presidentId,
      createdWeek: week,
      label,
      description: `${description} Choisissez la ligne de la réplique ; sans choix de votre part, le gouvernement répond sur le fond.`,
      options: rules.reponses.map((r) => ({
        id: r.id,
        libelle: r.libelle,
        description: replySummary(r),
      })),
      defaultOptionId: rules.reponseParDefaut,
      groupeId,
      themeId: theme.id,
      ...(theme.poste ? { posteId: theme.poste } : {}),
    };
    state.pendingDecisions.push(decision);
    decisionId = decision.id;
  } else {
    const reply = rules.reponses.find((r) => r.id === rules.reponseParDefaut)!;
    answerQag(context, { createdWeek: week, groupeId, themeId: theme.id }, reply.id);
    outcome = ` Ligne retenue par le président (IA) : ${reply.libelle}.`;
  }
  return [
    {
      id: `qag-${week}`,
      kind: 'evenement',
      refId: QAG_EVENT,
      label,
      description: `${description}${outcome}`,
      nature: 'simule',
      majeur: false,
      decisionId,
    },
  ];
}

/**
 * Réplique du gouvernement (président joueur ou IA) : échauffement ou apaisement de
 * l'hémicycle, popularité du président modulée par la compétence du ministre du thème
 * (× (1 + modulation × (compétence − 0,5))), économie, mémoire des séances. Renvoie le libellé.
 */
export function answerQag(
  context: QagContext,
  question: Pick<PendingDecision, 'createdWeek' | 'groupeId' | 'themeId'>,
  reponseId: string,
): string {
  const { state, ruleset, ledger, economy, council, presidentId, step } = context;
  const rules = ruleset.parlement.qag;
  const theme = rules.themes.find((t) => t.id === question.themeId);
  const reply = rules.reponses.find((r) => r.id === reponseId);
  const parliament = state.parlement;
  if (!theme || !reply || !question.groupeId)
    throw new Error(`Questions au gouvernement inconnues : ${question.themeId}/${reponseId}`);
  if (!parliament) return `${theme.libelle} : ${reply.libelle}`;
  const member = memberInCharge(state, theme.poste);
  const competence = member ? postCompetenceOf(state, ruleset, member, theme.poste) : 0.5;
  const name = member ? memberName(state, ruleset, member) : 'le gouvernement';
  const value = Math.round(reply.popularite * (1 + reply.modulation * (competence - 0.5)));
  const label = `Questions au gouvernement (${theme.libelle}) : ${reply.libelle}`;
  ledger.apply(presidentId, 'popularite', [
    {
      label: `${label} — ${name} (compétence ${pct(competence)}, hypothèse de jeu)`,
      value,
      source: 'decision',
      step,
    },
  ]);
  if (reply.tension > 0)
    parliament.echauffement = Math.min(100, parliament.echauffement + reply.tension);
  else parliament.apaisement = Math.min(100, parliament.apaisement - reply.tension);
  if (economy)
    for (const e of reply.economie) economy.add(e.indicateur, label, e.valeur, 'decision');
  parliament.qag = [
    ...parliament.qag,
    {
      semaine: question.createdWeek,
      groupeId: question.groupeId,
      themeId: theme.id,
      reponseId: reply.id,
      tension: reply.tension,
      popularite: value,
    },
  ].slice(-QAG_HISTORY);
  if (member) council.note(member.ref, `${label} (${groupName(ruleset, question.groupeId)})`);
  return label;
}
