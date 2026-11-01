// A small multitrack engine for the Sound editor: voice tracks made of clips (each with its own
// volume, fades and voice effect), a lane of sound effects that may overlap freely, and script
// lines with a start and an end. Everything is mono; the mix is worked out in the browser.

export type VoiceFx = '' | 'phone' | 'radio' | 'far' | 'hall' | 'robot';
export const VOICE_FX: { k: VoiceFx; label: string; about: string }[] = [
  { k: '', label: 'None', about: 'As recorded' },
  { k: 'phone', label: 'On the phone', about: 'Thin and narrow, like a phone call' },
  { k: 'radio', label: 'Radio', about: 'Old radio or announcement, a little crackle' },
  { k: 'far', label: 'Far away', about: 'Quieter and duller, across the room' },
  { k: 'hall', label: 'Big hall', about: 'Echoing, like a station or a church' },
  { k: 'robot', label: 'Robot', about: 'A machine voice' },
];

export type Clip = { caption?: string; id: string; src: string; a: number; b: number; at: number; gain: number; fx: VoiceFx; fadeIn: number; fadeOut: number };
export type Track = { songRole?:'vocals'|'instrumental'; id: string; name: string; kind: 'voice' | 'sfx'; clips: Clip[]; gain: number; mute: boolean; solo: boolean; noise: 0 | 1 | 2; echo: 0 | 1 | 2 };
export type Line = { id: string; text: string; who?: string; a: number; b: number; track?: string }; // track: the recording it is the script of
export type Project = { tracks: Track[]; lines: Line[]; gain: number; loud: boolean };

export const clipLen = (c: Clip) => Math.max(0, c.b - c.a);
export const clipEnd = (c: Clip) => c.at + clipLen(c);
export const projectLen = (p: Project) => Math.max(0, ...p.tracks.flatMap((t) => t.clips.map(clipEnd)), ...p.lines.map((l) => l.b));

// ------------------------------------------------------------------ filters

// A biquad filter (RBJ cookbook), run over a whole buffer.
function biquad(x: Float32Array, rate: number, type: 'lp' | 'hp' | 'bp' | 'peak', f: number, q = 0.707, gainDb = 0): Float32Array {
  const w = (2 * Math.PI * Math.min(f, rate * 0.45)) / rate;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const alpha = sn / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (type === 'lp') (b0 = (1 - cs) / 2), (b1 = 1 - cs), (b2 = (1 - cs) / 2), (a0 = 1 + alpha), (a1 = -2 * cs), (a2 = 1 - alpha);
  else if (type === 'hp') (b0 = (1 + cs) / 2), (b1 = -(1 + cs)), (b2 = (1 + cs) / 2), (a0 = 1 + alpha), (a1 = -2 * cs), (a2 = 1 - alpha);
  else if (type === 'bp') (b0 = alpha), (b1 = 0), (b2 = -alpha), (a0 = 1 + alpha), (a1 = -2 * cs), (a2 = 1 - alpha);
  else (b0 = 1 + alpha * A), (b1 = -2 * cs), (b2 = 1 - alpha * A), (a0 = 1 + alpha / A), (a1 = -2 * cs), (a2 = 1 - alpha / A);
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
// A simple room: a few comb filters into all-pass filters (Schroeder), mixed with the dry sound.
function reverb(x: Float32Array, rate: number, size: number, wet: number): Float32Array {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round((d * size * rate) / 44100));
  const fb = 0.74 + size * 0.12;
  const out = new Float32Array(x.length + Math.round(rate * size * 1.2));
  const tail = new Float32Array(out.length);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let k = 0;
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const v = buf[k];
      lp = v * 0.7 + lp * 0.3;
      buf[k] = (i < x.length ? x[i] : 0) + lp * fb;
      tail[i] += v / combs.length;
      k = (k + 1) % d;
    }
  }
  for (const d of [225, 556].map((n) => Math.round((n * rate) / 44100))) {
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < tail.length; i++) {
      const v = buf[k];
      const inp = tail[i];
      buf[k] = inp + v * 0.5;
      tail[i] = v - inp * 0.5;
      k = (k + 1) % d;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (i < x.length ? x[i] * (1 - wet * 0.5) : 0) + tail[i] * wet;
  return out;
}
const sat = (x: Float32Array, drive: number) => x.map((v) => Math.tanh(v * drive) / Math.tanh(drive));

// A voice effect on a piece of sound (may come back a little longer, for the echo to ring out).
export function applyFx(x: Float32Array, rate: number, fx: VoiceFx): Float32Array {
  if (!fx) return x;
  if (fx === 'phone') {
    let y = biquad(x, rate, 'hp', 380, 0.8);
    y = biquad(y, rate, 'hp', 380, 0.8);
    y = biquad(y, rate, 'lp', 3200, 0.8);
    y = biquad(y, rate, 'lp', 3200, 0.8);
    y = biquad(y, rate, 'peak', 1500, 1, 5);
    return sat(y, 2.2).map((v) => v * 1.25);
  }
  if (fx === 'radio') {
    let y = biquad(x, rate, 'hp', 500, 0.9);
    y = biquad(y, rate, 'lp', 4500, 0.9);
    y = sat(y, 3);
    let seed = 7;
    return y.map((v) => {
      seed = (seed * 16807) % 2147483647;
      return v * 1.15 + ((seed / 2147483647) - 0.5) * 0.012;
    });
  }
  if (fx === 'far') {
    let y = biquad(x, rate, 'lp', 2200, 0.7);
    y = biquad(y, rate, 'hp', 150, 0.7);
    return reverb(y.map((v) => v * 0.45), rate, 0.5, 0.45);
  }
  if (fx === 'hall') return reverb(x, rate, 1, 0.55);
  if (fx === 'robot') {
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i] * Math.sin((2 * Math.PI * 55 * i) / rate);
    return biquad(sat(y.map((v, i) => v + x[i] * 0.25), 1.8), rate, 'hp', 200);
  }
  return x;
}

// ------------------------------------------------------------------ sound effects

// dur: how long the sound can be; def: how long it is when added (a beep can be stretched).
export type Sfx = { k: string; label: string; group: string; dur: number; def?: number };
export const SFX: Sfx[] = [
  { k: 'bell', label: 'School bell', group: 'Signals', dur: 1.6 },
  { k: 'chime', label: 'Chime', group: 'Signals', dur: 1.2 },
  { k: 'ding', label: 'Notification', group: 'Signals', dur: 0.7 },
  { k: 'beep', label: 'Beep (any length)', group: 'Signals', dur: 30, def: 0.3 },
  { k: 'beeps', label: 'Three beeps', group: 'Signals', dur: 1.6 },
  { k: 'doorbell', label: 'Doorbell', group: 'Home', dur: 1.6 },
  { k: 'knock', label: 'Knock on the door', group: 'Home', dur: 1.1 },
  { k: 'phone', label: 'Phone ringing', group: 'Home', dur: 4.2 },
  { k: 'typing', label: 'Typing', group: 'Home', dur: 3 },
  { k: 'clock', label: 'Clock ticking', group: 'Home', dur: 4 },
  { k: 'page', label: 'Turning a page', group: 'Home', dur: 0.6 },
  { k: 'cups', label: 'Cups and spoons', group: 'Home', dur: 2.5 },
  { k: 'steps', label: 'Footsteps', group: 'People', dur: 3 },
  { k: 'applause', label: 'Applause', group: 'People', dur: 4 },
  { k: 'cafe', label: 'Café chatter', group: 'People', dur: 8 },
  { k: 'dog', label: 'Dog barking', group: 'Outside', dur: 2 },
  { k: 'birds', label: 'Birds', group: 'Outside', dur: 5 },
  { k: 'rain', label: 'Rain', group: 'Outside', dur: 8 },
  { k: 'wind', label: 'Wind', group: 'Outside', dur: 8 },
  { k: 'horn', label: 'Car horn', group: 'Outside', dur: 1.2 },
  { k: 'traffic', label: 'Traffic', group: 'Outside', dur: 8 },
  { k: 'siren', label: 'Siren', group: 'Outside', dur: 4 },
  { k: 'shutter', label: 'Camera', group: 'Things', dur: 0.4 },
  { k: 'whoosh', label: 'Whoosh', group: 'Things', dur: 0.9 },
];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
}
export function synth(k: string, rate: number, dur: number): Float32Array {
  const n = Math.max(1, Math.round(dur * rate));
  const y = new Float32Array(n);
  const R = rng(k.length * 977 + 13);
  const tone = (f: number, from: number, len: number, amp: number, decay: number, partials: [number, number][] = [[1, 1]], attack = 0.004) => {
    const a = Math.round(from * rate);
    const m = Math.min(n - a, Math.round(len * rate));
    for (let i = 0; i < m; i++) {
      const t = i / rate;
      const env = Math.min(1, t / attack) * Math.exp(-t / decay);
      let v = 0;
      for (const [mul, w] of partials) v += w * Math.sin(2 * Math.PI * f * mul * t);
      y[a + i] += amp * env * v;
    }
  };
  const burst = (from: number, len: number, amp: number, decay: number, color: 'white' | 'dark' | 'bright' = 'white') => {
    const a = Math.round(from * rate);
    const m = Math.min(n - a, Math.round(len * rate));
    let lp = 0;
    let prev = 0;
    for (let i = 0; i < m; i++) {
      const t = i / rate;
      const w = R();
      lp = lp * 0.85 + w * 0.15;
      const v = color === 'dark' ? lp * 3 : color === 'bright' ? w - prev : w;
      prev = w;
      y[a + i] += amp * Math.min(1, t / 0.002) * Math.exp(-t / decay) * v;
    }
  };
  const bed = (amp: number, cutoff: number, wobble = 0) => {
    const tmp = new Float32Array(n).map(() => R());
    const f = biquad(tmp, rate, 'lp', cutoff, 0.7);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const fade = Math.min(1, t / 0.4, (dur - t) / 0.4);
      y[i] += f[i] * amp * fade * (1 + wobble * Math.sin(2 * Math.PI * 0.3 * t + Math.sin(t * 1.7)));
    }
  };
  switch (k) {
    case 'bell':
      tone(784, 0, dur, 0.32, 0.5, [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]]);
      break;
    case 'chime':
      tone(1318.5, 0, 0.8, 0.3, 0.35, [[1, 1], [2, 0.2]]);
      tone(1046.5, 0.38, 0.82, 0.3, 0.4, [[1, 1], [2, 0.2]]);
      break;
    case 'ding':
      tone(1760, 0, 0.7, 0.25, 0.25, [[1, 1], [2.01, 0.3]]);
      tone(2349, 0.09, 0.6, 0.18, 0.22);
      break;
    case 'beep':
      // one long tone: the clip decides how long it lasts
      for (let i = 0; i < n; i++) y[i] = 0.28 * Math.min(1, i / (0.008 * rate)) * Math.sin((2 * Math.PI * 1000 * i) / rate);
      break;
    case 'beeps':
      for (const at of [0.1, 0.6, 1.1]) {
        const a = Math.round(at * rate);
        const m = Math.round(0.22 * rate);
        for (let i = 0; i < m && a + i < n; i++) {
          const t = i / rate;
          y[a + i] += 0.28 * Math.min(1, t / 0.008, (0.22 - t) / 0.008) * Math.sin(2 * Math.PI * 1000 * t);
        }
      }
      break;
    case 'doorbell':
      tone(659, 0, 1, 0.3, 0.6, [[1, 1], [3, 0.15]]);
      tone(523, 0.55, 1.05, 0.3, 0.7, [[1, 1], [3, 0.15]]);
      break;
    case 'knock':
      [0, 0.22, 0.44].forEach((t) => (burst(t, 0.12, 0.6, 0.02, 'dark'), tone(120, t, 0.12, 0.35, 0.03)));
      break;
    case 'phone':
      for (const start of [0, 2.1]) {
        for (let r = 0; r < 18; r++) {
          const a = Math.round((start + r * 0.05) * rate);
          const m = Math.round(0.05 * rate);
          for (let i = 0; i < m && a + i < n; i++) {
            const t = i / rate;
            y[a + i] += 0.22 * (Math.sin(2 * Math.PI * 1300 * t) + 0.6 * Math.sin(2 * Math.PI * 1600 * t)) * (r % 2 ? 0.25 : 1);
          }
        }
      }
      break;
    case 'typing': {
      let t = 0.05;
      while (t < dur - 0.1) {
        burst(t, 0.03, 0.45 + R() * 0.15, 0.006, 'bright');
        tone(2600 + R() * 600, t, 0.02, 0.05, 0.004);
        t += 0.07 + Math.abs(R()) * 0.16 + (Math.abs(R()) > 0.92 ? 0.35 : 0);
      }
      break;
    }
    case 'clock':
      for (let t = 0.05; t < dur; t += 1) burst(t, 0.04, 0.5, 0.004, 'bright'), burst(t + 0.5, 0.04, 0.3, 0.004, 'bright');
      break;
    case 'page':
      burst(0, 0.5, 0.25, 0.15, 'white');
      break;
    case 'cups':
      [0.1, 0.5, 0.62, 1.2, 1.9].forEach((t, i) => tone(2900 + i * 230, t, 0.5, 0.12, 0.12, [[1, 1], [2.3, 0.4], [3.7, 0.2]]));
      break;
    case 'steps':
      for (let t = 0.1; t < dur; t += 0.5) burst(t, 0.15, 0.6, 0.03, 'dark'), tone(90, t, 0.1, 0.25, 0.04);
      break;
    case 'applause':
      for (let i = 0; i < 260; i++) burst(Math.abs(R()) * (dur - 0.3), 0.04, 0.12, 0.008, 'bright');
      break;
    case 'cafe':
      bed(0.05, 900, 0.6);
      for (let i = 0; i < 6; i++) tone(3000 + i * 200, Math.abs(R()) * (dur - 0.5), 0.4, 0.04, 0.1, [[1, 1], [2.4, 0.4]]);
      for (let i = 0; i < 40; i++) tone(160 + Math.abs(R()) * 160, Math.abs(R()) * (dur - 0.4), 0.25, 0.03, 0.12, [[1, 1], [2, 0.5], [3, 0.3]], 0.04);
      break;
    case 'dog':
      for (const t of [0.05, 0.45, 1.15]) {
        const a = Math.round(t * rate);
        const m = Math.round(0.22 * rate);
        for (let i = 0; i < m && a + i < n; i++) {
          const s = i / rate;
          const f = 520 - s * 900;
          y[a + i] += 0.35 * Math.min(1, s / 0.01) * Math.exp(-s / 0.09) * (Math.sin(2 * Math.PI * f * s) + 0.5 * Math.sin(2 * Math.PI * 2 * f * s) + 0.3 * R());
        }
      }
      break;
    case 'birds':
      for (let i = 0; i < 14; i++) {
        const t0 = Math.abs(R()) * (dur - 0.4);
        const base = 3000 + Math.abs(R()) * 2000;
        const a = Math.round(t0 * rate);
        const m = Math.round(0.14 * rate);
        for (let j = 0; j < m && a + j < n; j++) {
          const s = j / rate;
          y[a + j] += 0.12 * Math.sin((2 * Math.PI * (base + Math.sin(s * 60) * 600) * s)) * Math.sin((Math.PI * s) / 0.14);
        }
      }
      break;
    case 'rain':
      bed(0.09, 6000);
      for (let i = 0; i < 500; i++) burst(Math.abs(R()) * dur, 0.01, 0.05, 0.002, 'bright');
      break;
    case 'wind':
      bed(0.25, 500, 0.9);
      break;
    case 'traffic':
      bed(0.18, 300, 0.4);
      tone(70, 1, 5, 0.06, 4, [[1, 1], [2, 0.5]], 1.5);
      break;
    case 'horn':
      tone(420, 0, 0.5, 0.25, 9, [[1, 1], [1.26, 0.8], [2, 0.3]], 0.01);
      tone(420, 0.65, 0.5, 0.25, 9, [[1, 1], [1.26, 0.8], [2, 0.3]], 0.01);
      break;
    case 'siren': {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        ph += (2 * Math.PI * (700 + 300 * Math.sin(2 * Math.PI * 0.5 * t))) / rate;
        y[i] = 0.18 * Math.sin(ph) * Math.min(1, t / 0.2, (dur - t) / 0.3);
      }
      break;
    }
    case 'shutter':
      burst(0, 0.05, 0.6, 0.01, 'bright');
      burst(0.12, 0.06, 0.5, 0.012, 'bright');
      break;
    case 'whoosh': {
      const tmp = new Float32Array(n).map(() => R());
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        y[i] = tmp[i] * 0.35 * Math.sin((Math.PI * t) / dur) ** 2;
      }
      return biquad(y, rate, 'bp', 1200, 0.6).map((v) => v * 2.5);
    }
    default:
      break;
  }
  return y;
}

// ------------------------------------------------------------------ rendering

// A clip's sound: cut from its source, given its effect, fades and volume. Kept until it changes.
const cache = new Map<string, Float32Array>();
const clipKey = (c: Clip, srcVer: string) => `${c.src}@${srcVer}|${c.a.toFixed(4)}|${c.b.toFixed(4)}|${c.fx}|${c.fadeIn}|${c.fadeOut}|${c.gain}`;
export function renderClip(c: Clip, src: Float32Array, rate: number, srcVer = ''): Float32Array {
  const key = clipKey(c, srcVer);
  const hit = cache.get(key);
  if (hit) return hit;
  const a = Math.max(0, Math.round(c.a * rate));
  const b = Math.min(src.length, Math.round(c.b * rate));
  let y = src.slice(a, Math.max(a, b));
  const fi = Math.min(y.length, Math.round(Math.max(0.004, c.fadeIn) * rate));
  const fo = Math.min(y.length, Math.round(Math.max(0.004, c.fadeOut) * rate));
  for (let i = 0; i < fi; i++) y[i] *= (i / fi) ** 2;
  for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= (i / fo) ** 2;
  y = applyFx(y, rate, c.fx);
  if (c.gain !== 1) y = y.map((v) => v * c.gain);
  if (cache.size > 400) cache.clear();
  cache.set(key, y);
  return y;
}

// Everything heard together. Sources are by id; tracks that are muted (or not soloed when
// another is) are left out. A soft limit keeps the loudest parts from crackling.
export function mixdown(p: Project, sources: Record<string, Float32Array>, rate: number, versions: Record<string, string> = {}, length?: number): Float32Array {
  const len = Math.ceil((length ?? projectLen(p) + 0.05) * rate) + rate * 2;
  const out = new Float32Array(len);
  const solo = p.tracks.some((t) => t.solo);
  for (const t of p.tracks) {
    if (t.mute || (solo && !t.solo)) continue;
    for (const c of t.clips) {
      const src = sources[c.src];
      if (!src) continue;
      const y = renderClip(c, src, rate, versions[c.src]);
      const o = Math.round(c.at * rate);
      for (let i = 0; i < y.length && o + i < len; i++) if (o + i >= 0) out[o + i] += y[i] * t.gain;
    }
  }
  let end = Math.ceil((length ?? projectLen(p)) * rate);
  // let an echo ring out at the very end
  while (end < len - 1 && Math.abs(out[end]) > 0.0005) end++;
  const mix = out.subarray(0, Math.max(1, end));
  let g = p.gain;
  if (p.loud) {
    let pk = 0;
    for (let i = 0; i < mix.length; i += 2) pk = Math.max(pk, Math.abs(mix[i]));
    if (pk > 0.001) g *= 0.89 / pk;
  }
  const y = new Float32Array(mix.length);
  for (let i = 0; i < mix.length; i++) {
    const v = mix[i] * g;
    y[i] = v > 0.95 ? 0.95 + Math.tanh((v - 0.95) * 8) / 20 : v < -0.95 ? -0.95 + Math.tanh((v + 0.95) * 8) / 20 : v;
  }
  return y;
}

// Rows for clips that overlap in time (sound effects), so each can be seen and grabbed.
export function stackRows(clips: Clip[]): Record<string, number> {
  const rows: number[] = [];
  const out: Record<string, number> = {};
  for (const c of [...clips].sort((x, y) => x.at - y.at)) {
    let r = rows.findIndex((end) => end <= c.at + 0.001);
    if (r < 0) r = rows.length;
    rows[r] = clipEnd(c);
    out[c.id] = r;
  }
  return out;
}
