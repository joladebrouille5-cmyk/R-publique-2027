import {
  departementOfDistrict,
  GameStateSchema,
  legislativeDepartments,
  type DistrictOutcome,
  type ElectoralPact,
  type GameState,
  type PendingDecision,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, planned, playToEnd, QUIET, sponsorship, TEST_CANDIDATE } from '../core/testing';
import {
  aiCoalitionChoice,
  aiPacts,
  ALLIANCE_DECISION_EVENT,
  allianceOptions,
  answerCoalition,
  blocDistance,
  COALITION_DECISION_EVENT,
  coalitionDecision,
  needsCoalition,
  playerCamp,
} from './alliances';
import { openQuinquennat, presidentOf } from './government';
import { firstRound, presidentBloc, secondRound } from './legislatives';
import { membersMajority } from './parliament';

// Phase 13 (P13-04) : législatives vivantes — campagne, accords électoraux entre blocs,
// mobilisation par les déplacements du président, coalition après une Assemblée sans majorité.

const RULES = QUIET;
const ALLIANCES = RULES.legislatives.alliances;
const { contre: EXCLUDED } = ALLIANCES.frontRepublicain;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const blocLabel = (id: string) => RULES.legislatives.blocs.find((b) => b.id === id)!.libelle;

/** Présidentielle d'un candidat du centre, jouée jusqu'à l'élection. */
const elected = playToEnd(
  newGame(
    {
      seed: 'alliances',
      candidate: { ...TEST_CANDIDATE, positionnement: { economie: 20, societe: -10 } },
    },
    RULES,
  ),
  RULES,
  (s) => sponsorship(s, RULES),
).state;

function step(
  state: GameState,
  actions: string[] = [],
  choose: (decision: PendingDecision) => string = (d) => d.defaultOptionId,
) {
  return advanceWeek(
    state,
    {
      actions: actions.map(planned),
      decisions: state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: choose(d) })),
    },
    { ruleset: RULES },
  );
}

/** Le joueur déclaré élu, gouvernement nommé et ministres confirmés. */
const inOffice = (() => {
  let state = clone(elected);
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  while (
    !state.quinquennat!.gouvernement ||
    state.pendingDecisions.some((d) => d.kind === 'gouvernement')
  )
    state = step(state).state;
  return state;
})();

/** Le joueur dissout l'Assemblée : la campagne des législatives s'ouvre aussitôt. */
const dissolved = step(inOffice, ['dissolution']);

/** Joue jusqu'à ce que `done` soit vrai (au plus huit semaines). */
function playUntil(
  state: GameState,
  done: (s: GameState) => boolean,
  choose?: (d: PendingDecision) => string,
): GameState {
  let current = state;
  for (let i = 0; i < 8 && !done(current); i++) current = step(current, [], choose).state;
  expect(done(current)).toBe(true);
  return current;
}

/** Circonscription fabriquée pour le second tour (100 000 inscrits, personne d'élu). */
function district(voix: Record<string, number>): DistrictOutcome {
  const exprimes = Object.values(voix).reduce((a, b) => a + b, 0);
  return {
    code: '0101',
    inscrits: 100_000,
    t1: { votants: exprimes + 1_000, exprimes, voix },
    t2: null,
    elu: null,
    tour: 1,
    communs: [],
    retraits: [],
  };
}

describe('campagne des législatives (phase 13)', () => {
  it('la dissolution ouvre aussitôt la campagne : accords de l’IA et stratégie du camp du joueur', () => {
    const { state, report } = dissolved;
    const camp = playerCamp(state, RULES)!;
    expect(camp).toBe('centre');
    const campagne = state.legislatives!.campagne!;
    expect(campagne).toEqual({
      alliances: aiPacts(RULES, camp),
      strategieArretee: false,
      mobilisation: {},
    });
    for (const pact of campagne.alliances) {
      expect(pact.origine).toBe('ia');
      expect(pact.blocs).not.toContain(camp);
      // Convention du jeu : aucun accord de l'IA avec le bloc visé par le front républicain.
      if (pact.type !== 'front-republicain') expect(pact.blocs).not.toContain(EXCLUDED);
    }
    expect(
      report.events.find((e) => e.id === `campagne-legislatives-${inOffice.meta.week}`),
    ).toMatchObject({
      refId: 'legislatives',
      nature: 'simule',
    });
    const decision = state.pendingDecisions.find((d) => d.kind === 'alliance')!;
    expect(decision).toMatchObject({ eventId: ALLIANCE_DECISION_EVENT, actorId: PLAYER_ACTOR_ID });
    expect(decision.options.map((o) => o.id)).toEqual(
      allianceOptions(RULES, camp).map((o) => o.id),
    );
    expect(decision.options[0]!.id).toBe('aucune');
    expect(decision.options.map((o) => o.id)).toContain('front-republicain');
    // Un partenaire n'accepte que s'il est assez proche.
    for (const option of decision.options) {
      const [type, partner] = option.id.split(':');
      if (!partner) continue;
      expect(blocDistance(RULES, camp, partner)).toBeLessThanOrEqual(
        type === 'investitures' ? ALLIANCES.distanceInvestitures : ALLIANCES.distanceDesistements,
      );
    }
    // Option par défaut : celle que l'IA retiendrait (plus proche voisin mutuel).
    expect(decision.defaultOptionId).toBe('desistements:divers');
    expect(decision.description).toMatch(/aucun accord réel/);
    expect(GameStateSchema.safeParse(state).error).toBeUndefined();
  });

  it('en mode observateur, aucun camp n’attend de décision : tous les blocs suivent la règle de l’IA', () => {
    expect(aiPacts(RULES, null)).toEqual(
      expect.arrayContaining([
        { type: 'front-republicain', blocs: ['gauche', 'centre'], contre: EXCLUDED, origine: 'ia' },
      ]),
    );
    for (const pact of aiPacts(RULES, null))
      if (pact.type === 'desistements') {
        expect(pact.blocs).toHaveLength(2);
        expect(pact.blocs).not.toContain(EXCLUDED);
        expect(blocDistance(RULES, pact.blocs[0]!, pact.blocs[1]!)).toBeLessThanOrEqual(
          ALLIANCES.distanceDesistements,
        );
      }
  });

  it('investitures communes : un seul candidat des deux alliés au premier tour', () => {
    const answered = step(dissolved.state, [], (d) =>
      d.kind === 'alliance' ? 'investitures:droite' : d.defaultOptionId,
    );
    const pact: ElectoralPact = {
      type: 'investitures',
      blocs: ['centre', 'droite'],
      contre: null,
      origine: 'joueur',
    };
    expect(answered.state.legislatives!.campagne).toMatchObject({ strategieArretee: true });
    expect(answered.state.legislatives!.campagne!.alliances).toContainEqual(pact);
    expect(
      answered.report.events.find((e) => e.id === `alliance-${dissolved.state.meta.week}`)!.label,
    ).toBe(`Investitures communes avec le bloc « ${blocLabel('droite')} »`);

    const round1 = playUntil(answered.state, (s) => s.legislatives!.premierTour !== null);
    let common = 0;
    for (const d of round1.legislatives!.premierTour!) {
      expect('centre' in d.t1.voix && 'droite' in d.t1.voix).toBe(false);
      expect(Object.values(d.t1.voix).reduce((a, b) => a + b, 0)).toBe(d.t1.exprimes);
      if (d.communs.length === 0) continue;
      common += 1;
      expect(d.communs).toHaveLength(1);
      expect(['centre', 'droite']).toContain(d.communs[0]);
      expect(d.t1.voix[d.communs[0]!]).toBeUndefined();
    }
    expect(common).toBeGreaterThan(0);

    const after = playUntil(round1, (s) => s.legislatives!.derniere.motif === 'dissolution');
    const outcome = after.legislatives!.derniere;
    expect(outcome.alliances).toContainEqual(pact);
    expect(outcome.circonscriptions).toHaveLength(577);
    expect(Object.values(outcome.siegesParBloc).reduce((a, b) => a + b, 0)).toBe(577);
    expect(after.legislatives!.campagne).toBeNull();
    // Nouvelle Assemblée : aucune fronde héritée.
    expect(after.parlement!.fronde).toEqual({});
    expect(GameStateSchema.safeParse(after).error).toBeUndefined();
  });

  it('second tour : désistements réciproques et front républicain, report des voix, jamais moins de deux candidats', () => {
    const front: ElectoralPact = {
      type: 'front-republicain',
      blocs: ['centre', 'gauche'],
      contre: EXCLUDED,
      origine: 'ia',
    };
    const triangular = district({ gauche: 20_000, centre: 15_000, [EXCLUDED]: 25_000 });
    const [withFront] = secondRound(RULES, [triangular], [front]);
    expect(withFront!.retraits).toEqual(['centre']);
    expect(Object.keys(withFront!.t2!.voix).sort()).toEqual([EXCLUDED, 'gauche'].sort());
    expect(withFront!.t2!.voix.gauche).toBeGreaterThanOrEqual(
      20_000 + Math.floor(ALLIANCES.reportDesistement * 15_000),
    );
    const [without] = secondRound(RULES, [triangular], []);
    expect(without!.retraits).toEqual([]);
    expect(Object.keys(without!.t2!.voix)).toHaveLength(3);

    const allies: ElectoralPact = {
      type: 'desistements',
      blocs: ['centre', 'droite'],
      contre: null,
      origine: 'joueur',
    };
    const [allied] = secondRound(
      RULES,
      [district({ gauche: 20_000, droite: 18_000, centre: 15_000 })],
      [allies],
    );
    expect(allied!.retraits).toEqual(['centre']);
    expect(Object.keys(allied!.t2!.voix).sort()).toEqual(['droite', 'gauche']);

    // Duel : personne ne se retire.
    const [duel] = secondRound(
      RULES,
      [district({ gauche: 30_000, centre: 20_000 })],
      [{ type: 'desistements', blocs: ['centre', 'gauche'], contre: null, origine: 'ia' }],
    );
    expect(duel!.retraits).toEqual([]);
    expect(Object.keys(duel!.t2!.voix)).toHaveLength(2);

    // Chaîne : la droite se retire pour le centre, qui se retire à son tour (front républicain) ;
    // les voix reportées vont au candidat resté en lice.
    const [chain] = secondRound(
      RULES,
      [district({ [EXCLUDED]: 30_000, gauche: 20_000, centre: 15_000, droite: 14_000 })],
      [allies, front],
    );
    expect(chain!.retraits).toEqual(['centre', 'droite']);
    expect(Object.keys(chain!.t2!.voix).sort()).toEqual([EXCLUDED, 'gauche'].sort());
    expect(chain!.t2!.voix.gauche).toBeGreaterThanOrEqual(
      20_000 +
        Math.floor(ALLIANCES.reportDesistement * 15_000) +
        Math.floor(ALLIANCES.reportDesistement * 14_000),
    );

    for (const d of [withFront!, without!, allied!, duel!, chain!]) {
      expect(Object.values(d.t2!.voix).reduce((a, b) => a + b, 0)).toBe(d.t2!.exprimes);
      expect(d.t2!.exprimes).toBeLessThanOrEqual(d.t2!.votants);
      expect(d.t2!.votants).toBeLessThanOrEqual(d.inscrits);
      expect(Object.keys(d.t2!.voix)).toContain(d.elu);
      expect(Object.keys(d.t2!.voix).length).toBeGreaterThanOrEqual(2);
    }
    // Déterminisme.
    expect(secondRound(RULES, [triangular], [front])).toEqual([withFront]);
  });

  it('mobilisation : chaque déplacement du président pendant la campagne renforce son camp dans le département, dans une limite', () => {
    const { parDeplacement, max } = ALLIANCES.mobilisation;
    const one = step(dissolved.state, ['deplacement-presidentiel@75']).state;
    expect(one.legislatives!.campagne!.mobilisation).toEqual({ '75': parDeplacement });
    const many = step(dissolved.state, Array(5).fill('deplacement-presidentiel@75')).state;
    expect(many.legislatives!.campagne!.mobilisation).toEqual({
      '75': Math.min(max, 5 * parDeplacement),
    });
    // Hors campagne, un déplacement ne mobilise rien.
    expect(step(inOffice, ['deplacement-presidentiel@75']).state.legislatives!.campagne).toBeNull();

    const president = presidentOf(many);
    const camp = presidentBloc(RULES, president);
    const flat = clone(many);
    flat.legislatives!.campagne!.mobilisation = {};
    const mobilised = firstRound(many, RULES, president);
    const reference = firstRound(flat, RULES, president);
    let paris = 0;
    mobilised.forEach((d, i) => {
      const base = reference[i]!;
      if (departementOfDistrict(d.code) !== '75') {
        expect(d).toEqual(base);
        return;
      }
      if (!(camp in base.t1.voix)) return;
      paris += 1;
      expect(d.t1.voix[camp]! / d.t1.exprimes).toBeGreaterThan(
        base.t1.voix[camp]! / base.t1.exprimes,
      );
    });
    expect(paris).toBeGreaterThan(0);
  });
});

describe('carte des législatives simulées (phase 13)', () => {
  it('regroupe les résultats par département : circonscriptions, voix du tour choisi, sièges', () => {
    const president = presidentOf(inOffice);
    const outcomes = secondRound(
      RULES,
      firstRound(inOffice, RULES, president),
      aiPacts(RULES, null),
    );
    const total = <T>(map: Map<string, T>, f: (d: T) => number) =>
      [...map.values()].reduce((sum, d) => sum + f(d), 0);
    const seats = (d: { sieges: Record<string, number> }) =>
      Object.values(d.sieges).reduce((a, b) => a + b, 0);
    const t1 = legislativeDepartments(outcomes, 1);
    const t2 = legislativeDepartments(outcomes, 2);
    expect(total(t1, (d) => d.circonscriptions)).toBe(577);
    expect(total(t2, (d) => d.circonscriptions)).toBe(577);
    // Au premier tour, seuls les élus dès le premier tour ; après le second, les 577.
    expect(total(t1, seats)).toBe(outcomes.filter((d) => d.tour === 1).length);
    expect(total(t2, seats)).toBe(577);
    for (const map of [t1, t2])
      for (const d of map.values())
        expect(Object.values(d.voix).reduce((a, b) => a + b, 0)).toBe(d.exprimes);
    // Le second tour n'a lieu que là où personne n'a été élu au premier.
    expect(total(t2, (d) => d.exprimes)).toBe(
      outcomes.reduce((sum, d) => sum + (d.t2?.exprimes ?? 0), 0),
    );
  });
});

describe('coalition (phase 13)', () => {
  const president = presidentOf(inOffice);

  it('sans majorité, le président peut former une coalition avec un bloc proche ou gouverner en minorité', () => {
    // Le président du centre ne dispose pas de la majorité dans l'Assemblée de 2024.
    expect(needsCoalition(inOffice)).toBe(true);
    const decision = coalitionDecision(inOffice, RULES, president);
    expect(decision).toMatchObject({
      kind: 'alliance',
      eventId: COALITION_DECISION_EVENT,
      actorId: PLAYER_ACTOR_ID,
    });
    expect(decision.options.at(-1)!.id).toBe('minorite');
    const camp = presidentBloc(RULES, president);
    const partners = decision.options.slice(0, -1).map((o) => o.id.split(':')[1]!);
    expect(partners.length).toBeGreaterThan(0);
    for (const bloc of partners)
      expect(blocDistance(RULES, camp, bloc)).toBeLessThanOrEqual(ALLIANCES.coalition.distanceMax);
    expect(decision.defaultOptionId).toBe(aiCoalitionChoice(inOffice, RULES, president));

    const bloc = partners[0]!;
    const formed = clone(inOffice);
    const event = answerCoalition(formed, RULES, `coalition:${bloc}`);
    const groups = RULES.legislatives.blocs
      .find((b) => b.id === bloc)!
      .groupes.filter((g) => {
        const current = inOffice.parlement!.groupes[g];
        return current !== undefined && current.sieges > 0 && current.alignement !== 'soutien';
      });
    expect(formed.parlement!.coalition).toEqual({
      bloc,
      groupes: groups,
      depuis: inOffice.meta.week,
    });
    for (const g of groups) expect(formed.parlement!.groupes[g]!.alignement).toBe('soutien');
    expect(formed.parlement!.tension.facteurs).toContainEqual({
      libelle: 'Coalition de gouvernement',
      valeur: -RULES.parlement.tension.coalition,
    });
    expect(event).toMatchObject({
      label: `Coalition de gouvernement avec le bloc « ${blocLabel(bloc)} »`,
      nature: 'simule',
      majeur: true,
    });

    const minority = clone(inOffice);
    expect(answerCoalition(minority, RULES, 'minorite').label).toBe(
      'Le président gouverne en minorité',
    );
    expect(minority.parlement!.coalition).toBeNull();
    expect(minority.parlement!.groupes).toEqual(inOffice.parlement!.groupes);
  });

  it('règle de l’IA : la coalition majoritaire la plus proche, sinon la plus nombreuse', () => {
    const choice = aiCoalitionChoice(inOffice, RULES, president);
    const options = coalitionDecision(inOffice, RULES, president).options.slice(0, -1);
    const camp = presidentBloc(RULES, president);
    const majority = membersMajority(inOffice.parlement!);
    const total = (bloc: string) => {
      const formed = clone(inOffice);
      answerCoalition(formed, RULES, `coalition:${bloc}`);
      return Object.values(formed.parlement!.groupes)
        .filter((g) => g.alignement === 'soutien')
        .reduce((sum, g) => sum + g.sieges, 0);
    };
    const candidates = options.map((o) => {
      const bloc = o.id.split(':')[1]!;
      return { bloc, total: total(bloc), d: blocDistance(RULES, camp, bloc) };
    });
    const winning = candidates.filter((c) => c.total >= majority).sort((a, b) => a.d - b.d);
    const expected =
      winning[0]?.bloc ?? [...candidates].sort((a, b) => b.total - a.total || a.d - b.d)[0]!.bloc;
    expect(choice).toBe(`coalition:${expected}`);
  });

  it('après le second tour, une Assemblée sans majorité appelle la décision du président joueur', () => {
    const after = playUntil(
      dissolved.state,
      (s) => s.legislatives!.derniere.motif === 'dissolution',
    );
    const pending = after.pendingDecisions.find((d) => d.eventId === COALITION_DECISION_EVENT);
    expect(pending !== undefined).toBe(needsCoalition(after));
    expect(after.pendingDecisions.some((d) => d.kind === 'gouvernement')).toBe(true);
    if (!pending) return;
    const next = step(after).state;
    if (pending.defaultOptionId === 'minorite') expect(next.parlement!.coalition).toBeNull();
    else
      expect(next.parlement!.coalition).toMatchObject({
        bloc: pending.defaultOptionId.split(':')[1],
        depuis: after.meta.week,
      });
  });
});
