import { IconBtn } from './UiIcon';
import { useEffect, useRef, useState } from 'react';
import { acknowledge, chime, useAnnouncements } from '../lib/announce';
import { setSignal, useMySignal, type Reaction } from '../lib/session';
import type { LiveState } from '../lib/live';
import { Icon } from '../editor/Icons';

// Live extras learners and the teacher see during a lesson.

export const REACTIONS: { key: Reaction; icon: string; label: string }[] = [
  { key: 'thumbsup', icon: 'thumbsup', label: 'Got it' },
  { key: 'heart', icon: 'heart', label: 'Love it' },
  { key: 'laugh', icon: 'laugh', label: 'Funny' },
  { key: 'wow', icon: 'wow', label: 'Wow' },
  { key: 'clap', icon: 'clap', label: 'Well done' },
];

// Countdown everyone sees.
export function TimerChip({ timer, onStop, onAdd }: { timer?: LiveState['timer']; onStop?: () => void; onAdd?: () => void }) {
  const [now, setNow] = useState(Date.now());
  const rang = useRef(false);
  useEffect(() => {
    if (!timer) return;
    rang.current = false;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [timer?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!timer) return null;
  if (timer.up) {
    const el = Math.max(0, Math.floor((now - (timer.startedAt ?? now)) / 1000));
    const C2 = 2 * Math.PI * 20;
    const h = Math.floor(el / 3600);
    const mm = Math.floor((el % 3600) / 60);
    return (
      <div className="timer-card up" role="timer" aria-live="off" aria-label={`${mm} minutes ${el % 60} seconds so far`}>
        <svg className="timer-ring" width="52" height="52" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#ece9e4" strokeWidth="5" />
          <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray={`${((el % 60) / 60) * C2} ${C2}`} transform="rotate(-90 24 24)" strokeLinecap="round" />
        </svg>
        <span className="timer-body">
          <span className="timer-text">{h ? `${h}:${String(mm).padStart(2, '0')}` : mm}:{String(el % 60).padStart(2, '0')}</span>
          <span className="timer-sub">counting up</span>
        </span>
        {onStop && (
          <span className="timer-acts">
            <button type="button" onClick={onStop} data-tip="Stop" aria-label="Stop">
              ×
            </button>
          </span>
        )}
      </div>
    );
  }
  const left = Math.max(0, timer.endsAt - now);
  if (left === 0 && !rang.current) {
    rang.current = true;
    chime();
  }
  if (left === 0 && now - timer.endsAt > 15000) return null;
  const s = Math.ceil(left / 1000);
  const pct = timer.total ? Math.min(1, left / (timer.total * 1000)) : 0;
  const C = 2 * Math.PI * 20;
  return (
    <div className={'timer-card' + (left === 0 ? ' done' : s <= 10 ? ' soon' : '')} role="timer" aria-live="off" aria-label={left === 0 ? 'Time is up' : `${Math.floor(s / 60)} minutes ${s % 60} seconds left`}>
      <svg className="timer-ring" width="52" height="52" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="none" stroke="#ece9e4" strokeWidth="5" />
        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 24 24)" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.25s linear' }} />
        {left === 0 && <path d="M17 24.5l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <span className="timer-body">
        <span className="timer-text">{left === 0 ? 'Time’s up' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
        <span className="timer-sub">{left === 0 ? 'Well done' : `of ${Math.round(timer.total / 60) >= 1 ? `${Math.round(timer.total / 60)} min` : `${timer.total} s`}`}</span>
      </span>
      {(onAdd || onStop) && (
        <span className="timer-acts">
          {onAdd && left > 0 && (
            <button type="button" onClick={onAdd} data-tip="Add a minute">
              +1
            </button>
          )}
          {onStop && (
            <button type="button" onClick={onStop} data-tip="Stop the timer" aria-label="Stop the timer">
              ×
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// Teacher: choose any length (minutes and seconds) or count up.
export function TimerMenu({ running, up, onStart, onCountUp, onAdd, onStop }: { running: boolean; up: boolean; onStart: (secs: number) => void; onCountUp: () => void; onAdd: () => void; onStop: () => void }) {
  const saved = (() => {
    try {
      return Number(localStorage.getItem('ll.timerSecs')) || 300;
    } catch {
      return 300;
    }
  })();
  const [mode, setMode] = useState<'down' | 'up'>('down');
  const [min, setMin] = useState(Math.floor(saved / 60));
  const [sec, setSec] = useState(saved % 60);
  const total = min * 60 + sec;
  const clampMin = (v: number) => Math.max(0, Math.min(180, Math.round(v) || 0));
  const start = () => {
    if (total <= 0) return;
    try {
      localStorage.setItem('ll.timerSecs', String(total));
    } catch {
      /* ignore */
    }
    onStart(total);
  };
  return (
    <div className="timer-menu" role="dialog" aria-label="Timer">
      <span className="seg small-seg" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'down'} className={mode === 'down' ? 'on' : ''} onClick={() => setMode('down')}>
          Count down
        </button>
        <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>
          Count up
        </button>
      </span>
      {mode === 'down' ? (
        <>
          <div className="tm-set">
            <span className="tm-unit">
              <button type="button" aria-label="One minute less" onClick={() => setMin((m) => clampMin(m - 1))}>
                −
              </button>
              <input aria-label="Minutes" inputMode="numeric" value={String(min)} onChange={(e) => setMin(clampMin(Number(e.target.value.replace(/\D/g, ''))))} onKeyDown={(e) => e.key === 'Enter' && start()} />
              <button type="button" aria-label="One minute more" onClick={() => setMin((m) => clampMin(m + 1))}>
                +
              </button>
              <span className="tm-lab">min</span>
            </span>
            <span className="tm-colon">:</span>
            <span className="tm-unit">
              <button type="button" aria-label="Fifteen seconds less" onClick={() => (sec >= 15 ? setSec(sec - 15) : min > 0 ? (setMin(min - 1), setSec(sec + 45)) : setSec(0))}>
                −
              </button>
              <input aria-label="Seconds" inputMode="numeric" value={String(sec).padStart(2, '0')} onChange={(e) => setSec(Math.min(59, Number(e.target.value.replace(/\D/g, '').slice(-2)) || 0))} onKeyDown={(e) => e.key === 'Enter' && start()} />
              <button type="button" aria-label="Fifteen seconds more" onClick={() => (sec + 15 >= 60 ? (setMin(clampMin(min + 1)), setSec(sec + 15 - 60)) : setSec(sec + 15))}>
                +
              </button>
              <span className="tm-lab">sec</span>
            </span>
          </div>
          <button type="button" className="btn primary block" disabled={total <= 0} onClick={start}>
            Start {min ? `${min} min` : ''}
            {sec ? ` ${sec} s` : ''}
          </button>
        </>
      ) : (
        <>
          <span className="hint">A stopwatch everyone sees, counting up from 0:00. Good for “how long does it take you?”</span>
          <button type="button" className="btn primary block" onClick={onCountUp}>
            Start counting up
          </button>
        </>
      )}
      {running && (
        <span className="timer-running">
          {!up && (
            <button type="button" className="btn small-btn" onClick={onAdd}>
              + 1 min
            </button>
          )}
          <button type="button" className="btn small-btn" onClick={onStop}>
            Stop the {up ? 'stopwatch' : 'timer'}
          </button>
        </span>
      )}
    </div>
  );
}

export function PickedBanner({ picked, me, onClose }: { picked?: LiveState['picked']; me?: string; onClose?: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (!picked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [picked?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!picked || now - picked.at > 8000 || hidden === picked.at) return null;
  const mine = picked.learnerId === me;
  return (
    <div className={'picked-banner' + (mine ? ' mine' : '')} role="status">
      <span className="picked-name">{picked.name.split(' ')[0]}</span>
      <span>{mine ? 'It’s your turn!' : 'is next'}</span>
      <button type="button" className="picked-x" aria-label={onClose ? 'Close for everyone' : 'Close'} title={onClose ? 'Close for everyone' : 'Close'} onClick={() => (setHidden(picked.at), onClose?.())}>
        ×
      </button>
    </div>
  );
}

// One answer shown to the whole class, without the learner's name.
export function SpotlightCard({ spotlight, taskId, onClose }: { spotlight?: LiveState['spotlight']; taskId: string; onClose?: () => void }) {
  if (!spotlight || spotlight.taskId !== taskId) return null;
  return (
    <div className="spotlight" role="status">
      <span className="eyebrow">Let’s look at this answer together</span>
      <p className="spotlight-text">{spotlight.text || '(no answer)'}</p>
      {onClose && (
        <button type="button" className="btn small-btn" onClick={onClose}>
          Stop showing
        </button>
      )}
    </div>
  );
}

// Learner: raise a hand, say "I'm stuck", or send a quick reaction.
export function SignalBar({ classId, uid, name, learnerId }: { classId: string; uid?: string; name: string; learnerId: string }) {
  const me = useMySignal(classId, uid);
  const [open, setOpen] = useState(false);
  if (!uid) return null;
  const send = (p: Parameters<typeof setSignal>[2]) => setSignal(classId, uid, { name, learnerId, ...p });
  return (
    <div className="signal-bar" role="group" aria-label="Tell your teacher">
      <IconBtn icon="hand" label={me?.hand ? 'Your hand is up · lower it' : 'Raise your hand'} active={!!me?.hand} onClick={() => send({ hand: !me?.hand, handAt: Date.now() })} />
      <IconBtn icon="stuck" label={me?.stuck ? 'Your teacher knows you need help · click when you are fine' : 'I’m stuck: tell your teacher'} active={!!me?.stuck} onClick={() => send({ stuck: !me?.stuck })} />
      <span className="sig-react">
        <IconBtn icon="react" label="Send a reaction" aria-expanded={open} active={open} onClick={() => setOpen((o) => !o)} />
        {open && (
          <span className="sig-pop">
            {REACTIONS.map((r) => (
              <button key={r.key} type="button" title={r.label} aria-label={r.label} onClick={() => (send({ reaction: r.key, reactionAt: Date.now() }), setOpen(false))}>
                <Icon name={r.icon} size="22" tone="accent" />
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

// Learner: announcement cards, top right, until "Got it".
export function AnnouncementCards({ classId, learnerId }: { classId: string; learnerId: string }) {
  const list = useAnnouncements(classId, true);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const mine = list.filter((a) => (a.to === 'all' || (Array.isArray(a.to) && a.to.includes(learnerId))) && (!a.acks?.[learnerId] || (a.remindAt ?? 0) > (a.acks?.[learnerId] ?? 0)));
  useEffect(() => {
    const fresh = mine.filter((a) => !seen.current.has(a.id + ':' + (a.remindAt ?? 0)));
    fresh.forEach((a) => seen.current.add(a.id + ':' + (a.remindAt ?? 0)));
    if (!first.current && fresh.some((a) => a.chime)) chime();
    if (list.length) first.current = false;
  });
  if (!mine.length) return null;
  return (
    <div className="ann-stack" aria-live="polite">
      {mine.slice(0, 4).map((a) => (
        <div key={a.id} className="ann-card">
          <span className="eyebrow">From your teacher</span>
          <p className="ann-text">{a.text}</p>
          {a.link && /^https:\/\//.test(a.link) && (
            <a className="ann-link" href={a.link} target="_blank" rel="noopener noreferrer">
              Open the link ↗
            </a>
          )}
          <button type="button" className="btn small-btn primary" onClick={() => acknowledge(classId, a.id, learnerId)}>
            Got it
          </button>
        </div>
      ))}
    </div>
  );
}
