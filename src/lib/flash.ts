import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
import { newId } from './tasks';

// A flashcard set: the teacher decides what each card holds (word, meaning, example, IPA,
// a picture, a recording, a translation…) and which fields go on the front and back. The cards
// are kept as plain rows, so games can use the same set later.

export type FieldType = 'text' | 'rich' | 'ipa' | 'image' | 'audio';
export type Field = { id: string; name: string; type: FieldType };
export type FlashStyle = 'classic' | 'index' | 'bold' | 'slate' | 'polaroid' | 'minimal' | 'pastel' | 'kraft' | 'night';
export type FlashLook = { style: FlashStyle; font: 'serif' | 'sans' | 'rounded'; size: 's' | 'm' | 'l'; pic: 'top' | 'full' | 'side'; align: 'center' | 'left' };
export type FlashConfig = { fields: Field[]; front: string[]; back: string[]; look: FlashLook };
export type CardValue = string | JSONContent | null;
export type Card = { id: string; order: number; f: Record<string, CardValue> };

export const FIELD_TYPES: { k: FieldType; label: string; about: string }[] = [
  { k: 'text', label: 'Text', about: 'A word, a meaning, a translation' },
  { k: 'rich', label: 'Rich text', about: 'Bold, colour, word stress, IPA and the other pronunciation marks' },
  { k: 'ipa', label: 'Phonemic script', about: 'IPA, with the symbol keyboard' },
  { k: 'image', label: 'Picture', about: 'Uploaded or from a web address' },
  { k: 'audio', label: 'Recording', about: 'Recorded here or uploaded' },
];

export const STYLES: { k: FlashStyle; label: string }[] = [
  { k: 'classic', label: 'Classic' },
  { k: 'index', label: 'Index card' },
  { k: 'bold', label: 'Bold colour' },
  { k: 'slate', label: 'Slate' },
  { k: 'polaroid', label: 'Photo' },
  { k: 'minimal', label: 'Minimal' },
  { k: 'pastel', label: 'Soft gradient' },
  { k: 'kraft', label: 'Kraft paper' },
  { k: 'night', label: 'Night' },
];

export const DEFAULT_CONFIG: FlashConfig = {
  fields: [
    { id: 'word', name: 'Word', type: 'text' },
    { id: 'pic', name: 'Picture', type: 'image' },
    { id: 'ipa', name: 'Pronunciation', type: 'ipa' },
    { id: 'meaning', name: 'Meaning', type: 'text' },
    { id: 'example', name: 'Example', type: 'rich' },
    { id: 'audio', name: 'Recording', type: 'audio' },
  ],
  front: ['word', 'pic'],
  back: ['ipa', 'meaning', 'example', 'audio'],
  look: { style: 'classic', font: 'serif', size: 'm', pic: 'top', align: 'center' },
};
export const configOf = (c?: Partial<FlashConfig> | null): FlashConfig => ({ ...DEFAULT_CONFIG, ...(c ?? {}), look: { ...DEFAULT_CONFIG.look, ...(c?.look ?? {}) } });

const cardsCol = (setId: string) => collection(db, 'sharedDocs', setId, 'cards');

export function useCards(setId?: string) {
  const [cards, setCards] = useState<Card[] | null>(null);
  useEffect(() => {
    if (!setId) return;
    return onSnapshot(
      query(cardsCol(setId), orderBy('order')),
      (s) => setCards(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Card, 'id'>) }))),
      () => setCards([]),
    );
  }, [setId]);
  return cards;
}

export const saveConfig = (setId: string, flash: FlashConfig) => updateDoc(doc(db, 'sharedDocs', setId), { flash });
export async function addCard(setId: string, order: number, f: Record<string, CardValue> = {}) {
  const id = newId();
  await setDoc(doc(cardsCol(setId), id), { order, f });
  return id;
}
export const setCell = (setId: string, cardId: string, field: string, v: CardValue) => updateDoc(doc(cardsCol(setId), cardId), { [`f.${field}`]: v });
export const removeCard = (setId: string, cardId: string) => deleteDoc(doc(cardsCol(setId), cardId));
export async function addRows(setId: string, start: number, rows: Record<string, CardValue>[]) {
  for (let i = 0; i < rows.length; i += 400) {
    const b = writeBatch(db);
    rows.slice(i, i + 400).forEach((f, k) => b.set(doc(cardsCol(setId), newId()), { order: start + i + k, f }));
    await b.commit();
  }
}
export async function reorder(setId: string, ids: string[]) {
  const b = writeBatch(db);
  ids.forEach((id, i) => b.update(doc(cardsCol(setId), id), { order: i }));
  await b.commit();
}

// A picture made small enough to keep with the card.
export async function imageToData(f: Blob, max = 720): Promise<string> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// Plain text of a value, for the table, search and games.
export function plainOf(v: CardValue): string {
  if (!v) return '';
  if (typeof v === 'string') return v.startsWith('data:') ? '' : v;
  const walk = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(walk).join(n.type === 'paragraph' ? '\n' : '') + (n.type === 'ipa' ? `/${n.attrs?.text ?? ''}/` : '') + (n.type === 'stress' ? ((n.attrs?.syllables as string[]) ?? []).join('') : '');
  return walk(v).trim();
}
export const sizeOfCards = (cards: Card[]) => cards.reduce((s, c) => s + JSON.stringify(c.f).length, 0);
