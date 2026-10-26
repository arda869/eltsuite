import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { mediaCol, mediaDoc } from './media';

// The resources library: every picture, sound and video a teacher adds, kept so it can be used again in
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
export type Manifest = { kind: 'audio' | 'link'; title?: string; type?: string; size: number; parts?: number; url?: string; script?: ScriptLine[]; duration?: number; video?: boolean; public?: boolean; v?: number };

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
  const k = classId + '/' + id + '/' + (m.v ?? 0);
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

// Folders are paths on the items ("Unit 2/Reading"); '' is the archive itself. An empty folder
// is kept as a marker document.
const folderId = (name: string) => name.replace(/\//g, '__');
export const parentOf = (f: string) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');
export const leafOf = (f: string) => f.slice(f.lastIndexOf('/') + 1);
export const inTree = (f: string, root: string) => !root || f === root || f.startsWith(root + '/');
export async function addFolder(uid: string, name: string) {
  await setDoc(doc(db, 'users', uid, 'archiveFolders', folderId(name)), { name, at: Date.now() });
}
export function useFolders(uid?: string | null) {
  const [folders, setFolders] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'archiveFolders'), (s) => setFolders(s.docs.map((d) => String(d.data().name ?? d.id)).sort()), () => setFolders([]));
  }, [uid]);
  return folders;
}
// Deleting a folder keeps what is in it: everything moves up to the folder it was in.
export async function removeFolder(uid: string, name: string, items: ArchiveItem[], folders: string[] = []) {
  const up = parentOf(name);
  const b = writeBatch(db);
  items.filter((i) => inTree(i.folder, name)).forEach((i) => b.update(doc(col(uid), i.id), { folder: up }));
  [name, ...folders.filter((f) => f.startsWith(name + '/'))].forEach((f) => b.delete(doc(db, 'users', uid, 'archiveFolders', folderId(f))));
  if (up) b.set(doc(db, 'users', uid, 'archiveFolders', folderId(up)), { name: up, at: Date.now() });
  await b.commit();
}
export async function renameFolder(uid: string, from: string, to: string, items: ArchiveItem[], folders: string[]) {
  const map = (f: string) => to + f.slice(from.length);
  const b = writeBatch(db);
  items.filter((i) => inTree(i.folder, from)).forEach((i) => b.update(doc(col(uid), i.id), { folder: map(i.folder) }));
  [from, ...folders.filter((f) => f.startsWith(from + '/'))].forEach((f) => {
    b.delete(doc(db, 'users', uid, 'archiveFolders', folderId(f)));
    b.set(doc(db, 'users', uid, 'archiveFolders', folderId(map(f))), { name: map(f), at: Date.now() });
  });
  await b.commit();
}
export async function moveItems(uid: string, list: ArchiveItem[], folder: string) {
  const b = writeBatch(db);
  list.forEach((i) => b.update(doc(col(uid), i.id), { folder, updatedAt: Date.now() }));
  await b.commit();
}

// YouTube links: the video id, for the player.
export function youTubeId(url: string) {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : '';
}

// ------------------------------------------------------------------ editing a sound in the archive

// Every class that has a copy of the item (the teacher's own space is not a class).
export const placesOf = (item: ArchiveItem) => {
  const seen = new Map<string, string>();
  if (item.home) seen.set(item.home.classId, item.home.mediaId);
  Object.entries(item.copies ?? {}).forEach(([c, m]) => !seen.has(c) && seen.set(c, m));
  return [...seen].map(([classId, mediaId]) => ({ classId, mediaId }));
};

// Where an item is used: each lesson and task that has it.
export async function findUses(item: ArchiveItem): Promise<{ cls: string; lesson: string; task: string; classId: string; itemId: string }[]> {
  const { collection: col2, getDocs } = await import('firebase/firestore');
  const out: { cls: string; lesson: string; task: string; classId: string; itemId: string }[] = [];
  for (const { classId, mediaId } of placesOf(item)) {
    if (classId.startsWith('user:')) continue;
    const cls = await getDoc(doc(db, 'classes', classId)).catch(() => null);
    const items = await getDocs(col2(db, 'classes', classId, 'items')).catch(() => null);
    for (const it of items?.docs ?? []) {
      const tasks = await getDocs(col2(db, 'classes', classId, 'items', it.id, 'tasks')).catch(() => null);
      for (const t of tasks?.docs ?? []) {
        const json = JSON.stringify(t.data().content ?? '');
        if (json.includes(`"${mediaId}"`) || json.includes(`media:${mediaId}`)) out.push({ cls: String(cls?.data()?.name ?? 'A class'), lesson: String(it.data().title ?? 'Lesson'), task: String(t.data().title ?? 'Task'), classId, itemId: it.id });
      }
    }
  }
  return out;
}

// Put a new version of a sound in every place it is kept; the lessons that use it change too.
export async function replaceSound(uid: string, item: ArchiveItem, blob: Blob, meta: { script: ScriptLine[]; duration: number }, onProgress?: (p: number) => void) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts = Math.max(1, Math.ceil(bytes.length / PART));
  const places = placesOf(item);
  let done = 0;
  const total = places.length * (parts + 1);
  for (const { classId, mediaId } of places) {
    const old = await loadManifest(classId, mediaId).catch(() => null);
    await Promise.all(
      Array.from({ length: parts }, (_, k) => {
        const chunk = bytes.subarray(k * PART, (k + 1) * PART);
        return setDoc(mediaRef(classId, `${mediaId}_p${k}`), { part: k, data: toBase64(chunk), size: chunk.length, public: true }).then(() => onProgress?.(++done / total));
      }),
    );
    for (let k = parts; k < (old?.parts ?? 0); k++) await deleteDoc(mediaRef(classId, `${mediaId}_p${k}`)).catch(() => {});
    await setDoc(mediaRef(classId, mediaId), { ...(old ?? {}), kind: 'audio', type: blob.type || 'audio/mpeg', size: 0, parts, duration: meta.duration, script: meta.script, public: true, v: Date.now() });
    onProgress?.(++done / total);
  }
  await updateDoc(doc(col(uid), item.id), { size: Math.round((bytes.length * 4) / 3), duration: meta.duration, script: meta.script, updatedAt: Date.now() });
}

// The file itself, to save on the computer.
// The file behind an item, for a download: its address and a file name.
export async function itemFile(item: ArchiveItem): Promise<{ url: string; name: string } | null> {
  if (item.link || !item.home) return null;
  const { classId, mediaId } = item.home;
  let url = '';
  let ext = 'bin';
  if (item.kind === 'image') {
    const { audioUrl } = await import('./media');
    url = await audioUrl(classId, mediaId);
    ext = /^data:image\/png/.test(url) ? 'png' : 'jpg';
  } else {
    const m = await loadManifest(classId, mediaId);
    if (!m) return null;
    url = await soundUrl(classId, mediaId, m);
    ext = /mp4|m4a|aac/.test(m.type ?? '') ? 'm4a' : /wav/.test(m.type ?? '') ? 'wav' : 'mp3';
  }
  return { url, name: `${safeName(item.name) || 'media'}.${ext}` };
}
// The karaoke script as a plain text transcript, with times where the lines are timed.
export function transcriptOf(item: ArchiveItem): string | null {
  const lines = (item.script ?? []).filter((l) => l.text.trim());
  if (!lines.length) return null;
  const t = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  return `${item.name}\n\n` + lines.map((l) => (l.t === null || l.t === undefined ? l.text : `[${t(l.t)}] ${l.text}`)).join('\n') + '\n';
}
const saveText = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
export const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '').trim();
export async function downloadItem(item: ArchiveItem) {
  const tr = transcriptOf(item);
  if (tr) saveText(tr, `${safeName(item.name) || 'media'} transcript.txt`);
  if (item.link) return void window.open(item.link, '_blank', 'noopener');
  const f = await itemFile(item);
  if (!f) return;
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.name;
  a.click();
}
// Several items (or whole folders) as one zip, with the folders inside it. Links go in a text file.
export async function downloadZip(items: ArchiveItem[], zipName: string, base = '', onProgress?: (done: number, total: number) => void) {
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  const links: string[] = [];
  let done = 0;
  for (const it of items) {
    const rel = base && it.folder.startsWith(base) ? it.folder.slice(base.length).replace(/^\//, '') : base ? '' : it.folder;
    const dir = rel ? rel.split('/').map(safeName).join('/') + '/' : '';
    const tr = transcriptOf(it);
    if (tr) files[`${dir}${safeName(it.name) || 'media'} transcript.txt`] = strToU8(tr);
    if (it.link) links.push(`${dir}${it.name}: ${it.link}`);
    else {
      const f = await itemFile(it).catch(() => null);
      if (f) {
        const bytes = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
        let p = dir + f.name;
        for (let k = 2; files[p]; k++) p = dir + f.name.replace(/(\.[a-z0-9]+)$/i, ` (${k})$1`);
        files[p] = bytes;
      }
    }
    onProgress?.(++done, items.length);
  }
  if (links.length) files['Links.txt'] = strToU8(links.join('\n') + '\n');
  const zip = zipSync(files, { level: 0 });
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(zipName) || 'Media'}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
