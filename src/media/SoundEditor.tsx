import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assemble, bufferOf, EFFECTS, finishedLength, keptRanges, mapTime, peakIndex, rangePeak, reduceEcho, toMono, toOut, toSrc, type Edit, type Effect, type NoiseLevel, type PeakIndex } from '../lib/sound';
import { encodeMp3, keepAsIs, SOUND_QUALITY, storedPerMinute, type SoundQuality } from '../lib/audioEncode';
import { cleanNoise } from '../lib/soundJobs';
import { archiveAdd, formatBytes, saveSound, type ScriptLine } from '../lib/archive';
import { useAuth } from '../lib/auth';
import { newId } from '../lib/tasks';
import { splitScript } from './ScriptEditor';
import { UiIcon } from '../components/UiIcon';

// The sound editor, laid out like audio software: a transport bar with a large time display, a
// zoomable wave with a time ruler, a selection to play, loop, cut out or keep, and a rack of effects
// (volume, fades, background noise, room echo, added sounds). Undo and keyboard shortcuts throughout.
// Saving puts it in the class and the resources library.

export type SoundSource = { buffer: AudioBuffer; name: string; marks?: number[]; script?: string[]; roomDb?: number; recorded?: boolean; file?: File };
export type SavedSound = { mediaId: string; archiveId: string; title: string; script: ScriptLine[] };

const savedQ = (): SoundQuality => {
  try {
    const q = localStorage.getItem('ll.soundQuality');
    return q === 'clear' || q === 'small' ? q : 'standard';
  } catch {
    return 'standard';
  }
};
const EFFECT_ICON: Record<Effect, string> = { silence: 'silence', bell: 'bell', chime: 'music', beep: 'beep', beeps: 'beep' };
// 0:12.34
const clock = (s: number) => {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
};
const short = (s: number) => {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};

type Progress = { stage: string; p: number }; // p: 0 to 1 across the whole save
type Sel = { a: number; b: number } | null;

export type Use = { cls: string; lesson: string; task: string };
export type ReplaceTarget = { name: string; uses: () => Promise<Use[]>; run: (blob: Blob, meta: { script: ScriptLine[]; duration: number }, onProgress: (p: number) => void) => Promise<void> };

export function SoundEditor({ source, classId, onSaved, onBack, backLabel, folder = '', replace }: { source: SoundSource; classId: string; onSaved: (s: SavedSound) => void; onBack: () => void; backLabel: string; folder?: string; replace?: ReplaceTarget }) {
  const { user } = useAuth();
  const rate = source.buffer.sampleRate;
  const mono = useMemo(() => toMono(source.buffer), [source.buffer]);
  const length = mono.length / rate;
  const [noise, setNoise] = useState<NoiseLevel>(source.roomDb !== undefined && source.roomDb > -50 ? 1 : 0);
  const cleaned = useRef<Partial<Record<NoiseLevel, Float32Array>>>({ 0: mono });
  const cleaning = useRef<Partial<Record<NoiseLevel, Promise<Float32Array>>>>({});
  const [clean, setClean] = useState<{ level: NoiseLevel; p: number } | null>(null);
  const [, bump] = useState(0);

  // ------------------------------------------------------------ the edit, with undo
  const [edit, setEditState] = useState<Edit>({ start: 0, end: length, gain: 1, even: false, noise: 0, inserts: [], cuts: [], fadeIn: 0, fadeOut: 0, echo: 0 });
  const past = useRef<Edit[]>([]);
  const future = useRef<Edit[]>([]);
  const [, tick] = useState(0);
  const setEdit = useCallback((f: Edit | ((e: Edit) => Edit), group?: string) => {
    setEditState((cur) => {
      const next = typeof f === 'function' ? f(cur) : f;
      if (next === cur) return cur;
      // Dragging a slider or a handle is one step to undo, not hundreds.
      const now = performance.now();
      const last = lastGroup.current;
      if (!group || last.g !== group || now - last.t > 900) past.current.push(cur), (future.current = []);
      lastGroup.current = { g: group ?? '', t: now };
      if (past.current.length > 100) past.current.shift();
      return next;
    });
    tick((n) => n + 1);
  }, []);
  const lastGroup = useRef({ g: '', t: 0 });
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(edit);
    setEditState(prev);
    tick((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(edit);
    setEditState(next);
    tick((n) => n + 1);
  };

  const [head, setHead] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [silence, setSilence] = useState(1);
  const [quality, setQualityState] = useState<SoundQuality>(savedQ);
  const [title, setTitle] = useState(source.name);
  const [script, setScript] = useState((source.script ?? []).join('\n'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Progress | null>(null);
  const [asking, setAsking] = useState<Use[] | null | 'loading'>(null); // replacing: where it is used
  const [playing, setPlaying] = useState(false);
  const [hearing, setHearing] = useState(''); // the added sound playing now
  const [meter, setMeter] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const node = useRef<{ src: AudioBufferSourceNode; an: AnalyserNode; at: number; from: number; edit: Edit; until?: number } | null>(null);

  const setQuality = (q: SoundQuality) => {
    setQualityState(q);
    try {
      localStorage.setItem('ll.soundQuality', q);
    } catch {
      /* fine */
    }
  };

  // Noise reduction takes a moment (in the background), so each strength is worked out once.
  const cleanFor = (level: NoiseLevel) => {
    if (cleaned.current[level]) return Promise.resolve(cleaned.current[level]!);
    if (!cleaning.current[level])
      cleaning.current[level] = cleanNoise(mono, rate, level, (p) => setClean((c) => (c && c.level === level ? { level, p } : c))).then((y) => {
        cleaned.current[level] = y;
        bump((n) => n + 1);
        return y;
      });
    return cleaning.current[level]!;
  };
  useEffect(() => {
    if (cleaned.current[noise]) return setClean(null);
    let live = true;
    setClean({ level: noise, p: 0 });
    cleanFor(noise).then(() => live && setClean(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noise]);
  useEffect(() => setEditState((e) => ({ ...e, noise })), [noise]);

  const echo = edit.echo ?? 0;
  const base = cleaned.current[noise] ?? mono;
  const data = useMemo(() => reduceEcho(base, rate, echo), [base, rate, echo]);

  const peakIn = useMemo(() => {
    let m = 0;
    for (const [a0, b0] of keptRanges(edit)) for (let i = Math.round(a0 * rate), b = Math.round(b0 * rate); i < b; i += 4) m = Math.max(m, Math.abs(data[i] ?? 0));
    return m;
  }, [data, edit, rate]);
  const effGain = edit.even && peakIn > 0.001 ? (edit.gain * 0.89) / peakIn : edit.gain;
  const loud = peakIn * effGain > 1.02;

  // ------------------------------------------------------------ playing
  // The finished sound (with every change) from the playhead; the playhead follows it on the wave.
  const finished = useMemo(() => assemble(data, rate, edit), [data, rate, edit]);
  const stop = () => {
    try {
      node.current?.src.stop();
    } catch {
      /* stopped */
    }
    node.current = null;
    setPlaying(false);
    setHearing('');
    setMeter(0);
  };
  useEffect(() => () => (stop(), void ctx.current?.close()), []);
  const ac = () => (ctx.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
  const playFrom = (t: number, e: Edit = edit, buf: Float32Array = finished, until?: number) => {
    stop();
    const c = ac();
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = bufferOf(buf, rate);
    const an = c.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    an.connect(c.destination);
    const total = buf.length / rate;
    const from = Math.min(Math.max(0, toOut(t, e)), Math.max(0, total - 0.05));
    const start = from >= total - 0.06 ? 0 : from;
    src.start(0, start);
    src.onended = () => node.current?.src === src && stop();
    node.current = { src, an, at: c.currentTime, from: start, edit: e, until: until !== undefined ? toOut(until, e) : undefined };
    setPlaying(true);
  };
  const playSel = () => sel && playFrom(sel.a, edit, finished, sel.b);
  const loopRef = useRef({ loop, sel });
  loopRef.current = { loop, sel };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const buf = new Float32Array(1024);
    const step = () => {
      const n = node.current;
      if (n && ctx.current) {
        const o = n.from + (ctx.current.currentTime - n.at);
        const where = toSrc(o, n.edit);
        setHead(where.t);
        setHearing(where.ins ? EFFECTS.find((f) => f.k === where.ins!.kind)?.label ?? '' : '');
        n.an.getFloatTimeDomainData(buf);
        let pk = 0;
        for (const v of buf) pk = Math.max(pk, Math.abs(v));
        setMeter((m) => Math.max(pk, m * 0.9));
        const end = n.until;
        if (end !== undefined && o >= end) {
          const { loop: lp, sel: s } = loopRef.current;
          if (lp && s) playFrom(s.a, n.edit, finished, s.b);
          else stop();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const toggle = () => (playing ? stop() : sel && loop ? playSel() : playFrom(head >= edit.end - 0.05 ? edit.start : head));
  const nudge = (d: number) => {
    const t = Math.max(edit.start, Math.min(edit.end, head + d));
    setHead(t);
    if (playing) playFrom(t);
  };

  // ------------------------------------------------------------ editing actions
  // Added where the playhead is, then played from just before it so you hear it in place.
  const add = (kind: Effect) => {
    const fx = EFFECTS.find((x) => x.k === kind)!;
    const at = Math.max(edit.start, Math.min(edit.end, head));
    const next = { ...edit, inserts: [...edit.inserts, { id: newId(), at, kind, dur: kind === 'silence' ? silence : fx.dur }] };
    setEdit(next);
    playFrom(Math.max(edit.start, at - 1.2), next, assemble(data, rate, next));
  };
  // Quiet at the ends of a recording: found from the level, with a little room left.
  const trimQuiet = () => {
    const thr = Math.max(0.02, peakIn * 0.06);
    let a = 0;
    let b = data.length - 1;
    while (a < data.length && Math.abs(data[a]) < thr) a++;
    while (b > a && Math.abs(data[b]) < thr) b--;
    if (b <= a) return;
    setEdit((e) => ({ ...e, start: Math.max(0, a / rate - 0.25), end: Math.min(length, b / rate + 0.35) }));
  };
  const cutSel = () => {
    if (!sel || sel.b - sel.a < 0.02) return;
    stop();
    setEdit((e) => ({ ...e, cuts: [...(e.cuts ?? []), { id: newId(), a: sel.a, b: sel.b }] }));
    setHead(sel.a);
    setSel(null);
  };
  const keepSel = () => {
    if (!sel || sel.b - sel.a < 0.2) return;
    stop();
    setEdit((e) => ({ ...e, start: sel.a, end: sel.b }));
    setHead(sel.a);
    setSel(null);
  };
  // Long pauses shortened to half a second: tidies a reading without changing the words.
  const tightenPauses = () => {
    const thr = Math.max(0.015, peakIn * 0.05);
    const win = Math.round(0.02 * rate);
    const cuts: { id: string; a: number; b: number }[] = [];
    let quietFrom = -1;
    for (let i = Math.round(edit.start * rate); i < Math.round(edit.end * rate); i += win) {
      let m = 0;
      for (let k = i; k < Math.min(data.length, i + win); k++) m = Math.max(m, Math.abs(data[k]));
      if (m < thr) {
        if (quietFrom < 0) quietFrom = i;
      } else if (quietFrom >= 0) {
        const len = (i - quietFrom) / rate;
        if (len > 1.2) cuts.push({ id: newId(), a: quietFrom / rate + 0.25, b: i / rate - 0.25 });
        quietFrom = -1;
      }
    }
    if (cuts.length) setEdit((e) => ({ ...e, cuts: [...(e.cuts ?? []), ...cuts] }));
    return cuts.length;
  };
  const [tightened, setTightened] = useState<number | null>(null);

  // Keyboard shortcuts, like audio software.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable=true]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') e.preventDefault(), e.stopPropagation(), toggle();
      else if (mod && e.key.toLowerCase() === 'z') e.preventDefault(), e.shiftKey ? redo() : undo();
      else if (mod && e.key.toLowerCase() === 'y') e.preventDefault(), redo();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) e.preventDefault(), cutSel();
      else if (e.key === 'Home') e.preventDefault(), setHead(edit.start);
      else if (e.key === 'End') e.preventDefault(), setHead(edit.end);
      else if (e.key === 'ArrowLeft' && !el.closest('[role=slider]')) e.preventDefault(), nudge(e.shiftKey ? -5 : -1);
      else if (e.key === 'ArrowRight' && !el.closest('[role=slider]')) e.preventDefault(), nudge(e.shiftKey ? 5 : 1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(64, z * 1.6));
      else if (e.key === '-') setZoom((z) => Math.max(1, z / 1.6));
      else if (e.key.toLowerCase() === 'l') setLoop((v) => !v);
      else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  // ------------------------------------------------------------ saving
  const finalLen = finishedLength(edit);
  const unchanged = edit.start < 0.01 && edit.end > length - 0.01 && edit.gain === 1 && !edit.even && noise === 0 && !edit.inserts.length && !(edit.cuts ?? []).length && !edit.fadeIn && !edit.fadeOut && !echo;
  const asIs = unchanged && keepAsIs(source.file, length, quality);
  const est = asIs && source.file ? (source.file.size * 4) / 3 : (finalLen / 60) * storedPerMinute(quality);
  // The finished sound as a file, with its script timed to the new version.
  const produce = async () => {
    let d = data;
    if (!cleaned.current[noise]) {
      setSaving({ stage: 'Cleaning up the sound', p: 0 });
      d = reduceEcho(await cleanFor(noise), rate, echo);
    }
    let blob: Blob;
    let duration = length;
    if (asIs && source.file) blob = source.file;
    else {
      setSaving({ stage: 'Putting it together', p: 0.05 });
      const out = assemble(d, rate, edit);
      duration = out.length / rate;
      setSaving({ stage: 'Making it smaller', p: 0.08 });
      blob = await encodeMp3(out, rate, quality, (p) => setSaving({ stage: 'Making it smaller', p: 0.08 + p * 0.52 }));
    }
    const lines = script
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const marks = source.marks ?? [];
    const sc: ScriptLine[] = lines.map((text, i) => ({ text, t: marks[i] !== undefined && Number.isFinite(marks[i]) ? mapTime(marks[i], edit) : null }));
    return { blob, duration: +duration.toFixed(2), sc, name: title.trim() || 'Recording', base: asIs ? 0 : 0.6 };
  };
  const save = async () => {
    if (!user) return setError('Sign in again to save.');
    stop();
    setError('');
    try {
      const { blob, duration, sc, name, base } = await produce();
      setSaving({ stage: 'Uploading', p: base });
      const { mediaId, bytes } = await saveSound(classId, blob, { title: name, script: sc, duration }, (p) => setSaving({ stage: 'Uploading', p: base + p * (0.97 - base) }));
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
      await replace.run(blob, { script: sc, duration }, (p) => setSaving({ stage: 'Replacing it everywhere', p: base + p * (0.99 - base) }));
      setSaving({ stage: 'Saved', p: 1 });
      onSaved({ mediaId: '', archiveId: '', title: replace.name, script: sc });
    } catch (e) {
      console.error(e);
      setSaving(null);
      setError('It could not be replaced. Check your connection and try again.');
    }
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
          {formatBytes(est)} · {short(finalLen)} long. Keep this window open until it is saved.
        </span>
      </div>
    );

  const outHead = Math.max(0, toOut(head, edit));
  const cuts = edit.cuts ?? [];
  return (
    <div className="daw">
      {/* Transport */}
      <div className="daw-transport">
        <span className="daw-btns">
          <button type="button" className="daw-b" onClick={() => (setHead(edit.start), playing && playFrom(edit.start))} aria-label="To the start" data-tip="To the start (Home)">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5v11M13 3 6 8l7 5z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="daw-b" onClick={() => nudge(-5)} aria-label="Back 5 seconds" data-tip="Back 5 s (Shift ←)">
            <svg width="16" height="14" viewBox="0 0 18 16" aria-hidden="true"><path d="M9 3 2 8l7 5zM16 3 9 8l7 5z" fill="currentColor" /></svg>
          </button>
          <button type="button" className={'daw-play' + (playing ? ' on' : '')} onClick={toggle} aria-label={playing ? 'Stop' : 'Play'} data-tip={playing ? 'Stop (Space)' : 'Play (Space)'}>
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
            )}
          </button>
          <button type="button" className="daw-b" onClick={() => nudge(5)} aria-label="Forward 5 seconds" data-tip="Forward 5 s (Shift →)">
            <svg width="16" height="14" viewBox="0 0 18 16" aria-hidden="true"><path d="M2 3l7 5-7 5zM9 3l7 5-7 5z" fill="currentColor" /></svg>
          </button>
          <button type="button" className={'daw-b' + (loop ? ' on' : '')} onClick={() => setLoop((v) => !v)} aria-pressed={loop} aria-label="Loop the selection" data-tip="Loop the selection (L)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>
          </button>
        </span>
        <span className="daw-lcd" aria-live="off">
          <b>{clock(outHead)}</b>
          <span>/ {clock(finalLen)}</span>
          {hearing && <em>{hearing}</em>}
        </span>
        <span className="daw-meter" aria-hidden="true" title="Level">
          <span style={{ width: `${Math.min(100, meter * 100)}%` }} className={meter > 0.97 ? 'hot' : ''} />
        </span>
        <span style={{ flex: 1 }} />
        <span className="daw-btns">
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
          <button type="button" className="daw-b" onClick={() => setZoom((z) => Math.min(64, z * 1.6))} aria-label="Zoom in" data-tip="Zoom in (+)">
            +
          </button>
        </span>
      </div>

      {/* The wave */}
      <WaveEdit data={data} rate={rate} edit={edit} head={head} sel={sel} zoom={zoom} playing={playing} onZoom={setZoom} onHead={(t) => (setHead(t), playing && playFrom(t))} onSel={setSel} onEdit={(f) => setEdit(f, 'trim')} marks={source.marks} onRemoveCut={(id) => setEdit((e) => ({ ...e, cuts: (e.cuts ?? []).filter((c) => c.id !== id) }))} />

      {/* What can be done with the selection, or a hint */}
      <div className="daw-selbar">
        {sel ? (
          <>
            <span className="daw-sel-t">
              Selection <b>{short(sel.a)}</b> to <b>{short(sel.b)}</b> · {(sel.b - sel.a).toFixed(1)} s
            </span>
            <button type="button" className="btn small-btn" onClick={playSel}>
              <UiIcon name="video" size={13} /> Play it
            </button>
            <button type="button" className="btn small-btn" onClick={cutSel} data-tip="Delete">
              <UiIcon name="trash" size={13} /> Cut it out
            </button>
            <button type="button" className="btn small-btn" onClick={keepSel}>
              Keep only this
            </button>
            <button type="button" className="btn link small" onClick={() => setSel(null)}>
              Clear
            </button>
          </>
        ) : (
          <span className="hint">
            Click to place the playhead. Drag across the wave to select a part to play, loop, cut out or keep. Drag the dark handles to trim the ends. Scroll with Ctrl or pinch to zoom.
          </span>
        )}
      </div>

      <div className="daw-body">
        {/* The rack */}
        <div className="daw-rack">
          <section className="daw-mod">
            <h4>Level</h4>
            <span className="daw-row">
              <span className="daw-lab">Volume</span>
              <input type="range" min={0.2} max={3} step={0.05} value={edit.gain} onChange={(e) => setEdit((x) => ({ ...x, gain: Number(e.target.value) }), 'gain')} aria-label="Volume" />
              <b className="daw-val">{Math.round(edit.gain * 100)}%</b>
            </span>
            <label className="check-row">
              <input type="checkbox" checked={edit.even} onChange={(e) => setEdit((x) => ({ ...x, even: e.target.checked }))} />
              As loud as it can be without distortion
            </label>
            {loud && <span className="hint warn">Some loud parts will be softened to avoid distortion.</span>}
          </section>
          <section className="daw-mod">
            <h4>Fades</h4>
            <span className="daw-row">
              <span className="daw-lab">Fade in</span>
              <input type="range" min={0} max={4} step={0.1} value={edit.fadeIn ?? 0} onChange={(e) => setEdit((x) => ({ ...x, fadeIn: Number(e.target.value) }), 'fi')} aria-label="Fade in" />
              <b className="daw-val">{(edit.fadeIn ?? 0).toFixed(1)} s</b>
            </span>
            <span className="daw-row">
              <span className="daw-lab">Fade out</span>
              <input type="range" min={0} max={4} step={0.1} value={edit.fadeOut ?? 0} onChange={(e) => setEdit((x) => ({ ...x, fadeOut: Number(e.target.value) }), 'fo')} aria-label="Fade out" />
              <b className="daw-val">{(edit.fadeOut ?? 0).toFixed(1)} s</b>
            </span>
          </section>
          <section className="daw-mod">
            <h4>Clean up</h4>
            <span className="daw-row col">
              <span className="daw-lab">Background noise</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Background noise">
                {(['Leave', 'Reduce', 'More'] as const).map((l, i) => (
                  <button key={l} type="button" role="radio" aria-checked={noise === i} className={noise === i ? 'on' : ''} onClick={() => setNoise(i as NoiseLevel)}>
                    {l}
                  </button>
                ))}
              </span>
            </span>
            <span className="hint">{clean ? `Cleaning up the sound… ${Math.round(clean.p * 100)}%` : source.roomDb !== undefined ? `Your room measured ${Math.round(source.roomDb)} dB${source.roomDb > -50 ? ', so a little reduction helps.' : ', which is quiet.'}` : 'Hum, hiss and fan noise.'}</span>
            <span className="daw-row col">
              <span className="daw-lab">Room echo</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Room echo">
                {(['Leave', 'Reduce', 'More'] as const).map((l, i) => (
                  <button key={l} type="button" role="radio" aria-checked={echo === i} className={echo === i ? 'on' : ''} onClick={() => setEdit((x) => ({ ...x, echo: i as NoiseLevel }))}>
                    {l}
                  </button>
                ))}
              </span>
            </span>
            <span className="hint">Shortens the ring after each word in a bare room. Listen to check it sounds natural.</span>
            <span className="daw-row wrap">
              <button type="button" className="btn small-btn" onClick={trimQuiet}>
                Trim the quiet ends
              </button>
              <button type="button" className="btn small-btn" onClick={() => setTightened(tightenPauses())}>
                Shorten long pauses
              </button>
            </span>
            {tightened !== null && <span className="hint">{tightened ? `${tightened} long ${tightened === 1 ? 'pause' : 'pauses'} shortened. Undo to put ${tightened === 1 ? 'it' : 'them'} back.` : 'No long pauses found.'}</span>}
          </section>
          <section className="daw-mod">
            <h4>Add at the playhead · {short(outHead)}</h4>
            <span className="daw-row wrap">
              <span className="sed-silence">
                <button type="button" className="btn small-btn" onClick={() => add('silence')}>
                  <UiIcon name="silence" size={14} /> Silence
                </button>
                <select value={silence} onChange={(e) => setSilence(Number(e.target.value))} aria-label="Length of silence">
                  {[0.5, 1, 2, 3, 5, 10, 20, 30].map((x) => (
                    <option key={x} value={x}>
                      {x} s
                    </option>
                  ))}
                </select>
              </span>
              {EFFECTS.filter((f) => f.k !== 'silence').map((f) => (
                <button key={f.k} type="button" className="btn small-btn" onClick={() => add(f.k)}>
                  <UiIcon name={EFFECT_ICON[f.k]} size={14} /> {f.label}
                </button>
              ))}
            </span>
            {(edit.inserts.length > 0 || cuts.length > 0) && (
              <span className="sed-ins">
                {[...edit.inserts]
                  .sort((a, b) => a.at - b.at)
                  .map((i) => (
                    <span key={i.id} className="sed-chip">
                      <button type="button" className="sed-chip-play" onClick={() => playFrom(Math.max(edit.start, i.at - 1.2))} aria-label="Play it">
                        <UiIcon name={EFFECT_ICON[i.kind]} size={14} />
                        {EFFECTS.find((f) => f.k === i.kind)?.label}
                        {i.kind === 'silence' && ` ${i.dur} s`} at {short(toOut(i.at, edit))}
                      </button>
                      <button type="button" aria-label="Remove" onClick={() => setEdit((e) => ({ ...e, inserts: e.inserts.filter((x) => x.id !== i.id) }))}>
                        ×
                      </button>
                    </span>
                  ))}
                {cuts.length > 0 && (
                  <span className="sed-chip">
                    <span className="sed-chip-play">
                      <UiIcon name="trash" size={13} /> {cuts.length} {cuts.length === 1 ? 'part' : 'parts'} cut out
                    </span>
                    <button type="button" aria-label="Put them back" title="Put them back" onClick={() => setEdit((e) => ({ ...e, cuts: [] }))}>
                      ×
                    </button>
                  </span>
                )}
              </span>
            )}
          </section>
        </div>

        {/* Saving */}
        <div className="daw-side">
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
            <span className="hint">
              {SOUND_QUALITY.find((q) => q.k === quality)?.about.split(',')[0]}. About {formatBytes(est)}
              {asIs ? ', kept as it is' : ''}.
            </span>
          </div>
          <label className="field">
            <span>Script for karaoke (optional)</span>
            <textarea className="se-bulk short" value={script} onChange={(e) => setScript(e.target.value)} placeholder="One line for each sentence or speaker turn. You can time the lines after saving." />
            <span className="se-tools">
              {source.marks?.some((m) => Number.isFinite(m)) ? <span className="hint">{source.marks.filter((m) => Number.isFinite(m)).length} lines timed{source.recorded ? ' while recording' : ''}; the times follow your edits.</span> : <span className="hint">Time each line after saving, in Script and timing.</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn link" disabled={!script.trim()} onClick={() => setScript(splitScript(script).join('\n'))}>
                One line per sentence
              </button>
            </span>
          </label>
        </div>
      </div>

      {error && <span className="hint warn">{error}</span>}
      <span className="pe-actions">
        <button type="button" className="btn link" onClick={onBack}>
          {backLabel}
        </button>
        <span className="hint daw-keys">Space play · ← → move · Delete cut · Ctrl Z undo · L loop · + − zoom</span>
        <span style={{ flex: 1 }} />
        {replace ? (
          <>
            <button type="button" className="btn" onClick={save} disabled={finalLen < 0.2}>
              Save as a new sound
            </button>
            <button type="button" className="btn primary" onClick={askReplace} disabled={finalLen < 0.2}>
              Replace this sound…
            </button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={save} disabled={finalLen < 0.2}>
            Save
          </button>
        )}
      </span>
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

// A sensible step for the time ruler at this zoom.
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

// The wave: a ruler, the sound drawn at any zoom, trim handles, cut parts, the selection and the
// playhead. Scrolls sideways when zoomed in, and follows the playhead while playing.
function WaveEdit({ data, rate, edit, head, sel, zoom, playing, onZoom, onHead, onSel, onEdit, marks, onRemoveCut }: { data: Float32Array; rate: number; edit: Edit; head: number; sel: Sel; zoom: number; playing: boolean; onZoom: (f: (z: number) => number) => void; onHead: (t: number) => void; onSel: (s: Sel) => void; onEdit: (f: (e: Edit) => Edit) => void; marks?: number[]; onRemoveCut: (id: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const len = data.length / rate;
  const idx = useMemo<PeakIndex>(() => peakIndex(data), [data]);
  const top = useMemo(() => {
    let m = 0.001;
    for (let k = 0; k < idx.max.length; k++) m = Math.max(m, idx.max[k], -idx.min[k]);
    return m;
  }, [idx]);
  const drag = useRef<'s' | 'e' | null>(null);
  const [vw, setVw] = useState(800);
  const [scroll, setScroll] = useState(0);
  const width = vw * zoom;

  useLayoutEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const ro = new ResizeObserver(() => setVw(s.clientWidth));
    ro.observe(s);
    setVw(s.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Keep the playhead in view while zooming and playing.
  useEffect(() => {
    const s = scroller.current;
    if (!s || zoom <= 1) return;
    const x = (head / len) * width;
    if (x < s.scrollLeft + 40 || x > s.scrollLeft + vw - 40) s.scrollLeft = Math.max(0, x - (playing ? vw * 0.2 : vw / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, playing && Math.floor((head / len) * width / Math.max(1, vw * 0.6))]);

  // Only the part in view is drawn.
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = vw;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(c);
    const accent = css.getPropertyValue('--accent').trim() || '#d98f63';
    const ink = css.getPropertyValue('--muted').trim() || '#8a847d';
    const RULER = 20;
    const mid = RULER + (h - RULER) / 2;
    const amp = (h - RULER) / 2 - 6;
    // centre line
    g.fillStyle = 'rgba(128,128,128,.18)';
    g.fillRect(0, mid, w, 1);
    // the wave, as a filled outline (min to max per pixel)
    const spp = (len * rate) / width; // samples per pixel
    g.fillStyle = accent;
    for (let x = 0; x < w; x++) {
      const a = (scroll + x) * spp;
      const [lo, hi] = rangePeak(data, idx, a, a + Math.max(1, spp));
      const y0 = mid - (hi / top) * amp;
      const y1 = mid - (lo / top) * amp;
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    // the ruler
    const pps = width / len; // pixels per second
    const step = STEPS.find((s) => s * pps >= 70) ?? 600;
    g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillStyle = ink;
    g.textBaseline = 'top';
    const t0 = Math.floor(scroll / pps / step) * step;
    for (let t = t0; t <= (scroll + w) / pps + step; t += step / 2) {
      const x = t * pps - scroll;
      if (x < -40 || x > w + 40) continue;
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      g.fillRect(Math.round(x), major ? 12 : 15, 1, major ? 8 : 5);
      if (major) g.fillText(step < 1 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`, Math.round(x) + 3, 1);
    }
    g.fillStyle = 'rgba(128,128,128,.22)';
    g.fillRect(0, RULER, w, 1);
  }, [idx, top, vw, width, scroll, len, rate, data]);

  const at = (clientX: number) => {
    const r = inner.current!.getBoundingClientRect();
    return Math.max(0, Math.min(len, ((clientX - r.left) / r.width) * len));
  };
  const pc = (t: number) => `${(t / len) * 100}%`;
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.we-handle, .daw-cut-x')) return;
    const t0 = at(e.clientX);
    const x0 = e.clientX;
    const extend = e.shiftKey && sel;
    let moved = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      moved = true;
      const t = at(ev.clientX);
      const a = extend ? (Math.abs(t0 - sel!.a) < Math.abs(t0 - sel!.b) ? sel!.b : sel!.a) : t0;
      onSel({ a: Math.min(a, t), b: Math.max(a, t) });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        if (extend) onSel({ a: Math.min(sel!.a, t0), b: Math.max(sel!.b, t0) });
        else onSel(null), onHead(t0);
      } else onHead(Math.min(t0, at(x0)));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const wheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const s = scroller.current!;
    const r = s.getBoundingClientRect();
    const tAt = ((s.scrollLeft + e.clientX - r.left) / width) * len;
    onZoom((z) => {
      const nz = Math.max(1, Math.min(64, z * (e.deltaY < 0 ? 1.25 : 0.8)));
      requestAnimationFrame(() => (s.scrollLeft = Math.max(0, (tAt / len) * vw * nz - (e.clientX - r.left))));
      return nz;
    });
  };
  return (
    <div className="daw-wave" ref={scroller} onScroll={(e) => setScroll((e.target as HTMLElement).scrollLeft)} onWheel={wheel}>
      <div className="daw-inner" ref={inner} style={{ width }} onPointerDown={down}>
        <canvas ref={cv} className="daw-cv" style={{ left: scroll, width: vw }} />
        <span className="we-cut" style={{ left: 0, width: pc(edit.start) }} />
        <span className="we-cut" style={{ left: pc(edit.end), right: 0 }} />
        {(edit.cuts ?? []).map((c) => (
          <span key={c.id} className="daw-cut" style={{ left: pc(Math.min(c.a, c.b)), width: pc(Math.abs(c.b - c.a)) }}>
            <button type="button" className="daw-cut-x" onClick={() => onRemoveCut(c.id)} aria-label="Put this part back" data-tip="Put this part back">
              ×
            </button>
          </span>
        ))}
        {sel && <span className="daw-sel" style={{ left: pc(sel.a), width: pc(sel.b - sel.a) }} />}
        {(marks ?? []).map((m, i) => (
          <span key={'m' + i} className="wv-mark" style={{ left: pc(m) }}>
            <span className="wv-flag">{i + 1}</span>
          </span>
        ))}
        {edit.inserts.map((i) => (
          <span key={i.id} className="we-ins" style={{ left: pc(Math.max(edit.start, Math.min(edit.end, i.at))) }} title={EFFECTS.find((f) => f.k === i.kind)?.label}>
            <UiIcon name={EFFECT_ICON[i.kind]} size={12} />
          </span>
        ))}
        <span className="daw-head" style={{ left: pc(head) }} />
        {(['s', 'e'] as const).map((k) => (
          <span
            key={k}
            className={'we-handle ' + k}
            style={{ left: pc(k === 's' ? edit.start : edit.end) }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = k;
            }}
            onPointerMove={(e) => {
              if (drag.current !== k) return;
              const t = at(e.clientX);
              onEdit((x) => (k === 's' ? { ...x, start: Math.min(t, x.end - 0.2) } : { ...x, end: Math.max(t, x.start + 0.2) }));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            role="slider"
            aria-label={k === 's' ? 'Start' : 'End'}
            aria-valuemin={0}
            aria-valuemax={Math.round(len)}
            aria-valuenow={Math.round(k === 's' ? edit.start : edit.end)}
            tabIndex={0}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowLeft' ? -0.1 : e.key === 'ArrowRight' ? 0.1 : 0;
              if (!d) return;
              e.preventDefault();
              e.stopPropagation();
              onEdit((x) => (k === 's' ? { ...x, start: Math.max(0, Math.min(x.end - 0.2, x.start + d)) } : { ...x, end: Math.min(len, Math.max(x.start + 0.2, x.end + d)) }));
            }}
          />
        ))}
      </div>
    </div>
  );
}
