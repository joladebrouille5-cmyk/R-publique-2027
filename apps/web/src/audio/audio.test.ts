import type { MusicTrack } from '@r2027/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOUND, perceivedGain, useSoundStore } from '../stores/son';
import { ambianceForPhase, playlistFor, resolveAmbiance, verdictCue } from './ambiance';
import { CUES, JINGLES, midiToHz } from './jingles';
import { MUSIC } from './manifest';
import { CROSSFADE_SECONDS, MusicPlayer, type AudioElementLike } from './musique';
import { SYNTH_INSTRUMENTS } from './synth';
import { SoundSystem } from './systeme';

// Phase 19 : moteur audio de l'interface, testé sans haut-parleur. Les platines de musique sont
// de faux éléments <audio> ; la synthèse des jingles est remplacée par un espion (le rendu réel
// est vérifié dans Chromium par l'e2e `son.spec.ts`).

const render = vi.fn((..._args: unknown[]) => 0);

class FakeAudio implements AudioElementLike {
  src = '';
  volume = 1;
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  plays = 0;
  refuse = false;
  private readonly ended: (() => void)[] = [];
  play() {
    this.plays += 1;
    if (this.refuse) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(_type: 'ended', listener: () => void) {
    this.ended.push(listener);
  }
  finish() {
    this.paused = true;
    for (const listener of this.ended) listener();
  }
}

const tracks = (...ids: string[]) => ids.map((id) => ({ id, src: `/sons/${id}.mp3` }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function player() {
  const elements: FakeAudio[] = [];
  const music = new MusicPlayer(() => {
    const element = new FakeAudio();
    elements.push(element);
    return element;
  });
  const playing = () => elements.filter((e) => !e.paused);
  return { music, elements, playing };
}

describe('jingles des moments forts', () => {
  it('a une partition par moment, jouable par le synthétiseur', () => {
    expect(Object.keys(JINGLES).sort()).toEqual([...CUES].sort());
    for (const cue of CUES) {
      const jingle = JINGLES[cue];
      expect(jingle.id).toBe(cue);
      expect(jingle.libelle.length).toBeGreaterThan(3);
      expect(jingle.duree).toBeGreaterThan(1);
      expect(jingle.duree).toBeLessThanOrEqual(7);
      expect(jingle.reverb).toBeGreaterThan(0);
      expect(jingle.reverb).toBeLessThan(1);
      for (const note of jingle.notes) {
        expect(SYNTH_INSTRUMENTS).toContain(note.instrument);
        expect(note.t).toBeGreaterThanOrEqual(0);
        expect(note.duree).toBeGreaterThan(0);
        // Chaque note finit avant la fin du jingle (la réverbération a sa place).
        expect(note.t + note.duree).toBeLessThanOrEqual(jingle.duree);
        expect(note.velocite).toBeGreaterThan(0);
        expect(note.velocite).toBeLessThanOrEqual(1);
        for (const midi of note.hauteurs) {
          expect(midi).toBeGreaterThanOrEqual(24);
          expect(midi).toBeLessThanOrEqual(108);
        }
        if (!['cymbale', 'souffle', 'caisse', 'claque', 'tampon'].includes(note.instrument))
          expect(note.hauteurs.length).toBeGreaterThan(0);
      }
    }
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
  });
});

describe('choix de la musique', () => {
  it('suit la phase de la partie : campagne jusqu’au second tour, mandat ensuite', () => {
    expect(ambianceForPhase('campagne')).toBe('campagne');
    expect(ambianceForPhase('entre_deux_tours')).toBe('campagne');
    expect(ambianceForPhase('presidence')).toBe('mandat');
    expect(ambianceForPhase('legislatives')).toBe('mandat');
    expect(ambianceForPhase('bilan')).toBe('mandat');
  });

  it('donne la priorité à l’écran le plus prioritaire, puis au plus récent', () => {
    expect(resolveAmbiance([])).toBe('silence');
    expect(
      resolveAmbiance([
        { ambiance: 'accueil', priorite: 0, ordre: 1 },
        { ambiance: 'campagne', priorite: 1, ordre: 2 },
        { ambiance: 'silence', priorite: 2, ordre: 3 },
      ]),
    ).toBe('silence');
    expect(
      resolveAmbiance([
        { ambiance: 'mandat', priorite: 1, ordre: 5 },
        { ambiance: 'accueil', priorite: 0, ordre: 9 },
        { ambiance: 'campagne', priorite: 1, ordre: 4 },
      ]),
    ).toBe('mandat');
  });

  it('joue les morceaux de l’ambiance dans l’ordre du manifeste', () => {
    expect(playlistFor('campagne', MUSIC.morceaux).map((t) => t.id)).toEqual([
      'catalyst',
      'marche-hongroise',
    ]);
    expect(playlistFor('silence', MUSIC.morceaux)).toEqual([]);
  });

  it('annonce la victoire au candidat qualifié ou élu, la défaite sinon, rien en observateur', () => {
    const t1 = { round: 1 as const, qualified: ['a', 'joueur'], winner: null };
    expect(verdictCue(t1, 'joueur')).toBe('victoire');
    expect(verdictCue(t1, 'b')).toBe('defaite');
    expect(verdictCue({ round: 1, qualified: [], winner: 'joueur' }, 'joueur')).toBe('victoire');
    const t2 = { round: 2 as const, qualified: ['a', 'joueur'], winner: 'a' };
    expect(verdictCue(t2, 'joueur')).toBe('defaite');
    expect(verdictCue({ ...t2, winner: 'joueur' }, 'joueur')).toBe('victoire');
    expect(verdictCue(t2, null)).toBeNull();
  });
});

describe('lecteur de musique', () => {
  it('ne joue rien sans autorisation, puis monte en fondu', () => {
    const { music, elements, playing } = player();
    music.setTracks(tracks('a', 'b'));
    music.setLevel(0.5);
    music.tick(1);
    expect(playing()).toEqual([]);
    expect(elements[1]!.src).toBe('/sons/a.mp3');
    music.setRunning(true);
    expect(playing()).toEqual([elements[1]]);
    expect(music.current()).toBe('a');
    music.tick(CROSSFADE_SECONDS / 2);
    expect(elements[1]!.volume).toBeCloseTo(0.25, 5);
    music.tick(CROSSFADE_SECONDS);
    expect(elements[1]!.volume).toBeCloseTo(0.5, 5);
  });

  it('enchaîne le morceau suivant en fondu avant la fin, puis revient au premier', () => {
    const { music, elements } = player();
    music.setLevel(1);
    music.setRunning(true);
    music.setTracks(tracks('a', 'b'));
    music.tick(5);
    const first = elements[1]!;
    first.duration = 60;
    first.currentTime = 58;
    music.tick(0.1);
    const second = elements[0]!;
    expect(second.src).toBe('/sons/b.mp3');
    expect(second.paused).toBe(false);
    expect(music.current()).toBe('b');
    music.tick(CROSSFADE_SECONDS + 0.1);
    expect(first.paused).toBe(true);
    expect(second.volume).toBe(1);
    // Fin naturelle (événement « ended ») : retour au premier morceau.
    second.finish();
    expect(music.current()).toBe('a');
    expect(first.src).toBe('/sons/a.mp3');
    expect(first.currentTime).toBe(0);
  });

  it('change d’ambiance en fondu et garde le morceau commun', () => {
    const { music, elements } = player();
    music.setLevel(1);
    music.setRunning(true);
    music.setTracks(tracks('a'));
    music.tick(5);
    music.setTracks(tracks('a', 'b'));
    expect(music.current()).toBe('a');
    music.setTracks(tracks('c'));
    expect(music.current()).toBe('c');
    music.tick(CROSSFADE_SECONDS + 0.1);
    expect(elements.filter((e) => !e.paused).map((e) => e.src)).toEqual(['/sons/c.mp3']);
    music.setTracks([]);
    expect(music.current()).toBeNull();
    music.tick(CROSSFADE_SECONDS + 0.1);
    expect(elements.every((e) => e.paused)).toBe(true);
  });

  it('atténue la musique le temps d’un jingle, puis la rétablit', () => {
    const { music, elements } = player();
    music.setLevel(1);
    music.setRunning(true);
    music.setTracks(tracks('a'));
    music.tick(5);
    const deck = elements[1]!;
    music.setDuck(0.3, 2);
    music.tick(0.2);
    expect(deck.volume).toBeCloseTo(0.3, 5);
    music.tick(1.5);
    expect(deck.volume).toBeCloseTo(0.3, 5);
    music.tick(1.5);
    expect(deck.volume).toBe(1);
  });

  it('retente la lecture refusée par le navigateur au retour de l’autorisation', async () => {
    const { music, elements } = player();
    for (const e of elements) e.refuse = true;
    music.setRunning(true);
    music.setTracks(tracks('a'));
    await flush();
    expect(music.blocked).toBe(true);
    music.tick(0.1);
    expect(elements[1]!.plays).toBe(1);
    for (const e of elements) e.refuse = false;
    music.setRunning(false);
    music.setRunning(true);
    expect(elements[1]!.plays).toBe(2);
    expect(elements[1]!.paused).toBe(false);
  });
});

describe('système sonore', () => {
  const music: MusicTrack[] = MUSIC.morceaux;
  let now = 0;
  let elements: FakeAudio[] = [];
  const system = () =>
    new SoundSystem({
      tracks: music,
      url: (f) => `/${f}`,
      createElement: () => {
        const element = new FakeAudio();
        elements.push(element);
        return element;
      },
      createContext: () =>
        ({
          destination: {},
          currentTime: 0,
          resume: () => Promise.resolve(),
          suspend: () => Promise.resolve(),
        }) as unknown as AudioContext,
      now: () => now,
      setInterval: () => 0,
      render,
    });
  const playing = () => elements.filter((e) => !e.paused).map((e) => e.src);

  beforeEach(() => {
    now = 0;
    elements = [];
    render.mockClear();
  });

  it('reste muet avant le premier geste, puis joue l’ambiance de l’écran', () => {
    const s = system();
    s.setSettings(DEFAULT_SOUND);
    s.setAmbiance('accueil');
    s.play('flash');
    expect(playing()).toEqual([]);
    expect(render).not.toHaveBeenCalled();
    s.unlock();
    expect(playing()).toEqual(['/sons/orient-et-occident.mp3']);
    expect(s.currentTrack()).toBe('orient-et-occident');
    s.setAmbiance('mandat');
    expect(s.currentTrack()).toBe('hiraeth');
    s.setAmbiance('silence');
    expect(s.currentTrack()).toBeNull();
  });

  it('coupe tout quand le son est coupé ou la page cachée', () => {
    const s = system();
    s.setSettings(DEFAULT_SOUND);
    s.setAmbiance('campagne');
    s.unlock();
    expect(playing()).toHaveLength(1);
    s.setActive(false);
    expect(playing()).toEqual([]);
    s.play('flash');
    expect(render).not.toHaveBeenCalled();
    s.setActive(true);
    expect(playing()).toHaveLength(1);
    s.setSettings({ ...DEFAULT_SOUND, coupe: true });
    expect(playing()).toEqual([]);
    s.play('flash');
    s.preview('flash');
    expect(render).not.toHaveBeenCalled();
    s.setSettings({ ...DEFAULT_SOUND, musique: false });
    expect(playing()).toEqual([]);
  });

  it('joue un jingle au volume réglé, une seule fois par moment, et atténue la musique', () => {
    const s = system();
    s.setSettings({ ...DEFAULT_SOUND, volumeJingles: 0.5 });
    s.setAmbiance('campagne');
    s.unlock();
    s.play('vingt-heures');
    s.play('vingt-heures');
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![1]).toBe(JINGLES['vingt-heures']);
    expect(render.mock.calls[0]![4]).toBe(perceivedGain(0.5));
    now = 2_000;
    s.play('vingt-heures');
    expect(render).toHaveBeenCalledTimes(2);
    // Jingles désactivés : seuls les essais depuis Paramètres sonnent encore.
    s.setSettings({ ...DEFAULT_SOUND, jingles: false });
    now = 5_000;
    s.play('flash');
    expect(render).toHaveBeenCalledTimes(2);
    s.preview('flash');
    s.preview('flash');
    expect(render).toHaveBeenCalledTimes(4);
  });
});

describe('réglages du son', () => {
  it('persistent sur l’appareil, bornent les volumes et suivent l’oreille', () => {
    expect(useSoundStore.getState()).toMatchObject(DEFAULT_SOUND);
    useSoundStore.getState().set({ volumeMusique: 3, volumeJingles: -1 });
    expect(useSoundStore.getState()).toMatchObject({ volumeMusique: 1, volumeJingles: 0 });
    useSoundStore.getState().toggleMute();
    expect(useSoundStore.getState().coupe).toBe(true);
    expect(JSON.parse(localStorage.getItem('r2027-son')!)).toMatchObject({
      state: { coupe: true, volumeMusique: 1, volumeJingles: 0, musique: true, jingles: true },
    });
    useSoundStore.getState().set({ ...DEFAULT_SOUND });
    expect(perceivedGain(0.5)).toBe(0.25);
    expect(perceivedGain(2)).toBe(1);
  });
});
