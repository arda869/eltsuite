import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { db } from '../lib/firebase';

// Reading a scanned PDF (OCR). A scan is a picture of text: no words to select, copy, search or
// read aloud. The OCR engine and its English model are our own files (public/ocr), so the pages are
// read in the teacher's browser and never sent anywhere. The words found, with where each sits on
// its page, are kept with the file (sharedDocs/{id}/ocr/p{n}), so everyone it is shared with gets
// them and nobody reads the same page twice.

export type OcrWord = { t: string; x: number; y: number; w: number; h: number }; // fractions of the page
export type OcrPage = { text: string; words: OcrWord[]; conf: number };
type Store = Record<number, OcrPage>;

const ocrCol = (fileId: string) => collection(db, 'sharedDocs', fileId, 'ocr');

// Kept by src so pages can find their words without passing them down.
const byFile = new Map<string, Store>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function useOcr(fileId: string | undefined, src: string): Store {
  const [store, setStore] = useState<Store>(() => byFile.get(src) ?? {});
  useEffect(() => {
    if (!fileId) return;
    return onSnapshot(ocrCol(fileId), (s) => {
      const next: Store = {};
      s.docs.forEach((d) => {
        const n = Number(d.id.replace(/^p/, ''));
        try { if (Number.isInteger(n)) next[n] = { text: String(d.get('text') ?? ''), words: JSON.parse(String(d.get('words') ?? '[]')), conf: Number(d.get('conf')) || 0 }; } catch { /* a damaged page is read again */ }
      });
      byFile.set(src, next);
      setStore(next);
      notify();
    }, () => {});
  }, [fileId, src]);
  return store;
}

// For a page: its OCR words, when the PDF has none of its own.
export function useOcrWords(src: string, n: number): OcrWord[] | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return byFile.get(src)?.[n]?.words ?? null;
}
export const ocrText = (src: string, n: number) => byFile.get(src)?.[n]?.text ?? '';
export const ocrWordsOf = (src: string, n: number): OcrWord[] => byFile.get(src)?.[n]?.words ?? [];

// Does the page have real text? A scan has none, or only a few stray characters.
export async function pageHasText(pdf: PDFDocumentProxy, n: number): Promise<boolean> {
  const tc = await (await pdf.getPage(n + 1)).getTextContent();
  const chars = (tc.items as { str?: string }[]).reduce((k, i) => k + (i.str ?? '').trim().length, 0);
  return chars > 20;
}

type Worker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number; words?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] } }>; terminate: () => Promise<unknown> };
let worker: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  // The library's own browser build (an ES module), not its CommonJS entry.
  worker ??= import('tesseract.js/dist/tesseract.esm.min.js').then(async (m) => {
    const T = (m as unknown as { default?: typeof m }).default ?? m;
    return (await T.createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr/', gzip: true, workerBlobURL: false })) as unknown as Worker;
  }).catch((e) => { worker = null; throw e; });
  return worker;
}
export async function stopOcr() {
  const w = worker;
  worker = null;
  if (w) await (await w).terminate().catch(() => {});
}

// Read one page: drawn about 2,000 pixels wide (sharp enough for small print), then read.
export async function readPage(pdf: PDFDocumentProxy, n: number): Promise<OcrPage> {
  const pg = await pdf.getPage(n + 1);
  const base = pg.getViewport({ scale: 1 });
  const vp = pg.getViewport({ scale: Math.min(4, 2000 / base.width) });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp } as Parameters<typeof pg.render>[0]).promise;
  const { data } = await (await getWorker()).recognize(c);
  const words = (data.words ?? [])
    .filter((w) => w.text.trim() && w.confidence > 30)
    .map((w) => ({ t: w.text, x: w.bbox.x0 / c.width, y: w.bbox.y0 / c.height, w: (w.bbox.x1 - w.bbox.x0) / c.width, h: (w.bbox.y1 - w.bbox.y0) / c.height }));
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { text: data.text.trim(), conf: Math.round(data.confidence), words: words.map((w) => ({ t: w.t, x: round(w.x), y: round(w.y), w: round(w.w), h: round(w.h) })) };
}

export async function saveOcrPage(fileId: string, n: number, p: OcrPage) {
  await setDoc(doc(ocrCol(fileId), 'p' + n), { text: p.text.slice(0, 200_000), words: JSON.stringify(p.words).slice(0, 800_000), conf: p.conf, at: Date.now() });
}

// Every page that needs it, one at a time, with progress; stops when asked.
export async function readScannedPages(pdf: PDFDocumentProxy, fileId: string, pages: number[], onProgress: (done: number, total: number) => void, stop: () => boolean) {
  let done = 0;
  onProgress(0, pages.length);
  for (const n of pages) {
    if (stop()) break;
    const p = await readPage(pdf, n);
    if (stop()) break;
    await saveOcrPage(fileId, n, p);
    onProgress(++done, pages.length);
  }
  return done;
}
