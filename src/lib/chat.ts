import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where, arrayUnion, arrayRemove, type DocumentData } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db, rtdb } from './firebase';
import { onDisconnect, onValue, ref, remove, set } from 'firebase/database';
import type { AnswerKey } from './questions';

// Messages. Learners write to classmates and their teachers; teachers write to learners in
// their classes and to colleagues. Chats are one to one or groups. A message is rich: the
// same text tools as tasks, @tags, replies, reactions, and whole task elements (a question,
// a vocabulary box…) that the reader can answer right there. Teachers can also send
// materials (lessons, tasks, documents, media) that colleagues copy into their own classes.
//
// Everyone has a key: a teacher's sign-in id, or a learner's learner id.

export type Person = { key: string; name: string; role: 'teacher' | 'learner'; classId?: string };
export type Chat = {
  id: string;
  members: string[];
  names: Record<string, string>;
  roles: Record<string, 'teacher' | 'learner'>;
  kind: 'dm' | 'group';
  title?: string;
  classId?: string | null; // set when learners are in it: their teachers can read it
  createdBy: string;
  at: number;
  lastAt: number;
  last?: { text: string; name: string; by: string; mentions?: string[] };
  seen?: Record<string, number>;
};
export type Msg = {
  id: string;
  by: string;
  name: string;
  role: 'teacher' | 'learner';
  at: number;
  text: string; // plain text, for previews
  content?: JSONContent | null;
  key?: AnswerKey;
  blocks?: number; // task elements in it
  mentions?: string[];
  replyTo?: { id: string; name: string; text: string } | null;
  share?: { id: string; title: string; kind: string; ownerName: string } | null;
  reactions?: Record<string, string[]>;
  edited?: number;
  deleted?: boolean;
  shareAnswers?: boolean; // the others see everyone's answers once they have answered
};
// One person's answers to the questions in a message.
export type ChatAnswer = { by: string; name: string; at: number; responses: Record<string, unknown>; score: number; total: number };

const col = collection(db, 'chats');
export const msgsCol = (chatId: string) => collection(db, 'chats', chatId, 'msgs');

export function useChats(me?: string) {
  const [list, setList] = useState<Chat[] | null>(null);
  useEffect(() => {
    if (!me) return;
    return onSnapshot(query(col, where('members', 'array-contains', me)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Chat, 'id'>) })).sort((a, b) => b.lastAt - a.lastAt)), () => setList([]));
  }, [me]);
  return list;
}
export const unreadIn = (c: Chat, me: string) => !!c.last && c.last.by !== me && (c.seen?.[me] ?? 0) < c.lastAt;
export function useUnread(me?: string) {
  const chats = useChats(me);
  return useMemo(() => (chats ?? []).filter((c) => me && unreadIn(c, me)).length, [chats, me]);
}

export function useMessages(chatId?: string) {
  const [list, setList] = useState<Msg[] | null>(null);
  useEffect(() => {
    if (!chatId) return;
    setList(null);
    return onSnapshot(query(msgsCol(chatId), orderBy('at', 'desc'), limit(200)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, 'id'>) })).reverse()), () => setList([]));
  }, [chatId]);
  return list;
}

// One to one chats have a fixed id, so the same two people always meet in the same chat.
export async function openChat(me: Person, others: Person[], title = ''): Promise<string> {
  const people = [me, ...others.filter((o) => o.key !== me.key)];
  const members = people.map((p) => p.key);
  const learnerClass = people.find((p) => p.role === 'learner')?.classId ?? null;
  const base = {
    members,
    names: Object.fromEntries(people.map((p) => [p.key, p.name])),
    roles: Object.fromEntries(people.map((p) => [p.key, p.role])),
    classId: learnerClass,
    createdBy: me.key,
    at: Date.now(),
    lastAt: Date.now(),
    seen: { [me.key]: Date.now() },
  };
  if (people.length === 2) {
    const id = 'dm_' + [...members].sort().join('_');
    const ref = doc(col, id);
    const s = await getDoc(ref).catch(() => null);
    if (!s?.exists()) await setDoc(ref, { ...base, kind: 'dm' });
    return id;
  }
  const r = await addDoc(col, { ...base, kind: 'group', title: title.trim() || people.map((p) => p.name.split(' ')[0]).join(', ') });
  return r.id;
}
export async function addToGroup(c: Chat, people: Person[]) {
  const patch: DocumentData = { members: arrayUnion(...people.map((p) => p.key)) };
  for (const p of people) (patch[`names.${p.key}`] = p.name), (patch[`roles.${p.key}`] = p.role);
  const lc = people.find((p) => p.role === 'learner')?.classId;
  if (lc && !c.classId) patch.classId = lc;
  await updateDoc(doc(col, c.id), patch);
}
export const leaveGroup = (c: Chat, me: string) => updateDoc(doc(col, c.id), { members: arrayRemove(me) });
export const renameGroup = (c: Chat, title: string) => updateDoc(doc(col, c.id), { title: title.trim() });
export const markRead = (c: Chat, me: string) => (c.seen?.[me] ?? 0) < c.lastAt && updateDoc(doc(col, c.id), { [`seen.${me}`]: Date.now() }).catch(() => {});

// Plain text of rich content, and who is tagged in it.
export function plainOf(n?: JSONContent | null): string {
  if (!n) return '';
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'mention') return '@' + (n.attrs?.label ?? '');
  if (n.type === 'hardBreak') return ' ';
  const inner = (n.content ?? []).map(plainOf).join(n.type === 'doc' ? ' ' : '');
  return inner;
}
export function mentionsOf(n?: JSONContent | null, out: string[] = []): string[] {
  if (!n) return out;
  if (n.type === 'mention' && n.attrs?.id) out.push(String(n.attrs.id));
  (n.content ?? []).forEach((c) => mentionsOf(c, out));
  return out;
}
const INLINE_ONLY = new Set(['paragraph', 'text', 'hardBreak', 'mention', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'ipa', 'stress', 'sym', 'icon']);
export const blocksIn = (n?: JSONContent | null): number => (!n ? 0 : (n.content ?? []).filter((c) => !INLINE_ONLY.has(c.type ?? '')).length);
export const isEmptyContent = (n?: JSONContent | null) => !plainOf(n).trim() && blocksIn(n) === 0 && !JSON.stringify(n ?? {}).includes('"image"');

export async function sendMsg(c: Chat, me: Person, m: Omit<Msg, 'id' | 'by' | 'name' | 'role' | 'at'>) {
  const at = Date.now();
  const clean = JSON.parse(JSON.stringify({ ...m, by: me.key, name: me.name, role: me.role, at }));
  await addDoc(msgsCol(c.id), clean);
  const preview = m.text.trim() || (m.share ? `Shared “${m.share.title}”` : m.blocks ? 'Sent a task element' : 'Sent a picture');
  await updateDoc(doc(col, c.id), { lastAt: at, last: { text: preview.slice(0, 140), name: me.name, by: me.key, mentions: m.mentions ?? [] }, [`seen.${me.key}`]: at });
}
export const editMsg = (c: Chat, id: string, patch: Partial<Msg>) => updateDoc(doc(msgsCol(c.id), id), JSON.parse(JSON.stringify({ ...patch, edited: Date.now() })));
export const deleteMsg = (c: Chat, id: string) => updateDoc(doc(msgsCol(c.id), id), { deleted: true, content: null, text: '', key: {}, share: null, blocks: 0 });
// Quick reactions: a few of the app's own emoji, and any other from the full set.
export const QUICK_REACTS = ['thumbsup', 'love', 'laugh', 'wow', 'think', 'sad'];
// Older reactions were words.
export const WORD_REACTS: Record<string, string> = { thanks: 'Thanks', gotit: 'Got it', great: 'Great', question: 'Question' };
export function react(c: Chat, m: Msg, r: string, me: string) {
  const on = (m.reactions?.[r] ?? []).includes(me);
  return updateDoc(doc(msgsCol(c.id), m.id), { [`reactions.${r}`]: on ? arrayRemove(me) : arrayUnion(me) });
}

export const chatTitle = (c: Chat, me: string) => (c.kind === 'group' ? c.title || 'Group' : c.names[c.members.find((k) => k !== me) ?? ''] ?? 'Chat');

// Who is typing: a time stamp in the live database while someone writes, cleared on send.
export function setTyping(chatId: string, me: string, on: boolean) {
  const r = ref(rtdb, `typing/${chatId}/${me}`);
  if (on) {
    set(r, Date.now()).catch(() => {});
    onDisconnect(r).remove().catch(() => {});
  } else remove(r).catch(() => {});
}
export function useTyping(chatId: string, me: string) {
  const [map, setMap] = useState<Record<string, number>>({});
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onValue(ref(rtdb, `typing/${chatId}`), (s) => setMap((s.val() as Record<string, number>) ?? {}), () => {});
    const t = window.setInterval(() => tick((x) => x + 1), 2000);
    return () => (off(), window.clearInterval(t));
  }, [chatId]);
  return Object.entries(map).filter(([k, at]) => k !== me && Date.now() - at < 7000).map(([k]) => k);
}

// Sounds, made in the browser: a soft two-note chime for a new message, a light tap on send.
let ctx: AudioContext | null = null;
export function chime(kind: 'in' | 'out') {
  if (!soundsOn()) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const notes = kind === 'in' ? [[880, 0], [1318.5, 0.09]] : [[660, 0]];
    for (const [f, d] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(kind === 'in' ? 0.12 : 0.06, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + (kind === 'in' ? 0.45 : 0.12));
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.5);
    }
  } catch {
    /* no sound */
  }
}
export function soundsOn() {
  try {
    return localStorage.getItem('ll.msgSounds') !== 'off';
  } catch {
    return true;
  }
}
export function setSounds(on: boolean) {
  try {
    localStorage.setItem('ll.msgSounds', on ? 'on' : 'off');
  } catch {
    /* fine */
  }
}

// Each teacher chooses whether unread messages come by email, and after how long.
export type MsgPrefs = { email: boolean; after: number }; // minutes
export const AFTER: [number, string][] = [
  [15, '15 minutes'],
  [60, '1 hour'],
  [240, '4 hours'],
  [1440, '1 day'],
  [4320, '3 days'],
];
export function useMsgPrefs(uid?: string) {
  const [p, setP] = useState<MsgPrefs>({ email: false, after: 60 });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (s) => {
      const v = s.data()?.msgPrefs as Partial<MsgPrefs> | undefined;
      setP({ email: !!v?.email, after: v?.after ?? 60 });
    }, () => {});
  }, [uid]);
  return p;
}
export const saveMsgPrefs = (uid: string, p: MsgPrefs) => updateDoc(doc(db, 'users', uid), { msgPrefs: p });

// Answers to a message's questions. The sender gets all of them; anyone else gets their own, and
// everyone's once they have answered, if the sender allowed that.
const answersCol = (chatId: string, msgId: string) => collection(db, 'chats', chatId, 'msgs', msgId, 'answers');
export const saveAnswer = (chatId: string, msgId: string, a: ChatAnswer) => setDoc(doc(answersCol(chatId, msgId), a.by), JSON.parse(JSON.stringify(a)));
export function useAnswers(chatId: string, m: Msg, me: string, on: boolean) {
  const [mine, setMine] = useState<ChatAnswer | null | undefined>(undefined);
  const [all, setAll] = useState<ChatAnswer[] | null>(null);
  const sender = m.by === me;
  useEffect(() => {
    if (!on || sender) return;
    return onSnapshot(doc(answersCol(chatId, m.id), me), (s) => setMine(s.exists() ? (s.data() as ChatAnswer) : null), () => setMine(null));
  }, [chatId, m.id, me, on, sender]);
  const canList = on && (sender || (!!m.shareAnswers && !!mine));
  useEffect(() => {
    if (!canList) return setAll(null);
    return onSnapshot(answersCol(chatId, m.id), (s) => setAll(s.docs.map((d) => d.data() as ChatAnswer).sort((a, b) => a.at - b.at)), () => setAll(null));
  }, [chatId, m.id, canList]);
  return { mine, all };
}

// Enter to send: on unless turned off (kept on this device).
export function enterSendOn() {
  try {
    const v = localStorage.getItem('ll.enterSend');
    // On a phone the Return key makes a new line unless chosen otherwise.
    return v === null ? !window.matchMedia('(max-width: 640px)').matches : v === '1';
  } catch {
    return true;
  }
}
export function saveEnterSend(v: boolean) {
  try {
    localStorage.setItem('ll.enterSend', v ? '1' : '0');
  } catch {
    /* fine */
  }
}
