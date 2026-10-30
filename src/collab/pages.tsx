import { NSelect } from '../components/Select';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Mark, mergeAttributes, type Editor } from '@tiptap/react';
import type * as Y from 'yjs';
import { ask } from '../lib/ask';
import { useDismiss } from '../lib/useDismiss';

// A Collab document can be pageless (the default: one long page that fits the screen) or paged,
// like Word: a page size, margins, a font for the whole document, and fonts and sizes for any
// text. The setting is part of the shared document, so everyone writing in it sees the same pages.
// Switching back to pageless takes the fonts and sizes away again (after asking).

export type PageSize = 'a4' | 'letter' | 'a5';
export type Margins = 'narrow' | 'normal' | 'wide';
export type Layout = { paged: boolean; size: PageSize; margins: Margins; font: string; pt: number; orientation: 'portrait' | 'landscape'; lineSpacing: number };
export const LAYOUT_DEFAULT: Layout = { paged: true, size: 'a4', margins: 'normal', font: 'Georgia', pt: 12, orientation: 'portrait', lineSpacing: 1.5 };

// At 96 pixels to the inch, as the browser prints.
export const SIZES: Record<PageSize, { label: string; w: number; h: number; css: string }> = {
  a4: { label: 'A4 (21 × 29.7 cm)', w: 794, h: 1123, css: 'A4' },
  letter: { label: 'Letter (8.5 × 11 in)', w: 816, h: 1056, css: 'letter' },
  a5: { label: 'A5 (14.8 × 21 cm)', w: 559, h: 794, css: 'A5' },
};
export const MARGINS: Record<Margins, { label: string; px: number }> = {
  narrow: { label: 'Narrow (1.27 cm)', px: 48 },
  normal: { label: 'Normal (2.54 cm)', px: 96 },
  wide: { label: 'Wide (3.8 cm)', px: 144 },
};
export const PAGE_FONTS = ['Georgia', 'Times New Roman', 'Arial', 'Calibri', 'Verdana', 'Trebuchet MS', 'Garamond', 'Courier New', 'Comic Sans MS'];
export const PAGE_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

// Fonts and sizes on part of the text: one mark with both.
export const FontStyle = Mark.create({
  name: 'fontStyle',
  addAttributes() {
    return {
      family: { default: null, parseHTML: (el) => (el as HTMLElement).style.fontFamily?.replace(/["']/g, '') || null },
      pt: { default: null, parseHTML: (el) => parseFloat((el as HTMLElement).style.fontSize) || null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-font]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const { family, pt, ...rest } = HTMLAttributes as { family?: string | null; pt?: number | null };
    const style = [family ? `font-family:'${family}'` : '', pt ? `font-size:${pt}pt` : ''].filter(Boolean).join(';');
    return ['span', mergeAttributes(rest, { 'data-font': '', style }), 0];
  },
});
export const fontCss = (a?: { family?: string | null; pt?: number | null }) => ({ ...(a?.family ? { fontFamily: `'${a.family}'` } : {}), ...(a?.pt ? { fontSize: `${a.pt}pt` } : {}) });

export function useLayout(doc: Y.Doc | undefined) {
  const [l, setL] = useState<Layout>(LAYOUT_DEFAULT);
  useEffect(() => {
    if (!doc) return;
    const m = doc.getMap('layout');
    const read = () => setL({ ...LAYOUT_DEFAULT, ...(m.toJSON() as Partial<Layout>) });
    read();
    m.observe(read);
    return () => m.unobserve(read);
  }, [doc]);
  const set = (p: Partial<Layout>) => {
    if (!doc) return;
    const m = doc.getMap('layout');
    doc.transact(() => Object.entries(p).forEach(([k, v]) => m.set(k, v)));
  };
  return [l, set] as const;
}

// The page setup button and, on a paged document, the font and size of the selected text.
export function PageTools({ editor, layout, setLayout, part = 'both', openRequest = 0 }: { editor: Editor; layout: Layout; setLayout: (p: Partial<Layout>) => void; part?: 'both' | 'setup' | 'fonts'; openRequest?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLSpanElement>(open, () => setOpen(false));
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  const cur = editor.getAttributes('fontStyle') as { family?: string | null; pt?: number | null };
  const selectedSize = cur.pt ?? layout.pt;
  const [sizeDraft, setSizeDraft] = useState(String(selectedSize));
  const cancelSize = useRef(false);
  useEffect(() => setSizeDraft(String(selectedSize)), [selectedSize]);
  const apply = (p: { family?: string | null; pt?: number | null }) => {
    const next = { family: cur.family ?? null, pt: cur.pt ?? null, ...p };
    const c = editor.chain().focus();
    if (!next.family && !next.pt) c.unsetMark('fontStyle').run();
    else c.setMark('fontStyle', next).run();
  };
  const changeSize = (value: number) => {
    const pt = Math.min(400, Math.max(1, Math.round(value * 2) / 2));
    setSizeDraft(String(pt));
    apply({ pt });
  };
  const commitSize = () => {
    if (cancelSize.current) { cancelSize.current = false; return; }
    const value = Number(sizeDraft);
    if (!sizeDraft.trim() || !Number.isFinite(value)) { setSizeDraft(String(selectedSize)); return; }
    changeSize(value);
  };
  const toPageless = async () => {
    if (!(await ask('Make it pageless again? The page size and margins go, and so do the fonts and sizes you chose for parts of the text.'))) return;
    editor.chain().focus().selectAll().unsetMark('fontStyle').setTextSelection(0).run();
    setLayout({ paged: false });
    setOpen(false);
  };
  return (
    <>
      {layout.paged && part !== 'setup' && (
        <span className="pg-fonts">
          <NSelect className="pg-sel pg-font" aria-label="Font" value={cur.family ?? ''} onChange={(e) => apply({ family: e.target.value || null })} onMouseDown={(e) => e.stopPropagation()}>
            <option value="">{layout.font}</option>
            {PAGE_FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </NSelect>
          <span className="pg-size-controls">
            <button type="button" aria-label="Decrease font size" onMouseDown={(e) => e.preventDefault()} onClick={() => changeSize(selectedSize - 1)}>−</button>
            <input aria-label="Font size" inputMode="decimal" value={sizeDraft} onChange={(e) => setSizeDraft(e.target.value)} onBlur={() => commitSize()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSize(); } if (e.key === 'Escape') { cancelSize.current = true; setSizeDraft(String(selectedSize)); editor.commands.focus(); } }} />
            <button type="button" aria-label="Increase font size" onMouseDown={(e) => e.preventDefault()} onClick={() => changeSize(selectedSize + 1)}>+</button>
          </span>
        </span>
      )}
      {part !== 'fonts' && <span className="pg-wrap" ref={ref} onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className={'tool pg-btn' + (open ? ' on' : '')} aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} data-tip="Pageless or pages, page size, margins and font">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3h9l4 4v14H6zM15 3v4h4" />
            {layout.paged && <path d="M9 12h6M9 15.5h6" />}
          </svg>
          <span>{layout.paged ? 'Pages' : 'Pageless'}</span>
        </button>
        {open && (
          <div className="pg-pop" role="dialog" aria-label="Page setup">
            <span className="pg-seg" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" aria-checked={!layout.paged} className={!layout.paged ? 'on' : ''} onClick={() => layout.paged && void toPageless()}>
                <b>Pageless</b>
                <span>One long page that fits your screen</span>
              </button>
              <button type="button" role="radio" aria-checked={layout.paged} className={layout.paged ? 'on' : ''} onClick={() => setLayout({ paged: true })}>
                <b>Pages</b>
                <span>Like Word: page size, margins, fonts</span>
              </button>
            </span>
            {layout.paged && (
              <div className="pg-grid">
                <label>
                  <span>Orientation</span>
                  <NSelect aria-label="Page orientation" className="pg-sel" value={layout.orientation} onChange={(e) => setLayout({ orientation: e.target.value as Layout['orientation'] })}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </NSelect>
                </label>
                <label>
                  <span>Line spacing</span>
                  <NSelect aria-label="Line spacing" className="pg-sel" value={layout.lineSpacing} onChange={(e) => setLayout({ lineSpacing: Number(e.target.value) })}>
                    {[1, 1.15, 1.5, 2, 2.5, 3].map((n) => <option key={n} value={n}>{n === 1 ? 'Single' : n === 2 ? 'Double' : String(n)}</option>)}
                  </NSelect>
                </label>
                <label>
                  <span>Page size</span>
                  <NSelect aria-label="Page size" className="pg-sel" value={layout.size} onChange={(e) => setLayout({ size: e.target.value as PageSize })}>
                    {Object.entries(SIZES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </NSelect>
                </label>
                <label>
                  <span>Margins</span>
                  <NSelect aria-label="Margins" className="pg-sel" value={layout.margins} onChange={(e) => setLayout({ margins: e.target.value as Margins })}>
                    {Object.entries(MARGINS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </NSelect>
                </label>
                <label>
                  <span>Font</span>
                  <NSelect aria-label="Default font" className="pg-sel" value={layout.font} onChange={(e) => setLayout({ font: e.target.value })}>
                    {PAGE_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </NSelect>
                </label>
                <label>
                  <span>Size</span>
                  <NSelect aria-label="Default font size" className="pg-sel" value={layout.pt} onChange={(e) => setLayout({ pt: Number(e.target.value) })}>
                    {PAGE_SIZES_PT.filter((n) => n <= 18).map((n) => (
                      <option key={n} value={n}>
                        {n} pt
                      </option>
                    ))}
                  </NSelect>
                </label>
              </div>
            )}
            <span className="hint">{layout.paged ? 'Select text to give it its own font and size, in the toolbar. Everyone in the document sees the same pages.' : 'Choose Pages to set a page size and margins, and to change fonts and sizes.'}</span>
          </div>
        )}
      </span>}
    </>
  );
}

// A paged document: white sheets of the chosen size, with a line and a page number where each
// page ends, and the same page size and margins when printed.
export function Paper({ layout, children, appearance = 'auto', paged = layout.paged }: { layout: Layout; children: ReactNode; appearance?: 'auto' | 'white' | 'black'; paged?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const desk = useRef<HTMLDivElement>(null);
  const [zoomChoice, setZoomChoice] = useState('fit');
  const [available, setAvailable] = useState({ width: 800, height: 650 });
  const base = SIZES[layout.size];
  const s = layout.orientation === 'landscape' ? { ...base, w: base.h, h: base.w } : base;
  const m = MARGINS[layout.margins].px;
  const inner = s.h - 2 * m;
  const fitWidth = available.width / s.w;
  const scale = zoomChoice === 'fit' ? Math.min(fitWidth, available.height / s.h) : zoomChoice === 'fill' ? fitWidth : Number(zoomChoice) / 100;
  const zoom = Math.max(10, Math.min(200, Math.floor(scale * 100)));
  const liveZoom = useRef(zoom);
  liveZoom.current = zoom;
  useEffect(() => {
    const el = desk.current;
    if (!el || !paged) return;
    let startDistance = 0;
    let startZoom = liveZoom.current;
    const change = (value: number) => setZoomChoice(String(Math.max(10, Math.min(200, Math.round(value)))));
    const distance = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    // Trackpads report pinch as Ctrl+wheel; ordinary scrolling remains unchanged.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || (e.target as Element).closest('.pg-zoom')) return;
      e.preventDefault();
      change(liveZoom.current * Math.exp(-e.deltaY * 0.01));
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) { startDistance = 0; return; }
      startDistance = distance(e);
      startZoom = liveZoom.current;
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDistance) return;
      e.preventDefault();
      change(startZoom * distance(e) / startDistance);
    };
    const end = () => { startDistance = 0; };
    const gestureStart = (e: Event) => { e.preventDefault(); startZoom = liveZoom.current; };
    const gestureChange = (e: Event) => { e.preventDefault(); change(startZoom * ((e as Event & { scale?: number }).scale ?? 1)); };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('gesturestart', gestureStart, { passive: false });
    el.addEventListener('gesturechange', gestureChange, { passive: false });
    return () => {
      el.removeEventListener('wheel', wheel); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end);
      el.removeEventListener('gesturestart', gestureStart); el.removeEventListener('gesturechange', gestureChange);
    };
  }, [paged]);
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el) return;
    const measure = () => {
      const width = Math.max(1, el.clientWidth - 48);
      const height = Math.max(1, window.innerHeight - Math.max(0, el.getBoundingClientRect().top) - 112);
      setAvailable((old) => old.width === width && old.height === height ? old : { width, height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  // The text's own height decides how many pages there are.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!paged) {
      el.querySelectorAll<HTMLElement>('.ph-node:has(.ph-chart), .cd-view .ph-chart').forEach((block) => { block.style.marginBlockStart = ''; });
      return;
    }
    const measure = () => {
      const paper = el.closest<HTMLElement>('.pg-paper');
      if (paper) {
        const blocks = [...el.querySelectorAll<HTMLElement>('.ph-node:has(.ph-chart), .cd-view .ph-chart')];
        blocks.forEach((block) => { block.style.marginBlockStart = ''; });
        const scale = Number.parseFloat(getComputedStyle(paper).zoom) || 1;
        const sheetTop = paper.getBoundingClientRect().top;
        blocks.forEach((block) => {
          const rect = block.getBoundingClientRect();
          const top = (rect.top - sheetTop) / scale;
          const height = rect.height / scale;
          const page = Math.floor(top / s.h);
          if (height <= inner && top + height > (page + 1) * s.h - m) {
            const margin = Number.parseFloat(getComputedStyle(block).marginBlockStart) || 0;
            block.style.marginBlockStart = `${margin + (page + 1) * s.h + m - top}px`;
          }
        });
      }
      setPages(Math.max(1, Math.ceil(el.offsetHeight / inner)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [m, inner, s.h, zoom, paged]);
  useEffect(() => {
    if (!paged) return;
    const st = document.createElement('style');
    st.textContent = `@page { size: ${s.css} ${layout.orientation}; margin: ${m / 96}in; }`;
    document.head.appendChild(st);
    return () => st.remove();
  }, [s.css, m, layout.orientation, paged]);
  return (
    <div className={paged ? 'pg-desk' : undefined} ref={desk}>
      <div className={paged ? 'pg-paper' : 'pg-flow'} data-paper-theme={appearance} style={paged ? { width: s.w, minHeight: pages * s.h, padding: m, ['--pg-font' as string]: `'${layout.font}'`, ['--pg-pt' as string]: `${layout.pt}pt`, ['--pg-line-height' as string]: layout.lineSpacing, zoom: zoom / 100 } : undefined}>
        <div ref={ref} className={paged ? 'pg-text' : undefined}>
          {children}
        </div>
        {paged && Array.from({ length: pages - 1 }, (_, i) => (
          <span key={i} className="pg-break" style={{ top: (i + 1) * s.h }} aria-hidden="true">
            <span>Page {i + 2}</span>
          </span>
        ))}
      </div>
      {paged && <div className="pg-zoom" role="group" aria-label="Document zoom">
        <NSelect aria-label="Zoom percentage" value={zoomChoice} onChange={(e) => setZoomChoice(e.target.value)}>
          <option value="fit">Fit page</option>
          <option value="fill">Fill width</option>
          {[...new Set([50, 75, 90, 100, 125, 150, 175, 200, zoom])].sort((a, b) => a - b).map((n) => <option key={n} value={String(n)}>{n}%</option>)}
        </NSelect>
        <input type="range" aria-label="Zoom slider" min="10" max="200" step="1" value={zoom} aria-valuetext={`${zoom}%`} onChange={(e) => setZoomChoice(e.target.value)} />
      </div>}
    </div>
  );
}
