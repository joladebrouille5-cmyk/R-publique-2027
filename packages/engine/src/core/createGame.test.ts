import { DEFAULT_START_DATE, GameStateSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { createGame, GameCreationError, PLAYER_ACTOR_ID } from './createGame';
import { RULESET as ruleset } from './testing';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './versions';

const candidate = {
  nom: 'Martin',
  prenom: 'Lou',
  parti: 'Parti Test',
  positionnement: { economie: 10, societe: -20 },
};
const base = {
  seed: 'graine-1',
  mode: 'candidat_personnalise',
  difficulty: 'standard',
  candidate,
} as const;

describe('createGame', () => {
  it('crée un état initial valide avec le candidat du joueur', () => {
    const state = createGame(base, ruleset);
    expect(GameStateSchema.parse(state)).toEqual(state);
    expect(state.meta).toMatchObject({
      week: 0,
      date: DEFAULT_START_DATE,
      phase: 'campagne',
      engineVersion: ENGINE_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    });
    expect(state.player).toEqual({
      mode: 'candidat_personnalise',
      actorId: PLAYER_ACTOR_ID,
      adversaires: 'fictifs',
      orientation: null,
      format: 'complet',
    });
    expect(state.actors[PLAYER_ACTOR_ID]).toMatchObject({
      kind: 'joueur',
      status: 'candidat',
      label: 'Campagne de Lou Martin',
      candidate: {
        nom: 'Martin',
        prenom: 'Lou',
        parti: 'Parti Test',
        nature: 'personnalise',
        profilId: null,
      },
    });
    expect(state.elections).toEqual({
      t1: null,
      t2: null,
      consignes: [],
      debate: null,
      debateDetail: null,
    });
  });

  it('ajoute les adversaires fictifs, aux moyens dépendant de la difficulté', () => {
    const state = createGame(base, ruleset);
    const opponents = Object.values(state.actors).filter((a) => a.kind === 'adversaire');
    expect(opponents).toHaveLength(ruleset.candidatsFictifs.length);
    for (const opponent of opponents) expect(opponent.candidate.nature).toBe('fictif');
    const budget = (difficulty: 'accessible' | 'expert') =>
      createGame({ ...base, difficulty }, ruleset).actors['adv-boussole']!.resources.budgetCentimes;
    expect(budget('expert')).toBeGreaterThan(budget('accessible'));
  });

  it('attribue les ressources de départ selon la difficulté et le profil', () => {
    const resources = createGame(base, ruleset).actors[PLAYER_ACTOR_ID]!.resources;
    expect(resources).toEqual({
      ...ruleset.jeu.ressourcesInitiales.standard,
      tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
      // Jauges des réseaux : mêmes valeurs de départ pour tous les candidats (phase 9).
      ...ruleset.numerique.initial,
    });
    for (const actor of Object.values(createGame(base, ruleset).actors))
      expect(actor.resources).toMatchObject(ruleset.numerique.initial);
    const civil = createGame(
      { ...base, candidate: { ...candidate, profilId: 'societe-civile' } },
      ruleset,
    ).actors[PLAYER_ACTOR_ID]!.resources;
    expect(civil.notoriete).toBe(resources.notoriete + 600);
    expect(civil.militants).toBe(resources.militants - 150);
    expect(() =>
      createGame({ ...base, candidate: { ...candidate, profilId: 'inexistant' } }, ruleset),
    ).toThrow(GameCreationError);
  });

  it('exige un candidat dans le mode candidat personnalisé', () => {
    expect(() => createGame({ ...base, candidate: undefined }, ruleset)).toThrow(/candidat/);
  });

  it('est déterministe : même entrée, même état', () => {
    expect(createGame(base, ruleset)).toEqual(createGame(base, ruleset));
  });

  it.each([
    ['2026-09-29', 'pas un lundi'],
    ['2026-08-31', 'avant la fenêtre'],
    ['2027-01-04', 'après la fenêtre'],
    ['2026-02-30', 'date impossible'],
  ])('refuse la date de départ %s (%s)', (startDate) => {
    expect(() => createGame({ ...base, startDate }, ruleset)).toThrow(GameCreationError);
  });

  it('exige une personnalité connue dans le mode candidat réel', () => {
    expect(() => createGame({ ...base, mode: 'candidat_reel' }, ruleset)).toThrow(
      expect.objectContaining({ code: 'personnalite_requise' }),
    );
    expect(() =>
      createGame({ ...base, mode: 'candidat_reel', personnaliteId: 'reel-inconnu' }, ruleset),
    ).toThrow(expect.objectContaining({ code: 'personnalite_inconnue' }));
  });

  it('crée une partie sans candidat du joueur en mode observateur', () => {
    const state = createGame({ seed: 'obs', mode: 'observateur', difficulty: 'standard' }, ruleset);
    expect(state.player).toEqual({
      mode: 'observateur',
      actorId: null,
      adversaires: 'fictifs',
      orientation: null,
      format: 'complet',
    });
    expect(Object.values(state.actors).every((a) => a.kind === 'adversaire')).toBe(true);
  });
});
