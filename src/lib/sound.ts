// Sound editing in the browser: trim, volume, background-noise reduction, silence and simple
// sound effects. Sounds are worked on as one channel (mono), which is all speech needs.

export type Effect = 'silence' | 'bell' | 'beep' | 'chime' | 'beeps';
export const EFFECTS: { k: Effect; label: string; dur: number }[] = [
  { k: 'silence', label: 'Silence', dur: 1 },
  { k: 'bell', label: 'Bell', dur: 1.6 },
  { k: 'chime', label: 'Chime', dur: 1.2 },
  { k: 'beep', label: 'Beep', dur: 0.45 },
  { k: 'beeps', label: 'Three beeps', dur: 1.6 },
];
// Something added to the sound: at a time in the original recording, lasting dur seconds.
export type Insert = { id: string; at: number; kind: Effect; dur: number };
export type NoiseLevel = 0 | 1 | 2; // off, light, strong
export type Edit = { start: number; end: number; gain: number; even: boolean; noise: NoiseLevel; inserts: Insert[] };

export async function decodeSound(file: Blob): Promise<AudioBuffer> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

export function toMono(b: AudioBuffer): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0).slice();
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels;
  }
  return out;
}

// The loudest point in each slice, for drawing the sound.
export function peaks(x: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n);
  const step = x.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const a = Math.floor(i * step);
    const b = Math.min(x.length, Math.floor((i + 1) * step));
    for (let k = a; k < b; k++) {
      const v = Math.abs(x[k]);
      if (v > m) m = v;
    }
    out[i] = m;
  }
  return out;
}

// ------------------------------------------------------------------ noise reduction

// A small radix-2 FFT, in place.
function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

// Spectral gating: learn the steady background noise from the quietest moments, then turn each
// frequency down whenever it is no louder than that noise. Rumble below 80 Hz is removed too.
export async function reduceNoise(x: Float32Array, rate: number, level: NoiseLevel, onProgress?: (p: number) => void): Promise<Float32Array> {
  if (!level) return x;
  const N = rate > 32000 ? 2048 : 1024;
  const hop = N / 4;
  const bins = N / 2 + 1;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.max(1, Math.ceil((x.length + N) / hop));
  const pad = new Float32Array(frames * hop + N);
  pad.set(x, N / 2);
  // 1. The noise: the average spectrum of the quietest tenth of the sound.
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < N; i += 4) e += pad[f * hop + i] ** 2;
    energy[f] = e;
  }
  const order = Array.from(energy.keys()).sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(4, Math.floor(frames * 0.1)));
  const noise = new Float64Array(bins);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (const f of quiet) {
    for (let i = 0; i < N; i++) (re[i] = pad[f * hop + i] * win[i]), (im[i] = 0);
    fft(re, im);
    for (let b = 0; b < bins; b++) noise[b] += Math.hypot(re[b], im[b]) / quiet.length;
  }
  const over = level === 2 ? 2.2 : 1.6; // how far above the noise a sound must be to keep
  const floor = level === 2 ? 0.08 : 0.25; // how far the noise is turned down
  const low = Math.ceil((80 / rate) * N);
  // 2. Each frame: a gain for each frequency, smoothed over time to avoid a watery sound.
  const out = new Float64Array(pad.length);
  const norm = new Float64Array(pad.length);
  let prev = new Float64Array(bins).fill(1);
  const g = new Float64Array(bins);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    for (let i = 0; i < N; i++) (re[i] = pad[o + i] * win[i]), (im[i] = 0);
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const m = Math.hypot(re[b], im[b]);
      const target = b < low ? 0 : m > noise[b] * over ? 1 : floor;
      // open quickly, close slowly
      g[b] = target > prev[b] ? prev[b] + (target - prev[b]) * 0.7 : prev[b] + (target - prev[b]) * 0.25;
    }
    const sm = new Float64Array(bins);
    for (let b = 0; b < bins; b++) sm[b] = (g[Math.max(0, b - 1)] + 2 * g[b] + g[Math.min(bins - 1, b + 1)]) / 4;
    prev = g.slice();
    for (let b = 0; b < bins; b++) {
      re[b] *= sm[b];
      im[b] *= sm[b];
      if (b > 0 && b < N / 2) (re[N - b] = re[b]), (im[N - b] = -im[b]);
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      out[o + i] += re[i] * win[i];
      norm[o + i] += win[i] * win[i];
    }
    if (f % 200 === 0) {
      onProgress?.(f / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const k = i + N / 2;
    y[i] = norm[k] > 1e-6 ? out[k] / norm[k] : 0;
  }
  onProgress?.(1);
  return y;
}

// ------------------------------------------------------------------ sound effects

export function effect(kind: Effect, rate: number, dur: number): Float32Array {
  const n = Math.round(dur * rate);
  const y = new Float32Array(n);
  const tone = (f: number, from: number, len: number, amp: number, decay: number, partials: [number, number][] = [[1, 1]]) => {
    const a = Math.round(from * rate);
    const m = Math.min(n - a, Math.round(len * rate));
    for (let i = 0; i < m; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
      let v = 0;
      for (const [mul, w] of partials) v += w * Math.sin(2 * Math.PI * f * mul * t);
      y[a + i] += amp * env * v;
    }
  };
  if (kind === 'bell')
    tone(784, 0, dur, 0.32, 0.5, [
      [1, 1],
      [2.76, 0.45],
      [5.4, 0.25],
      [8.93, 0.12],
    ]);
  else if (kind === 'chime') {
    tone(1318.5, 0, 0.8, 0.3, 0.35, [[1, 1], [2, 0.2]]);
    tone(1046.5, 0.38, 0.82, 0.3, 0.4, [[1, 1], [2, 0.2]]);
  } else if (kind === 'beep' || kind === 'beeps') {
    const beep = (from: number) => {
      const a = Math.round(from * rate);
      const m = Math.min(n - a, Math.round(0.22 * rate));
      for (let i = 0; i < m; i++) {
        const t = i / rate;
        const env = Math.min(1, t / 0.008, (0.22 - t) / 0.008);
        y[a + i] += 0.28 * env * Math.sin(2 * Math.PI * 1000 * t);
      }
    };
    if (kind === 'beep') beep(0.1);
    else [0.1, 0.6, 1.1].forEach(beep);
  }
  return y; // silence stays at zero
}

// ------------------------------------------------------------------ the finished sound

const peakOf = (x: Float32Array, a = 0, b = x.length) => {
  let m = 0;
  for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
};

// Trim, set the volume, then add silence and effects. Times are seconds in the original sound.
export function assemble(x: Float32Array, rate: number, e: Edit): Float32Array {
  const a = Math.max(0, Math.round(e.start * rate));
  const b = Math.min(x.length, Math.round(e.end * rate));
  let g = e.gain;
  if (e.even) {
    const p = peakOf(x, a, b);
    if (p > 0.001) g *= 0.89 / p; // the loudest moment just below the top
  }
  const inserts = [...e.inserts].sort((p, q) => p.at - q.at);
  const parts: Float32Array[] = [];
  let pos = a;
  const body = (to: number) => {
    if (to <= pos) return;
    const s = new Float32Array(to - pos);
    for (let i = 0; i < s.length; i++) {
      const v = x[pos + i] * g;
      s[i] = v > 0.95 ? 0.95 + Math.tanh((v - 0.95) * 8) / 20 : v < -0.95 ? -0.95 + Math.tanh((v + 0.95) * 8) / 20 : v; // soft limit, no harsh clipping
    }
    parts.push(s);
    pos = to;
  };
  for (const ins of inserts) {
    const at = Math.max(a, Math.min(b, Math.round(ins.at * rate)));
    body(at);
    parts.push(effect(ins.kind, rate, ins.dur));
  }
  body(b);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
}

// Where a moment of the original sound is in the finished one (for script timings).
export function mapTime(t: number, e: Edit): number | null {
  if (t < e.start - 0.05 || t > e.end) return null;
  let out = Math.max(0, t - e.start);
  for (const ins of e.inserts) if (Math.max(e.start, Math.min(e.end, ins.at)) <= t) out += ins.dur;
  return +out.toFixed(2);
}

export const finishedLength = (e: Edit) => Math.max(0, e.end - e.start) + e.inserts.reduce((s, i) => s + i.dur, 0);

// A loudness reading, in decibels below the top (0 is as loud as can be recorded).
export const dbOf = (rms: number) => (rms > 0 ? 20 * Math.log10(rms) : -100);

export function bufferOf(x: Float32Array, rate: number): AudioBuffer {
  const b = new AudioBuffer({ length: Math.max(1, x.length), numberOfChannels: 1, sampleRate: rate });
  b.copyToChannel(x, 0);
  return b;
}

export const fmtTime = (s: number) => {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
