import { supportOfFigure, type GameState, type MemberRef, type Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { GameCreationError, PLAYER_ACTOR_ID } from '../core/createGame';
import { Ledger } from '../core/ledger';
import {
  advance,
  newGame,
  playerChange,
  QUIET,
  RULESET,
  TEST_CANDIDATE,
  withEvents,
} from '../core/testing';
import { distribute, summarize } from '../election/distribution';
import { distance } from '../election/model';
import {
  answerMinister,
  composeMinisters,
  nominate,
  openQuinquennat,
  presidentOf,
} from '../presidency/government';
import { baseGroups, orientationById } from './orientation';
import { committed, departements, pool, presentationWindow, stageTotal } from './parrainages';
import { RENDEZ_VOUS_EVENT } from './rendezvous';
import { assessSupport, negotiationError, supportFactors, supportProspects } from './soutiens';

// Phase 15 (P15-02) : orientation stratégique, base électorale de départ, rendez-vous d'élus,
// négociations de soutien avec les personnalités réelles nominables, ministère promis.

const RENDEZ_VOUS = withEvents({ [RENDEZ_VOUS_EVENT]: 1 });
const figure = (id: string) => RULESET.figures.figures.find((f) => f.id === id)!;
const promesses = (state: GameState) =>
  stageTotal(state.actors[PLAYER_ACTOR_ID]!.parrainages, 'promesses');
const defaults = (state: GameState) =>
  state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId }));
const BASE_LABEL = /^Base électorale de départ \(« .+ », hypothèse de jeu\)$/;

/** Facteur « base électorale » du joueur dans chaque groupe d'électeurs, au premier tour. */
function baseByGroup(state: GameState, ruleset: Ruleset = QUIET): Map<string, number> {
  const result = new Map<string, number>();
  for (const d of distribute(state, ruleset, 1, 'opinion')) {
    const index = d.contenders.findIndex((c) => c.id === PLAYER_ACTOR_ID);
    const factor = d.factors[index]!.find((f) => BASE_LABEL.test(f.label));
    if (factor) result.set(d.group.id, factor.value);
  }
  return result;
}

describe('orientation stratégique du mouvement', () => {
  it('modifie les moyens et les promesses de parrainage de départ du joueur', () => {
    const plain = newGame();
    const camp = newGame({ orientationId: 'camp' });
    const elus = newGame({ orientationId: 'elus-locaux' });
    const numerique = newGame({ orientationId: 'numerique' });
    expect(camp.player.orientation).toBe('camp');
    expect(plain.player.orientation).toBeNull();
    const r = (s: GameState) => s.actors[PLAYER_ACTOR_ID]!.resources;
    expect(r(camp).militants).toBe(r(plain).militants + 250);
    expect(r(elus).notoriete).toBe(r(plain).notoriete - 100);
    expect(r(numerique).jeunesse).toBe(r(plain).jeunesse + 800);
    expect(r(numerique).dynamique).toBe(r(plain).dynamique + 300);
    expect(camp.actors[PLAYER_ACTOR_ID]!.history.popularite).toEqual([r(camp).popularite]);
    expect(promesses(elus)).toBe(promesses(plain) + 120);
    expect(promesses(numerique)).toBe(promesses(plain) - 40);
    // Les adversaires ne sont pas concernés.
    for (const id of Object.keys(plain.actors).filter((id) => id !== PLAYER_ACTOR_ID))
      expect(elus.actors[id]!.resources).toEqual(plain.actors[id]!.resources);
  });

  it('refuse une orientation inconnue, et toute orientation en mode observateur', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof GameCreationError ? error.code : 'autre';
      }
      return null;
    };
    expect(code(() => newGame({ orientationId: 'inconnue' }))).toBe('orientation_inconnue');
    expect(code(() => newGame({ mode: 'observateur', orientationId: 'camp' }))).toBe(
      'orientation_sans_candidat',
    );
  });

  it('donne une base électorale nommée dans les groupes visés, qui décroît puis s’éteint', () => {
    const state = newGame({ orientationId: 'camp' });
    const at = (week: number) => baseByGroup({ ...state, meta: { ...state.meta, week } });
    const start = at(0);
    // « Mobiliser son camp » : le seul groupe le plus proche du candidat.
    const nearest = [...RULESET.electorat.groupes].sort(
      (a, b) =>
        distance(a.position, TEST_CANDIDATE.positionnement) -
        distance(b.position, TEST_CANDIDATE.positionnement),
    )[0]!;
    expect([...start.keys()]).toEqual([nearest.id]);
    expect(start.get(nearest.id)).toBeCloseTo(0.6, 10);
    expect(at(13).get(nearest.id)).toBeCloseTo(0.3, 10);
    expect(at(26).size).toBe(0);
    expect(at(40).size).toBe(0);
    // Sans orientation, aucun facteur de base électorale.
    expect(baseByGroup(newGame()).size).toBe(0);
  });

  it('vise les électorats éloignés du centre pour une candidature de rupture', () => {
    const state = newGame({ orientationId: 'rupture' });
    const groups = baseByGroup(state);
    const orientation = orientationById(RULESET, 'rupture')!;
    const expected = RULESET.electorat.groupes
      .filter((g) => distance(g.position, { economie: 0, societe: 0 }) >= 0.6)
      .map((g) => g.id);
    expect([...groups.keys()].sort()).toEqual([...expected].sort());
    expect([...baseGroups(RULESET, orientation, TEST_CANDIDATE.positionnement)].sort()).toEqual(
      [...expected].sort(),
    );
  });

  it('entre dans la décomposition des intentions du joueur', () => {
    const { report } = advance(newGame({ orientationId: 'rassemblement' }));
    expect(report.intentions).not.toBeNull();
    const state = newGame({ orientationId: 'rassemblement' });
    const opinion = summarize(distribute(state, QUIET, 1, 'opinion'), 0, 1)!;
    const base = opinion.breakdown[PLAYER_ACTOR_ID]!.find((f) => BASE_LABEL.test(f.label));
    expect(base!.value).toBeGreaterThan(0);
    for (const [id, factors] of Object.entries(opinion.breakdown))
      if (id !== PLAYER_ACTOR_ID) expect(factors.some((f) => BASE_LABEL.test(f.label))).toBe(false);
  });
});

describe('rendez-vous d’élus', () => {
  const first = advance(newGame(), [], [], RENDEZ_VOUS);
  const decision = first.state.pendingDecisions.find((d) => d.kind === 'parrainage')!;
  const { min, max } = RULESET.parrainages.rendezVous.promesses;

  it('propose une délégation fictive et anonyme d’un département, à recevoir ou décliner', () => {
    expect(decision).toMatchObject({
      kind: 'parrainage',
      eventId: RENDEZ_VOUS_EVENT,
      actorId: PLAYER_ACTOR_ID,
      createdWeek: 0,
      defaultOptionId: 'recevoir',
    });
    expect(decision.options.map((o) => o.id)).toEqual(['recevoir', 'decliner']);
    expect(departements(RULESET)).toContain(decision.departement);
    expect(decision.description).toMatch(/délégation fictive, aucun élu n’est nommé/);
    const event = first.report.events.find((e) => e.refId === RENDEZ_VOUS_EVENT)!;
    expect(event).toMatchObject({ nature: 'fictif', decisionId: decision.id });
    // Une réponse est exigée avant de continuer.
    expect(() => advance(first.state, [], [], RENDEZ_VOUS)).toThrow(/Décision à prendre/);
  });

  it('reçue : promesses dans la limite des élus libres, heures réservées avant les actions', () => {
    const dep = decision.departement!;
    const before = first.state.actors[PLAYER_ACTOR_ID]!.parrainages.promesses[dep] ?? 0;
    const free = pool(RULESET, dep) - committed(first.state, dep);
    const second = advance(
      first.state,
      [],
      [{ decisionId: decision.id, optionId: 'recevoir' }],
      RENDEZ_VOUS,
    );
    const gained = second.report.parrainages
      .find((p) => p.actorId === PLAYER_ACTOR_ID)!
      .facteurs.filter((f) => f.label.startsWith('Rendez-vous d’élus'));
    expect(gained).toHaveLength(1);
    expect(gained[0]!.value).toBeGreaterThanOrEqual(Math.min(min, free));
    expect(gained[0]!.value).toBeLessThanOrEqual(Math.min(max, free));
    expect(second.report.decisions[0]).toMatchObject({ optionId: 'recevoir', automatic: false });
    expect(second.report.decisions[0]!.label).toMatch(/délégation reçue, \d+ promesse/);
    const time = playerChange(second.report, 'tempsHeures')!.factors.find(
      (f) => f.label === decision.label,
    );
    expect(time).toMatchObject({
      value: -RULESET.parrainages.rendezVous.tempsHeures,
      source: 'decision',
      step: 2,
    });
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('les heures de la délégation passent avant les actions du joueur', () => {
    // 68 h d'actions sur 70 : elles tiennent, sauf si la délégation (4 h) est reçue.
    const plan = ['tournee', 'tournee', 'meeting', 'meeting', 'numerique', 'vague-video-courte'];
    const rejected = (optionId: string) =>
      advance(
        first.state,
        plan,
        [{ decisionId: decision.id, optionId }],
        RENDEZ_VOUS,
      ).report.actions.filter((a) => a.actorId === PLAYER_ACTOR_ID && a.status === 'rejetee');
    expect(rejected('decliner')).toHaveLength(0);
    expect(rejected('recevoir').map((a) => [a.actionId, a.reason])).toEqual([
      ['vague-video-courte', expect.stringMatching(/^Temps insuffisant : 2 h nécessaires/)],
    ]);
  });

  it('déclinée : aucune promesse ni heure prise', () => {
    const second = advance(
      first.state,
      [],
      [{ decisionId: decision.id, optionId: 'decliner' }],
      RENDEZ_VOUS,
    );
    const facteurs =
      second.report.parrainages.find((p) => p.actorId === PLAYER_ACTOR_ID)?.facteurs ?? [];
    expect(facteurs.some((f) => f.label.startsWith('Rendez-vous d’élus'))).toBe(false);
    expect(
      playerChange(second.report, 'tempsHeures')?.factors.some((f) => f.source === 'decision') ??
        false,
    ).toBe(false);
    expect(second.report.decisions[0]!.label).toMatch(/délégation déclinée/);
  });

  it('ne promet jamais plus que les élus encore libres du département', () => {
    const state = JSON.parse(JSON.stringify(first.state)) as GameState;
    const dep = decision.departement!;
    // Un adversaire engage tous les élus libres du département sauf deux.
    const rival = Object.keys(state.actors).find((id) => id !== PLAYER_ACTOR_ID)!;
    const free = pool(RULESET, dep) - committed(state, dep);
    state.actors[rival]!.parrainages.promesses[dep] =
      (state.actors[rival]!.parrainages.promesses[dep] ?? 0) + free - 2;
    const second = advance(
      state,
      [],
      [{ decisionId: decision.id, optionId: 'recevoir' }],
      RENDEZ_VOUS,
    );
    const gained = second.report.parrainages
      .find((p) => p.actorId === PLAYER_ACTOR_ID)!
      .facteurs.find((f) => f.label.startsWith('Rendez-vous d’élus'))!;
    expect(gained.value).toBe(2);
  });

  it('respecte le délai entre deux rendez-vous et s’arrête avant la clôture des présentations', () => {
    let state = newGame();
    const weeks: number[] = [];
    for (let i = 0; i < 8; i++) {
      const result = advance(state, [], defaults(state), RENDEZ_VOUS);
      if (result.report.events.some((e) => e.refId === RENDEZ_VOUS_EVENT))
        weeks.push(result.report.week);
      state = result.state;
    }
    expect(weeks).toEqual([0, 2, 4, 6]);
    // Semaine de la clôture des présentations, puis après : plus aucun rendez-vous.
    const closing = presentationWindow('2027-03-08', RULESET);
    expect(closing.closingWeek).toBe(true);
    for (const date of ['2027-03-08', '2027-03-15']) {
      const late = newGame();
      late.meta.date = date;
      late.meta.week = 30;
      expect(
        advance(late, [], [], RENDEZ_VOUS).report.events.some((e) => e.refId === RENDEZ_VOUS_EVENT),
      ).toBe(false);
    }
  });

  it('ne concerne ni le mode observateur ni les adversaires', () => {
    const observer = advance(newGame({ mode: 'observateur' }), [], [], RENDEZ_VOUS);
    expect(observer.state.pendingDecisions.some((d) => d.kind === 'parrainage')).toBe(false);
    expect(first.state.pendingDecisions.every((d) => d.actorId === PLAYER_ACTOR_ID)).toBe(true);
  });

  it('est déterministe', () => {
    const again = advance(newGame(), [], [], RENDEZ_VOUS);
    expect(again.state).toEqual(first.state);
    expect(again.report).toEqual(first.report);
  });
});

describe('négociations de soutien', () => {
  const CLOSE = 'figure-bayrou';

  it('situe chaque personnalité : proximité, probabilités, motifs d’exclusion', () => {
    const state = newGame();
    const prospects = supportProspects(state, RULESET, PLAYER_ACTOR_ID);
    expect(prospects).toMatchObject({ annee: 2027, obtenus: 0, maximum: 6 });
    expect(prospects.personnalites).toHaveLength(RULESET.figures.figures.length);
    const proximities = prospects.personnalites.map((p) => p.proximite);
    expect(proximities).toEqual([...proximities].sort((a, b) => b - a));
    const bayrou = prospects.personnalites.find((p) => p.figureId === CLOSE)!;
    expect(bayrou.motif).toBeNull();
    expect(bayrou.probabilites!.ministere).toBeGreaterThan(bayrou.probabilites!.aucune);
    for (const p of prospects.personnalites)
      if (p.probabilites)
        for (const value of Object.values(p.probabilites)) {
          expect(value).toBeGreaterThanOrEqual(0.05);
          expect(value).toBeLessThanOrEqual(0.9);
        }
  });

  it('écarte, sans rien coûter, une personnalité trop éloignée ou dont le parti a un candidat', () => {
    const far = newGame({
      candidate: { ...TEST_CANDIDATE, positionnement: { economie: 100, societe: 100 } },
    });
    const lfi = assessSupport(far, RULESET, PLAYER_ACTOR_ID, figure('figure-boyard'));
    expect(lfi.probabilites).toBeNull();
    expect(lfi.motif).toMatch(/Trop éloignée de vos positions/);
    const result = advance(far, ['negocier-soutien@figure-boyard']);
    const outcome = result.report.actions.find((a) => a.actorId === PLAYER_ACTOR_ID)!;
    expect(outcome).toMatchObject({ status: 'rejetee', cost: { budgetCentimes: 0 } });
    expect(result.state.negociations).toHaveLength(0);
    // Adversaires réels : le Rassemblement national a sa candidate, ses figures refusent.
    const reels = newGame({ adversaires: 'reels' });
    const rn = RULESET.figures.figures.find((f) => f.parti === 'Rassemblement national')!;
    expect(assessSupport(reels, RULESET, PLAYER_ACTOR_ID, rn).motif).toMatch(
      /Un candidat de son parti \(Rassemblement national\) est en lice/,
    );
  });

  it('refuse deux rencontres avec la même personnalité la même semaine', () => {
    const result = advance(newGame(), [
      `negocier-soutien@${CLOSE}`,
      `negocier-soutien-ministere@${CLOSE}`,
    ]);
    const own = result.report.actions.filter((a) => a.actorId === PLAYER_ACTOR_ID);
    expect(own.map((a) => a.status)).toEqual(['validee', 'rejetee']);
    expect(own[1]!.reason).toMatch(/Une seule rencontre avec François Bayrou par semaine/);
  });

  it('simule l’issue, l’enregistre, ne prête aucun propos et pèse sur le vote', () => {
    let accepted: ReturnType<typeof advance> | null = null;
    for (let i = 0; i < 12 && !accepted; i++) {
      const result = advance(newGame({ seed: `soutien-${i}` }), [`negocier-soutien@${CLOSE}`]);
      if (result.state.negociations.some((n) => n.issue === 'soutien')) accepted = result;
    }
    expect(accepted).not.toBeNull();
    const { state, report } = accepted!;
    expect(state.negociations).toEqual([
      {
        figureId: CLOSE,
        actorId: PLAYER_ACTOR_ID,
        annee: 2027,
        semaine: 0,
        contrepartie: 'aucune',
        issue: 'soutien',
      },
    ]);
    const event = report.events.find((e) => e.refId === 'negociation-soutien')!;
    expect(event.label).toBe('François Bayrou soutient Camille Test (soutien simulé)');
    expect(event.nature).toBe('simule');
    expect(event.majeur).toBe(true);
    expect(event.description).toMatch(/Aucun propos n’est attribué à François Bayrou/);
    const level = figure(CLOSE).notoriete.niveau;
    expect(
      playerChange(report, 'notoriete')!.factors.find(
        (f) => f.label === 'Soutien de François Bayrou (simulé)',
      )!.value,
    ).toBe(RULESET.negociations.notoriete[level - 1]);
    // Facteur de vote : poids × notoriété × proximité du groupe à la personnalité.
    const group = RULESET.electorat.groupes[0]!;
    const [factor] = supportFactors(state, RULESET, group, PLAYER_ACTOR_ID);
    const closeness = Math.max(0, 1 - distance(group.position, figure(CLOSE).position));
    expect(factor).toEqual({
      label: 'Soutien de François Bayrou (simulé)',
      value: (RULESET.negociations.poids * level * closeness) / 3,
    });
    // Une personnalité ne soutient qu'un candidat.
    expect(supportOfFigure(state, CLOSE)?.actorId).toBe(PLAYER_ACTOR_ID);
    const rival = Object.keys(state.actors).find((id) => id !== PLAYER_ACTOR_ID)!;
    expect(assessSupport(state, RULESET, rival, figure(CLOSE)).motif).toMatch(
      /soutient déjà Camille Test/,
    );
    expect(negotiationError(state, RULESET, PLAYER_ACTOR_ID, CLOSE, [])).toMatch(
      /vous soutient déjà/,
    );
  });

  it('un refus est simulé et impose un délai avant de nouvelles négociations', () => {
    const reluctant = JSON.parse(JSON.stringify(QUIET)) as Ruleset;
    Object.assign(reluctant.negociations, {
      probabiliteBase: 0,
      poidsProximite: 0,
      poidsIntentions: 0,
      bonusMinistere: 0,
    });
    let refused: ReturnType<typeof advance> | null = null;
    for (let i = 0; i < 6 && !refused; i++) {
      const result = advance(
        newGame({ seed: `refus-${i}` }),
        [`negocier-soutien@${CLOSE}`],
        [],
        reluctant,
      );
      if (result.state.negociations.some((n) => n.issue === 'refus')) refused = result;
    }
    expect(refused).not.toBeNull();
    const event = refused!.report.events.find((e) => e.refId === 'negociation-soutien')!;
    expect(event.label).toBe(
      'François Bayrou décline la demande de soutien de Camille Test (refus simulé)',
    );
    expect(event.description).toMatch(/probabilité d’accord 5 %/);
    expect(negotiationError(refused!.state, reluctant, PLAYER_ACTOR_ID, CLOSE, [])).toMatch(
      /A décliné en semaine 0 : nouvelle rencontre possible à partir de la semaine 8/,
    );
  });

  it('limite le nombre de soutiens par campagne', () => {
    const state = newGame();
    const close = supportProspects(state, RULESET, PLAYER_ACTOR_ID).personnalites.slice(0, 7);
    for (const p of close.slice(0, 6))
      state.negociations.push({
        figureId: p.figureId,
        actorId: PLAYER_ACTOR_ID,
        annee: 2027,
        semaine: 0,
        contrepartie: 'aucune',
        issue: 'soutien',
      });
    expect(negotiationError(state, RULESET, PLAYER_ACTOR_ID, close[6]!.figureId, [])).toMatch(
      /Au plus 6 soutiens par campagne : 6 obtenu\(s\)/,
    );
  });

  it('les adversaires négocient aussi, selon les mêmes règles', () => {
    let state = newGame({ mode: 'observateur' });
    for (let i = 0; i < 10; i++) state = advance(state, [], defaults(state)).state;
    expect(state.negociations.length).toBeGreaterThan(0);
    const supported = state.negociations.filter((n) => n.issue === 'soutien');
    expect(new Set(supported.map((n) => n.figureId)).size).toBe(supported.length);
  });

  it('est déterministe', () => {
    const run = () => advance(newGame({ seed: 'neg' }), [`negocier-soutien-ministere@${CLOSE}`]);
    expect(run().state).toEqual(run().state);
  });
});

describe('ministère promis pendant la campagne', () => {
  /** Joueur déclaré élu à la semaine 0, avec le soutien d'une figure contre un ministère. */
  function promised(figureId: string): GameState {
    const state = newGame({}, QUIET);
    state.negociations.push({
      figureId,
      actorId: PLAYER_ACTOR_ID,
      annee: 2027,
      semaine: 0,
      contrepartie: 'ministere',
      issue: 'soutien',
    });
    for (const actor of Object.values(state.actors)) actor.status = 'battu';
    state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
    openQuinquennat(state, QUIET, PLAYER_ACTOR_ID);
    return state;
  }
  const PROFILE: MemberRef = { nature: 'profil', ref: QUIET.quinquennat.profils[0]!.id };
  // Personnalité éloignée du président : sans promesse, le Premier ministre ne la propose pas.
  const FAR = 'figure-boyard';

  it('place la personnalité promise en tête du premier gouvernement', () => {
    const plain = newGame({}, QUIET);
    for (const actor of Object.values(plain.actors)) actor.status = 'battu';
    plain.actors[PLAYER_ACTOR_ID]!.status = 'elu';
    openQuinquennat(plain, QUIET, PLAYER_ACTOR_ID);
    const without = composeMinisters(plain, QUIET, presidentOf(plain), PROFILE);
    expect(without.some((m) => m.ref === FAR)).toBe(false);
    const state = promised(FAR);
    const ministres = composeMinisters(state, QUIET, presidentOf(state), PROFILE);
    expect(ministres.filter((m) => m.ref === FAR)).toHaveLength(1);
    expect(ministres).toHaveLength(QUIET.quinquennat.postes.length);
  });

  it('une promesse non tenue au premier gouvernement coûte de la popularité', () => {
    const state = promised(FAR);
    const ledger = new Ledger(state);
    nominate(state, QUIET, PROFILE, { ledger, step: 5 });
    const government = state.quinquennat!.gouvernement!;
    // Le ministère promis est placé sur un poste régalien, sujet d'une décision du président.
    const posteId = QUIET.quinquennat.equipe.postesRegaliens[0]!;
    const ministres = government.ministres;
    const mine = ministres.findIndex((m) => m.ref === FAR);
    const regal = ministres.findIndex((m) => m.posteId === posteId);
    const farPoste = ministres[mine]!.posteId;
    ministres[mine] = { ...ministres[mine]!, posteId };
    ministres[regal] = { ...ministres[regal]!, posteId: farPoste };
    const decision = state.pendingDecisions.find(
      (d) => d.id === `g-${state.meta.week}-${posteId}`,
    )!;
    const replacement = QUIET.quinquennat.profils.find(
      (p) => !government.ministres.some((m) => m.ref === p.id) && p.id !== PROFILE.ref,
    )!;
    const after = new Ledger(state);
    answerMinister(state, QUIET, decision, replacement.id, { ledger: after, step: 5 });
    const factor = after
      .list()
      .find((c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite')!
      .factors.find((f) => f.label.startsWith('Promesse de ministère non tenue'))!;
    expect(factor).toMatchObject({
      label: `Promesse de ministère non tenue : ${figure(FAR).prenom} ${figure(FAR).nom} (hypothèse de jeu)`,
      value: -QUIET.negociations.promesseNonTenue,
      source: 'decision',
    });
  });

  it('se joue à travers advanceWeek sans erreur (semaine de campagne avec négociation promise)', () => {
    const state = newGame();
    const result = advanceWeek(
      state,
      {
        actions: [{ actionId: 'negocier-soutien-ministere', cible: 'figure-bayrou' }],
        decisions: [],
      },
      { ruleset: QUIET },
    );
    expect(result.state.negociations[0]).toMatchObject({ contrepartie: 'ministere' });
  });
});
