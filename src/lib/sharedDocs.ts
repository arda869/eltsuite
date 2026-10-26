import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { get } from 'firebase/database';
import { collabRef } from '../collab/provider';
import { newId } from './tasks';
import { openChat, sendMsg, type Chat, type Person } from './chat';
import type { CollabMode } from '../collab/suggest';

// Collaborative documents a teacher keeps in their files: documents and slides they write with
// colleagues or learners, shared person by person (and in chat), or added to a class.

export type DocRole = 'edit' | 'suggest' | 'comment' | 'view';
export const ROLES: { k: DocRole; label: string; about: string }[] = [
  { k: 'edit', label: 'Can edit', about: 'Write and change anything' },
  { k: 'suggest', label: 'Can suggest', about: 'Changes show as suggestions you accept or reject' },
  { k: 'comment', label: 'Can comment', about: 'Read and add comments' },
  { k: 'view', label: 'Can view', about: 'Read only' },
];
export const modesFor = (r: DocRole): CollabMode[] => (r === 'edit' ? ['edit', 'suggest', 'comment'] : r === 'suggest' ? ['suggest', 'comment'] : r === 'comment' ? ['comment'] : ['view']);

export type SharedDoc = {
  id: string;
  owner: string;
  ownerName: string;
  title: string;
  kind: DocKind;
  docKey: string;
  members: Record<string, { role: DocRole; name: string; kind: 'teacher' | 'learner' }>;
  memberIds: string[];
  classes?: Record<string, { role: DocRole; name: string }>;
  size?: number; // bytes the document takes, counted towards the owner's space
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const col = collection(db, 'sharedDocs');
export const docLink = (id: string) => `${window.location.origin}/doc/${id}`;

export type DocKind = 'doc' | 'slides' | 'flash' | 'pd';
export const KIND_LABEL: Record<DocKind, string> = { doc: 'Document', slides: 'Slides', flash: 'Flashcards', pd: 'PD reading' };
export async function newSharedDoc(owner: { uid: string; name: string }, kind: DocKind, title = '') {
  const r = await addDoc(col, {
    owner: owner.uid,
    ownerName: owner.name,
    title: title || (kind === 'pd' ? 'PD reading' : `Untitled ${KIND_LABEL[kind].toLowerCase()}`),
    kind,
    docKey: 'f' + newId() + newId(),
    members: {},
    memberIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return r.id;
}

export function useMyDocs(uid?: string) {
  const [mine, setMine] = useState<SharedDoc[] | null>(null);
  const [withMe, setWithMe] = useState<SharedDoc[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedDoc, 'id'>) })).sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
    const a = onSnapshot(query(col, where('owner', '==', uid)), (s) => setMine(map(s)), () => setMine([]));
    const b = onSnapshot(query(col, where('memberIds', 'array-contains', uid)), (s) => setWithMe(map(s)), () => setWithMe([]));
    return () => (a(), b());
  }, [uid]);
  return { mine, withMe };
}

export function useSharedDoc(id?: string) {
  const [d, setD] = useState<SharedDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(col, id),
      (s) => setD(s.exists() ? ({ id: s.id, ...(s.data() as Omit<SharedDoc, 'id'>) } as SharedDoc) : null),
      () => setD(null),
    );
  }, [id]);
  return d;
}

export const roleOf = (d: SharedDoc, uid: string): DocRole | null => (d.owner === uid ? 'edit' : d.members?.[uid]?.role ?? null);

export const renameDoc = (id: string, title: string) => updateDoc(doc(col, id), { title: title.trim().slice(0, 120) || 'Untitled', updatedAt: serverTimestamp() });
export const touchDoc = (id: string) => updateDoc(doc(col, id), { updatedAt: serverTimestamp() }).catch(() => {});
export const removeSharedDoc = (id: string) => deleteDoc(doc(col, id));

export async function shareWith(d: SharedDoc, people: Person[], role: DocRole) {
  const patch: Record<string, any> = { updatedAt: serverTimestamp() }; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const p of people) patch[`members.${p.key}`] = { role, name: p.name, kind: p.role };
  patch.memberIds = [...new Set([...(d.memberIds ?? []), ...people.map((p) => p.key)])];
  await updateDoc(doc(col, d.id), patch);
}
export const setMemberRole = (d: SharedDoc, uid: string, role: DocRole) => updateDoc(doc(col, d.id), { [`members.${uid}.role`]: role });
export const unshare = (d: SharedDoc, uid: string) => updateDoc(doc(col, d.id), { [`members.${uid}`]: deleteField(), memberIds: (d.memberIds ?? []).filter((x) => x !== uid) });
export const noteClass = (d: SharedDoc, classId: string, name: string, role: DocRole) => updateDoc(doc(col, d.id), { [`classes.${classId}`]: { role, name }, updatedAt: serverTimestamp() });

// A message with the link, to each person (their own chat with you), or into one chat.
export async function sendDocInChat(d: SharedDoc, me: Person, people: Person[], note = '') {
  const link = docLink(d.id);
  const what = d.kind === 'slides' ? 'slides' : d.kind === 'flash' ? 'a flashcard set' : d.kind === 'pd' ? 'my reading notes' : 'a document';
  const text = note.trim() || `I shared ${what} with you: ${d.title}.`;
  for (const p of people) {
    const chatId = await openChat(me, [p]);
    const c = { id: chatId, ...((await getDoc(doc(db, 'chats', chatId))).data() as Omit<Chat, 'id'>) } as Chat;
    await sendMsg(c, me, {
      text: `${text} ${link}`,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: text + ' ' }, { type: 'text', text: `Open ${d.title}`, marks: [{ type: 'link', attrs: { href: link } }] }] }] },
      blocks: 0,
      mentions: [p.key],
    });
  }
}

// How much space a document takes: everything stored for it, measured now and then.
export async function measureDoc(d: SharedDoc, extra = 0) {
  const v = await get(collabRef(d.docKey)).then((s) => s.val()).catch(() => null);
  const size = (v ? JSON.stringify(v).length : 0) + extra;
  if (Math.abs(size - (d.size ?? 0)) > 512) await updateDoc(doc(col, d.id), { size }).catch(() => {});
  return size;
}
