import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { keyRef, loadKey, loadNotes, mergeKey, notesRef, splitKey, tasksCol, type Task } from './tasks';
import { exportLesson, type ExportTask, type ImportedTask } from './textformat';

// Reads a lesson with answers and notes, ready for text export.
export async function gatherLesson(classId: string, itemId: string): Promise<{ title: string; tasks: ExportTask[] }> {
  const item = await getDoc(doc(db, 'classes', classId, 'items', itemId));
  const snap = await getDocs(query(tasksCol(classId, itemId), orderBy('order')));
  const tasks: ExportTask[] = [];
  for (const d of snap.docs) {
    const t = { id: d.id, ...(d.data() as Omit<Task, 'id'>) };
    const [key, notes] = await Promise.all([loadKey(classId, itemId, t.id), loadNotes(classId, itemId, t.id).catch(() => '')]);
    tasks.push({ title: t.title, instructions: t.instructions, hidden: t.hidden, locked: t.locked, layout: t.layout, kind: t.kind, exam: t.exam ?? null, notes, content: mergeKey(t.content ?? { type: 'doc' }, key) });
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
  b0.set(itemRef, { topicId, type: 'lesson', title: title || 'Imported lesson', order, hidden: true, locked: false, taskCount: tasks.filter((t) => t.kind !== 'section' && !t.hidden).length, createdAt: serverTimestamp() });
  await b0.commit();
  let i = 0;
  for (const t of tasks) {
    const ref = doc(tasksCol(classId, itemRef.id));
    const { content, key } = splitKey(t.content);
    const b = writeBatch(db);
    b.set(ref, {
      kind: t.kind === 'section' ? 'section' : 'task',
      title: t.title || 'Untitled task',
      instructions: t.instructions ?? '',
      content,
      order: i++,
      hidden: !!t.hidden,
      locked: !!t.locked,
      ...(t.layout && t.layout !== 'single' ? { layout: t.layout } : {}),
      ...(t.exam ? { exam: t.exam } : {}),
      createdAt: serverTimestamp(),
    });
    b.set(keyRef(classId, itemRef.id, ref.id), key);
    if (t.notes) b.set(notesRef(classId, itemRef.id, ref.id), { text: t.notes, updatedAt: serverTimestamp() });
    await b.commit();
  }
  return itemRef.id;
}
