import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
import { isCorrect, type AnswerKey, type QRef, type Responses } from './questions';
import { packAnswerText } from './pack';

// Mistake bank: every question a learner gets wrong in homework or practice goes to their
// personal review deck with the right answer. It leaves the deck after being answered
// correctly on two separate days. The teacher sees each learner's most frequent areas.

export type Mistake = {
  id: string; // `${taskId}_${qid}_${uid}`
  learnerUid: string;
  learnerId: string;
  itemId: string;
  taskId: string;
  qid: string;
  type: string;
  prompt: string; // the question as text
  answer: string; // the right answer as text
  wrong: string; // what the learner wrote
  area?: string; // a tag: the lesson's topic or the task title
  wrongCount: number;
  rightDays: string[]; // days answered correctly in review
  nextAt: number; // when to review next
  done?: boolean;
  at?: unknown;
};

const col = (classId: string) => collection(db, 'classes', classId, 'mistakes');
const day = () => new Date().toISOString().slice(0, 10);

// Text for a question and its key, for the review card.
function textFor(content: JSONContent | null, qid: string, key: AnswerKey, r: Responses[string]) {
  let node: JSONContent | undefined;
  let para: JSONContent | undefined;
  const walk = (n: JSONContent, parent?: JSONContent) => {
    if (n.attrs?.id === qid) {
      node = n;
      para = parent;
    }
    n.content?.forEach((c) => walk(c, n.type === 'paragraph' ? n : parent));
  };
  if (content) walk(content);
  const plain = (n?: JSONContent): string => (n ? (n.text ?? '') + (n.content ?? []).map(plain).join('') + (n.type === 'gap' || n.type === 'dropgap' ? ' ____ ' : '') : '');
  const e = key[qid];
  const a = node?.attrs ?? {};
  let prompt = '';
  let answer = '';
  switch (e?.kind) {
    case 'gap':
    case 'drop':
      prompt = plain(para).trim();
      answer = e.kind === 'gap' ? e.answers[0] ?? '' : e.answer;
      break;
    case 'mcq':
      prompt = (a.prompt as string) || plain(para).replace(/\s+/g, ' ').trim();
      answer = (a.options ?? [])[e.correct] ?? '';
      break;
    case 'multi':
      prompt = (a.prompt as string) || plain(para).replace(/\s+/g, ' ').trim();
      answer = e.correct.map((i) => (a.options ?? [])[i]).join(', ');
      break;
    case 'order':
      prompt = 'Put the words in order: ' + (a.words ?? []).join(' / ');
      answer = e.answer;
      break;
    case 'match':
      prompt = 'Match: ' + (a.left ?? []).join(', ');
      answer = e.map.map((m, i) => `${(a.left ?? [])[i]} → ${(a.right ?? [])[m]}`).join('; ');
      break;
    case 'pack':
      prompt = a.data?.first || a.data?.instruction || a.data?.toks?.join(' ') || a.data?.text?.slice?.(0, 120) || 'Question';
      answer = packAnswerText(e, a.data ?? {});
      break;
  }
  const wrong = Array.isArray(r) ? r.map((i) => (typeof i === 'number' && a.options ? a.options[i] : i)).join(', ') : typeof r === 'number' && a.options ? String(a.options[r] ?? r) : typeof r === 'object' && r ? '' : String(r ?? '');
  return { prompt: prompt.slice(0, 240), answer: answer.slice(0, 240), wrong: wrong.slice(0, 120) };
}

export async function recordMistakes(classId: string, me: { learnerUid: string; learnerId: string }, itemId: string, taskId: string, content: JSONContent | null, qs: QRef[], key: AnswerKey, responses: Responses, area = '') {
  for (const q of qs) {
    const e = key[q.id];
    if (!e || e.kind === 'writing' || q.type === 'reflect') continue;
    if (isCorrect(e, responses[q.id])) continue;
    const id = `${taskId}_${q.id}_${me.learnerUid}`;
    const t = textFor(content, q.id, key, responses[q.id]);
    await setDoc(doc(col(classId), id), { ...me, itemId, taskId, qid: q.id, type: e.kind === 'pack' ? e.t : e.kind, ...t, area, wrongCount: 1, rightDays: [], nextAt: Date.now(), done: false, at: serverTimestamp() }, { merge: true }).catch(() => {});
  }
}

export function useMistakes(classId: string, uid?: string, all = false) {
  const [list, setList] = useState<Mistake[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || (!uid && !all)) return;
    const qy = all ? col(classId) : query(col(classId), where('learnerUid', '==', uid));
    return onSnapshot(qy, (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Mistake, 'id'>) }))), () => {});
  }, [classId, uid, all]);
  return list;
}

// Review: right today → next review in 1 day, then 3 days; two right days and it is done.
export async function reviewMistake(classId: string, m: Mistake, right: boolean) {
  const today = day();
  if (!right) return setDoc(doc(col(classId), m.id), { wrongCount: (m.wrongCount ?? 1) + 1, nextAt: Date.now() + 10 * 60 * 1000 }, { merge: true });
  const days = m.rightDays.includes(today) ? m.rightDays : [...m.rightDays, today];
  const done = days.length >= 2;
  return setDoc(doc(col(classId), m.id), { rightDays: days, done, nextAt: Date.now() + (days.length >= 1 ? 3 : 1) * 24 * 60 * 60 * 1000 }, { merge: true });
}
export const removeMistake = (classId: string, id: string) => deleteDoc(doc(col(classId), id));
