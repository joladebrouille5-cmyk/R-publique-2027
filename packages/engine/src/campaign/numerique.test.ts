import { describe, expect, it } from 'vitest';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import {
  advance,
  newGame,
  playerChange,
  playerResources,
  QUIET,
  RULESET,
  withResources,
} from '../core/testing';
import { contendersFromState, distribute, summarize } from '../election/distribution';
import { reception } from './numerique';

// Réseaux sociaux et nouveaux médias (phase 9) : publications simulées, réactions de comptes
// inventés, jauges Jeunesse et Dynamique inscrites au registre, effet sur le vote.

const rules = RULESET.numerique;
const templates = (formatId: string) =>
  Object.values(rules.formats.find((f) => f.id === formatId)!.reactions).flat();

describe('réseaux et nouveaux médias', () => {
  it('publie une interview longue : jauges au registre, vues et réactions de comptes fictifs', () => {
    const { state, report } = advance(newGame(), ['interview-longue']);
    for (const ressource of ['jeunesse', 'dynamique', 'notoriete'] as const) {
      const change = playerChange(report, ressource)!;
      // Chaque variation est la somme exacte de ses facteurs, action comprise.
      expect(change.after - change.before).toBe(change.factors.reduce((s, f) => s + f.value, 0));
      expect(change.factors.some((f) => f.source === 'action')).toBe(true);
    }
    expect(playerResources(state).jeunesse).toBeGreaterThan(rules.initial.jeunesse);
    const posts = report.numerique.filter((p) => p.acteurId === PLAYER_ACTOR_ID);
    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post).toMatchObject({ actionId: 'interview-longue', formatId: 'interview-longue' });
    expect(post!.vues).toBeGreaterThan(0);
    expect(post!.reactions).toHaveLength(rules.reactionsParPublication);
    for (const r of post!.reactions) {
      expect(rules.comptes).toContain(r.compte);
      expect(templates('interview-longue')).toContain(r.texte);
    }
    // Comptes distincts dans une même publication ; fil de l'état à jour.
    expect(new Set(post!.reactions.map((r) => r.compte)).size).toBe(post!.reactions.length);
    expect(state.numerique.publications).toContainEqual(post);
  });

  it('est déterministe : même graine, même semaine, mêmes publications', () => {
    const a = advance(newGame(), ['vague-video-courte', 'live-twitch']).report.numerique;
    const b = advance(newGame(), ['vague-video-courte', 'live-twitch']).report.numerique;
    expect(a).toEqual(b);
    const other = advance(newGame({ seed: 'autre-graine' }), ['vague-video-courte']).report
      .numerique;
    expect(other).not.toEqual(a.filter((p) => p.actionId === 'vague-video-courte'));
  });

  it('fait retomber le buzz et s’user l’écho chez les jeunes, avec leurs facteurs', () => {
    const start = withResources(newGame(), { jeunesse: 6_000, dynamique: 5_000 });
    const { report } = advance(start, []);
    const dynamique = playerChange(report, 'dynamique')!;
    expect(dynamique.after).toBe(5_000 - Math.round(5_000 * rules.retombeeDynamique));
    expect(dynamique.factors[0]!.label).toMatch(/Retombée du buzz/);
    const jeunesse = playerChange(report, 'jeunesse')!;
    expect(jeunesse.after).toBe(6_000 - Math.round(6_000 * rules.erosionJeunesse));
  });

  it('pèse sur les intentions de vote : facteurs « Écho chez les 18-34 ans » et « Buzz »', () => {
    const base = newGame();
    const boosted = withResources(base, { jeunesse: 7_000, dynamique: 6_000 });
    const share = (state: typeof base) => {
      const opinion = summarize(distribute(state, QUIET, 1, 'opinion'), 0, 1)!;
      return opinion.intentions[PLAYER_ACTOR_ID]!;
    };
    expect(share(boosted)).toBeGreaterThan(share(base));
    const groups = distribute(boosted, QUIET, 1, 'opinion');
    const index = contendersFromState(boosted, 1).findIndex((c) => c.id === PLAYER_ACTOR_ID);
    const factors = groups[0]!.factors[index]!.map((f) => f.label);
    expect(factors).toContain('Écho chez les 18-34 ans');
    expect(factors).toContain('Buzz sur les réseaux');
  });

  it('garde un fil borné aux publications les plus récentes', () => {
    let state = newGame();
    for (let week = 0; week < 7; week++)
      state = advance(state, [
        'vague-video-courte',
        'decryptage',
        'interview-longue',
        'live-twitch',
      ]).state;
    expect(state.numerique.publications.length).toBeLessThanOrEqual(rules.publicationsMax);
    const weeks = state.numerique.publications.map((p) => p.semaine);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    expect(weeks.at(-1)).toBe(6);
  });

  it('déduit l’accueil des réactions, un incident l’emportant', () => {
    const r = (ton: 'positif' | 'neutre' | 'negatif') => ({
      compte: '@test_a',
      texte: 'x',
      ton,
      jaime: 0,
    });
    expect(reception([r('positif'), r('positif'), r('neutre')], false)).toBe('enthousiaste');
    expect(reception([r('positif'), r('neutre'), r('neutre')], false)).toBe('favorable');
    expect(reception([r('positif'), r('negatif'), r('neutre')], false)).toBe('partage');
    expect(reception([r('negatif'), r('neutre'), r('neutre')], false)).toBe('hostile');
    expect(reception([r('positif'), r('positif'), r('positif')], true)).toBe('hostile');
  });
});
