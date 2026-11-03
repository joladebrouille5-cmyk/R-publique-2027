import { GameStateSchema, type Difficulty } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from './advanceWeek';
import { createGame, PLAYER_ACTOR_ID } from './createGame';
import { playToEnd, RULESET as ruleset, sponsorship } from './testing';

// Personnalités politiques réelles (phase 5 bis) : fiches sourcées du jeu de règles, moyens de
// départ selon des niveaux documentés, comportement simulé, aucun programme prêté par le jeu.

const fiches = ruleset.personnalites.personnalites;
const fiche = (id: string) => fiches.find((p) => p.id === id)!;
const params = ruleset.personnalitesReelles;

describe('personnalités réelles', () => {
  it('le joueur incarne une personnalité, face aux adversaires fictifs', () => {
    const state = createGame(
      {
        seed: 'reel-1',
        mode: 'candidat_reel',
        difficulty: 'standard',
        personnaliteId: 'reel-tondelier',
      },
      ruleset,
    );
    expect(GameStateSchema.parse(state)).toEqual(state);
    const player = state.actors[PLAYER_ACTOR_ID]!;
    const f = fiche('reel-tondelier');
    expect(player.candidate).toEqual({
      prenom: f.prenom,
      nom: f.nom,
      parti: f.parti,
      positionnement: { economie: f.position.economie, societe: f.position.societe },
      parcours: '',
      nature: 'reel',
      profilId: null,
      personnaliteId: 'reel-tondelier',
      photo: null,
    });
    expect(player.programme.propositions).toEqual([]);
    expect(player.implantation).toEqual(f.implantation.regions);
    expect(player.resources.notoriete).toBe(params.notoriete[f.moyens.notoriete - 1]);
    expect(state.player).toEqual({
      mode: 'candidat_reel',
      actorId: PLAYER_ACTOR_ID,
      adversaires: 'fictifs',
      orientation: null,
      format: 'complet',
    });
    expect(
      Object.keys(state.actors)
        .filter((id) => id !== PLAYER_ACTOR_ID)
        .sort(),
    ).toEqual(ruleset.candidatsFictifs.map((c) => c.id).sort());
  });

  it('adversaires réels : toutes les candidatures retenues, sauf la personnalité incarnée ; aucune inventée', () => {
    const real = createGame(
      {
        seed: 'reel-2',
        mode: 'candidat_reel',
        difficulty: 'standard',
        personnaliteId: 'reel-philippe',
        adversaires: 'reels',
      },
      ruleset,
    );
    const opponents = Object.values(real.actors).filter((a) => a.kind === 'adversaire');
    expect(opponents.map((a) => a.id).sort()).toEqual(
      fiches.map((p) => p.id).filter((id) => id !== 'reel-philippe'),
    );
    for (const a of opponents) {
      const f = fiche(a.id);
      expect(a.candidate).toMatchObject({ nature: 'reel', personnaliteId: f.id, nom: f.nom });
      expect(a.candidate.positionnement).toEqual({
        economie: f.position.economie,
        societe: f.position.societe,
      });
      expect(a.programme.propositions).toEqual([]);
      expect(a).toMatchObject({
        style: params.style,
        toleranceRisque: params.toleranceRisque,
        objectif: params.objectif,
        equipe: params.organisation[f.moyens.organisation].equipe,
      });
    }
    const custom = createGame(
      {
        seed: 'reel-3',
        mode: 'candidat_personnalise',
        difficulty: 'standard',
        candidate: { nom: 'Martin', parti: 'Parti', positionnement: { economie: 0, societe: 0 } },
        adversaires: 'reels',
      },
      ruleset,
    );
    expect(Object.keys(custom.actors).length).toBe(fiches.length + 1);
    const observer = createGame(
      { seed: 'reel-4', mode: 'observateur', difficulty: 'standard', adversaires: 'reels' },
      ruleset,
    );
    expect(Object.keys(observer.actors).sort()).toEqual(fiches.map((p) => p.id));
  });

  it('moyens de départ : niveaux de la fiche ; la difficulté ne joue que sur les budgets et la pression du joueur', () => {
    const make = (difficulty: Difficulty) =>
      createGame(
        {
          seed: 'reel-5',
          mode: 'candidat_reel',
          difficulty,
          personnaliteId: 'reel-roussel',
          adversaires: 'reels',
        },
        ruleset,
      );
    const [easy, normal, hard] = [make('accessible'), make('standard'), make('expert')];
    const means = params.organisation[fiche('reel-le-pen').moyens.organisation];
    expect(normal.actors['reel-le-pen']!.resources.budgetCentimes).toBe(means.budgetCentimes);
    expect(hard.actors['reel-le-pen']!.resources.budgetCentimes).toBe(
      Math.round(means.budgetCentimes * ruleset.ia.expert.multiplicateurBudget),
    );
    // Notoriété des adversaires : celle de la fiche aux trois niveaux historiques, divisée par
    // deux en Découverte, majorée en Légende ; popularité identique à tous les niveaux.
    const [discovery, legend] = [make('decouverte'), make('legende')];
    for (const s of [easy, hard])
      expect(s.actors['reel-le-pen']!.resources.notoriete).toBe(
        normal.actors['reel-le-pen']!.resources.notoriete,
      );
    const notoriety = normal.actors['reel-le-pen']!.resources.notoriete;
    expect(discovery.actors['reel-le-pen']!.resources.notoriete).toBe(Math.round(notoriety * 0.5));
    expect(legend.actors['reel-le-pen']!.resources.notoriete).toBe(Math.round(notoriety * 1.15));
    for (const s of [discovery, easy, hard, legend])
      expect(s.actors['reel-zemmour']!.resources.popularite).toBe(params.popularite);
    // La personnalité incarnée garde sa notoriété réelle quel que soit le niveau.
    expect(discovery.actors[PLAYER_ACTOR_ID]!.resources.notoriete).toBe(
      legend.actors[PLAYER_ACTOR_ID]!.resources.notoriete,
    );
    const player = (s: typeof normal) => s.actors[PLAYER_ACTOR_ID]!.resources.budgetCentimes;
    expect(player(easy)).toBeGreaterThan(player(normal));
    expect(player(hard)).toBeLessThan(player(normal));
    // Promesses de parrainage de départ selon l'organisation, dans la limite des élus encore
    // libres (plusieurs personnalités partagent la même région d'ancrage).
    const promised = (s: typeof normal, id: string) =>
      Object.values(s.actors[id]!.parrainages.promesses).reduce((a, b) => a + b, 0);
    expect(promised(normal, 'reel-le-pen')).toBeLessThanOrEqual(means.promessesInitiales);
    expect(promised(normal, 'reel-le-pen')).toBeGreaterThan(means.promessesInitiales * 0.9);
    expect(promised(normal, 'reel-le-pen')).toBeGreaterThan(promised(normal, 'reel-zemmour'));
  });

  it('aucun programme prêté par le jeu : facteurs « Programme » et « Crédibilité » neutres pour l’IA réelle', () => {
    let state = createGame(
      { seed: 'reel-6', mode: 'observateur', difficulty: 'standard', adversaires: 'reels' },
      ruleset,
    );
    state = advanceWeek(state, { actions: [], decisions: [] }, { ruleset }).state;
    for (const id of fiches.map((p) => p.id)) {
      const factors = state.opinion!.breakdown[id]!;
      expect(factors.find((f) => f.label === 'Programme')!.value).toBe(0);
      expect(factors.find((f) => f.label === 'Crédibilité')!.value).toBe(0);
    }
  });

  it('une partie avec les adversaires réels se joue jusqu’au bout, de façon déterministe', () => {
    const start = () =>
      createGame(
        {
          seed: 'reel-7',
          mode: 'candidat_reel',
          difficulty: 'standard',
          personnaliteId: 'reel-ruffin',
          adversaires: 'reels',
        },
        ruleset,
      );
    const a = playToEnd(start(), ruleset, (s) => sponsorship(s));
    const b = playToEnd(start(), ruleset, (s) => sponsorship(s));
    expect(a.state).toEqual(b.state);
    const t1 = a.state.elections.t1!;
    for (const id of Object.keys(t1.voix)) {
      expect(['candidat', 'qualifie', 'elimine', 'elu', 'battu']).toContain(
        a.state.actors[id]!.status,
      );
    }
    // Les candidats sans parrainages suffisants ou ralliés ne sont pas au premier tour.
    for (const actor of Object.values(a.state.actors)) {
      if (actor.status === 'ecarte' || actor.status === 'retire') {
        expect(t1.voix[actor.id]).toBeUndefined();
      }
    }
    expect(Object.values(a.state.actors).filter((x) => x.status === 'elu')).toHaveLength(1);
  }, 120_000);
});
