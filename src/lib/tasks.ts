import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
import { splitKey, type AnswerKey, type Responses } from './questions';
import type { Audience, Dist } from './groups';
export * from './questions';

export type Task = {
  id: string;
  kind?: 'task' | 'section'; // sections are headings in the task list
  title: string;
  instructions: string;
  content: JSONContent | null;
  order: number;
  hidden: boolean;
  locked: boolean;
  afterCheck?: 'reveal' | 'retry'; // show the correct answers, or only right/wrong so learners try again
  layout?: 'single' | 'two' | 'two-wide' | 'media';
  showScore?: boolean; // show learners their score after checking (default on) // column widths when the task has a column break
  colScroll?: 'separate' | 'together';
  // Groups and versions (see lib/groups.ts)
  audience?: Audience;
  family?: string | null; // id of the main task when this task has versions
  variant?: string | null; // version label: A, B, C or Easier, Standard, Challenge
  variants?: string[]; // on the main task: its other versions, in order
  dist?: Dist | null; // on the main task: how versions are given out
  allowed?: string[] | null; // learner ids who may open it (null = everyone)
  restricted?: boolean; // content lives in private/body
  exam?: { minutes: number | null; single?: boolean } | null; // exam mode for this task
  examReleased?: boolean; // the teacher has released the results
};

export const tasksCol = (classId: string, itemId: string) => collection(db, 'classes', classId, 'items', itemId, 'tasks');
export const taskRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId);
export const keyRef = (classId: string, itemId: string, taskId: string) =>
  doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'key');

export const newId = () => Math.random().toString(36).slice(2, 10);

// Saving ---------------------------------------------------------------------

export async function addTask(classId: string, itemId: string, order: number, kind: 'task' | 'section' = 'task') {
  const ref = doc(tasksCol(classId, itemId));
  const batch = writeBatch(db);
  batch.set(ref, {
    kind,
    title: kind === 'section' ? 'New section' : 'New task',
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

export async function saveTask(classId: string, itemId: string, taskId: string, patch: { title?: string; instructions?: string; content?: JSONContent; restricted?: boolean }) {
  const batch = writeBatch(db);
  const data: { [k: string]: any } = { updatedAt: serverTimestamp() }; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.instructions !== undefined) data.instructions = patch.instructions;
  if (patch.content) {
    const { content, key } = splitKey(patch.content);
    if (patch.restricted) batch.set(doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'body'), { content });
    else data.content = content;
    batch.set(keyRef(classId, itemId, taskId), key);
  }
  batch.update(taskRef(classId, itemId, taskId), data);
  await batch.commit();
}

export const setTaskFlags = (classId: string, itemId: string, taskId: string, patch: Partial<Pick<Task, 'hidden' | 'locked' | 'order' | 'afterCheck' | 'layout' | 'colScroll' | 'title' | 'showScore' | 'audience' | 'dist' | 'variant' | 'exam' | 'examReleased'>>) =>
  updateDoc(taskRef(classId, itemId, taskId), patch);

export async function deleteTask(classId: string, itemId: string, taskId: string) {
  await deleteDoc(keyRef(classId, itemId, taskId)).catch(() => {});
  await deleteDoc(doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'body')).catch(() => {});
  await deleteDoc(taskRef(classId, itemId, taskId));
}

export async function loadKey(classId: string, itemId: string, taskId: string): Promise<AnswerKey> {
  const s = await getDoc(keyRef(classId, itemId, taskId));
  return (s.exists() ? s.data() : {}) as AnswerKey;
}

// Learner answers --------------------------------------------------------------

export type Mark = { score: number | null; comment: string; crit?: Record<string, number | null> }; // crit: score per rubric criterion
export type Correction = { status: 'open' | 'resubmitted' | 'approved'; before?: string; at: number };
export type AnswerDoc = { learnerUid: string; learnerId: string; itemId: string; taskId: string; responses: Responses; checked: boolean; score?: number; total?: number; marks?: Record<string, Mark>; corrections?: Record<string, Correction> };

export async function setCorrection(classId: string, taskId: string, learnerUid: string, qid: string, c: Correction) {
  await updateDoc(answerRef(classId, taskId, learnerUid), { [`corrections.${qid}`]: c });
}

// The teacher's mark and comment for a long answer.
export async function saveMark(classId: string, taskId: string, learnerUid: string, qid: string, mark: Mark) {
  await updateDoc(answerRef(classId, taskId, learnerUid), { [`marks.${qid}`]: mark });
}

export const answerRef = (classId: string, taskId: string, uid: string) => doc(db, 'classes', classId, 'answers', `${taskId}_${uid}`);

export async function saveResponses(classId: string, base: Omit<AnswerDoc, 'checked' | 'responses'>, responses: Responses, checked = false, score?: { score: number; total: number }) {
  await setDoc(
    answerRef(classId, base.taskId, base.learnerUid),
    { ...base, responses, checked, ...(score ?? {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// Teacher notes for a task, kept apart from what learners can read.
export const notesRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'notes');
export async function loadNotes(classId: string, itemId: string, taskId: string) {
  const s = await getDoc(notesRef(classId, itemId, taskId));
  return (s.data()?.text as string) ?? '';
}
export async function saveNotes(classId: string, itemId: string, taskId: string, text: string) {
  await setDoc(notesRef(classId, itemId, taskId), { text, updatedAt: serverTimestamp() });
}

// Version history: a snapshot of the task (with answers) at most every few minutes, last 30 kept.
export type Version = { id: string; title: string; instructions: string; content: JSONContent; at?: { toMillis: () => number }; by?: string };
const versionsCol = (classId: string, itemId: string, taskId: string) => collection(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'versions');
export async function addVersion(classId: string, itemId: string, taskId: string, v: { title: string; instructions: string; content: JSONContent; by: string }) {
  await setDoc(doc(versionsCol(classId, itemId, taskId)), { ...v, at: serverTimestamp() });
  const all = await getDocs(query(versionsCol(classId, itemId, taskId), orderBy('at', 'desc')));
  await Promise.all(all.docs.slice(30).map((d) => deleteDoc(d.ref)));
}
export async function listVersions(classId: string, itemId: string, taskId: string): Promise<Version[]> {
  const all = await getDocs(query(versionsCol(classId, itemId, taskId), orderBy('at', 'desc')));
  return all.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Version, 'id'>) }));
}
