import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ThemeKey } from './themes';

export type Meeting = { url: string; meetingId?: string; passcode?: string; visibility: 'live' | 'before15' | 'always' };

export type ClassDoc = {
  id: string;
  teacherId: string;
  name: string;
  level: string;
  themeColor: ThemeKey;
  classCode: string;
  status: 'active' | 'archived' | 'deleted';
  learnerCount?: number;
  meeting?: Meeting | null;
  createdAt?: Timestamp;
  deletedAt?: Timestamp | null;
  codes?: { code: string; meaning: string }[];
};

export type Topic = { id: string; name: string; order: number; hidden?: boolean; locked?: boolean };
export type BoardPage = { id: string; title?: string; from?: string }; // from: the lesson a borrowed page belongs to
export type Item = { id: string; topicId: string | null; type: 'lesson' | 'homework' | 'exam' | 'practice'; title: string; order: number; hidden: boolean; locked: boolean; boardPages?: BoardPage[]; exam?: { minutes: number | null } | null; examReleased?: boolean };

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Mixed'];

// Letters and digits that are hard to confuse when read aloud or typed (no O/0, I/1, etc.).
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

export function makeClassCode(name: string) {
  const fromName = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .filter((c) => LETTERS.includes(c));
  let letters = fromName.slice(0, 3).join('');
  while (letters.length < 3) letters += pick(LETTERS);
  return `${letters}-${pick(DIGITS)}${pick(DIGITS)}${pick(DIGITS)}`;
}

// Creates the class and reserves a unique class code in one transaction.
export async function createClass(teacherId: string, input: { name: string; level: string; themeColor: ThemeKey }) {
  const classRef = doc(collection(db, 'classes'));
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeClassCode(input.name);
    const codeRef = doc(db, 'classCodes', code);
    const ok = await runTransaction(db, async (tx) => {
      const existing = await tx.get(codeRef);
      if (existing.exists()) return false;
      tx.set(classRef, {
        teacherId,
        name: input.name,
        level: input.level,
        themeColor: input.themeColor,
        classCode: code,
        status: 'active',
        learnerCount: 0,
        meeting: null,
        createdAt: serverTimestamp(),
      });
      tx.set(codeRef, { classId: classRef.id, teacherId, className: input.name, roster: [], createdAt: serverTimestamp() });
      return true;
    });
    if (ok) return classRef.id;
  }
  throw new Error('Could not find a free class code. Please try again.');
}

export async function updateClass(c: ClassDoc, patch: Partial<Pick<ClassDoc, 'name' | 'level' | 'themeColor' | 'meeting' | 'status' | 'codes'>>) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'classes', c.id), patch);
  if (patch.name) batch.update(doc(db, 'classCodes', c.classCode), { className: patch.name });
  await batch.commit();
}

// Topics and items ------------------------------------------------------------

export async function addTopic(classId: string, name: string, order: number) {
  const ref = doc(collection(db, 'classes', classId, 'topics'));
  await setDoc(ref, { name, order, createdAt: serverTimestamp() });
  return ref.id;
}

export const renameTopic = (classId: string, topicId: string, name: string) =>
  updateDoc(doc(db, 'classes', classId, 'topics', topicId), { name });

export const deleteTopic = (classId: string, topicId: string) => deleteDoc(doc(db, 'classes', classId, 'topics', topicId));

export async function addItem(classId: string, topicId: string | null, title: string, order: number) {
  const ref = doc(collection(db, 'classes', classId, 'items'));
  await setDoc(ref, { topicId, type: 'lesson', title, order, hidden: false, locked: false, createdAt: serverTimestamp() });
  return ref.id;
}

export const updateItem = (classId: string, itemId: string, patch: Partial<Omit<Item, 'id'>>) =>
  updateDoc(doc(db, 'classes', classId, 'items', itemId), patch);

export const deleteItem = (classId: string, itemId: string) => deleteDoc(doc(db, 'classes', classId, 'items', itemId));

export async function getClass(classId: string) {
  const s = await getDoc(doc(db, 'classes', classId));
  return s.exists() ? ({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) } as ClassDoc) : null;
}


export const updateTopic = (classId: string, topicId: string, patch: Partial<Omit<Topic, 'id'>>) => updateDoc(doc(db, 'classes', classId, 'topics', topicId), patch);
