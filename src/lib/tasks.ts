import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';

export type Task = {
  id: string;
  title: string;
  instructions: string;
  content: JSONContent | null;
  order: number;
  hidden: boolean;
  locked: boolean;
  afterCheck?: 'reveal' | 'retry'; // show the correct answers, or only right/wrong so learners try again
};

export type KeyEntry = { kind: 'gap'; answers: string[] } | { kind: 'mcq'; correct: number };
export type AnswerKey = Record<string, KeyEntry>;

export const tasksCol = (classId: string, itemId: string) => collection(db, 'classes', classId, 'items', itemId, 'tasks');
export const taskRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId);
export const keyRef = (classId: string, itemId: string, taskId: string) =>
  doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'key');

export const newId = () => Math.random().toString(36).slice(2, 10);

// The answer key is stored separately so learners cannot read it before they check.
export function splitKey(content: JSONContent): { content: JSONContent; key: AnswerKey } {
  const key: AnswerKey = {};
  const walk = (n: JSONContent): JSONContent => {
    const out: JSONContent = { ...n };
    if (n.type === 'gap' && n.attrs?.id) {
      key[n.attrs.id] = { kind: 'gap', answers: (n.attrs.answers ?? []).filter((a: string) => a.trim()) };
      out.attrs = { ...n.attrs, answers: [] };
    }
    if ((n.type === 'mcq' || n.type === 'choice') && n.attrs?.id) {
      key[n.attrs.id] = { kind: 'mcq', correct: n.attrs.correct ?? -1 };
      out.attrs = { ...n.attrs, correct: -1 };
    }
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  return { content: walk(content), key };
}

export function mergeKey(content: JSONContent, key: AnswerKey): JSONContent {
  const walk = (n: JSONContent): JSONContent => {
    const out: JSONContent = { ...n };
    const k = n.attrs?.id ? key[n.attrs.id] : undefined;
    if (n.type === 'gap' && k?.kind === 'gap') out.attrs = { ...n.attrs, answers: k.answers };
    if ((n.type === 'mcq' || n.type === 'choice') && k?.kind === 'mcq') out.attrs = { ...n.attrs, correct: k.correct };
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  return walk(content);
}

// Question ids in reading order.
export function questionIds(content: JSONContent | null): { id: string; kind: 'gap' | 'mcq' }[] {
  const ids: { id: string; kind: 'gap' | 'mcq' }[] = [];
  const walk = (n: JSONContent) => {
    if ((n.type === 'gap' || n.type === 'mcq' || n.type === 'choice') && n.attrs?.id) ids.push({ id: n.attrs.id, kind: n.type === 'gap' ? 'gap' : 'mcq' });
    n.content?.forEach(walk);
  };
  if (content) walk(content);
  return ids;
}

// Answer checking: ignore case, extra spaces, curly vs straight quotes and apostrophes, trailing punctuation.
export function normalise(s: string) {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′`´ʼ]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
}

export function isCorrect(entry: KeyEntry | undefined, response: string | number | undefined) {
  if (!entry || response === undefined || response === '') return false;
  if (entry.kind === 'mcq') return Number(response) === entry.correct;
  const r = normalise(String(response));
  return entry.answers.some((a) => normalise(a) === r);
}

// Saving ---------------------------------------------------------------------

export async function addTask(classId: string, itemId: string, order: number) {
  const ref = doc(tasksCol(classId, itemId));
  const batch = writeBatch(db);
  batch.set(ref, {
    title: 'New task',
    instructions: '',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    order,
    hidden: false,
    locked: false,
    createdAt: serverTimestamp(),
  });
  batch.set(keyRef(classId, itemId, ref.id), {});
  await batch.commit();
  return ref.id;
}

export async function saveTask(classId: string, itemId: string, taskId: string, patch: { title?: string; instructions?: string; content?: JSONContent }) {
  const batch = writeBatch(db);
  const data: { [k: string]: any } = { updatedAt: serverTimestamp() }; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.instructions !== undefined) data.instructions = patch.instructions;
  if (patch.content) {
    const { content, key } = splitKey(patch.content);
    data.content = content;
    batch.set(keyRef(classId, itemId, taskId), key);
  }
  batch.update(taskRef(classId, itemId, taskId), data);
  await batch.commit();
}

export const setTaskFlags = (classId: string, itemId: string, taskId: string, patch: Partial<Pick<Task, 'hidden' | 'locked' | 'order' | 'afterCheck'>>) =>
  updateDoc(taskRef(classId, itemId, taskId), patch);

export async function deleteTask(classId: string, itemId: string, taskId: string) {
  await deleteDoc(keyRef(classId, itemId, taskId)).catch(() => {});
  await deleteDoc(taskRef(classId, itemId, taskId));
}

export async function loadKey(classId: string, itemId: string, taskId: string): Promise<AnswerKey> {
  const s = await getDoc(keyRef(classId, itemId, taskId));
  return (s.exists() ? s.data() : {}) as AnswerKey;
}

// Learner answers --------------------------------------------------------------

export type Responses = Record<string, string | number>;
export type AnswerDoc = { learnerUid: string; learnerId: string; itemId: string; taskId: string; responses: Responses; checked: boolean; score?: number; total?: number };

export const answerRef = (classId: string, taskId: string, uid: string) => doc(db, 'classes', classId, 'answers', `${taskId}_${uid}`);

export async function saveResponses(classId: string, base: Omit<AnswerDoc, 'checked' | 'responses'>, responses: Responses, checked = false, score?: { score: number; total: number }) {
  await setDoc(
    answerRef(classId, base.taskId, base.learnerUid),
    { ...base, responses, checked, ...(score ?? {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
