import {
  cycleRuleset,
  GameStateSchema,
  type GameState,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { initialMeans, PLAYER_ACTOR_ID } from '../core/createGame';
import { concludeDebates, newGame, playToEnd, QUIET, sponsorship } from '../core/testing';
import { presidentOf } from './government';

// Phase 6 (P6-08) : fin du quinquennat, bilan et présidentielle suivante avec le même moteur.

const RULES = QUIET;

const elected = playToEnd(newGame({ seed: 'cycle' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;

/** Joue avec les décisions par défaut ; `plan` donne les actions du joueur (campagne). */
function play(
  start: GameState,
  until: (state: GameState) => boolean,
  ruleset: Ruleset = RULES,
  plan: (state: GameState) => string[] = () => [],
) {
  let state = start;
  const reports: WeeklyReport[] = [];
  for (let i = 0; i < 400 && !until(state) && !state.calendar.blockedBy; i++) {
    state = concludeDebates(state, ruleset);
    const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
    const active = player?.status === 'candidat' || player?.status === 'qualifie';
    const result = advanceWeek(
      state,
      {
        actions: (active && state.meta.phase !== 'presidence' ? plan(state) : []).map((id) => {
          const [actionId, cible] = id.split('@');
          return cible ? { actionId: actionId!, cible } : { actionId: actionId! };
        }),
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    );
    reports.push(result.report);
    state = result.state;
  }
  return { state, reports };
}

const toCampaign = play(elected, (s) => s.meta.phase === 'campagne');
const campaign = toCampaign.state;
const transition = toCampaign.reports.at(-1)!;
/** Dernière semaine du quinquennat, juste avant l'ouverture de la campagne. */
const before = play(elected, (s) => s.meta.week === campaign.meta.week - 1).state;

describe('fin du quinquennat', () => {
  it('ouvre la campagne de 2032 le lundi prévu, avec un bilan et des archives', () => {
    expect(campaign.meta).toMatchObject({ date: '2031-09-29', phase: 'campagne' });
    expect(campaign.cycle).toEqual({ annee: 2032, decalageSemaines: 261 });
    expect(campaign.quinquennat).toBeNull();
    expect(transition.phaseChange).toEqual({ from: 'presidence', to: 'campagne' });
    expect(transition.events.map((e) => e.label)).toEqual(
      expect.arrayContaining([
        'Fin du quinquennat 2027–2032 : bilan arrêté',
        'Présidentielle 2032 : la campagne commence',
      ]),
    );
    expect(GameStateSchema.safeParse(campaign).error).toBeUndefined();

    const [presidentielle] = campaign.historique.presidentielles;
    expect(campaign.historique.presidentielles).toHaveLength(1);
    expect(presidentielle).toMatchObject({ annee: 2027, eluId: presidentOf(elected).id });
    expect(presidentielle!.t1).toEqual(elected.elections.t1);

    const [archived] = campaign.historique.quinquennats;
    expect(campaign.historique.quinquennats).toHaveLength(1);
    expect(archived!.mandat).toEqual(elected.quinquennat!.mandat);
    expect(archived!.gouvernements.at(-1)!.motif).toBe('fin du quinquennat');
    const { bilan } = archived!;
    // Relevés : à l'élection, puis au début de la campagne suivante.
    expect(bilan.debut).toEqual(elected.quinquennat!.depart);
    expect(bilan.debut.popularite).not.toBeNull();
    expect(bilan.fin).toMatchObject({ date: '2031-09-29', semaine: campaign.meta.week });
    expect(bilan.fin.indicateurs).toEqual(campaign.economie!.indicateurs);
    // Réformes : celles adoptées pendant le quinquennat, textes clos ou devenus caducs.
    const textes = campaign.parlement!.textes;
    expect(bilan.reformes.adoptees).toEqual(
      campaign.parlement!.reformes.map((r) => r.propositionId),
    );
    expect(bilan.reformes.rejetees).toBe(textes.filter((b) => b.etape === 'rejete').length);
    expect(textes.every((b) => b.issue !== null)).toBe(true);
    expect(bilan.gouvernements).toBe(archived!.gouvernements.length);
    // Législatives de fin de législature (juin 2029) tenues pendant le quinquennat.
    expect(bilan.legislatives).toMatchObject({ motif: 'fin-de-legislature', t2: '2029-06-17' });
    // Conséquences durables nées pendant le quinquennat ; les achevées quittent l'état courant.
    for (const c of bilan.consequences) expect(c.debut).toBeGreaterThan(bilan.debut.semaine);
    expect(campaign.consequences.every((c) => c.fin >= campaign.meta.week - 1)).toBe(true);
  });

  it('remet parrainages et comptes de campagne à zéro, par le registre', () => {
    for (const actor of Object.values(campaign.actors)) {
      expect(actor.status).toBe('candidat');
      expect(actor.parrainages.recues).toEqual({});
      expect(actor.parrainages.validees).toEqual({});
      const { recettes, depenses } = actor.finances;
      const total = Object.values(recettes).reduce((a, b) => a + b, 0);
      // Compte ouvert : recettes de départ = budget, aucune dépense.
      expect(total - depenses).toBe(actor.resources.budgetCentimes);
      expect(depenses).toBe(0);
      const means = initialMeans(campaign, RULES, actor);
      expect(actor.resources.budgetCentimes).toBe(means.budgetCentimes);
      expect(actor.resources.militants).toBeGreaterThanOrEqual(means.militants);
      expect(actor.resources.notoriete).toBeGreaterThanOrEqual(means.notoriete);
    }
    const promised = Object.values(campaign.actors).filter(
      (a) => Object.keys(a.parrainages.promesses).length > 0,
    );
    expect(promised.length).toBeGreaterThan(0);
    // Chaque variation du budget est expliquée par un facteur « nouveau compte de campagne ».
    const budgets = transition.changes.filter((c) => c.ressource === 'budgetCentimes');
    expect(budgets.length).toBeGreaterThan(0);
    for (const change of budgets) {
      expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
        change.after - change.before,
      );
      expect(change.factors.some((f) => f.label.startsWith('Présidentielle 2032'))).toBe(true);
    }
    expect(before.meta.phase).toBe('presidence');
  });

  it('applique le calendrier de 2027 transposé en 2032 (hypothèse étiquetée)', () => {
    const calendar = cycleRuleset(RULES, campaign.cycle);
    expect(calendar.calendrier.scrutins.map((s) => [s.id, s.date, s.statut])).toEqual([
      ['presidentielle-2032-t1', '2032-04-18', 'hypothese'],
      ['presidentielle-2032-t2', '2032-05-02', 'hypothese'],
    ]);
    expect(calendar.calendrier.echeances.every((e) => e.statut === 'hypothese')).toBe(true);
    expect(cycleRuleset(RULES, campaign.cycle)).toBe(calendar);
    expect(cycleRuleset(RULES, elected.cycle)).toBe(RULES);
  });

  it('est déterministe', () => {
    expect(play(elected, (s) => s.meta.phase === 'campagne').state).toEqual(campaign);
  });
});

describe('présidentielle de 2032', () => {
  const sponsor = (s: GameState) => sponsorship(s, RULES);
  const result = play(campaign, (s) => s.quinquennat !== null, RULES, sponsor);
  const next = result.state;

  it('se joue avec le même moteur et ouvre un nouveau quinquennat', () => {
    const elections = result.reports.filter((r) => r.election);
    expect(elections.map((r) => [r.election!.scrutinId, r.date])).toEqual(
      expect.arrayContaining([['presidentielle-2032-t1', '2032-04-12']]),
    );
    expect(next.meta.phase).toBe('presidence');
    const mandate = next.quinquennat!.mandat;
    expect(mandate).toMatchObject({ debut: '2032-05-14', fin: '2037-05-13' });
    const previous = campaign.historique.quinquennats[0]!.mandat;
    expect(mandate.numero).toBe(mandate.presidentId === previous.presidentId ? 2 : 1);
    // Le joueur, battu en 2027, a pu se présenter à nouveau.
    expect(next.actors[PLAYER_ACTOR_ID]!.status).not.toBe('ecarte');
    expect(GameStateSchema.safeParse(next).error).toBeUndefined();
  });
});

describe('limite de deux mandats consécutifs (art. 6)', () => {
  it('le président sortant au terme de deux mandats ne se représente pas', () => {
    const start = JSON.parse(JSON.stringify(before)) as GameState;
    const presidentId = start.quinquennat!.mandat.presidentId;
    start.quinquennat!.mandat.numero = 2;
    const { state, report } = advanceWeek(
      start,
      {
        actions: [],
        decisions: start.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset: RULES },
    );
    expect(state.meta.phase).toBe('campagne');
    expect(state.actors[presidentId]!.status).toBe('ineligible');
    expect(state.actors[presidentId]!.parrainages.promesses).toEqual({});
    expect(
      report.events.find((e) => e.label.startsWith('Présidentielle 2032'))!.description,
    ).toMatch(/ne peut pas se représenter \(Constitution, art\. 6\)/);
    // Il n'agit plus et n'est pas au premier tour.
    const t1 = play(state, (s) => s.elections.t1 !== null).state.elections.t1!;
    expect(Object.keys(t1.voix)).not.toContain(presidentId);
  });
});
