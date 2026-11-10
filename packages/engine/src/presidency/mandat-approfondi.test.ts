import { membersMajority, type GameState, type Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { stream } from '../core/random';
import { advance, newGame, playToEnd, QUIET, sponsorship, withEvents } from '../core/testing';
import { distance } from '../election/model';
import {
  coherentWithAssembly,
  governmentDecision,
  openQuinquennat,
  presidentOf,
  primeMinisterProposals,
  PRIME_MINISTER_PROPOSALS,
} from './government';
import { memberInCharge, memberName, memberTraits } from './members';
import { alignmentOf, assemblyGroups } from './parliament';
import { pickQagBank, QAG_EVENT, qagBanks, qagContexts } from './qag';
import { FOLLOW_UP_EVENT, followUpChance } from './urgences';

// Phase 25 ter : le mandat présidentiel approfondi. Cinq propositions pour Matignon cohérentes
// avec l'Assemblée, questions au gouvernement plus courtes aux répliques variées, suivi des
// décisions ministérielles 2 à 5 semaines plus tard (critères d'acceptation 1 à 4).

const RULES = QUIET;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const SITTING = withEvents({ [QAG_EVENT]: 1 });
const ALL_URGENCIES = withEvents(Object.fromEntries(RULES.urgences.liste.map((u) => [u.id, 1])));

const elected = playToEnd(newGame({ seed: 'mandat-approfondi' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;

function playerElected(): GameState {
  const state = clone(elected);
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
}

function step(state: GameState, ruleset: Ruleset = RULES, answers: Record<string, string> = {}) {
  return advance(
    state,
    [],
    state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: answers[d.kind] ?? d.defaultOptionId,
    })),
    ruleset,
  );
}

function govern(start: GameState): GameState {
  let state = start;
  for (
    let i = 0;
    i < 8 &&
    (!state.quinquennat!.gouvernement ||
      state.pendingDecisions.some((d) => d.kind === 'gouvernement'));
    i++
  )
    state = step(state).state;
  if (!state.quinquennat!.gouvernement) throw new Error('Gouvernement non nommé');
  return state;
}

/** Première semaine où le président joueur doit nommer son Premier ministre. */
function nominationPending(start: GameState): GameState {
  let state = start;
  for (let i = 0; i < 8 && !state.pendingDecisions.some((d) => d.kind === 'gouvernement'); i++)
    state = step(state).state;
  return state;
}

const nominating = nominationPending(playerElected());
const governed = govern(nominating);

/** Assemblée tirée au hasard (sièges, alignements) et président placé n'importe où. */
function randomAssembly(base: GameState, index: number): GameState {
  const state = clone(base);
  const rng = stream('assemblees-variees', index);
  const president = state.actors[PLAYER_ACTOR_ID]!;
  president.candidate.positionnement = {
    economie: Math.round(rng.nextFloat() * 180 - 90),
    societe: Math.round(rng.nextFloat() * 180 - 90),
  };
  // Sièges tirés au hasard ; alignements recalculés d'après la position du président (moteur).
  for (const group of assemblyGroups(RULES)) {
    const seats = state.parlement!.groupes[group.id]!;
    seats.sieges = Math.floor(rng.nextFloat() * 150);
    seats.alignement = alignmentOf(RULES, group, president);
  }
  const opposition = Object.values(state.parlement!.groupes)
    .filter((g) => g.alignement === 'opposition')
    .reduce((sum, g) => sum + g.sieges, 0);
  state.legislatives!.derniere.cohabitation = opposition >= membersMajority(state.parlement!);
  return state;
}

describe('Matignon : cinq propositions cohérentes avec l’Assemblée (critère 1)', () => {
  it('la décision de nomination propose cinq personnalités, justifiées, en tête de liste', () => {
    const decision = nominating.pendingDecisions.find((d) => d.kind === 'gouvernement')!;
    expect(decision.propositions).toHaveLength(PRIME_MINISTER_PROPOSALS);
    expect(decision.options.slice(0, 5).map((o) => o.id)).toEqual(
      decision.propositions!.map((p) => p.optionId),
    );
    for (const p of decision.propositions!) {
      expect(p.justification.length).toBeGreaterThan(10);
      expect(p.forces.length + p.limites.length).toBeGreaterThanOrEqual(1);
      expect(p.forces.length).toBeLessThanOrEqual(2);
      expect(p.limites.length).toBeLessThanOrEqual(2);
    }
    // Réelles et fictives : au moins un profil fictif parmi les cinq.
    expect(
      decision.propositions!.some((p) =>
        RULES.quinquennat.profils.some((x) => x.id === p.optionId),
      ),
    ).toBe(true);
    // La liste complète reste ouverte au joueur.
    expect(decision.options.length).toBeGreaterThan(PRIME_MINISTER_PROPOSALS);
    expect(decision.contexte).toMatch(
      /^Assemblée nationale issue des législatives de 2024 \(groupes actuels\) : \d+ sièges pour votre camp, \d+ pour l’opposition, \d+ non alignés ; majorité absolue : \d+\. /,
    );
    expect(decision.contexte).toMatch(/cohabitation/i);
  });

  it('sur 120 Assemblées variées, 100 % des propositions sont cohérentes avec la situation', () => {
    let cohabitations = 0;
    let majorities = 0;
    for (let i = 0; i < 120; i++) {
      const state = randomAssembly(nominating, i);
      const president = presidentOf(state);
      const proposals = primeMinisterProposals(state, RULES, president);
      expect(proposals, `Assemblée ${i}`).toHaveLength(PRIME_MINISTER_PROPOSALS);
      expect(new Set(proposals.map((p) => p.member.ref)).size).toBe(PRIME_MINISTER_PROPOSALS);
      const cohabitation = state.legislatives!.derniere.cohabitation;
      if (cohabitation) cohabitations++;
      else majorities++;
      const decision = governmentDecision(state, RULES);
      expect(decision.contexte).toContain(
        cohabitation ? 'Cohabitation' : 'cohabitation improbable',
      );
      for (const { member } of proposals) {
        expect(coherentWithAssembly(state, RULES, president, member), `${i} ${member.ref}`).toBe(
          true,
        );
        const position = memberTraits(state, RULES, member).position;
        if (cohabitation) {
          // Camp majoritaire : la position moyenne des groupes d'opposition, pondérée par sièges.
          const groups = RULES.assemblee.groupes.filter(
            (g) => state.parlement!.groupes[g.id]?.alignement === 'opposition',
          );
          const seats = groups.reduce((s, g) => s + state.parlement!.groupes[g.id]!.sieges, 0);
          const mean = (axis: 'economie' | 'societe') =>
            Math.round(
              groups.reduce(
                (s, g) => s + state.parlement!.groupes[g.id]!.sieges * g.position[axis],
                0,
              ) / seats,
            );
          const majority = { economie: mean('economie'), societe: mean('societe') };
          expect(distance(position, majority)).toBeLessThan(
            distance(position, president.candidate.positionnement),
          );
        }
      }
    }
    expect(cohabitations).toBeGreaterThan(10);
    expect(majorities).toBeGreaterThan(10);
  });
});

/** Ancien texte d'introduction des questions au gouvernement (phases 15 à 25), pour la mesure. */
function formerIntro(state: GameState, groupeId: string, themeId: string): string {
  const group = RULES.assemblee.groupes.find((g) => g.id === groupeId)!;
  const theme = RULES.parlement.qag.themes.find((t) => t.id === themeId)!;
  const member = memberInCharge(state, theme.poste)!;
  const poste = theme.poste
    ? RULES.quinquennat.postes.find((p) => p.id === theme.poste)!.libelle
    : 'Premier ministre';
  return `Séance de questions au gouvernement (Constitution, art. 48) : le groupe ${group.libelle} (${group.sigle}) interpelle le gouvernement sur ${theme.libelle}. Répond pour le gouvernement : ${memberName(state, RULES, member)} (${poste}) — réponse simulée, aucun propos n’est attribué, aucun député n’est nommé. Choisissez la ligne de la réplique ; sans choix de votre part, le gouvernement répond sur le fond.`;
}

/** Joue des semaines de séance jusqu'à `count` questions, réponses par défaut. */
function sittings(start: GameState, count: number, seed?: string) {
  let state = clone(start);
  if (seed) state.meta.seed = seed;
  const questions = [];
  for (let i = 0; i < count * 4 && questions.length < count; i++) {
    const result = step(state, SITTING);
    state = result.state;
    // Une question posée cette semaine attend la réplique du président.
    const question = state.pendingDecisions.find(
      (d) => d.kind === 'qag' && d.createdWeek === result.report.week,
    );
    if (question) questions.push({ question, state });
  }
  return questions;
}

describe('questions au gouvernement : moins de texte, répliques variées (critères 2 et 3)', () => {
  it('texte d’introduction réduit d’au moins 30 % ; légende : simulation, aucun propos', () => {
    const sample = sittings(governed, 20);
    expect(sample).toHaveLength(20);
    let before = 0;
    let after = 0;
    for (const { question, state } of sample) {
      before += formerIntro(state, question.groupeId!, question.themeId!).length;
      after += question.description.length;
      expect(question.description).toMatch(/^Le groupe \S+ interpelle .+ \(.+\) sur .+\.$/);
      expect(question.contexte).toMatch(/Séance simulée/);
      expect(question.contexte).toMatch(/Aucun propos attribué, aucun député nommé/);
    }
    const reduction = 1 - after / before;
    expect(reduction).toBeGreaterThanOrEqual(0.3);
  });

  it('au moins quatre banques distinctes, jamais quatre jeux identiques de suite sur 20 séances', () => {
    expect(qagBanks(RULES).length).toBeGreaterThanOrEqual(5);
    const seen = new Set<string>();
    for (const seed of ['qag-a', 'qag-b', 'qag-c']) {
      const sets = sittings(governed, 20, seed).map(({ question }) =>
        question.options.map((o) => o.id).join('|'),
      );
      expect(sets).toHaveLength(20);
      for (let i = 3; i < sets.length; i++)
        expect(new Set(sets.slice(i - 3, i + 1)).size, `${seed} séance ${i}`).toBeGreaterThan(1);
      // Plus fort : jamais deux séances de suite avec les mêmes répliques.
      for (let i = 1; i < sets.length; i++) expect(sets[i]).not.toBe(sets[i - 1]);
      for (const s of sets) seen.add(s);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('banque tirée selon le contexte : cohabitation, majorité, nature du sujet', () => {
    const state = clone(governed);
    state.legislatives!.derniere.cohabitation = true;
    expect(qagContexts(state, RULES, 'securite')).toEqual(['tous', 'cohabitation', 'regalien']);
    state.legislatives!.derniere.cohabitation = false;
    const contexts = qagContexts(state, RULES, 'emploi');
    expect(contexts).toContain('social');
    expect(contexts.filter((c) => c.startsWith('majorite'))).toHaveLength(1);
    for (let week = 0; week < 40; week++) {
      state.meta.week = week;
      const bank = pickQagBank(state, RULES, 'securite');
      expect(
        bank.contextes.includes('tous') ||
          bank.contextes.some((c) => qagContexts(state, RULES, 'securite').includes(c)),
      ).toBe(true);
    }
  });

  it('effets variés : la réplique touche le Premier ministre (popularité prêtée)', () => {
    const first = step(governed, SITTING);
    const question = first.state.pendingDecisions.find((d) => d.kind === 'qag')!;
    const bank = RULES.parlement.qag.banques.find((b) => b.id === 'apaisement')!;
    const reply = bank.reponses.find((r) => r.id === 'tendre-la-main')!;
    // La séance propose la banque « Apaiser l'hémicycle » (options posées pour le test).
    question.options = bank.reponses.map((r) => ({
      id: r.id,
      libelle: r.libelle,
      description: r.description,
    }));
    const result = step(first.state, SITTING, { qag: 'tendre-la-main' });
    const pm = first.state.quinquennat!.gouvernement!.premierMinistre.ref;
    const conseil = result.report.conseil!.ministres.find((m) => m.ref === pm)!;
    expect(conseil.popularite.facteurs).toContainEqual(
      expect.objectContaining({ value: reply.premierMinistre!.popularite }),
    );
    expect(result.state.parlement!.qag.at(-1)).toMatchObject({ reponseId: 'tendre-la-main' });
  });
});

describe('suivi des décisions ministérielles (critère 4)', () => {
  /** Semaines jouées avec une urgence chaque semaine possible, réponses par défaut. */
  function mandate(weeks: number) {
    let state = clone(governed);
    const reports = [];
    for (let i = 0; i < weeks; i++) {
      const result = step(state, ALL_URGENCIES);
      reports.push(result.report);
      state = result.state;
    }
    return { state, reports };
  }
  const { state, reports } = mandate(30);
  const suivis = state.quinquennat!.suivisDecisions;

  it('chaque décision tranchée enclenche un suivi, échéance à 2 à 5 semaines', () => {
    const answered = reports.flatMap((r) =>
      r.decisions.filter((d) => d.decisionId.startsWith('u-')),
    );
    expect(answered.length).toBeGreaterThanOrEqual(5);
    expect(suivis).toHaveLength(answered.length);
    for (const suivi of suivis) {
      expect(suivi.echeance - suivi.semaine).toBeGreaterThanOrEqual(2);
      expect(suivi.echeance - suivi.semaine).toBeLessThanOrEqual(5);
    }
    const delays = new Set(suivis.map((s) => s.echeance - s.semaine));
    expect(delays.size).toBeGreaterThan(1);
  });

  it('le bilan tombe à l’échéance, chiffré, clairement favorable ou défavorable', () => {
    const due = suivis.filter((s) => s.echeance <= state.meta.week - 1);
    expect(due.length).toBeGreaterThanOrEqual(3);
    for (const suivi of due) {
      expect(suivi.statut).toBe('fait');
      const bilan = suivi.bilan!;
      expect(Math.sign(bilan.popularite)).toBe(bilan.favorable ? 1 : -1);
      expect(Math.abs(bilan.popularite)).toBeGreaterThanOrEqual(RULES.urgences.suivi.plancher);
      expect(bilan.texte).toMatch(bilan.favorable ? /^Bilan favorable/ : /^Bilan défavorable/);
      expect(bilan.texte).toMatch(/popularité du président [+−]\d/);
      const report = reports.find((r) => r.week === suivi.echeance)!;
      const event = report.events.find((e) => e.id === `suivi-${suivi.id}`)!;
      expect(event).toMatchObject({ refId: FOLLOW_UP_EVENT, nature: 'simule' });
      expect(event.description).toContain(suivi.libelle);
      const factor = report.changes
        .find((c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite')!
        .factors.find((f) => f.label.startsWith(`${event.label} — bilan `))!;
      expect(factor.value).toBe(bilan.popularite);
    }
    for (const suivi of suivis.filter((s) => s.echeance > state.meta.week - 1))
      expect(suivi.statut).toBe('en-cours');
  });

  it('effets échelonnés : la part différée n’est pas appliquée à la décision', () => {
    const suivi = suivis[0]!;
    const report = reports.find((r) => r.week === suivi.semaine)!;
    const urgency = RULES.urgences.liste.find((u) => u.id === suivi.urgenceId)!;
    const choice = urgency.choix.find((c) => c.id === suivi.choixId)!;
    const total = Math.round(choice.popularite * (0.5 + suivi.competence));
    expect(suivi.popularite).toBe(Math.round(total * RULES.urgences.suivi.partDifferee));
    const factor = report.changes
      .find((c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite')!
      .factors.find((f) => f.label.startsWith(`${urgency.libelle} — ${choice.libelle}`))!;
    expect(factor.value).toBe(total - suivi.popularite);
    expect(factor.label).toContain('effet immédiat');
  });

  it('chance d’un bilan favorable : la compétence et un choix qui ménage l’opinion aident', () => {
    const base = suivis[0]!;
    expect(followUpChance(RULES, { ...base, competence: 0.9 })).toBeGreaterThan(
      followUpChance(RULES, { ...base, competence: 0.3 }),
    );
    const urgency = RULES.urgences.liste.find((u) => u.id === 'urgence-cyberattaque')!;
    const [good, bad] = [...urgency.choix].sort((a, b) => b.popularite - a.popularite);
    const at = (choixId: string) =>
      followUpChance(RULES, { ...base, urgenceId: urgency.id, choixId, competence: 0.5 });
    expect(at(good!.id)).toBeGreaterThan(at(bad!.id));
  });
});
