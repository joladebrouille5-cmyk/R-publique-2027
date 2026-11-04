import {
  actionCompetenceFactor,
  ParliamentTensionSchema,
  postOfDomain,
  themeIndicatorEffects,
  themeSupport,
  type GameState,
  type WeeklyReport,
} from '@r2027/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { proposalsById } from '../campaign/programme';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { advance, newGame, playToEnd, QUIET, sponsorship, TEST_CANDIDATE } from '../core/testing';
import {
  planPresidentActions,
  presidentialActionBlocked,
  validatePresidencyActions,
} from './actions';
import { openQuinquennat } from './government';
import { memberTraits } from './members';
import {
  billChoices,
  billDecision,
  domainCompetence,
  engagementFactor,
  groupSupport,
  isKeyVote,
  oppositionIntervention,
  projectVote,
  rebelShare,
  rebelsOf,
  reformKept,
  sessionOf,
  tallyVote,
} from './parliament';
import { computeTension, updateTension, weeklyTension } from './tension';

// Phase 13 : mandat vivant — tension parlementaire, frondeurs, interventions de l'opposition,
// motions de censure spontanées, coût du 49.3, effets thématiques des ministres et actions du
// chef de l'État.

const RULES = QUIET;
const PROGRAMME = [
  'eco-simplification-pme',
  'pa-prime-partage-valeur',
  'immi-integration-langue',
  'emploi-formation-continue',
  'edu-autonomie-etablissements',
  'dip-integration-europeenne',
];
const proposals = proposalsById(RULES);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const PROFILES = [...RULES.quinquennat.profils].sort((a, b) => b.competence - a.competence);
/** Profil fictif le plus compétent, et un profil de compétence moyenne (0,5 : aucun effet). */
const BEST = PROFILES[0]!;
const AVERAGE = PROFILES.find((p) => p.competence === 0.5)!;
const action = (id: string) => RULES.quinquennat.actions.find((a) => a.id === id)!;

/** Campagne d'un candidat de centre droit qui annonce son programme, jouée jusqu'à l'élection. */
const campaign = (() => {
  let state = newGame(
    {
      seed: 'mandat',
      candidate: { ...TEST_CANDIDATE, positionnement: { economie: 20, societe: -10 } },
    },
    RULES,
  );
  state = advanceWeek(
    state,
    { actions: [], decisions: [], programme: { ajouter: PROGRAMME, retirer: [] } },
    { ruleset: RULES },
  ).state;
  return playToEnd(state, RULES, (s) => sponsorship(s, RULES)).state;
})();

/** Le joueur déclaré élu (ouverture du quinquennat identique à celle du moteur). */
function playerElected(): GameState {
  const state = clone(campaign);
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
}

type Choose = (kind: string, options: string[], fallback: string) => string;

/** Semaine jouée : actions du joueur, décisions par défaut sauf choix contraire. */
function step(state: GameState, actions: string[] = [], choose?: Choose) {
  return advance(
    state,
    actions,
    state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: choose
        ? choose(
            d.kind,
            d.options.map((o) => o.id),
            d.defaultOptionId,
          )
        : d.defaultOptionId,
    })),
    RULES,
  );
}

/** Joue jusqu'à ce qu'une décision du type demandé attende le président joueur. */
function untilDecision(state: GameState, kind: string): GameState {
  let current = state;
  for (let i = 0; i < 120; i++) {
    if (current.pendingDecisions.some((d) => d.kind === kind)) return current;
    current = step(current).state;
  }
  throw new Error(`Aucune décision « ${kind} »`);
}

/** Gouvernement du joueur nommé, ministres régaliens confirmés (options par défaut). */
const governed = (() => {
  let state = playerElected();
  for (
    let i = 0;
    i < 6 &&
    (!state.quinquennat!.gouvernement ||
      state.pendingDecisions.some((d) => d.kind === 'gouvernement'));
    i++
  )
    state = step(state).state;
  return state;
})();

/** Premier texte incertain soumis au président joueur. */
const asked = untilDecision(playerElected(), 'texte');
const seance = asked.parlement!.textes.find((b) => b.etape === 'seance')!;

/** Équipe entière de compétence moyenne, puis `profile` au poste demandé. */
function withMinister(state: GameState, posteId: string, profile = AVERAGE): GameState {
  const copy = clone(state);
  const government = copy.quinquennat!.gouvernement!;
  government.premierMinistre = { nature: 'profil', ref: AVERAGE.id };
  government.ministres = government.ministres.map((m) => ({
    nature: 'profil',
    ref: m.posteId === posteId ? profile.id : AVERAGE.id,
    posteId: m.posteId,
  }));
  return copy;
}

const groupsWhere = (state: GameState, alignment: string) =>
  Object.entries(state.parlement!.groupes)
    .filter(([, g]) => g.alignement === alignment && g.sieges > 0)
    .sort((a, b) => b[1].sieges - a[1].sieges)
    .map(([id]) => id);

describe('tension parlementaire (phase 13)', () => {
  const session = sessionOf(RULES, governed.meta.date);

  it('propriété : somme exacte de facteurs nommés, bornée de 0 à 100', () => {
    const groups = Object.keys(governed.parlement!.groupes);
    const supporter = groupsWhere(governed, 'soutien')[0]!;
    fc.assert(
      fc.property(
        fc.record({
          group: fc.constantFrom(...groups),
          seats: fc.nat(450),
          popularite: fc.nat(10_000),
          engagements: fc.nat(3),
          motions: fc.nat(3),
          fronde: fc.nat(80),
          apaisement: fc.nat(100),
          tensions: fc.nat(10_000),
          coalition: fc.boolean(),
        }),
        (p) => {
          const state = clone(governed);
          const parliament = state.parlement!;
          parliament.groupes[p.group]!.sieges = p.seats;
          state.actors[PLAYER_ACTOR_ID]!.resources.popularite = p.popularite;
          parliament.usage49_3 = { session, autres: p.engagements };
          parliament.motionsSession = { session, nombre: p.motions };
          parliament.fronde = p.fronde > 0 ? { [supporter]: p.fronde } : {};
          parliament.apaisement = p.apaisement;
          state.economie!.indicateurs.tensions = p.tensions;
          parliament.coalition = p.coalition
            ? { bloc: 'droite', groupes: ['dr'], depuis: state.meta.week }
            : null;
          const tension = computeTension(state, RULES);
          expect(tension.facteurs.reduce((sum, f) => sum + f.valeur, 0)).toBe(tension.valeur);
          expect(tension.valeur).toBeGreaterThanOrEqual(0);
          expect(tension.valeur).toBeLessThanOrEqual(100);
          for (const f of tension.facteurs) {
            expect(Number.isInteger(f.valeur)).toBe(true);
            expect(f.valeur).not.toBe(0);
          }
          expect(ParliamentTensionSchema.safeParse(tension).error).toBeUndefined();
        },
      ),
      { numRuns: 150 },
    );
  });

  it('chaque facteur suit la situation ; plancher et plafond sont des facteurs explicites', () => {
    const rules = RULES.parlement.tension;
    const base = computeTension(governed, RULES);
    expect(base.facteurs[0]).toEqual({
      libelle: 'Débat parlementaire ordinaire (base du jeu)',
      valeur: rules.base,
    });
    // Le président de centre droit n'a pas la majorité absolue à l'Assemblée de 2024.
    expect(base.facteurs.map((f) => f.libelle)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Opposition : \d+ sièges sur \d+$/),
        expect.stringMatching(/^Majorité manquante : \d+ voix \(\d+ soutiens pour \d+ requises\)$/),
      ]),
    );
    expect(base.valeur).toBeLessThan(100 - rules.par49_3);

    const engaged = clone(governed);
    engaged.parlement!.usage49_3 = { session, autres: 1 };
    const withEngagement = computeTension(engaged, RULES);
    expect(withEngagement.facteurs).toContainEqual({
      libelle: 'Engagement de responsabilité (49.3) dans la session : 1',
      valeur: rules.par49_3,
    });
    expect(withEngagement.valeur).toBe(base.valeur + rules.par49_3);

    const coalition = clone(governed);
    coalition.parlement!.coalition = { bloc: 'droite', groupes: ['dr'], depuis: 0 };
    expect(computeTension(coalition, RULES).facteurs).toContainEqual({
      libelle: 'Coalition de gouvernement',
      valeur: -rules.coalition,
    });

    const calm = clone(governed);
    calm.parlement!.apaisement = 100;
    const floor = computeTension(calm, RULES);
    expect(floor.valeur).toBe(0);
    expect(floor.facteurs.at(-1)).toMatchObject({ libelle: 'Plancher du jeu (0)' });
    expect(floor.facteurs.at(-1)!.valeur).toBeGreaterThan(0);

    const hostile = clone(governed);
    for (const g of Object.values(hostile.parlement!.groupes))
      if (g.alignement !== 'soutien') g.alignement = 'opposition';
    hostile.actors[PLAYER_ACTOR_ID]!.resources.popularite = 0;
    hostile.parlement!.usage49_3 = { session, autres: 3 };
    hostile.parlement!.motionsSession = { session, nombre: 3 };
    const ceiling = computeTension(hostile, RULES);
    expect(ceiling.valeur).toBe(100);
    expect(ceiling.facteurs.at(-1)).toMatchObject({ libelle: 'Plafond du jeu (100)' });
    expect(ceiling.facteurs.at(-1)!.valeur).toBeLessThan(0);
  });

  it('chaque semaine, la fronde se résorbe et l’apaisement décroît', () => {
    const [supporter] = groupsWhere(governed, 'soutien');
    const [other] = groupsWhere(governed, 'independant');
    const state = clone(governed);
    state.parlement!.fronde = { [supporter!]: 10, [other!]: 5 };
    state.parlement!.apaisement = 20;
    weeklyTension(state, RULES);
    const { baisseHebdomadaire } = RULES.parlement.frondeurs;
    // Au moins un député quitte la fronde ; elle disparaît hors des groupes de soutien.
    expect(state.parlement!.fronde).toEqual({
      [supporter!]: 10 - Math.max(1, Math.round(10 * baisseHebdomadaire)),
    });
    expect(state.parlement!.apaisement).toBe(
      Math.floor(20 * (1 - RULES.parlement.tension.decroissanceApaisement)),
    );
    expect(state.parlement!.tension.facteurs.map((f) => f.libelle)).toContain(
      `Fronde dans la majorité : ${state.parlement!.fronde[supporter!]} député(s)`,
    );
    const last = clone(governed);
    last.parlement!.fronde = { [supporter!]: 1 };
    weeklyTension(last, RULES);
    expect(last.parlement!.fronde).toEqual({});
  });
});

describe('frondeurs, opposition et 49.3 (phase 13)', () => {
  it('des frondeurs de la majorité votent contre, en nombre et sans nom ; la négociation ciblée en retient une partie', () => {
    const base = tallyVote(asked, RULES, seance, 'premiere', null);
    const supporter = groupsWhere(asked, 'soutien').find((id) => base.parGroupe[id]!.pour > 0)!;
    expect(supporter).toBeDefined();
    const state = clone(asked);
    state.parlement!.fronde = { [supporter]: 20 };
    updateTension(state, RULES);
    const vote = tallyVote(state, RULES, seance, 'premiere', null);
    const group = vote.parGroupe[supporter]!;
    expect(group.frondeurs).toBeGreaterThan(0);
    expect(group.contre).toBeGreaterThanOrEqual(group.frondeurs);
    expect(group.pour + group.contre + group.abstention).toBeLessThanOrEqual(
      state.parlement!.groupes[supporter]!.sieges,
    );
    // Des nombres seulement : aucun député n'est nommé.
    expect(Object.keys(group).sort()).toEqual(['abstention', 'contre', 'frondeurs', 'pour']);
    expect(rebelsOf(vote)).toBe(
      Object.values(vote.parGroupe).reduce((sum, g) => sum + g.frondeurs, 0),
    );
    // Seuls les groupes qui soutiennent le président connaissent des frondeurs.
    for (const [id, g] of Object.entries(vote.parGroupe))
      if (state.parlement!.groupes[id]!.alignement !== 'soutien') expect(g.frondeurs).toBe(0);

    const negotiated = { ...seance, frondeursNegocies: true };
    expect(
      tallyVote(state, RULES, negotiated, 'premiere', null).parGroupe[supporter]!.frondeurs,
    ).toBeLessThan(group.frondeurs);
    expect(reformKept(RULES, 0, true)).toBeCloseTo(
      1 - RULES.parlement.frondeurs.negociation.reductionEffet,
    );
    expect(billChoices(state, RULES, seance)).toContain('frondeurs');
    expect(billChoices(state, RULES, negotiated)).not.toContain('frondeurs');

    // Le joueur choisit la négociation ciblée : nouveau passage la semaine suivante.
    state.pendingDecisions = state.pendingDecisions.map((d) =>
      d.kind === 'texte' ? billDecision(state, RULES, seance) : d,
    );
    const decision = state.pendingDecisions.find((d) => d.kind === 'texte')!;
    expect(decision.description).toMatch(/dont \d+ frondeurs? de la majorité/);
    const result = step(state, [], (kind, _options, fallback) =>
      kind === 'texte' ? 'frondeurs' : fallback,
    );
    expect(result.state.parlement!.textes.find((b) => b.id === seance.id)).toMatchObject({
      frondeursNegocies: true,
      etape: 'seance',
      echeance: state.meta.week + 1,
    });
    expect(
      result.report.events.some((e) => e.id === `frondeurs-${seance.id}-${state.meta.week}`),
    ).toBe(true);
  });

  it('vote clé : l’opposition ne pèse que sur les groupes non alignés, déjà comptée dans la projection', () => {
    const intervention = oppositionIntervention(asked, RULES)!;
    expect(intervention.groupe).toBe(groupsWhere(asked, 'opposition')[0]);
    expect(intervention.effet).toBe(RULES.parlement.opposition.effet);
    // Meneur : un personnage fictif battu, jamais le président, le joueur ni une personnalité réelle.
    if (intervention.meneur) {
      const leader = asked.actors[intervention.meneur]!;
      expect(leader.candidate.nature).toBe('fictif');
      expect(leader.candidate.personnaliteId ?? null).toBeNull();
      expect([PLAYER_ACTOR_ID, asked.quinquennat!.mandat.presidentId]).not.toContain(leader.id);
    }
    const base = tallyVote(asked, RULES, seance, 'premiere', null);
    const pressed = tallyVote(asked, RULES, seance, 'premiere', null, intervention);
    for (const [id, g] of Object.entries(asked.parlement!.groupes)) {
      if (g.sieges === 0) continue;
      const before = base.parGroupe[id]!;
      const after = pressed.parGroupe[id]!;
      if (g.alignement === 'independant')
        expect(after.pour - after.contre).toBeLessThanOrEqual(before.pour - before.contre);
      else expect(after).toEqual(before);
    }
    expect(pressed.intervention).toEqual(intervention);
    const projection = projectVote(asked, RULES, seance, 'premiere');
    expect(projection.intervention !== null).toBe(isKeyVote(asked, RULES, base));
    expect(projection).toEqual(isKeyVote(asked, RULES, base) ? pressed : base);
    // Sans groupe d'opposition, personne ne mène l'offensive.
    const quiet = clone(asked);
    for (const g of Object.values(quiet.parlement!.groupes))
      if (g.alignement === 'opposition') g.alignement = 'independant';
    expect(oppositionIntervention(quiet, RULES)).toBeNull();
  });

  it('un texte jugé sûr n’est jamais rejeté par une intervention que la projection ignorait', () => {
    // Le joueur soumet tous ses textes au vote : chaque vote clé l'annonce, intervention comprise.
    let state = playerElected();
    const reports: WeeklyReport[] = [];
    for (let i = 0; i < 70; i++) {
      const result = step(state, [], (kind, options, fallback) =>
        kind === 'texte' ? 'voter' : fallback,
      );
      reports.push(result.report);
      state = result.state;
    }
    const votes = state.parlement!.textes.flatMap((b) => b.votes.map((v) => ({ bill: b, v })));
    expect(votes.length).toBeGreaterThan(0);
    for (const { bill, v } of votes) {
      const report = reports.find((r) => r.week === v.semaine)!;
      const announced = report.events.some((e) =>
        e.id.startsWith(`intervention-${bill.id}-${v.lecture}`),
      );
      expect(announced).toBe(v.intervention !== null);
    }
  });

  it('49.3 : coût de popularité majoré par la tension, fronde accrue dans la majorité', () => {
    const tension = asked.parlement!.tension.valeur;
    const decision = asked.pendingDecisions.find((d) => d.kind === 'texte')!;
    expect(decision.description).toContain(`Tension parlementaire : ${tension}/100.`);
    expect(decision.options.find((o) => o.id === '49-3')!.description).toMatch(
      new RegExp(`tension parlementaire \\(?${tension}/100`),
    );
    const factor = engagementFactor(asked, RULES);
    expect(factor).toBeCloseTo(1 + (RULES.parlement.tension.majoration49_3 * tension) / 100);

    const result = step(asked, [], (kind, _options, fallback) =>
      kind === 'texte' ? '49-3' : fallback,
    );
    const popularity = result.report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    const cost = popularity.factors.find((f) =>
      f.label.startsWith('Recours à l’article 49 alinéa 3 sur'),
    )!;
    expect(cost.value).toBe(-Math.round(RULES.parlement.censure.coutPopularite49_3 * factor));
    expect(cost.label).toContain(`(tension parlementaire ${tension}/100)`);
    // La fronde grossit dans les groupes qui soutiennent le président, puis décroît (semaine).
    const { hausse49_3, baisseHebdomadaire } = RULES.parlement.frondeurs;
    for (const [id, g] of Object.entries(asked.parlement!.groupes)) {
      const fronde = result.state.parlement!.fronde[id];
      const raise = Math.round(hausse49_3 * g.sieges);
      if (g.alignement !== 'soutien' || raise === 0) {
        expect(fronde).toBeUndefined();
        continue;
      }
      const raised = Math.min(g.sieges, (asked.parlement!.fronde[id] ?? 0) + raise);
      const kept = raised - Math.max(1, Math.round(raised * baisseHebdomadaire));
      expect(fronde ?? 0).toBe(Math.max(0, kept));
    }
    expect(result.state.parlement!.tension.facteurs).toContainEqual({
      libelle: `Engagement de responsabilité (49.3) dans la session : ${result.state.parlement!.usage49_3.autres}`,
      valeur: result.state.parlement!.usage49_3.autres * RULES.parlement.tension.par49_3,
    });
  });

  it('motions de censure spontanées : sous forte tension seulement, espacées, au plus trois par session', () => {
    const hostile = clone(governed);
    for (const g of Object.values(hostile.parlement!.groupes))
      if (g.alignement !== 'soutien') g.alignement = 'opposition';
    hostile.actors[PLAYER_ACTOR_ID]!.resources.popularite = 0;
    hostile.economie!.indicateurs.tensions = 9_000;
    updateTension(hostile, RULES);
    const rules = RULES.parlement.tension;
    expect(hostile.parlement!.tension.valeur).toBeGreaterThanOrEqual(rules.seuilMotion);

    let state = hostile;
    const reports: WeeklyReport[] = [];
    const tensionAt = new Map<number, number>();
    for (let i = 0; i < 60 && state.meta.phase === 'presidence'; i++) {
      tensionAt.set(state.meta.week, state.parlement!.tension.valeur);
      const result = step(state);
      reports.push(result.report);
      state = result.state;
    }
    const motions = state.parlement!.motions;
    expect(motions.length).toBeGreaterThan(0);
    const dateOf = new Map(reports.map((r) => [r.week, r.date]));
    const perSession = new Map<number, number>();
    motions.forEach((motion, i) => {
      expect(tensionAt.get(motion.semaine)!).toBeGreaterThanOrEqual(rules.seuilMotion);
      const s = sessionOf(RULES, dateOf.get(motion.semaine)!);
      perSession.set(s, (perSession.get(s) ?? 0) + 1);
      if (i > 0)
        expect(motion.semaine - motions[i - 1]!.semaine).toBeGreaterThanOrEqual(
          rules.delaiMotionSemaines,
        );
      expect(motion.adoptee).toBe(motion.pour >= motion.majorite);
      const report = reports.find((r) => r.week === motion.semaine)!;
      const event = report.events.find((e) => e.id === `motion-spontanee-${motion.semaine}`)!;
      expect(event.label).toBe(
        `Motion de censure déposée par l’opposition (art. 49 al. 2) : ${motion.adoptee ? 'adoptée' : 'rejetée'}`,
      );
      // Une motion adoptée renverse le gouvernement.
      if (motion.adoptee)
        expect(
          report.events.some((e) => e.label === 'Le gouvernement, renversé, remet sa démission'),
        ).toBe(true);
    });
    for (const n of perSession.values())
      expect(n).toBeLessThanOrEqual(RULES.parlement.regles.motionsParSession);

    // Sous le seuil, aucune motion spontanée.
    let calm = governed;
    for (let i = 0; i < 20; i++) {
      expect(calm.parlement!.tension.valeur).toBeLessThan(rules.seuilMotion);
      calm = step(calm).state;
    }
    expect(calm.parlement!.motions).toEqual([]);
  });

  it('même graine et mêmes choix ⇒ mêmes votes, même tension, mêmes motions', () => {
    const once = step(asked, [], (kind, _o, fallback) => (kind === 'texte' ? '49-3' : fallback));
    const twice = step(asked, [], (kind, _o, fallback) => (kind === 'texte' ? '49-3' : fallback));
    expect(once.state.parlement).toEqual(twice.state.parlement);
    expect(once.report).toEqual(twice.report);
  });
});

describe('ministres : bonus et malus de leur domaine (phase 13)', () => {
  it('indicateurs du poste, par le registre de l’économie, proportionnels à l’écart de compétence', () => {
    expect(themeIndicatorEffects(RULES, 'economie', 0.5)).toEqual([]);
    expect(themeIndicatorEffects(RULES, 'economie', 1)).toEqual([
      { indicateur: 'confiance', valeur: 8 },
    ]);
    expect(themeIndicatorEffects(RULES, 'economie', 0)).toEqual([
      { indicateur: 'confiance', valeur: -8 },
    ]);
    expect(themeIndicatorEffects(RULES, 'armees', 1)).toEqual([]);

    const { report } = step(withMinister(governed, 'economie', BEST));
    const expected = themeIndicatorEffects(RULES, 'economie', BEST.competence)[0]!;
    const factor = report.economie
      .find((c) => c.indicateur === expected.indicateur)!
      .factors.find(
        (f) => f.source === 'gouvernement' && f.label.startsWith('Économie et Finances : '),
      )!;
    expect(factor.value).toBe(expected.valeur);
    expect(factor.label).toBe(
      `Économie et Finances : ${BEST.prenom} ${BEST.nom} (compétence ${Math.round(BEST.competence * 100)} %, hypothèse de jeu)`,
    );
    for (const change of report.economie)
      expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
        change.after - change.before,
      );
    // Une équipe de compétence moyenne n'a aucun effet de domaine.
    const neutral = step(withMinister(governed, 'economie')).report;
    expect(
      neutral.economie.flatMap((c) => c.factors).filter((f) => f.source === 'gouvernement'),
    ).toEqual([]);
  });

  it('textes du domaine : soutien des groupes accru et frondeurs moins nombreux avec un ministre compétent', () => {
    const proposal = proposals.get(seance.propositionId)!;
    const poste = postOfDomain(RULES, proposal.domaine)!;
    expect(poste).not.toBeNull();
    const strong = withMinister(asked, poste, BEST);
    const neutral = withMinister(asked, poste);
    expect(domainCompetence(strong, RULES, proposal)).toBe(BEST.competence);
    expect(domainCompetence(neutral, RULES, proposal)).toBe(0.5);
    for (const [id, g] of Object.entries(asked.parlement!.groupes)) {
      if (g.sieges === 0) continue;
      expect(
        groupSupport(strong, RULES, seance, id) - groupSupport(neutral, RULES, seance, id),
      ).toBeCloseTo(themeSupport(RULES, BEST.competence));
    }
    for (const id of groupsWhere(asked, 'soutien')) {
      const group = RULES.assemblee.groupes.find((g) => g.id === id)!;
      expect(
        rebelShare(strong, RULES, group, seance, proposal, BEST.competence),
      ).toBeLessThanOrEqual(rebelShare(neutral, RULES, group, seance, proposal, 0.5));
    }
  });
});

describe('actions du chef de l’État (phase 13)', () => {
  it('délai entre deux emplois et une fois par semaine, avec un motif explicite', () => {
    const first = step(governed, ['commemoration', 'commemoration']);
    expect(first.report.actions.map((a) => [a.actionId, a.status, a.reason])).toEqual([
      ['commemoration', 'validee', null],
      ['commemoration', 'rejetee', 'Une seule fois par semaine.'],
    ]);
    expect(first.state.quinquennat!.usages).toMatchObject({ commemoration: governed.meta.week });
    const second = step(first.state, ['commemoration']);
    expect(second.report.actions[0]).toMatchObject({
      status: 'rejetee',
      reason:
        'Encore 7 semaine(s) avant de pouvoir renouveler cette action (une fois toutes les 8 semaines au plus).',
    });
    let state = second.state;
    while (state.meta.week < governed.meta.week + 8) state = step(state).state;
    expect(step(state, ['commemoration']).report.actions[0]!.status).toBe('validee');
  });

  it('sommet de crise : seulement après une crise ; économie et Parlement par leurs registres', () => {
    expect(step(governed, ['sommet-crise']).report.actions[0]).toMatchObject({
      status: 'rejetee',
      reason:
        'Aucune crise dans les 4 dernières semaines : un sommet de crise n’a pas lieu d’être.',
    });
    const crisis = clone(governed);
    crisis.eventHistory[RULES.crises[0]!.id] = { count: 1, lastWeek: crisis.meta.week - 1 };
    const { report, state } = step(crisis, ['sommet-crise']);
    expect(report.actions[0]).toMatchObject({ status: 'validee' });
    // Sans poste attitré, le Premier ministre module l'action.
    const pm = memberTraits(crisis, RULES, crisis.quinquennat!.gouvernement!.premierMinistre);
    const factor = actionCompetenceFactor(RULES, pm.competence);
    const summit = action('sommet-crise');
    for (const effect of summit.economie!) {
      const change = report.economie.find((c) => c.indicateur === effect.indicateur)!;
      expect(change.factors).toContainEqual({
        label: summit.libelle,
        value: Math.round(effect.valeur * factor) + 0,
        source: 'action',
      });
    }
    // Apaisement accordé, puis décroissance de la semaine ; facteur négatif de la tension.
    const apaisement = Math.floor(
      summit.parlement!.apaisement * (1 - RULES.parlement.tension.decroissanceApaisement),
    );
    expect(state.parlement!.apaisement).toBe(apaisement);
    if (apaisement > 0)
      expect(state.parlement!.tension.facteurs).toContainEqual({
        libelle: 'Apaisement (discours, commémoration, sommet, réunion de la majorité)',
        valeur: -apaisement,
      });
  });

  it('le ministre du poste module l’action : facteur nommé au registre, économie proportionnelle', () => {
    const negotiation = action('negociation-sociale');
    const strong = withMinister(governed, negotiation.poste!, BEST);
    const { report } = step(strong, [negotiation.id]);
    const factor = actionCompetenceFactor(RULES, BEST.competence);
    const popularity = report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    const prefix = `${negotiation.libelle} : Travail et Emploi, `;
    const named = popularity.factors.find((f) => f.label.startsWith(prefix))!;
    expect(named).toMatchObject({
      label: `${negotiation.libelle} : Travail et Emploi, ${BEST.prenom} ${BEST.nom} (compétence ${Math.round(BEST.competence * 100)} %, hypothèse de jeu)`,
      value: Math.round((factor - 1) * negotiation.effets[0]!.base),
      source: 'action',
    });
    const tensions = report.economie
      .find((c) => c.indicateur === 'tensions')!
      .factors.find((f) => f.source === 'action')!;
    expect(tensions.value).toBe(Math.round(negotiation.economie![0]!.valeur * factor));
    for (const change of report.changes)
      expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
        change.after - change.before,
      );
    // Ministre de compétence moyenne : aucun facteur de modulation.
    const neutral = step(withMinister(governed, negotiation.poste!), [negotiation.id]).report;
    expect(neutral.changes.flatMap((c) => c.factors).some((f) => f.label.startsWith(prefix))).toBe(
      false,
    );
  });

  it('discours devant le Congrès : une fois par an, apaisement et fronde résorbée', () => {
    const congress = action('discours-congres');
    expect(congress.sourceId).toBe('constitution-art-18');
    expect(RULES.sources['constitution-art-18']).toBeDefined();
    const [supporter] = groupsWhere(governed, 'soutien');
    const state = clone(governed);
    state.parlement!.fronde = { [supporter!]: 20 };
    const { state: after, report } = step(state, [congress.id]);
    expect(report.actions[0]!.status).toBe('validee');
    const reduced = Math.round(20 * (1 - congress.parlement!.fronde));
    const { baisseHebdomadaire } = RULES.parlement.frondeurs;
    expect(after.parlement!.fronde[supporter!]).toBe(
      reduced - Math.max(1, Math.round(reduced * baisseHebdomadaire)),
    );
    expect(after.parlement!.apaisement).toBe(
      Math.floor(
        congress.parlement!.apaisement * (1 - RULES.parlement.tension.decroissanceApaisement),
      ),
    );
    expect(presidentialActionBlocked(after, congress)).toBe(
      `Encore ${congress.delaiSemaines! - 1} semaine(s) avant de pouvoir renouveler cette action (une fois toutes les ${congress.delaiSemaines} semaines au plus).`,
    );
  });

  it('le président IA emploie les actions du chef de l’État selon sa règle, sans enfreindre un délai', () => {
    let ai = playToEnd(newGame({ seed: 'mandat-ia', mode: 'observateur' }, RULES), RULES).state;
    while (!ai.quinquennat!.gouvernement) ai = step(ai).state;
    const presidentId = ai.quinquennat!.mandat.presidentId;
    const plan = (state: GameState) =>
      planPresidentActions(state, RULES, (codes) => codes[0]!).map((p) => p.actionId);

    const crisis = clone(ai);
    crisis.eventHistory[RULES.crises[0]!.id] = { count: 1, lastWeek: crisis.meta.week };
    const fronde = clone(ai);
    fronde.parlement!.fronde = { [groupsWhere(ai, 'soutien')[0]!]: 10 };
    const tense = clone(ai);
    tense.parlement!.tension = { ...tense.parlement!.tension, valeur: 70 };
    expect(plan(crisis)).toContain('sommet-crise');
    expect(plan(fronde)).toContain('reunion-majorite');
    expect(plan(tense)).toContain('discours-congres');
    for (const state of [ai, crisis, fronde, tense]) {
      const planned = planPresidentActions(state, RULES, (codes) => codes[0]!);
      expect(planned.length).toBeLessThanOrEqual(RULES.jeu.actionsMaxParSemaine);
      const { outcomes } = validatePresidencyActions(state, RULES, presidentId, planned);
      expect(outcomes.filter((o) => o.status !== 'validee')).toEqual([]);
    }

    const uses = new Map<string, number[]>();
    let state = ai;
    for (let i = 0; i < 80 && state.meta.phase === 'presidence'; i++) {
      const result = step(state);
      for (const a of result.report.actions) {
        expect(a).toMatchObject({ actorId: presidentId, status: 'validee' });
        uses.set(a.actionId, [...(uses.get(a.actionId) ?? []), result.report.week]);
      }
      state = result.state;
    }
    const delays = new Map(
      RULES.quinquennat.actions
        .filter((a) => a.delaiSemaines !== undefined)
        .map((a) => [a.id, a.delaiSemaines!]),
    );
    for (const [id, weeks] of uses) {
      const delay = delays.get(id);
      if (delay === undefined) continue;
      for (let i = 1; i < weeks.length; i++)
        expect(weeks[i]! - weeks[i - 1]!).toBeGreaterThanOrEqual(delay);
    }
    expect([...uses.keys()].filter((id) => delays.has(id)).length).toBeGreaterThanOrEqual(3);
  });
});
