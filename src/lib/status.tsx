import { useAuth } from './auth';
import { useEffect, useState } from 'react';
import { onDisconnect, onValue, ref, serverTimestamp, update } from 'firebase/database';
import { rtdb } from './firebase';

// Who is around: online, away (the app hidden or untouched for a while), in a class right now,
// or on a video call. Each person's app keeps their own line up to date; others only read it.

export type StatusSet = 'auto' | 'away' | 'teaching' | 'busy' | 'hidden';
export type Status = { state: 'online' | 'away' | 'offline'; at?: number; cls?: string | null; call?: boolean | null; set?: StatusSet };
// What a person chose to show: automatic, away, do not disturb, or offline to others.
export const STATUS_SETS: { k: StatusSet; label: string; hint: string }[] = [
  { k: 'auto', label: 'Automatic', hint: 'Online, away, in class or on a call, as it happens' },
  { k: 'away', label: 'Away', hint: 'Until you change it' },
  { k: 'teaching', label: 'Teaching', hint: 'Shown as in class; message sounds are off' },
  { k: 'busy', label: 'Do not disturb', hint: 'Message sounds are off' },
  { k: 'hidden', label: 'Appear offline', hint: 'Others see you as offline' },
];
const SET_KEY = 'll.statusSet';
export const mySet = (): StatusSet => {
  try {
    return (localStorage.getItem(SET_KEY) as StatusSet) || 'auto';
  } catch {
    return 'auto';
  }
};
const setListeners = new Set<(s: StatusSet) => void>();
export function setMyStatus(v: StatusSet) {
  try {
    localStorage.setItem(SET_KEY, v);
  } catch {
    /* fine */
  }
  setListeners.forEach((f) => f(v));
  put({ set: v });
}
export function useMySet() {
  const [v, setV] = useState(mySet);
  useEffect(() => {
    setListeners.add(setV);
    return () => void setListeners.delete(setV);
  }, []);
  return v;
}
const AWAY_AFTER = 5 * 60_000;
let me = '';
let activity: Pick<Status, 'cls' | 'call'> = {};
const put = (p: Partial<Status>) => me && void update(ref(rtdb, `presence/${me}`), { ...p, at: serverTimestamp() }).catch(() => {});

export function startStatus(uid: string) {
  if (!uid || me === uid) return () => {};
  me = uid;
  const r = ref(rtdb, `presence/${uid}`);
  void onDisconnect(r).update({ state: 'offline', cls: null, call: null, at: serverTimestamp() });
  put({ state: document.hidden ? 'away' : 'online', set: mySet(), ...activity });
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

// Teaching right now, chosen or live in a lesson: message sounds stay off.
export const quietNow = () => ['busy', 'teaching'].includes(mySet()) || !!activity.cls;
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
export function statusOf(p?: Status): { dot: 'call' | 'class' | 'online' | 'away' | 'off' | 'busy'; label: string } {
  if (p?.set === 'hidden') return { dot: 'off', label: 'Offline' };
  if (!p || p.state === 'offline') return { dot: 'off', label: p?.at ? `Last seen ${ago(p.at)}` : 'Offline' };
  if (p.set === 'busy') return { dot: 'busy', label: p.call ? 'On a call, do not disturb' : p.cls ? `In class: ${p.cls}, do not disturb` : 'Do not disturb' };
  if (p.set === 'away') return { dot: 'away', label: 'Away' };
  if (p.set === 'teaching') return { dot: 'class', label: p.cls ? `Teaching: ${p.cls}` : 'Teaching' };
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
