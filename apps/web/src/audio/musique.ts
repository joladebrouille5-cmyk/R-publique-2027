// Lecteur de musique (phase 19) : deux platines (éléments <audio>) pour enchaîner les morceaux
// d'une ambiance en fondu, changer d'ambiance sans coupure et atténuer la musique le temps d'un
// jingle. Le lecteur ne connaît pas l'horloge : `tick(secondes)` fait avancer les fondus, ce qui
// permet de le tester avec de faux éléments et un temps simulé.

export type PlayerTrack = { id: string; src: string };

/** Ce que le lecteur utilise d'un élément <audio> (un faux élément suffit dans les tests). */
export type AudioElementLike = {
  src: string;
  volume: number;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'ended', listener: () => void): void;
};

type Deck = {
  element: AudioElementLike;
  track: PlayerTrack | null;
  index: number;
  fade: number;
  target: 0 | 1;
  /** Lecture demandée et pas encore refusée. */
  starting: boolean;
};

/** Durée d'un fondu enchaîné (secondes). */
export const CROSSFADE_SECONDS = 2.5;
/** Vitesses de l'atténuation pendant un jingle (secondes pour aller au bout). */
const DUCK_DOWN = 0.15;
const DUCK_UP = 0.8;

export class MusicPlayer {
  private readonly decks: [Deck, Deck];
  private active: 0 | 1 = 0;
  private playlist: PlayerTrack[] = [];
  private level = 0;
  private running = false;
  private time = 0;
  private duck = { value: 1, factor: 1, until: -1 };
  /** Le navigateur a refusé une lecture (aucun geste du joueur encore). */
  blocked = false;

  constructor(createElement: () => AudioElementLike) {
    const deck = (): Deck => {
      const element = createElement();
      const d: Deck = { element, track: null, index: 0, fade: 0, target: 0, starting: false };
      element.addEventListener('ended', () => {
        if (this.decks[this.active] === d && d.target === 1) this.advance();
      });
      return d;
    };
    this.decks = [deck(), deck()];
  }

  /** Morceau en cours (celui vers lequel le lecteur va), ou null. */
  current(): string | null {
    const deck = this.decks[this.active];
    return deck.target === 1 ? (deck.track?.id ?? null) : null;
  }

  /** Morceaux de l'ambiance ; une liste vide fait taire la musique en fondu. */
  setTracks(tracks: readonly PlayerTrack[]): void {
    const same =
      tracks.length === this.playlist.length &&
      tracks.every((t, i) => t.id === this.playlist[i]?.id);
    if (same) return;
    this.playlist = [...tracks];
    if (tracks.length === 0) {
      for (const deck of this.decks) deck.target = 0;
      return;
    }
    // Le morceau en cours continue s'il appartient à la nouvelle ambiance.
    const playing = this.decks[this.active];
    const kept = playing.target === 1 ? tracks.findIndex((t) => t.id === playing.track?.id) : -1;
    if (kept >= 0) playing.index = kept;
    else this.start(0);
  }

  /** Volume général (0 à 1), son coupé compris. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
  }

  /** Lecture permise (premier geste fait, page visible, musique activée) ou non. */
  setRunning(running: boolean): void {
    if (running === this.running) return;
    this.running = running;
    this.blocked = false;
    if (!running) for (const deck of this.decks) this.pauseDeck(deck);
    this.apply();
  }

  /** Atténue la musique à `factor` pendant `seconds` secondes (le temps d'un jingle). */
  setDuck(factor: number, seconds: number): void {
    this.duck.factor = Math.max(0, Math.min(1, factor));
    this.duck.until = this.time + seconds;
  }

  /** Fait avancer le temps : fondus, atténuation, enchaînement des morceaux. */
  tick(seconds: number): void {
    this.time += seconds;
    const wanted = this.time < this.duck.until ? this.duck.factor : 1;
    this.duck.value = approach(
      this.duck.value,
      wanted,
      seconds / (wanted < this.duck.value ? DUCK_DOWN : DUCK_UP),
    );
    // Fondus figés tant que la lecture n'est pas permise : la musique monte quand elle démarre.
    if (this.running)
      for (const deck of this.decks)
        deck.fade = approach(deck.fade, deck.target, seconds / CROSSFADE_SECONDS);
    const playing = this.decks[this.active];
    const { duration, currentTime } = playing.element;
    if (
      this.running &&
      playing.target === 1 &&
      Number.isFinite(duration) &&
      duration > CROSSFADE_SECONDS * 2 &&
      currentTime >= duration - CROSSFADE_SECONDS
    )
      this.advance();
    this.apply();
  }

  private advance(): void {
    if (this.playlist.length === 0) return;
    this.start((this.decks[this.active].index + 1) % this.playlist.length);
  }

  /** Lance le morceau `index` sur la platine libre, en fondu enchaîné avec l'autre. */
  private start(index: number): void {
    const track = this.playlist[index]!;
    const previous = this.decks[this.active];
    previous.target = 0;
    this.active = this.active === 0 ? 1 : 0;
    const deck = this.decks[this.active];
    this.pauseDeck(deck);
    deck.track = track;
    deck.index = index;
    deck.element.src = track.src;
    deck.element.currentTime = 0;
    deck.fade = 0;
    deck.target = 1;
    this.apply();
  }

  private pauseDeck(deck: Deck): void {
    deck.starting = false;
    if (!deck.element.paused) deck.element.pause();
  }

  /** Volumes des platines ; lecture ou pause selon le fondu et l'autorisation. */
  private apply(): void {
    for (const deck of this.decks) {
      deck.element.volume = Math.max(0, Math.min(1, deck.fade * this.level * this.duck.value));
      const audible = deck.target === 1 || deck.fade > 0;
      if (!this.running || !audible || !deck.track) {
        if (!audible || !this.running) this.pauseDeck(deck);
        continue;
      }
      if (deck.element.paused && !deck.starting && !this.blocked) {
        deck.starting = true;
        try {
          const result = deck.element.play();
          if (result && typeof result.catch === 'function')
            result.catch(() => {
              deck.starting = false;
              this.blocked = true;
            });
        } catch {
          deck.starting = false;
          this.blocked = true;
        }
      }
    }
  }
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}
