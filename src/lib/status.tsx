import { useAuth } from './auth';
import { useEffect, useState } from 'react';
import { onDisconnect, onValue, ref, serverTimestamp, set, update } from 'firebase/database';
import { auth, rtdb } from './firebase';

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
const setKey = (uid: string) => `ll.statusSet.${uid}`;
export const mySet = (): StatusSet => {
  try {
    const uid = me || auth.currentUser?.uid;
    return uid ? (localStorage.getItem(setKey(uid)) as StatusSet) || 'auto' : 'auto';
  } catch {
    return 'auto';
  }
};
const setListeners = new Set<(s: StatusSet) => void>();
export function setMyStatus(v: StatusSet) {
  try {
    const uid = me || auth.currentUser?.uid;
    if (uid) localStorage.setItem(setKey(uid), v);
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
let tabState: 'online' | 'away' = 'online';
// Each open tab (on any device) keeps its own line under presence/{uid}/c/{tab}; the line goes
// when the tab closes or loses its connection, and comes back when the connection does. Someone is
// online while any of their tabs is in use, away while all are hidden or idle, and offline (last
// seen at `last`) when none is open. What they chose to show (`set`) is shared by all their tabs.
const TAB = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const tabRef = () => ref(rtdb, `presence/${me}/c/${TAB}`);
const writeTab = () => me && void set(tabRef(), { state: tabState, at: serverTimestamp(), cls: activity.cls ?? null, call: activity.call ?? null }).catch(() => {});
const put = (p: Partial<Status>) => {
  if (!me) return;
  if (p.set !== undefined) void update(ref(rtdb, `presence/${me}`), { set: p.set }).catch(() => {});
  if (p.state === 'online' || p.state === 'away') tabState = p.state;
  if (p.state !== undefined || p.cls !== undefined || p.call !== undefined) writeTab();
};

// Normal sign-out removes this tab while its authenticated write is still allowed.
export async function clearStatusBeforeSignOut() {
  if (!me) return;
  const uid = me;
  await Promise.race([
    Promise.allSettled([
      set(ref(rtdb, `presence/${uid}/c/${TAB}`), null),
      set(ref(rtdb, `presence/${uid}/last`), serverTimestamp()),
    ]),
    new Promise((resolve) => window.setTimeout(resolve, 1500)),
  ]);
}

export function startStatus(uid: string) {
  if (!uid || me === uid) return () => {};
  me = uid;
  setListeners.forEach((f) => f(mySet()));
  tabState = document.hidden ? 'away' : 'online';
  // The old single line is cleared, so it can't keep someone online for ever.
  void update(ref(rtdb, `presence/${uid}`), { v: 2, set: mySet(), state: null, at: null, cls: null, call: null }).catch(() => {});
  // Every time the connection comes (back), the tab's line is armed to go when it drops, then written.
  const offConn = onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true || me !== uid) return;
    void onDisconnect(tabRef()).remove()
      .then(() => onDisconnect(ref(rtdb, `presence/${uid}/last`)).set(serverTimestamp()))
      .then(writeTab)
      .catch(() => {});
  });
  let idle = 0;
  const awake = () => {
    window.clearTimeout(idle);
    idle = window.setTimeout(() => put({ state: 'away' }), AWAY_AFTER);
  };
  let last = 0;
  const active = () => {
    if (tabState === 'online' && Date.now() - last < 30_000) return awake();
    last = Date.now();
    put({ state: 'online' });
    awake();
  };
  const vis = () => (document.hidden ? (window.clearTimeout(idle), (idle = window.setTimeout(() => put({ state: 'away' }), 60_000))) : active());
  const ownTab = ref(rtdb, `presence/${uid}/c/${TAB}`);
  const bye = () => { void set(ownTab, null); void set(ref(rtdb, `presence/${uid}/last`), serverTimestamp()); };
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', bye);
  ['pointerdown', 'keydown', 'focus'].forEach((e) => window.addEventListener(e, active, { passive: true }));
  awake();
  return () => {
    offConn();
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('pagehide', bye);
    ['pointerdown', 'keydown', 'focus'].forEach((e) => window.removeEventListener(e, active));
    window.clearTimeout(idle);
    bye();
    // Leave the disconnect removal armed if sign-out has already invalidated this write.
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

type Tab = { state?: 'online' | 'away'; at?: number; cls?: string | null; call?: boolean | null };
type Line = Status & { v?: number; last?: number; c?: Record<string, Tab> };
// One person's tabs, as one status.
export function combine(v: Line | null | undefined): Status {
  if (!v) return { state: 'offline' };
  if (v.v !== 2 && !v.c) return v; // an app from before tabs had lines of their own
  const tabs = Object.values(v.c ?? {});
  if (!tabs.length) return { state: 'offline', at: v.last, set: v.set };
  return {
    state: tabs.some((t) => t.state === 'online') ? 'online' : 'away',
    at: Math.max(0, ...tabs.map((t) => Number(t.at) || 0)),
    cls: tabs.find((t) => t.cls)?.cls ?? null,
    call: tabs.some((t) => t.call) || null,
    set: v.set,
  };
}

export function useStatus(uids: string[]) {
  const [m, setM] = useState<Record<string, Status>>({});
  const key = [...new Set(uids.filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!key) return;
    const offs = key.split(',').map((u) => onValue(ref(rtdb, `presence/${u}`), (s) => setM((x) => ({ ...x, [u]: combine(s.val() as Line | null) })), () => {}));
    return () => offs.forEach((o) => o());
  }, [key]);
  // “Last seen 5 min ago” stays true as time passes.
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(t); }, []);
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
