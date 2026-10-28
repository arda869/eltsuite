import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { NewShot, Shot, Ticket } from './tickets';

// Conversations between super admins and Claude (Super Admin → Claude). A super admin writes, with
// screenshots if they like, or hands Claude a support ticket. The thread then waits for Claude's
// hourly run: scripts/tickets.mjs copies it out (with the "ELT Suite support" Google Sheet and Drive
// folder in between), Claude works in the repository, and its answer comes back the same way, with
// the pull request for anything it changed. Only super admins read or write any of this.
//
// claudeThreads/{id}                the conversation and where it is
// claudeThreads/{id}/messages/{mid} what each side said
// claudeThreads/{id}/shots/{sid}    screenshots, one to a document, by message

export type ThreadState = 'waiting' | 'working' | 'answered' | 'failed';
export type Thread = {
  id: string;
  title: string;
  by: string;
  byName: string;
  ticket: string | null; // a support ticket handed to Claude
  state: ThreadState;
  seen?: boolean; // a super admin has read Claude's latest answer
  pr?: string; // the pull request with Claude's changes
  branch?: string;
  at: number;
  updatedAt: number;
};
export type Message = { id: string; role: 'admin' | 'claude'; by: string; byName: string; text: string; at: number };

export const STATE_LABEL: Record<ThreadState, string> = {
  waiting: 'Waiting for Claude',
  working: 'Claude is working on it',
  answered: 'Claude answered',
  failed: 'Claude couldn’t finish',
};

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const rand = (n: number) => Array.from({ length: n }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');

export function useThreads(on: boolean) {
  const [list, setList] = useState<Thread[] | null>(null);
  useEffect(() => {
    if (!on) return;
    return onSnapshot(
      collection(db, 'claudeThreads'),
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as Omit<Thread, 'id'>), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)),
      () => setList([]),
    );
  }, [on]);
  return list;
}

export function useThread(id: string | null | undefined) {
  const [t, setT] = useState<Thread | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return setT(null);
    return onSnapshot(
      doc(db, 'claudeThreads', id),
      (s) => setT(s.exists() ? ({ ...(s.data() as Omit<Thread, 'id'>), id: s.id } as Thread) : null),
      () => setT(null),
    );
  }, [id]);
  return t;
}

export function useThreadParts(id: string) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [shots, setShots] = useState<(Shot & { msg: string })[] | null>(null);
  useEffect(() => {
    const a = onSnapshot(
      collection(db, 'claudeThreads', id, 'messages'),
      (s) => setMessages(s.docs.map((d) => ({ ...(d.data() as Omit<Message, 'id'>), id: d.id })).sort((x, y) => x.at - y.at)),
      () => setMessages([]),
    );
    const b = onSnapshot(
      collection(db, 'claudeThreads', id, 'shots'),
      (s) => setShots(s.docs.map((d) => ({ ...(d.data() as Omit<Shot & { msg: string }, 'id'>), id: d.id })).sort((x, y) => x.at - y.at)),
      () => setShots([]),
    );
    return () => (a(), b());
  }, [id]);
  return { messages, shots };
}

type Me = { uid: string; name: string };

async function say(id: string, me: Me, text: string, shots: NewShot[]) {
  const at = Date.now();
  const mid = `${at}-${rand(4)}`;
  await setDoc(doc(db, 'claudeThreads', id, 'messages', mid), { role: 'admin', by: me.uid, byName: me.name.slice(0, 80), text: text.slice(0, 20000), at });
  for (const [i, s] of shots.entries()) await setDoc(doc(db, 'claudeThreads', id, 'shots', `${at}-${i}`), { ...s, by: me.uid, msg: mid, note: null, at: at + i });
  return at;
}

export async function startThread(me: Me, title: string, text: string, shots: NewShot[], ticket: Ticket | null = null) {
  const id = `${Date.now().toString(36)}-${rand(4)}`;
  const now = Date.now();
  // Waiting only once the first message is in, so Claude never picks up half a thread.
  await setDoc(doc(db, 'claudeThreads', id), { title: title.trim().slice(0, 140) || 'A question', by: me.uid, byName: me.name.slice(0, 80), ticket: ticket?.id ?? null, state: 'answered', seen: true, at: now, updatedAt: now });
  await say(id, me, text, shots);
  await updateDoc(doc(db, 'claudeThreads', id), { state: 'waiting', updatedAt: Date.now() });
  if (ticket) await updateDoc(doc(db, 'tickets', ticket.id), { escalated: { thread: id, at: now, byName: me.name.slice(0, 80) } });
  return id;
}

export async function sendToClaude(t: Thread, me: Me, text: string, shots: NewShot[]) {
  const at = await say(t.id, me, text, shots);
  await updateDoc(doc(db, 'claudeThreads', t.id), { state: 'waiting', seen: true, updatedAt: at });
}

export const markSeen = (t: Thread) => (t.state === 'answered' || t.state === 'failed') && !t.seen && updateDoc(doc(db, 'claudeThreads', t.id), { seen: true }).catch(() => {});
