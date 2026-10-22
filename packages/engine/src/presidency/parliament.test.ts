import type { GameState, WeeklyReport } from '@r2027/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { proposalsById } from '../campaign/programme';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, playToEnd, QUIET, sponsorship, TEST_CANDIDATE } from '../core/testing';
import { openQuinquennat } from './government';
import {
  canEngage,
  censureVote,
  filledSeats,
  membersMajority,
  openness,
  reformDelayWeeks,
  sessionOf,
  tallyVote,
} from './parliament';

// Phase 6 (P6-04) : Assemblée nationale réelle, procédure législative simulée.

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
/** Profil fictif de compétence moyenne (0,5). */
const AVERAGE = RULES.quinquennat.profils.find((p) => p.competence === 0.5)!.id;

/** Campagne d'un candidat de centre droit qui annonce son programme, jouée jusqu'à l'élection. */
const campaign = (() => {
  let state = newGame(
    {
      seed: 'parlement',
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
  const state = JSON.parse(JSON.stringify(campaign)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
}

type Policy = (
  state: GameState,
  decisionKind: string,
  options: string[],
  fallback: string,
) => string;
const defaultPolicy: Policy = (_s, _k, _o, fallback) => fallback;

function step(state: GameState, policy: Policy = defaultPolicy) {
  return advanceWeek(
    state,
    {
      actions: [],
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: policy(
          state,
          d.kind,
          d.options.map((o) => o.id),
          d.defaultOptionId,
        ),
      })),
    },
    { ruleset: RULES },
  );
}

function play(state: GameState, weeks: number, policy: Policy = defaultPolicy) {
  let current = state;
  const reports: WeeklyReport[] = [];
  for (let i = 0; i < weeks && !current.calendar.blockedBy; i++) {
    const result = step(current, policy);
    reports.push(result.report);
    current = result.state;
  }
  return { state: current, reports };
}

/** Joue jusqu'à ce qu'une décision du type demandé attende le président joueur. */
function untilDecision(state: GameState, kind: string, policy: Policy = defaultPolicy) {
  let current = state;
  for (let i = 0; i < 120; i++) {
    if (current.pendingDecisions.some((d) => d.kind === kind)) return current;
    current = step(current, policy).state;
  }
  throw new Error(`Aucune décision « ${kind} »`);
}

describe('Assemblée nationale', () => {
  it('reprend la composition importée et situe chaque groupe par rapport au président', () => {
    const state = playerElected();
    const parliament = state.parlement!;
    expect(Object.keys(parliament.groupes)).toEqual(RULES.assemblee.groupes.map((g) => g.id));
    expect(filledSeats(parliament)).toBe(577 - RULES.assemblee.vacants);
    expect(membersMajority(parliament)).toBe(Math.floor(filledSeats(parliament) / 2) + 1);
    const alignments = Object.values(parliament.groupes).map((g) => g.alignement);
    expect(alignments).toContain('soutien');
    expect(alignments).toContain('opposition');
    expect(parliament.textes).toEqual([]);
  });

  it('dépose la feuille de route dans l’ordre, au rythme du jeu de règles', () => {
    const { reports, state } = play(playerElected(), 12, (s, kind, options, fallback) =>
      kind === 'texte' ? 'voter' : fallback,
    );
    const deposits = reports.flatMap((r) =>
      r.events.filter((e) => e.id.startsWith('depot-')).map((e) => ({ week: r.week, e })),
    );
    expect(deposits.length).toBeGreaterThanOrEqual(2);
    const [first, second] = state.parlement!.textes;
    expect(first).toMatchObject({ id: 'texte-2027-1', propositionId: PROGRAMME[0] });
    expect(second!.propositionId).toBe(PROGRAMME[1]);
    expect(second!.deposeSemaine - first!.deposeSemaine).toBe(
      RULES.parlement.calendrier.intervalleDepotSemaines,
    );
    expect(first!.votes[0]?.semaine).toBe(
      first!.deposeSemaine + RULES.parlement.calendrier.commissionSemaines,
    );
  });

  it('fait voter les groupes en bloc, sans jamais dépasser leurs sièges', () => {
    const { state } = play(playerElected(), 60, (s, kind, options, fallback) =>
      kind === 'texte' ? 'voter' : fallback,
    );
    const votes = state.parlement!.textes.flatMap((b) => b.votes);
    expect(votes.length).toBeGreaterThan(0);
    for (const vote of votes) {
      let pour = 0;
      for (const [id, v] of Object.entries(vote.parGroupe)) {
        expect(v.pour + v.contre + v.abstention).toBeLessThanOrEqual(
          state.parlement!.groupes[id]!.sieges,
        );
        pour += v.pour;
      }
      expect(pour).toBe(vote.pour);
      expect(vote.pour + vote.contre + vote.abstention).toBeLessThanOrEqual(
        filledSeats(state.parlement!),
      );
      expect(vote.adopte).toBe(vote.pour > vote.contre);
    }
  });

  it('un texte adopté n’entre en vigueur qu’après le délai de sa proposition', () => {
    const { state, reports } = play(playerElected(), 160, (s, kind, options, fallback) =>
      kind === 'texte' ? (options.includes('negocier') ? 'negocier' : 'voter') : fallback,
    );
    const applied = state.parlement!.reformes.filter((r) => r.appliquee);
    expect(applied.length).toBeGreaterThan(0);
    for (const reform of applied) {
      const proposal = proposals.get(reform.propositionId)!;
      expect(reform.vigueurSemaine - reform.adopteeSemaine).toBe(reformDelayWeeks(proposal));
      const label = `Entrée en vigueur : ${proposal.libelle}`;
      const weeks = reports
        .filter((r) =>
          r.changes.some((c) => c.factors.some((f) => f.label === label && f.source === 'differe')),
        )
        .map((r) => r.week);
      expect(weeks).toEqual([reform.vigueurSemaine]);
      const bill = state.parlement!.textes.find((b) => b.id === reform.texteId)!;
      expect(bill.etape).toBe('adopte');
    }
  });

  it('le président joueur décide de la conduite d’un texte incertain : négocier, puis voter ou retirer', () => {
    const asked = untilDecision(playerElected(), 'texte');
    const decision = asked.pendingDecisions.find((d) => d.kind === 'texte')!;
    expect(decision.options.map((o) => o.id)).toEqual(['voter', 'negocier', '49-3', 'retirer']);
    expect(decision.description).toMatch(/^Projection du gouvernement : \d+ pour, \d+ contre/);
    const billId = decision.id.replace(/^t-\d+-/, '');

    const negotiated = step(asked, () => 'negocier').state;
    const bill = negotiated.parlement!.textes.find((b) => b.id === billId)!;
    expect(bill).toMatchObject({ concessions: 1, etape: 'seance', echeance: asked.meta.week + 1 });

    const withdrawn = step(asked, (s, kind, options, fallback) =>
      kind === 'texte' ? 'retirer' : fallback,
    ).state;
    const gone = withdrawn.parlement!.textes.find((b) => b.id === billId)!;
    expect(gone).toMatchObject({ etape: 'retire', issue: { motif: 'retiré par le gouvernement' } });
    const later = play(withdrawn, 150).state;
    expect(later.parlement!.reformes.some((r) => r.texteId === billId)).toBe(false);
    expect(
      later.parlement!.textes.filter((b) => b.propositionId === gone.propositionId),
    ).toHaveLength(1);
  });

  it('49.3 : une motion de censure adoptée renverse le gouvernement et emporte le texte', () => {
    const asked = untilDecision(playerElected(), 'texte');
    // État fabriqué : l'opposition détient la majorité des sièges, le président est impopulaire.
    const hostile = JSON.parse(JSON.stringify(asked)) as GameState;
    const opposition = Object.entries(hostile.parlement!.groupes).find(
      ([, g]) => g.alignement === 'opposition',
    )![0];
    hostile.parlement!.groupes[opposition]!.sieges = 450;
    hostile.actors[PLAYER_ACTOR_ID]!.resources.popularite = 1_000;
    // Premier ministre de compétence moyenne : sa compétence ne pèse pas sur la censure.
    hostile.quinquennat!.gouvernement!.premierMinistre = { nature: 'profil', ref: AVERAGE };
    expect(censureVote(hostile, RULES, null)!.adoptee).toBe(true);
    const decision = hostile.pendingDecisions.find((d) => d.kind === 'texte')!;
    const billId = decision.id.replace(/^t-\d+-/, '');

    const result = step(hostile, (s, kind, options, fallback) =>
      kind === 'texte' ? '49-3' : fallback,
    );
    const q = result.state.quinquennat!;
    expect(q.gouvernement).toBeNull();
    expect(q.anciensGouvernements.at(-1)!.motif).toBe('motion de censure');
    const bill = result.state.parlement!.textes.find((b) => b.id === billId)!;
    expect(bill).toMatchObject({ etape: 'rejete', procedure: '49-3' });
    expect(bill.censure!.adoptee).toBe(true);
    expect(bill.censure!.pour).toBeGreaterThanOrEqual(bill.censure!.majorite);
    expect(result.majorEvent).toBe(true);
    expect(result.state.pendingDecisions.map((d) => d.kind)).toEqual(['gouvernement']);
    const popularity = result.report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    expect(popularity.factors.map((f) => f.label)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Recours à l’article 49 alinéa 3/),
        'Gouvernement renversé par une motion de censure',
      ]),
    );
    // Un seul engagement de responsabilité hors loi de finances par session ordinaire.
    expect(canEngage(result.state, RULES)).toBe(false);
  });

  it('ouverture : un groupe non allié représenté au gouvernement soutient plus et censure moins', () => {
    const asked = untilDecision(playerElected(), 'texte');
    const bill = asked.parlement!.textes.find((b) => b.etape === 'seance')!;
    // Un groupe non allié et une figure qui lui est rattachée.
    const figure = RULES.figures.figures.find(
      (f) => f.groupe && asked.parlement!.groupes[f.groupe]?.alignement !== 'soutien',
    )!;
    const groupe = figure.groupe!;
    const base = JSON.parse(JSON.stringify(asked)) as GameState;
    const government = base.quinquennat!.gouvernement!;
    government.premierMinistre = { nature: 'profil', ref: AVERAGE };
    government.ministres = government.ministres.map((m) =>
      m.nature === 'figure' && RULES.figures.figures.find((f) => f.id === m.ref)!.groupe === groupe
        ? { nature: 'profil', ref: AVERAGE, posteId: m.posteId }
        : m,
    );
    expect(openness(base, RULES).get(groupe)).toBeUndefined();
    const open = JSON.parse(JSON.stringify(base)) as GameState;
    open.quinquennat!.gouvernement!.ministres[0] = {
      nature: 'figure',
      ref: figure.id,
      posteId: open.quinquennat!.gouvernement!.ministres[0]!.posteId,
    };
    expect(openness(open, RULES).get(groupe)).toBe(1);
    const before = tallyVote(base, RULES, bill, 'premiere', null).parGroupe[groupe]!;
    const after = tallyVote(open, RULES, bill, 'premiere', null).parGroupe[groupe]!;
    // Le groupe passe du vote contre à l'abstention, ou de l'abstention au vote pour.
    expect(after.pour - after.contre).toBeGreaterThan(before.pour - before.contre);
    const hostile = (state: GameState) => {
      const copy = JSON.parse(JSON.stringify(state)) as GameState;
      copy.actors[PLAYER_ACTOR_ID]!.resources.popularite = 500;
      return censureVote(copy, RULES, null)!;
    };
    expect(hostile(open).parGroupe[groupe] ?? 0).toBeLessThanOrEqual(
      hostile(base).parGroupe[groupe] ?? 0,
    );
  });

  it('un Premier ministre plus compétent n’augmente jamais les voix de la censure', () => {
    const asked = untilDecision(playerElected(), 'texte');
    const profiles = [...RULES.quinquennat.profils].sort((a, b) => a.competence - b.competence);
    let previous = Infinity;
    for (const profile of profiles) {
      const state = JSON.parse(JSON.stringify(asked)) as GameState;
      state.actors[PLAYER_ACTOR_ID]!.resources.popularite = 500;
      state.quinquennat!.gouvernement!.premierMinistre = { nature: 'profil', ref: profile.id };
      const pour = censureVote(state, RULES, null)?.pour ?? 0;
      expect(pour).toBeLessThanOrEqual(previous);
      previous = pour;
    }
  });

  it('compte les sessions ordinaires à partir d’octobre (art. 28)', () => {
    expect(sessionOf(RULES, '2027-09-27')).toBe(2026);
    expect(sessionOf(RULES, '2027-10-04')).toBe(2027);
    expect(sessionOf(RULES, '2028-06-26')).toBe(2027);
  });

  it('propriété : une réforme rejetée ou retirée n’est jamais appliquée', () => {
    const start = playerElected();
    fc.assert(
      fc.property(fc.array(fc.nat(3), { minLength: 30, maxLength: 30 }), (choices) => {
        let n = 0;
        const policy: Policy = (s, kind, options, fallback) =>
          kind === 'texte' ? options[choices[n++ % choices.length]! % options.length]! : fallback;
        const { state, reports } = play(start, 110, policy);
        const parliament = state.parlement!;
        const failed = parliament.textes.filter(
          (b) => b.etape === 'rejete' || b.etape === 'retire',
        );
        for (const bill of failed) {
          expect(parliament.reformes.some((r) => r.propositionId === bill.propositionId)).toBe(
            false,
          );
          const label = `Entrée en vigueur : ${proposals.get(bill.propositionId)!.libelle}`;
          expect(
            reports.some((r) => r.changes.some((c) => c.factors.some((f) => f.label === label))),
          ).toBe(false);
        }
        for (const reform of parliament.reformes)
          expect(parliament.textes.find((b) => b.id === reform.texteId)!.etape).toBe('adopte');
      }),
      { numRuns: 6 },
    );
  });

  it('le président IA conduit ses textes selon sa règle, sans décision en attente', () => {
    const ai = playToEnd(
      newGame({ seed: 'parlement-ia', mode: 'observateur' }, RULES),
      RULES,
    ).state;
    const president = ai.actors[ai.quinquennat!.mandat.presidentId]!;
    const { state } = play(ai, 120);
    expect(state.pendingDecisions).toEqual([]);
    const textes = state.parlement!.textes;
    const roadmap = state.quinquennat!.feuilleDeRoute;
    expect(roadmap).toEqual(president.programme.propositions);
    if (roadmap.length > 0) expect(textes.length).toBeGreaterThan(0);
    else expect(textes).toEqual([]);
    expect(new Set(textes.map((b) => b.propositionId)).size).toBe(textes.length);
    const adoptedAt = new Map(
      state.parlement!.reformes.map((r) => [r.propositionId, r.adopteeSemaine]),
    );
    for (const bill of textes) {
      expect(roadmap).toContain(bill.propositionId);
      // Un texte n'est déposé qu'une fois ses dépendances adoptées.
      for (const dep of proposals.get(bill.propositionId)!.dependances)
        expect(adoptedAt.get(dep)).toBeLessThanOrEqual(bill.deposeSemaine);
    }
  });
});
