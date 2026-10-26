import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { soundUrl, useManifest, youTubeId, type Manifest, type ScriptLine } from '../lib/archive';
import { UiIcon } from '../components/UiIcon';
import { decodeSound, fmtTime, peaks as peaksOf, toMono } from '../lib/sound';

// Playing sound and video: a stored recording, a sound or video file on the web, or YouTube.
// One engine drives all three, so the karaoke script can follow any of them.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ytLoading: Promise<any> | null = null;
function loadYouTube(): Promise<any> {
  if (!ytLoading)
    ytLoading = new Promise((res) => {
      if (window.YT?.Player) return res(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        res(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    });
  return ytLoading;
}

export const isVideoUrl = (u = '') => !!youTubeId(u) || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);
export const mediaIsVideo = (m?: Manifest | null) => !!m && (m.kind === 'link' ? !!m.video || isVideoUrl(m.url) : !!m.video);

export type Engine = {
  volume: number;
  setVolume: (v: number) => void;
  m: Manifest | null | undefined;
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;
  ends: number; // how many times it has been played to the end
  error: string;
  video: boolean;
  host: (el: HTMLDivElement | null) => void; // where a video is shown
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  rate: number;
  setRate: (r: number) => void;
};

export function useEngine(classId: string, mediaId: string, given?: Manifest | null): Engine {
  const live = useManifest(given !== undefined ? '' : classId, given !== undefined ? '' : mediaId);
  const m = given !== undefined ? given : live;
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ends, setEnds] = useState(0);
  const [error, setError] = useState('');
  const [rate, setRateState] = useState(1);
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const el = useRef<HTMLMediaElement | null>(null);
  const yt = useRef<any>(null);
  const url = m?.kind === 'link' ? m.url ?? '' : '';
  const ytId = youTubeId(url);
  const video = mediaIsVideo(m);
  const stored = m?.kind === 'audio';

  // A sound or video element (stored sound, or a file on the web).
  useEffect(() => {
    if (!m || ytId) return;
    if (video && !hostEl) return;
    let cancelled = false;
    const media: HTMLMediaElement = video ? document.createElement('video') : new Audio();
    media.preload = 'metadata';
    if (media instanceof HTMLVideoElement) {
      media.playsInline = true;
      media.className = 'mp-video';
      hostEl?.appendChild(media);
    }
    el.current = media;
    let raf = 0;
    const tick = () => {
      setTime(media.currentTime);
      raf = requestAnimationFrame(tick);
    };
    media.onloadedmetadata = () => {
      if (Number.isFinite(media.duration)) setDuration(media.duration);
      setReady(true);
    };
    media.oncanplay = () => setReady(true);
    media.onplay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    media.onpause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setTime(media.currentTime);
    };
    media.onended = () => setEnds((n) => n + 1);
    media.onerror = () => setError(stored ? 'This recording could not be opened.' : 'This file could not be played. Check the address.');
    (stored ? soundUrl(classId, mediaId, m) : Promise.resolve(url)).then(
      (src) => {
        if (cancelled) return;
        media.src = src;
        if (m.duration) setDuration(m.duration);
      },
      () => setError('This recording could not be opened.'),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      media.pause();
      media.removeAttribute('src');
      media.load();
      media.remove();
      el.current = null;
      setReady(false);
      setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.kind, m?.parts, m?.v, url, ytId, video, hostEl, classId, mediaId]);

  // YouTube.
  useEffect(() => {
    if (!ytId || !hostEl) return;
    let cancelled = false;
    let poll = 0;
    const box = document.createElement('div');
    hostEl.appendChild(box);
    loadYouTube().then((YT) => {
      if (cancelled) return;
      yt.current = new YT.Player(box, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            setReady(true);
            setDuration(e.target.getDuration?.() || 0);
          },
          onStateChange: (e: any) => {
            const p = e.data === YT.PlayerState.PLAYING;
            setPlaying(p);
            window.clearInterval(poll);
            if (p) poll = window.setInterval(() => setTime(yt.current?.getCurrentTime?.() ?? 0), 100);
            if (e.data === YT.PlayerState.ENDED) setEnds((n) => n + 1);
            const d = yt.current?.getDuration?.();
            if (d) setDuration(d);
          },
          onError: () => setError('This video cannot be played here. It may be private or blocked from other sites.'),
        },
      });
    });
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      try {
        yt.current?.destroy?.();
      } catch {
        /* already gone */
      }
      yt.current = null;
      box.remove();
      setReady(false);
      setPlaying(false);
    };
  }, [ytId, hostEl]);

  const play = useCallback(() => {
    if (yt.current) yt.current.playVideo?.();
    else el.current?.play().catch(() => {});
  }, []);
  const pause = useCallback(() => {
    if (yt.current) yt.current.pauseVideo?.();
    else el.current?.pause();
  }, []);
  const seek = useCallback((t: number) => {
    setTime(t);
    if (yt.current) yt.current.seekTo?.(t, true);
    else if (el.current) el.current.currentTime = t;
  }, []);
  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (yt.current) yt.current.setPlaybackRate?.(r);
    else if (el.current) el.current.playbackRate = r;
  }, []);
  // Volume, remembered on this device for every player.
  const [volume, setVolumeState] = useState(() => {
    try {
      const v = Number(localStorage.getItem('ll.volume'));
      return v > 0 && v <= 1 ? v : 1;
    } catch {
      return 1;
    }
  });
  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    try {
      localStorage.setItem('ll.volume', String(v));
    } catch {
      /* fine */
    }
    if (yt.current) yt.current.setVolume?.(Math.round(v * 100));
    else if (el.current) el.current.volume = v;
  }, []);
  useEffect(() => {
    if (el.current) el.current.volume = volume;
    else if (yt.current) yt.current.setVolume?.(Math.round(volume * 100));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const host = useCallback((h: HTMLDivElement | null) => setHostEl(h), []);
  return { m, ready, playing, time, duration, ends, error, video, host, play, pause, seek, rate, setRate, volume, setVolume };
}

// ------------------------------------------------------------------ the sound wave

// The shape of the sound, for seeing where each line starts. YouTube does not share its sound,
// so YouTube videos get a plain timeline.
const waveCache = new Map<string, Promise<Float32Array | null>>();
export function useWave(classId: string, mediaId: string, m: Manifest | null | undefined): Float32Array | null | false {
  const [w, setW] = useState<Float32Array | null | false>(null);
  const url = m?.kind === 'link' ? m.url ?? '' : '';
  const yt = !!youTubeId(url);
  useEffect(() => {
    if (!m) return setW(null);
    if (yt) return setW(false);
    const key = m.kind === 'audio' ? `${classId}/${mediaId}/${m.parts}/${m.v ?? 0}` : url;
    if (!waveCache.has(key))
      waveCache.set(
        key,
        (m.kind === 'audio' ? soundUrl(classId, mediaId, m) : Promise.resolve(url))
          .then((u) => fetch(u))
          .then((r) => {
            const len = Number(r.headers.get('content-length') ?? 0);
            if (!r.ok || len > 80 * 1024 * 1024) throw new Error('skip');
            return r.blob();
          })
          .then((b) => decodeSound(b))
          .then((b) => {
            const p = peaksOf(toMono(b), 900);
            const top = p.reduce((a, v) => Math.max(a, v), 0.001);
            return p.map((v) => Math.min(1, v / top));
          })
          .catch(() => null),
      );
    let live = true;
    setW(null);
    waveCache.get(key)!.then((p) => live && setW(p ?? false));
    return () => {
      live = false;
    };
  }, [m, classId, mediaId, url, yt]);
  return w;
}

function drawWave(c: HTMLCanvasElement, p: Float32Array, color: string) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  const bar = 2;
  const gap = 1;
  const n = Math.floor(w / (bar + gap));
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * p.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * p.length));
    let v = 0;
    for (let k = a; k < b; k++) v = Math.max(v, p[k]);
    const bh = Math.max(1.5, v * (h - 4));
    g.beginPath();
    g.roundRect?.(i * (bar + gap), (h - bh) / 2, bar, bh, 1);
    if (!g.roundRect) g.rect(i * (bar + gap), (h - bh) / 2, bar, bh);
    g.fill();
  }
}

// The wave (or a timeline) with a numbered mark where each line starts. Marks can be dragged.
export function Wave({ wave, duration, time, lines, onSeek, onMove, height = 54 }: { wave: Float32Array | null | false; duration: number; time: number; lines?: ScriptLine[]; onSeek?: (t: number) => void; onMove?: (i: number, t: number) => void; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  const scrubbing = useRef(false);
  useLayoutEffect(() => {
    if (!wave || !box.current) return;
    const paint = () => {
      const accent = getComputedStyle(box.current!).getPropertyValue('--accent').trim() || '#d98f63';
      if (back.current) drawWave(back.current, wave, 'rgba(51, 48, 44, 0.22)');
      if (front.current) drawWave(front.current, wave, accent);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [wave]);
  const p = duration ? Math.min(1, Math.max(0, time / duration)) : 0;
  const at = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration));
  };
  return (
    <div
      className={'wv' + (wave ? '' : ' plain') + (wave === null ? ' loading' : '')}
      ref={box}
      style={{ height: wave ? height : 18 }}
      role="slider"
      tabIndex={0}
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      onKeyDown={(ev) => {
        const step = ev.key === 'ArrowLeft' ? -5 : ev.key === 'ArrowRight' ? 5 : 0;
        if (!step || !duration) return;
        ev.preventDefault();
        onSeek?.(Math.max(0, Math.min(duration, time + step)));
      }}
      onPointerDown={(ev) => {
        if (!duration || !onSeek) return;
        scrubbing.current = true;
        (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
        onSeek(at(ev.clientX));
      }}
      onPointerMove={(ev) => {
        if (drag.current !== null && duration) onMove?.(drag.current, +at(ev.clientX).toFixed(2));
        else if (scrubbing.current && duration) onSeek?.(at(ev.clientX));
      }}
      onPointerUp={() => ((drag.current = null), (scrubbing.current = false))}
      onPointerCancel={() => ((drag.current = null), (scrubbing.current = false))}
    >
      {wave ? (
        <>
          <canvas ref={back} className="wv-c" />
          <canvas ref={front} className="wv-c" style={{ clipPath: `inset(0 ${100 - p * 100}% 0 0)` }} />
        </>
      ) : (
        <span className="wv-track">
          <span style={{ width: `${p * 100}%` }} />
        </span>
      )}
      <span className="wv-head" style={{ left: `${p * 100}%` }} />
      {duration > 0 &&
        (lines ?? []).map((l, i) =>
          l.t === null ? null : (
            <span
              key={i}
              className={'wv-mark' + (onMove ? ' movable' : '')}
              style={{ left: `${(l.t / duration) * 100}%` }}
              title={l.text}
              onPointerDown={(ev) => {
                if (!onMove) return;
                ev.stopPropagation();
                (ev.currentTarget.parentElement as HTMLElement).setPointerCapture(ev.pointerId);
                drag.current = i;
              }}
            >
              <span className="wv-flag">{i + 1}</span>
            </span>
          ),
        )}
    </div>
  );
}

// ------------------------------------------------------------------ karaoke

// Each line lights up while it is spoken, and the box keeps it in view.
export function Karaoke({ lines, time, duration, onSeek, big }: { lines: ScriptLine[]; time: number; duration: number; onSeek?: (t: number) => void; big?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const timed = lines.some((l) => l.t !== null);
  const cast = [...new Set(lines.map((l) => l.who).filter(Boolean) as string[])];
  let now = -1;
  if (timed) lines.forEach((l, i) => l.t !== null && l.t <= time + 0.05 && (now = i));
  void duration;
  useLayoutEffect(() => {
    const b = box.current;
    const row = b?.querySelector<HTMLElement>('.kl-line.now');
    if (!b || !row) return;
    const top = row.offsetTop - b.clientHeight * 0.35;
    if (Math.abs(b.scrollTop - top) > 4) b.scrollTo({ top, behavior: 'smooth' });
  }, [now]);
  return (
    <div className={'kl' + (big ? ' big' : '') + (timed ? ' timed' : '')} ref={box}>
      {lines.map((l, i) => {
        const state = !timed ? '' : i === now ? ' now' : i < now ? ' past' : '';
        const words: ReactNode = l.text; // the line lights up as a whole: word timing inside a line is only a guess
        return (
          <p key={i} className={'kl-line' + state + (onSeek && l.t !== null ? ' seekable' : '') + (l.who ? ' has-who' : '')} onClick={() => onSeek && l.t !== null && onSeek(l.t)}>
            {l.who && <b className={'kl-who sp' + (cast.indexOf(l.who) % 4)}>{l.who}</b>}
            {words}
          </p>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ the player

export type ScriptMode = 'karaoke' | 'after' | 'button' | 'none';
export const SCRIPT_MODES: { k: ScriptMode; label: string; about: string }[] = [
  { k: 'karaoke', label: 'While it plays', about: 'Words light up as they are spoken' },
  { k: 'after', label: 'After listening', about: 'Learners see the script once they have listened to the end' },
  { k: 'button', label: 'On a button', about: 'Learners open the script when they want it' },
  { k: 'none', label: 'Hidden', about: 'Learners never see the script' },
];

const PlayIcon = ({ playing }: { playing: boolean }) =>
  playing ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
    </svg>
  );

// Play, the sound wave as the bar (click or drag it to move), the time and the speed.
export function Transport({ e, locked, compact, children, tools }: { e: Engine; locked?: boolean; compact?: boolean; children?: ReactNode; tools?: ReactNode }) {
  const d = e.duration || e.m?.duration || 0;
  return (
    <div className={'mp-bar' + (compact ? ' compact' : '')}>
      <button type="button" className="mp-play" onClick={() => (e.playing ? e.pause() : e.play())} disabled={(!e.ready && !e.video) || (locked && !e.playing)} aria-label={e.playing ? 'Pause' : 'Play'}>
        <PlayIcon playing={e.playing} />
      </button>
      <span className="mp-wave">{children}</span>
      <span className="mp-time">
        {fmtTime(e.time)}
        <span> / {fmtTime(d)}</span>
      </span>
      {tools}
      <VolumeMenu volume={e.volume} onVolume={e.setVolume} />
      <SpeedMenu rate={e.rate} onRate={e.setRate} />
    </div>
  );
}

function VolumeMenu({ volume, onVolume }: { volume: number; onVolume: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const before = useRef(1);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent) => ref.current && !ref.current.contains(ev.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const waves = volume === 0 ? 0 : volume < 0.5 ? 1 : 2;
  return (
    <span className="mp-speed mp-vol" ref={ref}>
      <button type="button" className={'mp-rate mp-vol-btn' + (volume < 1 ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Volume ${Math.round(volume * 100)}%`} data-tip="Volume">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity=".15" />
          {waves === 0 ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />}
          {waves === 2 && <path d="M18 7a7 7 0 0 1 0 10" />}
        </svg>
      </button>
      {open && (
        <span className="mp-speed-menu mp-vol-menu" role="dialog" aria-label="Volume">
          <span className="mp-speed-head">Volume</span>
          <span className="mp-vol-row">
            <button type="button" className="mp-vol-mute" onClick={() => (volume > 0 ? ((before.current = volume), onVolume(0)) : onVolume(before.current || 1))}>
              {volume > 0 ? 'Mute' : 'Sound on'}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(ev) => onVolume(Number(ev.target.value))} aria-label="Volume" />
            <b>{Math.round(volume * 100)}%</b>
          </span>
        </span>
      )}
    </span>
  );
}

export const SPEEDS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];
const speedLabel = (r: number) => (r === 1 ? '1×' : `${r}×`);
function SpeedMenu({ rate, onRate }: { rate: number; onRate: (r: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent) => ref.current && !ref.current.contains(ev.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="mp-speed" ref={ref}>
      <button type="button" className={'mp-rate' + (rate !== 1 ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Speed ${speedLabel(rate)}`} data-tip="Speed">
        {speedLabel(rate)}
      </button>
      {open && (
        <span className="mp-speed-menu" role="menu">
          <span className="mp-speed-head">Speed</span>
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === rate}
              className={r === rate ? 'on' : ''}
              onClick={() => {
                onRate(r);
                setOpen(false);
              }}
            >
              {r === 1 ? 'Normal' : speedLabel(r)}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function PlayerWave({ e, classId, mediaId, lines, locked }: { e: Engine; classId: string; mediaId: string; lines?: ScriptLine[]; locked?: boolean }) {
  const wave = useWave(classId, mediaId, e.m);
  return <Wave wave={wave} duration={e.duration || e.m?.duration || 0} time={e.time} lines={lines} onSeek={locked ? undefined : e.seek} height={40} />;
}

// teacher: the lesson editor (everything shows). teaching: the teaching screen, which the class may
// see, so the script follows the setting and the teacher opens it with a button.
export function MediaPlayer({ classId, mediaId, title, scriptMode = 'karaoke', plays = 0, teacher: editing, teaching, manifest, extra, bare }: { classId: string; mediaId: string; title?: string; scriptMode?: ScriptMode; plays?: number; teacher?: boolean; teaching?: boolean; manifest?: Manifest | null; extra?: ReactNode; bare?: boolean }) {
  const teacher = editing || teaching;
  const e = useEngine(classId, mediaId, manifest);
  const [open, setOpen] = useState(false);
  const lines = (e.m?.script ?? []).filter((l) => l.text.trim());
  // Pause at the end of each line: for repeating after the speaker, or dictation.
  const [lineStop, setLineStop] = useState(false);
  const timed = lines.filter((l) => l.t !== null).map((l) => l.t as number).sort((a, b) => a - b);
  const stopAt = useRef<number | null>(null);
  useEffect(() => {
    if (!e.playing) return void (stopAt.current = null);
    if (stopAt.current === null) stopAt.current = timed.find((t) => t > e.time + 0.15) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.playing]);
  useEffect(() => {
    if (!lineStop || !e.playing || stopAt.current === null) return;
    if (e.time >= stopAt.current - 0.05) {
      const t = stopAt.current;
      stopAt.current = null;
      e.pause();
      e.seek(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.time, lineStop]);
  const used = plays > 0 && !teacher && e.ends >= plays && !e.playing;
  const showScript = lines.length > 0 && (editing || scriptMode === 'karaoke' || (teaching && open) || (scriptMode === 'after' && e.ends > 0) || (scriptMode === 'button' && open));
  if (e.m === undefined) return <div className="mp mp-wait" />;
  if (e.m === null) return <div className="mp mp-missing">This sound or video is no longer in this class.</div>;
  const name = title || e.m.title || (e.video ? 'Video' : 'Listening');
  return (
    <div className={'mp' + (e.video ? ' is-video' : '')}>
      {e.video && <div className="mp-screen" ref={e.host} />}
      <div className="mp-head" hidden={bare && !plays && !extra}>
        <span className="mp-kind" aria-hidden="true">
          <UiIcon name={e.video ? 'video' : 'music'} size={16} />
        </span>
        <span className="mp-title">{name}</span>
        {plays > 0 && <span className="mp-plays">{teacher ? `Learners can play it ${plays === 1 ? 'once' : plays + ' times'}` : used ? 'No plays left' : `${plays - e.ends} ${plays - e.ends === 1 ? 'play' : 'plays'} left`}</span>}
        {extra}
      </div>
      <Transport
        e={e}
        locked={used}
        tools={
          timed.length > 1 ? (
            <button type="button" className={'mp-rate mp-linestop' + (lineStop ? ' on' : '')} onClick={() => setLineStop((v) => !v)} aria-pressed={lineStop} aria-label="Pause after each line" data-tip={lineStop ? 'Pausing after each line' : 'Pause after each line'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h9M4 12h9M4 17h6" />
                <path d="M17 9v8M21 9v8" />
              </svg>
            </button>
          ) : null
        }
      >
        <PlayerWave e={e} classId={classId} mediaId={mediaId} lines={teacher ? lines : undefined} locked={used} />
      </Transport>
      {e.error && <p className="mp-error">{e.error}</p>}
      {showScript && (
        <>
          {editing && scriptMode !== 'karaoke' && <span className="mp-note">{scriptMode === 'none' ? 'Script: only you see it' : scriptMode === 'after' ? 'Script: learners see it after listening' : 'Script: learners open it with a button'}</span>}
          <Karaoke lines={lines} time={e.time} duration={e.duration || e.m.duration || 0} onSeek={(t) => (e.seek(t), !e.playing && !used && e.play())} />
        </>
      )}
      {((!teacher && scriptMode === 'button') || (teaching && scriptMode !== 'karaoke')) && lines.length > 0 && (
        <button type="button" className="mp-script-btn" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide the script' : 'Show the script'}
        </button>
      )}
      {!teacher && scriptMode === 'after' && lines.length > 0 && e.ends === 0 && <span className="mp-note">The script appears after you listen to the end.</span>}
    </div>
  );
}
