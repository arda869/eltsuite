import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, writeBatch, type DocumentData } from 'firebase/firestore';
import { get, ref, set } from 'firebase/database';
import { db, rtdb } from './firebase';
import { keyRef, notesRef, tasksCol } from './tasks';
import { mediaCol, mediaDoc } from './media';
import { pagesOf } from '../components/LessonBoard';
import type { Item } from './classes';

// A full copy of a lesson as one JSON file: the lesson settings, every task with its answer key
// and teacher notes, the board pages with their drawings, and any pictures or audio clips the
// lesson uses. It can be imported into any class, even in another account.

export type LessonBundle = {
  format: 'lessonlit-lesson';
  version: 1;
  exportedAt: string;
  item: DocumentData;
  tasks: { id: string; data: DocumentData; key: DocumentData; notes?: DocumentData }[];
  boards: Record<string, Record<string, unknown>>;
  media: Record<string, DocumentData>; // pictures and short clips: { data, type, size }; sounds: a manifest and its parts
};
export type ClassBundle = { format: 'lessonlit-class'; version: 1; exportedAt: string; name: string; topics: { id: string; title: string }[]; lessons: LessonBundle[] };

const strip = (d: DocumentData) => {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined && !['createdAt', 'updatedAt', 'teachingAt'].includes(k)) out[k] = v;
  return out;
};

// Finds the media ids a piece of JSON refers to: "media:<id>" strings, audioId fields and board image strokes.
export function mediaIds(value: unknown, into: Set<string>) {
  if (typeof value === 'string') {
    if (value.startsWith('media:')) into.add(value.slice(6));
    return;
  }
  if (Array.isArray(value)) return value.forEach((v) => mediaIds(v, into));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === 'audioId' || k === 'media') && typeof v === 'string' && v) into.add(v);
      else mediaIds(v, into);
    }
  }
}

// Media a task uses, copied into another class (sounds with all their parts). Gives old id → new id.
export async function carryMedia(fromClass: string, toClass: string, values: unknown[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (fromClass === toClass) return map;
  const ids = new Set<string>();
  values.forEach((v) => mediaIds(v, ids));
  for (const id of ids) {
    const m = await getDoc(mediaDoc(fromClass, id)).catch(() => null);
    if (!m?.exists()) continue;
    const d = m.data();
    const r = doc(mediaCol(toClass));
    for (let k = 0; k < (d.kind === 'audio' || d.kind === 'pdf' ? d.parts ?? 0 : 0); k++) {
      const p = await getDoc(mediaDoc(fromClass, `${id}_p${k}`)).catch(() => null);
      if (p?.exists()) await setDoc(mediaDoc(toClass, `${r.id}_p${k}`), p.data());
    }
    await setDoc(r, d);
    map[id] = r.id;
  }
  return map;
}

export function remap(value: unknown, map: Record<string, string>): unknown {
  if (typeof value === 'string') return value.startsWith('media:') && map[value.slice(6)] ? 'media:' + map[value.slice(6)] : value;
  if (Array.isArray(value)) return value.map((v) => remap(v, map));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = (k === 'audioId' || k === 'media') && typeof v === 'string' && map[v] ? map[v] : remap(v, map);
    return out;
  }
  return value;
}

export async function lessonBundle(classId: string, itemId: string): Promise<LessonBundle> {
  const itemSnap = await getDoc(doc(db, 'classes', classId, 'items', itemId));
  if (!itemSnap.exists()) throw new Error('missing');
  const item = strip(itemSnap.data());
  const snap = await getDocs(query(tasksCol(classId, itemId), orderBy('order')));
  const tasks: LessonBundle['tasks'] = [];
  for (const d of snap.docs) {
    const [k, n] = await Promise.all([getDoc(keyRef(classId, itemId, d.id)), getDoc(notesRef(classId, itemId, d.id))]);
    tasks.push({ id: d.id, data: strip(d.data()), key: k.exists() ? k.data() : {}, ...(n.exists() ? { notes: strip(n.data()) } : {}) });
  }
  const boards: LessonBundle['boards'] = {};
  const pages = pagesOf({ id: itemId, ...item } as Item);
  item.boardPages = pages; // explicit, so the board ids can be mapped on import
  for (const p of pages) {
    const s = await get(ref(rtdb, `sessions/${classId}/board/${p.id}/strokes`)).catch(() => null);
    const v = s?.val();
    if (v) boards[p.id] = v;
  }
  const ids = new Set<string>();
  mediaIds(tasks, ids);
  mediaIds(boards, ids);
  const media: LessonBundle['media'] = {};
  for (const id of ids) {
    const m = await getDoc(doc(db, 'classes', classId, 'media', id)).catch(() => null);
    if (!m?.exists()) continue;
    const d = m.data();
    if (d.kind === 'audio' || d.kind === 'link') {
      media[id] = strip(d);
      for (let k = 0; k < (d.parts ?? 0); k++) {
        const p = await getDoc(doc(db, 'classes', classId, 'media', `${id}_p${k}`)).catch(() => null);
        if (p?.exists()) media[`${id}_p${k}`] = p.data();
      }
    } else media[id] = { data: d.data, type: d.type, size: d.size };
  }
  return { format: 'lessonlit-lesson', version: 1, exportedAt: new Date().toISOString(), item, tasks, boards, media };
}

export async function classBundle(classId: string, name: string): Promise<ClassBundle> {
  const [items, topics] = await Promise.all([getDocs(collection(db, 'classes', classId, 'items')), getDocs(collection(db, 'classes', classId, 'topics')).catch(() => null)]);
  const lessons: LessonBundle[] = [];
  for (const it of items.docs.sort((a, b) => (a.data().order ?? 0) - (b.data().order ?? 0))) lessons.push(await lessonBundle(classId, it.id));
  return { format: 'lessonlit-class', version: 1, exportedAt: new Date().toISOString(), name, topics: (topics?.docs ?? []).map((t) => ({ id: t.id, title: t.data().name ?? '' })), lessons };
}

export function parseBundle(text: string): LessonBundle | ClassBundle {
  const j = JSON.parse(text);
  if (j?.format === 'lessonlit-lesson' && Array.isArray(j.tasks)) return j as LessonBundle;
  if (j?.format === 'lessonlit-class' && Array.isArray(j.lessons)) return j as ClassBundle;
  throw new Error('This is not a ELT Suite copy file.');
}

// Imports a lesson bundle into a class as a new hidden lesson. Media and board drawings come with it.
export async function importBundle(classId: string, b: LessonBundle, opts: { topicId?: string | null; title?: string } = {}) {
  const items = await getDocs(collection(db, 'classes', classId, 'items'));
  const order = items.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), -1) + 1;
  // media first, so ids can be rewritten
  const mediaMap: Record<string, string> = {};
  const all = b.media ?? {};
  for (const [id, m] of Object.entries(all)) {
    if (/_p\d+$/.test(id) && all[id.replace(/_p\d+$/, '')]) continue; // a part of a sound, copied with it
    if (m.kind === 'audio' || m.kind === 'link') {
      const r = doc(collection(db, 'classes', classId, 'media'));
      for (let k = 0; k < (m.parts ?? 0); k++) if (all[`${id}_p${k}`]) await setDoc(doc(db, 'classes', classId, 'media', `${r.id}_p${k}`), all[`${id}_p${k}`]);
      await setDoc(r, m);
      mediaMap[id] = r.id;
      continue;
    }
    const r = await addDoc(collection(db, 'classes', classId, 'media'), { ...m, createdAt: serverTimestamp() });
    mediaMap[id] = r.id;
  }
  const itemRef = doc(collection(db, 'classes', classId, 'items'));
  const pages = (b.item.boardPages as { id: string; title?: string }[] | undefined) ?? [];
  const boardMap: Record<string, string> = {};
  const newPages = pages.map((p) => {
    const id = 'p-' + itemRef.id + '-' + Math.random().toString(36).slice(2, 7);
    boardMap[p.id] = id;
    return { ...p, id };
  });
  const taskMap: Record<string, string> = {};
  const taskRefs = b.tasks.map((t) => {
    const r = doc(tasksCol(classId, itemRef.id));
    taskMap[t.id] = r.id;
    return r;
  });
  const b0 = writeBatch(db);
  b0.set(itemRef, {
    ...(remap(b.item, mediaMap) as DocumentData),
    title: opts.title ?? b.item.title ?? 'Imported lesson',
    topicId: opts.topicId ?? null,
    order,
    hidden: true,
    boardPages: newPages.map((p) => (p.title ? { id: p.id, title: p.title } : { id: p.id })),
    createdAt: serverTimestamp(),
  });
  await b0.commit();
  for (let i = 0; i < b.tasks.length; i++) {
    const t = b.tasks[i];
    const data = remap(t.data, mediaMap) as DocumentData;
    // task family links point at the new ids
    if (typeof data.family === 'string' && taskMap[data.family]) data.family = taskMap[data.family];
    if (Array.isArray(data.variants)) data.variants = data.variants.map((v: string) => taskMap[v] ?? v);
    const batch = writeBatch(db);
    batch.set(taskRefs[i], { ...data, createdAt: serverTimestamp() });
    batch.set(keyRef(classId, itemRef.id, taskRefs[i].id), remap(t.key, mediaMap) as DocumentData);
    if (t.notes) batch.set(notesRef(classId, itemRef.id, taskRefs[i].id), { ...t.notes, updatedAt: serverTimestamp() });
    await batch.commit();
  }
  for (const [oldId, strokes] of Object.entries(b.boards ?? {})) {
    const newId = boardMap[oldId];
    if (!newId) continue;
    await set(ref(rtdb, `sessions/${classId}/board/${newId}/strokes`), remap(strokes, mediaMap)).catch(() => {});
  }
  return itemRef.id;
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.lessonlit.json';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
