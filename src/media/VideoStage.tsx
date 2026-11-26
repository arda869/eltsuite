import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Engine } from './Player';
import type { ScriptLine } from '../lib/archive';
import './video-stage.css';

// A video, played the way a teacher needs it in class. The controls sit on the picture and fade while
// it plays. The timeline shows where each line of the script starts and the time under the pointer;
// drag across it with Shift (or use Mark the start / end) to loop a part. Captions come from the script.
// Hide the picture to listen first, or turn the sound off to predict what is said. Full screen, picture
// in picture and saving a still are a click away, and the keyboard works as in other players:
// Space or K play and pause, J and L or the arrows go back and on, M sound, C captions, F full screen,
// 0–9 jump through the video, , and . step a frame when paused, ? lists them all.

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
const KEYS: [string, string][] = [
  ['Space or K', 'Play or pause'], ['J / L', 'Back or on 10 seconds'], ['← / →', 'Back or on 5 seconds'], ['↑ / ↓', 'Volume'],
  ['M', 'Sound on or off'], ['C', 'Captions on or off'], ['H', 'Hide or show the picture'], ['F', 'Full screen'],
  ['0–9', 'Jump to 0%–90%'], [', / .', 'One frame back or on (paused)'], ['[ / ]', 'Slower or faster'], ['A / B', 'Mark the start or end of a loop'], ['?', 'This list'],
];

function Ic({ d, size = 20, fill }: { d: string; size?: number; fill?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const P = {
  play: 'M7 4.5v15l12.5-7.5z', pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  back: 'M11.5 7.5 6 12l5.5 4.5M18 7.5 12.5 12l5.5 4.5', fwd: 'M12.5 7.5 18 12l-5.5 4.5M6 7.5 11.5 12 6 16.5',
  vol: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10', mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  cc: 'M3.5 6.5h17v11h-17zM10 10.5a2 2 0 1 0 0 3M16.5 10.5a2 2 0 1 0 0 3', full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', unfull: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  pip: 'M3.5 5.5h17v13h-17zM12.5 12h6v4.5h-6z', eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', eyeOff: 'M3 3l18 18M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-3 3.6M6.2 7.4A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4-.9',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4', camera: 'M4 7.5h3l1.5-2h7l1.5 2h3v11H4zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  lines: 'M4 7h9M4 12h9M4 17h6M17 9v8M21 9v8', keys: 'M3.5 7h17v10h-17zM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8', more: 'M5 12h.01M12 12h.01M19 12h.01',
};

export function VideoStage({ e, lines = [], title, locked, tools, inline, lineStop, onLineStop }: {
  e: Engine; lines?: ScriptLine[]; title: string; locked?: boolean; tools?: ReactNode; inline?: boolean;
  lineStop?: boolean; onLineStop?: (on: boolean) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const d = e.duration || e.m?.duration || 0;
  const [awake, setAwake] = useState(true);
  const [full, setFull] = useState(false);
  const [cc, setCc] = useState(() => { try { return localStorage.getItem('ll.vsCaptions') !== '0'; } catch { return true; } });
  const [hide, setHide] = useState(false);
  const [menu, setMenu] = useState<'' | 'speed' | 'more' | 'keys'>('');
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [loop, setLoop] = useState<{ a: number; b: number | null } | null>(null);
  const [flash, setFlash] = useState('');
  const [remaining, setRemaining] = useState(false);
  const [drag, setDrag] = useState(false);
  const html = typeof HTMLVideoElement !== 'undefined' && e.media?.() instanceof HTMLVideoElement;
  const timed = useMemo(() => lines.filter((l) => l.t !== null && l.text.trim()).sort((a, b) => (a.t as number) - (b.t as number)), [lines]);
  const caption = useMemo(() => {
    for (let i = timed.length - 1; i >= 0; i--) {
      const l = timed[i];
      const end = l.e ?? (timed[i + 1]?.t as number | undefined) ?? (l.t as number) + 6;
      if (e.time >= (l.t as number) - 0.05) return e.time < end ? l : null;
    }
    return null;
  }, [timed, e.time]);
  const say = useCallback((x: string) => { setFlash(x); window.setTimeout(() => setFlash((f) => (f === x ? '' : f)), 900); }, []);
  const toggle = useCallback(() => { if (locked && !e.playing) return; if (e.playing) e.pause(); else e.play(); }, [e, locked]);
  const jump = useCallback((s: number) => { if (locked) return; e.seek(Math.max(0, Math.min(d || 0, e.time + s))); say(s < 0 ? `−${-s} s` : `+${s} s`); }, [e, d, locked, say]);

  // Controls fade while the video plays and the pointer rests.
  useEffect(() => {
    if (!e.playing || menu) return setAwake(true);
    const t = window.setTimeout(() => setAwake(false), 2600);
    return () => window.clearTimeout(t);
  }, [e.playing, awake, menu]);
  const wake = () => setAwake(true);

  // The A–B loop.
  useEffect(() => {
    if (!loop || loop.b == null || !e.playing) return;
    if (e.time >= loop.b || e.time < loop.a - 0.3) e.seek(loop.a);
  }, [e.time, loop, e.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen?.().catch(() => {});
  };
  const pip = async () => {
    const v = e.media?.();
    if (!(v instanceof HTMLVideoElement)) return;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { say('Picture in picture isn’t available here'); }
  };
  const still = async () => {
    const v = e.media?.();
    if (!(v instanceof HTMLVideoElement) || !v.videoWidth) return say('A still can’t be saved from this video');
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('no picture');
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        say('Still copied. Paste it anywhere');
      } catch {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${title || 'Video'} ${fmt(e.time).replace(/:/g, '.')}.png`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say('Still saved');
      }
    } catch { say('A still can’t be saved from this video'); }
  };
  const setCaptions = (on: boolean) => { setCc(on); try { localStorage.setItem('ll.vsCaptions', on ? '1' : '0'); } catch { /* fine */ } say(on ? 'Captions on' : 'Captions off'); };
  const step = (dir: number) => { if (e.playing) return; e.seek(Math.max(0, Math.min(d, e.time + dir / 25))); };
  const rateBy = (dir: number) => { const i = SPEEDS.indexOf(e.rate); const n = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + dir))]; e.setRate(n); say(`${n}×`); };
  const markA = () => { setLoop({ a: e.time, b: null }); say('Loop starts here'); };
  const markB = () => { if (!loop) return say('Mark the start first (A)'); if (e.time <= loop.a + 0.3) return say('The end must come after the start'); setLoop({ a: loop.a, b: e.time }); e.seek(loop.a); say('Looping the part'); };

  const onKey = (ev: React.KeyboardEvent) => {
    if ((ev.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    const done = () => { ev.preventDefault(); ev.stopPropagation(); wake(); };
    if (k === ' ' || k === 'k' || k === 'K') { done(); toggle(); }
    else if (k === 'ArrowLeft') { done(); jump(-5); }
    else if (k === 'ArrowRight') { done(); jump(5); }
    else if (k === 'j' || k === 'J') { done(); jump(-10); }
    else if (k === 'l' || k === 'L') { done(); jump(10); }
    else if (k === 'ArrowUp') { done(); e.setVolume(Math.min(1, Math.round((e.volume + 0.1) * 10) / 10)); say(`Volume ${Math.round(Math.min(1, e.volume + 0.1) * 100)}%`); }
    else if (k === 'ArrowDown') { done(); e.setVolume(Math.max(0, Math.round((e.volume - 0.1) * 10) / 10)); say(`Volume ${Math.round(Math.max(0, e.volume - 0.1) * 100)}%`); }
    else if (k === 'm' || k === 'M') { done(); e.setMuted?.(!e.muted); say(e.muted ? 'Sound on' : 'Sound off'); }
    else if (k === 'c' || k === 'C') { done(); if (timed.length) setCaptions(!cc); }
    else if (k === 'h' || k === 'H') { done(); setHide((v) => !v); say(hide ? 'Picture on' : 'Picture hidden'); }
    else if (k === 'f' || k === 'F') { done(); fullscreen(); }
    else if (/^[0-9]$/.test(k) && !locked) { done(); e.seek((d * Number(k)) / 10); }
    else if (k === ',') { done(); step(-1); }
    else if (k === '.') { done(); step(1); }
    else if (k === '[') { done(); rateBy(-1); }
    else if (k === ']') { done(); rateBy(1); }
    else if (k === 'a' || k === 'A') { done(); markA(); }
    else if (k === 'b' || k === 'B') { done(); markB(); }
    else if (k === '?') { done(); setMenu((m) => (m === 'keys' ? '' : 'keys')); }
    else if (k === 'Escape' && menu) { done(); setMenu(''); }
  };

  // The timeline: click or drag to move, Shift-drag to choose a part to loop.
  const tAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * d;
  };
  const down = (ev: React.PointerEvent) => {
    if (locked || !d) return;
    ev.preventDefault();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const start = tAt(ev.clientX);
    const shift = ev.shiftKey;
    setDrag(true);
    if (!shift) e.seek(start);
    const move = (m: PointerEvent) => {
      const t = tAt(m.clientX);
      if (shift) setLoop({ a: Math.min(start, t), b: Math.max(start, t) });
      else e.seek(t);
    };
    const up = () => {
      setDrag(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (shift) setLoop((l) => (l && l.b != null && l.b - l.a > 0.3 ? (e.seek(l.a), l) : null));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pct = (t: number) => (d ? `${(t / d) * 100}%` : '0%');
  const hoverLine = hover ? [...timed].reverse().find((l) => (l.t as number) <= hover.t) : null;

  const btn = (label: string, icon: ReactNode, run: () => void, on?: boolean, disabled?: boolean) => (
    <button type="button" className={'vs-b' + (on ? ' on' : '')} aria-label={label} aria-pressed={on} data-tip={label} disabled={disabled} onClick={(ev) => { ev.stopPropagation(); run(); }}>{icon}</button>
  );
  return (
    <div
      ref={stage}
      className={'vs' + (inline ? ' inline' : '') + (awake || !e.playing ? ' awake' : '') + (full ? ' full' : '') + (hide ? ' hidden-pic' : '')}
      tabIndex={0}
      role="group"
      aria-label={`${title}. Video player. Press ? for keyboard shortcuts`}
      onKeyDown={onKey}
      onPointerMove={wake}
      onPointerLeave={() => e.playing && setAwake(false)}
    >
      <div className="vs-screen" ref={e.host} />
      {hide && <div className="vs-cover"><Ic d={P.eyeOff} size={30} /><b>Picture hidden</b><span>Listen first. Press H or the eye to show it.</span></div>}
      <div className="vs-hit" onClick={toggle} onDoubleClick={fullscreen} aria-hidden="true" />
      {!e.playing && e.ready && !locked && (
        <button type="button" className="vs-big" aria-label="Play" onClick={toggle}><Ic d={P.play} size={34} fill /></button>
      )}
      {!e.ready && !e.error && <span className="vs-wait" role="status">One moment…</span>}
      {flash && <span className="vs-flash" role="status">{flash}</span>}
      {cc && !hide && caption && <div className={'vs-cap' + (awake || !e.playing ? ' up' : '')}>{caption.who && <b>{caption.who}: </b>}{caption.text}</div>}
      <div className="vs-top">
        <span className="vs-title">{title}</span>
        {e.muted && <span className="vs-pill">Sound off</span>}
        {loop?.b != null && <span className="vs-pill">Loop {fmt(loop.a)}–{fmt(loop.b)}</span>}
        {e.rate !== 1 && <span className="vs-pill">{e.rate}×</span>}
      </div>
      <div className="vs-ctrl" onClick={(ev) => ev.stopPropagation()}>
        <div
          className={'vs-bar' + (drag ? ' drag' : '')}
          ref={bar}
          role="slider"
          tabIndex={-1}
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={Math.round(d)}
          aria-valuenow={Math.round(e.time)}
          aria-valuetext={`${fmt(e.time)} of ${fmt(d)}`}
          onPointerDown={down}
          onPointerMove={(ev) => { const r = bar.current!.getBoundingClientRect(); setHover({ x: ev.clientX - r.left, t: tAt(ev.clientX) }); }}
          onPointerLeave={() => setHover(null)}
        >
          <span className="vs-track" />
          {loop && <span className="vs-loop" style={{ left: pct(loop.a), width: loop.b != null ? `calc(${pct(loop.b)} - ${pct(loop.a)})` : '2px' }} />}
          <span className="vs-done" style={{ width: pct(e.time) }} />
          {timed.map((l, i) => <span key={i} className="vs-mark" style={{ left: pct(l.t as number) }} />)}
          <span className="vs-knob" style={{ left: pct(e.time) }} />
          {hover && d > 0 && (
            <span className="vs-tip" style={{ left: Math.max(30, Math.min(hover.x, (bar.current?.clientWidth ?? 0) - 30)) }}>
              {hoverLine && <i>{hoverLine.text.slice(0, 60)}{hoverLine.text.length > 60 ? '…' : ''}</i>}
              <b>{fmt(hover.t)}</b>
            </span>
          )}
        </div>
        <div className="vs-row">
          {btn(e.playing ? 'Pause (K)' : 'Play (K)', <Ic d={e.playing ? P.pause : P.play} fill />, toggle, false, locked && !e.playing)}
          {btn('Back 10 seconds (J)', <span className="vs-skip"><Ic d={P.back} size={18} /><small>10</small></span>, () => jump(-10), false, locked)}
          {btn('On 10 seconds (L)', <span className="vs-skip"><Ic d={P.fwd} size={18} /><small>10</small></span>, () => jump(10), false, locked)}
          <span className="vs-vol">
            {btn(e.muted || e.volume === 0 ? 'Sound on (M)' : 'Sound off (M)', <Ic d={e.muted || e.volume === 0 ? P.mute : P.vol} />, () => e.setMuted?.(!e.muted), e.muted)}
            <input type="range" min={0} max={1} step={0.05} value={e.muted ? 0 : e.volume} aria-label="Volume" onChange={(ev) => { e.setMuted?.(false); e.setVolume(Number(ev.target.value)); }} />
          </span>
          <button type="button" className="vs-time" onClick={() => setRemaining((v) => !v)} aria-label={remaining ? 'Show the time played' : 'Show the time left'} data-tip={remaining ? 'Time left' : 'Time played'}>
            {remaining ? `−${fmt(Math.max(0, d - e.time))}` : fmt(e.time)} <span>/ {fmt(d)}</span>
          </button>
          <span className="vs-gap" />
          {tools}
          {timed.length > 1 && onLineStop && btn(lineStop ? 'Pausing after each line' : 'Pause after each line', <Ic d={P.lines} />, () => onLineStop(!lineStop), lineStop)}
          {btn(loop ? 'Stop looping' : 'Loop a part: press A at the start and B at the end, or Shift-drag on the timeline', <Ic d={P.loop} />, () => (loop ? (setLoop(null), say('Loop off')) : markA()), !!loop)}
          {timed.length > 0 && btn(cc ? 'Captions off (C)' : 'Captions on (C)', <Ic d={P.cc} />, () => setCaptions(!cc), cc)}
          {btn(hide ? 'Show the picture (H)' : 'Hide the picture to listen first (H)', <Ic d={hide ? P.eyeOff : P.eye} />, () => setHide((v) => !v), hide)}
          <span className="vs-menu-wrap">
            <button type="button" className={'vs-b vs-rate' + (e.rate !== 1 ? ' on' : '')} aria-haspopup="menu" aria-expanded={menu === 'speed'} aria-label={`Speed ${e.rate}×`} data-tip="Speed" onClick={() => setMenu((m) => (m === 'speed' ? '' : 'speed'))}>{e.rate}×</button>
            {menu === 'speed' && (
              <span className="vs-menu" role="menu">
                <span className="vs-menu-h">Speed</span>
                {SPEEDS.map((r) => <button key={r} type="button" role="menuitemradio" aria-checked={e.rate === r} className={e.rate === r ? 'on' : ''} onClick={() => { e.setRate(r); setMenu(''); }}>{r === 1 ? 'Normal' : `${r}×`}</button>)}
              </span>
            )}
          </span>
          <span className="vs-menu-wrap">
            {btn('More', <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>, () => setMenu((m) => (m === 'more' ? '' : 'more')), menu === 'more')}
            {menu === 'more' && (
              <span className="vs-menu wide" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(''); markA(); }}>Mark the start of a loop <kbd>A</kbd></button>
                <button type="button" role="menuitem" disabled={!loop} onClick={() => { setMenu(''); markB(); }}>Mark the end of the loop <kbd>B</kbd></button>
                {html && <button type="button" role="menuitem" onClick={() => { setMenu(''); void still(); }}><Ic d={P.camera} size={16} /> Copy a still of this moment</button>}
                {html && 'pictureInPictureEnabled' in document && <button type="button" role="menuitem" onClick={() => { setMenu(''); void pip(); }}><Ic d={P.pip} size={16} /> Picture in picture</button>}
                <button type="button" role="menuitem" onClick={() => setMenu('keys')}><Ic d={P.keys} size={16} /> Keyboard shortcuts <kbd>?</kbd></button>
              </span>
            )}
          </span>
          {btn(full ? 'Leave full screen (F)' : 'Full screen (F)', <Ic d={full ? P.unfull : P.full} />, fullscreen, false)}
        </div>
      </div>
      {menu === 'keys' && (
        <div className="vs-keys" role="dialog" aria-label="Keyboard shortcuts" onClick={(ev) => ev.stopPropagation()}>
          <header><b>Keyboard shortcuts</b><button type="button" className="vs-b" aria-label="Close" onClick={() => setMenu('')}>×</button></header>
          <dl>{KEYS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      )}
      {e.error && <p className="vs-error">{e.error}</p>}
    </div>
  );
}
