import {
  GameStateSchema,
  type GameState,
  type QuinquennatReview,
  type Ruleset,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { concludeDebates, newGame, playToEnd, QUIET, sponsorship } from '../core/testing';
import { distribute } from '../election/distribution';
import { sumFactors } from '../election/model';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { openQuinquennat, presidentOf } from './government';
import {
  RECORD_FACTOR_LABEL,
  recordFactors,
  recordScore,
  runProbability,
  successorOptions,
  successorOptionsFor,
} from './succession';

// Phase 23 : présidentielle suivante — candidatures, successeur du joueur, poids du bilan.

const RULES = QUIET;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Joue avec les décisions par défaut, sans action, jusqu'à la condition. */
function play(start: GameState, until: (state: GameState) => boolean, ruleset: Ruleset = RULES) {
  let state = start;
  for (let i = 0; i < 400 && !until(state) && !state.calendar.blockedBy; i++) {
    state = concludeDebates(state, ruleset);
    state = advanceWeek(
      state,
      {
        actions: [],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    ).state;
  }
  return state;
}

const elected = playToEnd(newGame({ seed: 'succession' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;
const campaign = play(elected, (s) => s.meta.phase === 'campagne');
/** Dernière semaine du quinquennat, juste avant l'ouverture de la campagne de 2032. */
const before = play(elected, (s) => s.meta.week === campaign.meta.week - 1);

/** Copie du jeu de règles aux paramètres de succession modifiés. */
function rules(change: (succession: Ruleset['succession']) => void): Ruleset {
  const copy = clone(RULES);
  change(copy.succession);
  return copy;
}
/** Probabilités de se représenter toutes fixées à `p`. */
const everyone = (p: number) =>
  rules((s) => {
    s.representation.sortant = { ...s.representation.sortant, base: p, pente: 0, min: p, max: p };
    s.representation.elimine = { ...s.representation.elimine, base: p, pente: 0, min: p, max: p };
    s.representation.finaliste = p;
    s.representation.autre = p;
  });

/** Ouvre la campagne de 2032 depuis la dernière semaine du quinquennat. */
function open(start: GameState, ruleset: Ruleset = RULES) {
  const result = advanceWeek(
    start,
    {
      actions: [],
      decisions: start.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
    },
    { ruleset },
  );
  expect(result.state.meta.phase).toBe('campagne');
  expect(GameStateSchema.safeParse(result.state).error).toBeUndefined();
  return result;
}
const declared = (state: GameState) =>
  Object.values(state.actors).filter((a) => a.status === 'candidat');
const reviewOf = (state: GameState) => state.historique.quinquennats.at(-1)!.bilan;

/** Bilan minimal : popularité finale, note sur 20 (null : sans objectifs), chômage en centièmes. */
function review(
  popularite: number | null,
  note: number | null,
  chomage: [number, number] | null,
): QuinquennatReview {
  const snapshot = (semaine: number, value: number | undefined) => ({
    semaine,
    date: '2027-05-17',
    popularite,
    indicateurs: value === undefined ? null : { chomage: value },
  });
  return {
    debut: snapshot(33, chomage?.[0]),
    fin: snapshot(294, chomage?.[1]),
    reformes: {
      adoptees: [],
      enVigueur: 0,
      rejetees: 0,
      retirees: 0,
      caducs: 0,
      engagements49_3: 0,
      censures: 0,
    },
    gouvernements: 1,
    legislatives: null,
    consequences: [],
    note: note === null ? null : { valeur: note, mention: 'Mention', objectifs: [] },
  } as QuinquennatReview;
}

describe('poids du bilan sur les intentions (phase 23, §5)', () => {
  it('vaut 0 pour un bilan neutre : popularité au pivot, 10 sur 20, chômage stable', () => {
    expect(recordScore(review(3500, 10, [750, 750]), RULES)).toBe(0);
  });

  it('additionne popularité, note et baisse du chômage', () => {
    // 1,2 × 0,2 + 0,3 × 0,6 + 0,15 × 1 = 0,57
    expect(recordScore(review(5500, 16, [750, 650]), RULES)).toBeCloseTo(0.57, 10);
  });

  it('est borné à ± 0,6', () => {
    expect(recordScore(review(1000, 4, [700, 900]), RULES)).toBe(-0.6);
    expect(recordScore(review(9000, 20, [900, 500]), RULES)).toBe(0.6);
  });

  it('prend 10 sur 20 sans note, le pivot sans popularité, un chômage stable sans économie', () => {
    expect(recordScore(review(3500, null, [750, 750]), RULES)).toBe(0);
    expect(recordScore(review(null, 10, null), RULES)).toBe(0);
    expect(recordScore(review(4500, null, null), RULES)).toBeCloseTo(0.12, 10);
  });

  it('n’ajoute aucun facteur sans succession, ni hors de la campagne qui suit le quinquennat', () => {
    const id = presidentOf(elected).id;
    const none = clone(campaign);
    none.succession = null;
    expect(recordFactors(none, id)).toEqual([]);
    const during = clone(elected);
    during.succession = { annee: 2032, choixJoueur: null, annonces: [], bilan: {} };
    during.succession.bilan[id] = { facteur: 0.3, role: 'sortant' };
    expect(recordFactors(during, id)).toEqual([]);
  });

  it('ajoute le facteur « Bilan du quinquennat » au score, somme exacte des facteurs', () => {
    const id = presidentOf(elected).id;
    const base = clone(campaign);
    base.actors[id]!.status = 'candidat';
    base.succession = { annee: 2032, choixJoueur: null, annonces: [], bilan: {} };
    const state = clone(base);
    state.succession!.bilan[id] = { facteur: -0.42, role: 'sortant' };
    expect(GameStateSchema.safeParse(state).error).toBeUndefined();
    expect(recordFactors(state, id)).toEqual([{ label: RECORD_FACTOR_LABEL, value: -0.42 }]);

    const plain = distribute(base, RULES, 1, 'opinion');
    const weighed = distribute(state, RULES, 1, 'opinion');
    for (const [g, group] of weighed.entries()) {
      const c = group.contenders.findIndex((x) => x.id === id);
      const factors = group.factors[c]!;
      expect(factors.filter((f) => f.label === RECORD_FACTOR_LABEL)).toEqual([
        { label: RECORD_FACTOR_LABEL, value: -0.42 },
      ]);
      // Seul ce facteur change : le score baisse d'autant, les autres candidats n'en ont pas.
      expect(sumFactors(factors)).toBeCloseTo(sumFactors(plain[g]!.factors[c]!) - 0.42, 10);
      for (const [o, other] of group.factors.entries())
        if (o !== c) expect(other.some((f) => f.label === RECORD_FACTOR_LABEL)).toBe(false);
      expect(group.probabilities[c]!).toBeLessThan(plain[g]!.probabilities[c]!);
    }
  });
});

describe('les autres candidats décident ; les entrants (phase 23, §2 et §3)', () => {
  const previous = campaign.historique.presidentielles[0]!;
  const presidentId = presidentOf(elected).id;
  const context = { presidentId, termLimited: false, previous };

  it('tire la probabilité de se représenter selon la présidentielle précédente', () => {
    const state = clone(before);
    state.actors[presidentId]!.resources.popularite = 0;
    expect(runProbability(presidentId, state, RULES, context)).toBe(0.1);
    state.actors[presidentId]!.resources.popularite = 8000;
    expect(runProbability(presidentId, state, RULES, context)).toBe(0.95);
    state.actors[presidentId]!.resources.popularite = 3000;
    expect(runProbability(presidentId, state, RULES, context)).toBeCloseTo(0.5, 10);
    expect(runProbability(presidentId, state, RULES, { ...context, termLimited: true })).toBe(0);

    const finalist = Object.values(state.actors).find((a) => a.status === 'battu')!;
    expect(runProbability(finalist.id, state, RULES, context)).toBe(0.85);
    const eliminated = Object.values(state.actors).find(
      (a) => a.status === 'elimine' && a.id !== state.player.actorId,
    )!;
    const archive = clone(previous);
    archive.t1.voix[eliminated.id] = Math.round(archive.t1.exprimes * 0.01);
    const low = runProbability(eliminated.id, state, RULES, { ...context, previous: archive });
    expect(low).toBeCloseTo(0.27, 6);
    archive.t1.voix[eliminated.id] = Math.round(archive.t1.exprimes * 0.4);
    expect(runProbability(eliminated.id, state, RULES, { ...context, previous: archive })).toBe(
      0.8,
    );
    const other = Object.values(state.actors).find(
      (a) => a.status === 'retire' || a.status === 'ecarte',
    );
    if (other) expect(runProbability(other.id, state, RULES, context)).toBe(0.3);
  });

  it('au terme de deux mandats, le sortant est inéligible, sans tirage (art. 6)', () => {
    const start = clone(before);
    start.quinquennat!.mandat.numero = 2;
    const { state, report } = open(start, everyone(1));
    expect(state.actors[presidentId]!.status).toBe('ineligible');
    const notice = state.succession!.annonces.find((a) => a.actorId === presidentId)!;
    expect(notice).toMatchObject({ choix: 'retrait' });
    expect(notice.motif).toMatch(/art\. 6/);
    expect(report.events.map((e) => e.label)).toContain(
      `Candidature simulée : ${state.actors[presidentId]!.candidate.prenom} ${state.actors[presidentId]!.candidate.nom} ne se présente pas à la présidentielle 2032`,
    );
  });

  it('donne les mêmes candidatures pour la même graine', () => {
    const again = open(before).state;
    expect(again.succession).toEqual(campaign.succession);
    expect(Object.keys(again.actors).sort()).toEqual(Object.keys(campaign.actors).sort());
    expect(campaign.succession!.annee).toBe(2032);
    expect(declared(campaign).length).toBeLessThanOrEqual(12);
    expect(declared(campaign).length).toBeGreaterThanOrEqual(2);
  });

  it('annonce chaque candidature comme une simulation, motif chiffré, sans propos', () => {
    const { state, report } = open(before, everyone(0));
    const notices = state.succession!.annonces;
    const retraits = notices.filter((a) => a.choix === 'retrait');
    expect(retraits.length).toBeGreaterThan(0);
    for (const notice of retraits) expect(state.actors[notice.actorId]!.status).toBe('retire');
    const events = report.events.filter((e) => e.refId === 'succession');
    expect(events).toHaveLength(notices.length);
    for (const event of events) {
      expect(event.label).toMatch(
        /^(Candidature simulée : .+ (se représente|ne se présente pas à la présidentielle 2032|entre dans la course)|Vous passez la main : .+)$/,
      );
      expect(event.description).toMatch(/^Motif du jeu : .+\.$/);
      expect(event.nature).toBe('simule');
      expect(`${event.label} ${event.description}`).not.toMatch(
        /[«»"]|déclare|affirme|annonce que/,
      );
    }
  });

  it('champ dépeuplé : des profils fictifs des familles sans candidat entrent, deux candidats au moins', () => {
    const { state } = open(before, everyone(0));
    for (const actor of Object.values(before.actors))
      if (actor.id !== state.player.actorId) expect(state.actors[actor.id]!.status).toBe('retire');
    const candidates = declared(state);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    // Le président ne se représente pas : l'héritier de son camp entre d'abord, puis les familles.
    const entrants = state.succession!.annonces.filter((a) => a.choix === 'entree');
    expect(entrants[0]!.motif).toMatch(/Premier ministre/);
    const families = entrants.filter((a) => /^famille /.test(a.motif));
    expect(families.length).toBeGreaterThan(0);
    for (const { actorId, motif } of families) {
      const actor = state.actors[actorId]!;
      expect(actor.id).toMatch(/^entrant-2032-profil-/);
      expect(actor.candidate.nature).toBe('fictif');
      expect(actor.candidate.parcours).toMatch(/^Personnage fictif\./);
      expect(actor.kind).toBe('adversaire');
      expect(motif).toMatch(/^famille /);
      // Moyens de départ d'un entrant (jeu de règles), sans passer par le registre.
      expect(actor.resources.budgetCentimes).toBe(RULES.succession.entrants.budgetCentimes);
      expect(actor.resources.popularite).toBe(RULES.succession.entrants.popularite);
    }
    // Chaque groupe d'électeurs a désormais un candidat déclaré à moins de 0,35, s'il en restait.
    for (const group of RULES.electorat.groupes) {
      const nearest = Math.min(
        ...candidates.map((c) =>
          Math.hypot(
            group.position.economie - c.candidate.positionnement.economie,
            group.position.societe - c.candidate.positionnement.societe,
          ),
        ),
      );
      expect(nearest / 100).toBeLessThan(RULES.succession.distanceFamille);
    }
  });

  it('le camp sortant présente son Premier ministre quand le président ne se représente pas', () => {
    const ruleset = rules((s) => {
      s.representation.sortant = { base: 0, pente: 0, pivot: 3000, min: 0, max: 0 };
    });
    const { state } = open(before, ruleset);
    expect(state.actors[presidentId]!.status).toBe('retire');
    const pm = before.quinquennat!.gouvernement!.premierMinistre;
    expect(pm.nature).toBe('figure');
    const heir = state.actors[`entrant-2032-${pm.ref}`]!;
    expect(heir).toMatchObject({ kind: 'adversaire', status: 'candidat' });
    expect(heir.candidate).toMatchObject({
      nature: 'reel',
      figureId: pm.ref,
      personnaliteId: null,
    });
    expect(heir.programme.propositions).toEqual([]);
    const score = recordScore(reviewOf(state), ruleset);
    expect(state.succession!.bilan[heir.id]).toEqual({
      facteur: Math.round(0.5 * score * 10_000) / 10_000,
      role: 'heritier',
    });
    expect(state.succession!.bilan[presidentId]).toBeUndefined();
    const notice = state.succession!.annonces.find((a) => a.actorId === heir.id)!;
    expect(notice).toMatchObject({ choix: 'entree' });
    expect(notice.motif).toMatch(/Premier ministre/);
  });

  it('un ministre populaire entre si sa place est libre ; le sortant porte tout le bilan', () => {
    const ruleset = rules((s) => {
      s.representation.sortant = { base: 1, pente: 0, pivot: 3000, min: 1, max: 1 };
      s.ministreSeuilPopularite = 0;
      s.ministreProbabilite = 1;
      s.distanceMinistre = 0;
    });
    const { state } = open(before, ruleset);
    const score = recordScore(reviewOf(state), ruleset);
    expect(state.actors[presidentId]!.status).toBe('candidat');
    expect(state.succession!.bilan[presidentId]).toEqual({ facteur: score, role: 'sortant' });
    const ministers = [...before.quinquennat!.gouvernement!.ministres].sort(
      (a, b) =>
        before.quinquennat!.suivi[b.ref]!.popularite -
          before.quinquennat!.suivi[a.ref]!.popularite || a.ref.localeCompare(b.ref),
    );
    const minister = state.actors[`entrant-2032-${ministers[0]!.ref}`]!;
    expect(minister.status).toBe('candidat');
    expect(state.succession!.bilan[minister.id]).toEqual({
      facteur: Math.round(0.25 * score * 10_000) / 10_000,
      role: 'ministre',
    });
    // Le facteur apparaît dans l'opinion de la campagne.
    const groups = distribute(state, ruleset, 1, 'opinion');
    const c = groups[0]!.contenders.findIndex((x) => x.id === presidentId);
    expect(groups[0]!.factors[c]!.find((f) => f.label === RECORD_FACTOR_LABEL)!.value).toBe(score);
  });

  it('ne dépasse jamais le plafond de candidats déclarés', () => {
    const ruleset = rules((s) => {
      s.maxCandidats = 5;
      s.maxSuccesseurs = 4;
    });
    for (const p of [0, 1]) {
      const capped = clone(ruleset);
      capped.succession.representation = everyone(p).succession.representation;
      const { state } = open(before, capped);
      expect(declared(state).length).toBeLessThanOrEqual(5);
      if (p === 1)
        expect(state.succession!.annonces.some((a) => /plafond du jeu/.test(a.motif))).toBe(true);
    }
  });
});

/** Joue avec un choix pour la décision de candidature, les autres décisions par défaut. */
function playChoosing(
  start: GameState,
  until: (state: GameState) => boolean,
  choose: (options: string[]) => string,
  ruleset: Ruleset = RULES,
) {
  let state = start;
  for (let i = 0; i < 400 && !until(state) && !state.calendar.blockedBy; i++) {
    state = concludeDebates(state, ruleset);
    state = advanceWeek(
      state,
      {
        actions: [],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId:
            d.kind === 'candidature' ? choose(d.options.map((o) => o.id)) : d.defaultOptionId,
        })),
      },
      { ruleset },
    ).state;
  }
  return state;
}

const candidacyOf = (state: GameState) =>
  state.pendingDecisions.find((d) => d.kind === 'candidature');

/** Le joueur déclaré élu en 2027 (ouverture du quinquennat identique à celle du moteur). */
const presiding = (() => {
  const state = clone(elected);
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
})();
/** Président joueur, la semaine où sa décision de candidature apparaît. */
const presidingDecision = play(presiding, (s) => candidacyOf(s) !== undefined);

describe('le choix du joueur et la passation (phase 23, §1 et §3)', () => {
  it('ouvre la décision quatre semaines avant la campagne, pas avant', () => {
    const decision = candidacyOf(presidingDecision)!;
    expect(presidingDecision.meta.date).toBe('2031-09-01');
    expect(decision).toMatchObject({
      id: 'candidature-2032',
      kind: 'candidature',
      actorId: PLAYER_ACTOR_ID,
      defaultOptionId: 'se-representer',
    });
    const weekBefore = play(presiding, (s) => s.meta.date === '2031-08-25');
    expect(candidacyOf(weekBefore)).toBeUndefined();
    // Se représenter, puis le Premier ministre et les ministres les plus proches (quatre au plus).
    const ids = decision.options.map((o) => o.id);
    expect(ids[0]).toBe('se-representer');
    expect(ids.length).toBeLessThanOrEqual(1 + RULES.succession.maxSuccesseurs);
    const government = presidingDecision.quinquennat!.gouvernement!;
    const pm = government.premierMinistre;
    expect(ids[1]).toMatch(new RegExp(`^successeur-(acteur|${pm.nature})-`));
    expect(decision.options[1]!.description).toMatch(/Premier ministre/);
    for (const option of decision.options.slice(1))
      expect(option.description).toMatch(
        /personnalité réelle, candidature simulée|personnage fictif/,
      );
    expect(decision.description).not.toMatch(/[«»]/);
    expect(GameStateSchema.safeParse(presidingDecision).error).toBeUndefined();
  });

  it('au terme de deux mandats, le président joueur ne peut que passer la main', () => {
    const start = clone(presiding);
    start.quinquennat!.mandat.numero = 2;
    const state = play(start, (s) => candidacyOf(s) !== undefined);
    const decision = candidacyOf(state)!;
    expect(decision.options.map((o) => o.id)).not.toContain('se-representer');
    expect(decision.defaultOptionId).toBe(decision.options[0]!.id);
    expect(decision.description).toMatch(/art\. 6/);
  });

  it('passe la main à une figure : nouveau candidat du joueur, militants transmis par le registre', () => {
    const government = presidingDecision.quinquennat!.gouvernement!;
    const options = successorOptions(presidingDecision, RULES);
    const figure = options.find((o) => o.source.nature === 'figure')!;
    expect(figure).toBeDefined();
    const last = play(presidingDecision, (s) => s.meta.date === '2031-09-22');
    expect(last.meta.phase).toBe('presidence');
    // Réponse jouée dès la semaine de la décision ; elle s'applique à l'ouverture.
    const chosen = playChoosing(
      presidingDecision,
      (s) => s.meta.date === '2031-09-22',
      () => figure.id,
    );
    expect(chosen.succession).toMatchObject({ annee: 2032, choixJoueur: figure.id });
    const predecessorMilitants = chosen.actors[PLAYER_ACTOR_ID]!.resources.militants;
    const { state, report } = open(chosen);
    const successorId = `entrant-2032-${figure.source.ref}`;
    expect(state.player.actorId).toBe(successorId);
    const successor = state.actors[successorId]!;
    expect(successor).toMatchObject({ kind: 'joueur', status: 'candidat', style: null });
    expect(successor.candidate).toMatchObject({ nature: 'reel', figureId: figure.source.ref });
    expect(state.actors[PLAYER_ACTOR_ID]).toMatchObject({ kind: 'adversaire', status: 'retire' });
    const militants = report.changes.find(
      (c) => c.actorId === successorId && c.ressource === 'militants',
    )!;
    expect(militants.factors).toContainEqual(
      expect.objectContaining({
        label: 'Passation de la campagne : militants du camp',
        // Militants du prédécesseur après l'attrition de la semaine (étape 6, avant l'étape 9).
        value: Math.round(
          0.6 *
            (predecessorMilitants -
              Math.round(predecessorMilitants * RULES.jeu.opinion.attritionMilitants)),
        ),
      }),
    );
    expect(militants.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
      militants.after - militants.before,
    );
    // Successeur d'un président : il porte la moitié du bilan ; annonces sans propos.
    const score = recordScore(reviewOf(state), RULES);
    expect(state.succession!.bilan[successorId]).toEqual({
      facteur: Math.round(0.5 * score * 10_000) / 10_000,
      role: 'heritier',
    });
    expect(state.succession!.annonces).toContainEqual(
      expect.objectContaining({ actorId: successorId, choix: 'successeur' }),
    );
    expect(report.events.map((e) => e.label)).toContain(
      `Vous passez la main : ${successor.candidate.prenom} ${successor.candidate.nom} porte votre camp en 2032`,
    );
    // Le camp sortant n'a pas d'autre héritier : c'est le successeur du joueur.
    expect(
      Object.values(state.succession!.bilan).filter((b) => b.role === 'heritier'),
    ).toHaveLength(1);
    expect(government.premierMinistre).toBeDefined();
  });

  it('garde le choix du joueur si le gouvernement change avant l’ouverture', () => {
    const figure = successorOptions(presidingDecision, RULES).find(
      (o) => o.source.nature === 'figure',
    )!;
    const chosen = playChoosing(
      presidingDecision,
      (s) => s.meta.date === '2031-09-22',
      () => figure.id,
    );
    // Remaniement simulé : la figure choisie quitte le gouvernement.
    const government = chosen.quinquennat!.gouvernement!;
    const profile = RULES.quinquennat.profils.find(
      (p) => ![government.premierMinistre, ...government.ministres].some((m) => m.ref === p.id),
    )!;
    if (government.premierMinistre.ref === figure.source.ref)
      government.premierMinistre = { nature: 'profil', ref: profile.id };
    government.ministres = government.ministres.map((m) =>
      m.ref === figure.source.ref ? { ...m, nature: 'profil', ref: profile.id } : m,
    );
    const { state } = open(chosen);
    expect(state.player.actorId).toBe(`entrant-2032-${figure.source.ref}`);
  });

  it('passe la main à un acteur déjà dans la partie, sans le dédoubler', () => {
    // Un rival de 2027 devenu Premier ministre, avant l'ouverture de la décision.
    const start = clone(play(presiding, (s) => s.meta.date === '2031-08-25'));
    const rival = Object.values(start.actors).find((a) => a.status === 'battu')!;
    start.quinquennat!.gouvernement!.premierMinistre = { nature: 'acteur', ref: rival.id };
    const option = successorOptions(start, RULES)[0]!;
    expect(option).toMatchObject({ source: { nature: 'acteur', ref: rival.id } });
    const asked = play(start, (s) => candidacyOf(s) !== undefined);
    expect(candidacyOf(asked)!.options.map((o) => o.id)).toContain(option.id);
    const chosen = playChoosing(
      asked,
      (s) => s.meta.date === '2031-09-22',
      () => option.id,
    );
    const { state } = open(chosen);
    expect(state.player.actorId).toBe(rival.id);
    expect(state.actors[rival.id]).toMatchObject({
      kind: 'joueur',
      status: 'candidat',
      style: null,
    });
    const sameName = Object.values(state.actors).filter(
      (a) =>
        a.candidate.nom === rival.candidate.nom && a.candidate.prenom === rival.candidate.prenom,
    );
    expect(sameName).toHaveLength(1);
  });

  it('joueur battu en 2027 : figures de son parti, puis profils proches', () => {
    const state = clone(before);
    const playerId = state.player.actorId!;
    const president = presidentOf(state).id;
    const context = {
      presidentId: president,
      government: state.quinquennat!.gouvernement,
      suivi: state.quinquennat!.suivi,
    };
    const custom = successorOptionsFor(state, RULES, context);
    expect(custom.length).toBe(RULES.succession.maxSuccesseurs);
    for (const option of custom) expect(option.source.nature).toBe('profil');
    state.actors[playerId]!.candidate.parti = 'Horizons';
    const horizons = successorOptionsFor(state, RULES, context);
    const figures = horizons.filter((o) => o.source.nature === 'figure');
    expect(figures.length).toBeGreaterThan(0);
    for (const option of figures) {
      const figure = RULES.figures.figures.find((f) => f.id === option.source.ref)!;
      expect(figure.parti).toBe('Horizons');
      expect(option.description).toMatch(/personnalité réelle, candidature simulée$/);
    }
    expect(horizons[0]!.source.nature).toBe('figure');
  });

  it('observateur : aucune décision, les candidatures des autres s’appliquent', () => {
    const start = playToEnd(
      newGame({ seed: 'succession-obs', mode: 'observateur' }, RULES),
      RULES,
    ).state;
    const last = play(start, (s) => s.meta.date === '2031-09-22');
    expect(last.pendingDecisions.some((d) => d.kind === 'candidature')).toBe(false);
    const { state } = open(last, everyone(0));
    expect(state.player.actorId).toBeNull();
    expect(declared(state).length).toBeGreaterThanOrEqual(2);
    expect(state.succession!.annonces.some((a) => a.choix === 'successeur')).toBe(false);
  });

  it('2037 : le successeur passe la main à son tour, identifiants uniques', () => {
    const government = presidingDecision.quinquennat!.gouvernement!;
    const first = successorOptions(presidingDecision, RULES).find(
      (o) => o.source.nature !== 'acteur',
    )!;
    const campaign2032 = playChoosing(
      presidingDecision,
      (s) => s.meta.phase === 'campagne',
      () => first.id,
    );
    const heir = campaign2032.player.actorId!;
    expect(heir).toMatch(/^entrant-2032-/);
    const decision2037 = playChoosing(
      campaign2032,
      (s) => candidacyOf(s)?.id === 'candidature-2037',
      () => 'se-representer',
    );
    const decision = candidacyOf(decision2037)!;
    const next = decision.options.find((o) => o.id !== 'se-representer' && !o.id.includes(heir))!;
    const campaign2037 = playChoosing(
      decision2037,
      (s) => s.cycle.annee === 2037,
      () => next.id,
    );
    expect(campaign2037.meta.phase).toBe('campagne');
    const successor = campaign2037.player.actorId!;
    expect(successor).not.toBe(heir);
    expect(campaign2037.actors[heir]).toMatchObject({ kind: 'adversaire' });
    expect(['retire', 'ineligible']).toContain(campaign2037.actors[heir]!.status);
    expect(campaign2037.succession!.annee).toBe(2037);
    const ids = Object.keys(campaign2037.actors);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids.filter((i) => i.startsWith('entrant-')))
      expect(id).toMatch(/^entrant-(2032|2037)-(figure|profil)-/);
    expect(GameStateSchema.safeParse(campaign2037).error).toBeUndefined();
    expect(government).toBeDefined();
  });
});
