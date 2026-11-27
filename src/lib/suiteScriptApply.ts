import type { JSONContent } from '@tiptap/react';
import { doc, runTransaction, serverTimestamp, writeBatch, type DocumentData } from 'firebase/firestore';
import { rehomeActivityPictures } from '../communicative/privatePictures';
import { bodyRef } from './groups';
import { db } from './firebase';
import { freshIds } from './clip';
import { splitKey } from './questions';
import { activityContentRef, keyRef, notesRef, taskRef, tasksCol } from './tasks';
import { resolveSuiteScriptContent } from './suiteScriptResolve';
import type { SuiteScriptActivityDraft, SuiteScriptBundle, SuiteScriptTaskDraft } from './suiteScriptBundle';

const docOf = (nodes: JSONContent[]): JSONContent => ({ type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] });
const textOf = (nodes: JSONContent[]): string => nodes.map(node => {
  const walk = (item: JSONContent): string => item.type === 'text' ? item.text ?? '' : (item.content ?? []).map(walk).join(item.type === 'paragraph' ? '' : ' ');
  return walk(node);
}).join('\n');

export type PreparedSuiteScriptTask = {
  title: string;
  kind: 'task' | 'section';
  layout?: SuiteScriptTaskDraft['layout'];
  afterCheck?: SuiteScriptTaskDraft['afterCheck'];
  showScore?: boolean;
  hidden?: boolean;
  locked?: boolean;
  colScroll?: SuiteScriptTaskDraft['colScroll'];
  paper?: SuiteScriptTaskDraft['paper'];
  anchor?: string;
  identity?: SuiteScriptTaskDraft['identity'];
  instructions: JSONContent;
  content: JSONContent;
  notes: JSONContent;
  paperInstructions: JSONContent;
};

// The actual destination editor supplies its schema. No structural draft can
// be persisted if its nodes are unsupported there or if any asset fails to
// resolve for the destination's audience.
export async function prepareSuiteScriptBundleForClass(bundle: SuiteScriptBundle, classId: string, validate: (doc: JSONContent) => void): Promise<PreparedSuiteScriptTask[]> {
  const tasks = bundle.kind === 'task' ? [bundle.task] : bundle.activity.tasks;
  if (!classId || tasks.length < 1 || tasks.length > 100) throw new Error('Choose a class and 1–100 tasks.');
  const prepared: PreparedSuiteScriptTask[] = [];
  for (const [index, task] of tasks.entries()) {
    const sections = await Promise.all((['instructions', 'content', 'teacherNotes', 'paperInstructions'] as const).map(async key => {
      const result = await resolveSuiteScriptContent(task[key], { mode: 'class', classId });
      if (result.warnings.length) throw new Error(`Task ${index + 1}, ${key}: ${result.warnings.join(' ')}`);
      const normalized = docOf(result.content.map(freshIds));
      validate(normalized);
      return normalized;
    }));
    prepared.push({ title: task.title, kind: task.kind, layout: task.layout, afterCheck: task.afterCheck, showScore: task.showScore, hidden: task.hidden, locked: task.locked, colScroll: task.colScroll, paper: task.paper, anchor: task.anchor, identity: task.identity, instructions: sections[0], content: sections[1], notes: sections[2], paperInstructions: sections[3] });
  }
  return prepared;
}

export async function projectSuiteScriptClassTask(task: PreparedSuiteScriptTask, classId: string) {
  const content = await rehomeActivityPictures(task.content, classId);
  const split = splitKey(content);
  const paper = task.paperInstructions;
  return {
    publicTask: {
      kind: task.kind,
      title: task.title,
      instructions: textOf(task.instructions.content ?? []),
      instrDoc: task.instructions,
      content: split.content,
      hidden: task.hidden ?? false,
      locked: task.locked ?? false,
      ...(task.layout === undefined ? {} : { layout: task.layout }),
      ...(task.afterCheck === undefined ? {} : { afterCheck: task.afterCheck }),
      ...(task.showScore === undefined ? {} : { showScore: task.showScore }),
      ...(task.colScroll === undefined ? {} : { colScroll: task.colScroll }),
      ...(task.anchor === undefined ? {} : { anchor: task.anchor }),
      ...(task.identity === undefined ? {} : { identity: task.identity }),
      print: { ...task.paper, instr: textOf(paper.content ?? []), instrDoc: paper },
    },
    key: split.key,
    activities: { nodes: split.activities },
    notes: { text: textOf(task.notes.content ?? []), doc: task.notes, updatedAt: serverTimestamp() },
  };
}

// A selected-version edit may change its text and task display settings, but
// the lesson's version routing and identity stay attached to the original row.
export function selectedSuiteScriptTaskPatch(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const patch = { ...incoming };
  for (const key of ['family', 'variant', 'variants', 'audience', 'dist', 'allowed', 'identity']) {
    delete patch[key];
  }
  if (current.identity !== undefined) patch.identity = current.identity;
  return { ...patch, updatedAt: serverTimestamp() };
}

// Explicit structural insertion: one Firestore batch creates every task and
// its separate private key, private activity definitions and teacher notes.
// A cursor inside a smaller rich-text block cannot turn this into field paste.
export async function insertSuiteScriptTasksInClass(classId: string, itemId: string, order: number, tasks: PreparedSuiteScriptTask[]): Promise<string[]> {
  if (!classId || !itemId || !Number.isFinite(order) || tasks.length < 1 || tasks.length > 100) throw new Error('Choose a lesson and 1–100 tasks.');
  const rows = await Promise.all(tasks.map(task => projectSuiteScriptClassTask(task, classId)));
  const batch = writeBatch(db);
  const ids: string[] = [];
  rows.forEach((row, index) => {
    const ref = doc(tasksCol(classId, itemId));
    ids.push(ref.id);
    batch.set(ref, { ...row.publicTask, order: order + index, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(keyRef(classId, itemId, ref.id), row.key);
    batch.set(activityContentRef(classId, itemId, ref.id), row.activities);
    batch.set(notesRef(classId, itemId, ref.id), row.notes);
  });
  await batch.commit();
  return ids;
}

// Whole-activity import creates a real lesson and all its tasks in one batch.
// The additional SuiteScript metadata keeps level/aim/summary/focus/duration
// available for later export without changing the existing class lesson UI.
export async function createSuiteScriptActivityLessonInClass(classId: string, topicId: string | null, order: number, activity: SuiteScriptActivityDraft, tasks: PreparedSuiteScriptTask[]): Promise<{ itemId: string; taskIds: string[] }> {
  if (!classId || !Number.isFinite(order) || tasks.length < 1 || tasks.length > 100 || tasks.length !== activity.tasks.length) throw new Error('Choose a class and prepare every task before creating the lesson.');
  const rows = await Promise.all(tasks.map(task => projectSuiteScriptClassTask(task, classId)));
  const batch = writeBatch(db);
  const item = doc(db, 'classes', classId, 'items', crypto.randomUUID());
  batch.set(item, { topicId, type: 'lesson', title: activity.title, order, hidden: false, locked: false,
    suiteScriptMeta: { level: activity.level ?? '', aim: activity.aim ?? '', minutes: activity.minutes ?? null, summary: activity.summary ?? '', focus: activity.focus ?? '' },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const taskIds: string[] = [];
  rows.forEach((row, index) => {
    const ref = doc(tasksCol(classId, item.id));
    taskIds.push(ref.id);
    batch.set(ref, { ...row.publicTask, order: index, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(keyRef(classId, item.id, ref.id), row.key);
    batch.set(activityContentRef(classId, item.id, ref.id), row.activities);
    batch.set(notesRef(classId, item.id, ref.id), row.notes);
  });
  await batch.commit();
  return { itemId: item.id, taskIds };
}

// Replacing the selected Learner A/B task updates precisely that task ID. It
// retains its family/variant/audience metadata and refuses a stale editor.
export async function replaceSelectedSuiteScriptTask(classId: string, itemId: string, taskId: string, expectedTaskUpdatedAt: number, expectedNotesUpdatedAt: number, prepared: PreparedSuiteScriptTask): Promise<void> {
  if (!classId || !itemId || !taskId || !Number.isFinite(expectedTaskUpdatedAt) || !Number.isFinite(expectedNotesUpdatedAt)) throw new Error('Open the selected task again before applying SuiteScript.');
  const row = await projectSuiteScriptClassTask(prepared, classId);
  const ref = taskRef(classId, itemId, taskId);
  const note = notesRef(classId, itemId, taskId);
  await runTransaction(db, async tx => {
    const [current, currentNotes] = await Promise.all([tx.get(ref), tx.get(note)]);
    if (!current.exists()) throw new Error('The selected task was removed. Keep your draft and reopen the lesson.');
    const stamp = current.get('updatedAt')?.toMillis?.() ?? 0;
    const noteStamp = currentNotes.exists() ? currentNotes.get('updatedAt')?.toMillis?.() ?? 0 : 0;
    if (stamp !== expectedTaskUpdatedAt || noteStamp !== expectedNotesUpdatedAt) throw new Error('This task changed while SuiteScript was open. Keep your draft and reopen the task.');
    const restricted = current.get('restricted') === true;
    tx.update(ref, selectedSuiteScriptTaskPatch(current.data() as Record<string, unknown>, restricted ? { ...row.publicTask, content: null } : row.publicTask) as DocumentData);
    if (restricted) tx.set(bodyRef(classId, itemId, taskId), { content: row.publicTask.content });
    tx.set(keyRef(classId, itemId, taskId), row.key);
    tx.set(activityContentRef(classId, itemId, taskId), row.activities);
    tx.set(note, row.notes);
  });
}

// A whole-activity draft can replace several selected tasks in one version
// scope. The caller must supply the exact destination task IDs; SuiteScript
// itself contains no A/B routing tags. Other siblings are never written.
export async function replaceSelectedSuiteScriptActivityTasks(classId: string, itemId: string, targets: { taskId: string; expectedTaskUpdatedAt: number; expectedNotesUpdatedAt: number; prepared: PreparedSuiteScriptTask }[], activity?: { expectedItemUpdatedAt: number; draft: SuiteScriptActivityDraft }): Promise<void> {
  if (!classId || !itemId || targets.length < 1 || targets.length > 100 || new Set(targets.map(target => target.taskId)).size !== targets.length
    || targets.some(target => !target.taskId || !Number.isFinite(target.expectedTaskUpdatedAt) || !Number.isFinite(target.expectedNotesUpdatedAt))) {
    throw new Error('Choose one existing destination task for each activity task.');
  }
  const rows = await Promise.all(targets.map(target => projectSuiteScriptClassTask(target.prepared, classId)));
  const refs = targets.map(target => ({ task: taskRef(classId, itemId, target.taskId), notes: notesRef(classId, itemId, target.taskId) }));
  const item = doc(db, 'classes', classId, 'items', itemId);
  await runTransaction(db, async tx => {
    const lesson = await tx.get(item);
    const snapshots = await Promise.all(refs.map(async ref => ({ task: await tx.get(ref.task), notes: await tx.get(ref.notes) })));
    if (activity) {
      if (!lesson.exists() || lesson.get('type') !== 'lesson') throw new Error('This lesson is no longer available. Keep your draft and reopen it.');
      const itemAt = lesson.get('updatedAt')?.toMillis?.() ?? 0;
      if (itemAt !== activity.expectedItemUpdatedAt) throw new Error('The lesson details changed while SuiteScript was open. Keep your draft and reopen it.');
    }
    for (const [index, snapshotsForTask] of snapshots.entries()) {
      if (!snapshotsForTask.task.exists()) throw new Error(`Destination task ${index + 1} was removed. Keep your draft and reopen the lesson.`);
      const taskAt = snapshotsForTask.task.get('updatedAt')?.toMillis?.() ?? 0;
      const notesAt = snapshotsForTask.notes.exists() ? snapshotsForTask.notes.get('updatedAt')?.toMillis?.() ?? 0 : 0;
      if (taskAt !== targets[index].expectedTaskUpdatedAt || notesAt !== targets[index].expectedNotesUpdatedAt)
        throw new Error(`Destination task ${index + 1} changed while SuiteScript was open. Keep your draft and reopen it.`);
    }
    refs.forEach((ref, index) => {
      const row = rows[index];
      const restricted = snapshots[index].task.get('restricted') === true;
      tx.update(ref.task, selectedSuiteScriptTaskPatch(snapshots[index].task.data() as Record<string, unknown>, restricted ? { ...row.publicTask, content: null } : row.publicTask) as DocumentData);
      if (restricted) tx.set(bodyRef(classId, itemId, targets[index].taskId), { content: row.publicTask.content });
      tx.set(keyRef(classId, itemId, targets[index].taskId), row.key);
      tx.set(activityContentRef(classId, itemId, targets[index].taskId), row.activities);
      tx.set(ref.notes, row.notes);
    });
    if (activity) tx.update(item, { title: activity.draft.title, suiteScriptMeta: {
      level: activity.draft.level ?? '', aim: activity.draft.aim ?? '', minutes: activity.draft.minutes ?? null,
      summary: activity.draft.summary ?? '', focus: activity.draft.focus ?? '',
    }, updatedAt: serverTimestamp() });
  });
}
