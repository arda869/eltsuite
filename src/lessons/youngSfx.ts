// Young learners' sounds, made in the browser: a soft tap, a pop when an answer goes in, a chime for a
// right answer, a gentle "boing" for one to look at again, a sparkle for a star and a little fanfare when
// every answer is right. Quiet, short, and off with one button; nothing plays before the learner taps.

export type YoungSound = 'tap' | 'pop' | 'right' | 'again' | 'star' | 'fanfare' | 'next';

const KEY = 'yl.sound';
export const youngSoundOn = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
export const setYoungSound = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private window: the choice lasts for this page */
  }
  window.dispatchEvent(new Event('yl-sound'));
};

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
function audio() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.32;
    out.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const hz = (semi: number) => 523.25 * Math.pow(2, semi / 12); // C5 = 0

/** A bell-like note: a sine with a soft overtone. */
function note(semi: number, at: number, length: number, level: number, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a || !out) return;
  const t = a.currentTime + at;
  const f = hz(semi);
  for (const [mult, gain] of [[1, level], [2, level * 0.25], [3, level * 0.08]] as const) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = mult === 1 ? type : 'sine';
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length / mult);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + length + 0.05);
  }
}

/** A pitch that slides, for pops and boings. */
function slide(from: number, to: number, at: number, length: number, level: number, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a || !out) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + length);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + length + 0.03);
}

export function youngSound(what: YoungSound) {
  if (!youngSoundOn()) return;
  try {
    switch (what) {
      case 'tap':
        slide(900, 600, 0, 0.06, 0.18, 'triangle');
        break;
      case 'pop':
        slide(380, 980, 0, 0.09, 0.3);
        break;
      case 'right':
        note(7, 0, 0.5, 0.35);
        note(12, 0.09, 0.7, 0.35);
        break;
      case 'again':
        // A soft, friendly boing: never a buzzer.
        slide(330, 190, 0, 0.18, 0.28, 'triangle');
        slide(260, 160, 0.16, 0.22, 0.2, 'triangle');
        break;
      case 'star':
        [12, 16, 19, 24].forEach((s, i) => note(s, i * 0.06, 0.45, 0.2));
        break;
      case 'fanfare':
        [0, 4, 7].forEach((s, i) => note(s, i * 0.12, 0.35, 0.3, 'triangle'));
        note(12, 0.36, 1.1, 0.34, 'triangle');
        [16, 19, 24].forEach((s, i) => note(s, 0.5 + i * 0.07, 0.6, 0.15));
        break;
      case 'next':
        slide(500, 900, 0, 0.12, 0.14, 'sine');
        break;
    }
  } catch {
    /* no audio on this device */
  }
}
