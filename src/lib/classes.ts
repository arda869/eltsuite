import { collection, doc, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { ThemeKey } from './themes';

export type ClassDoc = {
  id: string;
  teacherId: string;
  name: string;
  level: string;
  themeColor: ThemeKey;
  classCode: string;
  status: 'active' | 'archived' | 'deleted';
  learnerCount?: number;
  createdAt?: Timestamp;
};

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
        createdAt: serverTimestamp(),
      });
      tx.set(codeRef, { classId: classRef.id, teacherId, createdAt: serverTimestamp() });
      return true;
    });
    if (ok) return classRef.id;
  }
  throw new Error('Could not find a free class code. Please try again.');
}
