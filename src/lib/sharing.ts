import { currentOrg } from './admin';
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { keyRef, notesRef, tasksCol } from './tasks';
import { mediaDoc } from './media';
import { mediaIds, remap } from './fullcopy';
import { archiveAdd, archiveGet, type ArchiveItem } from './archive';
import { newId } from './tasks';

// Colleagues and sharing. Teachers connect through an invitation link (never by searching
// names). A teacher shares a lesson, a task, a shared document or a piece of media as a
// read-only copy: with chosen colleagues, or with anyone who has the link. Whoever receives
// it can look at it, and make their own copy to change.

export type Colleague = { id: string; name: string; email?: string; at?: number; org?: string; orgName?: string; title?: string }; // org: colleagues through an organisation, who cannot be removed
export type ShareKind = 'lesson' | 'task' | 'doc' | 'media';
export type Share = {
  id: string;
  owner: string;
  ownerName: string;
  ownerEmail?: string;
  kind: ShareKind;
  title: string;
  about?: string;
  mode: 'link' | 'people';
  people: string[];
  notes?: boolean; // teacher notes included
  src: { classId?: string; itemId?: string; taskId?: string; docKey?: string; docKind?: 'doc' | 'slides'; archiveId?: string };
  item?: DocumentData; // a lesson's settings
  archive?: Partial<ArchiveItem>; // a piece of media
  count?: number;
  at?: number;
  updated?: number;
};

export const shareLink = (id: string) => `${window.location.origin}/s/${id}`;
export const colleagueLink = (token: string) => `${window.location.origin}/colleague/${token}`;
const strip = (d: DocumentData) => Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== undefined && !['createdAt', 'updatedAt', 'teachingAt'].includes(k)));

// Colleagues
export function useColleagues(uid?: string) {
  const [list, setList] = useState<Colleague[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'colleagues'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Colleague, 'id'>) })).sort((a, b) => a.name.localeCompare(b.name))), () => setList([]));
  }, [uid]);
  return list;
}
export async function makeColleagueLink(me: { uid: string; name: string; email: string }) {
  const token = newId() + newId();
  const org = currentOrg();
  await setDoc(doc(db, 'colleagueLinks', token), { from: me.uid, name: me.name, email: me.email, at: Date.now(), ...(org ? { org: org.id, orgOnly: org.outside === 'org' } : {}) });
  return token;
}
export function useMyLinks(uid?: string) {
  const [list, setList] = useState<{ id: string; at: number }[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, 'colleagueLinks'), where('from', '==', uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, at: Number(d.data().at ?? 0) })).sort((a, b) => b.at - a.at)), () => setList([]));
  }, [uid]);
  return list;
}
export const dropLink = (token: string) => deleteDoc(doc(db, 'colleagueLinks', token));
export async function readColleagueLink(token: string) {
  const s = await getDoc(doc(db, 'colleagueLinks', token));
  return s.exists() ? (s.data() as { from: string; name: string; email?: string; at: number }) : null;
}
// The invited teacher accepts: each is added to the other's list.
export async function acceptColleague(token: string, me: { uid: string; name: string; email: string }) {
  const l = await readColleagueLink(token);
  if (!l) throw new Error('gone');
  if (l.from === me.uid) throw new Error('self');
  // An organisation may keep its teachers' colleagues inside it.
  const org = currentOrg();
  const link = l as { org?: string; orgOnly?: boolean };
  if ((org?.outside === 'org' && link.org !== org.id) || (link.orgOnly && link.org !== org?.id)) throw new Error('org');
  await setDoc(doc(db, 'users', l.from, 'colleagues', me.uid), { name: me.name, email: me.email, at: Date.now(), via: token });
  await setDoc(doc(db, 'users', me.uid, 'colleagues', l.from), { name: l.name, email: l.email ?? '', at: Date.now(), via: token });
  return l;
}
export async function removeColleague(me: string, other: string) {
  await Promise.all([deleteDoc(doc(db, 'users', me, 'colleagues', other)).catch(() => {}), deleteDoc(doc(db, 'users', other, 'colleagues', me)).catch(() => {})]);
}

// Copies media docs (sounds with their parts) from one space to another, keeping their ids.
async function copyMediaKeep(from: string, to: string, ids: Iterable<string>) {
  for (const id of ids) {
    const m = await getDoc(mediaDoc(from, id)).catch(() => null);
    if (!m?.exists()) continue;
    const d = m.data();
    for (let k = 0; k < (d.parts ?? 0); k++) {
      const p = await getDoc(mediaDoc(from, `${id}_p${k}`)).catch(() => null);
      if (p?.exists()) await setDoc(mediaDoc(to, `${id}_p${k}`), p.data());
    }
    await setDoc(mediaDoc(to, id), strip(d));
  }
}

// Writes the read-only copy: tasks (with answer keys, and notes if chosen) and their media.
async function fillShare(id: string, s: Omit<Share, 'id'>) {
  const space = 'share:' + id;
  const old = await getDocs(collection(db, 'shares', id, 'tasks')).catch(() => null);
  for (const d of old?.docs ?? []) await deleteDoc(d.ref).catch(() => {});
  let count = 0;
  if ((s.kind === 'lesson' || s.kind === 'task') && s.src.classId && s.src.itemId) {
    const { classId, itemId } = s.src;
    const snap = await getDocs(query(tasksCol(classId, itemId), orderBy('order')));
    const ids = new Set<string>();
    let order = 0;
    for (const t of snap.docs) {
      if (s.kind === 'task' && t.id !== s.src.taskId) continue;
      const [k, n] = await Promise.all([getDoc(keyRef(classId, itemId, t.id)), s.notes ? getDoc(notesRef(classId, itemId, t.id)) : Promise.resolve(null)]);
      const data = strip(t.data());
      mediaIds(data, ids);
      await setDoc(doc(db, 'shares', id, 'tasks', t.id), { data, key: k.exists() ? k.data() : {}, ...(n?.exists() ? { notes: strip(n.data()) } : {}), order: order++ });
      if (data.kind !== 'section') count++;
    }
    await copyMediaKeep(classId, space, ids);
  }
  if (s.kind === 'media' && s.archive?.home) await copyMediaKeep(s.archive.home.classId, space, [s.archive.home.mediaId]);
  return count;
}

// Firestore takes no undefined values.
const clean = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)]));
  return v;
};
export async function createShare(s: Omit<Share, 'id' | 'at' | 'updated' | 'count'>) {
  const r = await addDoc(collection(db, 'shares'), clean({ ...s, at: Date.now(), updated: Date.now(), count: 0 }) as DocumentData);
  const count = await fillShare(r.id, { ...s });
  await updateDoc(r, { count });
  return r.id;
}
export async function refreshShare(sh: Share) {
  const patch: Partial<Share> = { updated: Date.now() };
  if (sh.kind === 'lesson' && sh.src.classId && sh.src.itemId) {
    const it = await getDoc(doc(db, 'classes', sh.src.classId, 'items', sh.src.itemId));
    if (it.exists()) patch.item = strip(it.data());
  }
  patch.count = await fillShare(sh.id, { ...sh, ...patch });
  await updateDoc(doc(db, 'shares', sh.id), clean(patch) as DocumentData);
}
export const setShareAccess = (id: string, mode: Share['mode'], people: string[]) => updateDoc(doc(db, 'shares', id), { mode, people });
export async function stopShare(id: string) {
  for (const sub of ['tasks', 'media']) {
    const s = await getDocs(collection(db, 'shares', id, sub)).catch(() => null);
    for (const d of s?.docs ?? []) await deleteDoc(d.ref).catch(() => {});
  }
  await deleteDoc(doc(db, 'shares', id));
}

export function useMyShares(uid?: string) {
  const [list, setList] = useState<Share[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, 'shares'), where('owner', '==', uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Share, 'id'>) })).sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))), () => setList([]));
  }, [uid]);
  return list;
}
// Shared with me: by name, and through links I have opened.
export function useSharedWithMe(uid?: string) {
  const [direct, setDirect] = useState<Share[] | null>(null);
  const [opened, setOpened] = useState<(Partial<Share> & { id: string })[]>([]);
  useEffect(() => {
    if (!uid) return;
    const a = onSnapshot(query(collection(db, 'shares'), where('people', 'array-contains', uid)), (s) => setDirect(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Share, 'id'>) }))), () => setDirect([]));
    const b = onSnapshot(collection(db, 'users', uid, 'received'), (s) => setOpened(s.docs.map((d) => ({ id: d.id, ...(d.data() as Partial<Share>) }))), () => {});
    return () => (a(), b());
  }, [uid]);
  if (direct === null) return null;
  const seen = new Set(direct.map((d) => d.id));
  return [...direct, ...opened.filter((o) => !seen.has(o.id))].sort((x, y) => (y.updated ?? y.at ?? 0) - (x.updated ?? x.at ?? 0));
}
export const rememberShare = (uid: string, s: Share) => setDoc(doc(db, 'users', uid, 'received', s.id), { owner: s.owner, title: s.title, kind: s.kind, ownerName: s.ownerName, about: s.about ?? '', at: Date.now(), updated: s.updated ?? 0 }).catch(() => {});
export const forgetShare = (uid: string, id: string) => deleteDoc(doc(db, 'users', uid, 'received', id)).catch(() => {});

export async function readShare(id: string): Promise<Share | 'denied' | null> {
  try {
    const s = await getDoc(doc(db, 'shares', id));
    return s.exists() ? ({ id: s.id, ...(s.data() as Omit<Share, 'id'>) } as Share) : null;
  } catch {
    return 'denied';
  }
}
export type SharedTask = { id: string; data: DocumentData; key: DocumentData; notes?: DocumentData; order: number };
export async function shareTasks(id: string): Promise<SharedTask[]> {
  const s = await getDocs(collection(db, 'shares', id, 'tasks'));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedTask, 'id'>) })).sort((a, b) => a.order - b.order);
}

// Making my own copy
async function carry(space: string, toClass: string, values: unknown[]) {
  const ids = new Set<string>();
  values.forEach((v) => mediaIds(v, ids));
  const map: Record<string, string> = {};
  for (const id of ids) {
    const m = await getDoc(mediaDoc(space, id)).catch(() => null);
    if (!m?.exists()) continue;
    const d = m.data();
    const r = doc(collection(db, 'classes', toClass, 'media'));
    for (let k = 0; k < (d.parts ?? 0); k++) {
      const p = await getDoc(mediaDoc(space, `${id}_p${k}`)).catch(() => null);
      if (p?.exists()) await setDoc(doc(db, 'classes', toClass, 'media', `${r.id}_p${k}`), p.data());
    }
    await setDoc(r, { ...d, createdAt: serverTimestamp() });
    map[id] = r.id;
  }
  return map;
}
export async function copyTasksInto(sh: Share, tasks: SharedTask[], toClass: string, toItem: string) {
  const map = await carry('share:' + sh.id, toClass, tasks.map((t) => [t.data, t.key]));
  const existing = await getDocs(tasksCol(toClass, toItem));
  let order = existing.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), -1) + 1;
  let first = '';
  for (const t of tasks) {
    const r = doc(tasksCol(toClass, toItem));
    first ||= r.id;
    const b = writeBatch(db);
    const data = remap(t.data, map) as DocumentData;
    delete data.family;
    delete data.variants;
    b.set(r, { ...data, order: order++, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.set(keyRef(toClass, toItem, r.id), remap(t.key, map) as DocumentData);
    if (t.notes) b.set(notesRef(toClass, toItem, r.id), { ...t.notes, updatedAt: serverTimestamp() });
    await b.commit();
  }
  return first;
}
export async function copyLessonInto(sh: Share, tasks: SharedTask[], toClass: string) {
  const items = await getDocs(collection(db, 'classes', toClass, 'items'));
  const order = items.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), -1) + 1;
  const it = sh.item ?? {};
  const ref = await addDoc(collection(db, 'classes', toClass, 'items'), {
    ...it,
    title: sh.title,
    type: it.type ?? 'lesson',
    topicId: null,
    order,
    hidden: true,
    due: null,
    boardPages: [],
    taskCount: tasks.filter((t) => t.data.kind !== 'section' && !t.data.hidden).length,
    createdAt: serverTimestamp(),
  });
  await copyTasksInto(sh, tasks, toClass, ref.id);
  return ref.id;
}
// A piece of media into my own archive.
export async function copyMediaToArchive(sh: Share, uid: string) {
  const a = sh.archive;
  if (!a) throw new Error('missing');
  if (a.link || !a.home) return archiveAdd(uid, { kind: a.kind ?? 'video', name: a.name ?? sh.title, folder: '', tags: a.tags ?? [], size: 0, link: a.link, script: a.script, duration: a.duration } as Omit<ArchiveItem, 'id' | 'createdAt'>);
  const space = 'user:' + uid;
  const id = newId() + newId();
  const m = await getDoc(mediaDoc('share:' + sh.id, a.home.mediaId));
  if (!m.exists()) throw new Error('missing');
  const d = m.data();
  for (let k = 0; k < (d.parts ?? 0); k++) {
    const p = await getDoc(mediaDoc('share:' + sh.id, `${a.home.mediaId}_p${k}`));
    if (p.exists()) await setDoc(mediaDoc(space, `${id}_p${k}`), p.data());
  }
  await setDoc(mediaDoc(space, id), d);
  return archiveAdd(uid, { kind: a.kind ?? 'image', name: a.name ?? sh.title, folder: '', tags: a.tags ?? [], size: a.size ?? 0, thumb: a.thumb, script: a.script, duration: a.duration, home: { classId: space, mediaId: id }, copies: { [space]: id } } as Omit<ArchiveItem, 'id' | 'createdAt'>);
}
export { archiveGet };
