import { useEffect, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { newId } from './tasks';

// A teacher's personal question bank: questions (a selection from a task) or whole tasks, with
// tags, level and skill. Content is stored with answers in it, the way the editor holds it.

export type BankItem = {
  id: string;
  kind: 'question' | 'task';
  title: string;
  instructions?: string;
  content: JSONContent[]; // block nodes
  tags: string[];
  level: string; // A1–C2 or ''
  skill: string; // grammar, vocabulary, reading, listening, writing, speaking, pronunciation or ''
  preview: string;
  createdAt?: Timestamp;
};
export const SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking', 'pronunciation'];
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const col = (uid: string) => collection(db, 'users', uid, 'bank');

export const textOf = (nodes: JSONContent[]): string =>
  nodes
    .map((n) => (n.type === 'text' ? n.text ?? '' : n.type === 'gap' ? '____' : n.type === 'choice' ? `(${(n.attrs?.options ?? []).join(' / ')})` : n.content ? textOf(n.content) + (['paragraph', 'heading'].includes(n.type ?? '') ? ' ' : '') : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

export async function saveToBank(uid: string, item: Omit<BankItem, 'id' | 'preview' | 'createdAt'>) {
  const clean = JSON.parse(JSON.stringify(item.content));
  const r = await addDoc(col(uid), { ...item, content: clean, preview: textOf(clean).slice(0, 200), createdAt: serverTimestamp() });
  return r.id;
}
export const updateBankItem = (uid: string, id: string, patch: Partial<Pick<BankItem, 'title' | 'tags' | 'level' | 'skill'>>) => updateDoc(doc(col(uid), id), patch);
export const removeFromBank = (uid: string, id: string) => deleteDoc(doc(col(uid), id));

export function useBank(uid?: string | null, on = true) {
  const [list, setList] = useState<BankItem[]>([]);
  useEffect(() => {
    if (!uid || !on) return;
    return onSnapshot(query(col(uid), orderBy('createdAt', 'desc')), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BankItem, 'id'>) }))), () => {});
  }, [uid, on]);
  return list;
}

// Fresh question ids, so a question inserted twice never clashes.
export function withFreshIds(nodes: JSONContent[]): JSONContent[] {
  const walk = (n: JSONContent): JSONContent => ({ ...n, ...(n.attrs && 'id' in n.attrs ? { attrs: { ...n.attrs, id: newId() } } : {}), ...(n.content ? { content: n.content.map(walk) } : {}) });
  return nodes.map(walk);
}

export const parseTags = (s: string) => [...new Set(s.split(/[,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);

export function matches(b: BankItem, q: string, level: string, skill: string) {
  if (level && b.level !== level) return false;
  if (skill && b.skill !== skill) return false;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [b.title, b.preview, b.instructions ?? '', ...b.tags].join(' ').toLowerCase().includes(s);
}
