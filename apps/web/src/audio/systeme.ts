import type { MusicTrack } from '@r2027/shared';
import { perceivedGain, type SoundSettings, DEFAULT_SOUND } from '../stores/son';
import { playlistFor, type AmbianceRequest } from './ambiance';
import { JINGLES, type Cue } from './jingles';
import { MusicPlayer, type AudioElementLike } from './musique';
import { renderJingle } from './synth';

// Système sonore de l'interface (phase 19). Règles : aucun son avant le premier geste du joueur
// (exigence des navigateurs et de l'appareil) ; rien en arrière-plan ; « son coupé » prime sur
// tout ; la musique s'atténue le temps d'un jingle. Les écrans ne parlent qu'à l'interface
// `SoundApi` ; les tests la remplacent par un double qui note les appels.

export interface SoundApi {
  /** Premier geste du joueur : le son est désormais permis. */
  unlock(): void;
  setAmbiance(ambiance: AmbianceRequest): void;
  setSettings(settings: SoundSettings): void;
  /** Page ou application au premier plan (true) ou en arrière-plan (false). */
  setActive(active: boolean): void;
  /** Jingle d'un moment fort, selon les réglages. */
  play(cue: Cue): void;
  /** Écoute d'un jingle depuis Paramètres : jouée même si les jingles sont désactivés. */
  preview(cue: Cue): void;
}

/** Atténuation de la musique pendant un jingle. */
const DUCK = 0.3;
/** Un même jingle n'est pas rejoué dans cet intervalle (écran affiché deux fois de suite). */
const REPEAT_GUARD_MS = 1500;
/** Pas de l'horloge du lecteur de musique. */
const TICK_MS = 100;

export type SoundSystemDeps = {
  tracks: readonly MusicTrack[];
  url: (fichier: string) => string;
  createElement: () => AudioElementLike;
  /** Contexte Web Audio des jingles, ou null (aucune synthèse possible). */
  createContext: () => AudioContext | null;
  now?: () => number;
  setInterval?: (callback: () => void, ms: number) => unknown;
  /** Rendu d'un jingle (le synthétiseur ; un espion dans les tests). */
  render?: typeof renderJingle;
};

export class SoundSystem implements SoundApi {
  private settings: SoundSettings = DEFAULT_SOUND;
  private ambiance: AmbianceRequest = 'silence';
  private unlocked = false;
  private active = true;
  private context: AudioContext | null = null;
  private readonly player: MusicPlayer;
  private readonly now: () => number;
  private readonly lastPlayed = new Map<Cue, number>();
  private clock: unknown = null;
  private lastTick = 0;

  constructor(private readonly deps: SoundSystemDeps) {
    this.player = new MusicPlayer(deps.createElement);
    this.now = deps.now ?? (() => performance.now());
  }

  unlock(): void {
    if (!this.unlocked) {
      this.unlocked = true;
      this.startClock();
    }
    // Le contexte audio ne peut démarrer que dans le geste lui-même.
    this.ensureContext();
    void this.context?.resume().catch(() => undefined);
    this.sync();
  }

  setAmbiance(ambiance: AmbianceRequest): void {
    this.ambiance = ambiance;
    this.sync();
  }

  setSettings(settings: SoundSettings): void {
    this.settings = settings;
    this.sync();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (this.context) {
      if (active && this.unlocked) void this.context.resume().catch(() => undefined);
      if (!active) void this.context.suspend().catch(() => undefined);
    }
    this.sync();
  }

  play(cue: Cue): void {
    if (!this.settings.jingles) return;
    this.emit(cue, false);
  }

  preview(cue: Cue): void {
    this.unlock();
    this.emit(cue, true);
  }

  private emit(cue: Cue, force: boolean): void {
    if (!this.unlocked || !this.active || this.settings.coupe) return;
    const now = this.now();
    if (!force && now - (this.lastPlayed.get(cue) ?? -Infinity) < REPEAT_GUARD_MS) return;
    this.lastPlayed.set(cue, now);
    const volume = perceivedGain(this.settings.volumeJingles);
    const context = this.ensureContext();
    if (!context || volume === 0) return;
    const jingle = JINGLES[cue];
    const render = this.deps.render ?? renderJingle;
    render(context, jingle, context.destination, context.currentTime + 0.05, volume);
    this.player.setDuck(DUCK, jingle.duree);
  }

  private ensureContext(): AudioContext | null {
    this.context ??= this.deps.createContext();
    return this.context;
  }

  private startClock(): void {
    if (this.clock !== null) return;
    const every = this.deps.setInterval ?? ((callback, ms) => window.setInterval(callback, ms));
    this.lastTick = this.now();
    this.clock = every(() => this.tick(), TICK_MS);
  }

  /** Avance le lecteur du temps écoulé (appelé par l'horloge ; public pour les tests). */
  tick(): void {
    const now = this.now();
    this.player.tick(Math.min(1, Math.max(0, (now - this.lastTick) / 1000)));
    this.lastTick = now;
  }

  /** Morceau en cours, pour l'affichage et les tests. */
  currentTrack(): string | null {
    return this.player.current();
  }

  private sync(): void {
    const { coupe, musique, volumeMusique } = this.settings;
    const playlist = playlistFor(this.ambiance, this.deps.tracks).map((t) => ({
      id: t.id,
      src: this.deps.url(t.fichier),
    }));
    this.player.setTracks(musique && !coupe ? playlist : []);
    this.player.setLevel(perceivedGain(volumeMusique));
    this.player.setRunning(this.unlocked && this.active && musique && !coupe);
  }
}

/** Système muet : environnement sans Web Audio ni lecture de médias (tests de composants). */
export const SILENT_SOUND: SoundApi = {
  unlock: () => undefined,
  setAmbiance: () => undefined,
  setSettings: () => undefined,
  setActive: () => undefined,
  play: () => undefined,
  preview: () => undefined,
};

let current: SoundApi | null = null;
let factory: (() => SoundApi) | null = null;

/** Fabrique du système par défaut (définie par l'application au démarrage). */
export function setSoundFactory(make: () => SoundApi): void {
  factory = make;
}

/** Système sonore de l'interface ; muet tant qu'aucune fabrique n'est définie. */
export function sound(): SoundApi {
  current ??= factory ? factory() : SILENT_SOUND;
  return current;
}

/** Remplace le système (tests) ; null revient au système par défaut. */
export function setSound(api: SoundApi | null): void {
  current = api;
}
