import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bufferOf, dbOf, decodeSound, fmtTime, peaks, toMono } from '../lib/sound';
import { splitScript } from './ScriptEditor';
import type { SoundSource } from './SoundEditor';
import { Wave } from './Player';
import { UiIcon } from '../components/UiIcon';

// Recording in the app: choose the microphone, check the level and the room, count in, and read
// the script from a prompter, tapping Space as each line starts so the karaoke is timed as you go.
// After stopping, any part can be recorded again: pick a point and the new take replaces the rest.

const MAX = 20 * 60; // seconds
const fine = (t: number) => `${Math.floor(t / 60)}:${(Math.max(0, t) % 60).toFixed(1).padStart(4, '0')}`;
type Phase = 'setup' | 'count' | 'rec' | 'paused' | 'decoding' | 'review';
export type Take = { data: Float32Array; rate: number; marks: number[]; script: string; roomDb?: number };

// The first take up to a point, then the new take, joined with a short crossfade.
function splice(a: Float32Array, at: number, b: Float32Array, rate: number): Float32Array {
  const cut = Math.max(0, Math.min(a.length, Math.round(at * rate)));
  const fade = Math.min(Math.round(0.02 * rate), cut, b.length);
  const out = new Float32Array(cut + b.length - fade);
  out.set(a.subarray(0, cut - fade), 0);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[cut - fade + i] = a[cut - fade + i] * (1 - k) + b[i] * k;
  }
  out.set(b.subarray(fade), cut);
  return out;
}
const resample = async (x: Float32Array, from: number, to: number) => {
  if (from === to) return x;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil((x.length / from) * to)), to);
  const s = off.createBufferSource();
  s.buffer = bufferOf(x, from);
  s.connect(off.destination);
  s.start();
  return (await off.startRendering()).getChannelData(0).slice();
};

export function Recorder({ onDone, onCancel, initial }: { onDone: (s: SoundSource, take: Take) => void; onCancel: () => void; initial?: Take | null }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [cleanup, setCleanup] = useState(true);
  const [autoLevel, setAutoLevel] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState({ rms: -100, peak: -100 });
  const [advice, setAdvice] = useState('');
  const [room, setRoom] = useState<{ busy: boolean; db?: number }>({ busy: false, db: initial?.roomDb });
  const [phase, setPhase] = useState<Phase>(initial ? 'review' : 'setup');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [script, setScript] = useState(initial?.script ?? '');
  const [marks, setMarks] = useState<number[]>(initial?.marks ?? []); // line starts in the take
  const [take, setTake] = useState<{ data: Float32Array; rate: number } | null>(initial ? { data: initial.data, rate: initial.rate } : null);
  const [from, setFrom] = useState<number | null>(null); // where the take being recorded starts
  const [pos, setPos] = useState(0); // the chosen point in the review
  const [playing, setPlaying] = useState(false);
  const lines = splitScript(script);
  const latest = useRef({ marks, lines, room: room.db, take, from });
  latest.current = { marks, lines, room: room.db, take, from };
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const clock = useRef({ start: 0, pausedAt: 0, paused: 0 });
  const history = useRef<number[]>([]); // the level every 50 ms, for the rolling wave
  const loudAt = useRef(0);
  const quiet = useRef({ since: 0, max: 0 });
  const wave = useRef<HTMLCanvasElement>(null);
  const ac = useRef<AudioContext | null>(null);
  const node = useRef<{ src: AudioBufferSourceNode; at: number; from: number } | null>(null);

  const now = () => {
    const c = clock.current;
    const t = phase === 'paused' ? c.pausedAt : performance.now();
    return Math.max(0, (t - c.start - c.paused) / 1000);
  };
  const length = take ? take.data.length / take.rate : 0;

  // The microphone, with the chosen settings.
  useEffect(() => {
    let live = true;
    let s: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot record. Try Chrome, Edge or Safari.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: device ? { exact: device } : undefined, noiseSuppression: cleanup, echoCancellation: cleanup, autoGainControl: autoLevel, channelCount: 1 } })
      .then(async (st) => {
        if (!live) return st.getTracks().forEach((t) => t.stop());
        s = st;
        setStream(st);
        setError('');
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        if (live) setDevices(list);
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in the address bar, then try again.' : 'No microphone was found.'));
    return () => {
      live = false;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, [device, cleanup, autoLevel]);

  // The level meter and advice.
  useEffect(() => {
    if (!stream) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let last = 0;
    const id = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      let pk = 0;
      for (const v of buf) (sum += v * v), (pk = Math.max(pk, Math.abs(v)));
      const rms = Math.sqrt(sum / buf.length);
      setLevel({ rms: dbOf(rms), peak: dbOf(pk) });
      const t = performance.now();
      if (pk > 0.97) loudAt.current = t;
      if (dbOf(rms) > -42) {
        if (!quiet.current.since) quiet.current = { since: t, max: 0 };
        quiet.current.max = Math.max(quiet.current.max, pk);
      }
      if (t - last > 400) {
        last = t;
        if (t - loudAt.current < 1500) setAdvice('Too loud: move back a little, or speak more softly.');
        else if (quiet.current.since && t - quiet.current.since > 2500) {
          setAdvice(quiet.current.max < 0.12 ? 'Quiet: move closer to the microphone or speak up.' : 'Good level.');
          quiet.current = { since: 0, max: 0 };
        }
      }
      history.current.push(pk);
      if (history.current.length > 400) history.current.shift();
    }, 50);
    return () => {
      window.clearInterval(id);
      void ctx.close();
    };
  }, [stream]);

  // The rolling wave while recording.
  useLayoutEffect(() => {
    if (phase !== 'rec' && phase !== 'paused') return;
    let raf = 0;
    const paint = () => {
      const c = wave.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== Math.round(w * dpr)) (c.width = Math.round(w * dpr)), (c.height = Math.round(h * dpr));
        const g = c.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        g.fillStyle = getComputedStyle(c).getPropertyValue('--accent').trim() || '#d98f63';
        const hs = history.current;
        const n = Math.floor(w / 3);
        for (let i = 0; i < n; i++) {
          const v = hs[hs.length - n + i] ?? 0;
          const bh = Math.max(1.5, Math.min(1, v * 1.4) * (h - 4));
          g.fillRect(i * 3, (h - bh) / 2, 2, bh);
        }
      }
      setElapsed(now());
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  });

  const checkRoom = async () => {
    if (!stream) return;
    setRoom({ busy: true });
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const vals: number[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      an.getFloatTimeDomainData(buf);
      vals.push(Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length));
    }
    void ctx.close();
    vals.sort((a, b) => a - b);
    setRoom({ busy: false, db: dbOf(vals[Math.floor(vals.length / 2)]) });
  };

  // ------------------------------------------------------------ recording a take

  // at: null for a new recording, or the point in the take where the new part begins.
  const begin = (at: number | null) => {
    if (!stream) return;
    stopPlay();
    setFrom(at);
    if (at !== null) setMarks((m) => m.filter((t) => t < at - 0.05));
    else setMarks([]);
    setPhase('count');
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n > 0) return setCount(n);
      window.clearInterval(id);
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        setPhase('decoding');
        try {
          const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
          const b = await decodeSound(blob);
          const l = latest.current;
          const part = toMono(b);
          if (l.from === null || !l.take) setTake({ data: part, rate: b.sampleRate });
          else {
            const fit = await resample(part, b.sampleRate, l.take.rate);
            setTake({ data: splice(l.take.data, l.from, fit, l.take.rate), rate: l.take.rate });
          }
          setPos(l.from ?? 0);
          setPhase('review');
        } catch {
          setError('The recording could not be read. Try again.');
          setPhase(latest.current.take ? 'review' : 'setup');
        }
      };
      r.start(250);
      rec.current = r;
      clock.current = { start: performance.now(), pausedAt: 0, paused: 0 };
      history.current = [];
      setPhase('rec');
    }, 800);
  };
  const pause = () => {
    rec.current?.pause();
    clock.current.pausedAt = performance.now();
    setPhase('paused');
  };
  const resume = () => {
    rec.current?.resume();
    clock.current.paused += performance.now() - clock.current.pausedAt;
    setPhase('rec');
  };
  const stop = () => {
    if (phase === 'paused') resume();
    rec.current?.stop();
  };
  const offset = from ?? 0;
  const mark = () => phase === 'rec' && marks.length < lines.length && setMarks((m) => [...m, +(offset + now()).toFixed(2)]);
  useEffect(() => {
    if (phase === 'rec' && offset + elapsed > MAX) stop();
  });
  useEffect(() => {
    if (phase !== 'rec' && phase !== 'paused') return;
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        mark();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  // ------------------------------------------------------------ the review

  const stopPlay = () => {
    try {
      node.current?.src.stop();
    } catch {
      /* stopped */
    }
    node.current = null;
    setPlaying(false);
  };
  const play = () => {
    if (!take) return;
    stopPlay();
    const c = (ac.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = bufferOf(take.data, take.rate);
    src.connect(c.destination);
    const start = pos >= length - 0.05 ? 0 : pos;
    src.start(0, start);
    src.onended = () => node.current?.src === src && stopPlay();
    node.current = { src, at: c.currentTime, from: start };
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const n = node.current;
      if (n && ac.current) setPos(Math.min(length, n.from + ac.current.currentTime - n.at));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, length]);
  useEffect(() => () => (stopPlay(), void ac.current?.close()), []);
  const reviewWave = useMemo(() => {
    if (!take) return null;
    const p = peaks(take.data, 900);
    const top = p.reduce((a, v) => Math.max(a, v), 0.001);
    return p.map((v) => v / top);
  }, [take]);
  const finish = () => {
    if (!take) return;
    stopPlay();
    const t: Take = { data: take.data, rate: take.rate, marks, script, roomDb: room.db };
    onDone({ buffer: bufferOf(take.data, take.rate), name: 'Recording', marks, script: lines, roomDb: room.db, recorded: true }, t);
  };

  const meter = Math.max(0, Math.min(1, (level.peak + 60) / 60));
  const recording = phase === 'rec' || phase === 'paused';
  const cur = marks.length - 1; // the line being read
  const lineAt = (t: number) => {
    let k = -1;
    marks.forEach((m, i) => m <= t + 0.05 && (k = i));
    return k;
  };
  return (
    <div className="rs">
      {error && <p className="hint warn">{error}</p>}
      {phase === 'setup' && (
        <>
          <div className="rs-setup">
            <label className="field">
              <span>Microphone</span>
              <select value={device} onChange={(e) => setDevice(e.target.value)}>
                <option value="">Default</option>
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="field" style={{ gap: 6 }}>
              <span>Level</span>
              <span className="rs-meter" aria-label="Microphone level">
                <span style={{ width: `${meter * 100}%` }} className={level.peak > -1 ? 'hot' : ''} />
              </span>
              <span className="hint">{stream ? advice || 'Say a sentence to test the level.' : 'Waiting for the microphone…'}</span>
            </div>
          </div>
          <div className="rs-opts">
            <label className="check-row">
              <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
              Reduce noise and echo while recording
            </label>
            <label className="check-row">
              <input type="checkbox" checked={autoLevel} onChange={(e) => setAutoLevel(e.target.checked)} />
              Set my volume automatically
            </label>
            <span className="rs-room">
              <button type="button" className="btn small-btn" onClick={checkRoom} disabled={!stream || room.busy}>
                {room.busy ? 'Listening… stay quiet' : 'Check the room'}
              </button>
              {room.db !== undefined && !room.busy && (
                <span className="hint">
                  {room.db < -58 ? 'Very quiet. Ideal.' : room.db < -48 ? 'Quiet enough.' : room.db < -38 ? 'Some background noise. Close windows, turn off fans, or reduce it after recording.' : 'Noisy. Find a quieter room, or move closer to the microphone.'} ({Math.round(room.db)} dB)
                </span>
              )}
            </span>
          </div>
          <label className="field">
            <span>Script to read (optional)</span>
            <textarea className="se-bulk short" value={script} onChange={(e) => setScript(e.target.value)} placeholder="Paste the script. While you record, it scrolls like a prompter; press Space as you start each sentence and the karaoke is timed for you." />
          </label>
          <span className="rs-tips hint">Tips: keep a hand’s width (about 15 cm) from the microphone, speak a little slower than usual, and pause briefly between sentences. Made a mistake? Stop, and record again from just before it.</span>
          <span className="pe-actions">
            <button type="button" className="btn link" onClick={onCancel}>
              Back
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn primary rs-start" onClick={() => begin(null)} disabled={!stream}>
              <UiIcon name="mic" size={16} /> Start recording
            </button>
          </span>
        </>
      )}
      {phase === 'count' && (
        <div className="rs-count" aria-live="assertive">
          <span>{count}</span>
          {from !== null && <span className="hint">Recording again from {fine(from)}</span>}
        </div>
      )}
      {recording && (
        <div className="rs-live">
          <div className="rs-top">
            <span className={'rs-dot' + (phase === 'paused' ? ' paused' : '')} />
            <span className="rs-clock">{fmtTime(offset + elapsed)}</span>
            <span className="hint">{phase === 'paused' ? 'Paused' : from !== null ? `Recording again from ${fmtTime(from)}` : advice && advice !== 'Good level.' ? advice : 'Recording'}</span>
            <span style={{ flex: 1 }} />
            <span className="rs-meter small">
              <span style={{ width: `${meter * 100}%` }} className={level.peak > -1 ? 'hot' : ''} />
            </span>
          </div>
          <canvas ref={wave} className="rs-wave" />
          {lines.length > 0 && <Prompter lines={lines} cur={cur} />}
          <span className="pe-actions">
            {lines.length > 0 && (
              <button type="button" className="btn" onClick={mark} disabled={phase !== 'rec' || marks.length >= lines.length}>
                {marks.length === 0 ? 'First line starts' : marks.length >= lines.length ? 'All lines marked' : `Line ${marks.length + 1} starts`} <kbd>Space</kbd>
              </button>
            )}
            <span style={{ flex: 1 }} />
            {phase === 'rec' ? (
              <button type="button" className="btn" onClick={pause}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn" onClick={resume}>
                Resume
              </button>
            )}
            <button type="button" className="btn primary" onClick={stop}>
              Stop
            </button>
          </span>
        </div>
      )}
      {phase === 'decoding' && <p className="hint">Opening the recording…</p>}
      {phase === 'review' && take && (
        <div className="rs-review">
          <div className="rs-top">
            <button type="button" className="mp-play" onClick={() => (playing ? stopPlay() : play())} aria-label={playing ? 'Stop' : 'Play'}>
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
              {fine(pos)}
              <span> / {fmtTime(length)}</span>
            </span>
            <span className="hint">Listen back. Click the wave just before a mistake, then record again from there.</span>
          </div>
          <Wave wave={reviewWave} duration={length} time={pos} lines={marks.map((t, i) => ({ t, text: lines[i] ?? '' }))} onSeek={(t) => (stopPlay(), setPos(t))} height={72} />
          {marks.length > 0 && (
            <span className="rs-lines">
              <span className="hint">Go to</span>
              {marks.map((t, i) => (
                <button key={i} type="button" className={'ap-chip' + (lineAt(pos) === i && Math.abs(pos - t) < 0.1 ? ' on' : '')} onClick={() => (stopPlay(), setPos(t))} title={lines[i]}>
                  Line {i + 1}
                </button>
              ))}
            </span>
          )}
          {lines.length > 0 && <Prompter lines={lines} cur={lineAt(pos)} small />}
          <span className="pe-actions rs-actions">
            <button type="button" className="btn primary" onClick={() => begin(Math.min(pos, length))} disabled={!stream}>
              <UiIcon name="mic" size={16} /> Record again from {fine(pos)}
            </button>
            <button type="button" className="btn" onClick={() => begin(length)} disabled={!stream}>
              Carry on at the end
            </button>
            <button type="button" className="btn link" onClick={() => begin(null)} disabled={!stream}>
              Start again
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn primary" onClick={finish}>
              Done
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Prompter({ lines, cur, small }: { lines: string[]; cur: number; small?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const row = b?.querySelector<HTMLElement>('.rs-line.now') ?? b?.querySelector<HTMLElement>('.rs-line.next');
    if (!b || !row) return;
    b.scrollTo({ top: row.offsetTop - b.clientHeight * 0.3, behavior: 'smooth' });
  }, [cur]);
  return (
    <div className={'rs-prompter' + (small ? ' small' : '')} ref={box}>
      {lines.map((l, i) => (
        <p key={i} className={'rs-line' + (i === cur ? ' now' : i < cur ? ' past' : i === cur + 1 ? ' next' : '')}>
          {l}
        </p>
      ))}
    </div>
  );
}
