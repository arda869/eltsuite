import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { newSharedDoc, setDocPath } from './sharedDocs';

// Any other file (a Word file, a spreadsheet, a zip…): kept in parts inside the file in Files,
// shared like the others, and downloaded to open in the app it belongs to.

export const MAX_FILE = 15 * 1024 * 1024;
const PART = 450 * 1024;
export type FileInfo = { name: string; type: string; bytes: number; parts: number };

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const partRef = (id: string, k: number) => doc(db, 'sharedDocs', id, 'blob', 'p' + k);

export const extOf = (name: string) => (/\.([a-z0-9]{1,6})$/i.exec(name)?.[1] ?? '').toLowerCase();
export const baseName = (name: string) => name.replace(/\.[a-z0-9]{1,6}$/i, '') || name;
export const isWord = (f: File) => extOf(f.name) === 'docx' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// What kind of file it is, in words.
const KINDS: [string[], string][] = [
  [['doc', 'docx', 'odt', 'rtf', 'pages'], 'Word document'],
  [['xls', 'xlsx', 'ods', 'csv', 'numbers'], 'Spreadsheet'],
  [['ppt', 'pptx', 'odp', 'key'], 'Presentation'],
  [['zip', 'rar', '7z', 'tar', 'gz'], 'Compressed folder'],
  [['txt', 'md'], 'Text file'],
  [['epub', 'mobi'], 'E-book'],
  [['html', 'htm'], 'Web page'],
  [['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'], 'Picture'],
  [['mp3', 'wav', 'm4a', 'ogg'], 'Sound'],
  [['mp4', 'mov', 'webm', 'avi'], 'Video'],
];
export const fileKindName = (name: string) => {
  const x = extOf(name);
  return KINDS.find(([l]) => l.includes(x))?.[1] ?? (x ? x.toUpperCase() + ' file' : 'File');
};
export const sizeText = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export async function saveAnyFile(owner: { uid: string; name: string }, f: File, folder = ''): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const id = await newSharedDoc(owner, 'file', f.name);
  const n = Math.max(1, Math.ceil(bytes.length / PART));
  for (let k = 0; k < n; k += 4) await Promise.all(Array.from({ length: Math.min(4, n - k) }, (_, j) => setDoc(partRef(id, k + j), { part: k + j, data: toBase64(bytes.subarray((k + j) * PART, (k + j + 1) * PART)) })));
  const file: FileInfo = { name: f.name, type: f.type || 'application/octet-stream', bytes: bytes.length, parts: n };
  await updateDoc(doc(db, 'sharedDocs', id), { file, size: Math.round((bytes.length * 4) / 3), updatedAt: serverTimestamp() });
  if (folder) await setDocPath(id, folder).catch(() => {});
  return id;
}

export async function loadAnyFile(id: string, info?: FileInfo): Promise<Blob> {
  let i = info;
  if (!i) i = (await getDoc(doc(db, 'sharedDocs', id))).data()?.file as FileInfo | undefined;
  let parts: string[];
  if (i?.parts) parts = (await Promise.all(Array.from({ length: i.parts }, (_, k) => getDoc(partRef(id, k))))).map((d) => String(d.data()?.data ?? ''));
  else parts = (await getDocs(collection(db, 'sharedDocs', id, 'blob'))).docs.sort((a, b) => a.data().part - b.data().part).map((d) => String(d.data().data ?? ''));
  return new Blob(parts.map((p) => fromBase64(p)), { type: i?.type || 'application/octet-stream' });
}

export async function downloadAnyFile(id: string, info?: FileInfo, name = 'file') {
  const blob = await loadAnyFile(id, info);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = info?.name || name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// A Word file turned into a Collab document: the text it starts with, kept in parts until the
// document is first opened.
const SPAN = 300000;
export async function saveStart(id: string, html: string) {
  const n = Math.max(1, Math.ceil(html.length / SPAN));
  await Promise.all(Array.from({ length: n }, (_, k) => setDoc(doc(db, 'sharedDocs', id, 'start', 'p' + k), { part: k, html: html.slice(k * SPAN, (k + 1) * SPAN) })));
  await updateDoc(doc(db, 'sharedDocs', id), { start: n, size: html.length, updatedAt: serverTimestamp() });
}
export async function loadStart(id: string, n: number) {
  const parts = await Promise.all(Array.from({ length: n }, (_, k) => getDoc(doc(db, 'sharedDocs', id, 'start', 'p' + k))));
  return parts.map((p) => String(p.data()?.html ?? '')).join('');
}
