import type { JSONContent } from '@tiptap/react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { mergeKey, type AnswerKey } from './questions';
import { suiteScriptCopyNodes } from './suiteScriptCopy';
import type { SuiteScriptActivityDraft, SuiteScriptTaskDraft } from './suiteScriptBundle';
import { loadKey, loadNoteDoc, taskRef, type Task } from './tasks';

const para = (text: string): JSONContent[] => text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [];
const body = (doc: JSONContent | null | undefined, fallback = ''): JSONContent[] => doc?.type === 'doc' ? doc.content ?? [] : para(fallback);

// The caller names one exact task/version. Routing fields deliberately stay in
// the destination selection, never in editable SuiteScript text.
export function classTaskToSuiteScriptDraft(task: Task, key: AnswerKey, noteDoc: JSONContent | null, noteText = ''): SuiteScriptTaskDraft {
  if (!task.content) throw new Error('The selected task has no readable content.');
  return {
    title: task.title, kind: task.kind ?? 'task',
    ...(task.layout === undefined ? {} : { layout: task.layout }),
    ...(task.afterCheck === undefined ? {} : { afterCheck: task.afterCheck }),
    ...(task.showScore === undefined ? {} : { showScore: task.showScore }),
    hidden: task.hidden, locked: task.locked,
    ...(task.colScroll === undefined ? {} : { colScroll: task.colScroll }),
    ...(task.print ? { paper: Object.fromEntries((['gap', 'lines', 'show', 'icon'] as const).filter(key => task.print?.[key] !== undefined).map(key => [key, task.print?.[key]])) as SuiteScriptTaskDraft['paper'] } : {}),
    ...(task.anchor ? { anchor: task.anchor } : {}),
    ...(task.identity ? { identity: task.identity } : {}),
    instructions: body(task.instrDoc, task.instructions),
    content: body(mergeKey(task.content, key)),
    teacherNotes: body(noteDoc, noteText),
    paperInstructions: body(task.print?.instrDoc, task.print?.instr),
  };
}

export async function exportSuiteScriptClassTask(classId: string, itemId: string, taskId: string, uid: string): Promise<SuiteScriptTaskDraft> {
  const [snap, key, notes] = await Promise.all([getDoc(taskRef(classId, itemId, taskId)), loadKey(classId, itemId, taskId), loadNoteDoc(classId, itemId, taskId)]);
  if (!snap.exists()) throw new Error('The selected task no longer exists.');
  const task = { id: snap.id, ...snap.data() } as Task;
  const raw = classTaskToSuiteScriptDraft(task, key, notes.doc, notes.text);
  const [instructions, content, teacherNotes, paperInstructions] = await Promise.all(
    [raw.instructions, raw.content, raw.teacherNotes, raw.paperInstructions].map(nodes => suiteScriptCopyNodes(nodes, uid, classId)));
  return { ...raw, instructions, content, teacherNotes, paperInstructions };
}

export async function exportSuiteScriptClassLesson(classId: string, itemId: string, uid: string, selectedTaskIds?: string[]): Promise<SuiteScriptActivityDraft> {
  const [lesson, tasks] = await Promise.all([getDoc(doc(db, 'classes', classId, 'items', itemId)), getDocs(collection(db, 'classes', classId, 'items', itemId, 'tasks'))]);
  if (!lesson.exists() || lesson.get('type') !== 'lesson') throw new Error('Choose a lesson.');
  const all = tasks.docs.map(snap => ({ id: snap.id, ...snap.data() } as Task));
  const chosen = selectedTaskIds ? selectedTaskIds.map(id => all.find(task => task.id === id) ?? (() => { throw new Error(`Task ${id} is no longer in this lesson.`); })()) : all;
  if (!chosen.length) throw new Error('Choose at least one task.');
  const family = new Set<string>();
  for (const task of chosen) {
    const group = task.family || (task.variants?.length ? task.id : '');
    if (group && family.has(group)) throw new Error('Export each learner version separately. Choose one task from each version set.');
    if (group) family.add(group);
  }
  const ordered = [...chosen].sort((a, b) => a.order - b.order);
  const exported = await Promise.all(ordered.map(task => exportSuiteScriptClassTask(classId, itemId, task.id, uid)));
  const meta = lesson.get('suiteScriptMeta') ?? {};
  return { title: lesson.get('title') ?? 'Lesson',
    ...(meta.level ? { level: meta.level } : {}), ...(meta.aim ? { aim: meta.aim } : {}),
    ...(meta.minutes ? { minutes: meta.minutes } : {}), ...(meta.summary ? { summary: meta.summary } : {}),
    ...(meta.focus ? { focus: meta.focus } : {}), tasks: exported };
}
