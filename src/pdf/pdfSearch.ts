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

// Match the rendered text in reading order so Next highlights the selected occurrence, including
// when a page contains several matches or a phrase runs across text-layer spans.
export function markHits(root: ParentNode, query: string, hits: Hit[], selected: number) {
  const q = fold(query.trim());
  root.querySelectorAll('.pdf-hit, .pdf-hit-on').forEach((el) => el.classList.remove('pdf-hit', 'pdf-hit-on'));
  if (q.length < 2 || !hits.length) return;
  const current = hits[selected]?.page;
  const currentOrdinal = hits.slice(0, selected).filter((h) => h.page === current).length;
  const layers = [...root.querySelectorAll<HTMLElement>('.textLayer')];
  layers.forEach((layer, page) => {
    if (!hits.some((h) => h.page === page)) return;
    const spans = [...layer.querySelectorAll<HTMLElement>('span')].filter((s) => !s.children.length);
    const pieces: { span: HTMLElement; from: number; to: number }[] = [];
    let text = '';
    for (const span of spans) {
      if (text) text += ' ';
      const from = text.length;
      text += fold(span.textContent ?? '');
      pieces.push({ span, from, to: text.length });
    }
    let at = text.indexOf(q);
    let ordinal = 0;
    while (at >= 0) {
      for (const piece of pieces) {
        if (piece.from < at + q.length && piece.to > at) {
          piece.span.classList.add(page === current && ordinal === currentOrdinal ? 'pdf-hit-on' : 'pdf-hit');
        }
      }
      ordinal++;
      at = text.indexOf(q, at + q.length);
    }
  });
}
