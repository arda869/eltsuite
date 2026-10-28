import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { onEngineEnded, startEngine, stopEngine } from './callEngine';
import { setActivity } from './status';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { chatTitle, sendMsg, type Chat, type Person } from './chat';
import { currentOrg, limitMessage, orgHasRoom } from './admin';
import { LimitError } from './limitError';

// Rooms: audio and video calls. A call takes one of the ready rooms (scripts/video.mjs keeps a
// stock of them), so it starts at once; class lessons use the class's own room.

export type CallKind = 'audio' | 'video';
export type ChatCall = { url: string; room: string; kind: CallKind; by: string; byName: string; at: number; ended?: number | null; declined?: string[]; code?: string };
export const RING_MS = 45_000;
export const CALL_MAX_MS = 8 * 3600e3;

// What to tell someone when a call cannot start: no free room, or the organisation's call minutes used up.
export const callStartError = (e: unknown, fallback: string) => (e instanceof NoRoomError || e instanceof LimitError ? e.message : fallback);

export class NoRoomError extends Error {
  constructor() {
    super('No call room is free right now. Try again in a few minutes.');
  }
}

// Takes a free room for a call: one of the first few, at random, so two people starting calls at
// the same moment rarely reach for the same one.
export async function takeRoom(forWhat: string): Promise<{ url: string; name: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new NoRoomError();
  // An organisation that has used its call minutes this month starts no new call (see firestore.rules).
  const org = currentOrg();
  if (org && !orgHasRoom(org, 'callMinutes')) throw new LimitError(limitMessage(org, 'callMinutes'));
  for (let tries = 0; tries < 5; tries++) {
    const free = await getDocs(query(collection(db, 'callRooms'), where('state', '==', 'free'), limit(10)));
    if (free.empty) throw new NoRoomError();
    const pick = free.docs[Math.floor(Math.random() * free.docs.length)];
    const ref = doc(db, 'callRooms', pick.id);
    const got = await runTransaction(db, async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists() || s.data().state !== 'free') return null;
      tx.update(ref, { state: 'used', by: uid, usedAt: Date.now(), for: forWhat });
      return { url: String(s.data().url), name: s.id };
    }).catch(() => null);
    if (got) return got;
  }
  throw new NoRoomError();
}

// A call in a chat: everyone in it is called; the room stays theirs until the call ends.
export async function startChatCall(c: Chat, me: Person, kind: CallKind): Promise<ChatCall> {
  const live = callOn(c);
  if (live) return live;
  const r = await takeRoom('chat:' + c.id);
  const code = await makeCallLink({ url: r.url, title: chatTitle(c, me.key), kind, byName: me.name, chatId: c.id }).catch(() => undefined);
  const call: ChatCall = { url: r.url, room: r.name, kind, by: me.key, byName: me.name, at: Date.now(), ended: null, declined: [], ...(code ? { code } : {}) };
  await updateDoc(doc(db, 'chats', c.id), { call });
  void sendMsg(c, me, { text: kind === 'video' ? 'Started a video call' : 'Started an audio call' }).catch(() => {});
  return call;
}
export const endChatCall = (c: Chat) => updateDoc(doc(db, 'chats', c.id), { 'call.ended': Date.now() }).catch(() => {});
export const declineCall = (c: Chat, me: string) => updateDoc(doc(db, 'chats', c.id), { 'call.declined': arrayUnion(me) }).catch(() => {});

// The chat's call, while it is on.
export const callOn = (c?: Chat | null): ChatCall | null => {
  const k = (c as (Chat & { call?: ChatCall }) | null | undefined)?.call;
  return k && !k.ended && Date.now() - k.at < CALL_MAX_MS ? k : null;
};
// Still ringing for this person: just started, by someone else, not turned down.
export const ringing = (c: Chat, me: string) => {
  const k = callOn(c);
  return !!k && k.by !== me && Date.now() - k.at < RING_MS && !(k.declined ?? []).includes(me);
};

// The call this person has open, anywhere in the app: one at a time, in one tab at a time.
// code: the call's own link, eltsuite.com/call/<code>, when it can be shared.
export type OpenCall = { url: string; title: string; kind: CallKind; chatId?: string; classId?: string; sessionId?: string; token?: string; sub?: string; code?: string; camOff?: boolean; micOff?: boolean };
let current: OpenCall | null = null;
const subs = new Set<(c: OpenCall | null) => void>();
const tab = Math.random().toString(36).slice(2);
const bc: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ll-call') : null;
const say = (m: object) => bc?.postMessage({ ...m, tab });
const set = (c: OpenCall | null) => {
  current = c;
  // Colleagues see "On a call" while it lasts.
  setActivity({ call: c ? true : null });
  subs.forEach((f) => f(c));
};
export function openCall(c: OpenCall | null) {
  if (!c) return void leaveCall();
  if (current?.url === c.url && current.token === c.token) return;
  set(c);
  // Any other tab with a call open lets this one have it.
  say({ t: 'claim', url: c.url });
  void startEngine(c);
}
// Leaving: when nobody else is left, the call is over for the chat or the meeting too.
export function leaveCall() {
  const c = current;
  if (!c) return;
  set(null);
  const others = stopEngine();
  say({ t: 'gone' });
  if (others > 0) return;
  if (c.chatId) void updateDoc(doc(db, 'chats', c.chatId), { 'call.ended': Date.now() }).catch(() => {});
  if (c.sessionId) void updateDoc(doc(db, 'sessions', c.sessionId), { live: null }).catch(() => {});
}
onEngineEnded(() => {
  set(null);
  say({ t: 'gone' });
});
export const openCallNow = () => current;
declare const __BUILD__: string;
if (__BUILD__ === 'dev') (window as unknown as { __openCall: typeof openCall }).__openCall = openCall;
export function useOpenCall() {
  const [c, setC] = useState(current);
  useEffect(() => {
    subs.add(setC);
    return () => void subs.delete(setC);
  }, []);
  return c;
}

// Other tabs: the tab with the call says so every few seconds; the others show a handle at the
// edge to bring the call over (it leaves there and joins here, in a moment).
let remote: { call: OpenCall; at: number } | null = null;
const rsubs = new Set<(r: OpenCall | null) => void>();
const rset = (r: typeof remote) => {
  remote = r;
  rsubs.forEach((f) => f(r?.call ?? null));
};
bc?.addEventListener('message', (e) => {
  const m = e.data as { t: string; tab: string; url?: string; call?: OpenCall };
  if (m.tab === tab) return;
  if (m.t === 'claim' && current) {
    // The call moved to another tab: it stops here, without ending it for the others.
    set(null);
    stopEngine();
  }
  if (m.t === 'here' && m.call) rset({ call: m.call, at: Date.now() });
  if (m.t === 'gone' || m.t === 'claim') rset(null);
});
if (bc)
  window.setInterval(() => {
    if (current) say({ t: 'here', call: current });
    else if (remote && Date.now() - remote.at > 6000) rset(null);
  }, 2000);
window.addEventListener('pagehide', () => current && say({ t: 'gone' }));
export function useCallElsewhere() {
  const [r, setR] = useState(remote?.call ?? null);
  useEffect(() => {
    rsubs.add(setR);
    return () => void rsubs.delete(setR);
  }, []);
  return r;
}

// Into a tab of its own: the new tab takes the call over as it opens.
export function popOutCall() {
  if (!current) return;
  try {
    localStorage.setItem('ll.callHandoff', JSON.stringify({ call: current, at: Date.now() }));
  } catch {
    return;
  }
  window.open(current.code ? `/call/${current.code}?go=1` : '/call/here', '_blank');
}
export function takeHandoff(): OpenCall | null {
  try {
    const raw = localStorage.getItem('ll.callHandoff');
    localStorage.removeItem('ll.callHandoff');
    const h = raw ? (JSON.parse(raw) as { call: OpenCall; at: number }) : null;
    return h && Date.now() - h.at < 60_000 ? h.call : null;
  } catch {
    return null;
  }
}

// The call's own link. Anyone with it can open eltsuite.com/call/<code> and join; nobody can list
// the links. It points at the call room only while the call is on.
export type CallLink = { url: string; title: string; kind: CallKind; by: string; byName: string; at: number; chatId?: string | null; sessionId?: string | null };
const CODE = 'abcdefghjkmnpqrstuvwxyz23456789';
export async function makeCallLink(l: Omit<CallLink, 'by' | 'at'>): Promise<string> {
  const code = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => CODE[b % CODE.length]).join('');
  await setDoc(doc(db, 'callLinks', code), JSON.parse(JSON.stringify({ ...l, by: auth.currentUser?.uid ?? '', at: Date.now() })));
  return code;
}
export const callLinkUrl = (code: string) => `${location.origin}/call/${code}`;
// A meeting's link for people without an account: made once, kept on the session, and pointed at
// the meeting's room each time it starts. Until then the link waits for it.
export async function guestLink(s: { id: string; title: string; guest?: string; live?: { url: string; at: number } | null }, byName: string): Promise<string> {
  if (s.guest) return s.guest;
  const live = s.live && Date.now() - s.live.at < 8 * 3600e3 ? s.live.url : '';
  const code = await makeCallLink({ url: live, title: s.title, kind: 'video', byName, sessionId: s.id });
  await updateDoc(doc(db, 'sessions', s.id), { guest: code });
  return code;
}
export const pointGuestLink = (code: string, url: string) => updateDoc(doc(db, 'callLinks', code), { url, at: Date.now() }).catch(() => {});
export async function readCallLink(code: string): Promise<CallLink | null> {
  const s = await getDoc(doc(db, 'callLinks', code)).catch(() => null);
  return s?.exists() ? (s.data() as CallLink) : null;
}

// Calling someone into a call that is already on (a class's video room): their device rings
// wherever they are in ELT Suite. key: a teacher's uid, or a learner's learner id.
export type CallRing = { url: string; title: string; kind: CallKind; classId?: string | null; code?: string | null; by: string; byName: string; at: number };
export const ringPerson = (key: string, r: Omit<CallRing, 'by' | 'at'>) =>
  setDoc(doc(db, 'callRings', key), JSON.parse(JSON.stringify({ ...r, by: auth.currentUser?.uid ?? '', at: Date.now() })));
export const clearRing = (key: string) => deleteDoc(doc(db, 'callRings', key)).catch(() => {});
export function useMyRing(key?: string) {
  const [r, setR] = useState<CallRing | null>(null);
  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      doc(db, 'callRings', key),
      (s) => setR(s.exists() ? (s.data() as CallRing) : null),
      () => setR(null),
    );
  }, [key]);
  return r;
}
