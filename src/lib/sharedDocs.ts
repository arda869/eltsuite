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
  { k: 'suggest', label: 'Can suggest and comment', about: 'Changes show as suggestions you accept or reject, and comments can be added' },
  { k: 'comment', label: 'Can comment', about: 'Read and add comments' },
  { k: 'view', label: 'Can view', about: 'Read only' },
];
// Every kind of file has the same three: edit, comment, view. Documents and slides can also suggest.
// Documents: suggesting and commenting are one level. Other files: commenting only.
export const rolesFor = (kind?: string) => (kind === 'doc' || !kind ? ROLES.filter((r) => r.k !== 'comment') : ROLES.filter((r) => r.k !== 'suggest'));
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
  folder?: string; // a shared folder it is in
  ltype?: 'lesson' | 'homework' | 'exam' | 'practice'; // a lesson file: what kind of lesson it becomes in a class
  path?: string; // the folder in the owner's files
  file?: { name: string; type: string; bytes: number; parts: number }; // any other file: what was uploaded
  start?: number; // a document made from a Word file: parts of the text it starts with
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const col = collection(db, 'sharedDocs');
export const docLink = (id: string) => `${window.location.origin}/doc/${id}`;

export type DocKind = 'doc' | 'slides' | 'flash' | 'pd' | 'lesson' | 'pdf' | 'storyboard' | 'file' | 'design';
export const KIND_LABEL: Record<DocKind, string> = { doc: 'Collab document', slides: 'Slides', flash: 'Flashcards', pd: 'Reading Journal', lesson: 'Lesson', pdf: 'PDF', storyboard: 'Storyboard', file: 'File', design: 'Design' };
export async function newSharedDoc(owner: { uid: string; name: string }, kind: DocKind, title = '') {
  const r = await addDoc(col, {
    owner: owner.uid,
    ownerName: owner.name,
    title: title || (kind === 'pd' ? 'Reading Journal' : `Untitled ${KIND_LABEL[kind].toLowerCase()}`),
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
  const what = d.kind === 'slides' ? 'slides' : d.kind === 'flash' ? 'a flashcard set' : d.kind === 'pd' ? 'my reading notes' : d.kind === 'lesson' ? 'a lesson' : d.kind === 'storyboard' ? 'a storyboard' : d.kind === 'file' ? 'a file' : d.kind === 'design' ? 'a design' : 'a document';
  const text = note.trim() || `I shared ${what} with you: ${d.title}.`;
  for (const p of people) {
    const chatId = await openChat(me, [p]);
    const c = { id: chatId, ...((await getDoc(doc(db, 'chats', chatId))).data() as Omit<Chat, 'id'>) } as Chat;
    await sendMsg(c, me, {
      text: `${text} ${link}`,
      // The note in words; the file itself shows as a preview card under it.
      content: note.trim() ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: note.trim() }] }] } : null,
      file: { id: d.id, title: d.title, kind: d.kind, ownerName: d.ownerName ?? me.name },
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

// ------------------------------------------------------------------ shared folders
// A folder shared with colleagues or learners: everything in it is shared with everyone in it,
// and belongs to the folder's owner, whose space it uses.

export type SharedFolder = { id: string; owner: string; ownerName: string; name: string; members: SharedDoc['members']; memberIds: string[] };
const fcol = collection(db, 'sharedFolders');

export async function newFolder(owner: { uid: string; name: string }, name: string) {
  const r = await addDoc(fcol, { owner: owner.uid, ownerName: owner.name, name: name.trim() || 'Shared folder', members: {}, memberIds: [], createdAt: serverTimestamp() });
  return r.id;
}
export function useFolders(uid?: string) {
  const [mine, setMine] = useState<SharedFolder[] | null>(null);
  const [withMe, setWithMe] = useState<SharedFolder[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedFolder, 'id'>) }));
    const a = onSnapshot(query(fcol, where('owner', '==', uid)), (s) => setMine(map(s)), () => setMine([]));
    const b = onSnapshot(query(fcol, where('memberIds', 'array-contains', uid)), (s) => setWithMe(map(s)), () => setWithMe([]));
    return () => (a(), b());
  }, [uid]);
  return { mine, withMe };
}
// Docs in a folder: the owner's, plus those shared with me.
export function useFolderDocs(f?: SharedFolder | null, uid?: string) {
  const [list, setList] = useState<SharedDoc[] | null>(null);
  const folderId = f?.id;
  const own = f?.owner === uid;
  useEffect(() => {
    if (!folderId || !uid) return;
    return onSnapshot(
      own ? query(col, where('owner', '==', uid), where('folder', '==', folderId)) : query(col, where('memberIds', 'array-contains', uid), where('folder', '==', folderId)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedDoc, 'id'>) }))),
      () => setList([]),
    );
  }, [folderId, uid, own]);
  return list;
}
// A new file in a folder belongs to the folder's owner and is shared with everyone in it.
export async function newDocInFolder(f: SharedFolder, me: { uid: string; name: string }, kind: DocKind, extra: { ltype?: SharedDoc['ltype']; title?: string } = {}) {
  const members = Object.fromEntries(Object.entries(f.members ?? {}).filter(([, m]) => m.kind === 'teacher' || kind === 'doc' || kind === 'slides')) as SharedDoc['members'];
  if (me.uid !== f.owner) members[me.uid] = f.members?.[me.uid] ?? { role: 'edit', name: me.name, kind: 'teacher' };
  delete members[f.owner];
  const r = await addDoc(col, {
    owner: f.owner,
    ownerName: f.ownerName,
    createdBy: me.uid,
    folder: f.id,
    title: extra.title || (kind === 'pd' ? 'Reading Journal' : `Untitled ${KIND_LABEL[kind].toLowerCase()}`),
    kind,
    ...(extra.ltype ? { ltype: extra.ltype } : {}),
    docKey: 'f' + newId() + newId(),
    members,
    memberIds: Object.keys(members),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return r.id;
}
// Sharing a folder shares everything in it.
export async function shareFolder(f: SharedFolder, people: Person[], role: DocRole, docs: SharedDoc[]) {
  const add: Record<string, { role: DocRole; name: string; kind: 'teacher' | 'learner' }> = {};
  for (const p of people) add[p.key] = { role, name: p.name, kind: p.role };
  const memberIds = [...new Set([...(f.memberIds ?? []), ...people.map((p) => p.key)])];
  await updateDoc(doc(fcol, f.id), { members: { ...(f.members ?? {}), ...add }, memberIds });
  // Learners get documents and slides; everything else in the folder is for teachers.
  await Promise.all(
    docs
      .filter((d) => d.owner === f.owner)
      .map((d) => {
        const who = people.filter((p) => p.role === 'teacher' || d.kind === 'doc' || d.kind === 'slides');
        if (!who.length) return null;
        const a = Object.fromEntries(who.map((p) => [p.key, add[p.key]]));
        return updateDoc(doc(col, d.id), { members: { ...(d.members ?? {}), ...a }, memberIds: [...new Set([...(d.memberIds ?? []), ...who.map((p) => p.key)])] });
      }),
  );
}
export async function unshareFolder(f: SharedFolder, uid: string, docs: SharedDoc[]) {
  const { [uid]: _, ...rest } = f.members ?? {};
  void _;
  await updateDoc(doc(fcol, f.id), { members: rest, memberIds: (f.memberIds ?? []).filter((x) => x !== uid) });
  await Promise.all(docs.filter((d) => d.memberIds?.includes(uid)).map((d) => unshare(d, uid)));
}
export const renameFolder = (f: SharedFolder, name: string) => updateDoc(doc(fcol, f.id), { name: name.trim() || f.name });
export async function moveToFolder(d: SharedDoc, f: SharedFolder | null) {
  if (!f) return updateDoc(doc(col, d.id), { folder: deleteField() });
  const members = { ...(d.members ?? {}), ...(f.members ?? {}) };
  await updateDoc(doc(col, d.id), { folder: f.id, members, memberIds: Object.keys(members) });
}
export const removeFolder = (f: SharedFolder) => deleteDoc(doc(fcol, f.id));
export async function sendFolderInChat(f: SharedFolder, me: Person, people: Person[], docs: SharedDoc[], note = '') {
  for (const p of people) {
    const chatId = await openChat(me, [p]);
    const c = { id: chatId, ...((await getDoc(doc(db, 'chats', chatId))).data() as Omit<Chat, 'id'>) } as Chat;
    const text = note.trim() || `I shared the folder “${f.name}” with you.`;
    // Teachers open the folder in Files; learners get a link to each file.
    const links = p.role === 'teacher' ? [{ label: `Open ${f.name}`, href: `${window.location.origin}/archive?folder=${f.id}` }] : docs.map((d) => ({ label: d.title, href: docLink(d.id) }));
    await sendMsg(c, me, {
      text: `${text} ${links.map((l) => l.href).join(' ')}`,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...links.map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l.label, marks: [{ type: 'link', attrs: { href: l.href } }] }] }))] },
      blocks: 0,
      mentions: [p.key],
    });
  }
}

export const setDocPath = (id: string, path: string) => updateDoc(doc(col, id), { path });
