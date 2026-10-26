import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where, arrayUnion, arrayRemove, type DocumentData } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
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
};

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
// Quick replies to a message, in words.
export const REACTS: [string, string][] = [
  ['thanks', 'Thanks'],
  ['gotit', 'Got it'],
  ['great', 'Great'],
  ['question', 'Question'],
];
export function react(c: Chat, m: Msg, r: string, me: string) {
  const on = (m.reactions?.[r] ?? []).includes(me);
  return updateDoc(doc(msgsCol(c.id), m.id), { [`reactions.${r}`]: on ? arrayRemove(me) : arrayUnion(me) });
}

export const chatTitle = (c: Chat, me: string) => (c.kind === 'group' ? c.title || 'Group' : c.names[c.members.find((k) => k !== me) ?? ''] ?? 'Chat');
