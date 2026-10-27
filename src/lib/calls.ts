import { arrayUnion, collection, doc, getDocs, limit, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { sendMsg, type Chat, type Person } from './chat';

// Rooms: audio and video calls. A call takes one of the ready rooms (scripts/video.mjs keeps a
// stock of them), so it starts at once; class lessons use the class's own room.

export type CallKind = 'audio' | 'video';
export type ChatCall = { url: string; room: string; kind: CallKind; by: string; byName: string; at: number; ended?: number | null; declined?: string[] };
export const RING_MS = 45_000;
export const CALL_MAX_MS = 8 * 3600e3;

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
  const call: ChatCall = { url: r.url, room: r.name, kind, by: me.key, byName: me.name, at: Date.now(), ended: null, declined: [] };
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

// The call this person has open, anywhere in the app: one at a time.
export type OpenCall = { url: string; title: string; kind: CallKind; chatId?: string; classId?: string; sessionId?: string; token?: string; sub?: string };
let current: OpenCall | null = null;
const subs = new Set<(c: OpenCall | null) => void>();
export function openCall(c: OpenCall | null) {
  current = c;
  subs.forEach((f) => f(c));
}
export const openCallNow = () => current;
export function useOpenCall() {
  const [c, setC] = useState(current);
  useEffect(() => {
    subs.add(setC);
    return () => void subs.delete(setC);
  }, []);
  return c;
}
