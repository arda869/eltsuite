import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { keyRef, notesRef, tasksCol } from './tasks';
import { carryMedia, remap } from './fullcopy';
import { newId } from './tasks';

// Shared documents and slides in a copied task: keep working on the same ones, start with a
// copy of what has been written so far, or start empty.
export type CollabCopy = 'same' | 'copy' | 'empty';
type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] };
export const hasCollab = (n: unknown): boolean => {
  const x = n as Node | undefined;
  return !!x && (x.type === 'collab' || (x.content ?? []).some(hasCollab));
};
async function rewriteCollab<T>(content: T, mode: CollabCopy): Promise<T> {
  if (mode === 'same' || !hasCollab(content)) return content;
  const { copyState } = await import('../collab/provider');
  const walk = async (n: Node): Promise<Node> => {
    if (n.type === 'collab' && n.attrs?.docKey) {
      const old = String(n.attrs.docKey);
      const key = newId();
      if (mode === 'copy') await Promise.all([copyState(old, key).catch(() => false), copyState(`${old}~t`, `${key}~t`).catch(() => false)]);
      else await copyState(`${old}~t`, `${key}~t`).catch(() => false); // starting slides come along
      return { ...n, attrs: { ...n.attrs, docKey: key } };
    }
    return n.content ? { ...n, content: await Promise.all(n.content.map(walk)) } : n;
  };
  return (await walk(content as Node)) as T;
}

// Pictures and sounds belong to a class, so a copy into another class takes copies of them.
async function withMedia(fromClass: string, toClass: string, data: DocumentData, key: DocumentData) {
  const map = await carryMedia(fromClass, toClass, [data.content, key]).catch(() => ({}) as Record<string, string>);
  if (!Object.keys(map).length) return { data, key };
  return { data: { ...data, content: remap(data.content, map) }, key: remap(key, map) as DocumentData };
}

// Copies a task (content, answer key and teacher notes) into a lesson, at the end.
export async function copyTask(fromClass: string, fromItem: string, taskId: string, toClass: string, toItem: string, titleSuffix = '', collab: CollabCopy = 'same') {
  const [t, k, n, existing] = await Promise.all([
    getDoc(doc(tasksCol(fromClass, fromItem), taskId)),
    getDoc(keyRef(fromClass, fromItem, taskId)),
    getDoc(notesRef(fromClass, fromItem, taskId)),
    getDocs(tasksCol(toClass, toItem)),
  ]);
  if (!t.exists()) throw new Error('missing');
  const order = existing.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), -1) + 1;
  const ref = doc(tasksCol(toClass, toItem));
  const batch = writeBatch(db);
  const { data: d0, key } = await withMedia(fromClass, toClass, t.data() as DocumentData, k.exists() ? k.data() : {});
  const data: DocumentData = { ...d0, content: await rewriteCollab(d0.content, collab) };
  batch.set(ref, { ...data, title: (data.title ?? '') + titleSuffix, order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(keyRef(toClass, toItem, ref.id), key);
  if (n.exists()) batch.set(notesRef(toClass, toItem, ref.id), n.data());
  await batch.commit();
  return ref.id;
}

// Copies a whole lesson with all its tasks into a class (the same one for "Duplicate").
export async function copyLesson(fromClass: string, itemId: string, toClass: string, opts: { title?: string; topicId?: string | null; type?: 'lesson' | 'homework' | 'exam' | 'practice'; collab?: CollabCopy } = {}) {
  const item = await getDoc(doc(db, 'classes', fromClass, 'items', itemId));
  if (!item.exists()) throw new Error('missing');
  const all = await getDocs(collection(db, 'classes', toClass, 'items'));
  const order = all.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), -1) + 1;
  const data = item.data() as DocumentData;
  const newRef = doc(collection(db, 'classes', toClass, 'items'));
  const tasks = await getDocs(query(tasksCol(fromClass, itemId), orderBy('order')));
  const batch = writeBatch(db);
  batch.set(newRef, {
    ...data,
    title: opts.title ?? data.title,
    ...(opts.type ? { type: opts.type, exam: opts.type === 'exam' ? { minutes: null } : null, examReleased: false, due: null, boardPages: [] } : {}),
    topicId: toClass === fromClass ? (opts.topicId !== undefined ? opts.topicId : data.topicId ?? null) : opts.topicId ?? null,
    order,
    hidden: true, // a copy starts hidden so learners don't see it before it is ready
    taskCount: tasks.docs.filter((t) => t.data().kind !== 'section' && !t.data().hidden && !(t.data().family && t.data().family !== t.id)).length,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  for (const t of tasks.docs) {
    const [k, n] = await Promise.all([getDoc(keyRef(fromClass, itemId, t.id)), getDoc(notesRef(fromClass, itemId, t.id))]);
    const b = writeBatch(db);
    const tr = doc(tasksCol(toClass, newRef.id));
    const { data: d0, key } = await withMedia(fromClass, toClass, t.data(), k.exists() ? k.data() : {});
    const data: DocumentData = { ...d0, content: await rewriteCollab(d0.content, opts.collab ?? "same") };
    b.set(tr, { ...data, createdAt: serverTimestamp() });
    b.set(keyRef(toClass, newRef.id, tr.id), key);
    if (n.exists()) b.set(notesRef(toClass, newRef.id, tr.id), n.data());
    await b.commit();
  }
  return newRef.id;
}
