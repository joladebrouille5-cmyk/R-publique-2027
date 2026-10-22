import { MINISTER_DECISION_EVENT, type GameState, type WeeklyReport } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { proximity } from '../ai/relations';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { EngineInputError } from '../core/errors';
import {
  advance,
  deepFreeze,
  newGame,
  playToEnd,
  playUntil,
  QUIET,
  sponsorship,
} from '../core/testing';
import { addYears, mandateDates, nextCampaignStart, nextCycle } from './dates';
import { acceptsPost, eligibleCandidates, openQuinquennat, presidentOf } from './government';
import { memberTraits, teamCompetence } from './members';

// Phase 6 (P6-01 à P6-03) : calendrier institutionnel, investiture, gouvernement, président IA.

const RULES = QUIET;
const { proximiteMin, ministresActeursMax } = RULES.quinquennat.acceptation;
const POSTES = RULES.quinquennat.postes.map((p) => p.id);

/** Présidentielle jouée jusqu'à l'élection : le vainqueur (IA ici) ouvre le quinquennat. */
const elected = playToEnd(newGame({ seed: 'quinquennat' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;

/**
 * Même partie où le joueur est déclaré élu : l'ouverture du quinquennat est celle qu'effectue
 * le moteur au second tour (les tests de sauvegarde couvrent une victoire réelle du joueur).
 */
function playerElected(): GameState {
  const state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
}

const defaults = (state: GameState) =>
  state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId }));

function untilGovernment(state: GameState): { state: GameState; report: WeeklyReport } {
  let current = state;
  for (let i = 0; i < 6; i++) {
    const result = advance(current, [], defaults(current), RULES);
    current = result.state;
    if (current.quinquennat!.gouvernement) return { state: current, report: result.report };
  }
  throw new Error('Gouvernement non nommé');
}

describe('calendrier institutionnel', () => {
  it('fait commencer et finir les mandats cinq ans jour pour jour après 2022', () => {
    expect(mandateDates(RULES, { annee: 2027, decalageSemaines: 0 })).toEqual({
      debut: '2027-05-14',
      fin: '2032-05-13',
    });
    expect(mandateDates(RULES, { annee: 2032, decalageSemaines: 261 })).toEqual({
      debut: '2032-05-14',
      fin: '2037-05-13',
    });
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(nextCycle(RULES, elected.cycle)).toEqual({ annee: 2032, decalageSemaines: 261 });
    // Campagne suivante : la date de départ de la partie décalée de 261 semaines (un lundi).
    expect(nextCampaignStart(elected, RULES)).toBe('2031-09-29');
  });
});

describe('investiture et gouvernement', () => {
  it('la victoire ouvre la présidence ; le président IA nomme son gouvernement à l’investiture', () => {
    expect(elected.meta.phase).toBe('presidence');
    expect(elected.calendar.blockedBy).toBeNull();
    const president = presidentOf(elected);
    expect(president.status).toBe('elu');
    expect(president.id).not.toBe(PLAYER_ACTOR_ID);
    expect(elected.quinquennat!.gouvernement).toBeNull();

    const { state, report } = untilGovernment(elected);
    // Semaine du lundi 10 mai 2027, qui contient l'investiture du 14 mai.
    expect(report.date).toBe('2027-05-10');
    const government = state.quinquennat!.gouvernement!;
    expect(government).toMatchObject({ numero: 1, nommeLe: '2027-05-10' });
    expect(government.ministres.map((m) => m.posteId)).toEqual(POSTES);
    const members = [government.premierMinistre, ...government.ministres].map((m) => m.ref);
    expect(new Set(members).size).toBe(members.length);
    expect(members).not.toContain(president.id);
    expect(members).not.toContain(PLAYER_ACTOR_ID);
    const actorMinisters = government.ministres.filter((m) => m.nature === 'acteur');
    expect(actorMinisters.length).toBeLessThanOrEqual(ministresActeursMax);
    for (const m of actorMinisters)
      expect(proximity(president, state.actors[m.ref]!)).toBeGreaterThanOrEqual(proximiteMin);
    for (const m of government.ministres.filter((g) => g.nature === 'profil'))
      expect(RULES.quinquennat.profils.some((p) => p.id === m.ref)).toBe(true);
    expect(report.events.find((e) => e.refId === 'gouvernement')).toMatchObject({
      nature: 'simule',
      label: expect.stringMatching(/^Gouvernement n° 1 : .* Premier ministre$/),
    });
  });

  it('même graine ⇒ même gouvernement', () => {
    expect(untilGovernment(elected).state).toEqual(untilGovernment(elected).state);
  });

  it('le joueur élu nomme lui-même son Premier ministre, après l’investiture seulement', () => {
    const start = playerElected();
    expect(start.pendingDecisions).toEqual([]);
    // Avant l'investiture, le président élu ne peut encore rien faire.
    const before = advance(start, ['allocution'], [], RULES);
    expect(before.report.actions[0]).toMatchObject({
      status: 'rejetee',
      reason: 'Le mandat commence le vendredi 14 mai 2027.',
    });
    const decision = before.state.pendingDecisions[0]!;
    expect(decision).toMatchObject({ kind: 'gouvernement', actorId: PLAYER_ACTOR_ID });
    const optionIds = decision.options.map((o) => o.id);
    for (const profile of RULES.quinquennat.profils) expect(optionIds).toContain(profile.id);
    expect(optionIds).not.toContain(PLAYER_ACTOR_ID);
    expect(optionIds).toContain(decision.defaultOptionId);
    // La décision est obligatoire avant de continuer.
    expect(() => advance(before.state, [], [], RULES)).toThrow(EngineInputError);

    const profile = RULES.quinquennat.profils[0]!.id;
    const named = advance(
      before.state,
      [],
      [{ decisionId: decision.id, optionId: profile }],
      RULES,
    );
    expect(named.state.quinquennat!.gouvernement!.premierMinistre).toEqual({
      nature: 'profil',
      ref: profile,
    });
    expect(named.report.decisions[0]).toMatchObject({ optionId: profile, automatic: false });
    // Le président pourvoit ensuite les ministères régaliens : une décision par ministère, la
    // proposition du Premier ministre par défaut.
    const government = named.state.quinquennat!.gouvernement!;
    const regalian = RULES.quinquennat.equipe.postesRegaliens;
    expect(named.state.pendingDecisions.map((d) => d.id)).toEqual(
      regalian.map((p) => `g-${before.state.meta.week}-${p}`),
    );
    for (const d of named.state.pendingDecisions) {
      const posteId = d.id.replace(/^g-\d+-/, '');
      expect(d).toMatchObject({ kind: 'gouvernement', eventId: MINISTER_DECISION_EVENT });
      expect(d.defaultOptionId).toBe(government.ministres.find((m) => m.posteId === posteId)!.ref);
      expect(d.options[0]!.id).toBe(d.defaultOptionId);
    }
  });

  it('une personnalité éloignée peut refuser Matignon : refus simulé, nouvelle décision', () => {
    const asked = advance(playerElected(), [], [], RULES).state;
    const president = presidentOf(asked);
    const decision = asked.pendingDecisions[0]!;
    const far = Object.values(asked.actors).find(
      (a) =>
        a.id !== president.id &&
        proximity(president, a) < proximiteMin &&
        !acceptsPost(asked, RULES, president, a),
    )!;
    expect(far).toBeDefined();
    const refused = advance(asked, [], [{ decisionId: decision.id, optionId: far.id }], RULES);
    expect(refused.state.quinquennat!.gouvernement).toBeNull();
    expect(refused.state.quinquennat!.refus).toEqual([
      { acteurId: far.id, semaine: asked.meta.week, posteId: 'premier-ministre' },
    ]);
    expect(refused.report.events.find((e) => e.refId === 'gouvernement')!.label).toMatch(
      /décline Matignon \(refus simulé\)$/,
    );
    const again = refused.state.pendingDecisions[0]!;
    expect(again.kind).toBe('gouvernement');
    expect(again.options.map((o) => o.id)).not.toContain(far.id);

    // Un allié proche accepte toujours.
    const ally = Object.values(asked.actors)
      .filter((a) => a.id !== president.id && proximity(president, a) >= proximiteMin)
      .sort((a, b) => proximity(president, b) - proximity(president, a))[0]!;
    expect(ally).toBeDefined();
    const accepted = advance(asked, [], [{ decisionId: decision.id, optionId: ally.id }], RULES);
    expect(accepted.state.quinquennat!.gouvernement!.premierMinistre).toEqual({
      nature: 'acteur',
      ref: ally.id,
    });
  });
});

/** Gouvernement du joueur nommé, ministres régaliens confirmés (options par défaut). */
const governed = (() => {
  const asked = advance(playerElected(), [], [], RULES).state;
  const named = advance(asked, [], defaults(asked), RULES).state;
  return advance(named, [], defaults(named), RULES).state;
})();

describe('actions du président', () => {
  it('allocution et déplacement passent par le registre, avec l’usure du pouvoir', () => {
    const { report, state } = advance(
      governed,
      ['allocution', 'deplacement-presidentiel@2A'],
      [],
      RULES,
    );
    expect(report.actions.map((a) => [a.actionId, a.status, a.cible])).toEqual([
      ['allocution', 'validee', null],
      ['deplacement-presidentiel', 'validee', 'Corse-du-Sud (2A)'],
    ]);
    const popularity = report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    expect(popularity.factors.map((f) => f.label)).toContain('Usure du pouvoir (hypothèse de jeu)');
    for (const change of report.changes)
      expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
        change.after - change.before,
      );
    expect(state.actors[PLAYER_ACTOR_ID]!.resources.popularite).toBe(popularity.after);
    expect(report.steps.find((s) => s.step === 7)).toMatchObject({ active: true });
    expect(report.economie.length).toBeGreaterThan(0);
  });

  it('refuse une cible manquante ou inconnue et le dépassement du temps', () => {
    const { report } = advance(
      governed,
      ['deplacement-presidentiel', 'deplacement-presidentiel@99', 'meeting'],
      [],
      RULES,
    );
    expect(report.actions.map((a) => a.reason)).toEqual([
      'Choisissez le département du déplacement.',
      'Cible inconnue : 99.',
      'Action inconnue pour le président dans ce jeu de règles.',
    ]);
  });

  it('un remaniement met fin au gouvernement et ouvre la nomination d’un nouveau Premier ministre', () => {
    const { state, report } = advance(governed, ['remaniement', 'remaniement'], [], RULES);
    expect(report.actions.map((a) => a.status)).toEqual(['validee', 'rejetee']);
    const q = state.quinquennat!;
    expect(q.gouvernement).toBeNull();
    expect(q.anciensGouvernements).toEqual([
      {
        numero: 1,
        premierMinistre: governed.quinquennat!.gouvernement!.premierMinistre,
        debut: governed.quinquennat!.gouvernement!.nommeLe,
        fin: governed.meta.date,
        motif: 'remaniement',
      },
    ]);
    const decision = state.pendingDecisions[0]!;
    expect(decision.kind).toBe('gouvernement');
    const next = advance(
      state,
      [],
      [{ decisionId: decision.id, optionId: decision.defaultOptionId }],
      RULES,
    ).state;
    expect(next.quinquennat!.gouvernement!.numero).toBe(2);
    expect(advance(next, ['remaniement'], defaults(next), RULES).report.actions[0]!.status).toBe(
      'validee',
    );
  });

  it('ne modifie pas l’état reçu', () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(governed)) as GameState);
    expect(() => advance(frozen, ['allocution'], [], RULES)).not.toThrow();
  });
});

describe('quinquennat du président IA', () => {
  it('le joueur battu suit le quinquennat sans pouvoir agir', () => {
    expect(() => advance(elected, ['allocution'], [], RULES)).toThrow(EngineInputError);
    expect(() =>
      advanceWeek(
        elected,
        { actions: [], decisions: [], programme: { ajouter: ['ret-age-60'], retirer: [] } },
        { ruleset: RULES },
      ),
    ).toThrow(EngineInputError);
  });

  it('se déroule jusqu’à la campagne de 2032, qui s’ouvre avec le même moteur', () => {
    const { state, reports } = playUntil(elected, () => false, RULES);
    // playUntil s'arrête au plus tard après 80 semaines : on poursuit jusqu'à la campagne.
    let current = state;
    const all = [...reports];
    while (current.meta.phase === 'presidence') {
      const result = advance(current, [], defaults(current), RULES);
      all.push(result.report);
      current = result.state;
    }
    expect(current.calendar.blockedBy).toBeNull();
    expect(current.meta).toMatchObject({ date: '2031-09-29', phase: 'campagne' });
    expect(current.cycle).toEqual({ annee: 2032, decalageSemaines: 261 });
    expect(all.at(-1)!.phaseChange).toEqual({ from: 'presidence', to: 'campagne' });
    const president = presidentOf(state);
    const inOffice = all.slice(0, -1);
    expect(inOffice.filter((r) => r.actions.some((a) => a.actorId === president.id)).length).toBe(
      inOffice.filter((r) => r.date >= '2027-05-10').length,
    );
    for (const report of all)
      for (const change of report.changes)
        expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
          change.after - change.before,
        );
  });
});

describe('figures réelles au gouvernement (phase 11)', () => {
  const asked = advance(playerElected(), [], [], RULES).state;
  const pmDecision = asked.pendingDecisions[0]!;
  const president = presidentOf(asked);
  const figures = RULES.figures.figures;

  it('propose les figures réelles pour Matignon, sans propos, avec compétence et proximité', () => {
    const options = new Map(pmDecision.options.map((o) => [o.id, o]));
    for (const f of figures) {
      const option = options.get(f.id)!;
      expect(option.libelle).toBe(`${f.prenom} ${f.nom} — ${f.parti}`);
      expect(option.description).toMatch(/aucun propos ne lui est attribué/);
      expect(option.description).toMatch(/Compétence estimée : \d+ %/);
      expect(option.description).toMatch(/Proximité avec vous : \d+\/100/);
      expect(option.description).not.toMatch(/[«»“”"]/);
    }
  });

  it('nomme une figure proche à Matignon ; la popularité prêtée passe par le registre', () => {
    const ally = eligibleCandidates(asked, RULES, president).find(
      (c) => c.member.nature === 'figure' && c.proximite >= proximiteMin,
    )!;
    expect(ally).toBeDefined();
    const named = advance(
      asked,
      [],
      [{ decisionId: pmDecision.id, optionId: ally.member.ref }],
      RULES,
    );
    const government = named.state.quinquennat!.gouvernement!;
    expect(government.premierMinistre).toEqual(ally.member);
    const figure = figures.find((f) => f.id === ally.member.ref)!;
    const reference = RULES.jeu.opinion.popularite.reference;
    const expected = Math.round(
      RULES.quinquennat.equipe.nomination.premierMinistre *
        (RULES.quinquennat.equipe.popularite[figure.notoriete.niveau - 1]! - reference),
    );
    const popularity = named.report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    const factor = popularity.factors.find((f) => f.label.startsWith('Nomination de'));
    if (expected === 0) expect(factor).toBeUndefined();
    else expect(factor).toMatchObject({ value: expected, source: 'decision' });
    // Action du gouvernement : compétence de l'équipe, chaque semaine, par le registre.
    const team = teamCompetence(named.state, RULES, government);
    const action = popularity.factors.find((f) => f.label.startsWith('Action du gouvernement'));
    const weekly = Math.round(RULES.quinquennat.equipe.actionHebdomadaire * (team - 0.5));
    if (weekly === 0) expect(action).toBeUndefined();
    else expect(action!.value).toBe(weekly);
    for (const change of named.report.changes)
      expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
        change.after - change.before,
      );
    // Les ministres proposés comptent des figures proches, dans la limite du jeu de règles.
    const real = government.ministres.filter((m) => m.nature !== 'profil');
    expect(real.length).toBeGreaterThan(0);
    expect(real.length).toBeLessThanOrEqual(ministresActeursMax);
  });

  it('remplace un ministre régalien ; une figure éloignée peut refuser (refus simulé)', () => {
    const named = advance(asked, [], defaults(asked), RULES).state;
    const government = named.quinquennat!.gouvernement!;
    const decision = named.pendingDecisions.find((d) => d.id.endsWith('-interieur'))!;
    const members = new Set(
      [government.premierMinistre, ...government.ministres].map((m) => m.ref),
    );
    const candidates = eligibleCandidates(named, RULES, president).filter(
      (c) => c.member.nature === 'figure' && !members.has(c.member.ref),
    );
    const near = candidates.find((c) => c.proximite >= proximiteMin)!;
    const others = (id: string, optionId: string) =>
      named.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.id === id ? optionId : d.defaultOptionId,
      }));
    const accepted = advanceWeek(
      named,
      { actions: [], decisions: others(decision.id, near.member.ref) },
      { ruleset: RULES },
    );
    const interior = accepted.state.quinquennat!.gouvernement!.ministres.find(
      (m) => m.posteId === 'interieur',
    )!;
    expect(interior).toEqual({ ...near.member, posteId: 'interieur' });
    expect(
      accepted.report.events.find((e) => e.id.startsWith('ministre-interieur'))!.label,
    ).toMatch(/nommé\(e\) au ministère « Intérieur »$/);

    const far = candidates.find(
      (c) =>
        c.proximite < proximiteMin &&
        !acceptsPost(
          named,
          RULES,
          president,
          {
            id: c.member.ref,
            candidate: { positionnement: memberTraits(named, RULES, c.member).position },
          },
          'interieur',
        ),
    )!;
    expect(far).toBeDefined();
    const refused = advanceWeek(
      named,
      { actions: [], decisions: others(decision.id, far.member.ref) },
      { ruleset: RULES },
    );
    expect(
      refused.state.quinquennat!.gouvernement!.ministres.find((m) => m.posteId === 'interieur'),
    ).toEqual(government.ministres.find((m) => m.posteId === 'interieur'));
    expect(refused.state.quinquennat!.refus).toContainEqual({
      acteurId: far.member.ref,
      semaine: named.meta.week,
      posteId: 'interieur',
    });
    expect(
      refused.report.events.some((e) =>
        /décline le ministère « Intérieur » \(refus simulé\)$/.test(e.label),
      ),
    ).toBe(true);
  });

  it('même graine et mêmes choix ⇒ même gouvernement et mêmes effets', () => {
    const once = advance(asked, [], defaults(asked), RULES);
    const twice = advance(asked, [], defaults(asked), RULES);
    expect(once.state).toEqual(twice.state);
    expect(once.report.changes).toEqual(twice.report.changes);
  });

  it('le président IA nomme aussi des figures proches, avec les mêmes règles', () => {
    let state = elected;
    for (let i = 0; i < 6 && !state.quinquennat!.gouvernement; i++)
      state = advance(state, [], defaults(state), RULES).state;
    const government = state.quinquennat!.gouvernement!;
    const ai = presidentOf(state);
    for (const m of [government.premierMinistre, ...government.ministres].filter(
      (x) => x.nature === 'figure',
    ))
      expect(
        proximity(ai, {
          id: m.ref,
          candidate: { positionnement: memberTraits(state, RULES, m).position },
        }),
      ).toBeGreaterThanOrEqual(proximiteMin);
    expect(state.pendingDecisions.filter((d) => d.eventId === MINISTER_DECISION_EVENT)).toEqual([]);
  });
});
