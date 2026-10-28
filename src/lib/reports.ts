import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Item } from './classes';
import type { AnswerDoc } from './tasks';

// Progress reports: answers across every lesson, homework, exam and practice, plus attendance.

export type Attendance = { id: string; itemId: string; learnerId: string; uid: string; name?: string; day: string; firstAt: number; lastAt: number; minutes: number; corrected?: number | null; note?: string };

export function useClassAnswers(classId: string, on = true) {
  const [list, setList] = useState<AnswerDoc[]>([]);
  useEffect(() => {
    if (!classId || !on) return;
    return onSnapshot(collection(db, 'classes', classId, 'answers'), (s) => setList(s.docs.map((d) => d.data() as AnswerDoc)), () => {});
  }, [classId, on]);
  return list;
}
export function useMyAnswers(classId: string, uid?: string) {
  const [list, setList] = useState<AnswerDoc[]>([]);
  useEffect(() => {
    if (!classId || !uid) return;
    return onSnapshot(query(collection(db, 'classes', classId, 'answers'), where('learnerUid', '==', uid)), (s) => setList(s.docs.map((d) => d.data() as AnswerDoc)), () => {});
  }, [classId, uid]);
  return list;
}
export function useAttendance(classId: string, on = true) {
  const [list, setList] = useState<Attendance[]>([]);
  useEffect(() => {
    if (!classId || !on) return;
    return onSnapshot(collection(db, 'classes', classId, 'attendance'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Attendance, 'id'>) }))), () => {});
  }, [classId, on]);
  return list;
}
export const correctAttendance = (classId: string, a: Attendance, minutes: number | null, note = '') => setDoc(doc(db, 'classes', classId, 'attendance', a.id), { corrected: minutes, note }, { merge: true });
export const addAttendance = (classId: string, itemId: string, learner: { id: string; uid: string; name: string }, minutes: number) =>
  setDoc(doc(db, 'classes', classId, 'attendance', `${itemId}_${learner.uid}`), { itemId, learnerId: learner.id, uid: learner.uid, name: learner.name, day: new Date().toISOString().slice(0, 10), firstAt: Date.now(), lastAt: Date.now(), minutes: 0, corrected: minutes, note: 'added by the teacher' }, { merge: true });

export type Status = 'not-started' | 'in-progress' | 'submitted' | 'marked';
export const STATUS_LABEL: Record<Status, string> = { 'not-started': 'Not started', 'in-progress': 'In progress', submitted: 'Handed in', marked: 'Marked' };

// One learner's result on one item.
export type ItemResult = { status: Status; score: number; total: number; pct: number | null; late: boolean; tasksDone: number; tasksTotal: number; submittedAt?: number };
export function itemResult(item: Item, answers: AnswerDoc[]): ItemResult {
  const mine = answers.filter((a) => a.itemId === item.id);
  const checked = mine.filter((a) => a.checked);
  const score = checked.reduce((s, a) => s + (a.score ?? 0) + Object.values(a.marks ?? {}).reduce((m, x) => m + (x.score ?? 0), 0), 0);
  const total = checked.reduce((s, a) => s + (a.total ?? 0) + Object.keys(a.marks ?? {}).length * 0, 0);
  const tasksTotal = item.taskCount ?? Math.max(mine.length, 1);
  const started = mine.some((a) => a.checked || Object.keys(a.responses ?? {}).length > 0);
  const allIn = checked.length > 0 && checked.length >= tasksTotal;
  const marked = allIn && checked.some((a) => Object.values(a.marks ?? {}).some((m) => m.score !== null));
  const status: Status = !started ? 'not-started' : allIn ? (marked ? 'marked' : 'submitted') : 'in-progress';
  const pct = total > 0 ? Math.round((score / total) * 100) : null;
  return { status, score, total, pct, late: mine.some((a) => a.late), tasksDone: checked.length, tasksTotal, submittedAt: Math.max(0, ...checked.map((a) => a.submittedAt ?? 0)) || undefined };
}

export const minutesOf = (a: Attendance) => (a.corrected ?? a.minutes) || 0;

const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
  a.download = name.replace(/[^\w\- ]+/g, '').trim() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
