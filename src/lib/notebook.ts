import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
import type { DefData } from '../editor/Definition';
import type { ClassDoc } from './classes';

// The class notebook: notes and vocabulary the teacher (and, if allowed, learners) add during
// class; grammar and vocabulary bank pages grouped by topic; and each learner's private notebook.
//
// classes/{c}/notebook/{id}            class entries and bank pages (see Entry)
// classes/{c}/notebook/{id}/history/{h} earlier versions, so the teacher can restore one
// classes/{c}/myNotes/{id}             a learner's private entries, saved copies and translations
//
// Everything a learner may change sits in `data`, so the security rules can check exactly
// which fields an edit touches. Who may add and edit is set on the class (ClassDoc.notebook).

export type NotebookLevel = 'view' | 'add' | 'all';
export type NotebookSettings = { level: NotebookLevel; review?: boolean; blocked?: string[] };
export const notebookSettings = (c?: ClassDoc | null): NotebookSettings => ({ level: 'view', review: false, blocked: [], ...(c?.notebook ?? {}) });

export type EntryType = 'note' | 'vocab' | 'page';
export type Bank = 'grammar' | 'vocab';
export type EntryData = {
  word?: string; // vocabulary: the word or phrase
  title?: string; // note or page title
  text?: JSONContent | null; // note or page: rich text
  key?: Record<string, unknown>; // page: answers for its practice questions
  def?: DefData; // vocabulary fields
  tags?: string[];
};
export type Entry = {
  id: string;
  type: EntryType;
  bank?: Bank; // pages only
  topicId?: string | null; // pages: the class topic they belong to
  itemId?: string | null; // the lesson it was added in
  taskId?: string | null;
  data: EntryData;
  status: 'published' | 'pending';
  hidden?: boolean;
  addedBy: string;
  addedByName: string;
  editedBy?: string;
  editedByName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  pending?: { data: EntryData; by: string; byName: string; at: number } | null; // a learner's edit waiting for review
};
export type HistoryEntry = { id: string; data: EntryData; by: string; byName: string; at?: Timestamp };
export type MyNote = { id: string; uid: string; kind: 'entry' | 'translation'; type?: EntryType; data?: EntryData; from?: string; entryId?: string; translation?: string; createdAt?: Timestamp };

type Me = { uid: string; name: string; learnerId?: string; teacher: boolean };

const col = (classId: string) => collection(db, 'classes', classId, 'notebook');
const histCol = (classId: string, id: string) => collection(db, 'classes', classId, 'notebook', id, 'history');
const myCol = (classId: string) => collection(db, 'classes', classId, 'myNotes');

// What a learner may do right now.
export function canLearnerAdd(c: ClassDoc | null | undefined, learnerId?: string) {
  const s = notebookSettings(c);
  return s.level !== 'view' && !!learnerId && !(s.blocked ?? []).includes(learnerId);
}
export function canEdit(c: ClassDoc | null | undefined, me: Me, e: Entry) {
  if (me.teacher) return true;
  if (e.type === 'page' || !canLearnerAdd(c, me.learnerId)) return false;
  return notebookSettings(c).level === 'all' || e.addedBy === me.uid;
}

export const cleanData = (d: EntryData): EntryData => JSON.parse(JSON.stringify(d));

export async function addEntry(classId: string, me: Me, c: ClassDoc | null | undefined, e: { type: EntryType; data: EntryData; itemId?: string | null; taskId?: string | null; bank?: Bank; topicId?: string | null }) {
  const review = !me.teacher && !!notebookSettings(c).review;
  const ref = await addDoc(col(classId), {
    type: e.type,
    ...(e.bank ? { bank: e.bank } : {}),
    ...(e.topicId !== undefined ? { topicId: e.topicId } : {}),
    itemId: e.itemId ?? null,
    taskId: e.taskId ?? null,
    data: cleanData(e.data),
    status: review ? 'pending' : 'published',
    hidden: false,
    addedBy: me.uid,
    addedByName: me.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Saves a change. Learners under review only propose it; the earlier version goes to history.
export async function saveEntry(classId: string, me: Me, c: ClassDoc | null | undefined, e: Entry, data: EntryData) {
  const review = !me.teacher && !!notebookSettings(c).review;
  if (review) {
    await updateDoc(doc(col(classId), e.id), { pending: { data: cleanData(data), by: me.uid, byName: me.name, at: Date.now() } });
    return;
  }
  await addDoc(histCol(classId, e.id), { data: cleanData(e.data), by: e.editedBy ?? e.addedBy, byName: e.editedByName ?? e.addedByName, at: serverTimestamp() });
  await updateDoc(doc(col(classId), e.id), { data: cleanData(data), editedBy: me.uid, editedByName: me.name, updatedAt: serverTimestamp() });
}

// Teacher: approve or reject a pending addition or edit.
export async function approve(classId: string, e: Entry) {
  if (e.status === 'pending') return updateDoc(doc(col(classId), e.id), { status: 'published', updatedAt: serverTimestamp() });
  if (e.pending) {
    await addDoc(histCol(classId, e.id), { data: cleanData(e.data), by: e.editedBy ?? e.addedBy, byName: e.editedByName ?? e.addedByName, at: serverTimestamp() });
    return updateDoc(doc(col(classId), e.id), { data: e.pending.data, editedBy: e.pending.by, editedByName: e.pending.byName, pending: null, updatedAt: serverTimestamp() });
  }
}
export const reject = (classId: string, e: Entry) => (e.status === 'pending' ? deleteDoc(doc(col(classId), e.id)) : updateDoc(doc(col(classId), e.id), { pending: null }));
export const setHidden = (classId: string, id: string, hidden: boolean) => updateDoc(doc(col(classId), id), { hidden });
export const removeEntry = (classId: string, id: string) => deleteDoc(doc(col(classId), id));
export const updateTeacherFields = (classId: string, id: string, patch: Partial<Pick<Entry, 'topicId' | 'bank' | 'itemId'>>) => updateDoc(doc(col(classId), id), patch);

export async function listHistory(classId: string, id: string): Promise<HistoryEntry[]> {
  const s = await getDocs(query(histCol(classId, id), orderBy('at', 'desc')));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HistoryEntry, 'id'>) }));
}
export async function restore(classId: string, me: Me, e: Entry, h: HistoryEntry) {
  await addDoc(histCol(classId, e.id), { data: cleanData(e.data), by: e.editedBy ?? e.addedBy, byName: e.editedByName ?? e.addedByName, at: serverTimestamp() });
  await updateDoc(doc(col(classId), e.id), { data: cleanData(h.data), editedBy: me.uid, editedByName: me.name + ' (restored)', updatedAt: serverTimestamp() });
}

// Live list. The teacher sees everything; learners see published, unhidden entries plus their own.
export function useNotebook(classId: string, me: Me | null) {
  const [list, setList] = useState<Entry[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !me) return;
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Entry, 'id'>) }));
    if (me.teacher) return onSnapshot(query(col(classId), orderBy('createdAt', 'desc')), (s) => setList(map(s)), () => {});
    // Learners need two queries so the security rules can check each one.
    let a: Entry[] = [];
    let b: Entry[] = [];
    const merge = () => setList([...a, ...b.filter((x) => !a.some((y) => y.id === x.id))].sort((x, y) => (y.createdAt?.toMillis?.() ?? 0) - (x.createdAt?.toMillis?.() ?? 0)));
    const u1 = onSnapshot(query(col(classId), where('status', '==', 'published'), where('hidden', '==', false)), (s) => ((a = map(s)), merge()), () => {});
    const u2 = onSnapshot(query(col(classId), where('addedBy', '==', me.uid)), (s) => ((b = map(s)), merge()), () => {});
    return () => (u1(), u2());
  }, [classId, me?.uid, me?.teacher]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

// A learner's private notebook: own entries, copies of class entries, and translations.
export function useMyNotes(classId: string, uid?: string) {
  const [list, setList] = useState<MyNote[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !uid) return;
    return onSnapshot(query(myCol(classId), where('uid', '==', uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MyNote, 'id'>) })).sort((x, y) => (y.createdAt?.toMillis?.() ?? 0) - (x.createdAt?.toMillis?.() ?? 0))), () => {});
  }, [classId, uid]);
  return list;
}
export const addMyNote = (classId: string, uid: string, n: { type: EntryType; data: EntryData; from?: string }) => addDoc(myCol(classId), { uid, kind: 'entry', type: n.type, data: cleanData(n.data), ...(n.from ? { from: n.from } : {}), createdAt: serverTimestamp() });
export const saveMyNote = (classId: string, id: string, data: EntryData) => updateDoc(doc(myCol(classId), id), { data: cleanData(data) });
export const removeMyNote = (classId: string, id: string) => deleteDoc(doc(myCol(classId), id));
// The learner's own translation of a class entry. Always private.
export const saveTranslation = (classId: string, uid: string, entryId: string, translation: string) => setDoc(doc(myCol(classId), `tr_${entryId}_${uid}`), { uid, kind: 'translation', entryId, translation, createdAt: serverTimestamp() });

export const BANK_LABEL: Record<Bank, string> = { grammar: 'Grammar bank', vocab: 'Vocabulary bank' };
export const entryTitle = (e: { type: EntryType; data: EntryData }) => (e.type === 'vocab' ? e.data.word ?? '' : e.data.title ?? (e.type === 'page' ? 'Untitled page' : 'Note'));

// Plain text of a note, for search.
export function plain(j?: JSONContent | null): string {
  if (!j) return '';
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.text) out.push(n.text);
    n.content?.forEach(walk);
    if (n.type === 'paragraph') out.push(' ');
  };
  walk(j);
  return out.join('').trim();
}
export const searchText = (e: { type: EntryType; data: EntryData }) =>
  [entryTitle(e), e.data.def?.meaning, e.data.def?.example, e.data.def?.translation, e.data.def?.synonyms, e.data.def?.collocations, e.data.def?.pos, e.data.def?.cefr, (e.data.tags ?? []).join(' '), plain(e.data.text)].filter(Boolean).join(' ').toLowerCase();
