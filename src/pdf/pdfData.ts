import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { db } from '../lib/firebase';
import { mediaCol, mediaDoc } from '../lib/media';

// PDF files. The file is kept in parts (a database document holds up to 1 MB): in the file itself
// for a PDF in Files ("file:<id>"), or in a class's media for a PDF in a lesson ("media:<id>").
// Pages are drawn in the browser with pdf.js.

export const MAX_PDF = 15 * 1024 * 1024;
const PART = 450 * 1024;
export type PageSize = { w: number; h: number };

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, at), (at += p.length);
  return out;
};
const split = (bytes: Uint8Array) => Array.from({ length: Math.max(1, Math.ceil(bytes.length / PART)) }, (_, k) => bytes.subarray(k * PART, (k + 1) * PART));

// pdf.js loads only when a PDF is opened.
let lib: Promise<typeof import('pdfjs-dist')> | null = null;
export function pdfjs() {
  lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = (w as { default: string }).default;
    return m;
  });
  return lib;
}
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  return m.getDocument({ data: bytes.slice() }).promise;
}
export async function pageSizes(pdf: PDFDocumentProxy): Promise<PageSize[]> {
  const out: PageSize[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const v = (await pdf.getPage(i)).getViewport({ scale: 1 });
    out.push({ w: Math.round(v.width), h: Math.round(v.height) });
  }
  return out;
}

// A PDF in Files: its parts live in the file.
const filePart = (id: string, k: number) => doc(db, 'sharedDocs', id, 'pdf', 'p' + k);
export async function saveFilePdf(id: string, bytes: Uint8Array, pages: PageSize[]) {
  const parts = split(bytes);
  await Promise.all(parts.map((p, k) => setDoc(filePart(id, k), { part: k, data: toBase64(p) })));
  await updateDoc(doc(db, 'sharedDocs', id), { size: Math.round((bytes.length * 4) / 3), updatedAt: serverTimestamp() });
  await setDoc(doc(db, 'sharedDocs', id, 'pdf', 'info'), { parts: parts.length, bytes: bytes.length, pages });
}
// A PDF in a class, for a lesson.
export async function saveClassPdf(classId: string, bytes: Uint8Array, pages: PageSize[], title: string) {
  const ref = doc(mediaCol(classId));
  const parts = split(bytes);
  await Promise.all(parts.map((p, k) => setDoc(mediaDoc(classId, `${ref.id}_p${k}`), { part: k, data: toBase64(p), size: p.length })));
  await setDoc(ref, { kind: 'pdf', title, size: 0, parts: parts.length, bytes: bytes.length, pages });
  return ref.id;
}

const cache = new Map<string, Promise<Uint8Array>>();
// src: "file:<id>" or "media:<id>" (in the class given).
export function loadPdf(src: string, classId = ''): Promise<Uint8Array> {
  const key = src.startsWith('media:') ? classId + '/' + src : src;
  if (!cache.has(key)) {
    const p = (async () => {
      if (src.startsWith('file:')) {
        const id = src.slice(5);
        const info = await getDoc(doc(db, 'sharedDocs', id, 'pdf', 'info'));
        const n = Number(info.data()?.parts ?? 0);
        if (!n) {
          const all = await getDocs(collection(db, 'sharedDocs', id, 'pdf'));
          return join(all.docs.filter((d) => d.id.startsWith('p')).sort((a, b) => a.data().part - b.data().part).map((d) => fromBase64(d.data().data)));
        }
        const parts = await Promise.all(Array.from({ length: n }, (_, k) => getDoc(filePart(id, k))));
        return join(parts.map((d) => fromBase64(String(d.data()?.data ?? ''))));
      }
      const id = src.replace(/^media:/, '');
      const m = await getDoc(mediaDoc(classId, id));
      const n = Number(m.data()?.parts ?? 0);
      const parts = await Promise.all(Array.from({ length: n }, (_, k) => getDoc(mediaDoc(classId, `${id}_p${k}`))));
      return join(parts.map((d) => fromBase64(String(d.data()?.data ?? ''))));
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}
export async function filePdfInfo(id: string): Promise<{ pages: PageSize[] } | null> {
  const s = await getDoc(doc(db, 'sharedDocs', id, 'pdf', 'info'));
  return s.exists() ? (s.data() as { pages: PageSize[] }) : null;
}
