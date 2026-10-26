import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assemble, bufferOf, EFFECTS, finishedLength, fmtTime, mapTime, peaks, toMono, toOut, toSrc, type Edit, type Effect, type NoiseLevel } from '../lib/sound';
import { encodeMp3, keepAsIs, SOUND_QUALITY, storedPerMinute, type SoundQuality } from '../lib/audioEncode';
import { cleanNoise } from '../lib/soundJobs';
import { archiveAdd, formatBytes, saveSound, type ScriptLine } from '../lib/archive';
import { useAuth } from '../lib/auth';
import { newId } from '../lib/tasks';
import { splitScript } from './ScriptEditor';
import { UiIcon } from '../components/UiIcon';

// After recording or choosing a sound: trim it, set the volume, clean up background noise, add
// silence or a bell, choose the quality, then save it to the class and the media archive.

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

type Progress = { stage: string; p: number }; // p: 0 to 1 across the whole save

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
  const [edit, setEdit] = useState<Edit>({ start: 0, end: length, gain: 1, even: false, noise: 0, inserts: [] });
  const [head, setHead] = useState(0);
  const [silence, setSilence] = useState(1);
  const [quality, setQualityState] = useState<SoundQuality>(savedQ);
  const [title, setTitle] = useState(source.name);
  const [script, setScript] = useState((source.script ?? []).join('\n'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Progress | null>(null);
  const [asking, setAsking] = useState<Use[] | null | 'loading'>(null); // replacing: where it is used
  const [playing, setPlaying] = useState(false);
  const [hearing, setHearing] = useState(''); // the added sound playing now
  const ctx = useRef<AudioContext | null>(null);
  const node = useRef<{ src: AudioBufferSourceNode; at: number; from: number; edit: Edit } | null>(null);

  const data = cleaned.current[noise] ?? mono;
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

  // Playing: the finished sound (trimmed, at its volume, with the silence and sounds added),
  // from the playhead. The playhead follows it on the wave.
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
  };
  useEffect(() => () => (stop(), void ctx.current?.close()), []);
  const ac = () => (ctx.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
  const playFrom = (t: number, e: Edit = edit, buf: Float32Array = finished) => {
    stop();
    const c = ac();
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = bufferOf(buf, rate);
    src.connect(c.destination);
    const total = buf.length / rate;
    const from = Math.min(Math.max(0, toOut(t, e)), Math.max(0, total - 0.05));
    src.start(0, from >= total - 0.06 ? 0 : from);
    src.onended = () => node.current?.src === src && stop();
    node.current = { src, at: c.currentTime, from: from >= total - 0.06 ? 0 : from, edit: e };
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const n = node.current;
      if (n && ctx.current) {
        const where = toSrc(n.from + (ctx.current.currentTime - n.at), n.edit);
        setHead(where.t);
        setHearing(where.ins ? EFFECTS.find((f) => f.k === where.ins!.kind)?.label ?? '' : '');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

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

  const finalLen = finishedLength(edit);
  const unchanged = edit.start < 0.01 && edit.end > length - 0.01 && edit.gain === 1 && !edit.even && noise === 0 && !edit.inserts.length;
  const asIs = unchanged && keepAsIs(source.file, length, quality);
  const est = asIs && source.file ? (source.file.size * 4) / 3 : (finalLen / 60) * storedPerMinute(quality);
  // The finished sound as a file, with its script timed to the new version.
  const produce = async () => {
    let d = data;
    if (!cleaned.current[noise]) {
      setSaving({ stage: 'Cleaning up the sound', p: 0 });
      d = await cleanFor(noise);
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
      setSaving({ stage: 'Adding it to your media archive', p: 0.98 });
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
          {formatBytes(est)} · {fmtTime(finalLen)} long. Keep this window open until it is saved.
        </span>
      </div>
    );

  return (
    <div className="sed">
      <WaveEdit data={data} rate={rate} edit={edit} head={head} onHead={(t) => (setHead(t), playing && playFrom(t))} onEdit={setEdit} marks={source.marks} />
      <div className="sed-play">
        <button type="button" className="mp-play" onClick={() => (playing ? stop() : playFrom(head >= edit.end - 0.05 ? edit.start : head))} aria-label={playing ? 'Stop' : 'Play'}>
          {playing ? (
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
          {fmtTime(Math.max(0, toOut(head, edit)))}
          <span> / {fmtTime(finalLen)}</span>
        </span>
        {hearing && <span className="sed-hearing">{hearing}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn small-btn" onClick={() => playFrom(edit.start)}>
          Play from the start
        </button>
        <button type="button" className="btn small-btn" onClick={trimQuiet}>
          Trim the quiet ends
        </button>
        <button type="button" className="btn small-btn" onClick={() => setEdit((e) => ({ ...e, start: 0, end: length }))} disabled={edit.start < 0.01 && edit.end > length - 0.01}>
          Keep it all
        </button>
      </div>
      <span className="hint">Drag the two handles to trim. Click the wave to move the playhead. Play includes everything you change.</span>
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
        <span>Add at the playhead ({fmtTime(Math.max(0, head - edit.start))})</span>
        <span className="sed-add">
          <span className="sed-fx">
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
        </span>
        {edit.inserts.length > 0 && (
          <span className="sed-ins">
            {[...edit.inserts]
              .sort((a, b) => a.at - b.at)
              .map((i) => (
                <span key={i.id} className="sed-chip">
                  <button type="button" className="sed-chip-play" onClick={() => playFrom(Math.max(edit.start, i.at - 1.2))} aria-label="Play it">
                    <UiIcon name={EFFECT_ICON[i.kind]} size={14} />
                    {EFFECTS.find((f) => f.k === i.kind)?.label}
                    {i.kind === 'silence' && ` ${i.dur} s`} at {fmtTime(i.at - edit.start)}
                  </button>
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
            {SOUND_QUALITY.find((q) => q.k === quality)?.about.split(',')[0]}. This one takes about {formatBytes(est)}{asIs ? ', kept as it is' : ''}.
          </span>
        </div>
      </div>
      <label className="field">
        <span>Script for karaoke (optional)</span>
        <textarea className="se-bulk short" value={script} onChange={(e) => setScript(e.target.value)} placeholder="One line for each sentence or speaker turn. You can time the lines after saving." />
        <span className="se-tools">
          {source.marks?.some((m) => Number.isFinite(m)) ? <span className="hint">{source.marks.filter((m) => Number.isFinite(m)).length} lines timed{source.recorded ? ' while recording' : ''}; the times follow your trims.</span> : <span className="hint">Paste the script; time each line after saving, in Script and timing.</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn link" disabled={!script.trim()} onClick={() => setScript(splitScript(script).join('\n'))}>
            One line for each sentence
          </button>
        </span>
      </label>
      {error && <span className="hint warn">{error}</span>}
      <span className="pe-actions">
        <button type="button" className="btn link" onClick={onBack}>
          {backLabel}
        </button>
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
