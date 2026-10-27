import { useAuth } from './auth';
import { useEffect, useState } from 'react';
import { onDisconnect, onValue, ref, serverTimestamp, update } from 'firebase/database';
import { rtdb } from './firebase';

// Who is around: online, away (the app hidden or untouched for a while), in a class right now,
// or on a video call. Each person's app keeps their own line up to date; others only read it.

export type Status = { state: 'online' | 'away' | 'offline'; at?: number; cls?: string | null; call?: boolean | null };
const AWAY_AFTER = 5 * 60_000;
let me = '';
let activity: Pick<Status, 'cls' | 'call'> = {};
const put = (p: Partial<Status>) => me && void update(ref(rtdb, `presence/${me}`), { ...p, at: serverTimestamp() }).catch(() => {});

export function startStatus(uid: string) {
  if (!uid || me === uid) return () => {};
  me = uid;
  const r = ref(rtdb, `presence/${uid}`);
  void onDisconnect(r).update({ state: 'offline', cls: null, call: null, at: serverTimestamp() });
  put({ state: document.hidden ? 'away' : 'online', ...activity });
  let idle = 0;
  const awake = () => {
    window.clearTimeout(idle);
    idle = window.setTimeout(() => put({ state: 'away' }), AWAY_AFTER);
  };
  let last = 0;
  const active = () => {
    if (Date.now() - last < 30_000) return awake();
    last = Date.now();
    put({ state: 'online' });
    awake();
  };
  const vis = () => (document.hidden ? (window.clearTimeout(idle), (idle = window.setTimeout(() => put({ state: 'away' }), 60_000))) : active());
  document.addEventListener('visibilitychange', vis);
  ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, active, { passive: true }));
  awake();
  return () => {
    document.removeEventListener('visibilitychange', vis);
    ['pointerdown', 'keydown'].forEach((e) => window.removeEventListener(e, active));
    window.clearTimeout(idle);
    put({ state: 'offline', cls: null, call: null });
    me = '';
  };
}

// In a class (its name) or on a call: set while it lasts.
export function setActivity(p: Pick<Status, 'cls' | 'call'>) {
  activity = { ...activity, ...p };
  put(p);
}

export function useStatus(uids: string[]) {
  const [m, setM] = useState<Record<string, Status>>({});
  const key = [...new Set(uids.filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!key) return;
    const offs = key.split(',').map((u) => onValue(ref(rtdb, `presence/${u}`), (s) => setM((x) => ({ ...x, [u]: (s.val() as Status) ?? { state: 'offline' } })), () => {}));
    return () => offs.forEach((o) => o());
  }, [key]);
  return m;
}

const ago = (ms?: number) => {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
// In words, and the dot's kind.
export function statusOf(p?: Status): { dot: 'call' | 'class' | 'online' | 'away' | 'off'; label: string } {
  if (!p || p.state === 'offline') return { dot: 'off', label: p?.at ? `Last seen ${ago(p.at)}` : 'Offline' };
  if (p.call) return { dot: 'call', label: 'On a call' };
  if (p.cls) return { dot: 'class', label: `In class: ${p.cls}` };
  return p.state === 'away' ? { dot: 'away', label: 'Away' } : { dot: 'online', label: 'Online' };
}
export function StatusDot({ p }: { p?: Status }) {
  const s = statusOf(p);
  return <span className={'pz pz-' + s.dot} data-tip={s.label} aria-label={s.label} role="img" />;
}

// Keeps this person's line up to date while they are signed in.
export function StatusBeat() {
  const { user } = useAuth();
  useEffect(() => (user ? startStatus(user.uid) : undefined), [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
