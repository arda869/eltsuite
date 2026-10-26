import { useEffect, useState } from 'react';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { ClassDoc } from './classes';

// Discussion board: one per class. Threads (a prompt from the teacher, or a learner's own
// thread) with one level of replies. Reactions, @mentions, moderation and private language
// feedback (through the annotation system, keyed "disc:<threadId>").

export type Reactions = Record<string, string[]>; // emoji -> uids
export type Thread = {
  id: string;
  title: string;
  body: string;
  by: string;
  byName: string;
  learnerId?: string;
  teacher: boolean;
  at: number;
  lastAt: number;
  replyCount: number;
  pinned?: boolean;
  locked?: boolean;
  hidden?: boolean;
  approved: boolean;
  link?: { itemId: string; taskId?: string; title: string } | null;
  reactions?: Reactions;
  mentions?: string[];
  reported?: Record<string, number>;
};
export type Post = { id: string; body: string; by: string; byName: string; learnerId?: string; teacher: boolean; at: number; hidden?: boolean; approved: boolean; reactions?: Reactions; mentions?: string[]; reported?: Record<string, number>; edited?: number };
export type DiscussionSettings = { learnersStart: boolean; approval: boolean; muted: string[]; track: boolean };
export const discussionSettings = (c?: ClassDoc | null): DiscussionSettings => ({ learnersStart: true, approval: false, muted: [], track: true, ...(c?.discussion ?? {}) });
export const REACTIONS = ['👍', '❤️', '😂', '💡', '👏'];

const threads = (classId: string) => collection(db, 'classes', classId, 'threads');
const posts = (classId: string, tid: string) => collection(db, 'classes', classId, 'threads', tid, 'posts');

export type Me = { uid: string; name: string; learnerId?: string; teacher: boolean };
export const canPost = (c: ClassDoc | null | undefined, me: Me) => me.teacher || !discussionSettings(c).muted.includes(me.learnerId ?? '');
export const canStart = (c: ClassDoc | null | undefined, me: Me) => me.teacher || (discussionSettings(c).learnersStart && canPost(c, me));

// @Name mentions: names from the roster (first name or full name), plus "teacher".
export function findMentions(text: string, people: { uid: string; name: string }[]): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/@([\p{L}][\p{L}']*)/gu)) {
    const q = m[1].toLowerCase();
    for (const p of people) {
      const full = p.name.toLowerCase();
      if (q === full || q === full.split(' ')[0]) out.add(p.uid);
    }
  }
  return [...out];
}

export async function startThread(classId: string, c: ClassDoc | null | undefined, me: Me, t: { title: string; body: string; link?: Thread['link']; mentions?: string[] }) {
  const s = discussionSettings(c);
  const now = Date.now();
  const r = await addDoc(threads(classId), {
    title: t.title.trim().slice(0, 140),
    body: t.body.trim().slice(0, 4000),
    by: me.uid,
    byName: me.name,
    ...(me.learnerId ? { learnerId: me.learnerId } : {}),
    teacher: me.teacher,
    at: now,
    lastAt: now,
    replyCount: 0,
    pinned: false,
    locked: false,
    hidden: false,
    approved: me.teacher || !s.approval,
    link: t.link ?? null,
    reactions: {},
    mentions: t.mentions ?? [],
    createdAt: serverTimestamp(),
  });
  return r.id;
}
export async function reply(classId: string, c: ClassDoc | null | undefined, me: Me, tid: string, body: string, mentions: string[] = []) {
  const s = discussionSettings(c);
  const approved = me.teacher || !s.approval;
  const now = Date.now();
  await addDoc(posts(classId, tid), { body: body.trim().slice(0, 4000), by: me.uid, byName: me.name, ...(me.learnerId ? { learnerId: me.learnerId } : {}), teacher: me.teacher, at: now, hidden: false, approved, reactions: {}, mentions, createdAt: serverTimestamp() });
  if (approved) await updateDoc(doc(threads(classId), tid), { lastAt: now, replyCount: increment(1) }).catch(() => {});
}
export const editPost = (classId: string, tid: string, pid: string, body: string) => updateDoc(doc(posts(classId, tid), pid), { body: body.trim().slice(0, 4000), edited: Date.now() });
export const editThread = (classId: string, tid: string, patch: Partial<Pick<Thread, 'title' | 'body' | 'pinned' | 'locked' | 'hidden' | 'approved'>>) => updateDoc(doc(threads(classId), tid), patch);
export const deleteThread = (classId: string, tid: string) => deleteDoc(doc(threads(classId), tid));
export const setPost = (classId: string, tid: string, pid: string, patch: Partial<Pick<Post, 'hidden' | 'approved'>>) => updateDoc(doc(posts(classId, tid), pid), patch);
export const deletePost = (classId: string, tid: string, pid: string) => deleteDoc(doc(posts(classId, tid), pid));
export async function approvePost(classId: string, tid: string, pid: string) {
  await updateDoc(doc(posts(classId, tid), pid), { approved: true });
  await updateDoc(doc(threads(classId), tid), { lastAt: Date.now(), replyCount: increment(1) }).catch(() => {});
}

export function react(classId: string, tid: string, pid: string | null, emoji: string, uid: string, on: boolean) {
  const ref = pid ? doc(posts(classId, tid), pid) : doc(threads(classId), tid);
  return updateDoc(ref, { [`reactions.${emoji}`]: on ? arrayUnion(uid) : arrayRemove(uid) });
}
export function report(classId: string, tid: string, pid: string | null, uid: string) {
  const ref = pid ? doc(posts(classId, tid), pid) : doc(threads(classId), tid);
  return updateDoc(ref, { [`reported.${uid}`]: Date.now() });
}
export function clearReports(classId: string, tid: string, pid: string | null) {
  const ref = pid ? doc(posts(classId, tid), pid) : doc(threads(classId), tid);
  return updateDoc(ref, { reported: deleteField() });
}
export const muteLearner = (c: ClassDoc, learnerId: string, mute: boolean) => updateDoc(doc(db, 'classes', c.id), { 'discussion.muted': mute ? arrayUnion(learnerId) : arrayRemove(learnerId) });
export const saveDiscussionSettings = (c: ClassDoc, s: Partial<DiscussionSettings>) => updateDoc(doc(db, 'classes', c.id), Object.fromEntries(Object.entries(s).map(([k, v]) => [`discussion.${k}`, v])));

// Threads: teachers see everything; learners see approved, visible ones plus their own.
export function useThreads(classId: string, me: Me | null) {
  const [list, setList] = useState<Thread[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !me) return;
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Thread, 'id'>) }));
    const sort = (l: Thread[]) => [...l].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.lastAt - a.lastAt);
    if (me.teacher) return onSnapshot(query(threads(classId), orderBy('lastAt', 'desc')), (s) => setList(sort(map(s))), () => {});
    let a: Thread[] = [];
    let b: Thread[] = [];
    const merge = () => setList(sort([...a, ...b.filter((x) => !a.some((y) => y.id === x.id))]));
    const u1 = onSnapshot(query(threads(classId), where('approved', '==', true), where('hidden', '==', false)), (s) => ((a = map(s)), merge()), () => {});
    const u2 = onSnapshot(query(threads(classId), where('by', '==', me.uid)), (s) => ((b = map(s)), merge()), () => {});
    return () => (u1(), u2());
  }, [classId, me?.uid, me?.teacher]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}
export function useThread(classId: string, tid: string) {
  const [t, setT] = useState<Thread | null | undefined>(undefined);
  useEffect(() => {
    if (!classId || !tid) return;
    return onSnapshot(doc(threads(classId), tid), (s) => setT(s.exists() ? ({ id: s.id, ...(s.data() as Omit<Thread, 'id'>) }) : null), () => setT(null));
  }, [classId, tid]);
  return t;
}
export function usePosts(classId: string, tid: string, me: Me | null) {
  const [list, setList] = useState<Post[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !tid || !me) return;
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }));
    const sort = (l: Post[]) => [...l].sort((a, b) => a.at - b.at);
    if (me.teacher) return onSnapshot(query(posts(classId, tid), orderBy('at')), (s) => setList(sort(map(s))), () => {});
    let a: Post[] = [];
    let b: Post[] = [];
    const merge = () => setList(sort([...a, ...b.filter((x) => !a.some((y) => y.id === x.id))]));
    const u1 = onSnapshot(query(posts(classId, tid), where('approved', '==', true), where('hidden', '==', false)), (s) => ((a = map(s)), merge()), () => {});
    const u2 = onSnapshot(query(posts(classId, tid), where('by', '==', me.uid)), (s) => ((b = map(s)), merge()), () => {});
    return () => (u1(), u2());
  }, [classId, tid, me?.uid, me?.teacher]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

// Unread markers, per device.
const seenKey = (classId: string) => `disc-seen-${classId}`;
export function readSeen(classId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(classId)) ?? '{}');
  } catch {
    return {};
  }
}
export function markSeen(classId: string, tid: string) {
  try {
    const cur = readSeen(classId);
    cur[tid] = Date.now();
    localStorage.setItem(seenKey(classId), JSON.stringify(cur));
  } catch {
    /* private window */
  }
}
export const isUnread = (t: Thread, seen: Record<string, number>) => (seen[t.id] ?? 0) < t.lastAt;

// Participation per learner (posts and replies), for reports.
export async function participation(classId: string) {
  const { getDocs } = await import('firebase/firestore');
  const ts = await getDocs(threads(classId));
  const counts: Record<string, { threads: number; replies: number; name: string }> = {};
  const bump = (learnerId: string | undefined, name: string, k: 'threads' | 'replies') => {
    if (!learnerId) return;
    counts[learnerId] = counts[learnerId] ?? { threads: 0, replies: 0, name };
    counts[learnerId][k]++;
  };
  for (const t of ts.docs) {
    const d = t.data() as Thread;
    if (!d.teacher) bump(d.learnerId, d.byName, 'threads');
    const ps = await getDocs(posts(classId, t.id));
    ps.docs.forEach((p) => {
      const pd = p.data() as Post;
      if (!pd.teacher) bump(pd.learnerId, pd.byName, 'replies');
    });
  }
  return counts;
}
