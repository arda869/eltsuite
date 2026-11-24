import { getPdf } from './PdfStack';
import { ocrText } from './ocr';

// Searching a PDF: each page's own text, or the words OCR found on a scanned page.
// Accents and capitals don't matter ("cafe" finds "café").

export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');

const cache = new Map<string, Promise<string[]>>();
export function pageTexts(src: string, first: number, count: number): Promise<string[]> {
  const key = `${src}|${first}|${count}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const pdf = await getPdf(src);
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const n = i + first;
        if (n >= pdf.numPages) break;
        const tc = await (await pdf.getPage(n + 1)).getTextContent();
        const own = (tc.items as { str?: string; hasEOL?: boolean }[]).map((t) => (t.str ?? '') + (t.hasEOL ? '\n' : ' ')).join('');
        out.push(own.trim().length > 20 ? own : ocrText(src, n) || own);
      }
      return out;
    })().catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key)!;
}
// Scanned pages get their words later (after Read the text): start again then.
export const forgetTexts = () => cache.clear();

export type Hit = { page: number; at: number; snippet: string };
export function findHits(texts: string[], query: string, max = 500): Hit[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const hits: Hit[] = [];
  texts.forEach((t, page) => {
    const f = fold(t);
    let i = f.indexOf(q);
    while (i >= 0 && hits.length < max) {
      const a = Math.max(0, i - 40), b = Math.min(t.length, i + q.length + 40);
      hits.push({ page, at: i, snippet: (a ? '…' : '') + t.slice(a, b).replace(/\s+/g, ' ').trim() + (b < t.length ? '…' : '') });
      i = f.indexOf(q, i + q.length);
    }
  });
  return hits;
}

// Light up the words on the pages drawn so far. The text layer splits text into pieces, so a piece
// lights up when it holds the whole search, or, for several words, one of them.
export function markHits(root: ParentNode, query: string, current: number | null) {
  const q = fold(query.trim());
  const words = q.split(' ').filter((w) => w.length >= 2);
  root.querySelectorAll('.pdf-hit, .pdf-hit-on').forEach((el) => el.classList.remove('pdf-hit', 'pdf-hit-on'));
  if (q.length < 2) return;
  const layers = [...root.querySelectorAll<HTMLElement>('.textLayer')];
  layers.forEach((layer, page) => {
    const spans = [...layer.querySelectorAll<HTMLElement>('span')].filter((s) => !s.children.length);
    let lit = spans.filter((s) => fold(s.textContent ?? '').includes(q));
    if (!lit.length && words.length > 1) lit = spans.filter((s) => { const f = fold(s.textContent ?? ''); return words.some((w) => f.includes(w)); });
    lit.forEach((s, k) => s.classList.add(page === current && k === 0 ? 'pdf-hit-on' : 'pdf-hit'));
  });
}
