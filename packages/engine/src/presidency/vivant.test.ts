import { WeeklyReportSchema, type GameState, type Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { unlockAchievements } from '../core/succes';
import {
  advance,
  newGame,
  playerChange,
  playToEnd,
  QUIET,
  sponsorship,
  withEvents,
} from '../core/testing';
import { planPresidentActions, validatePresidencyActions } from './actions';
import { loyaltyReference, syncTracks } from './conseil';
import { reviewQuinquennat } from './cycle';
import { openQuinquennat } from './government';
import { memberInCharge, memberName, memberTraits, postCompetenceOf } from './members';
import { gradeMandate } from './objectifs';
import { QAG_EVENT, qagBanks } from './qag';

// Phase 15 (P15-03) : ministres vivants et départs simulés, remaniement ciblé, urgences
// ministérielles, Conseil des ministres, questions au gouvernement, objectifs et note du mandat,
// succès, trace des déplacements ; président IA.

const RULES = QUIET;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sum = (factors: readonly { value: number }[]) => factors.reduce((s, f) => s + f.value, 0);
const URGENCY = 'urgence-cyberattaque';
const SITTING = withEvents({ [QAG_EVENT]: 1 });
const URGENT = withEvents({ [URGENCY]: 1 });
const ALL_URGENCIES = withEvents(Object.fromEntries(RULES.urgences.liste.map((u) => [u.id, 1])));

/** Présidentielle jouée jusqu'à l'élection : le vainqueur (IA ici) ouvre le quinquennat. */
const elected = playToEnd(newGame({ seed: 'quinquennat' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;

/** Même partie où le joueur est déclaré élu (ouverture du quinquennat du moteur). */
function playerElected(): GameState {
  const state = clone(elected);
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
}

/** Semaine jouée : actions du joueur, décisions par défaut sauf réponses données. */
function step(
  state: GameState,
  actions: string[] = [],
  ruleset: Ruleset = RULES,
  answers: Record<string, string> = {},
) {
  return advance(
    state,
    actions,
    state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: answers[d.kind] ?? d.defaultOptionId,
    })),
    ruleset,
  );
}

/** Joue jusqu'à un gouvernement en place, sans décision de nomination en attente. */
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

const governed = govern(playerElected());
const aiGoverned = govern(elected);

describe('Conseil des ministres et ministres vivants', () => {
  it('tient chaque semaine le Conseil : popularité prêtée et loyauté avec leurs facteurs exacts', () => {
    const { state, report } = step(governed);
    expect(() => WeeklyReportSchema.parse(report)).not.toThrow();
    const conseil = report.conseil!;
    const government = state.quinquennat!.gouvernement!;
    expect(conseil.ministres.map((m) => m.ref)).toEqual(
      [government.premierMinistre, ...government.ministres].map((m) => m.ref),
    );
    expect(conseil.ministres[0]!.posteId).toBeNull();
    for (const m of conseil.ministres) {
      expect(m.popularite.avant + sum(m.popularite.facteurs)).toBe(m.popularite.apres);
      expect(m.loyaute.avant + sum(m.loyaute.facteurs)).toBe(m.loyaute.apres);
      expect(m.loyaute.apres).toBeGreaterThanOrEqual(0);
      expect(m.loyaute.apres).toBeLessThanOrEqual(100);
      expect(m.popularite.apres).toBeGreaterThanOrEqual(0);
      expect(m.popularite.apres).toBeLessThanOrEqual(10_000);
      expect(state.quinquennat!.suivi[m.ref]).toMatchObject({
        popularite: m.popularite.apres,
        loyaute: m.loyaute.apres,
      });
      expect(m.popularite.facteurs).toContainEqual({
        label: 'Usure au poste (hypothèse de jeu)',
        value: -RULES.quinquennat.suivi.popularite.usureHebdomadaire,
      });
    }
  });

  it('donne à chaque nouveau membre sa popularité prêtée et sa loyauté de départ', () => {
    const state = clone(governed);
    state.quinquennat!.suivi = {};
    syncTracks(state, RULES);
    const government = state.quinquennat!.gouvernement!;
    const pm = government.premierMinistre;
    expect(state.quinquennat!.suivi[pm.ref]).toEqual({
      popularite: memberTraits(state, RULES, pm).popularite,
      loyaute: loyaltyReference(state, RULES, pm, true),
      depuis: state.meta.week,
    });
    const asMinister = loyaltyReference(state, RULES, pm, false);
    expect(loyaltyReference(state, RULES, pm, true)).toBe(
      Math.min(100, asMinister + RULES.quinquennat.suivi.loyaute.premierMinistre),
    );
    expect(Object.keys(state.quinquennat!.suivi)).toHaveLength(1 + government.ministres.length);
  });

  /** Jeu de règles où tout ministre sous un seuil part la semaine même. */
  const QUITTING = clone(RULES);
  QUITTING.quinquennat.suivi.depart.probabilite = 1;

  /** Ministres sûrs (loyaux, populaires), sauf ceux des postes donnés, fragiles et anciens. */
  function fragile(postes: string[], depuis = governed.meta.week - 20): GameState {
    const state = clone(governed);
    const quinquennat = state.quinquennat!;
    const government = quinquennat.gouvernement!;
    for (const m of [
      { ref: government.premierMinistre.ref, posteId: null },
      ...government.ministres,
    ]) {
      const weak = m.posteId !== null && postes.includes(m.posteId);
      quinquennat.suivi[m.ref] = weak
        ? { popularite: 5_000, loyaute: 0, depuis }
        : { popularite: 10_000, loyaute: 100, depuis: governed.meta.week - 20 };
    }
    return state;
  }

  it('sous un seuil, un ministre peut partir : départ simulé, remplaçant du Premier ministre', () => {
    const state = fragile(['agriculture']);
    const leaving = state.quinquennat!.gouvernement!.ministres.find(
      (m) => m.posteId === 'agriculture',
    )!;
    const { state: next, report } = step(state, [], QUITTING);
    expect(report.conseil!.departs).toEqual([
      {
        nature: leaving.nature,
        ref: leaving.ref,
        posteId: 'agriculture',
        motif: expect.stringMatching(
          /^loyauté envers le président au plus bas, \d+\/100 \(départ simulé\)$/,
        ),
      },
    ]);
    const successor = next.quinquennat!.gouvernement!.ministres.find(
      (m) => m.posteId === 'agriculture',
    )!;
    expect(successor.ref).not.toBe(leaving.ref);
    expect(next.quinquennat!.suivi[leaving.ref]).toBeUndefined();
    expect(next.quinquennat!.suivi[successor.ref]).toBeDefined();
    expect(next.quinquennat!.refus.some((r) => r.acteurId === leaving.ref)).toBe(true);
    expect(next.pendingDecisions.find((d) => d.posteId === 'agriculture')).toMatchObject({
      kind: 'gouvernement',
      defaultOptionId: successor.ref,
      description: expect.stringMatching(/a quitté le ministère « Agriculture »/),
    });
    expect(
      playerChange(report, 'popularite')!.factors.find((f) => f.label.startsWith('Départ de')),
    ).toMatchObject({
      value: -QUITTING.quinquennat.suivi.depart.effetPresident,
      source: 'evenement',
    });
    const event = report.events.find((e) => e.label.endsWith('(départ simulé)'))!;
    expect(event).toMatchObject({ nature: 'simule', refId: 'gouvernement' });
    expect(event.description).toMatch(/Aucun propos n’est attribué/);
  });

  it('aucun départ au-dessus des seuils ni avant le temps minimal ; au plus un par semaine', () => {
    expect(step(fragile([]), [], QUITTING).report.conseil!.departs).toEqual([]);
    expect(
      step(fragile(['agriculture'], governed.meta.week), [], QUITTING).report.conseil!.departs,
    ).toEqual([]);
    expect(
      step(fragile(['agriculture', 'justice', 'sante']), [], QUITTING).report.conseil!.departs,
    ).toHaveLength(1);
  });

  it('est déterministe (Conseil, urgences, questions au gouvernement)', () => {
    const rules = withEvents({
      [QAG_EVENT]: 1,
      ...Object.fromEntries(RULES.urgences.liste.map((u) => [u.id, 1])),
    });
    const a = step(governed, [], rules);
    const b = step(governed, [], rules);
    expect(a.state).toEqual(b.state);
    expect(a.report).toEqual(b.report);
  });
});

describe('remaniement ciblé', () => {
  it('le ministre quitte son poste, le Premier ministre propose un remplaçant, délai ensuite', () => {
    const before = governed.quinquennat!.gouvernement!.ministres.find(
      (m) => m.posteId === 'interieur',
    )!;
    const first = step(governed, ['remaniement-cible@interieur']);
    expect(first.report.actions[0]).toMatchObject({ status: 'validee', cible: 'Intérieur' });
    const after = first.state.quinquennat!.gouvernement!.ministres.find(
      (m) => m.posteId === 'interieur',
    )!;
    expect(after.ref).not.toBe(before.ref);
    expect(first.report.conseil!.departs[0]).toEqual({
      nature: before.nature,
      ref: before.ref,
      posteId: 'interieur',
      motif: 'remplacé(e) par le président (remaniement ciblé)',
    });
    expect(
      first.report.events.find((e) => e.label.startsWith('Remaniement ciblé :')),
    ).toMatchObject({ nature: 'simule' });
    expect(first.state.pendingDecisions.some((d) => d.posteId === 'interieur')).toBe(true);
    const second = step(first.state, ['remaniement-cible@justice']);
    expect(second.report.actions[0]).toMatchObject({
      status: 'rejetee',
      reason: expect.stringMatching(/^Encore 3 semaine\(s\)/),
    });
  });

  it('refuse un remaniement ciblé sans ministère, inconnu, ou la semaine d’un remaniement', () => {
    const reasons = (planned: { actionId: string; cible?: string }[]) =>
      validatePresidencyActions(governed, RULES, PLAYER_ACTOR_ID, planned).outcomes.map(
        (o) => o.reason,
      );
    expect(reasons([{ actionId: 'remaniement-cible' }])).toEqual([
      'Choisissez le ministère concerné.',
    ]);
    expect(reasons([{ actionId: 'remaniement-cible', cible: 'inconnu' }])).toEqual([
      'Cible inconnue : inconnu.',
    ]);
    expect(
      reasons([{ actionId: 'remaniement' }, { actionId: 'remaniement-cible', cible: 'interieur' }]),
    ).toEqual([null, 'Le remaniement général de la semaine remplace déjà tout le gouvernement.']);
  });
});

describe('urgences ministérielles', () => {
  const urgency = RULES.urgences.liste.find((u) => u.id === URGENCY)!;

  it('présente une urgence avec le ministre en charge et deux choix', () => {
    const first = step(governed, [], URGENT);
    const decision = first.state.pendingDecisions.find((d) => d.kind === 'urgence')!;
    expect(decision).toMatchObject({
      eventId: URGENCY,
      posteId: 'interieur',
      defaultOptionId: urgency.choixParDefaut,
    });
    expect(decision.options.map((o) => o.id)).toEqual(urgency.choix.map((c) => c.id));
    const member = memberInCharge(first.state, 'interieur')!;
    expect(decision.description).toContain(memberName(first.state, RULES, member));
    expect(decision.description).toMatch(/aucun propos ne lui est attribué/);
    // Effets en clair, à la française : aucun identifiant d'indicateur, virgule décimale.
    for (const option of decision.options) {
      expect(option.description).toMatch(
        /Effets \(hypothèses du jeu\) : popularité du président [+−]\d+(,\d+)? pt/,
      );
      expect(option.description).not.toMatch(
        /\b(deficit|chomage|pouvoirAchat|tensions -)\b|\d\.\d/,
      );
    }
    expect(first.report.events.find((e) => e.refId === URGENCY)).toMatchObject({
      nature: 'fictif',
      decisionId: decision.id,
    });
  });

  it('applique le choix par les registres : président, économie, ministre en charge', () => {
    const first = step(governed, [], URGENT);
    const choice = urgency.choix[1]!;
    const second = step(first.state, [], URGENT, { urgence: choice.id });
    const member = memberInCharge(first.state, 'interieur')!;
    const competence = postCompetenceOf(first.state, RULES, member, 'interieur');
    const label = `${urgency.libelle} — ${choice.libelle}`;
    const factor = playerChange(second.report, 'popularite')!.factors.find((f) =>
      f.label.startsWith(label),
    )!;
    // Phase 25 ter : la part différée attend le suivi de la décision.
    const total = Math.round(choice.popularite * (0.5 + competence));
    expect(factor).toMatchObject({
      value: total - Math.round(total * RULES.urgences.suivi.partDifferee),
      source: 'decision',
    });
    for (const e of choice.economie)
      expect(
        second.report.economie
          .find((c) => c.indicateur === e.indicateur)!
          .factors.some((f) => f.label === label && f.value === e.valeur),
      ).toBe(true);
    const minister = second.report.conseil!.ministres.find((m) => m.ref === member.ref)!;
    expect(minister.faits).toContain(`Urgence « ${urgency.libelle} » : ${choice.libelle}`);
    expect(minister.popularite.facteurs).toContainEqual({
      label: `Urgence « ${urgency.libelle} » : ${choice.libelle}`,
      value: choice.ministre.popularite,
    });
  });

  it('au plus une urgence par semaine, aucune tant qu’une urgence attend', () => {
    const first = step(governed, [], ALL_URGENCIES);
    expect(first.state.pendingDecisions.filter((d) => d.kind === 'urgence')).toHaveLength(1);
    expect(first.report.events.filter((e) => e.refId.startsWith('urgence-'))).toHaveLength(1);
    const pending = clone(first.state);
    // Sans réponse possible cette semaine (décision en attente) : aucune nouvelle urgence tirée.
    expect(
      step(pending, [], ALL_URGENCIES).state.pendingDecisions.filter((d) => d.kind === 'urgence')
        .length,
    ).toBeLessThanOrEqual(1);
    // Délai entre deux occurrences d'une même urgence.
    let state = step(governed, [], URGENT).state;
    for (let i = 0; i < 6; i++) {
      const result = step(state, [], URGENT);
      expect(result.report.events.some((e) => e.refId === URGENCY)).toBe(false);
      state = result.state;
    }
  });
});

describe('questions au gouvernement', () => {
  it('un groupe d’opposition interpelle le gouvernement chaque semaine de séance', () => {
    const first = step(governed, [], SITTING);
    const decision = first.state.pendingDecisions.find((d) => d.kind === 'qag')!;
    // Phase 25 ter : les répliques viennent d'une banque tirée selon le contexte.
    const bank = qagBanks(RULES).find((b) =>
      b.reponses.some((r) => r.id === decision.options[0]!.id),
    )!;
    expect(decision).toMatchObject({ eventId: QAG_EVENT, defaultOptionId: bank.reponseParDefaut });
    expect(decision.options.map((o) => o.id)).toEqual(bank.reponses.map((r) => r.id));
    expect(first.state.parlement!.groupes[decision.groupeId!]!.alignement).toBe('opposition');
    expect(RULES.parlement.qag.themes.some((t) => t.id === decision.themeId)).toBe(true);
    expect(decision.contexte).toMatch(/aucun député nommé/);
    // Titre court (sigle du groupe), nom complet dans la description ; effets en clair.
    const group = RULES.assemblee.groupes.find((g) => g.id === decision.groupeId)!;
    expect(decision.label).toMatch(
      new RegExp(`^Questions au gouvernement : le groupe ${group.sigle} interpelle sur `),
    );
    expect(decision.contexte).toContain(`groupe ${group.libelle} (${group.sigle})`);
    for (const reply of bank.reponses.filter((r) => r.tension !== 0))
      expect(decision.options.find((o) => o.id === reply.id)!.description).toContain(
        `tension de l’hémicycle ${reply.tension > 0 ? '+' : '−'}${Math.abs(reply.tension)} (${reply.tension > 0 ? 'échauffement' : 'apaisement'})`,
      );
    expect(first.report.events.find((e) => e.refId === QAG_EVENT)).toMatchObject({
      nature: 'simule',
      decisionId: decision.id,
    });
  });

  it('contre-attaquer échauffe l’hémicycle, répondre sur le fond l’apaise ; mémoire bornée', () => {
    const first = step(governed, [], SITTING);
    first.state.parlement!.qag = Array.from({ length: 12 }, (_, i) => ({
      semaine: i,
      groupeId: 'rn',
      themeId: 'emploi',
      reponseId: 'fond',
      tension: -2,
      popularite: 0,
    }));
    const question = first.state.pendingDecisions.find((d) => d.kind === 'qag')!;
    const { decroissanceEchauffement, reponses } = RULES.parlement.qag;
    // Séance aux répliques classiques (la banque est tirée selon le contexte, phase 25 ter).
    question.options = reponses.map((r) => ({ id: r.id, libelle: r.libelle, description: '' }));
    question.defaultOptionId = 'fond';
    const hot = step(first.state, [], SITTING, { qag: 'contre-attaque' });
    const reply = reponses.find((r) => r.id === 'contre-attaque')!;
    expect(hot.state.parlement!.echauffement).toBe(
      Math.floor(
        (first.state.parlement!.echauffement + reply.tension) * (1 - decroissanceEchauffement),
      ),
    );
    expect(
      hot.state.parlement!.tension.facteurs.some(
        (f) => f.libelle === 'Échauffement de l’hémicycle (questions au gouvernement)',
      ),
    ).toBe(true);
    expect(hot.state.parlement!.qag).toHaveLength(12);
    expect(hot.state.parlement!.qag.at(-1)).toMatchObject({
      semaine: question.createdWeek,
      groupeId: question.groupeId,
      themeId: question.themeId,
      reponseId: 'contre-attaque',
      tension: reply.tension,
    });
    const theme = RULES.parlement.qag.themes.find((t) => t.id === question.themeId)!;
    const member = memberInCharge(first.state, theme.poste)!;
    const competence = postCompetenceOf(first.state, RULES, member, theme.poste);
    expect(
      playerChange(hot.report, 'popularite')!.factors.find((f) =>
        f.label.startsWith(`Questions au gouvernement (${theme.libelle}) : ${reply.libelle}`),
      )!.value,
    ).toBe(Math.round(reply.popularite * (1 + reply.modulation * (competence - 0.5))));
    const calm = step(first.state, [], SITTING, { qag: 'fond' });
    expect(calm.state.parlement!.echauffement).toBeLessThan(hot.state.parlement!.echauffement);
  });

  it('facultatives : sans réponse, le gouvernement répond sur le fond (option par défaut)', () => {
    const first = step(governed, [], SITTING);
    const question = first.state.pendingDecisions.find((d) => d.kind === 'qag')!;
    const others = first.state.pendingDecisions.filter((d) => d.kind !== 'qag');
    const result = advance(
      first.state,
      [],
      others.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId })),
      SITTING,
    );
    expect(result.report.decisions.find((d) => d.decisionId === question.id)).toMatchObject({
      optionId: question.defaultOptionId,
      automatic: true,
    });
    expect(result.state.parlement!.qag.at(-1)).toMatchObject({
      reponseId: question.defaultOptionId,
    });
  });

  it('aucune séance pendant l’intersession', () => {
    const state = clone(governed);
    state.meta.date = '2027-08-02';
    expect(step(state, [], SITTING).state.pendingDecisions.some((d) => d.kind === 'qag')).toBe(
      false,
    );
  });
});

describe('objectifs et note du mandat', () => {
  it('fixe les objectifs au premier gouvernement, d’après le programme du président', () => {
    const objectives = governed.quinquennat!.objectifs;
    expect(objectives).toHaveLength(RULES.objectifs.nombre);
    expect(new Set(objectives.map((o) => o.id)).size).toBe(objectives.length);
    for (const o of objectives) {
      const definition = RULES.objectifs.catalogue.find((c) => c.id === o.id)!;
      expect(o.cible).toBe(
        definition.ecart !== undefined ? o.depart + definition.ecart : definition.valeur,
      );
    }
  });

  it('note sur 20 : 1 par objectif atteint, la moitié du chemin parcouru sinon ; au bilan', () => {
    const state = clone(governed);
    const quinquennat = state.quinquennat!;
    quinquennat.objectifs = [
      { id: 'chomage', depart: 700, cible: 600 },
      { id: 'reformes', depart: 0, cible: 3 },
      { id: 'popularite', depart: 4_000, cible: 3_500 },
      { id: 'sans-censure', depart: 0, cible: 0 },
    ];
    state.economie!.indicateurs.chomage = 650;
    state.actors[PLAYER_ACTOR_ID]!.resources.popularite = 3_000;
    state.parlement!.reformes = ['a', 'b', 'c'].map((id) => ({
      propositionId: id,
      texteId: `texte-${id}`,
      adopteeSemaine: quinquennat.depart.semaine,
      vigueurSemaine: quinquennat.depart.semaine + 10,
      concessions: 0,
      appliquee: false,
    }));
    // 0,5 × 0,5 (chômage à mi-chemin) + 1 (réformes) + 0 (plancher franchi) + 1 (aucune censure).
    const grade = gradeMandate(state, RULES)!;
    expect(grade).toMatchObject({ valeur: 11, mention: 'Mandat contrasté' });
    expect(grade.objectifs.map((o) => [o.id, o.fin, o.atteint])).toEqual([
      ['chomage', 650, false],
      ['reformes', 3, true],
      ['popularite', 3_000, false],
      ['sans-censure', 0, true],
    ]);
    expect(reviewQuinquennat(state, RULES).note).toEqual(grade);
  });
});

describe('succès et déplacements', () => {
  it('débloque un succès une seule fois, la semaine où sa condition est remplie', () => {
    const { state, report } = step(playerElected());
    expect(report.succes).toContain('elysee');
    expect(state.succes.filter((s) => s.id === 'elysee')).toEqual([
      { id: 'elysee', semaine: report.week },
    ]);
    const again = step(state);
    expect(again.report.succes).not.toContain('elysee');
    expect(again.state.succes.filter((s) => s.id === 'elysee')).toHaveLength(1);
    expect(unlockAchievements(newGame({ mode: 'observateur' }), RULES, 0)).toEqual([]);
  });

  it('trace les déplacements du président et récompense un tour de France', () => {
    const result = step(governed, ['deplacement-presidentiel@2A']);
    expect(result.state.quinquennat!.deplacements['2A']).toBe(
      (governed.quinquennat!.deplacements['2A'] ?? 0) + 1,
    );
    // Phase 25 : le déplacement fait gagner 8 d'implantation au président dans le département.
    const before = governed.implantation[PLAYER_ACTOR_ID]!['2A']!;
    expect(
      result.report.implantation.find(
        (c) => c.actorId === PLAYER_ACTOR_ID && c.departement === '2A',
      ),
    ).toEqual({
      actorId: PLAYER_ACTOR_ID,
      departement: '2A',
      before,
      after: Math.min(100, before + 8),
      factors: [
        { label: 'Déplacement de terrain en région', value: 8 },
        ...(before + 8 > 100 ? [{ label: 'Plafond', value: 100 - before - 8 }] : []),
      ],
    });
    const state = clone(governed);
    for (const dep of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '2B'])
      state.quinquennat!.deplacements[dep] = 1;
    expect(unlockAchievements(state, RULES, state.meta.week)).toContain('tour-de-france');
  });
});

describe('président IA', () => {
  it('tranche lui-même urgences et questions au gouvernement (choix par défaut)', () => {
    const rules = withEvents({ [QAG_EVENT]: 1, [URGENCY]: 1 });
    const result = step(aiGoverned, [], rules);
    expect(
      result.state.pendingDecisions.some((d) => d.kind === 'qag' || d.kind === 'urgence'),
    ).toBe(false);
    // Réplique par défaut de la banque tirée (phase 25 ter).
    const last = result.state.parlement!.qag.at(-1)!;
    const bank = qagBanks(RULES).find((b) => b.reponses.some((r) => r.id === last.reponseId))!;
    expect(last.reponseId).toBe(bank.reponseParDefaut);
    expect(result.report.events.find((e) => e.refId === URGENCY)!.description).toMatch(
      /Arbitrage du président \(IA\)/,
    );
    expect(result.report.conseil).not.toBeNull();
  });

  it('remplace un ministre usé par un remaniement ciblé', () => {
    const state = clone(aiGoverned);
    const target = state.quinquennat!.gouvernement!.ministres[3]!;
    state.quinquennat!.suivi[target.ref] = {
      popularite: 1_000,
      loyaute: 50,
      depuis: state.meta.week - 20,
    };
    expect(planPresidentActions(state, RULES, (codes) => codes[0]!)).toContainEqual({
      actionId: 'remaniement-cible',
      cible: target.posteId,
    });
  });
});
