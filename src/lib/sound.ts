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
// cuts: stretches taken out of the middle; fades: seconds at each end of the finished sound.
export type Cut = { id: string; a: number; b: number };
export type Edit = { start: number; end: number; gain: number; even: boolean; noise: NoiseLevel; inserts: Insert[]; cuts?: Cut[]; fadeIn?: number; fadeOut?: number; echo?: NoiseLevel };

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
  const hop = N / 2; // half-overlapping frames with a square-root window: half the work of quarter steps
  const bins = N / 2 + 1;
  const win = new Float64Array(N).map((_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)));
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
    if (f % 400 === 0) {
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

// The parts of the original that are kept: from start to end, without the cuts.
export function keptRanges(e: Edit): [number, number][] {
  const cuts = [...(e.cuts ?? [])].map((c) => [Math.max(e.start, Math.min(c.a, c.b)), Math.min(e.end, Math.max(c.a, c.b))] as [number, number]).filter(([a, b]) => b - a > 0.005).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let pos = e.start;
  for (const [a, b] of cuts) {
    if (b <= pos) continue;
    if (a > pos) out.push([pos, a]);
    pos = Math.max(pos, b);
  }
  if (e.end > pos) out.push([pos, e.end]);
  return out;
}

// The finished sound as pieces: stretches of the original (body) and what was added (ins).
type Seg = { kind: 'body' | 'ins'; s0: number; s1: number; o0: number; len: number; ins?: Insert };
export function timeline(e: Edit): Seg[] {
  const ranges = keptRanges(e);
  // Something added inside a cut goes where the cut was.
  const place = (t: number) => {
    for (const [a, b] of ranges) if (t >= a - 1e-6 && t <= b + 1e-6) return Math.max(a, Math.min(b, t));
    const next = ranges.find(([a]) => a >= t);
    return next ? next[0] : ranges.length ? ranges[ranges.length - 1][1] : e.start;
  };
  // Each added sound belongs to the first kept part that holds its moment.
  const ins = [...e.inserts]
    .map((i) => {
      const at = place(i.at);
      const r = Math.max(0, ranges.findIndex(([a, b]) => at >= a - 1e-6 && at <= b + 1e-6));
      return { i, at, r };
    })
    .sort((p, q) => p.r - q.r || p.at - q.at);
  const segs: Seg[] = [];
  let out = 0;
  const addIns = (x: (typeof ins)[number]) => {
    segs.push({ kind: 'ins', s0: x.at, s1: x.at, o0: out, len: x.i.dur, ins: x.i });
    out += x.i.dur;
  };
  ranges.forEach(([a, b], r) => {
    let pos = a;
    for (const x of ins.filter((y) => y.r === r)) {
      if (x.at > pos) segs.push({ kind: 'body', s0: pos, s1: x.at, o0: out, len: x.at - pos }), (out += x.at - pos), (pos = x.at);
      addIns(x);
    }
    if (b > pos) segs.push({ kind: 'body', s0: pos, s1: b, o0: out, len: b - pos }), (out += b - pos);
  });
  if (!ranges.length) ins.forEach(addIns);
  return segs;
}

// Trim, cut, set the volume, add silence and effects, then fade the ends.
export function assemble(x: Float32Array, rate: number, e: Edit): Float32Array {
  const segs = timeline(e);
  let g = e.gain;
  if (e.even) {
    let p = 0;
    for (const s of segs) if (s.kind === 'body') p = Math.max(p, peakOf(x, Math.round(s.s0 * rate), Math.min(x.length, Math.round(s.s1 * rate))));
    if (p > 0.001) g *= 0.89 / p; // the loudest moment just below the top
  }
  const parts: Float32Array[] = [];
  for (const s of segs) {
    if (s.kind === 'ins') {
      parts.push(effect(s.ins!.kind, rate, s.ins!.dur));
      continue;
    }
    const a = Math.max(0, Math.round(s.s0 * rate));
    const b = Math.min(x.length, Math.round(s.s1 * rate));
    if (b <= a) continue;
    const part = new Float32Array(b - a);
    for (let i = 0; i < part.length; i++) {
      const v = x[a + i] * g;
      part[i] = v > 0.95 ? 0.95 + Math.tanh((v - 0.95) * 8) / 20 : v < -0.95 ? -0.95 + Math.tanh((v + 0.95) * 8) / 20 : v; // soft limit, no harsh clipping
    }
    // A few milliseconds of fade where a cut joins two parts, so there is no click.
    const f = Math.min(Math.round(0.006 * rate), part.length >> 1);
    if (parts.length) for (let i = 0; i < f; i++) part[i] *= i / f;
    if (s !== segs[segs.length - 1]) for (let i = 0; i < f; i++) part[part.length - 1 - i] *= i / f;
    parts.push(part);
  }
  const total = parts.reduce((t, p) => t + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  const fi = Math.min(total, Math.round((e.fadeIn ?? 0) * rate));
  const fo = Math.min(total, Math.round((e.fadeOut ?? 0) * rate));
  for (let i = 0; i < fi; i++) out[i] *= (i / fi) ** 2;
  for (let i = 0; i < fo; i++) out[total - 1 - i] *= (i / fo) ** 2;
  return out;
}

// A moment of the original → the same moment in the finished sound (before anything added there).
export function toOut(t: number, e: Edit) {
  const segs = timeline(e);
  if (t <= e.start) return 0;
  for (const g of segs) if (g.kind === 'body' && t >= g.s0 && t <= g.s1) return g.o0 + (t - g.s0);
  const next = segs.find((g) => g.kind === 'body' && g.s0 >= t);
  if (next) return next.o0;
  const last = segs[segs.length - 1];
  return last ? last.o0 + last.len : 0;
}
// Where a moment of the original is in the finished one (for script timings).
export function mapTime(t: number, e: Edit): number | null {
  if (t < e.start - 0.05 || t > e.end) return null;
  return +toOut(Math.max(e.start, t), e).toFixed(2);
}
// A moment of the finished sound → where it is in the original, and what added sound is playing.
export function toSrc(o: number, e: Edit): { t: number; ins?: Insert } {
  for (const g of timeline(e)) if (o >= g.o0 && o < g.o0 + g.len) return g.kind === 'body' ? { t: g.s0 + (o - g.o0) } : { t: g.s0, ins: g.ins };
  return { t: e.end };
}

export const finishedLength = (e: Edit) => timeline(e).reduce((s, g) => s + g.len, 0);

// ------------------------------------------------------------------ room echo

// Room echo is the sound still ringing after each word. A downward expander follows the voice and
// turns down whatever is much quieter than what was just said, so the tails fade faster.
export function reduceEcho(x: Float32Array, rate: number, level: NoiseLevel): Float32Array {
  if (!level) return x;
  const y = new Float32Array(x.length);
  const att = Math.exp(-1 / (0.002 * rate));
  const rel = Math.exp(-1 / (0.05 * rate));
  const hold = Math.exp(-1 / (0.35 * rate)); // how long "what was just said" is remembered
  const k = level === 2 ? 0.32 : 0.2; // below this share of the recent voice counts as echo
  const ratio = level === 2 ? 3 : 2;
  const floor = level === 2 ? 0.08 : 0.2;
  const gAtt = Math.exp(-1 / (0.001 * rate));
  const gRel = Math.exp(-1 / (0.03 * rate));
  let env = 0;
  let recent = 0;
  let gain = 1;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    env = v > env ? att * env + (1 - att) * v : rel * env + (1 - rel) * v;
    recent = env > recent ? env : hold * recent + (1 - hold) * env;
    const thr = recent * k;
    const target = env >= thr || thr < 1e-4 ? 1 : Math.max(floor, (env / thr) ** (ratio - 1));
    gain = target > gain ? gAtt * gain + (1 - gAtt) * target : gRel * gain + (1 - gRel) * target;
    y[i] = x[i] * gain;
  }
  return y;
}

// ------------------------------------------------------------------ drawing at any zoom

// Loudest and quietest values in blocks of 128 samples, so a long sound draws quickly at any zoom.
export type PeakIndex = { block: number; max: Float32Array; min: Float32Array };
export function peakIndex(x: Float32Array, block = 128): PeakIndex {
  const n = Math.ceil(x.length / block);
  const max = new Float32Array(n);
  const min = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let hi = -1;
    let lo = 1;
    const end = Math.min(x.length, (b + 1) * block);
    for (let i = b * block; i < end; i++) {
      const v = x[i];
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    max[b] = hi;
    min[b] = lo;
  }
  return { block, max, min };
}
export function rangePeak(x: Float32Array, idx: PeakIndex, a: number, b: number): [number, number] {
  a = Math.max(0, Math.floor(a));
  b = Math.min(x.length, Math.ceil(b));
  let hi = 0;
  let lo = 0;
  if (b - a < idx.block * 3) {
    for (let i = a; i < b; i++) (hi = Math.max(hi, x[i])), (lo = Math.min(lo, x[i]));
    return [lo, hi];
  }
  const ba = Math.ceil(a / idx.block);
  const bb = Math.floor(b / idx.block);
  for (let i = a; i < ba * idx.block; i++) (hi = Math.max(hi, x[i])), (lo = Math.min(lo, x[i]));
  for (let k = ba; k < bb; k++) (hi = Math.max(hi, idx.max[k])), (lo = Math.min(lo, idx.min[k]));
  for (let i = bb * idx.block; i < b; i++) (hi = Math.max(hi, x[i])), (lo = Math.min(lo, x[i]));
  return [lo, hi];
}

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
