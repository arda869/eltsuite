import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bufferOf, decodeSound, peakIndex, rangePeak, reduceEcho, toMono, type NoiseLevel, type PeakIndex } from '../lib/sound';
import { samplesOf, sfxSamples, useMySfx, type MySfx } from '../lib/sfxAudio';
import { clipEnd, clipLen, mixdown, projectLen, renderClip, SFX, stackRows, VOICE_FX, type Clip, type Line, type Project, type Track, type VoiceFx } from '../lib/mix';
import { encodeMp3, SOUND_QUALITY, storedPerMinute, type SoundQuality } from '../lib/audioEncode';
import { cleanNoise } from '../lib/soundJobs';
import { archiveAdd, formatBytes, saveSound, type ScriptLine } from '../lib/archive';
import { useAuth } from '../lib/auth';
import { newId } from '../lib/tasks';
import { UiIcon } from '../components/UiIcon';

// The Sound editor, laid out like audio software. Voice tracks hold clips: split them (Ctrl B),
// move them, trim their edges, drag their top corners to fade, and give each its own volume and
// voice effect (on the phone, radio, far away…). A lane below holds sound effects, which may
// overlap. The script lane holds lines with a start and an end, which never overlap. Bring in
// more files, or record a new track while the others play. Undo, and the usual shortcuts.

// extra: more tracks to start with (a recording session: one per person), each at its own time.
export type SoundSource = { buffer: AudioBuffer; name: string; marks?: number[]; script?: string[]; roomDb?: number; recorded?: boolean; file?: File; extra?: { name: string; buffer: AudioBuffer; at: number }[]; at?: number };
export type SavedSound = { mediaId: string; archiveId: string; title: string; script: ScriptLine[] };
export type Use = { cls: string; lesson: string; task: string };
export type ReplaceTarget = { name: string; uses: () => Promise<Use[]>; run: (blob: Blob, meta: { script: ScriptLine[]; duration: number }, onProgress: (p: number) => void) => Promise<void> };

const savedQ = (): SoundQuality => {
  try {
    const q = localStorage.getItem('ll.soundQuality');
    return q === 'clear' || q === 'small' ? q : 'standard';
  } catch {
    return 'standard';
  }
};
const clock = (s: number) => {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
};
const short = (s: number) => {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};
const HEAD_W = 168; // the track names on the left
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
type Progress = { stage: string; p: number };
type Pick = { kind: 'clip'; track: string; id: string } | { kind: 'line'; id: string } | { kind: 'track'; id: string } | null;

const newTrack = (name: string, kind: Track['kind'] = 'voice'): Track => ({ id: newId(), name, kind, clips: [], gain: 1, mute: false, solo: false, noise: 0, echo: 0 });

export function SoundEditor({ source, classId, onSaved, onBack, backLabel, folder = '', replace }: { source: SoundSource; classId: string; onSaved: (s: SavedSound) => void; onBack: () => void; backLabel: string; folder?: string; replace?: ReplaceTarget }) {
  const { user } = useAuth();
  const rate = source.buffer.sampleRate;

  // ------------------------------------------------------------ sources (the raw sounds)
  const sources = useRef<Record<string, Float32Array>>({});
  const names = useRef<Record<string, string>>({});
  const [srcVer, bumpSrc] = useState(0);
  const mySfx = useMySfx();
  const addSource = (id: string, data: Float32Array, name: string) => {
    sources.current[id] = data;
    names.current[id] = name;
    bumpSrc((n) => n + 1);
  };
  const first = useMemo(() => {
    const d = toMono(source.buffer);
    sources.current.main = d;
    names.current.main = source.name;
    return d;
  }, [source.buffer, source.name]);
  const length0 = first.length / rate;

  // ------------------------------------------------------------ the project, with undo
  const initial = useMemo<Project>(() => {
    const voice = { ...newTrack(source.extra || source.at !== undefined ? source.name : source.recorded ? 'Recording' : 'Voice'), clips: [{ id: newId(), src: 'main', a: 0, b: length0, at: source.at ?? 0, gain: 1, fx: '' as VoiceFx, fadeIn: 0, fadeOut: 0 }], noise: (source.roomDb !== undefined && source.roomDb > -50 ? 1 : 0) as 0 | 1 };
    const marks = source.marks ?? [];
    const texts = source.script ?? [];
    const lines: Line[] = texts.map((text, i) => {
      const a = Number.isFinite(marks[i]) ? marks[i] : (length0 * i) / Math.max(1, texts.length);
      const nextT = marks.slice(i + 1).find((m) => Number.isFinite(m));
      const b = Math.min(nextT ?? length0, a + 12, length0);
      const sp = /^\s*([A-Z][\p{L} .'-]{0,18}?)\s*:\s+(.+)$/u.exec(text);
      return { id: newId(), text: sp ? sp[2] : text, who: sp ? sp[1] : undefined, a, b: Math.max(a + 0.3, b) };
    });
    const extras = (source.extra ?? []).map((x, i) => {
      const id = 'extra' + i;
      sources.current[id] = toMono(x.buffer);
      names.current[id] = x.name;
      return { ...newTrack(x.name), clips: [{ id: newId(), src: id, a: 0, b: x.buffer.duration, at: x.at, gain: 1, fx: '' as VoiceFx, fadeIn: 0, fadeOut: 0 }] };
    });
    return { tracks: [voice, ...extras, newTrack('Sound effects', 'sfx')], lines, gain: 1, loud: false };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [p, setP] = useState<Project>(initial);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastGroup = useRef({ g: '', t: 0 });
  const [, tick] = useState(0);
  const edit = useCallback((f: (x: Project) => Project, group?: string) => {
    setP((cur) => {
      const next = f(cur);
      if (next === cur) return cur;
      const now = performance.now();
      if (!group || lastGroup.current.g !== group || now - lastGroup.current.t > 900) past.current.push(cur), (future.current = []);
      lastGroup.current = { g: group ?? '', t: now };
      if (past.current.length > 150) past.current.shift();
      return next;
    });
    tick((n) => n + 1);
  }, []);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(p);
    setP(prev);
    tick((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(p);
    setP(next);
    tick((n) => n + 1);
  };
  const setClip = (tid: string, cid: string, patch: Partial<Clip>, group?: string) => edit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id !== tid ? t : { ...t, clips: t.clips.map((c) => (c.id === cid ? { ...c, ...patch } : c)) })) }), group);
  const setTrack = (tid: string, patch: Partial<Track>, group?: string) => edit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }), group);
  const setLine = (id: string, patch: Partial<Line>, group?: string) => edit((x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), group);

  // ------------------------------------------------------------ cleaning a track (noise, echo)
  const cleaned = useRef<Record<string, Float32Array>>({});
  const cleaning = useRef<Record<string, boolean>>({});
  const [cleanBusy, setCleanBusy] = useState('');
  const variant = (src: string, noise: 0 | 1 | 2, echo: 0 | 1 | 2) => `${src}~${noise}${echo}`;
  // The sounds as heard: each track's sources with its noise and echo settings.
  const heard = useMemo(() => {
    const out: Record<string, Float32Array> = { ...sources.current };
    const tracks = p.tracks.map((t) => {
      if (!t.noise && !t.echo) return t;
      return {
        ...t,
        clips: t.clips.map((c) => {
          const key = variant(c.src, t.noise, t.echo);
          const raw = sources.current[c.src];
          if (!raw) return c;
          if (!cleaned.current[key]) {
            const noiseKey = variant(c.src, t.noise, 0);
            const denoised = t.noise ? cleaned.current[noiseKey] : raw;
            if (t.noise && !denoised && !cleaning.current[noiseKey]) {
              cleaning.current[noiseKey] = true;
              setCleanBusy('Cleaning up the sound…');
              void cleanNoise(raw, rate, t.noise as NoiseLevel, (q) => setCleanBusy(`Cleaning up the sound… ${Math.round(q * 100)}%`)).then((y) => {
                cleaned.current[noiseKey] = y;
                setCleanBusy('');
                bumpSrc((n) => n + 1);
              });
            }
            if (denoised) cleaned.current[key] = t.echo ? reduceEcho(denoised, rate, t.echo as NoiseLevel) : denoised;
          }
          if (!cleaned.current[key]) return c;
          out[key] = cleaned.current[key];
          return { ...c, src: key };
        }),
      };
    });
    return { sources: out, project: { ...p, tracks } };
  }, [p, srcVer, rate]);
  const mix = useMemo(() => mixdown(heard.project, heard.sources, rate), [heard, rate]);
  const total = Math.max(projectLen(p), 0.2);

  // ------------------------------------------------------------ playing
  const [head, setHead] = useState(0);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [pick, setPick] = useState<Pick>(null);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [meter, setMeter] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const node = useRef<{ src: AudioBufferSourceNode; an: AnalyserNode; at: number; from: number; until?: number } | null>(null);
  const ac = () => (ctx.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
  const stop = () => {
    try {
      node.current?.src.stop();
    } catch {
      /* stopped */
    }
    node.current = null;
    setPlaying(false);
    setMeter(0);
  };
  useEffect(() => () => (stop(), void ctx.current?.close()), []);
  const playFrom = (t: number, until?: number, buf = mix) => {
    stop();
    const c = ac();
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = bufferOf(buf, rate);
    const an = c.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    an.connect(c.destination);
    const len = buf.length / rate;
    const from = t >= len - 0.05 ? 0 : Math.max(0, t);
    src.start(0, from);
    src.onended = () => node.current?.src === src && stop();
    node.current = { src, an, at: c.currentTime, from, until };
    setPlaying(true);
  };
  // A change while playing is heard straight away.
  const mixRef = useRef(mix);
  useEffect(() => {
    if (mixRef.current !== mix && playing && node.current) playFrom(head, node.current.until, mix);
    mixRef.current = mix;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mix]);
  const loopRef = useRef({ loop, sel });
  loopRef.current = { loop, sel };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const buf = new Float32Array(1024);
    const step = () => {
      const n = node.current;
      if (n && ctx.current) {
        const t = n.from + (ctx.current.currentTime - n.at);
        setHead(t);
        n.an.getFloatTimeDomainData(buf);
        let pk = 0;
        for (const v of buf) pk = Math.max(pk, Math.abs(v));
        setMeter((m) => Math.max(pk, m * 0.9));
        if (n.until !== undefined && t >= n.until) {
          const { loop: lp, sel: s } = loopRef.current;
          if (lp && s) playFrom(s.a, s.b);
          else stop();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const toggle = () => (playing ? stop() : sel && loop ? playFrom(sel.a, sel.b) : playFrom(head >= total - 0.05 ? 0 : head));
  const nudge = (d: number) => {
    const t = Math.max(0, Math.min(total, head + d));
    setHead(t);
    if (playing) playFrom(t);
  };

  // ------------------------------------------------------------ editing actions
  const found = (pk: Pick) => (pk?.kind === 'clip' ? p.tracks.find((t) => t.id === pk.track)?.clips.find((c) => c.id === pk.id) ?? null : null);
  const pickedClip = found(pick);
  const pickedTrack = pick?.kind === 'clip' || pick?.kind === 'track' ? p.tracks.find((t) => t.id === (pick.kind === 'clip' ? pick.track : pick.id)) ?? null : null;
  const pickedLine = pick?.kind === 'line' ? p.lines.find((l) => l.id === pick.id) ?? null : null;
  // Ctrl B: split the chosen clip (or every clip under the playhead) at the playhead.
  const split = () => {
    const t = head;
    edit((x) => ({
      ...x,
      tracks: x.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips.flatMap((c) => {
          if (pickedClip && c.id !== pickedClip.id) return [c];
          if (!(t > c.at + 0.02 && t < clipEnd(c) - 0.02)) return [c];
          const cut = c.a + (t - c.at);
          return [
            { ...c, b: cut, fadeOut: 0 },
            { ...c, id: newId(), a: cut, at: t, fadeIn: 0 },
          ];
        }),
      })),
    }));
  };
  // Silence at the playhead pushes everything after it along, and shows as its own clip.
  const insertSilence = (d: number) => {
    const t = head;
    if (!sources.current.silence) addSource('silence', new Float32Array(Math.round(rate * 120)), 'Silence');
    const target = pickedTrack?.kind === 'voice' ? pickedTrack.id : p.tracks.find((tr) => tr.kind === 'voice')?.id;
    const sil: Clip = { id: newId(), src: 'silence', a: 0, b: d, at: t, gain: 1, fx: '', fadeIn: 0, fadeOut: 0 };
    edit((x) => ({
      ...x,
      tracks: x.tracks.map((tr) => ({
        ...tr,
        clips: [
          ...tr.clips.flatMap((c) => {
            if (clipEnd(c) <= t + 1e-6) return [c];
            if (c.at >= t - 1e-6) return [{ ...c, at: c.at + d }];
            const cut = c.a + (t - c.at);
            return [
              { ...c, b: cut, fadeOut: 0 },
              { ...c, id: newId(), a: cut, at: t + d, fadeIn: 0 },
            ];
          }),
          ...(tr.id === target ? [sil] : []),
        ],
      })),
      lines: x.lines.map((l) => (l.a >= t ? { ...l, a: l.a + d, b: l.b + d } : l.b > t ? { ...l, b: l.b + d } : l)),
    }));
    if (target) setPick({ kind: 'clip', track: target, id: sil.id });
  };
  const [silLen, setSilLen] = useState(1);
  const removePicked = () => {
    // Taking out a silence closes the gap it made.
    if (pick?.kind === 'clip' && pickedClip?.src === 'silence') {
      const a = pickedClip.at;
      const d = clipLen(pickedClip);
      edit((x) => ({
        ...x,
        tracks: x.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== pickedClip.id).map((c) => (c.at >= a + d - 1e-6 ? { ...c, at: c.at - d } : c)) })),
        lines: x.lines.map((l) => (l.a >= a + d - 1e-6 ? { ...l, a: l.a - d, b: l.b - d } : l)),
      }));
      setPick(null);
      return;
    }
    if (pick?.kind === 'clip') edit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === pick.track ? { ...t, clips: t.clips.filter((c) => c.id !== pick.id) } : t)) }));
    else if (pick?.kind === 'line') edit((x) => ({ ...x, lines: x.lines.filter((l) => l.id !== pick.id) }));
    else if (pick?.kind === 'track' && p.tracks.filter((t) => t.kind === 'voice').length > 1 && pickedTrack?.kind === 'voice') edit((x) => ({ ...x, tracks: x.tracks.filter((t) => t.id !== pick.id) }));
    setPick(null);
  };
  const duplicate = () => {
    if (!pickedClip || pick?.kind !== 'clip') return;
    const copy = { ...pickedClip, id: newId(), at: clipEnd(pickedClip) };
    edit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === pick.track ? { ...t, clips: [...t.clips, copy] } : t)) }));
    setPick({ kind: 'clip', track: pick.track, id: copy.id });
  };
  // Take a stretch out of everything (clips and lines), closing the gap.
  const cutRange = (a: number, b: number) => {
    const d = b - a;
    if (d < 0.02) return;
    edit((x) => ({
      ...x,
      tracks: x.tracks.map((t) => ({
        ...t,
        clips: t.clips.flatMap((c) => {
          const s = c.at;
          const e = clipEnd(c);
          if (e <= a) return [c];
          if (s >= b) return [{ ...c, at: c.at - d }];
          const out: Clip[] = [];
          if (s < a) out.push({ ...c, b: c.a + (a - s), fadeOut: 0 });
          if (e > b) out.push({ ...c, id: newId(), a: c.a + (b - s), at: a, fadeIn: 0 });
          return out;
        }),
      })),
      lines: x.lines.flatMap((l) => (l.b <= a ? [l] : l.a >= b ? [{ ...l, a: l.a - d, b: l.b - d }] : l.a < a && l.b > b ? [{ ...l, b: l.b - d }] : l.a < a ? [{ ...l, b: a }] : l.b > b ? [{ ...l, a, b: l.b - d }] : [])),
    }));
    setHead(a);
    setSel(null);
  };
  const keepRange = (a: number, b: number) => {
    const end = total;
    edit((x) => x); // one undo step for both
    cutRange(b, end + 1);
    cutRange(0, a);
  };
  // In the chosen clip: the quiet start and end trimmed; long pauses shortened to half a second.
  const speechIn = (c: Clip) => {
    const src = heard.sources[c.src] ?? sources.current[c.src];
    if (!src) return [] as [number, number][];
    const win = Math.round(0.02 * rate);
    let pk = 0;
    for (let i = Math.round(c.a * rate); i < Math.round(c.b * rate); i += 4) pk = Math.max(pk, Math.abs(src[i] ?? 0));
    const thr = Math.max(0.015, pk * 0.06);
    const parts: [number, number][] = [];
    let on = -1;
    let quiet = 0;
    for (let i = Math.round(c.a * rate); i < Math.round(c.b * rate); i += win) {
      let m = 0;
      for (let k = i; k < Math.min(src.length, i + win); k++) m = Math.max(m, Math.abs(src[k]));
      if (m >= thr) {
        if (on < 0) on = i;
        quiet = 0;
      } else if (on >= 0 && (quiet += win) > 1.2 * rate) {
        parts.push([on / rate, (i - quiet + win) / rate]);
        on = -1;
        quiet = 0;
      }
    }
    if (on >= 0) parts.push([on / rate, Math.min(c.b, (Math.round(c.b * rate) - quiet) / rate)]);
    return parts;
  };
  const trimQuiet = () => {
    if (!pickedClip || pick?.kind !== 'clip') return;
    const s = speechIn(pickedClip);
    if (!s.length) return;
    const a = Math.max(pickedClip.a, s[0][0] - 0.25);
    const b = Math.min(pickedClip.b, s[s.length - 1][1] + 0.35);
    setClip(pick.track, pickedClip.id, { a, b, at: pickedClip.at + (a - pickedClip.a) });
  };
  const [tightened, setTightened] = useState<number | null>(null);
  const tighten = () => {
    if (!pickedClip || pick?.kind !== 'clip') return;
    const s = speechIn(pickedClip);
    if (s.length < 2) return setTightened(0);
    let at = pickedClip.at + Math.max(0, s[0][0] - 0.25 - pickedClip.a);
    const parts: Clip[] = s.map(([a, b], i) => {
      const a2 = Math.max(pickedClip.a, a - 0.25);
      const b2 = Math.min(pickedClip.b, b + 0.25);
      const c = { ...pickedClip, id: i ? newId() : pickedClip.id, a: a2, b: b2, at, fadeIn: i ? 0.01 : pickedClip.fadeIn, fadeOut: i < s.length - 1 ? 0.01 : pickedClip.fadeOut };
      at += b2 - a2;
      return c;
    });
    const shift = clipEnd(pickedClip) - at;
    edit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id !== pick.track ? t : { ...t, clips: [...t.clips.filter((c) => c.id !== pickedClip.id).map((c) => (c.at >= clipEnd(pickedClip) - 0.01 ? { ...c, at: c.at - shift } : c)), ...parts] })) }));
    setTightened(s.length - 1);
  };
  // Sound effects go on their lane at the playhead.
  const addSfx = async (k: string) => {
    const mine = k.startsWith('u:') ? mySfx.find((x) => 'u:' + x.id === k) : null;
    const fx = mine ? { k, label: mine.label, dur: mine.dur, def: undefined as number | undefined } : SFX.find((s) => s.k === k);
    if (!fx) return;
    const id = 'sfx:' + k;
    let len = fx.def ?? fx.dur;
    if (!sources.current[id]) {
      const got = mine ? { data: await samplesOf(mine.data, rate), recorded: true } : await sfxSamples(k, rate, fx.dur);
      addSource(id, got.data, fx.label);
      if (got.recorded && !fx.def) len = got.data.length / rate;
    } else if (!fx.def) len = sources.current[id].length / rate;
    let lane = p.tracks.find((t) => t.kind === 'sfx');
    const clip: Clip = { id: newId(), src: id, a: 0, b: len, at: head, gain: 1, fx: '', fadeIn: 0, fadeOut: 0 };
    edit((x) => {
      let tracks = x.tracks;
      if (!lane) (lane = newTrack('Sound effects', 'sfx')), (tracks = [...tracks, lane]);
      return { ...x, tracks: tracks.map((t) => (t.id === lane!.id ? { ...t, clips: [...t.clips, clip] } : t)) };
    });
    setPick({ kind: 'clip', track: lane!.id, id: clip.id });
  };
  const hearSfx = async (k: string) => {
    const mine = k.startsWith('u:') ? mySfx.find((x) => 'u:' + x.id === k) : null;
    const fx = SFX.find((s) => s.k === k);
    if (!fx && !mine) return;
    stop();
    const c = ac();
    void c.resume();
    const s = c.createBufferSource();
    const data = mine ? await samplesOf(mine.data, rate) : (await sfxSamples(k, rate, fx!.def ?? fx!.dur)).data;
    s.buffer = bufferOf(fx?.def ? data.slice(0, Math.round(fx.def * rate)) : data, rate);
    s.connect(c.destination);
    s.start();
  };
  // A script line at the playhead, up to 3 s, never over another line.
  const addLine = () => {
    const a = head;
    if (p.lines.some((l) => a >= l.a && a < l.b)) return;
    const next = p.lines.filter((l) => l.a > a).sort((x, y) => x.a - y.a)[0];
    const b = Math.min(a + 3, next ? next.a : a + 3);
    if (b - a < 0.2) return;
    const line: Line = { id: newId(), text: '', a, b };
    edit((x) => ({ ...x, lines: [...x.lines, line] }));
    setPick({ kind: 'line', id: line.id });
    setTimeout(() => document.querySelector<HTMLInputElement>('.sx-line-text')?.focus(), 30);
  };
  // More files: each comes in on a track of its own, at the playhead.
  const fileIn = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState('');
  const importFiles = async (files: FileList) => {
    for (const f of Array.from(files)) {
      setImportBusy(`Opening ${f.name}…`);
      try {
        const b = await decodeSound(f);
        let d = toMono(b);
        if (b.sampleRate !== rate) {
          const off = new OfflineAudioContext(1, Math.ceil((d.length / b.sampleRate) * rate), rate);
          const s = off.createBufferSource();
          s.buffer = bufferOf(d, b.sampleRate);
          s.connect(off.destination);
          s.start();
          d = (await off.startRendering()).getChannelData(0).slice();
        }
        const id = newId();
        const name = f.name.replace(/\.[a-z0-9]+$/i, '');
        addSource(id, d, name);
        const tr = { ...newTrack(name), clips: [{ id: newId(), src: id, a: 0, b: d.length / rate, at: head, gain: 1, fx: '' as VoiceFx, fadeIn: 0, fadeOut: 0 }] };
        edit((x) => ({ ...x, tracks: [...x.tracks.filter((t) => t.kind === 'voice'), tr, ...x.tracks.filter((t) => t.kind !== 'voice')] }));
      } catch {
        setImportBusy(`${f.name} could not be opened as a sound.`);
        return;
      }
    }
    setImportBusy('');
  };
  // Record a new track while everything else plays (wear headphones).
  const [rec, setRec] = useState<{ at: number; started: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [recError, setRecError] = useState('');
  const startRec = async () => {
    setRecError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: false, channelCount: 1 } });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      const at = head;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const b = await decodeSound(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
          let d = toMono(b);
          if (b.sampleRate !== rate) {
            const off = new OfflineAudioContext(1, Math.ceil((d.length / b.sampleRate) * rate), rate);
            const s = off.createBufferSource();
            s.buffer = bufferOf(d, b.sampleRate);
            s.connect(off.destination);
            s.start();
            d = (await off.startRendering()).getChannelData(0).slice();
          }
          // Recording starts a moment after pressing; line it up with what was playing.
          const latency = Math.min(0.25, (ctx.current?.baseLatency ?? 0) + (ctx.current?.outputLatency ?? 0.05));
          const id = newId();
          const n = p.tracks.filter((t) => t.kind === 'voice').length + 1;
          addSource(id, d, `Recording ${n}`);
          const tr = { ...newTrack(`Recording ${n}`), clips: [{ id: newId(), src: id, a: Math.min(latency, d.length / rate), b: d.length / rate, at, gain: 1, fx: '' as VoiceFx, fadeIn: 0, fadeOut: 0 }] };
          edit((x) => ({ ...x, tracks: [...x.tracks.filter((t) => t.kind === 'voice'), tr, ...x.tracks.filter((t) => t.kind !== 'voice')] }));
        } catch {
          setRecError('The recording could not be read. Try again.');
        }
      };
      playFrom(at);
      r.start(250);
      recorder.current = r;
      setRec({ at, started: performance.now() });
    } catch (e) {
      setRecError((e as Error).name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in the address bar, then try again.' : 'No microphone was found.');
    }
  };
  const stopRec = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRec(null);
    stop();
  };
  const [recNow, setRecNow] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const id = window.setInterval(() => setRecNow((performance.now() - rec.started) / 1000), 100);
    return () => window.clearInterval(id);
  }, [rec]);

  // ------------------------------------------------------------ shortcuts
  const clipBoard = useRef<{ clip: Clip; kind: Track['kind'] } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable=true]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') e.preventDefault(), e.stopPropagation(), rec ? stopRec() : toggle();
      else if (mod && k === 'z') e.preventDefault(), e.shiftKey ? redo() : undo();
      else if (mod && k === 'y') e.preventDefault(), redo();
      else if (mod && (k === 'b' || k === 'k')) e.preventDefault(), split();
      else if (mod && k === 'd') e.preventDefault(), duplicate();
      else if (mod && k === 'c' && pickedClip && pickedTrack) (clipBoard.current = { clip: pickedClip, kind: pickedTrack.kind });
      else if (mod && k === 'x' && pickedClip && pickedTrack) (clipBoard.current = { clip: pickedClip, kind: pickedTrack.kind }), removePicked();
      else if (mod && k === 'v' && clipBoard.current) {
        e.preventDefault();
        const cb = clipBoard.current;
        const into = pickedTrack?.kind === cb.kind ? pickedTrack : p.tracks.find((t) => t.kind === cb.kind);
        if (into) {
          const c = { ...cb.clip, id: newId(), at: head };
          edit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === into.id ? { ...t, clips: [...t.clips, c] } : t)) }));
          setPick({ kind: 'clip', track: into.id, id: c.id });
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') e.preventDefault(), pick ? removePicked() : sel && cutRange(sel.a, sel.b);
      else if (e.key === 'Home') e.preventDefault(), setHead(0);
      else if (e.key === 'End') e.preventDefault(), setHead(total);
      else if (e.key === 'ArrowLeft') e.preventDefault(), nudge(e.shiftKey ? -5 : -1);
      else if (e.key === 'ArrowRight') e.preventDefault(), nudge(e.shiftKey ? 5 : 1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(80, z * 1.6));
      else if (e.key === '-') setZoom((z) => Math.max(1, z / 1.6));
      else if (k === 'l' && !mod) setLoop((v) => !v);
      else if (k === 'm' && !mod && pickedTrack) setTrack(pickedTrack.id, { mute: !pickedTrack.mute });
      else if (k === 's' && !mod && pickedTrack) setTrack(pickedTrack.id, { solo: !pickedTrack.solo });
      else if (k === 'r' && !mod) rec ? stopRec() : void startRec();
      else if (k === 't' && !mod) addLine();
      else if (e.key === 'Escape') setSel(null), setPick(null);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  // ------------------------------------------------------------ saving
  const [quality, setQualityState] = useState<SoundQuality>(savedQ);
  const setQuality = (q: SoundQuality) => {
    setQualityState(q);
    try {
      localStorage.setItem('ll.soundQuality', q);
    } catch {
      /* fine */
    }
  };
  const [title, setTitle] = useState(source.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Progress | null>(null);
  const [asking, setAsking] = useState<Use[] | null | 'loading'>(null);
  const est = (total / 60) * storedPerMinute(quality);
  const produce = async () => {
    // wait for any cleaning still going on
    for (let k = 0; k < 600 && cleanBusy; k++) await new Promise((r) => setTimeout(r, 100));
    setSaving({ stage: 'Putting it together', p: 0.05 });
    const out = mixdown(heard.project, heard.sources, rate);
    setSaving({ stage: 'Making it smaller', p: 0.08 });
    const blob = await encodeMp3(out, rate, quality, (q) => setSaving({ stage: 'Making it smaller', p: 0.08 + q * 0.52 }));
    const sc: ScriptLine[] = [...p.lines].filter((l) => l.text.trim()).sort((a, b) => a.a - b.a).map((l) => ({ text: l.text.trim(), t: +l.a.toFixed(2), e: +l.b.toFixed(2), ...(l.who ? { who: l.who } : {}) }));
    return { blob, duration: +(out.length / rate).toFixed(2), sc, name: title.trim() || 'Recording', base: 0.6 };
  };
  const save = async () => {
    if (!user) return setError('Sign in again to save.');
    stop();
    setError('');
    try {
      const { blob, duration, sc, name, base } = await produce();
      setSaving({ stage: 'Uploading', p: base });
      const { mediaId, bytes } = await saveSound(classId, blob, { title: name, script: sc, duration }, (q) => setSaving({ stage: 'Uploading', p: base + q * (0.97 - base) }));
      setSaving({ stage: 'Adding it to your resources library', p: 0.98 });
      const archiveId = await archiveAdd(user.uid, { kind: 'audio', name, folder, tags: [], size: Math.round((bytes * 4) / 3), home: { classId, mediaId }, script: sc, duration });
      setSaving({ stage: 'Saved', p: 1 });
      onSaved({ mediaId, archiveId, title: name, script: sc });
    } catch (e) {
      console.error(e);
      setSaving(null);
      setError('It could not be saved. Check your connection and try again.');
    }
  };
  const askReplace = async () => {
    if (!replace) return;
    stop();
    setAsking('loading');
    setAsking(await replace.uses().catch(() => []));
  };
  const doReplace = async () => {
    if (!replace) return;
    setAsking(null);
    try {
      const { blob, duration, sc, base } = await produce();
      setSaving({ stage: 'Replacing it everywhere', p: base });
      await replace.run(blob, { script: sc, duration }, (q) => setSaving({ stage: 'Replacing it everywhere', p: base + q * (0.99 - base) }));
      setSaving({ stage: 'Saved', p: 1 });
      onSaved({ mediaId: '', archiveId: '', title: replace.name, script: sc });
    } catch (e) {
      console.error(e);
      setSaving(null);
      setError('It could not be replaced. Check your connection and try again.');
    }
  };

  // ------------------------------------------------------------ the timeline: sizes and pointers
  const scroller = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(900);
  const [scroll, setScroll] = useState(0);
  useLayoutEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const ro = new ResizeObserver(() => setVw(Math.max(200, s.clientWidth - HEAD_W)));
    ro.observe(s);
    setVw(Math.max(200, s.clientWidth - HEAD_W));
    return () => ro.disconnect();
  }, [saving]);
  const viewLen = Math.max(total + 4, 8);
  const width = vw * zoom;
  const pps = width / viewLen;
  const X = (t: number) => t * pps;
  const T = (clientX: number) => {
    const s = scroller.current!;
    const r = s.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - HEAD_W + s.scrollLeft) / pps);
  };
  // Keep the playhead in view while playing.
  useEffect(() => {
    const s = scroller.current;
    if (!s || !playing) return;
    const x = X(head);
    if (x < s.scrollLeft || x > s.scrollLeft + vw - 40) s.scrollLeft = Math.max(0, x - vw * 0.15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing && Math.floor(X(head) / Math.max(1, vw * 0.7))]);
  // Snapping to the playhead and to clip edges, like other editors (hold Alt to move freely).
  const snaps = useMemo(() => [0, ...p.tracks.flatMap((t) => t.clips.flatMap((c) => [c.at, clipEnd(c)])), ...p.lines.flatMap((l) => [l.a, l.b])], [p]);
  const snap = (t: number, alt: boolean, except?: number[]) => {
    if (alt) return t;
    const near = [...snaps, head].filter((s) => !except?.includes(s)).find((s) => Math.abs(s - t) * pps < 7);
    return near ?? t;
  };

  const backgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t0 = T(e.clientX);
    const x0 = e.clientX;
    let moved = false;
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      moved = true;
      const t = T(ev.clientX);
      setSel({ a: Math.min(t0, t), b: Math.max(t0, t) });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        setSel(null);
        setPick(null);
        setHead(t0);
        if (playing) playFrom(t0);
      } else setHead(Math.min(t0, T(x0)));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  // Dragging a clip: the middle moves it; the sides trim it; the top corners set its fades.
  const clipDown = (tr: Track, c: Clip, mode: 'move' | 'l' | 'r' | 'fi' | 'fo') => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setPick({ kind: 'clip', track: tr.id, id: c.id });
    setSel(null);
    const x0 = e.clientX;
    const src = sources.current[c.src];
    const srcLen = src ? src.length / rate : c.b;
    let moved = false;
    const group = 'drag-' + c.id + '-' + Date.now();
    const mv = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      if (mode === 'move') {
        const at = Math.max(0, snap(c.at + dt, ev.altKey, [c.at]));
        const at2 = Math.max(0, snap(c.at + dt + clipLen(c), ev.altKey, [clipEnd(c)]) - clipLen(c));
        setClip(tr.id, c.id, { at: Math.abs(at - (c.at + dt)) <= Math.abs(at2 - (c.at + dt)) ? at : at2 }, group);
      } else if (mode === 'l') {
        const a = Math.max(0, Math.min(c.b - 0.05, c.a + dt));
        const at = c.at + (a - c.a);
        if (at < 0) return;
        const sa = snap(at, ev.altKey, [c.at]);
        setClip(tr.id, c.id, { a: a + (sa - at), at: sa }, group);
      } else if (mode === 'r') {
        const b = Math.min(srcLen, Math.max(c.a + 0.05, c.b + dt));
        const end = snap(c.at + (b - c.a), ev.altKey, [clipEnd(c)]);
        setClip(tr.id, c.id, { b: Math.min(srcLen, c.a + (end - c.at)) }, group);
      } else if (mode === 'fi') setClip(tr.id, c.id, { fadeIn: Math.max(0, Math.min(clipLen(c) - c.fadeOut, c.fadeIn + dt)) }, group);
      else setClip(tr.id, c.id, { fadeOut: Math.max(0, Math.min(clipLen(c) - c.fadeIn, c.fadeOut - dt)) }, group);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved && mode === 'move') setHead(T(x0));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  // Script lines move and stretch, but never into another line.
  const lineDown = (l: Line, mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setPick({ kind: 'line', id: l.id });
    setSel(null);
    const x0 = e.clientX;
    const others = p.lines.filter((o) => o.id !== l.id).sort((a, b) => a.a - b.a);
    const prevEnd = others.filter((o) => o.b <= l.a + 0.001).reduce((m, o) => Math.max(m, o.b), 0);
    const nextStart = others.filter((o) => o.a >= l.b - 0.001).reduce((m, o) => Math.min(m, o.a), Infinity);
    const group = 'line-' + l.id + '-' + Date.now();
    let moved = false;
    const mv = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      const len = l.b - l.a;
      if (mode === 'move') {
        const a = Math.max(prevEnd, Math.min(nextStart - len, snap(l.a + dt, ev.altKey, [l.a])));
        setLine(l.id, { a, b: a + len }, group);
      } else if (mode === 'l') setLine(l.id, { a: Math.max(prevEnd, Math.min(l.b - 0.2, snap(l.a + dt, ev.altKey, [l.a]))) }, group);
      else setLine(l.id, { b: Math.min(nextStart, Math.max(l.a + 0.2, snap(l.b + dt, ev.altKey, [l.b]))) }, group);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved && mode === 'move') setHead(l.a);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const wheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const s = scroller.current!;
    const r = s.getBoundingClientRect();
    const tAt = T(e.clientX);
    setZoom((z) => {
      const nz = Math.max(1, Math.min(80, z * (e.deltaY < 0 ? 1.25 : 0.8)));
      requestAnimationFrame(() => (s.scrollLeft = Math.max(0, tAt * ((vw * nz) / viewLen) - (e.clientX - r.left - HEAD_W))));
      return nz;
    });
  };

  if (saving)
    return (
      <div className="sed-saving" role="status" aria-live="polite">
        <span className="sed-saving-stage">{saving.stage}…</span>
        <span className="sed-saving-bar">
          <span style={{ width: `${Math.round(saving.p * 100)}%` }} />
        </span>
        <span className="sed-saving-n">{Math.round(saving.p * 100)}%</span>
        <span className="hint">
          {formatBytes(est)} · {short(total)} long. Keep this window open until it is saved.
        </span>
      </div>
    );

  const voice = p.tracks.filter((t) => t.kind === 'voice');
  const sfxTracks = p.tracks.filter((t) => t.kind === 'sfx');
  const pickedLabel = pickedClip ? names.current[pickedClip.src] ?? 'Clip' : '';
  const rulerStep = STEPS.find((s) => s * pps >= 70) ?? 600;
  const ticks: number[] = [];
  for (let t = Math.floor(scroll / pps / rulerStep) * rulerStep; t <= (scroll + vw) / pps + rulerStep; t += rulerStep) ticks.push(+t.toFixed(3));

  return (
    <div className="daw sx">
      {/* Transport */}
      <div className="daw-transport">
        <span className="daw-btns">
          <button type="button" className="daw-b" onClick={() => (setHead(0), playing && playFrom(0))} aria-label="To the start" data-tip="To the start (Home)">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5v11M13 3 6 8l7 5z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="daw-b" onClick={() => nudge(-5)} aria-label="Back 5 seconds" data-tip="Back 5 s (Shift ←)">
            <svg width="16" height="14" viewBox="0 0 18 16" aria-hidden="true"><path d="M9 3 2 8l7 5zM16 3 9 8l7 5z" fill="currentColor" /></svg>
          </button>
          <button type="button" className={'daw-play' + (playing ? ' on' : '')} onClick={() => (rec ? stopRec() : toggle())} aria-label={playing ? 'Stop' : 'Play'} data-tip={playing ? 'Stop (Space)' : 'Play (Space)'}>
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
            )}
          </button>
          <button type="button" className="daw-b" onClick={() => nudge(5)} aria-label="Forward 5 seconds" data-tip="Forward 5 s (Shift →)">
            <svg width="16" height="14" viewBox="0 0 18 16" aria-hidden="true"><path d="M2 3l7 5-7 5zM9 3l7 5-7 5z" fill="currentColor" /></svg>
          </button>
          <button type="button" className={'daw-rec' + (rec ? ' on' : '')} onClick={() => (rec ? stopRec() : void startRec())} aria-label={rec ? 'Stop recording' : 'Record a new track'} data-tip={rec ? 'Stop recording (R)' : 'Record a new track from the playhead (R). Wear headphones.'}>
            <i />
          </button>
          <button type="button" className={'daw-b' + (loop ? ' on' : '')} onClick={() => setLoop((v) => !v)} aria-pressed={loop} aria-label="Loop the selection" data-tip="Loop the selection (L)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>
          </button>
        </span>
        <span className="daw-lcd" aria-live="off">
          <b>{clock(head)}</b>
          <span>/ {clock(total)}</span>
          {rec && <em className="rec">● Recording {short(recNow)}</em>}
        </span>
        <span className="daw-meter" aria-hidden="true" title="Level">
          <span style={{ width: `${Math.min(100, meter * 100)}%` }} className={meter > 0.97 ? 'hot' : ''} />
        </span>
        <span style={{ flex: 1 }} />
        <span className="daw-btns">
          <button type="button" className="daw-b" onClick={split} aria-label="Split" data-tip="Split at the playhead (Ctrl B)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18" /><path d="M5 8l-3 4 3 4M19 8l3 4-3 4" /></svg>
          </button>
          <button type="button" className="daw-b" onClick={undo} disabled={!past.current.length} aria-label="Undo" data-tip="Undo (Ctrl Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
          </button>
          <button type="button" className="daw-b" onClick={redo} disabled={!future.current.length} aria-label="Redo" data-tip="Redo (Ctrl Shift Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
          </button>
        </span>
        <span className="daw-zoom">
          <button type="button" className="daw-b" onClick={() => setZoom((z) => Math.max(1, z / 1.6))} disabled={zoom <= 1} aria-label="Zoom out" data-tip="Zoom out (−)">
            −
          </button>
          <button type="button" className="daw-zoom-n" onClick={() => setZoom(1)} data-tip="Show it all">
            {zoom <= 1 ? 'All' : `${Math.round(zoom * 10) / 10}×`}
          </button>
          <button type="button" className="daw-b" onClick={() => setZoom((z) => Math.min(80, z * 1.6))} aria-label="Zoom in" data-tip="Zoom in (+)">
            +
          </button>
        </span>
      </div>

      <div className="sx-main">
        {/* The timeline */}
        <div className="sx-tl" ref={scroller} onScroll={(e) => setScroll((e.target as HTMLElement).scrollLeft)} onWheel={wheel}>
          <div className="sx-inner" style={{ width: width + HEAD_W }}>
            <div className="sx-row sx-ruler" onPointerDown={backgroundDown}>
              <span className="sx-head-cell">
                <span className="hint">{rec ? 'Recording…' : 'Tracks'}</span>
              </span>
              <span className="sx-lane">
                {ticks.map((t) => (
                  <span key={t} className="sx-tick" style={{ left: X(t) }}>
                    {rulerStep < 1 ? short(t) : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`}
                  </span>
                ))}
              </span>
            </div>
            {voice.map((tr) => (
              <div key={tr.id} className={'sx-row sx-voice' + (tr.mute ? ' muted' : '') + (pickedTrack?.id === tr.id ? ' picked' : '')}>
                <span className="sx-head-cell" onClick={() => setPick({ kind: 'track', id: tr.id })}>
                  <b className="sx-tname">{tr.name}</b>
                  <span className="sx-tbtns">
                    <button type="button" className={'sx-ms' + (tr.mute ? ' on' : '')} onClick={(e) => (e.stopPropagation(), setTrack(tr.id, { mute: !tr.mute }))} data-tip="Mute (M)">
                      M
                    </button>
                    <button type="button" className={'sx-ms' + (tr.solo ? ' on solo' : '')} onClick={(e) => (e.stopPropagation(), setTrack(tr.id, { solo: !tr.solo }))} data-tip="Solo (S)">
                      S
                    </button>
                    {(tr.noise > 0 || tr.echo > 0) && <span className="sx-clean" data-tip="Cleaned up">✦</span>}
                  </span>
                  <input className="sx-tvol" type="range" min={0} max={2} step={0.05} value={tr.gain} onClick={(e) => e.stopPropagation()} onChange={(e) => setTrack(tr.id, { gain: Number(e.target.value) }, 'tg' + tr.id)} aria-label={`${tr.name} volume`} />
                </span>
                <span className="sx-lane" onPointerDown={backgroundDown}>
                  {tr.clips.map((c) => (
                    <ClipView key={c.id} c={c} kind="voice" data={heard.sources[heard.project.tracks.find((t) => t.id === tr.id)?.clips.find((x) => x.id === c.id)?.src ?? c.src] ?? sources.current[c.src]} rate={rate} pps={pps} scroll={scroll} vw={vw} label={names.current[c.src] ?? ''} picked={pick?.kind === 'clip' && pick.id === c.id} onDown={(m) => clipDown(tr, c, m)} />
                  ))}
                  {rec && voice[voice.length - 1].id === tr.id && <span className="sx-recclip" style={{ left: X(rec.at), width: Math.max(4, recNow * pps) }} />}
                </span>
              </div>
            ))}
            {sfxTracks.map((tr) => {
              const rows = stackRows(tr.clips);
              const n = Math.max(1, ...Object.values(rows).map((r) => r + 1));
              return (
                <div key={tr.id} className={'sx-row sx-sfx' + (tr.mute ? ' muted' : '') + (pickedTrack?.id === tr.id ? ' picked' : '')} style={{ height: Math.max(62, n * 30 + 12) }}>
                  <span className="sx-head-cell" onClick={() => setPick({ kind: 'track', id: tr.id })}>
                    <b className="sx-tname">{tr.name}</b>
                    <span className="sx-tbtns">
                      <button type="button" className={'sx-ms' + (tr.mute ? ' on' : '')} onClick={(e) => (e.stopPropagation(), setTrack(tr.id, { mute: !tr.mute }))} data-tip="Mute">
                        M
                      </button>
                      <SfxMenu onAdd={(k) => void addSfx(k)} onHear={(k) => void hearSfx(k)} mine={mySfx} />
                    </span>
                  </span>
                  <span className="sx-lane" onPointerDown={backgroundDown}>
                    {tr.clips.map((c) => (
                      <ClipView key={c.id} c={c} kind="sfx" row={rows[c.id] ?? 0} data={sources.current[c.src]} rate={rate} pps={pps} scroll={scroll} vw={vw} label={names.current[c.src] ?? ''} picked={pick?.kind === 'clip' && pick.id === c.id} onDown={(m) => clipDown(tr, c, m)} />
                    ))}
                  </span>
                </div>
              );
            })}
            <div className="sx-row sx-script">
              <span className="sx-head-cell">
                <b className="sx-tname">Script</b>
                <button type="button" className="sx-add" onClick={addLine} data-tip="Add a line at the playhead (T)">
                  + Line
                </button>
              </span>
              <span className="sx-lane" onPointerDown={backgroundDown}>
                {p.lines.map((l) => (
                  <span key={l.id} className={'sx-line' + (pick?.kind === 'line' && pick.id === l.id ? ' picked' : '') + (l.text.trim() ? '' : ' empty')} style={{ left: X(l.a), width: Math.max(6, X(l.b) - X(l.a)) }} onPointerDown={lineDown(l, 'move')} title={l.text}>
                    <span className="sx-edge l" onPointerDown={lineDown(l, 'l')} />
                    <span className="sx-line-t">
                      {l.who && <b>{l.who}</b>}
                      {l.text || 'Type the line'}
                    </span>
                    <span className="sx-edge r" onPointerDown={lineDown(l, 'r')} />
                  </span>
                ))}
              </span>
            </div>
            {/* the selection and the playhead run through every track */}
            {sel && <span className="sx-sel" style={{ left: HEAD_W + X(sel.a), width: X(sel.b) - X(sel.a) }} />}
            <span className="sx-playhead" style={{ left: HEAD_W + X(head) }} />
          </div>
        </div>

        {/* The inspector: what is picked */}
        <aside className="sx-insp">
          {pickedClip && pick?.kind === 'clip' ? (
            <>
              <h4>{pickedClip.src === 'silence' ? 'Silence' : pickedTrack?.kind === 'sfx' ? 'Sound effect' : 'Clip'} · {pickedLabel}</h4>
              {pickedClip.src === 'silence' && <span className="hint">Drag its right edge to make it longer or shorter. Delete takes it out and closes the gap.</span>}
              {pickedClip.src === 'sfx:beep' && <span className="hint">Drag its right edge to make the beep as long as you need.</span>}
              <span className="hint">
                {short(pickedClip.at)} to {short(clipEnd(pickedClip))} · {clipLen(pickedClip).toFixed(1)} s
              </span>
              <span className="daw-row">
                <span className="daw-lab">Volume</span>
                <input type="range" min={0} max={3} step={0.05} value={pickedClip.gain} onChange={(e) => setClip(pick.track, pickedClip.id, { gain: Number(e.target.value) }, 'cg' + pickedClip.id)} aria-label="Clip volume" />
                <b className="daw-val">{Math.round(pickedClip.gain * 100)}%</b>
              </span>
              {pickedTrack?.kind === 'voice' && (
                <div className="sx-fx">
                  <span className="daw-lab">Voice</span>
                  <span className="sx-fx-grid">
                    {VOICE_FX.map((f) => (
                      <button key={f.k || 'none'} type="button" className={pickedClip.fx === f.k ? 'on' : ''} onClick={() => setClip(pick.track, pickedClip.id, { fx: f.k })} title={f.about}>
                        {f.label}
                      </button>
                    ))}
                  </span>
                  <span className="hint">Split the clip first (Ctrl B) to change only part of it.</span>
                </div>
              )}
              <span className="hint">Fades: drag the small corners at the top of the clip. {pickedClip.fadeIn || pickedClip.fadeOut ? `In ${pickedClip.fadeIn.toFixed(1)} s, out ${pickedClip.fadeOut.toFixed(1)} s.` : ''}</span>
              <span className="daw-row wrap">
                <button type="button" className="btn small-btn" onClick={split}>
                  Split <kbd>Ctrl B</kbd>
                </button>
                <button type="button" className="btn small-btn" onClick={duplicate}>
                  Duplicate <kbd>Ctrl D</kbd>
                </button>
                {pickedTrack?.kind === 'voice' && (
                  <>
                    <button type="button" className="btn small-btn" onClick={trimQuiet}>
                      Trim the quiet ends
                    </button>
                    <button type="button" className="btn small-btn" onClick={tighten}>
                      Shorten long pauses
                    </button>
                  </>
                )}
                <button type="button" className="btn small-btn" onClick={removePicked}>
                  <UiIcon name="trash" size={13} /> Delete
                </button>
              </span>
              {tightened !== null && <span className="hint">{tightened ? `${tightened} long ${tightened === 1 ? 'pause' : 'pauses'} shortened. Ctrl Z puts ${tightened === 1 ? 'it' : 'them'} back.` : 'No long pauses found.'}</span>}
            </>
          ) : pickedLine ? (
            <>
              <h4>Script line</h4>
              <span className="hint">
                {short(pickedLine.a)} to {short(pickedLine.b)} · drag its edges on the script lane
              </span>
              <label className="field">
                <span>Line</span>
                <input className="sx-line-text" value={pickedLine.text} onChange={(e) => setLine(pickedLine.id, { text: e.target.value }, 'lt' + pickedLine.id)} placeholder="What is said" />
              </label>
              <label className="field">
                <span>Speaker (optional)</span>
                <input value={pickedLine.who ?? ''} list="sx-speakers" onChange={(e) => setLine(pickedLine.id, { who: e.target.value || undefined }, 'lw' + pickedLine.id)} placeholder="A, B, or a name" />
                <datalist id="sx-speakers">
                  {[...new Set(p.lines.map((l) => l.who).filter(Boolean))].map((w) => (
                    <option key={w} value={w} />
                  ))}
                </datalist>
              </label>
              <span className="daw-row wrap">
                <button type="button" className="btn small-btn" onClick={() => playFrom(pickedLine.a, pickedLine.b)}>
                  Play this line
                </button>
                <button type="button" className="btn small-btn" onClick={removePicked}>
                  <UiIcon name="trash" size={13} /> Delete
                </button>
              </span>
            </>
          ) : pickedTrack ? (
            <>
              <h4>Track</h4>
              <label className="field">
                <span>Name</span>
                <input value={pickedTrack.name} onChange={(e) => setTrack(pickedTrack.id, { name: e.target.value }, 'tn' + pickedTrack.id)} />
              </label>
              {pickedTrack.kind === 'voice' && (
                <>
                  <span className="daw-row col">
                    <span className="daw-lab">Background noise</span>
                    <span className="seg small-seg">
                      {(['Leave', 'Reduce', 'More'] as const).map((l, i) => (
                        <button key={l} type="button" className={pickedTrack.noise === i ? 'on' : ''} onClick={() => setTrack(pickedTrack.id, { noise: i as 0 | 1 | 2 })}>
                          {l}
                        </button>
                      ))}
                    </span>
                  </span>
                  <span className="daw-row col">
                    <span className="daw-lab">Room echo</span>
                    <span className="seg small-seg">
                      {(['Leave', 'Reduce', 'More'] as const).map((l, i) => (
                        <button key={l} type="button" className={pickedTrack.echo === i ? 'on' : ''} onClick={() => setTrack(pickedTrack.id, { echo: i as 0 | 1 | 2 })}>
                          {l}
                        </button>
                      ))}
                    </span>
                  </span>
                  {cleanBusy && <span className="hint">{cleanBusy}</span>}
                  {voice.length > 1 && (
                    <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={removePicked}>
                      <UiIcon name="trash" size={13} /> Delete the track
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <h4>The whole sound</h4>
              <span className="daw-row">
                <span className="daw-lab">Volume</span>
                <input type="range" min={0.2} max={3} step={0.05} value={p.gain} onChange={(e) => edit((x) => ({ ...x, gain: Number(e.target.value) }), 'mg')} aria-label="Volume" />
                <b className="daw-val">{Math.round(p.gain * 100)}%</b>
              </span>
              <label className="check-row">
                <input type="checkbox" checked={p.loud} onChange={(e) => edit((x) => ({ ...x, loud: e.target.checked }))} />
                As loud as it can be without distortion
              </label>
              <span className="hint">Click a clip, a line or a track name to change it. Drag across the wave to select a stretch: Delete takes it out of everything.</span>
              {sel && (
                <span className="daw-row wrap">
                  <button type="button" className="btn small-btn" onClick={() => playFrom(sel.a, sel.b)}>
                    Play the selection
                  </button>
                  <button type="button" className="btn small-btn" onClick={() => cutRange(sel.a, sel.b)}>
                    Cut it out
                  </button>
                  <button type="button" className="btn small-btn" onClick={() => keepRange(sel.a, sel.b)}>
                    Keep only this
                  </button>
                </span>
              )}
            </>
          )}
          <div className="sx-adds">
            <span className="sx-sil">
              <button type="button" className="btn small-btn" onClick={() => insertSilence(silLen)} data-tip="Adds silence at the playhead and moves the rest along">
                <UiIcon name="silence" size={13} /> Silence
              </button>
              <select value={silLen} onChange={(e) => setSilLen(Number(e.target.value))} aria-label="Length of silence">
                {[0.5, 1, 2, 3, 5, 10, 20, 30].map((x) => (
                  <option key={x} value={x}>
                    {x} s
                  </option>
                ))}
              </select>
            </span>
            <button type="button" className="btn small-btn" onClick={() => fileIn.current?.click()}>
              <UiIcon name="upload" size={13} /> Bring in sounds
            </button>
            <button type="button" className="btn small-btn" onClick={() => (rec ? stopRec() : void startRec())}>
              <span className="sx-dot" /> {rec ? 'Stop recording' : 'Record a track'}
            </button>
            <input ref={fileIn} type="file" accept="audio/*,video/*" multiple hidden onChange={(e) => (e.target.files && void importFiles(e.target.files), (e.target.value = ''))} />
          </div>
          {(importBusy || recError) && <span className="hint">{importBusy || recError}</span>}
          {!rec && <span className="hint sx-phones">Recording over other tracks? Wear headphones, so they are not recorded again.</span>}
        </aside>
      </div>

      <div className="sx-save">
        <label className="field">
          <span>Name</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Unit 4, listening 2" />
        </label>
        <div className="field" style={{ gap: 6 }}>
          <span>Quality</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Quality">
            {SOUND_QUALITY.map((q) => (
              <button key={q.k} type="button" role="radio" aria-checked={quality === q.k} className={quality === q.k ? 'on' : ''} onClick={() => setQuality(q.k)}>
                {q.label}
              </button>
            ))}
          </span>
          <span className="hint">About {formatBytes(est)}.</span>
        </div>
        <span style={{ flex: 1 }} />
        {error && <span className="hint warn">{error}</span>}
        <button type="button" className="btn link" onClick={onBack}>
          {backLabel}
        </button>
        {replace ? (
          <>
            <button type="button" className="btn" onClick={save} disabled={total < 0.2}>
              Save as a new sound
            </button>
            <button type="button" className="btn primary" onClick={askReplace} disabled={total < 0.2}>
              Replace this sound…
            </button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={save} disabled={total < 0.2}>
            Save
          </button>
        )}
      </div>
      <span className="hint daw-keys">Space play · Ctrl B split · Delete remove · Ctrl D duplicate · Ctrl C / V copy and paste · Ctrl Z undo · R record · T add a line · M mute · S solo · L loop · + − zoom · Alt while dragging: no snapping</span>
      {asking && (
        <div className="sed-replace" role="alertdialog" aria-label="Replace this sound?" ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>
          <strong>Replace “{replace?.name}” everywhere?</strong>
          {asking === 'loading' ? (
            <span className="hint">Finding where it is used…</span>
          ) : asking.length ? (
            <>
              <span className="hint">
                It is used in {asking.length} {asking.length === 1 ? 'task' : 'tasks'}. All of them will play the new version, and their scripts move to the new timing:
              </span>
              <ul className="sed-uses">
                {asking.map((u, i) => (
                  <li key={i}>
                    <b>{u.task}</b> · {u.lesson} · <span className="hint">{u.cls}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="hint">It is not used in any lesson yet.</span>
          )}
          <span className="hint warn">The old version cannot be brought back. To keep it, save as a new sound instead.</span>
          <span className="cd-card-btns">
            <button type="button" className="btn small-btn" onClick={() => setAsking(null)}>
              Cancel
            </button>
            <button type="button" className="btn small-btn danger" disabled={asking === 'loading'} onClick={doReplace}>
              Replace everywhere
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// A clip on its track: its own wave (after its effect and volume), edges to trim, corners to fade.
function ClipView({ c, kind, row = 0, data, rate, pps, scroll, vw, label, picked, onDown }: { c: Clip; kind: 'voice' | 'sfx'; row?: number; data?: Float32Array; rate: number; pps: number; scroll: number; vw: number; label: string; picked: boolean; onDown: (m: 'move' | 'l' | 'r' | 'fi' | 'fo') => (e: React.PointerEvent) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const left = c.at * pps;
  const w = Math.max(3, clipLen(c) * pps);
  const y = useMemo(() => (data ? renderClip(c, data, rate) : null), [c, data, rate]);
  const idx = useMemo<PeakIndex | null>(() => (y ? peakIndex(y) : null), [y]);
  // Only the visible part of a long clip is drawn.
  const from = Math.max(0, scroll - left - 50);
  const to = Math.min(w, scroll + vw - left + 50);
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el || !y || !idx || to <= from) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(to - from));
    const h = el.clientHeight;
    el.width = Math.round(cw * dpr);
    el.height = Math.round(h * dpr);
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, h);
    g.fillStyle = getComputedStyle(el).color;
    const mid = h / 2;
    const spp = rate / pps;
    for (let x = 0; x < cw; x++) {
      const a = (from + x) * spp;
      const [lo, hi] = rangePeak(y, idx, a, a + Math.max(1, spp));
      const y0 = mid - Math.min(1, hi) * (mid - 2);
      const y1 = mid - Math.max(-1, lo) * (mid - 2);
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }, [y, idx, from, to, pps, rate]);
  const fi = c.fadeIn * pps;
  const fo = c.fadeOut * pps;
  return (
    <span className={'sx-clip ' + kind + (c.src === 'silence' ? ' silence' : '') + (picked ? ' picked' : '') + (c.fx ? ' has-fx' : '')} style={{ left, width: w, ...(kind === 'sfx' ? { top: 5 + row * 30, height: 26 } : {}) }} onPointerDown={onDown('move')}>
      <canvas ref={cv} className="sx-clip-wave" style={{ left: from, width: Math.max(0, to - from) }} />
      {w > 30 && (
        <span className="sx-clip-name">
          {c.src === 'silence' ? `Silence ${clipLen(c).toFixed(1)} s` : label}
          {c.fx && <em>{VOICE_FX.find((f) => f.k === c.fx)?.label}</em>}
          {c.gain !== 1 && <em>{Math.round(c.gain * 100)}%</em>}
        </span>
      )}
      {/* fades: a shaded slope, and a handle at each top corner */}
      {fi > 1 && (
        <svg className="sx-fade" style={{ left: 0, width: fi }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0 L0 100 Q 60 95 100 0 Z" />
        </svg>
      )}
      {fo > 1 && (
        <svg className="sx-fade" style={{ right: 0, width: fo }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M100 0 L100 100 Q 40 95 0 0 Z" />
        </svg>
      )}
      <span className="sx-edge l" onPointerDown={onDown('l')} />
      <span className="sx-edge r" onPointerDown={onDown('r')} />
      {w > 24 && (
        <>
          <span className="sx-fh" style={{ left: Math.min(w - 8, fi) - 5 }} onPointerDown={onDown('fi')} data-tip="Drag to fade in" />
          <span className="sx-fh" style={{ left: Math.max(0, w - fo) - 5 }} onPointerDown={onDown('fo')} data-tip="Drag to fade out" />
        </>
      )}
    </span>
  );
}

// The library of sound effects: hear one, or add it at the playhead.
function SfxMenu({ onAdd, onHear, mine = [] }: { onAdd: (k: string) => void; onHear: (k: string) => void; mine?: MySfx[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const groups = [...new Set(SFX.map((s) => s.group))];
  return (
    <span className="sx-sfxmenu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="sx-add" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        + Effect
      </button>
      {open && (
        <span className="sx-sfxpop" role="menu">
          {mine.length > 0 && (
            <span className="sx-sfxg">
              <span className="sx-sfxh">Your sounds</span>
              {mine.map((s) => (
                <span key={s.id} className="sx-sfxrow">
                  <button type="button" className="sx-hear" onClick={() => onHear('u:' + s.id)} aria-label={`Hear ${s.label}`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
                  </button>
                  <button type="button" className="sx-pick" onClick={() => (onAdd('u:' + s.id), setOpen(false))}>
                    {s.label}
                    <span className="hint">{s.dur < 1 ? `${s.dur.toFixed(1)} s` : `${Math.round(s.dur)} s`}</span>
                  </button>
                </span>
              ))}
            </span>
          )}
          {groups.map((g) => (
            <span key={g} className="sx-sfxg">
              <span className="sx-sfxh">{g}</span>
              {SFX.filter((s) => s.group === g).map((s) => (
                <span key={s.k} className="sx-sfxrow">
                  <button type="button" className="sx-hear" onClick={() => onHear(s.k)} aria-label={`Hear ${s.label}`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
                  </button>
                  <button type="button" className="sx-pick" onClick={() => (onAdd(s.k), setOpen(false))}>
                    {s.label}
                    <span className="hint">{s.dur < 1 ? `${s.dur.toFixed(1)} s` : `${Math.round(s.dur)} s`}</span>
                  </button>
                </span>
              ))}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
