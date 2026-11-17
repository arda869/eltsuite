import {rehomeActivityPictures} from '../communicative/privatePictures';
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
import { hasUnresolvedActivities, splitKey, type AnswerKey, type Responses } from './questions';
import type { Audience, Dist } from './groups';
import { noteFeature } from '../discovery/store';
export * from './questions';

export type Task = {
  spelling?: import('../spelling/model').Spelling;
  id: string;
  kind?: 'task' | 'section'; // sections are headings in the task list
  title: string;
  instructions: string;
  instrDoc?: JSONContent | null; // the instruction as rich text, when it has any formatting
  content: JSONContent | null;
  order: number;
  hidden: boolean;
  locked: boolean;
  afterCheck?: 'reveal' | 'retry'; // show the correct answers, or only right/wrong so learners try again
  layout?: 'single' | 'two' | 'two-wide' | 'media';
  ylIcon?: import('../lessons/young').YoungIconSetting; // young learners: the task's icon ('auto', an icon, or 'none')
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
  lib?: { uid: string; id: string } | null; // linked to a task in the teacher's resources library
  print?: PaperLook | null; // how it looks on the printed worksheet
};
// How a task prints: the length of its gaps, the space for writing, and its own instruction on paper.
// show: on paper and on screen (the default), only on paper (learners don't see it online), or only on screen (not printed).
export type PaperLook = { gap?: 'fit' | 'short' | 'medium' | 'long'; lines?: number | null; instr?: string; show?: 'both' | 'paper' | 'screen'; icon?: import('../lessons/young').YoungAction | 'same' | 'none' };

export const tasksCol = (classId: string, itemId: string) => collection(db, 'classes', classId, 'items', itemId, 'tasks');
export const taskRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId);
export const keyRef = (classId: string, itemId: string, taskId: string) =>
  doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'key');
export const activityContentRef = (classId: string, itemId: string, taskId: string) =>
  doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'activities');

export const newId = () => Math.random().toString(36).slice(2, 10);

// Saving ---------------------------------------------------------------------

export async function addTask(classId: string, itemId: string, order: number, kind: 'task' | 'section' = 'task', init?: { title: string; instructions: string; content: JSONContent }) {
  if(hasUnresolvedActivities(init?.content)) throw new Error('The activity cards could not be loaded. Reopen the original task before copying it.');
  if(init) init={...init,content:await rehomeActivityPictures(init.content,classId)};
  const ref = doc(tasksCol(classId, itemId));
  const batch = writeBatch(db);
  const { content, key, activities } = init ? splitKey(init.content) : { content: { type: 'doc', content: [{ type: 'paragraph' }] } as JSONContent, key: {}, activities: {} };
  batch.set(ref, {
    kind,
    title: init?.title ?? (kind === 'section' ? 'New section' : 'New task'),
    instructions: init?.instructions ?? '',
    content,
    order,
    hidden: false,
    locked: false,
    createdAt: serverTimestamp(),
  });
  batch.set(keyRef(classId, itemId, ref.id), key);
  batch.set(activityContentRef(classId, itemId, ref.id), { nodes: activities });
  await batch.commit();
  return ref.id;
}

export async function saveTask(classId: string, itemId: string, taskId: string, patch: { title?: string; instructions?: string; instrDoc?: JSONContent | null; content?: JSONContent; restricted?: boolean }) {
  if (patch.content && hasUnresolvedActivities(patch.content)) throw new Error('The activity cards are still loading. Wait for them to appear, then save again. Your saved cards have not changed.');
  if(patch.content) patch={...patch,content:await rehomeActivityPictures(patch.content,classId)};
  const batch = writeBatch(db);
  const data: { [k: string]: any } = { updatedAt: serverTimestamp() }; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.instructions !== undefined) data.instructions = patch.instructions;
  if (patch.instrDoc !== undefined) data.instrDoc = patch.instrDoc;
  if (patch.content) {
    const { content, key, activities } = splitKey(patch.content);
    if (patch.restricted) batch.set(doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'body'), { content });
    else data.content = content;
    batch.set(keyRef(classId, itemId, taskId), key);
    batch.set(activityContentRef(classId, itemId, taskId), { nodes: activities });
  }
  batch.update(taskRef(classId, itemId, taskId), data);
  await batch.commit();
  if (patch.content && JSON.stringify(patch.content).includes('"text"')) noteFeature('lessons', classId + ':' + itemId);
}

export const setTaskFlags = (classId: string, itemId: string, taskId: string, patch: Partial<Pick<Task, 'spelling' | 'hidden' | 'locked' | 'order' | 'afterCheck' | 'layout' | 'colScroll' | 'title' | 'showScore' | 'audience' | 'dist' | 'variant' | 'exam' | 'examReleased' | 'print' | 'ylIcon'>>) =>
  updateDoc(taskRef(classId, itemId, taskId), patch);

export async function deleteTask(classId: string, itemId: string, taskId: string) {
  await deleteDoc(activityContentRef(classId, itemId, taskId)).catch(() => {});
  await deleteDoc(keyRef(classId, itemId, taskId)).catch(() => {});
  await deleteDoc(doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'body')).catch(() => {});
  await deleteDoc(taskRef(classId, itemId, taskId));
}

export async function loadKey(classId: string, itemId: string, taskId: string): Promise<AnswerKey> {
  const [s, activities] = await Promise.all([getDoc(keyRef(classId, itemId, taskId)), getDoc(activityContentRef(classId, itemId, taskId)).catch(() => null)]);
  const key = (s.exists() ? s.data() : {}) as AnswerKey;
  // Learners can read the normal key after checking; they cannot read this
  // document. Its contents are added only to the teacher's in-memory editor key.
  for (const [id, node] of Object.entries(activities?.data()?.nodes ?? {})) key[id] = { kind: 'activity', node: node as JSONContent };
  return key;
}

// Learner answers --------------------------------------------------------------

export type Mark = { score: number | null; max?: number; comment: string; crit?: Record<string, number | null> }; // crit: score per rubric criterion
export type Correction = { status: 'open' | 'resubmitted' | 'approved'; before?: string; at: number };
export type AnswerDoc = { ungradedIds?: string[]; learnerUid: string; learnerId: string; itemId: string; taskId: string; responses: Responses; checked: boolean; checkedParts?: string[]; score?: number; total?: number; marks?: Record<string, Mark>; corrections?: Record<string, Correction>; submittedAt?: number; examSubmittedMs?: number; late?: boolean; attempts?: number; updatedAt?: { toMillis: () => number } };

export async function setCorrection(classId: string, taskId: string, learnerUid: string, qid: string, c: Correction) {
  await updateDoc(answerRef(classId, taskId, learnerUid), { [`corrections.${qid}`]: c });
}

// The teacher's mark and comment for a long answer.
export async function saveMark(classId: string, taskId: string, learnerUid: string, qid: string, mark: Mark) {
  const answer = await getDoc(answerRef(classId, taskId, learnerUid));
  const itemId = answer.data()?.itemId;
  if (typeof itemId === 'string') {
    const key = await getDoc(keyRef(classId, itemId, taskId));
    if (key.data()?.[qid]?.ungraded) mark = { score: null, comment: mark.comment };
  }
  await updateDoc(answerRef(classId, taskId, learnerUid), { [`marks.${qid}`]: mark });
  if (mark.score !== null || mark.comment.trim()) noteFeature('assessment', classId + ':' + taskId + ':' + learnerUid);
}

export const answerRef = (classId: string, taskId: string, uid: string) => doc(db, 'classes', classId, 'answers', `${taskId}_${uid}`);

export async function saveResponses(classId: string, base: Omit<AnswerDoc, 'checked' | 'responses'>, responses: Responses, checked = false, score?: { score: number; total: number }, extra: Partial<AnswerDoc> = {}) {
  await setDoc(
    answerRef(classId, base.taskId, base.learnerUid),
    // A time-tracking record may already exist without a checked field. Only the
    // assessment service can mark an answer checked; autosave must not add it.
    { ...base, responses, ...(checked ? { checked } : {}), ...(score ?? {}), ...extra, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// Teacher notes for a task, kept apart from what learners can read.
export const notesRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'notes');
export async function loadNotes(classId: string, itemId: string, taskId: string) {
  const s = await getDoc(notesRef(classId, itemId, taskId));
  return (s.data()?.text as string) ?? '';
}
export async function saveNotes(classId: string, itemId: string, taskId: string, text: string, doc?: JSONContent | null) {
  await setDoc(notesRef(classId, itemId, taskId), { text, ...(doc ? { doc } : { doc: null }), updatedAt: serverTimestamp() });
  if (text.trim()) noteFeature('notes', classId + ':' + itemId + ':' + taskId);
}
// Rich notes: the formatted document plus plain text (used for export and the "has notes" dot).
export async function loadNoteDoc(classId: string, itemId: string, taskId: string): Promise<{ text: string; doc: JSONContent | null }> {
  const s = await getDoc(notesRef(classId, itemId, taskId));
  return { text: (s.data()?.text as string) ?? '', doc: (s.data()?.doc as JSONContent) ?? null };
}

// Version history: a snapshot of the task (with answers) at most every few minutes, last 30 kept.
export type Version = { id: string; title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent; at?: { toMillis: () => number }; by?: string };
const versionsCol = (classId: string, itemId: string, taskId: string) => collection(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'versions');
export async function addVersion(classId: string, itemId: string, taskId: string, v: { title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent; by: string }) {
  await setDoc(doc(versionsCol(classId, itemId, taskId)), { ...v, instrDoc: v.instrDoc ?? null, at: serverTimestamp() });
  const all = await getDocs(query(versionsCol(classId, itemId, taskId), orderBy('at', 'desc')));
  await Promise.all(all.docs.slice(30).map((d) => deleteDoc(d.ref)));
}
export async function listVersions(classId: string, itemId: string, taskId: string): Promise<Version[]> {
  const all = await getDocs(query(versionsCol(classId, itemId, taskId), orderBy('at', 'desc')));
  return all.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Version, 'id'>) }));
}
