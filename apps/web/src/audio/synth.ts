import { INSTRUMENTS, midiToHz, type Instrument, type Jingle, type JingleNote } from './jingles';

// Synthétiseur des jingles (phase 19), en Web Audio : chaque instrument est un petit patch
// (oscillateurs désaccordés et filtre pour les cuivres et les cordes, partiels inharmoniques pour
// la cloche, bruit filtré pour la cymbale et le souffle…), mixé dans un bus avec réverbération
// et compresseur. Fonctionne avec un AudioContext (jeu) comme avec un OfflineAudioContext (tests :
// rendu hors temps réel, sans haut-parleur). Le bruit et la réverbération viennent d'un générateur
// à graine fixe : un même jingle donne toujours le même signal.

type Voice = (ctx: BaseAudioContext, out: AudioNode, note: VoiceNote) => void;
type VoiceNote = { start: number; hz: number; duree: number; level: number };

/** Générateur pseudo-aléatoire à graine fixe (LCG de Numerical Recipes), entre −1 et 1. */
function noiseSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

const buffers = new WeakMap<BaseAudioContext, { bruit: AudioBuffer; salle: AudioBuffer }>();

/** Bruit blanc (3 s) et réponse impulsionnelle d'une salle (2,4 s, stéréo), créés une fois par contexte. */
function resources(ctx: BaseAudioContext) {
  const cached = buffers.get(ctx);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const bruit = ctx.createBuffer(1, Math.round(rate * 3), rate);
  const random = noiseSource(2027);
  const white = bruit.getChannelData(0);
  for (let i = 0; i < white.length; i++) white[i] = random();
  const length = Math.round(rate * 2.4);
  const salle = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = salle.getChannelData(channel);
    const r = noiseSource(1789 + channel);
    for (let i = 0; i < length; i++) {
      // Décroissance exponentielle (RT60 ≈ 2 s) précédée d'un court pré-délai.
      const t = i / rate;
      data[i] = t < 0.012 ? 0 : r() * Math.exp(-3.4 * t) * 0.6;
    }
  }
  const made = { bruit, salle };
  buffers.set(ctx, made);
  return made;
}

/** Enveloppe attaque, tenue, relâchement (constante de temps `release`) sur un gain. */
function envelope(
  param: AudioParam,
  start: number,
  attack: number,
  level: number,
  end: number,
  release: number,
  sustain = 1,
) {
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(level, start + attack);
  if (sustain < 1) param.setTargetAtTime(level * sustain, start + attack, 0.12);
  param.setTargetAtTime(0, Math.max(end, start + attack), release);
}

function noise(ctx: BaseAudioContext, start: number, stop: number) {
  const source = ctx.createBufferSource();
  source.buffer = resources(ctx).bruit;
  source.loop = true;
  source.start(start);
  source.stop(stop);
  return source;
}

/** Cuivres : trois dents de scie désaccordées, filtre qui s'ouvre à l'attaque, attaque glissée. */
const cuivres: Voice = (ctx, out, { start, hz, duree, level }) => {
  const end = start + duree;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(hz * 1.2, start);
  filter.frequency.linearRampToValueAtTime(Math.min(hz * 7, 6000), start + 0.06);
  filter.frequency.setTargetAtTime(Math.min(hz * 4, 3800), start + 0.06, 0.15);
  const gain = ctx.createGain();
  envelope(gain.gain, start, 0.03, level * 0.16, end, 0.12, 0.78);
  filter.connect(gain).connect(out);
  // Vibrato léger sur les notes tenues.
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.4;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, start);
  depth.gain.linearRampToValueAtTime(duree > 0.6 ? 7 : 0, start + Math.min(0.6, duree));
  vibrato.connect(depth);
  vibrato.start(start);
  vibrato.stop(end + 0.8);
  for (const cents of [-8, 0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.detune.setValueAtTime(cents - 25, start);
    osc.detune.linearRampToValueAtTime(cents, start + 0.05);
    depth.connect(osc.detune);
    osc.connect(filter);
    osc.start(start);
    osc.stop(end + 0.8);
  }
};

/** Cordes : quatre dents de scie désaccordées, filtre doux, attaque et relâchement lents. */
const cordes: Voice = (ctx, out, { start, hz, duree, level }) => {
  const end = start + duree;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.3;
  filter.frequency.value = Math.max(1800, Math.min(hz * 6, 4200));
  const gain = ctx.createGain();
  envelope(gain.gain, start, Math.min(0.35, duree / 2), level * 0.08, end, 0.35);
  filter.connect(gain).connect(out);
  for (const cents of [-12, -4, 5, 11]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.detune.value = cents;
    osc.connect(filter);
    osc.start(start);
    osc.stop(end + 1.8);
  }
};

/** Cloche (glockenspiel) : partiels inharmoniques, chacun avec sa décroissance. */
const cloche: Voice = (ctx, out, { start, hz, duree, level }) => {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2, 0.45, 0.65],
    [3, 0.25, 0.45],
    [4.16, 0.18, 0.3],
    [5.43, 0.12, 0.22],
  ];
  for (const [ratio, amplitude, decay] of partials) {
    const frequency = hz * ratio;
    if (frequency > 16_000) continue;
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const stop = start + duree * decay + 0.05;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * 0.11 * amplitude, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(stop + 0.02);
  }
};

/** Timbale : sinus dont la hauteur retombe, partiel de quinte, choc de mailloche (bruit filtré). */
const timbale: Voice = (ctx, out, { start, hz, duree, level }) => {
  const stop = start + duree;
  for (const [ratio, amplitude, decay] of [
    [1, 0.55, 1],
    [1.5, 0.18, 0.5],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(hz * ratio * 1.35, start);
    osc.frequency.exponentialRampToValueAtTime(hz * ratio, start + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * amplitude, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duree * decay);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(stop + 0.05);
  }
  const mallet = noise(ctx, start, start + 0.12);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level * 0.25, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
  mallet.connect(band).connect(gain).connect(out);
};

/** Cymbale : bruit blanc filtré vers l'aigu, longue décroissance. */
const cymbale: Voice = (ctx, out, { start, duree, level }) => {
  const source = noise(ctx, start, start + duree + 0.05);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 5500;
  const shine = ctx.createBiquadFilter();
  shine.type = 'peaking';
  shine.frequency.value = 9000;
  shine.gain.value = 5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level * 0.16, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duree);
  source.connect(high).connect(shine).connect(gain).connect(out);
};

/** Tic d'horloge : brève impulsion résonante et un souffle de bruit aigu. */
const tic: Voice = (ctx, out, { start, hz, level }) => {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = Math.min(hz, 2400);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600;
  band.Q.value = 3;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level * 0.3, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);
  osc.connect(band).connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + 0.05);
  const click = noise(ctx, start, start + 0.03);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 4000;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(level * 0.12, start);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.018);
  click.connect(high).connect(clickGain).connect(out);
};

/** Basse : dent de scie et carré à l'octave inférieure, filtre qui se referme à chaque note. */
const basse: Voice = (ctx, out, { start, hz, duree, level }) => {
  const stop = start + duree;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(hz * 9, start);
  filter.frequency.exponentialRampToValueAtTime(hz * 2, stop);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level * 0.3, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop + 0.06);
  filter.connect(gain).connect(out);
  for (const [type, ratio] of [
    ['sawtooth', 1],
    ['square', 0.5],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz * ratio;
    osc.connect(filter);
    osc.start(start);
    osc.stop(stop + 0.1);
  }
};

/** Souffle (montée) : bruit filtré dont la bande monte vers l'aigu, coupé net à la fin. */
const souffle: Voice = (ctx, out, { start, duree, level }) => {
  const stop = start + duree;
  const source = noise(ctx, start, stop + 0.03);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(250, start);
  band.frequency.exponentialRampToValueAtTime(5000, stop);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level * 0.22, stop - 0.02);
  gain.gain.linearRampToValueAtTime(0, stop);
  source.connect(band).connect(gain).connect(out);
};

/** Battement : sinus grave dont la hauteur chute, très court. */
const pulsation: Voice = (ctx, out, { start, hz, duree, level }) => {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(hz * 1.7, start);
  osc.frequency.exponentialRampToValueAtTime(hz * 0.9, start + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level * 0.7, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duree);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duree + 0.05);
};

/**
 * Marimba (phase 21) : lame de bois frappée ; fondamentale et partiel de quatrième harmonique
 * (accord de la lame), décroissance rapide, choc de mailloche.
 */
const marimba: Voice = (ctx, out, { start, hz, duree, level }) => {
  const stop = start + Math.min(duree, 1.6);
  for (const [ratio, amplitude, decay] of [
    [1, 1, 1],
    [4, 0.32, 0.25],
    [9.9, 0.06, 0.08],
  ] as const) {
    const frequency = hz * ratio;
    if (frequency > 14_000) continue;
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * 0.3 * amplitude, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (stop - start) * decay + 0.04);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(stop + 0.06);
  }
};

/** Pizzicato : corde pincée ; dent de scie très filtrée qui se referme aussitôt. */
const pizz: Voice = (ctx, out, { start, hz, duree, level }) => {
  const stop = start + Math.min(duree, 1.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(Math.min(hz * 10, 7000), start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(hz * 1.2, 120), stop);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level * 0.32, start + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  filter.connect(gain).connect(out);
  for (const cents of [-4, 4]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.detune.value = cents;
    osc.connect(filter);
    osc.start(start);
    osc.stop(stop + 0.05);
  }
};

/** Caisse claire : timbre (bruit en bande) et peau (sinus bref) ; un roulement est une suite. */
const caisse: Voice = (ctx, out, { start, duree, level }) => {
  const stop = start + Math.min(duree, 0.5);
  const snare = noise(ctx, start, stop + 0.02);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200;
  band.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level * 0.3, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  snare.connect(band).connect(gain).connect(out);
  const skin = ctx.createOscillator();
  skin.frequency.setValueAtTime(240, start);
  skin.frequency.exponentialRampToValueAtTime(170, start + 0.06);
  const skinGain = ctx.createGain();
  skinGain.gain.setValueAtTime(level * 0.28, start);
  skinGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  skin.connect(skinGain).connect(out);
  skin.start(start);
  skin.stop(start + 0.12);
};

/** Claquement de mains : trois éclats de bruit rapprochés, puis une courte traîne. */
const claque: Voice = (ctx, out, { start, level }) => {
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1300;
  band.Q.value = 1.1;
  band.connect(out);
  for (const [offset, tail] of [
    [0, 0.012],
    [0.011, 0.012],
    [0.022, 0.14],
  ] as const) {
    const t = start + offset;
    const burst = noise(ctx, t, t + tail + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * 0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    burst.connect(gain).connect(band);
  }
};

/** Frappe de machine à écrire : claquement sec (bruit aigu) et tintement métallique bref. */
const machine: Voice = (ctx, out, { start, hz, level }) => {
  const click = noise(ctx, start, start + 0.03);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 2500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level * 0.42, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.022);
  click.connect(high).connect(gain).connect(out);
  const ping = ctx.createOscillator();
  ping.type = 'triangle';
  ping.frequency.value = Math.min(hz || 1800, 4000);
  const pingGain = ctx.createGain();
  pingGain.gain.setValueAtTime(level * 0.08, start);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
  ping.connect(pingGain).connect(out);
  ping.start(start);
  ping.stop(start + 0.07);
};

/**
 * Coup de tampon : choc sourd (sinus grave qui chute), claque du papier (bruit en bande) et
 * frottement du caoutchouc ; aucun ton.
 */
const tampon: Voice = (ctx, out, { start, level }) => {
  const thud = ctx.createOscillator();
  thud.frequency.setValueAtTime(150, start);
  thud.frequency.exponentialRampToValueAtTime(48, start + 0.12);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0, start);
  thudGain.gain.linearRampToValueAtTime(level * 0.9, start + 0.003);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
  thud.connect(thudGain).connect(out);
  thud.start(start);
  thud.stop(start + 0.26);
  const slap = noise(ctx, start, start + 0.12);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900;
  band.Q.value = 0.9;
  const slapGain = ctx.createGain();
  slapGain.gain.setValueAtTime(level * 0.6, start);
  slapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
  slap.connect(band).connect(slapGain).connect(out);
};

const VOICES: Record<Instrument, Voice> = {
  cuivres,
  cordes,
  cloche,
  timbale,
  cymbale,
  tic,
  basse,
  souffle,
  pulsation,
  marimba,
  pizz,
  caisse,
  claque,
  machine,
  tampon,
};

/** Instruments sans hauteur : une seule voix, quelles que soient les hauteurs indiquées. */
const UNPITCHED = new Set<Instrument>(['cymbale', 'souffle', 'caisse', 'claque', 'tampon']);

function playNote(ctx: BaseAudioContext, bus: AudioNode, note: JingleNote, when: number) {
  const voice = VOICES[note.instrument];
  const pitches =
    UNPITCHED.has(note.instrument) || note.hauteurs.length === 0 ? [0] : note.hauteurs;
  // Un accord ne sonne pas plus fort que la somme de ses notes ne le voudrait.
  const level = note.velocite / Math.sqrt(pitches.length);
  for (const midi of pitches)
    voice(ctx, bus, {
      start: when + note.t,
      hz: midi > 0 ? midiToHz(midi) : 0,
      duree: note.duree,
      level,
    });
}

/**
 * Joue un jingle à l'instant `when` du contexte, vers `destination`, au volume `volume` (0 à 1).
 * Renvoie l'instant de fin (queue de réverbération comprise).
 */
export function renderJingle(
  ctx: BaseAudioContext,
  jingle: Jingle,
  destination: AudioNode,
  when: number,
  volume = 1,
): number {
  const bus = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.3;
  const reverb = ctx.createConvolver();
  reverb.buffer = resources(ctx).salle;
  const send = ctx.createGain();
  send.gain.value = jingle.reverb;
  const output = ctx.createGain();
  output.gain.value = Math.max(0, Math.min(1, volume));
  bus.connect(compressor);
  bus.connect(send).connect(reverb).connect(compressor);
  compressor.connect(output).connect(destination);
  for (const note of jingle.notes) playNote(ctx, bus, note, when);
  return when + jingle.duree;
}

/** Instruments connus du synthétiseur (vérifié par les tests). */
export const SYNTH_INSTRUMENTS: readonly Instrument[] = INSTRUMENTS.filter((i) => i in VOICES);
