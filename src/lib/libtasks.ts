import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
import { addTask, loadKey, saveTask, taskRef } from './tasks';
import { mergeKey } from './questions';

// Tasks kept in the resources library. A task saved there (or added from there to a lesson) stays
// linked: a change in the library reaches every lesson that uses it, and a change in one of those
// lessons reaches the library and the others. Breaking the link makes the lesson's task its own;
// it cannot be linked again.

export type LibTask = {
  id: string;
  title: string;
  instructions: string;
  instrDoc?: JSONContent | null;
  content: JSONContent; // with its answers
  folder: string;
  kinds?: string[];
  uses: string[]; // "classId/itemId/taskId"
  createdAt: number;
  updatedAt: number;
};
export type TaskBody = { title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent };
export type Use = { classId: string; itemId: string; taskId: string };
export const useKey = (u: Use) => `${u.classId}/${u.itemId}/${u.taskId}`;
export const parseUse = (k: string): Use => {
  const [classId, itemId, taskId] = k.split('/');
  return { classId, itemId, taskId };
};

const col = (uid: string) => collection(db, 'users', uid, 'libTasks');
const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export function useLibTasks(uid?: string | null) {
  const [list, setList] = useState<LibTask[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      col(uid),
      (s) =>
        setList(
          s.docs.map((d) => {
            const x = d.data() as Partial<LibTask>;
            return { id: d.id, title: x.title || 'Untitled task', instructions: x.instructions ?? '', instrDoc: x.instrDoc ?? null, content: x.content ?? EMPTY, folder: x.folder ?? '', kinds: x.kinds ?? [], uses: x.uses ?? [], createdAt: x.createdAt ?? 0, updatedAt: x.updatedAt ?? x.createdAt ?? 0 };
          }),
        ),
      () => setList([]),
    );
  }, [uid]);
  return list;
}

const clean = (b: Partial<TaskBody>) => JSON.parse(JSON.stringify(b)) as Partial<TaskBody>;

export async function newLibTask(uid: string, folder = '', body?: TaskBody, uses: string[] = []) {
  const r = await addDoc(col(uid), { ...clean(body ?? { title: 'New task', instructions: '', content: EMPTY }), folder, uses, createdAt: Date.now(), updatedAt: Date.now() });
  return r.id;
}

// A lesson's task, kept in the library and linked to it.
export async function saveToLibrary(uid: string, use: Use, body: TaskBody, folder = '') {
  const id = await newLibTask(uid, folder, body, [useKey(use)]);
  await updateDoc(taskRef(use.classId, use.itemId, use.taskId), { lib: { uid, id } });
  return id;
}

// A lesson task with its answers, for saving to the library.
export async function lessonTaskBody(use: Use): Promise<TaskBody | null> {
  const s = await getDoc(taskRef(use.classId, use.itemId, use.taskId));
  if (!s.exists()) return null;
  const d = s.data();
  let content = (d.content as JSONContent) ?? EMPTY;
  if (d.restricted) {
    const b = await getDoc(doc(db, 'classes', use.classId, 'items', use.itemId, 'tasks', use.taskId, 'private', 'body')).catch(() => null);
    content = (b?.data()?.content as JSONContent) ?? content;
  }
  const key = await loadKey(use.classId, use.itemId, use.taskId).catch(() => ({}));
  return { title: String(d.title ?? 'Task'), instructions: String(d.instructions ?? ''), instrDoc: d.instrDoc ?? null, content: mergeKey(content, key) };
}

// A change in the library, or in one lesson: everywhere else follows. `from` is where it was made.
export async function updateLibTask(uid: string, id: string, patch: Partial<TaskBody>, from?: Use) {
  const ref = doc(col(uid), id);
  await updateDoc(ref, { ...clean(patch), updatedAt: Date.now() });
  const s = await getDoc(ref);
  const uses = ((s.data()?.uses ?? []) as string[]).filter((k) => !from || k !== useKey(from));
  await Promise.all(
    uses.map(async (k) => {
      const u = parseUse(k);
      const t = await getDoc(taskRef(u.classId, u.itemId, u.taskId)).catch(() => null);
      if (!t?.exists()) return void updateDoc(ref, { uses: arrayRemove(k) }).catch(() => {});
      if (t.data().lib?.id !== id) return;
      await saveTask(u.classId, u.itemId, u.taskId, { ...patch, restricted: !!t.data().restricted }).catch(() => {});
    }),
  );
}

// Put a library task into a lesson, linked.
export async function addToLesson(uid: string, lt: LibTask, classId: string, itemId: string, order: number) {
  const taskId = await addTask(classId, itemId, order, 'task', { title: lt.title, instructions: lt.instructions, content: lt.content });
  await updateDoc(taskRef(classId, itemId, taskId), { lib: { uid, id: lt.id }, ...(lt.instrDoc ? { instrDoc: lt.instrDoc } : {}) });
  await updateDoc(doc(col(uid), lt.id), { uses: arrayUnion(useKey({ classId, itemId, taskId })) });
  return taskId;
}

// The lesson's task becomes its own. It cannot be linked again.
export async function breakLink(uid: string, id: string, use: Use) {
  await updateDoc(taskRef(use.classId, use.itemId, use.taskId), { lib: deleteField() });
  await updateDoc(doc(col(uid), id), { uses: arrayRemove(useKey(use)) }).catch(() => {});
}

export async function moveLibTasks(uid: string, ids: string[], folder: string) {
  await Promise.all(ids.map((id) => updateDoc(doc(col(uid), id), { folder, updatedAt: Date.now() })));
}
export const renameLibTask = (uid: string, id: string, title: string) => updateLibTask(uid, id, { title });

// Out of the library: lessons keep their copies, now their own.
export async function removeLibTask(uid: string, lt: LibTask) {
  await Promise.all(lt.uses.map((k) => updateDoc(taskRef(...(Object.values(parseUse(k)) as [string, string, string])), { lib: deleteField() }).catch(() => {})));
  await deleteDoc(doc(col(uid), lt.id));
}

