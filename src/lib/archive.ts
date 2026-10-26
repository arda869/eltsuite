import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { mediaCol, mediaDoc } from './media';

// The media archive: every picture, sound and video a teacher adds, kept so it can be used again in
// any lesson or class. The archive entry lives with the teacher; the media itself lives in each class
// that uses it (so that class's learners can open it), copied there the first time it is used.

export type ScriptLine = { t: number | null; text: string };
export type ArchiveKind = 'image' | 'audio' | 'video';
export type ArchiveItem = {
  id: string;
  kind: ArchiveKind;
  name: string;
  folder: string; // '' for the top level
  tags: string[];
  size: number; // bytes stored (0 for links)
  link?: string; // a web address (YouTube or a file) instead of an upload
  home?: { classId: string; mediaId: string }; // where it was first uploaded
  copies?: Record<string, string>; // classId → media id in that class
  thumb?: string; // a small preview for pictures
  script?: ScriptLine[]; // karaoke script for audio and video
  duration?: number;
  createdAt: number;
  updatedAt?: number;
};

const col = (uid: string) => collection(db, 'users', uid, 'archive');
const mediaRef = (classId: string, id: string) => mediaDoc(classId, id);

const withDefaults = (id: string, d: Record<string, unknown>): ArchiveItem => {
  const x = d as Partial<ArchiveItem>;
  return { ...(x as ArchiveItem), id, folder: x.folder ?? '', tags: x.tags ?? [], size: x.size ?? 0, name: x.name ?? 'Untitled', createdAt: x.createdAt ?? 0 };
};

export function useArchive(uid?: string | null) {
  const [items, setItems] = useState<ArchiveItem[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(col(uid), orderBy('createdAt', 'desc')),
      (s) => setItems(s.docs.map((d) => withDefaults(d.id, d.data()))),
      () => setItems([]),
    );
  }, [uid]);
  return items;
}

export async function archiveAdd(uid: string, item: Omit<ArchiveItem, 'id' | 'createdAt'>) {
  const clean = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
  const r = await addDoc(col(uid), { ...clean, createdAt: Date.now() });
  return r.id;
}

export async function archiveGet(uid: string, id: string): Promise<ArchiveItem | null> {
  const s = await getDoc(doc(col(uid), id));
  return s.exists() ? withDefaults(s.id, s.data()) : null;
}

// Rename, move to a folder, tag, or change the script. A new script reaches every class that uses it.
export async function archiveUpdate(uid: string, item: ArchiveItem, patch: Partial<Pick<ArchiveItem, 'name' | 'folder' | 'tags' | 'script' | 'duration'>>) {
  await updateDoc(doc(col(uid), item.id), { ...patch, updatedAt: Date.now() });
  if (patch.script !== undefined || patch.name !== undefined) {
    const places = [...(item.home ? [[item.home.classId, item.home.mediaId] as const] : []), ...Object.entries(item.copies ?? {})];
    const seen = new Set<string>();
    await Promise.all(
      places
        .filter(([c, m]) => !seen.has(c + m) && (seen.add(c + m), true))
        .map(([c, m]) => updateDoc(mediaRef(c, m), { ...(patch.script !== undefined ? { script: patch.script } : {}), ...(patch.name !== undefined ? { title: patch.name } : {}) }).catch(() => {})),
    );
  }
}

// Removing from the archive leaves the media in the lessons that already use it.
export const archiveRemove = (uid: string, id: string) => deleteDoc(doc(col(uid), id));

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`);

// ------------------------------------------------------------------ class media

// Sound files are stored in parts (a Firestore document holds up to 1 MB), with a manifest that
// carries the script. Manifests and parts can be opened without signing in, through the QR code.
const PART = 450 * 1024;
export type Manifest = { kind: 'audio' | 'link'; title?: string; type?: string; size: number; parts?: number; url?: string; script?: ScriptLine[]; duration?: number; video?: boolean; public?: boolean };

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function saveSound(classId: string, blob: Blob, meta: { title: string; script?: ScriptLine[]; duration?: number }, onProgress?: (p: number) => void) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ref = doc(mediaCol(classId));
  const parts = Math.max(1, Math.ceil(bytes.length / PART));
  let done = 0;
  onProgress?.(0);
  // All parts at once: the database takes them side by side, which is much faster than one by one.
  await Promise.all(
    Array.from({ length: parts }, (_, k) => {
      const chunk = bytes.subarray(k * PART, (k + 1) * PART);
      return setDoc(mediaRef(classId, `${ref.id}_p${k}`), { part: k, data: toBase64(chunk), size: chunk.length, public: true }).then(() => onProgress?.(++done / (parts + 1)));
    }),
  );
  const m: Manifest = { kind: 'audio', title: meta.title, type: blob.type || 'audio/mpeg', size: 0, parts, script: meta.script ?? [], duration: meta.duration ?? 0, public: true };
  await setDoc(ref, m);
  onProgress?.(1);
  return { mediaId: ref.id, bytes: bytes.length };
}

export async function saveLink(classId: string, url: string, meta: { title: string; script?: ScriptLine[]; video?: boolean }) {
  const r = await addDoc(mediaCol(classId), { kind: 'link', url, title: meta.title, size: 0, script: meta.script ?? [], video: !!meta.video, public: true } satisfies Manifest);
  return r.id;
}

export function useManifest(classId?: string, id?: string) {
  const [m, setM] = useState<Manifest | null | undefined>(undefined); // undefined while loading, null if missing
  useEffect(() => {
    setM(undefined);
    if (!classId || !id) return setM(null);
    return onSnapshot(
      mediaRef(classId, id),
      (s) => setM(s.exists() ? (s.data() as Manifest) : null),
      () => setM(null),
    );
  }, [classId, id]);
  return m;
}

// Change the script of media that is not in the archive (it was copied in with a lesson).
export const setManifestScript = (classId: string, id: string, script: ScriptLine[]) => updateDoc(mediaRef(classId, id), { script });

export async function loadManifest(classId: string, id: string): Promise<Manifest | null> {
  const s = await getDoc(mediaRef(classId, id));
  return s.exists() ? (s.data() as Manifest) : null;
}

const blobCache = new Map<string, Promise<string>>();
export function soundUrl(classId: string, id: string, m: Manifest) {
  const k = classId + '/' + id;
  if (!blobCache.has(k))
    blobCache.set(
      k,
      Promise.all(Array.from({ length: m.parts ?? 1 }, (_, i) => getDoc(mediaRef(classId, `${id}_p${i}`)).then((s) => String(s.data()?.data ?? '')))).then((parts) => {
        const bytes = parts.map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        return URL.createObjectURL(new Blob(bytes, { type: m.type || 'audio/mpeg' }));
      }),
    );
  return blobCache.get(k)!;
}

// The media for an archive item in a class: the one there already, or a copy made now.
export async function mediaIn(uid: string, item: ArchiveItem, classId: string): Promise<string> {
  if (item.home?.classId === classId) return item.home.mediaId;
  if (item.copies?.[classId]) return item.copies[classId];
  let id = '';
  if (item.link) id = await saveLink(classId, item.link, { title: item.name, script: item.script, video: item.kind === 'video' });
  else if (item.home && item.kind === 'image') {
    const s = await getDoc(mediaRef(item.home.classId, item.home.mediaId));
    const r = await addDoc(mediaCol(classId), { data: s.data()?.data ?? '', type: s.data()?.type ?? 'image/jpeg', size: s.data()?.size ?? 0 });
    id = r.id;
  } else if (item.home) {
    const from = item.home;
    const m = await loadManifest(from.classId, from.mediaId);
    if (!m) throw new Error('missing');
    const ref = doc(mediaCol(classId));
    await Promise.all(
      Array.from({ length: m.parts ?? 1 }, async (_, k) => {
        const p = await getDoc(mediaRef(from.classId, `${from.mediaId}_p${k}`));
        await setDoc(mediaRef(classId, `${ref.id}_p${k}`), p.data() ?? {});
      }),
    );
    await setDoc(ref, { ...m, title: item.name, script: item.script ?? m.script ?? [] });
    id = ref.id;
  }
  if (!id) throw new Error('missing');
  await updateDoc(doc(col(uid), item.id), { copies: { ...(item.copies ?? {}), [classId]: id } });
  return id;
}

// Folders are names on the items; an empty folder is kept as a marker document.
export async function addFolder(uid: string, name: string) {
  await setDoc(doc(db, 'users', uid, 'archiveFolders', name.replace(/\//g, '-')), { name, at: Date.now() });
}
export function useFolders(uid?: string | null) {
  const [folders, setFolders] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'archiveFolders'), (s) => setFolders(s.docs.map((d) => String(d.data().name ?? d.id)).sort()), () => setFolders([]));
  }, [uid]);
  return folders;
}
export async function removeFolder(uid: string, name: string, items: ArchiveItem[]) {
  const b = writeBatch(db);
  items.filter((i) => i.folder === name).forEach((i) => b.update(doc(col(uid), i.id), { folder: '' }));
  b.delete(doc(db, 'users', uid, 'archiveFolders', name.replace(/\//g, '-')));
  await b.commit();
}

// YouTube links: the video id, for the player.
export function youTubeId(url: string) {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : '';
}
