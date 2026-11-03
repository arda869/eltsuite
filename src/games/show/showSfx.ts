// The show's own sounds, made in the browser: a warm electric piano for the music, a soft
// wooden tick for the clock, filtered air for sweeps. Everything is short and quiet, nothing plays
// before someone has pressed something, and the game is fully playable with sound off.
import type { GameTheme } from '../model';

export type ShowSfx = 'open' | 'stage' | 'select' | 'lock' | 'right' | 'wrong' | 'timeout' | 'tick' | 'lifeline' | 'complete';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function audio() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
/** Call from a user gesture (the Start button) so later sounds are allowed to play. */
export const warmShowAudio = () => { try { audio(); } catch { /* no audio on this device */ } };

// Each stage palette sits in its own key, a small signature without a different instrument.
const KEY: Record<GameTheme, number> = { wood: -2, paper: 0, arcade: 3, garden: 5, space: -5 };
const hz = (semi: number) => 440 * Math.pow(2, semi / 12);

function tone(theme: GameTheme, semi: number, at: number, length: number, level: number, bright = 0.35) {
  const a = audio();
  if (!a || !master) return;
  const start = a.currentTime + at;
  const f = hz(semi + KEY[theme]);
  const voice = (freq: number, gain: number, type: OscillatorType, decay: number) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    o.connect(g); g.connect(master!);
    o.start(start); o.stop(start + decay + 0.03);
  };
  voice(f, level, 'sine', length);
  voice(f * 2, level * bright, 'triangle', length * 0.55);
  voice(f * 3.98, level * bright * 0.25, 'sine', length * 0.3);
}

function air(at: number, length: number, from: number, to: number, level: number) {
  const a = audio();
  if (!a || !master) return;
  const n = Math.max(1, Math.floor(a.sampleRate * length));
  const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / n) * Math.PI);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), s = a.currentTime + at;
  src.buffer = buf; f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(from, s); f.frequency.exponentialRampToValueAtTime(to, s + length);
  g.gain.value = level;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(s);
}

function thud(at: number, from: number, to: number, length: number, level: number) {
  const a = audio();
  if (!a || !master) return;
  const o = a.createOscillator(), g = a.createGain(), s = a.currentTime + at;
  o.type = 'sine';
  o.frequency.setValueAtTime(from, s); o.frequency.exponentialRampToValueAtTime(to, s + length);
  g.gain.setValueAtTime(level, s); g.gain.exponentialRampToValueAtTime(0.0001, s + length);
  o.connect(g); g.connect(master);
  o.start(s); o.stop(s + length + 0.02);
}

function tick(at: number, freq: number, level: number) {
  const a = audio();
  if (!a || !master) return;
  const n = Math.floor(a.sampleRate * 0.03), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 5; g.gain.value = level;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(a.currentTime + at);
}

export function playShowSfx(theme: GameTheme, what: ShowSfx) {
  try {
    switch (what) {
      case 'open':
        // Curtain up: a rising fourth, then the chord opens out.
        air(0, 0.7, 300, 2400, 0.08);
        [0, 5, 9, 12].forEach((s, i) => tone(theme, s, 0.12 + i * 0.11, 1.4, 0.3));
        tone(theme, 16, 0.6, 1.8, 0.16);
        break;
      case 'stage':
        air(0, 0.5, 400, 1800, 0.06);
        tone(theme, 0, 0.08, 0.9, 0.22); tone(theme, 7, 0.2, 1.1, 0.22);
        break;
      case 'select':
        tick(0, 2600, 0.5); tone(theme, 12, 0, 0.16, 0.12, 0.2);
        break;
      case 'lock':
        thud(0, 150, 48, 0.32, 0.5);
        tone(theme, -12, 0.05, 0.8, 0.14, 0.15);
        // Two soft heartbeats while the answer is checked.
        thud(0.5, 110, 60, 0.16, 0.22); thud(0.8, 110, 60, 0.16, 0.18);
        break;
      case 'right':
        [0, 4, 7, 12].forEach((s, i) => tone(theme, s, i * 0.07, 1.0, 0.3));
        tone(theme, 19, 0.3, 1.2, 0.1, 0.5);
        air(0.1, 0.5, 2000, 5000, 0.03);
        break;
      case 'wrong':
        tone(theme, -5, 0, 0.7, 0.22, 0.15); tone(theme, -8, 0.22, 1.0, 0.2, 0.12);
        break;
      case 'timeout':
        thud(0, 220, 110, 0.5, 0.25); tone(theme, -10, 0.1, 1.0, 0.18, 0.1);
        break;
      case 'tick':
        tick(0, 1800, 0.45);
        break;
      case 'lifeline':
        [12, 16, 19, 24].forEach((s, i) => tone(theme, s, i * 0.05, 0.45, 0.14, 0.45));
        air(0, 0.4, 1500, 5000, 0.04);
        break;
      case 'complete':
        [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(theme, s, i * 0.1, i === 7 ? 2.4 : 0.9, 0.3));
        tone(theme, 24, 0.95, 2.0, 0.1, 0.5);
        air(0.6, 1.2, 800, 4000, 0.05);
        break;
    }
  } catch { /* no audio on this device */ }
}
