// The quiz show's sound effects, made in the browser: short, bright stings for each beat of the game.
// The music is separate (music.ts). Everything is playable with sound off.

export type Sfx = 'join' | 'count' | 'go' | 'lock' | 'right' | 'wrong' | 'timeup' | 'reveal' | 'tick' | 'place' | 'streak' | 'third' | 'second' | 'first';
let on = true;
export const setSfxOn = (v: boolean) => { on = v; };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function audio() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
/** Call from a user gesture (the Start button) so later sounds are allowed to play. */
export const warmSfx = () => { try { audio(); } catch { /* no audio on this device */ } };

const hz = (semi: number) => 440 * Math.pow(2, semi / 12);

function tone(semi: number, at: number, length: number, level: number, bright = 0.35) {
  const a = audio();
  if (!a || !master) return;
  const start = a.currentTime + at;
  const f = hz(semi);
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

export function playSfx(what: Sfx) {
  if (!on) return;
  try {
    switch (what) {
      case 'join':
        tone(12 + Math.floor(Math.random() * 5) * 2, 0, 0.18, 0.22, 0.4); tick(0, 3000, 0.3);
        break;
      case 'count':
        thud(0, 180, 70, 0.25, 0.6); tone(-5, 0, 0.3, 0.25, 0.3);
        break;
      case 'go':
        thud(0, 200, 50, 0.4, 0.8);
        [0, 4, 7, 12].forEach((s) => tone(s, 0.02, 0.6, 0.18, 0.5));
        air(0, 0.5, 600, 6000, 0.1);
        break;
      case 'lock':
        thud(0, 160, 60, 0.2, 0.5); tone(12, 0, 0.2, 0.2, 0.3);
        break;
      case 'right':
        [0, 4, 7, 12].forEach((s, i) => tone(s, i * 0.06, 0.9, 0.32));
        tone(19, 0.28, 1.2, 0.14, 0.5); air(0.1, 0.5, 2000, 6000, 0.05);
        break;
      case 'wrong':
        tone(-5, 0, 0.5, 0.3, 0.6); tone(-11, 0.18, 0.8, 0.28, 0.6);
        break;
      case 'timeup':
        // A buzzer: two detuned low tones, then a gong.
        thud(0, 90, 70, 0.6, 0.5); tone(-17, 0, 0.6, 0.35, 0.9); tone(-16.6, 0, 0.6, 0.3, 0.9);
        tone(-24, 0.5, 2.2, 0.25, 0.3);
        break;
      case 'reveal':
        air(0, 0.55, 300, 4000, 0.12); thud(0.45, 140, 45, 0.4, 0.7);
        break;
      case 'tick':
        tick(0, 1900, 0.6);
        break;
      case 'place':
        [7, 12].forEach((s, i) => tone(s, i * 0.08, 0.3, 0.2, 0.4));
        break;
      case 'streak':
        [12, 16, 19, 24].forEach((s, i) => tone(s, i * 0.05, 0.4, 0.18, 0.5)); air(0, 0.4, 1500, 6000, 0.06);
        break;
      case 'third':
        thud(0, 200, 50, 0.5, 0.8); [0, 4, 7].forEach((s) => tone(s - 5, 0, 1.0, 0.2, 0.5));
        break;
      case 'second':
        thud(0, 200, 50, 0.5, 0.8); [0, 4, 7].forEach((s) => tone(s - 3, 0, 1.0, 0.22, 0.5));
        break;
      case 'first':
        thud(0, 220, 45, 0.7, 1); [0, 4, 7, 12, 16].forEach((s, i) => tone(s, i * 0.04, 2.4, 0.24, 0.5));
        air(0.1, 1.4, 800, 6000, 0.1);
        break;
    }
  } catch { /* no audio on this device */ }
}
