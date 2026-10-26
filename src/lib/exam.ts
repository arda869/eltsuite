import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Item } from './classes';
import type { Task } from './tasks';

// Exams: a whole lesson of type "exam", or one task in exam mode. Learners press Start, a timer
// runs, there is no Check answers, and answers lock when they submit or time runs out. The
// teacher releases the results.

export type ExamSettings = { minutes: number | null; single?: boolean };
export type ExamRun = { scope: string; uid: string; learnerId: string; name?: string; startedAt?: Timestamp; startMs: number; submittedMs?: number | null };
export type ExamScope = { id: string; kind: 'item' | 'task'; minutes: number | null; released: boolean; title: string };

// The exam a task belongs to, if any.
export function examScope(item: Item | null | undefined, task: Task | undefined): ExamScope | null {
  if (item?.type === 'exam') return { id: 'i_' + item.id, kind: 'item', minutes: item.exam?.minutes ?? null, released: !!item.examReleased, title: item.title };
  if (task?.exam) return { id: 't_' + task.id, kind: 'task', minutes: task.exam.minutes ?? null, released: !!task.examReleased, title: task.title };
  return null;
}

const runRef = (classId: string, scope: string, uid: string) => doc(db, 'classes', classId, 'examRuns', `${scope}_${uid}`);
export const startExam = (classId: string, scope: string, uid: string, learnerId: string, name: string) =>
  setDoc(runRef(classId, scope, uid), { scope, uid, learnerId, name, startMs: Date.now(), startedAt: serverTimestamp(), submittedMs: null });
export const submitExam = (classId: string, scope: string, uid: string) => updateDoc(runRef(classId, scope, uid), { submittedMs: Date.now() });
export const resetExam = (classId: string, scope: string, uid: string) => deleteDoc(runRef(classId, scope, uid));

export function useMyRun(classId: string, scope: string | undefined, uid: string | undefined) {
  const [run, setRun] = useState<ExamRun | null | undefined>(undefined);
  useEffect(() => {
    setRun(undefined);
    if (!classId || !scope || !uid) return;
    return onSnapshot(runRef(classId, scope, uid), (s) => setRun(s.exists() ? (s.data() as ExamRun) : null), () => setRun(null));
  }, [classId, scope, uid]);
  return run;
}
export function useRuns(classId: string, scope: string | undefined) {
  const [list, setList] = useState<ExamRun[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !scope) return;
    return onSnapshot(query(collection(db, 'classes', classId, 'examRuns'), where('scope', '==', scope)), (s) => setList(s.docs.map((d) => d.data() as ExamRun)), () => {});
  }, [classId, scope]);
  return list;
}

// Milliseconds left, or null for no time limit.
export function timeLeft(run: ExamRun | null | undefined, minutes: number | null, now = Date.now()) {
  if (!run || !minutes) return null;
  return Math.max(0, run.startMs + minutes * 60000 - now);
}
export const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s % 60).padStart(2, '0');
};
