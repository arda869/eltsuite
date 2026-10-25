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
import { splitKey, type AnswerKey, type Responses } from './questions';
export * from './questions';

export type Task = {
  id: string;
  title: string;
  instructions: string;
  content: JSONContent | null;
  order: number;
  hidden: boolean;
  locked: boolean;
  afterCheck?: 'reveal' | 'retry'; // show the correct answers, or only right/wrong so learners try again
  layout?: 'single' | 'two' | 'two-wide'; // column widths when the task has a column break
  colScroll?: 'separate' | 'together';
};

export const tasksCol = (classId: string, itemId: string) => collection(db, 'classes', classId, 'items', itemId, 'tasks');
export const taskRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId);
export const keyRef = (classId: string, itemId: string, taskId: string) =>
  doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'key');

export const newId = () => Math.random().toString(36).slice(2, 10);

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

export const setTaskFlags = (classId: string, itemId: string, taskId: string, patch: Partial<Pick<Task, 'hidden' | 'locked' | 'order' | 'afterCheck' | 'layout' | 'colScroll'>>) =>
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

export type AnswerDoc = { learnerUid: string; learnerId: string; itemId: string; taskId: string; responses: Responses; checked: boolean; score?: number; total?: number };

export const answerRef = (classId: string, taskId: string, uid: string) => doc(db, 'classes', classId, 'answers', `${taskId}_${uid}`);

export async function saveResponses(classId: string, base: Omit<AnswerDoc, 'checked' | 'responses'>, responses: Responses, checked = false, score?: { score: number; total: number }) {
  await setDoc(
    answerRef(classId, base.taskId, base.learnerUid),
    { ...base, responses, checked, ...(score ?? {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
