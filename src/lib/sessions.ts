import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { updateItem } from './classes';

// Timetable: the classes, meetings and one-to-ones a teacher has, with their times. A class
// session uses the class's own video room, so its link is there from the start; a meeting gets
// a room the moment someone starts it. Weekly sessions are kept once, with how many weeks.

export type SessionKind = 'class' | 'meeting';
export type Session = {
  id: string;
  owner: string;
  ownerName: string;
  kind: SessionKind;
  title: string;
  classId?: string | null;
  itemId?: string | null; // the lesson to teach
  start: number; // the first time, ms
  mins: number;
  weeks?: number; // weekly, this many times in all (1 = once)
  online: boolean;
  place?: string; // in person: where
  attendees?: string[]; // meeting: colleagues' uids
  names?: Record<string, string>;
  notes?: string;
  skip?: number[]; // weeks (0-based) taken out of a weekly session
  live?: { url: string; room: string; at: number; by: string; byName: string } | null;
  at?: number;
};
export type Occurrence = { s: Session; start: number; end: number; week: number };

const col = collection(db, 'sessions');
const WEEK = 7 * 864e5;

export async function addSession(s: Omit<Session, 'id'>) {
  const ref = await addDoc(col, JSON.parse(JSON.stringify({ ...s, at: Date.now() })));
  // The lesson shows its time on the class page and the learners' home too.
  if (s.classId && s.itemId) await updateItem(s.classId, s.itemId, { schedule: { at: s.start } }).catch(() => {});
  return ref.id;
}
export async function saveSession(s: Session) {
  const { id, ...rest } = s;
  await updateDoc(doc(col, id), JSON.parse(JSON.stringify(rest)));
  if (s.classId && s.itemId) await updateItem(s.classId, s.itemId, { schedule: { at: s.start } }).catch(() => {});
}
export const removeSession = (s: Session) => deleteDoc(doc(col, s.id));
export const skipWeek = (s: Session, week: number) => updateDoc(doc(col, s.id), { skip: [...new Set([...(s.skip ?? []), week])] });
export const setSessionLive = (s: Session, live: Session['live']) => updateDoc(doc(col, s.id), { live });

// Every time a session happens between two moments.
export function occurrences(list: Session[], from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const s of list) {
    const n = Math.max(1, s.weeks ?? 1);
    for (let w = 0; w < n; w++) {
      const start = s.start + w * WEEK;
      if (start > to) break;
      const end = start + s.mins * 60000;
      if (end < from || s.skip?.includes(w)) continue;
      out.push({ s, start, end, week: w });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
// On now, or starting within the next minutes: the time to start or join.
export const isNow = (o: Occurrence, early = 10) => Date.now() >= o.start - early * 60000 && Date.now() <= o.end;

// A teacher's sessions: their own, their classes', and meetings they were invited to.
export function useTeacherSessions(uid?: string, classIds: string[] = []) {
  const [parts, setParts] = useState<Record<string, Session[]>>({});
  const key = classIds.slice().sort().join(',');
  useEffect(() => {
    if (!uid) return;
    const offs: Unsubscribe[] = [];
    const on = (name: string, q: ReturnType<typeof query>) =>
      offs.push(onSnapshot(q, (s) => setParts((p) => ({ ...p, [name]: s.docs.map((d) => ({ ...(d.data() as Omit<Session, 'id'>), id: d.id })) })), () => setParts((p) => ({ ...p, [name]: [] }))));
    on('own', query(col, where('owner', '==', uid)));
    on('invited', query(col, where('attendees', 'array-contains', uid)));
    const ids = key ? key.split(',') : [];
    // One listener per class, so the security rules can check each class.
    for (const id of ids) on('c:' + id, query(col, where('classId', '==', id)));
    return () => offs.forEach((o) => o());
  }, [uid, key]);
  return useMemo(() => {
    const m = new Map<string, Session>();
    Object.values(parts).flat().forEach((s) => m.set(s.id, s));
    return [...m.values()];
  }, [parts]);
}
// A learner's: their class's sessions.
export function useClassSessions(classId?: string) {
  const [list, setList] = useState<Session[]>([]);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(
      query(col, where('classId', '==', classId)),
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as Omit<Session, 'id'>), id: d.id }))),
      () => setList([]),
    );
  }, [classId]);
  return list;
}

export const dayKey = (t: number) => new Date(t).toDateString();
export const timeText = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export function whenText(t: number) {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const day = d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${timeText(t)}`;
}
