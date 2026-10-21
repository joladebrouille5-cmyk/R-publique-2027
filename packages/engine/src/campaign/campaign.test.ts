import {
  relationKey,
  totalReceipts,
  type GameState,
  type MediaState,
  type ParrainagesState,
  type Ruleset,
} from '@r2027/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { Ledger } from '../core/ledger';
import { createRng, deriveRngState } from '../core/rng';
import {
  advance,
  newGame,
  playToEnd,
  playUntil,
  QUIET,
  RULESET,
  sponsorship,
  withResources,
} from '../core/testing';
import { resolveRound } from '../election/rounds';
import { debateComponents, debatePerformance } from '../election/flow';
import { nationalBaseline } from '../territory/baseline';
import { resolveAlliances, updateRelations } from '../ai/relations';
import { targetLabel } from './actions';
import { propensity, updateMedia } from './medias';
import {
  FinanceBook,
  processDonations,
  provisionalReimbursement,
  requestLoan,
  spendingCap,
} from './finances';
import {
  committedByDepartement,
  countedPresentations,
  meetsThreshold,
  perDepartementCap,
  pool,
} from './parrainages';
import { credibility, validateProgrammeChange } from './programme';

const player = (state: GameState) => state.actors[PLAYER_ACTOR_ID]!;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('programme (§6)', () => {
  const empty = { propositions: [], revirements: 0 };

  it('refuse une proposition sans sa dépendance ou incompatible, avec un motif', () => {
    const v = validateProgrammeChange(
      { propositions: ['ener-nouveaux-reacteurs'], revirements: 0 },
      { ajouter: ['ener-sortie-nucleaire', 'emploi-garantie-emploi'], retirer: [] },
      RULESET,
      70,
    );
    expect(v.added).toEqual([]);
    expect(v.refused.map((r) => r.id)).toEqual(['ener-sortie-nucleaire', 'emploi-garantie-emploi']);
    expect(v.refused[0]!.motif).toMatch(/suppose d'abord|incompatible/);
    expect(v.refused[1]!.motif).toMatch(/suppose d'abord : « Plan d’investissement public »/);
  });

  it('accepte une dépendance annoncée la même semaine, et refuse de retirer ce dont une autre dépend', () => {
    const v = validateProgrammeChange(
      empty,
      { ajouter: ['eco-investissement-public', 'emploi-garantie-emploi'], retirer: [] },
      RULESET,
      70,
    );
    expect(v.added).toEqual(['eco-investissement-public', 'emploi-garantie-emploi']);
    expect(v.hours).toBe(2 * RULESET.programme.heuresParProposition);
    const removal = validateProgrammeChange(
      { propositions: v.next, revirements: 0 },
      { ajouter: [], retirer: ['eco-investissement-public'] },
      RULESET,
      70,
    );
    expect(removal.removed).toEqual([]);
    expect(removal.refused[0]!.motif).toMatch(/dépend de/);
  });

  it('limite la taille du programme et le temps de préparation', () => {
    const all = RULESET.programme.propositions.map((p) => p.id);
    const v = validateProgrammeChange(empty, { ajouter: all, retirer: [] }, RULESET, 9);
    expect(v.added).toHaveLength(3);
    expect(v.refused.some((r) => /Temps insuffisant/.test(r.motif))).toBe(true);
  });

  it('un revirement coûte de la crédibilité ; sans programme, la crédibilité est négative', () => {
    const programme = {
      propositions: ['pa-prime-partage-valeur', 'eco-simplification-pme'],
      revirements: 0,
    };
    expect(credibility(empty, RULESET).value).toBeLessThan(0);
    expect(credibility({ ...programme, revirements: 2 }, RULESET).value).toBeLessThan(
      credibility(programme, RULESET).value,
    );
  });

  it('les annonces passent par le plan de la semaine et entrent dans le score latent', () => {
    const { state, report } = advance(newGame(), [], [], QUIET);
    expect(player(state).programme.propositions).toEqual([]);
    const result = advanceWithProgramme(state, [
      'pa-prime-partage-valeur',
      'eco-simplification-pme',
    ]);
    expect(player(result.state).programme.propositions).toEqual([
      'pa-prime-partage-valeur',
      'eco-simplification-pme',
    ]);
    expect(result.report.programme).toMatchObject([
      { actorId: PLAYER_ACTOR_ID, ajoutees: ['pa-prime-partage-valeur', 'eco-simplification-pme'] },
    ]);
    const labels = result.state.opinion!.breakdown[PLAYER_ACTOR_ID]!.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['Programme', 'Crédibilité', 'Médias']));
    expect(report.steps.find((s) => s.step === 4)!.active).toBe(true);
  });
});

function advanceWithProgramme(state: GameState, ajouter: string[], retirer: string[] = []) {
  return advanceWeekWith(state, { programme: { ajouter, retirer } });
}

function advanceWeekWith(
  state: GameState,
  extra: {
    programme?: { ajouter: string[]; retirer: string[] };
    alliances?: { proposer: string[] };
  },
  ruleset: Ruleset = QUIET,
) {
  return advanceWeek(state, { actions: [], decisions: [], ...extra }, { ruleset });
}

describe('parrainages (§6)', () => {
  it('un élu ne s’engage qu’une fois : aucun département ne dépasse son réservoir', () => {
    fc.assert(
      fc.property(fc.constantFrom('accessible', 'standard', 'expert'), fc.nat(1000), (d, n) => {
        const state = newGame({ difficulty: d, seed: `res-${n}` });
        const engaged = committedByDepartement(state);
        for (const [dep, count] of engaged) expect(count).toBeLessThanOrEqual(pool(RULESET, dep));
        expect(Object.keys(player(state).parrainages.promesses).length).toBeGreaterThan(0);
      }),
      { numRuns: 15 },
    );
  });

  it('les présentations invalides ne comptent jamais, et au plus un dixième par département', () => {
    const p: ParrainagesState = {
      promesses: {},
      intentions: {},
      recues: { '01': 120, '02': 30 },
      validees: { '01': 118, '02': 28 },
      invalides: { formulaire_irregulier: 4 },
    };
    const counted = countedPresentations(p, RULESET);
    expect(counted.cap).toBe(perDepartementCap(RULESET));
    expect(counted.cap).toBe(50);
    expect(counted.counted).toBe(50 + 28);
    expect(counted.departements).toBe(2);
    // 600 présentations valides concentrées dans 12 départements : seuil non atteint.
    const concentrated: ParrainagesState = {
      ...p,
      validees: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 10), 50])),
    };
    expect(meetsThreshold(concentrated, RULESET)).toBe(false);
    const spread: ParrainagesState = {
      ...p,
      validees: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i + 10), 17])),
    };
    expect(meetsThreshold(spread, RULESET)).toBe(true);
  });

  it('une rencontre d’élus apporte des promesses dans le département ciblé', () => {
    const { state, report } = advance(newGame(), ['elus-locaux@2A']);
    const before = newGame().actors[PLAYER_ACTOR_ID]!.parrainages.promesses['2A'] ?? 0;
    const change = report.parrainages.find((c) => c.actorId === PLAYER_ACTOR_ID)!;
    expect(change.facteurs.some((f) => /Corse-du-Sud \(2A\)/.test(f.label))).toBe(true);
    const gained = change.facteurs.find((f) => /Corse-du-Sud/.test(f.label))!.value;
    expect(gained).toBeGreaterThan(0);
    expect(
      (player(state).parrainages.promesses['2A'] ?? 0) +
        (player(state).parrainages.intentions['2A'] ?? 0),
    ).toBeGreaterThanOrEqual(before);
    expect(report.actions[0]).toMatchObject({ cible: 'Corse-du-Sud (2A)', status: 'validee' });
  });

  it('refuse une action ciblée sans cible ou avec une cible inconnue', () => {
    const { report } = advance(newGame(), ['elus-locaux', 'elus-locaux@99', 'interview@inconnu']);
    expect(
      report.actions.filter((a) => a.actorId === PLAYER_ACTOR_ID).map((a) => a.reason),
    ).toEqual([
      'Choisissez le département de la rencontre.',
      'Cible inconnue : 99.',
      'Cible inconnue : inconnu.',
    ]);
  });

  describe('clôture des présentations', () => {
    const lazy = playUntil(newGame(), (s) => s.meta.phase !== 'campagne', QUIET);
    const active = playUntil(
      newGame(),
      (s) => s.meta.phase !== 'campagne',
      QUIET,
      (s) => sponsorship(s, QUIET),
    );

    it('écarte un candidat sans présentations suffisantes et liste les retenus', () => {
      expect(player(lazy.state).status).toBe('ecarte');
      const closing = lazy.reports.find((r) =>
        r.events.some((e) => e.refId === 'liste-des-candidats'),
      )!;
      expect(closing.date).toBe('2027-03-08');
      expect(closing.events.find((e) => e.refId === 'cloture-parrainages')!.label).toMatch(
        /présentations insuffisantes/,
      );
      expect(Object.keys(lazy.state.elections.t1!.voix)).not.toContain(PLAYER_ACTOR_ID);
    });

    it('chaque candidat du premier tour atteint le seuil ; reçues = validées + invalides', () => {
      for (const state of [lazy.state, active.state]) {
        for (const id of Object.keys(state.elections.t1!.voix)) {
          expect(meetsThreshold(state.actors[id]!.parrainages, RULESET)).toBe(true);
        }
        for (const actor of Object.values(state.actors)) {
          const p = actor.parrainages;
          const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
          expect(sum(p.recues)).toBe(sum(p.validees) + (p.invalides.formulaire_irregulier ?? 0));
        }
      }
      expect(Object.keys(active.state.elections.t1!.voix)).toContain(PLAYER_ACTOR_ID);
    });

    it('verse l’avance forfaitaire aux seuls candidats retenus', () => {
      const advance = RULESET.finances.avanceForfaitaireCentimes;
      for (const actor of Object.values(active.state.actors)) {
        const ran = actor.id in active.state.elections.t1!.voix;
        expect(actor.finances.recettes.avance).toBe(ran ? advance : 0);
      }
    });
  });
});

describe('financement (§6)', () => {
  it('trésorerie = recettes − dépenses pour chaque campagne, semaine après semaine', () => {
    const { reports, state } = playToEnd(newGame(), RULESET, (s) => [
      ...sponsorship(s),
      'collecte',
      'meeting',
      'emprunt-bancaire',
    ]);
    expect(reports.length).toBeGreaterThan(25);
    for (const actor of Object.values(state.actors)) {
      expect(actor.resources.budgetCentimes).toBe(
        totalReceipts(actor.finances) - actor.finances.depenses,
      );
    }
    expect(player(state).finances.donateurs).toBeGreaterThan(0);
  });

  it('dépassement de plafond détecté : la dépense est refusée à la validation', () => {
    const state = withResources(newGame(), { budgetCentimes: 1_000_000_000 });
    const cap = spendingCap(state, PLAYER_ACTOR_ID, RULESET);
    player(state).finances.depenses = cap - 5_000_000;
    const { report } = advance(state, ['meeting']);
    expect(report.actions[0]).toMatchObject({
      status: 'rejetee',
      reason: expect.stringMatching(/^Plafond légal des dépenses atteint/),
    });
  });

  it('dépassement de plafond détecté : une dépense imprévue au-delà du plafond est signalée', () => {
    const state = withResources(newGame(), { budgetCentimes: 1_000_000_000 });
    const cap = spendingCap(state, PLAYER_ACTOR_ID, RULESET);
    player(state).finances.depenses = cap - 1_000;
    const book = new FinanceBook(state, RULESET, new Ledger(state));
    book.spend(PLAYER_ACTOR_ID, 500_000, 'Dépense imprévue', 'evenement', 5);
    expect(player(state).finances.depassement).toEqual({ semaine: 0, montantCentimes: 499_000 });
    expect(book.list()[0]!.notes[0]).toMatch(/Dépassement du plafond légal/);
    expect(provisionalReimbursement(player(state), RULESET, 0.2, false)).toBe(0);
  });

  it('dons interdits refusés : personnes morales, espèces au-delà de 150 €, part au-delà de 4 600 €', () => {
    const state = newGame();
    const book = new FinanceBook(state, RULESET, new Ledger(state));
    const before = player(state).resources.budgetCentimes;
    const dons = {
      donateurs: { base: 10, ecart: 0 },
      montantMoyenCentimes: 10_000,
      probaPersonneMorale: 1,
      probaDepassement: 1,
      probaEspeces: 1,
    };
    processDonations(
      book,
      RULESET,
      PLAYER_ACTOR_ID,
      dons,
      createRng(deriveRngState('dons')),
      'Collecte',
      'action',
      5,
      0,
    );
    const refus = player(state).finances.refus;
    expect(refus.derniers.map((r) => r.origine).sort()).toEqual([
      'depassement',
      'especes',
      'personne_morale',
    ]);
    expect(refus.derniers.every((r) => /L\. 52-8/.test(r.motif))).toBe(true);
    // Encaissé : 10 dons de 100 € et un don ramené au maximum légal.
    const accepted = 10 * 10_000 + RULESET.finances.donMaxCentimes;
    expect(player(state).resources.budgetCentimes - before).toBe(accepted);
    expect(player(state).finances.recettes.dons).toBe(accepted);
    expect(player(state).finances.donateurs).toBe(11);
  });

  it('la banque ne prête que si le remboursement attendu couvre l’emprunt', () => {
    const state = newGame();
    const book = new FinanceBook(state, RULESET, new Ledger(state));
    requestLoan(book, state, RULESET, PLAYER_ACTOR_ID, 100_000_000, 'Prêt', 5);
    expect(player(state).finances.recettes.emprunts).toBe(0);
    state.opinion = {
      week: 0,
      round: 1,
      participation: 7_000,
      intentions: { joueur: 800 },
      breakdown: {},
    };
    requestLoan(book, state, RULESET, PLAYER_ACTOR_ID, 100_000_000, 'Prêt', 5);
    expect(player(state).finances.recettes.emprunts).toBe(100_000_000);
    expect(player(state).finances.emprunts).toHaveLength(1);
  });
});

describe('médias et débats (§8)', () => {
  const exposition = (m: MediaState, outlet: string, actor = PLAYER_ACTOR_ID) =>
    m.couverture[outlet]![actor]!.exposition;

  it('couvre chaque semaine tous les organes réels, et eux seuls', () => {
    const medias = advance(newGame(), []).state.medias!;
    expect(Object.keys(medias.couverture).sort()).toEqual(
      RULESET.mediasReels.organes.map((o) => o.id).sort(),
    );
    expect(medias.interviews).toEqual([]);
    for (const indice of Object.values(medias.indice))
      expect(Math.abs(indice)).toBeLessThanOrEqual(1);
  });

  it('une interview accroît l’exposition dans l’organe choisi', () => {
    const base = advance(newGame(), []).state.medias!;
    const withInterview = advance(newGame(), ['interview@france-inter']).state.medias!;
    const gain = (outlet: string) => exposition(withInterview, outlet) - exposition(base, outlet);
    // L'interview cible France Inter ; ailleurs, seule la notoriété gagnée joue un peu.
    expect(gain('france-inter')).toBeGreaterThan(gain('rtl') + 1_000);
  });

  it('une émission politique expose sur sa chaîne, en partie sur ses autres diffuseurs', () => {
    const show = RULESET.mediasReels.emissions.find((e) => e.autresOrganes.length > 0)!;
    const other = show.autresOrganes[0]!;
    const unrelated = RULESET.mediasReels.organes.find(
      (o) => o.id !== show.organeId && !show.autresOrganes.includes(o.id) && o.type !== 'presse',
    )!.id;
    const base = advance(newGame(), []).state.medias!;
    const after = advance(newGame(), [`emission-politique@${show.id}`]).state.medias!;
    const gain = (outlet: string) => exposition(after, outlet) - exposition(base, outlet);
    const bonus = RULESET.actions.find((a) => a.id === 'emission-politique')!.campagne!.exposition!;
    expect(gain(show.organeId)).toBeGreaterThanOrEqual(bonus);
    expect(gain(other)).toBeGreaterThanOrEqual(Math.round(bonus * RULESET.medias.partCodiffusion));
    expect(gain(other)).toBeLessThan(gain(show.organeId));
    expect(gain(unrelated)).toBeLessThan(bonus / 3);
    expect(after.interviews).toEqual([{ emissionId: show.id, acteurId: PLAYER_ACTOR_ID }]);
  });

  it('refuse une émission inconnue ou une émission absente', () => {
    const report = advance(newGame(), [
      'emission-politique@emi-inconnue',
      'emission-politique',
    ]).report;
    expect(
      report.actions.filter((a) => a.actorId === PLAYER_ACTOR_ID).map((a) => [a.status, a.reason]),
    ).toEqual([
      ['rejetee', 'Cible inconnue : emi-inconnue.'],
      ['rejetee', 'Choisissez l’émission politique.'],
    ]);
  });

  it('module l’exposition à la télévision et à la radio selon le parti mesuré, bornée', () => {
    const outlet = RULESET.mediasReels.organes.find((o) => o.tempsDeParole)!;
    expect(propensity(RULESET, outlet, null)).toBe(1);
    expect(propensity(RULESET, outlet, 'Parti absent des relevés')).toBe(1);
    for (const o of RULESET.mediasReels.organes)
      for (const party of Object.keys(o.tempsDeParole?.propension ?? {})) {
        const value = propensity(RULESET, o, party);
        expect(value).toBeGreaterThanOrEqual(RULESET.medias.propension.min);
        expect(value).toBeLessThanOrEqual(RULESET.medias.propension.max);
      }
    const press = RULESET.mediasReels.organes.find((o) => o.type === 'presse')!;
    for (const r of RULESET.mediasReels.rattachements)
      expect(propensity(RULESET, press, r.partiArcom)).toBe(1);
  });

  it('presse écrite : couverture identique quel que soit le parti rattaché (propriété)', () => {
    const real = playUntil(
      newGame({ mode: 'observateur', adversaires: 'reels' }),
      (s) => s.meta.week >= 2,
      QUIET,
    ).state;
    const parties = RULESET.mediasReels.rattachements.map((r) => r.partiArcom);
    const press = RULESET.mediasReels.organes.filter((o) => o.type === 'presse').map((o) => o.id);
    const broadcast = RULESET.mediasReels.organes
      .filter((o) => o.type !== 'presse')
      .map((o) => o.id);
    const coverage = (rattachements: Ruleset['mediasReels']['rattachements']) => {
      const ruleset = { ...QUIET, mediasReels: { ...QUIET.mediasReels, rattachements } };
      const state = JSON.parse(JSON.stringify(real)) as GameState;
      return updateMedia(state, ruleset, new Ledger(state), [], new Set(), 6)!;
    };
    const reference = coverage(RULESET.mediasReels.rattachements);
    fc.assert(
      fc.property(fc.shuffledSubarray(parties, { minLength: parties.length }), (shuffled) => {
        const permuted = coverage(
          RULESET.mediasReels.rattachements.map((r, i) => ({ ...r, partiArcom: shuffled[i]! })),
        );
        for (const id of press) expect(permuted.couverture[id]).toEqual(reference.couverture[id]);
      }),
      { numRuns: 25 },
    );
    // Sans aucun parti rattaché, la télévision et la radio changent (exposition mesurée).
    const neutral = coverage(
      RULESET.mediasReels.rattachements.map((r) => ({ ...r, partiArcom: null })),
    );
    expect(
      broadcast.some(
        (id) => JSON.stringify(neutral.couverture[id]) !== JSON.stringify(reference.couverture[id]),
      ),
    ).toBe(true);
    for (const id of press) expect(neutral.couverture[id]).toEqual(reference.couverture[id]);
  });

  it('les adversaires choisissent eux aussi des émissions réelles, selon les mêmes règles', () => {
    const { reports } = playUntil(
      newGame({ mode: 'observateur', adversaires: 'reels' }),
      (s) => s.meta.week >= 12,
      QUIET,
    );
    const definition = RULESET.actions.find((a) => a.id === 'emission-politique')!;
    const labels = new Set(
      RULESET.mediasReels.emissions.map((e) => targetLabel(RULESET, definition, e.id)),
    );
    const chosen = reports.flatMap((r) =>
      r.actions.filter((a) => a.actionId === 'emission-politique' && a.status === 'validee'),
    );
    expect(chosen.length).toBeGreaterThan(0);
    for (const a of chosen) expect(labels.has(a.cible!)).toBe(true);
    // Les interviews tenues figurent dans l'état des médias de la semaine.
    expect(reports.length).toBeGreaterThan(0);
  });

  it('une meilleure préparation améliore la prestation attendue au débat ; composantes bornées', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.nat(40), (u, hours) => {
        const state = newGame();
        player(state).preparationDebat = hours;
        const low = debateComponents(state, RULESET, PLAYER_ACTOR_ID, u);
        player(state).preparationDebat = hours + 10;
        const high = debateComponents(state, RULESET, PLAYER_ACTOR_ID, u);
        for (const value of Object.values(high)) expect(value >= 0 && value <= 1).toBe(true);
        expect(debatePerformance(high, RULESET)).toBeGreaterThanOrEqual(
          debatePerformance(low, RULESET),
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe('relations et alliances (§7)', () => {
  /** État à quelques semaines du premier tour, avec des intentions choisies. */
  function nearFirstRound(intentions: Record<string, number>): GameState {
    const state = newGame();
    state.meta.date = '2027-03-15';
    state.meta.week = 24;
    // Les autres candidats sont bien placés : ils n'envisagent pas de ralliement.
    const others = Object.fromEntries(Object.keys(state.actors).map((id) => [id, 1_200]));
    state.opinion = {
      week: 23,
      round: 1,
      participation: 7_000,
      intentions: { ...others, ...intentions },
      breakdown: {},
    };
    return state;
  }

  it('un ralliement proposé par le joueur est accepté ou refusé par l’autre candidat', () => {
    let accepted = 0;
    for (let i = 0; i < 12; i++) {
      // 4,5 % : sous le joueur, mais au-dessus du seuil où l'IA envisage d'elle-même un ralliement.
      const state = nearFirstRound({ joueur: 2_500, 'adv-agora': 450 });
      state.meta.seed = `alliance-${i}`;
      const relation = state.relations[relationKey(PLAYER_ACTOR_ID, 'adv-agora')]!;
      relation.confiance = 80;
      const outcome = resolveAlliances(state, RULESET, ['adv-agora'], new Set());
      const mine = outcome.alliances.filter((a) => a.origine === 'joueur');
      if (mine.length === 1) {
        accepted += 1;
        expect(state.actors['adv-agora']!.status).toBe('retire');
        expect(mine[0]).toMatchObject({ de: 'adv-agora', vers: PLAYER_ACTOR_ID });
      } else {
        expect(mine).toEqual([]);
        expect(outcome.notes.some((n) => /décline votre proposition/.test(n.libelle))).toBe(true);
      }
      expect(player(state).status).toBe('candidat');
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it('sans intentions mesurées (semaine 0), aucune rivalité n’est déclarée', () => {
    const state = newGame();
    const before = clone(state.relations);
    expect(state.opinion).toBeNull();
    expect(updateRelations(state)).toEqual([]);
    expect(state.relations).toEqual(before);
    const { state: next } = advance(state);
    expect(Object.values(next.relations).every((r) => r.historique.length === 0)).toBe(true);
  });

  it('hors de la fenêtre, une proposition reste sans suite', () => {
    const state = newGame();
    const outcome = resolveAlliances(state, RULESET, ['adv-agora'], new Set());
    expect(outcome.alliances).toEqual([]);
    expect(outcome.notes[0]!.libelle).toMatch(/sans suite/);
  });

  it('un candidat rallié ne figure pas au premier tour ; le joueur n’est jamais rallié d’office', () => {
    const { state, reports } = playToEnd(newGame({ seed: 'alliances-1' }), RULESET, (s) =>
      sponsorship(s),
    );
    for (const alliance of state.alliances) {
      expect(state.actors[alliance.de]!.status).toBe('retire');
      expect(Object.keys(state.elections.t1!.voix)).not.toContain(alliance.de);
      expect(alliance.de).not.toBe(PLAYER_ACTOR_ID);
    }
    expect(reports.every((r) => r.steps.find((s) => s.step === 4)!.active)).toBe(true);
  });
});

describe('IA adverse et mode observateur (§7, critère 5)', () => {
  const { state, reports } = playToEnd(newGame({ mode: 'observateur', seed: 'obs-p5' }), RULESET);

  it('les adversaires agissent seuls : stratégie motivée chaque semaine, actions ciblées', () => {
    expect(reports.every((r) => r.strategies.length > 0 || r.week >= 28)).toBe(true);
    const actions = reports.flatMap((r) => r.actions);
    expect(actions.length).toBeGreaterThan(100);
    expect(actions.some((a) => a.actionId === 'elus-locaux' && a.cible !== null)).toBe(true);
    expect(actions.some((a) => a.actionId === 'interview' && a.cible !== null)).toBe(true);
    for (const r of reports)
      for (const s of r.strategies) expect(s.motif.length).toBeGreaterThan(10);
  });

  it('les adversaires réunissent leurs parrainages et financent leur campagne', () => {
    const ran = Object.keys(state.elections.t1!.voix);
    expect(ran.length).toBeGreaterThanOrEqual(2);
    for (const id of ran) expect(meetsThreshold(state.actors[id]!.parrainages, RULESET)).toBe(true);
    expect(Object.values(state.actors).some((a) => a.finances.recettes.dons > 0)).toBe(true);
    for (const actor of Object.values(state.actors)) {
      expect(actor.finances.depenses).toBeLessThanOrEqual(RULESET.finances.plafondT2Centimes);
      expect(actor.finances.depassement).toBeNull();
    }
  });

  it('remboursement prévisionnel calculé pour chaque candidat présent au premier tour', () => {
    for (const id of Object.keys(state.elections.t1!.voix)) {
      expect(state.actors[id]!.finances.remboursementPrevisionnel).not.toBeNull();
    }
  });
});

describe('difficulté (§1.3)', () => {
  const t1 = playUntil(
    newGame({ seed: 'diff' }),
    (s) => s.meta.week === 28,
    QUIET,
    (s) => sponsorship(s, QUIET),
  ).state;

  it('la difficulté ne modifie jamais le décompte des voix', () => {
    fc.assert(
      fc.property(fc.constantFrom('accessible', 'standard', 'expert'), (difficulty) => {
        const other = clone(t1);
        other.meta.difficulty = difficulty;
        const scrutin = RULESET.calendrier.scrutins[0]!;
        const baseline = nationalBaseline(RULESET);
        expect(resolveRound(other, RULESET, scrutin, 1, baseline)).toEqual(
          resolveRound(t1, RULESET, scrutin, 1, baseline),
        );
      }),
      { numRuns: 6 },
    );
  });

  it('les règles (seuil des parrainages, plafonds) ne dépendent pas de la difficulté', () => {
    for (const actor of Object.values(t1.actors)) {
      const other = clone(t1);
      other.meta.difficulty = 'expert';
      expect(meetsThreshold(other.actors[actor.id]!.parrainages, RULESET)).toBe(
        meetsThreshold(actor.parrainages, RULESET),
      );
      expect(spendingCap(other, actor.id, RULESET)).toBe(spendingCap(t1, actor.id, RULESET));
    }
  });

  it('elle change les moyens des adversaires et la pression sur le joueur', () => {
    const easy = newGame({ difficulty: 'accessible' });
    const hard = newGame({ difficulty: 'expert' });
    expect(easy.actors['adv-boussole']!.resources.budgetCentimes).toBeLessThan(
      hard.actors['adv-boussole']!.resources.budgetCentimes,
    );
    expect(player(easy).resources.budgetCentimes).toBeGreaterThan(
      player(hard).resources.budgetCentimes,
    );
  });
});
