import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Item } from './classes';
import type { AnswerDoc, Task } from './tasks';
import type { Entry } from './notebook';
import { minutesOf, type Attendance } from './reports';

// After class, one recap per learner: tasks covered with scores, new vocabulary from the class
// notebook, the teacher's comment, homework and attendance. The teacher reviews the drafts, then
// shares them with learners. A parent can be given a private link.

export type RecapTask = { id: string; title: string; done: boolean; score: number | null; total: number | null };
export type RecapVocab = { word: string; meaning?: string; example?: string };
export type RecapHomework = { id: string; title: string; due: number | null };
export type Recap = {
  id: string; // `${itemId}_${uid}`
  classId: string;
  className: string;
  itemId: string;
  lessonTitle: string;
  date: number;
  uid: string;
  learnerId: string;
  name: string;
  teacherName: string;
  tasks: RecapTask[];
  vocab: RecapVocab[];
  homework: RecapHomework[];
  minutes: number | null;
  comment: string;
  status: 'draft' | 'shared';
  sharedAt?: number;
  token?: string | null; // parent link
  updatedAt?: unknown;
};

const col = (classId: string) => collection(db, 'classes', classId, 'recaps');
export const recapId = (itemId: string, uid: string) => `${itemId}_${uid}`;

type Inputs = {
  classId: string;
  className: string;
  item: Item;
  tasks: Task[];
  roster: { id: string; name: string; uid: string }[];
  answers: AnswerDoc[];
  entries: Entry[];
  attendance: Attendance[];
  items: Item[];
  teacherName: string;
};

// Builds a draft for each learner. Existing comments and sharing state are kept.
export function buildRecaps(inp: Inputs, existing: Record<string, Recap>): Recap[] {
  const visibleTasks = inp.tasks.filter((t) => t.kind !== 'section' && !t.hidden && (t as { print?: { show?: string } | null }).print?.show !== 'paper' && !(t.family && t.family !== t.id));
  const vocab: RecapVocab[] = inp.entries
    .filter((e) => e.type === 'vocab' && e.itemId === inp.item.id && e.status === 'published' && !e.hidden && e.data.word)
    .map((e) => ({ word: e.data.word!, ...(e.data.def?.meaning ? { meaning: e.data.def.meaning } : {}), ...(e.data.def?.example ? { example: e.data.def.example } : {}) }));
  const firstSeen = Math.max(0, ...inp.attendance.filter((a) => a.itemId === inp.item.id).map((a) => a.firstAt));
  const date = inp.item.schedule?.at ?? (firstSeen || Date.now());
  // homework set in the same topic and not yet due, or due after this lesson
  const homework: RecapHomework[] = inp.items
    .filter((i) => i.type === 'homework' && !i.hidden && (!i.due || i.due >= date - 86400000) && (i.topicId ?? null) === (inp.item.topicId ?? null))
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
    .slice(0, 5)
    .map((i) => ({ id: i.id, title: i.title, due: i.due ?? null }));
  return inp.roster.map((l) => {
    const prev = existing[recapId(inp.item.id, l.uid)];
    const mine = inp.answers.filter((a) => a.itemId === inp.item.id && a.learnerUid === l.uid);
    const tasks: RecapTask[] = visibleTasks.map((t) => {
      const a = mine.find((x) => x.taskId === t.id);
      const marks = Object.values(a?.marks ?? {});
      const extra = marks.reduce((s, m) => s + (m.score ?? 0), 0);
      const done = !!a && (a.checked || Object.keys(a.responses ?? {}).length > 0);
      return { id: t.id, title: t.title, done, score: a?.checked ? (a.score ?? 0) + extra : null, total: a?.checked ? (a.total ?? 0) + marks.filter((m) => m.score !== null).length * 0 : null };
    });
    const att = inp.attendance.find((a) => a.itemId === inp.item.id && a.uid === l.uid);
    return {
      id: recapId(inp.item.id, l.uid),
      classId: inp.classId,
      className: inp.className,
      itemId: inp.item.id,
      lessonTitle: inp.item.title,
      date,
      uid: l.uid,
      learnerId: l.id,
      name: l.name,
      teacherName: inp.teacherName,
      tasks,
      vocab,
      homework,
      minutes: att ? minutesOf(att) : null,
      comment: prev?.comment ?? '',
      status: prev?.status ?? 'draft',
      ...(prev?.sharedAt ? { sharedAt: prev.sharedAt } : {}),
      token: prev?.token ?? null,
    };
  });
}

export async function saveRecaps(classId: string, recaps: Recap[]) {
  for (let i = 0; i < recaps.length; i += 200) {
    const b = writeBatch(db);
    for (const r of recaps.slice(i, i + 200)) b.set(doc(col(classId), r.id), { ...r, updatedAt: serverTimestamp() });
    await b.commit();
  }
}
export const saveComment = (classId: string, id: string, comment: string) => updateDoc(doc(col(classId), id), { comment, updatedAt: serverTimestamp() });

export async function shareRecap(classId: string, r: Recap, share: boolean) {
  await updateDoc(doc(col(classId), r.id), { status: share ? 'shared' : 'draft', ...(share ? { sharedAt: Date.now() } : {}), updatedAt: serverTimestamp() });
  if (r.token) await publishShare(classId, { ...r, status: share ? 'shared' : 'draft' }); // keep the parent copy in step
}

// A parent link: an unguessable token that opens a read-only copy without signing in.
export async function parentLink(classId: string, r: Recap): Promise<string> {
  let token = r.token;
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    await updateDoc(doc(col(classId), r.id), { token });
  }
  await publishShare(classId, { ...r, token });
  return `${location.origin}/r/${token}`;
}
async function publishShare(classId: string, r: Recap) {
  if (!r.token) return;
  const { token: _t, uid: _u, learnerId: _l, ...pub } = r;
  void _t;
  void _u;
  void _l;
  await setDoc(doc(db, 'recapShares', r.token), { ...pub, classId, open: r.status === 'shared', updatedAt: serverTimestamp() });
}
export async function revokeParentLink(classId: string, r: Recap) {
  if (!r.token) return;
  await setDoc(doc(db, 'recapShares', r.token), { open: false, classId, tasks: [], vocab: [], homework: [], comment: '' }, { merge: false });
  await updateDoc(doc(col(classId), r.id), { token: null });
}
export async function readShared(token: string) {
  const s = await getDoc(doc(db, 'recapShares', token));
  if (!s.exists() || !s.data().open) return null;
  return s.data() as Omit<Recap, 'uid' | 'learnerId' | 'token'> & { open: boolean };
}

export function useRecaps(classId: string, itemId: string, on = true) {
  const [map, setMap] = useState<Record<string, Recap>>({});
  useEffect(() => {
    if (!classId || !itemId || !on) return;
    return onSnapshot(query(col(classId), where('itemId', '==', itemId)), (s) => setMap(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Recap]))), () => {});
  }, [classId, itemId, on]);
  return map;
}
export function useMyRecaps(classId: string, uid?: string) {
  const [list, setList] = useState<Recap[]>([]);
  useEffect(() => {
    if (!classId || !uid) return;
    return onSnapshot(query(col(classId), where('uid', '==', uid), where('status', '==', 'shared')), (s) => setList(s.docs.map((d) => d.data() as Recap).sort((a, b) => b.date - a.date)), () => {});
  }, [classId, uid]);
  return list;
}
export async function loadRecap(classId: string, id: string) {
  const s = await getDoc(doc(col(classId), id));
  return s.exists() ? (s.data() as Recap) : null;
}
export async function rosterWithUids(classId: string) {
  const s = await getDocs(collection(db, 'classes', classId, 'learners'));
  return s.docs.map((d) => ({ id: d.id, name: d.data().displayName as string, uid: d.data().authUid as string })).sort((a, b) => a.name.localeCompare(b.name));
}
