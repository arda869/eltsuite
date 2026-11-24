import {rehomeActivityPictures} from '../communicative/privatePictures';
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { activityContentRef, keyRef, hasUnresolvedActivities, loadKey, loadNotes, mergeKey, notesRef, splitKey, tasksCol, type Task } from './tasks';
import { exportLesson, type ExportTask, type ImportedTask } from './textformat';

// Reads a lesson with answers and notes, ready for text export.
export async function gatherLesson(classId: string, itemId: string): Promise<{ title: string; tasks: ExportTask[] }> {
  const item = await getDoc(doc(db, 'classes', classId, 'items', itemId));
  const snap = await getDocs(query(tasksCol(classId, itemId), orderBy('order')));
  const tasks: ExportTask[] = [];
  for (const d of snap.docs) {
    const t = { id: d.id, ...(d.data() as Omit<Task, 'id'>) };
    const [key, notes] = await Promise.all([loadKey(classId, itemId, t.id), loadNotes(classId, itemId, t.id).catch(() => '')]);
    const body = t.restricted
      ? (await getDoc(doc(d.ref, 'private', 'body'))).data()?.content
      : t.content;
    if (t.restricted && !body) throw new Error('The saved activity content could not be loaded.');
    const content=mergeKey(body ?? {type:'doc'},key);
    if(hasUnresolvedActivities(content)) throw new Error('The saved activity cards could not be loaded. Reopen the lesson and try again.');
    tasks.push({ id: t.id, family: t.family, variant: t.variant, print: t.print ?? null, ylIcon: t.ylIcon, title: t.title, instructions: t.instructions, instrDoc: t.instrDoc ?? null, hidden: t.hidden, locked: t.locked, layout: t.layout, kind: t.kind, exam: t.exam ?? null, notes, content });
  }
  return { title: (item.data()?.title as string) ?? 'Lesson', tasks };
}

export async function lessonText(classId: string, itemId: string, withNotes: boolean) {
  const { title, tasks } = await gatherLesson(classId, itemId);
  return { title, text: exportLesson(title, tasks, withNotes) };
}

export async function classText(classId: string, className: string, withNotes: boolean) {
  const items = await getDocs(collection(db, 'classes', classId, 'items'));
  const parts: string[] = [];
  for (const it of items.docs.sort((a, b) => (a.data().order ?? 0) - (b.data().order ?? 0))) parts.push((await lessonText(classId, it.id, withNotes)).text);
  return `<!-- ${className} -->\n\n` + parts.join('\n\n');
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.md';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Creates a new lesson (hidden) from imported tasks.
export async function createLessonFromImport(classId: string, topicId: string | null, title: string, tasks: ImportedTask[]) {
  const items = await getDocs(collection(db, 'classes', classId, 'items'));
  const order = items.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), -1) + 1;
  const itemRef = doc(collection(db, 'classes', classId, 'items'));
  const b0 = writeBatch(db);
  b0.set(itemRef, { topicId, type: 'lesson', title: title || 'Imported lesson', order, hidden: true, locked: false, taskCount: visibleTaskCount(tasks), createdAt: serverTimestamp() });
  await b0.commit();
  await appendTasksFromImport(classId, itemRef.id, tasks, 0);
  return itemRef.id;
}

/** Copies a complete version family together. Unassigned companions stay in private bodies until the teacher sets distribution in Classes. */
export async function appendTasksFromImport(classId: string, itemId: string, tasks: ImportedTask[], startOrder: number) {
  tasks=await Promise.all(tasks.map(async task=>({...task,content:await rehomeActivityPictures(task.content,classId)})));
  const refs = tasks.map(() => doc(tasksCol(classId, itemId)));
  const grouped = new Map<string, number[]>();
  tasks.forEach((task, index) => { if (task.family) grouped.set(task.family, [...(grouped.get(task.family) ?? []), index]); });
  let i = startOrder;
  for (const [index, t] of tasks.entries()) {
    const ref = refs[index];
    const family = t.family ? grouped.get(t.family) ?? [] : [];
    const mainIndex = family[0];
    const isVersion = family.length > 1;
    const isOtherVersion = isVersion && mainIndex !== index;
    const { content, key, activities } = splitKey(t.content);
    const b = writeBatch(db);
    b.set(ref, {
      kind: t.kind === 'section' ? 'section' : 'task',
      title: t.title || 'Untitled task',
      instructions: t.instructions ?? '',
      ...(t.instrDoc ? { instrDoc: t.instrDoc } : {}),
      ...(t.print ? { print: t.print } : {}),
      content: isOtherVersion ? null : content,
      order: i++,
      hidden: !!t.hidden,
      locked: !!t.locked,
      ...(isVersion ? { family: refs[mainIndex].id, variant: t.variant || String.fromCharCode(65 + family.indexOf(index)) } : {}),
      ...(isVersion && !isOtherVersion ? { variants: family.slice(1).map(position => refs[position].id), dist: { mode: 'same', sameId: ref.id } } : {}),
      ...(isOtherVersion ? { restricted: true, allowed: [] } : {}),
      ...(t.layout && t.layout !== 'single' ? { layout: t.layout } : {}),
      ...(t.exam ? { exam: t.exam } : {}),
      ...(t.anchor ? { anchor: t.anchor } : {}),
      ...(t.identity ? { identity: t.identity } : {}),
      createdAt: serverTimestamp(),
    });
    b.set(keyRef(classId, itemId, ref.id), key);
    b.set(activityContentRef(classId, itemId, ref.id), { nodes: activities });
    if (isOtherVersion) b.set(doc(ref, 'private', 'body'), { content });
    if (t.notes) b.set(notesRef(classId, itemId, ref.id), { text: t.notes, updatedAt: serverTimestamp() });
    await b.commit();
  }
}

export function visibleTaskCount(tasks: ImportedTask[]) {
  const seen = new Set<string>();
  return tasks.filter(task => {
    if (task.kind === 'section' || task.hidden) return false;
    if (!task.family) return true;
    if (seen.has(task.family)) return false;
    seen.add(task.family);
    return true;
  }).length;
}
