import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Files learners hand in for a "File upload" question. Without file storage on the free plan,
// a file is kept in parts in the database (a document holds up to 1 MB), with a short record
// of its name, type and size. Only the learner who sent it and the class's teachers can open it.

export type FileKind = 'documents' | 'pictures' | 'sound' | 'video' | 'any';
export type SentFile = { id: string; name: string; type: string; size: number; parts: number };
export const FILE_KINDS: { k: FileKind; label: string; about: string; accept: string; test: (f: { name: string; type: string }) => boolean }[] = [
  { k: 'documents', label: 'Documents', about: 'PDF, Word, PowerPoint, Excel, Pages, Keynote, text', accept: '.pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.xls,.xlsx,.csv,.odt,.odp,.ods,.rtf,.txt,.md,.pages,.key,.numbers', test: (f) => /\.(pdf|docx?|pptx?|ppsx?|xlsx?|csv|od[tps]|rtf|txt|md|pages|key|numbers)$/i.test(f.name) },
  { k: 'pictures', label: 'Pictures', about: 'Photos and images, including iPhone photos', accept: 'image/*,.heic,.heif', test: (f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|gif|webp|svg)$/i.test(f.name) },
  { k: 'sound', label: 'Sound', about: 'Recordings and sound files', accept: 'audio/*,.m4a,.mp3,.wav,.ogg,.aac', test: (f) => f.type.startsWith('audio/') || /\.(m4a|mp3|wav|ogg|aac|opus)$/i.test(f.name) },
  { k: 'video', label: 'Video', about: 'Short video clips', accept: 'video/*,.mov,.mp4,.webm', test: (f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name) },
  { k: 'any', label: 'Any file', about: 'Anything at all', accept: '', test: () => true },
];
export const SIZES = [1, 2, 5, 10]; // MB per file on the free plan

export const acceptFor = (kinds: FileKind[]) => (kinds.includes('any') || !kinds.length ? '' : kinds.map((k) => FILE_KINDS.find((x) => x.k === k)?.accept ?? '').join(','));
export const allowed = (kinds: FileKind[], f: { name: string; type: string }) => !kinds.length || kinds.includes('any') || kinds.some((k) => FILE_KINDS.find((x) => x.k === k)?.test(f));

const PART = 450 * 1024;
const fileRef = (classId: string, id: string) => doc(db, 'classes', classId, 'files', id);
const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// Photos are made smaller first when the teacher asks (most phone photos shrink to under 1 MB).
export async function shrinkPhoto(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 900 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.84));
    return blob.size < f.size ? new File([blob], f.name.replace(/\.(png|webp)$/i, '.jpg'), { type: 'image/jpeg' }) : f;
  } catch {
    return f;
  }
}

export async function sendFile(classId: string, owner: string, learnerId: string, taskId: string, f: File, onProgress?: (p: number) => void): Promise<SentFile> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const ref = doc(collection(db, 'classes', classId, 'files'));
  const parts = Math.max(1, Math.ceil(bytes.length / PART));
  for (let k = 0; k < parts; k++) {
    const chunk = bytes.subarray(k * PART, (k + 1) * PART);
    await setDoc(fileRef(classId, `${ref.id}_p${k}`), { owner, part: k, data: toBase64(chunk) });
    onProgress?.((k + 1) / (parts + 1));
  }
  const rec = { owner, learnerId, taskId, name: f.name, type: f.type || 'application/octet-stream', size: bytes.length, parts, createdAt: serverTimestamp() };
  await setDoc(ref, rec);
  onProgress?.(1);
  return { id: ref.id, name: f.name, type: rec.type, size: bytes.length, parts };
}

export async function removeFile(classId: string, f: SentFile) {
  await deleteDoc(fileRef(classId, f.id)).catch(() => {});
  await Promise.all(Array.from({ length: f.parts }, (_, k) => deleteDoc(fileRef(classId, `${f.id}_p${k}`)).catch(() => {})));
}

const cache = new Map<string, Promise<string>>();
export function fileUrl(classId: string, f: SentFile) {
  const k = classId + '/' + f.id;
  if (!cache.has(k))
    cache.set(
      k,
      Promise.all(Array.from({ length: f.parts }, (_, i) => getDoc(fileRef(classId, `${f.id}_p${i}`)).then((s) => String(s.data()?.data ?? '')))).then((parts) => {
        const bytes = parts.map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        return URL.createObjectURL(new Blob(bytes, { type: f.type }));
      }),
    );
  cache.get(k)!.catch(() => cache.delete(k));
  return cache.get(k)!;
}

// Browsers can show these themselves; the rest are downloaded.
export const canPreview = (f: SentFile) => /^(image\/(jpeg|png|gif|webp|svg)|application\/pdf|audio\/|video\/|text\/plain)/.test(f.type);
export const kindOf = (f: { name: string; type: string }): 'pdf' | 'doc' | 'slides' | 'sheet' | 'picture' | 'sound' | 'video' | 'file' =>
  /pdf/.test(f.type) || /\.pdf$/i.test(f.name) ? 'pdf' : /\.(pptx?|ppsx?|key|odp)$/i.test(f.name) ? 'slides' : /\.(xlsx?|csv|numbers|ods)$/i.test(f.name) ? 'sheet' : /\.(docx?|pages|odt|rtf|txt|md)$/i.test(f.name) ? 'doc' : f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name) ? 'picture' : f.type.startsWith('audio/') ? 'sound' : f.type.startsWith('video/') ? 'video' : 'file';
