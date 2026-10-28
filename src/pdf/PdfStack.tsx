import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createPortal } from 'react-dom';
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
  const ref = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
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
    void pdf.getPage(n + 1).then((pg) => {
      if (!live || !ref.current) return;
      const scale = (w / pg.getViewport({ scale: 1 }).width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale });
      const c = ref.current;
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      task = pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }) as unknown as typeof task;
      task?.promise.catch(() => {});
      // The words, invisible over the picture of the page, so they can be tapped.
      const host = textRef.current;
      if (words && host) {
        host.replaceChildren();
        const tvp = pg.getViewport({ scale: w / pg.getViewport({ scale: 1 }).width });
        host.style.setProperty('--scale-factor', String(tvp.scale));
        void Promise.all([pdfjs(), pg.getTextContent()]).then(([lib, tc]) => {
          if (!live) return;
          const tl = new lib.TextLayer({ textContentSource: tc, container: host, viewport: tvp });
          void tl.render().catch(() => {});
        });
      }
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [seen, w, pdf, n]);
  const canvas = <canvas ref={ref} className="pdf-page" style={{ aspectRatio: `${size.w} / ${size.h}` }} aria-label={`Page ${n + 1}`} />;
  if (!words) return canvas;
  return (
    <span className="pdf-pagewrap">
      {canvas}
      <div ref={textRef} className="textLayer pdf-words" />
    </span>
  );
}

// Tapping a word on a page: what it means, and how it sounds.
type Meaning = { word: string; ipa?: string; defs: { pos: string; d: string }[] } | null;
const meanings = new Map<string, Promise<Meaning>>();
function meaningOf(word: string): Promise<Meaning> {
  const w = word.toLowerCase();
  if (!meanings.has(w))
    meanings.set(
      w,
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!Array.isArray(j) || !j.length) return null;
          const e = j[0] as { word: string; phonetic?: string; phonetics?: { text?: string }[]; meanings?: { partOfSpeech: string; definitions: { definition: string }[] }[] };
          const defs = (e.meanings ?? []).flatMap((m) => m.definitions.slice(0, 2).map((d) => ({ pos: m.partOfSpeech, d: d.definition }))).slice(0, 3);
          return { word: e.word, ipa: e.phonetic ?? e.phonetics?.find((p) => p.text)?.text, defs };
        })
        .catch(() => null),
    );
  return meanings.get(w)!;
}
function wordAt(x: number, y: number): string {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null;
  let off = 0;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (p) (node = p.offsetNode), (off = p.offset);
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) (node = r.startContainer), (off = r.startOffset);
  }
  const t = node?.textContent ?? '';
  if (!t) return '';
  let a = off;
  let b = off;
  while (a > 0 && /[\p{L}'’-]/u.test(t[a - 1])) a--;
  while (b < t.length && /[\p{L}'’-]/u.test(t[b])) b++;
  return t.slice(a, b).replace(/^['’-]+|['’-]+$/g, '');
}
function WordPop({ at, word, onClose }: { at: { x: number; y: number }; word: string; onClose: () => void }) {
  const [m, setM] = useState<Meaning | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void meaningOf(word).then((x) => live && setM(x));
    const away = (e: MouseEvent) => !(e.target as Element).closest?.('.pdf-wordpop') && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    return () => ((live = false), document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc));
  }, [word]); // eslint-disable-line react-hooks/exhaustive-deps
  const say = () => {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-GB';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };
  const left = Math.max(8, Math.min(window.innerWidth - 300, at.x - 140));
  const top = at.y + 14 + 220 > window.innerHeight ? Math.max(8, at.y - 230) : at.y + 14;
  return createPortal(
    <div className="pdf-wordpop" role="dialog" aria-label={`What ${word} means`} style={{ left, top }}>
      <span className="pdf-wp-h">
        <b>{m?.word ?? word}</b>
        {m?.ipa && <span className="pdf-wp-ipa">{m.ipa}</span>}
        <button type="button" className="btn small-btn" onClick={say} aria-label={`Hear ${word}`}>
          ▶ Hear it
        </button>
      </span>
      {m === undefined ? (
        <span className="hint">Looking it up…</span>
      ) : m && m.defs.length ? (
        <ol>
          {m.defs.map((d, i) => (
            <li key={i}>
              <i>{d.pos}</i> {d.d}
            </li>
          ))}
        </ol>
      ) : (
        <span className="hint">We couldn’t find a meaning for this word.</span>
      )}
    </div>,
    document.body,
  );
}

export function PdfStack({ src, classId = '', pages, children, onDown, tool, first = 0 }: { src: string; classId?: string; pages: PageSize[]; children?: ReactNode; onDown?: (e: React.PointerEvent<HTMLDivElement>) => void; tool?: string; first?: number }) {
  const { pdf, error } = usePdf(src, classId);
  // Tap a word for its meaning when nothing else is being done on the page.
  const words = !tool || tool === 'select';
  const [pop, setPop] = useState<{ x: number; y: number; word: string } | null>(null);
  const click = (e: React.MouseEvent) => {
    if (!words || !(e.target as Element).closest('.pdf-words') || (e.target as Element).closest('.pdf-box, .pdf-mark')) return;
    if (!window.getSelection()?.isCollapsed) return;
    const w = wordAt(e.clientX, e.clientY);
    if (w.length > 1) setPop({ x: e.clientX, y: e.clientY, word: w });
  };
  return (
    <div className={'pdf-stack' + (tool ? ' tool-' + tool : '') + (words ? ' with-words' : '')} onPointerDown={onDown} onClick={click}>
      <div className="pdf-pages" contentEditable={false} suppressContentEditableWarning>
        {pages.map((p, i) => (pdf ? <Page key={i} pdf={pdf} n={i + first} size={p} words={words} /> : <span key={i} className="pdf-page pdf-wait" style={{ aspectRatio: `${p.w} / ${p.h}` }} />))}
        {error && <span className="pdf-err">{error}</span>}
      </div>
      {children}
      {pop && <WordPop at={pop} word={pop.word} onClose={() => setPop(null)} />}
    </div>
  );
}
