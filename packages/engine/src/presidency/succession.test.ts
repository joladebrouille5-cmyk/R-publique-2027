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
import { presidentOf } from './government';
import { RECORD_FACTOR_LABEL, recordFactors, recordScore, runProbability } from './succession';

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
