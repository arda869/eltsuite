import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdf, openPdf, pdfjs, type PageSize } from './pdfData';

// The pages of a PDF, one under the other at the same width, drawn when they come into view.
// Anything placed on the pages goes in `children`, positioned in % of the whole stack.

export const stackTotal = (pages: PageSize[]) => pages.reduce((n, p) => n + p.h / p.w, 0) || 1.414;
// From a point on a page (fractions of its width and height) to % of the whole stack, and back.
export function toStack(pages: PageSize[], page: number, x: number, y: number) {
  const tot = stackTotal(pages);
  let before = 0;
  for (let i = 0; i < Math.min(page, pages.length); i++) before += pages[i].h / pages[i].w;
  const ph = pages[page] ? pages[page].h / pages[page].w : 1.414;
  return { left: x * 100, top: ((before + y * ph) / tot) * 100, pageH: (ph / tot) * 100 };
}
export function fromStack(pages: PageSize[], fx: number, fy: number) {
  const tot = stackTotal(pages);
  let at = fy * tot;
  for (let i = 0; i < pages.length; i++) {
    const ph = pages[i].h / pages[i].w;
    if (at <= ph || i === pages.length - 1) return { page: i, x: Math.max(0, Math.min(1, fx)), y: Math.max(0, Math.min(1, at / ph)) };
    at -= ph;
  }
  return { page: 0, x: fx, y: fy };
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();
function usePdf(src: string, classId: string) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!src) return;
    const key = classId + '|' + src;
    if (!docs.has(key)) docs.set(key, loadPdf(src, classId).then(openPdf));
    let live = true;
    docs
      .get(key)!
      .then((d) => live && setPdf(d))
      .catch(() => {
        docs.delete(key);
        if (live) setError('We couldn’t open the PDF.');
      });
    return () => {
      live = false;
    };
  }, [src, classId]);
  return { pdf, error };
}

// The words on a page, for reading it aloud. A scanned page has none (it is a picture of text).
export async function pageText(src: string, classId: string, n: number): Promise<string> {
  const key = classId + '|' + src;
  if (!docs.has(key)) docs.set(key, loadPdf(src, classId).then(openPdf));
  const pdf = await docs.get(key)!;
  const pg = await pdf.getPage(n + 1);
  const tc = await pg.getTextContent();
  return (tc.items as { str?: string; hasEOL?: boolean }[]).map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim();
}

function Page({ pdf, n, size, words }: { pdf: PDFDocumentProxy; n: number; size: PageSize; words?: boolean }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [w, setW] = useState(0);
  const busy = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '600px' });
    io.observe(el);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => (io.disconnect(), ro.disconnect());
  }, []);
  useEffect(() => {
    if (!seen || !w || !ref.current) return;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let live = true;
    // One drawing at a time on a canvas: wait for the one before (pdf.js refuses two at once).
    const run = busy.current
      .then(() => (live ? pdf.getPage(n + 1) : null))
      .then((pg) => {
      if (!pg || !live || !ref.current) return;
      const scale = (w / pg.getViewport({ scale: 1 }).width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale });
      const c = ref.current;
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      task = pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }) as unknown as typeof task;
      task?.promise.catch(() => {});
      // The words, invisible over the picture of the page, so they can be tapped.
      const host = textRef.current;
      if (host) {
        host.replaceChildren();
        const tvp = pg.getViewport({ scale: w / pg.getViewport({ scale: 1 }).width });
        host.style.setProperty('--scale-factor', String(tvp.scale));
        void Promise.all([pdfjs(), pg.getTextContent()]).then(([lib, tc]) => {
          if (!live) return;
          const tl = new lib.TextLayer({ textContentSource: tc, container: host, viewport: tvp });
          void tl.render().catch(() => {});
        });
      }
      return task?.promise;
    });
    busy.current = run.catch(() => {});
    return () => {
      live = false;
      task?.cancel();
    };
  }, [seen, w, pdf, n]);
  // Always the same elements, so changing tool never throws away the drawn page.
  return (
    <span ref={wrapRef} className="pdf-pagewrap" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      <canvas ref={ref} className="pdf-page" aria-label={`Page ${n + 1}`} />
      <div ref={textRef} className={'textLayer pdf-words' + (words ? '' : ' off')} />
    </span>
  );
}

export function PdfStack({ src, classId = '', pages, children, onDown, tool, first = 0 }: { src: string; classId?: string; pages: PageSize[]; children?: ReactNode; onDown?: (e: React.PointerEvent<HTMLDivElement>) => void; tool?: string; first?: number }) {
  const { pdf, error } = usePdf(src, classId);
  // Keep the text layer for selection and annotation, without opening a dictionary on click.
  const words = !tool || tool === 'select';
  return (
    <div className={'pdf-stack' + (tool ? ' tool-' + tool : '') + (words ? ' with-words' : '')} onPointerDown={onDown}>
      <div className="pdf-pages" contentEditable={false} suppressContentEditableWarning>
        {pages.map((p, i) => (pdf ? <Page key={i} pdf={pdf} n={i + first} size={p} words={words} /> : <span key={i} className="pdf-page pdf-wait" style={{ aspectRatio: `${p.w} / ${p.h}` }} />))}
        {error && <span className="pdf-err">{error}</span>}
      </div>
      {children}
    </div>
  );
}

// A small picture of one page, for the list of pages.
export function PdfThumb({ src, classId = '', n, size }: { src: string; classId?: string; n: number; size: PageSize }) {
  const { pdf } = usePdf(src, classId);
  const ref = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !seen || !ref.current) return;
    let live = true;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void pdf.getPage(n + 1).then((pg) => {
      if (!live || !ref.current) return;
      const vp = pg.getViewport({ scale: (120 / pg.getViewport({ scale: 1 }).width) * Math.min(2, window.devicePixelRatio || 1) });
      const c = ref.current;
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      task = pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }) as unknown as typeof task;
      task?.promise.catch(() => {});
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [pdf, seen, n]);
  return <canvas ref={ref} className="pdf-thumb" style={{ aspectRatio: `${size.w} / ${size.h}` }} aria-hidden="true" />;
}
