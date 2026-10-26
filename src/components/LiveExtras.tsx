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
export function TimerChip({ timer, onStop }: { timer?: LiveState['timer']; onStop?: () => void }) {
  const [now, setNow] = useState(Date.now());
  const rang = useRef(false);
  useEffect(() => {
    if (!timer) return;
    rang.current = false;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [timer?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!timer) return null;
  const left = Math.max(0, timer.endsAt - now);
  if (left === 0 && !rang.current) {
    rang.current = true;
    chime();
  }
  if (left === 0 && now - timer.endsAt > 15000) return null;
  const s = Math.ceil(left / 1000);
  const pct = timer.total ? left / (timer.total * 1000) : 0;
  return (
    <div className={'timer-chip' + (left === 0 ? ' done' : s <= 10 ? ' soon' : '')} role="timer" aria-live="off">
      <svg width="22" height="22" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--hair-strong)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${pct * 94.2} 94.2`} transform="rotate(-90 18 18)" strokeLinecap="round" />
      </svg>
      <span className="timer-text">{left === 0 ? 'Time’s up' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
      {onStop && (
        <button type="button" className="timer-stop" onClick={onStop} aria-label="Stop the timer">
          ×
        </button>
      )}
    </div>
  );
}

// "It's your turn" when the teacher picks someone at random.
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
