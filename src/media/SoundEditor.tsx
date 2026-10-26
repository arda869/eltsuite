import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assemble, bufferOf, EFFECTS, finishedLength, fmtTime, mapTime, peaks, reduceNoise, toMono, type Edit, type Effect, type NoiseLevel } from '../lib/sound';
import { encodeMp3, SOUND_QUALITY, storedPerMinute, type SoundQuality } from '../lib/audioEncode';
import { archiveAdd, formatBytes, saveSound, type ScriptLine } from '../lib/archive';
import { useAuth } from '../lib/auth';
import { newId } from '../lib/tasks';
import { splitScript } from './ScriptEditor';
import { UiIcon } from '../components/UiIcon';

// After recording or choosing a sound: trim it, set the volume, clean up background noise, add
// silence or a bell, choose the quality, then save it to the class and the media archive.

export type SoundSource = { buffer: AudioBuffer; name: string; marks?: number[]; script?: string[]; roomDb?: number; recorded?: boolean };
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

export function SoundEditor({ source, classId, onSaved, onBack, backLabel }: { source: SoundSource; classId: string; onSaved: (s: SavedSound) => void; onBack: () => void; backLabel: string }) {
  const { user } = useAuth();
  const rate = source.buffer.sampleRate;
  const mono = useMemo(() => toMono(source.buffer), [source.buffer]);
  const length = mono.length / rate;
  const [noise, setNoise] = useState<NoiseLevel>(source.roomDb !== undefined && source.roomDb > -50 ? 1 : 0);
  const cleaned = useRef<Partial<Record<NoiseLevel, Float32Array>>>({ 0: mono });
  const [clean, setClean] = useState<{ level: NoiseLevel; p: number } | null>(null);
  const [, bump] = useState(0);
  const [edit, setEdit] = useState<Edit>({ start: 0, end: length, gain: 1, even: false, noise: 0, inserts: [] });
  const [head, setHead] = useState(0);
  const [where, setWhere] = useState<'start' | 'head' | 'end'>('head');
  const [silence, setSilence] = useState(1);
  const [quality, setQualityState] = useState<SoundQuality>(savedQ);
  const [title, setTitle] = useState(source.name);
  const [script, setScript] = useState((source.script ?? []).join('\n'));
  const [busy, setBusy] = useState('');
  const [playing, setPlaying] = useState<'' | 'part' | 'all'>('');
  const ctx = useRef<AudioContext | null>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const started = useRef<{ at: number; from: number; rate: number } | null>(null);

  const data = cleaned.current[noise] ?? mono;
  const setQuality = (q: SoundQuality) => {
    setQualityState(q);
    try {
      localStorage.setItem('ll.soundQuality', q);
    } catch {
      /* fine */
    }
  };

  // Noise reduction takes a moment, so each strength is worked out once.
  useEffect(() => {
    if (cleaned.current[noise]) return;
    let live = true;
    setClean({ level: noise, p: 0 });
    reduceNoise(mono, rate, noise, (p) => live && setClean({ level: noise, p })).then((y) => {
      cleaned.current[noise] = y;
      if (live) setClean(null), bump((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [noise, mono, rate]);
  useEffect(() => setEdit((e) => ({ ...e, noise })), [noise]);

  const peakIn = useMemo(() => {
    const a = Math.round(edit.start * rate);
    const b = Math.round(edit.end * rate);
    let m = 0;
    for (let i = a; i < b; i += 4) m = Math.max(m, Math.abs(data[i] ?? 0));
    return m;
  }, [data, edit.start, edit.end, rate]);
  const effGain = edit.even && peakIn > 0.001 ? (edit.gain * 0.89) / peakIn : edit.gain;
  const loud = peakIn * effGain > 1.02;

  const stop = () => {
    try {
      node.current?.stop();
    } catch {
      /* stopped */
    }
    node.current = null;
    started.current = null;
    setPlaying('');
  };
  useEffect(() => () => (stop(), void ctx.current?.close()), []);
  const ac = () => (ctx.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
  const playPart = () => {
    stop();
    const c = ac();
    void c.resume();
    const from = head >= edit.start && head < edit.end - 0.05 ? head : edit.start;
    const src = c.createBufferSource();
    src.buffer = bufferOf(data, rate);
    const g = c.createGain();
    g.gain.value = Math.min(effGain, 4);
    src.connect(g).connect(c.destination);
    src.start(0, from, Math.max(0.01, edit.end - from));
    src.onended = () => node.current === src && (setPlaying(''), (node.current = null));
    node.current = src;
    started.current = { at: c.currentTime, from, rate: 1 };
    setPlaying('part');
  };
  const playAll = () => {
    stop();
    const c = ac();
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = bufferOf(assemble(data, rate, edit), rate);
    src.connect(c.destination);
    src.start();
    src.onended = () => node.current === src && (setPlaying(''), (node.current = null));
    node.current = src;
    started.current = null;
    setPlaying('all');
  };
  // The playhead follows the preview.
  useEffect(() => {
    if (playing !== 'part') return;
    let raf = 0;
    const tick = () => {
      const s = started.current;
      if (s && ctx.current) setHead(Math.min(edit.end, s.from + (ctx.current.currentTime - s.at)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, edit.end]);

  const add = (kind: Effect) => {
    const fx = EFFECTS.find((x) => x.k === kind)!;
    const at = where === 'start' ? edit.start : where === 'end' ? edit.end : Math.max(edit.start, Math.min(edit.end, head));
    setEdit((e) => ({ ...e, inserts: [...e.inserts, { id: newId(), at, kind, dur: kind === 'silence' ? silence : fx.dur }] }));
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

  const finalLen = finishedLength(edit);
  const est = (finalLen / 60) * storedPerMinute(quality);
  const save = async () => {
    if (!user) return setBusy('Sign in again to save.');
    stop();
    try {
      setBusy('Putting it together…');
      const out = assemble(data, rate, edit);
      const blob = await encodeMp3(out, rate, quality, (p) => setBusy(`Making it smaller… ${Math.round(p * 100)}%`));
      setBusy('Saving…');
      const lines = script
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const marks = source.marks ?? [];
      const sc: ScriptLine[] = lines.map((text, i) => ({ text, t: marks[i] !== undefined ? mapTime(marks[i], edit) : null }));
      const name = title.trim() || 'Recording';
      const duration = +(out.length / rate).toFixed(2);
      const { mediaId, bytes } = await saveSound(classId, blob, { title: name, script: sc, duration });
      const archiveId = await archiveAdd(user.uid, { kind: 'audio', name, folder: '', tags: [], size: Math.round((bytes * 4) / 3), home: { classId, mediaId }, script: sc, duration });
      onSaved({ mediaId, archiveId, title: name, script: sc });
    } catch (e) {
      console.error(e);
      setBusy('It could not be saved. Check your connection and try again.');
    }
  };

  return (
    <div className="sed">
      <WaveEdit data={data} rate={rate} edit={edit} head={head} onHead={(t) => (setHead(t), playing === 'part' && stop())} onEdit={setEdit} marks={source.marks} />
      <div className="sed-play">
        <button type="button" className="mp-play" onClick={() => (playing === 'part' ? stop() : playPart())} aria-label={playing === 'part' ? 'Stop' : 'Play'}>
          {playing === 'part' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="mp-time">
          {fmtTime(head)}
          <span> · kept {fmtTime(edit.end - edit.start)}</span>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn small-btn" onClick={trimQuiet}>
          Trim the quiet ends
        </button>
        <button type="button" className="btn small-btn" onClick={() => setEdit((e) => ({ ...e, start: 0, end: length }))} disabled={edit.start < 0.01 && edit.end > length - 0.01}>
          Keep it all
        </button>
        <button type="button" className={'btn small-btn' + (playing === 'all' ? ' primary' : '')} onClick={() => (playing === 'all' ? stop() : playAll())}>
          {playing === 'all' ? 'Stop' : 'Listen to the result'}
        </button>
      </div>
      <span className="hint">Drag the two handles to trim. Click the wave to move the playhead.</span>

      <div className="sed-grid">
        <div className="field" style={{ gap: 6 }}>
          <span>Volume</span>
          <span className="sed-vol">
            <input type="range" min={0.2} max={3} step={0.05} value={edit.gain} onChange={(e) => setEdit((x) => ({ ...x, gain: Number(e.target.value) }))} aria-label="Volume" />
            <b>{Math.round(edit.gain * 100)}%</b>
          </span>
          <label className="check-row">
            <input type="checkbox" checked={edit.even} onChange={(e) => setEdit((x) => ({ ...x, even: e.target.checked }))} />
            Make it as loud as it can be without distortion
          </label>
          {loud && <span className="hint warn">Some loud parts will be softened to avoid distortion.</span>}
        </div>
        <div className="field" style={{ gap: 6 }}>
          <span>Background noise</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Background noise">
            {(['Leave it', 'Reduce', 'Reduce more'] as const).map((l, i) => (
              <button key={l} type="button" role="radio" aria-checked={noise === i} className={noise === i ? 'on' : ''} onClick={() => setNoise(i as NoiseLevel)}>
                {l}
              </button>
            ))}
          </span>
          <span className="hint">
            {clean ? `Cleaning up the sound… ${Math.round(clean.p * 100)}%` : source.roomDb !== undefined ? `Your room measured ${Math.round(source.roomDb)} dB${source.roomDb > -50 ? ', so a little reduction helps.' : ', which is quiet.'}` : 'Takes out hum, hiss and fan noise. Listen to check the voice still sounds natural.'}
          </span>
        </div>
      </div>

      <div className="field" style={{ gap: 6 }}>
        <span>Add silence or a sound</span>
        <span className="sed-add">
          <span className="seg small-seg" role="radiogroup" aria-label="Where">
            {(
              [
                ['start', 'At the start'],
                ['head', 'At the playhead'],
                ['end', 'At the end'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={where === k} className={where === k ? 'on' : ''} onClick={() => setWhere(k)}>
                {l}
              </button>
            ))}
          </span>
          <span className="sed-fx">
            <span className="sed-silence">
              <button type="button" className="btn small-btn" onClick={() => add('silence')}>
                Silence
              </button>
              <select value={silence} onChange={(e) => setSilence(Number(e.target.value))} aria-label="Length of silence">
                {[0.5, 1, 2, 3, 5, 10, 20, 30].map((s) => (
                  <option key={s} value={s}>
                    {s} s
                  </option>
                ))}
              </select>
            </span>
            {EFFECTS.filter((f) => f.k !== 'silence').map((f) => (
              <button key={f.k} type="button" className="btn small-btn" onClick={() => add(f.k)}>
                {f.label}
              </button>
            ))}
          </span>
        </span>
        {edit.inserts.length > 0 && (
          <span className="sed-ins">
            {[...edit.inserts]
              .sort((a, b) => a.at - b.at)
              .map((i) => (
                <span key={i.id} className="sed-chip">
                  <UiIcon name={EFFECT_ICON[i.kind]} size={14} />
                  {EFFECTS.find((f) => f.k === i.kind)?.label}
                  {i.kind === 'silence' && ` ${i.dur} s`} at {fmtTime(i.at - edit.start)}
                  <button type="button" aria-label="Remove" onClick={() => setEdit((e) => ({ ...e, inserts: e.inserts.filter((x) => x.id !== i.id) }))}>
                    ×
                  </button>
                </span>
              ))}
          </span>
        )}
      </div>

      <div className="sed-grid">
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
            {SOUND_QUALITY.find((q) => q.k === quality)?.about.split(',')[0]}. This one takes about {formatBytes(est)}.
          </span>
        </div>
      </div>
      <label className="field">
        <span>Script for karaoke (optional)</span>
        <textarea className="se-bulk short" value={script} onChange={(e) => setScript(e.target.value)} placeholder="One line for each sentence or speaker turn. You can time the lines after saving." />
        <span className="se-tools">
          {source.marks?.length ? <span className="hint">{source.marks.length} line starts marked while recording.</span> : <span className="hint">Paste the script; time each line after saving, in Script and timing.</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn link" disabled={!script.trim()} onClick={() => setScript(splitScript(script).join('\n'))}>
            One line for each sentence
          </button>
        </span>
      </label>
      {busy && <span className="hint">{busy}</span>}
      <span className="pe-actions">
        <button type="button" className="btn link" onClick={onBack}>
          {backLabel}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={save} disabled={!!busy && !busy.startsWith('It could') || !!clean || finalLen < 0.2}>
          Save
        </button>
      </span>
    </div>
  );
}

// The wave with two trim handles, the playhead, and what has been added.
function WaveEdit({ data, rate, edit, head, onHead, onEdit, marks }: { data: Float32Array; rate: number; edit: Edit; head: number; onHead: (t: number) => void; onEdit: (f: (e: Edit) => Edit) => void; marks?: number[] }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const len = data.length / rate;
  const p = useMemo(() => peaks(data, 1200), [data]);
  const drag = useRef<'s' | 'e' | null>(null);
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c) return;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      const top = p.reduce((a, v) => Math.max(a, v), 0.001);
      const accent = getComputedStyle(c).getPropertyValue('--accent').trim() || '#d98f63';
      g.fillStyle = accent;
      const n = Math.floor(w / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i / n) * p.length);
        const b = Math.max(a + 1, Math.floor(((i + 1) / n) * p.length));
        let v = 0;
        for (let k = a; k < b; k++) v = Math.max(v, p[k]);
        const bh = Math.max(1.5, (v / top) * (h - 8));
        g.fillRect(i * 3, (h - bh) / 2, 2, bh);
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
  }, [p]);
  const at = (x: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(len, ((x - r.left) / r.width) * len));
  };
  const pc = (t: number) => `${(t / len) * 100}%`;
  return (
    <div
      className="we"
      ref={box}
      onPointerDown={(e) => onHead(at(e.clientX))}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const t = at(e.clientX);
        onEdit((x) => (drag.current === 's' ? { ...x, start: Math.min(t, x.end - 0.2) } : { ...x, end: Math.max(t, x.start + 0.2) }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <canvas ref={cv} className="we-c" />
      <span className="we-cut" style={{ left: 0, width: pc(edit.start) }} />
      <span className="we-cut" style={{ left: pc(edit.end), right: 0 }} />
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
      <span className="wv-head" style={{ left: pc(head) }} />
      {(['s', 'e'] as const).map((k) => (
        <span
          key={k}
          className={'we-handle ' + k}
          style={{ left: pc(k === 's' ? edit.start : edit.end) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            box.current?.setPointerCapture(e.pointerId);
            drag.current = k;
          }}
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
            onEdit((x) => (k === 's' ? { ...x, start: Math.max(0, Math.min(x.end - 0.2, x.start + d)) } : { ...x, end: Math.min(len, Math.max(x.start + 0.2, x.end + d)) }));
          }}
        />
      ))}
    </div>
  );
}
