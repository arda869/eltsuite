import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { newId } from './tasks';

// Class surveys and live polls. No right answers and no scores.
// Answers go to surveyResponses. An anonymous answer has no name, no learner id and a random
// document id, so it can't be traced back; a separate "done" record only says who has answered.
// When the teacher shares the results, a summary (counts and texts only) goes to surveyResults.

export type SurveyType = 'scale' | 'emoji' | 'thumbs' | 'single' | 'multi' | 'rank' | 'text';
export type SurveyQ = { id: string; type: SurveyType; prompt: string; options?: string[]; max?: number; low?: string; high?: string };
export type SurveyAnswer = number | number[] | string | null;
export type SurveyResponse = { id: string; surveyId: string; itemId?: string; taskId?: string; answers: Record<string, SurveyAnswer>; name?: string; learnerId?: string; uid?: string };

export const TYPE_LABELS: Record<SurveyType, string> = {
  scale: 'Rating scale',
  emoji: 'Faces',
  thumbs: 'Thumbs',
  single: 'One choice',
  multi: 'Several choices',
  rank: 'Ranking',
  text: 'Open answer',
};
export const FACES = ['Very unhappy', 'Unhappy', 'OK', 'Happy', 'Very happy'];
export const THUMBS = ['Thumbs down', 'Not sure', 'Thumbs up'];

export const newQ = (type: SurveyType = 'scale', prompt = ''): SurveyQ => ({
  id: newId(),
  type,
  prompt,
  ...(type === 'scale' ? { max: 5, low: 'Not at all', high: 'Very much' } : {}),
  ...(type === 'single' || type === 'multi' || type === 'rank' ? { options: ['', ''] } : {}),
});

// Ready-made surveys to start from.
export const TEMPLATES: { key: string; label: string; title: string; questions: () => SurveyQ[] }[] = [
  {
    key: 'feedback',
    label: 'End-of-lesson feedback',
    title: 'How was today’s lesson?',
    questions: () => [
      { ...newQ('emoji', 'How do you feel about today’s lesson?') },
      { ...newQ('scale', 'How useful was it for you?'), low: 'Not useful', high: 'Very useful' },
      { ...newQ('text', 'What would you like to practise more?') },
    ],
  },
  {
    key: 'confidence',
    label: 'Confidence check',
    title: 'Confidence check',
    questions: () => [{ ...newQ('scale', 'How confident are you with the present perfect?'), low: 'Not at all', high: 'Very confident' }],
  },
  {
    key: 'needs',
    label: 'Needs analysis for a new class',
    title: 'About you and your English',
    questions: () => [
      { ...newQ('single', 'Why are you learning English?'), options: ['For work', 'For study', 'For travel', 'For an exam', 'For fun'] },
      { ...newQ('multi', 'Which skills do you want to work on?'), options: ['Speaking', 'Listening', 'Reading', 'Writing', 'Grammar', 'Vocabulary', 'Pronunciation'] },
      { ...newQ('scale', 'How often do you use English outside class?'), low: 'Never', high: 'Every day' },
      { ...newQ('text', 'Is there anything else I should know?') },
    ],
  },
  {
    key: 'vote',
    label: 'Topic vote',
    title: 'Which topic next?',
    questions: () => [{ ...newQ('rank', 'Put these topics in order, your favourite first.'), options: ['Travel', 'Food', 'Work', 'Technology'] }],
  },
];

const respCol = (classId: string) => collection(db, 'classes', classId, 'surveyResponses');
const doneRef = (classId: string, surveyId: string, uid: string) => doc(db, 'classes', classId, 'surveyDone', `${surveyId}_${uid}`);

export async function submitSurvey(classId: string, s: { surveyId: string; itemId?: string; taskId?: string; anonymous: boolean; uid: string; learnerId: string; name: string; answers: Record<string, SurveyAnswer> }) {
  const base = { surveyId: s.surveyId, itemId: s.itemId ?? '', taskId: s.taskId ?? '', answers: s.answers };
  if (s.anonymous) await addDoc(respCol(classId), base);
  else await setDoc(doc(respCol(classId), `${s.surveyId}_${s.uid}`), { ...base, uid: s.uid, learnerId: s.learnerId, name: s.name, at: serverTimestamp() });
  await setDoc(doneRef(classId, s.surveyId, s.uid), { surveyId: s.surveyId, uid: s.uid, learnerId: s.learnerId });
}

// Learner: have I answered? (and my named answers, to change them)
export function useMySurvey(classId: string, surveyId: string, uid?: string, anonymous?: boolean) {
  const [done, setDone] = useState<boolean | null>(null);
  const [mine, setMine] = useState<Record<string, SurveyAnswer> | null>(null);
  useEffect(() => {
    if (!classId || !surveyId || !uid) return;
    const u1 = onSnapshot(doneRef(classId, surveyId, uid), (s) => setDone(s.exists()), () => setDone(false));
    if (!anonymous) getDoc(doc(respCol(classId), `${surveyId}_${uid}`)).then((s) => s.exists() && setMine(s.data().answers)).catch(() => {});
    return u1;
  }, [classId, surveyId, uid, anonymous]);
  return { done, mine };
}

// Teacher: every answer to a survey or poll, live.
export function useResponses(classId: string, surveyId?: string) {
  const [list, setList] = useState<SurveyResponse[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !surveyId) return;
    return onSnapshot(query(respCol(classId), where('surveyId', '==', surveyId)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SurveyResponse, 'id'>) }))), () => {});
  }, [classId, surveyId]);
  return list;
}

export type QResult = { counts?: number[]; avgRank?: number[]; texts?: string[]; n: number; mean?: number };
export type Summary = Record<string, QResult>;

export function optionsOf(q: SurveyQ): string[] {
  if (q.type === 'scale') return Array.from({ length: q.max ?? 5 }, (_, i) => String(i + 1));
  if (q.type === 'emoji') return FACES;
  if (q.type === 'thumbs') return THUMBS;
  return (q.options ?? []).filter((o) => o.trim());
}

export function summarise(questions: SurveyQ[], responses: { answers: Record<string, SurveyAnswer> }[]): Summary {
  const out: Summary = {};
  for (const q of questions) {
    const vals = responses.map((r) => r.answers?.[q.id]).filter((v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));
    const opts = optionsOf(q);
    if (q.type === 'text') out[q.id] = { texts: vals.map((v) => String(v).trim()).filter(Boolean), n: vals.length };
    else if (q.type === 'rank') {
      const sums = opts.map(() => 0);
      vals.forEach((v) => (v as number[]).forEach((opt, pos) => (sums[opt] += pos + 1)));
      out[q.id] = { avgRank: sums.map((x) => (vals.length ? x / vals.length : 0)), n: vals.length };
    } else {
      const counts = opts.map(() => 0);
      vals.forEach((v) => (Array.isArray(v) ? v : [v]).forEach((x) => typeof x === 'number' && counts[x] !== undefined && counts[x]++));
      const mean = q.type === 'scale' && vals.length ? vals.reduce<number>((s, v) => s + (v as number) + 1, 0) / vals.length : undefined;
      out[q.id] = { counts, n: vals.length, ...(mean !== undefined ? { mean } : {}) };
    }
  }
  return out;
}

// Shared results: only counts and texts, never names.
export const shareResults = (classId: string, surveyId: string, summary: Summary | null) => setDoc(doc(db, 'classes', classId, 'surveyResults', surveyId), { summary: summary ?? {}, shared: !!summary, at: serverTimestamp() });
export function useSharedResults(classId: string, surveyId?: string) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    setS(null);
    if (!classId || !surveyId) return;
    return onSnapshot(doc(db, 'classes', classId, 'surveyResults', surveyId), (d) => setS(d.exists() && d.data().shared ? (d.data().summary as Summary) : null), () => {});
  }, [classId, surveyId]);
  return s;
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(questions: SurveyQ[], responses: SurveyResponse[], anonymous: boolean) {
  const head = [...(anonymous ? [] : ['Learner']), ...questions.map((q) => q.prompt || TYPE_LABELS[q.type])];
  const rows = responses.map((r) => [
    ...(anonymous ? [] : [r.name ?? '']),
    ...questions.map((q) => {
      const v = r.answers?.[q.id];
      const opts = optionsOf(q);
      if (v === undefined || v === null) return '';
      if (q.type === 'text') return String(v);
      if (q.type === 'rank') return (v as number[]).map((i) => opts[i]).join(' > ');
      if (Array.isArray(v)) return v.map((i) => opts[i]).join('; ');
      return q.type === 'scale' ? String((v as number) + 1) : opts[v as number] ?? '';
    }),
  ]);
  // Anonymous answers are listed in a mixed order so their position says nothing.
  if (anonymous) rows.sort(() => Math.random() - 0.5);
  return [head, ...rows].map((r) => r.map((x) => cell(String(x))).join(',')).join('\n');
}
export function downloadCsv(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
  a.download = name.replace(/[^\w\- ]+/g, '').trim() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
