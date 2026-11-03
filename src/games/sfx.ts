import type { GameTheme } from './model';

// Game sounds, made in the browser (no sound files to load or license). Each of the five looks has
// its own instrument, so a game in the Garden sounds different from the same game in Space:
//   arcade — chiptune square waves      garden — marimba and birdsong
//   space  — glassy synth with echoes   wood   — xylophone and wood blocks
//   paper  — pencil taps and a soft bell
// Sounds are short and quiet, and nothing plays until a teacher or learner has pressed something.
export type Sfx = 'tap' | 'flip' | 'right' | 'wrong' | 'win' | 'lose' | 'tick' | 'start';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function audio() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Voice = { wave: OscillatorType; attack: number; decay: number; partial?: number; partialGain?: number; detune?: number; echo?: number };
const VOICES: Record<GameTheme, Voice> = {
  arcade: { wave: 'square', attack: 0.003, decay: 0.12, detune: 6 },
  garden: { wave: 'sine', attack: 0.002, decay: 0.32, partial: 4, partialGain: 0.25 },
  space: { wave: 'triangle', attack: 0.02, decay: 0.5, partial: 2.01, partialGain: 0.35, echo: 0.18 },
  wood: { wave: 'sine', attack: 0.001, decay: 0.22, partial: 3.0, partialGain: 0.5 },
  paper: { wave: 'sine', attack: 0.004, decay: 0.6, partial: 2.76, partialGain: 0.18 },
};
// Notes as semitones above C5; each look plays its tunes in its own key.
const KEY: Record<GameTheme, number> = { arcade: 0, garden: 5, space: -3, wood: -5, paper: 2 };
const hz = (semi: number) => 523.25 * Math.pow(2, semi / 12);

function note(t: GameTheme, semi: number, at: number, length = 1, gain = 0.5) {
  const a = audio();
  if (!a || !master) return;
  const v = VOICES[t];
  const start = a.currentTime + at;
  const play = (freq: number, level: number, delay = 0) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = v.wave;
    o.frequency.value = freq;
    if (v.detune) o.detune.value = v.detune;
    const s = start + delay, end = s + v.decay * length;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(level, s + v.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g); g.connect(master!);
    o.start(s); o.stop(end + 0.02);
  };
  const f = hz(semi + KEY[t]);
  play(f, gain);
  if (v.partial) play(f * v.partial, gain * (v.partialGain ?? 0.2));
  if (v.echo) { play(f, gain * 0.35, v.echo); play(f, gain * 0.15, v.echo * 2); }
}

// A short burst of filtered noise: wood blocks, pencil taps, a whoosh.
function noise(at: number, length: number, freq: number, q: number, gain: number) {
  const a = audio();
  if (!a || !master) return;
  const n = Math.max(1, Math.floor(a.sampleRate * length));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(a.currentTime + at);
}

// A pitch that slides: a buzzer, a falling "oh no", a rocket.
function slide(t: GameTheme, from: number, to: number, at: number, length: number, gain: number) {
  const a = audio();
  if (!a || !master) return;
  const o = a.createOscillator(), g = a.createGain(), s = a.currentTime + at;
  o.type = t === 'arcade' ? 'square' : t === 'space' ? 'sawtooth' : 'triangle';
  o.frequency.setValueAtTime(from, s);
  o.frequency.exponentialRampToValueAtTime(to, s + length);
  g.gain.setValueAtTime(gain, s);
  g.gain.exponentialRampToValueAtTime(0.0001, s + length);
  o.connect(g); g.connect(master);
  o.start(s); o.stop(s + length + 0.02);
}

export function playSfx(theme: GameTheme, what: Sfx) {
  try {
    switch (what) {
      case 'tap':
        if (theme === 'wood') noise(0, 0.05, 1800, 6, 0.9);
        else if (theme === 'paper') noise(0, 0.04, 3200, 2, 0.5);
        else note(theme, 12, 0, 0.25, 0.25);
        break;
      case 'flip':
        noise(0, 0.08, theme === 'space' ? 900 : 2400, 1.2, 0.35);
        note(theme, 7, 0.03, 0.3, 0.2);
        break;
      case 'tick':
        if (theme === 'wood' || theme === 'paper') noise(0, 0.03, 2600, 8, 0.5);
        else note(theme, 19, 0, 0.15, 0.15);
        break;
      case 'start':
        [0, 4, 7].forEach((s, i) => note(theme, s, i * 0.07, 0.6, 0.3));
        break;
      case 'right':
        // A rising chord; the garden adds a bird, space a shimmer.
        [0, 4, 7, 12].forEach((s, i) => note(theme, s, i * 0.06, 0.8, 0.42));
        if (theme === 'garden') { slide(theme, 2600, 3400, 0.28, 0.07, 0.05); slide(theme, 2700, 3600, 0.38, 0.07, 0.05); }
        if (theme === 'space') slide(theme, 1200, 2400, 0.1, 0.4, 0.03);
        if (theme === 'wood') noise(0, 0.05, 1500, 8, 0.6);
        break;
      case 'wrong':
        if (theme === 'arcade') { slide(theme, 330, 110, 0, 0.35, 0.12); }
        else if (theme === 'wood') { noise(0, 0.09, 260, 3, 1); note(theme, -12, 0.05, 0.6, 0.35); note(theme, -13, 0.18, 0.8, 0.35); }
        else if (theme === 'paper') { noise(0, 0.25, 900, 0.7, 0.45); note(theme, -9, 0.1, 0.5, 0.25); }
        else { note(theme, -5, 0, 0.6, 0.35); note(theme, -6, 0.16, 0.9, 0.35); }
        break;
      case 'win':
        [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => note(theme, s, i * 0.11, i === 7 ? 2.4 : 0.9, 0.42));
        if (theme === 'paper' || theme === 'wood') [0.9, 1.0, 1.1].forEach((t) => noise(t, 0.06, 1800, 3, 0.5));
        if (theme === 'space') slide(theme, 300, 2400, 0.6, 0.8, 0.04);
        break;
      case 'lose':
        [7, 4, 0, -5].forEach((s, i) => note(theme, s, i * 0.18, 1.1, 0.35));
        break;
    }
  } catch { /* no audio on this device */ }
}
