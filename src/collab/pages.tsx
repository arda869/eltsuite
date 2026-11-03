import { NSelect } from '../components/Select';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Mark, mergeAttributes, type Editor } from '@tiptap/react';
import type * as Y from 'yjs';
import { useDismiss } from '../lib/useDismiss';

// A Collab document opens pageless, or can use one long pageless canvas,
// like Word: a page size, margins, a font for the whole document, and fonts and sizes for any
// text. The setting is part of the shared document, so everyone writing in it sees the same pages.
// Switching layout preserves the document's text formatting.

import { LAYOUT_DEFAULT, SIZES, MARGINS, type Layout, type PageSize, type Margins } from './documentLayout';
export { LAYOUT_DEFAULT, SIZES, MARGINS, type Layout } from './documentLayout';

export const PAGE_FONTS = ['Georgia', 'Times New Roman', 'Arial', 'Calibri', 'Verdana', 'Trebuchet MS', 'Garamond', 'Courier New', 'Comic Sans MS', 'Helvetica', 'Palatino', 'Book Antiqua', 'Tahoma', 'Cambria', 'Candara', 'Consolas', 'system-ui'];
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
  const toPageless = () => {setLayout({paged:false});setOpen(false);};
  return (
    <>
      {part !== 'setup' && (
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
                <label><span>Document columns</span><NSelect aria-label="Document columns" value={layout.columns} onChange={(e) => setLayout({ columns: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</NSelect></label>
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
            {layout.paged && <div className="pg-running-settings">
              <label>Header<input aria-label="Page header" maxLength={160} value={layout.header} onChange={(e) => setLayout({ header: e.target.value })} /></label>
              <label>Footer<input aria-label="Page footer" maxLength={160} value={layout.footer} onChange={(e) => setLayout({ footer: e.target.value })} /></label>
              <label className="pg-check"><input type="checkbox" checked={layout.pageNumbers} onChange={(e) => setLayout({ pageNumbers: e.target.checked })} />Show page numbers</label>
              {layout.pageNumbers && <label>Start numbering at<input type="number" min="1" max="9999" aria-label="Starting page number" value={layout.pageNumberStart} onChange={(e) => setLayout({ pageNumberStart: Math.max(1, Math.min(9999, Number(e.target.value) || 1)) })} /></label>}
            </div>}
            <span className="hint">{layout.paged ? 'Select text to give it its own font and size, in the toolbar. Everyone in the document sees the same pages.' : 'Fonts and text formatting stay the same in either layout. Choose Pages to set a page size and margins.'}</span>
          </div>
        )}
      </span>}
    </>
  );
}

// A paged document: white sheets of the chosen size, with a line and a page number where each
// page ends, and the same page size and margins when printed.
export function Paper({ layout, children, appearance = 'auto', paged = layout.paged, editor }: { editor?:Editor; layout: Layout; children: ReactNode; appearance?: 'auto' | 'white' | 'black'; paged?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const desk = useRef<HTMLDivElement>(null);
  const [zoomChoice, setZoomChoice] = useState('fit');
  const [available, setAvailable] = useState({ width: 800, height: 650 });
  const base = SIZES[layout.size];
  const s = layout.orientation === 'landscape' ? { ...base, w: base.h, h: base.w } : base;
  const m = MARGINS[layout.margins].px;
  const inner = s.h - 2 * m;
  const pageGap=24, stride=s.h+pageGap;
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
  // Reserve the top and bottom margins between sheets in document coordinates.
  // Zoom only scales this layout; it must never change the number of sheets.
  useLayoutEffect(() => {
    const el=ref.current;if(!el)return;
    const originals=new Map<HTMLElement,string>();let measuring=false,frame=0;
    const restore=()=>{for(const [block,margin] of originals)block.style.marginBlockStart=margin;originals.clear();};
    if(!paged)return;
    // Layout-only styles must not be reparsed as collaborative document edits.
    const mutate=(fn:()=>void)=>{const observer=editor&&!editor.isDestroyed?(editor.view as unknown as {domObserver:{flush:()=>void;stop:()=>void;start:()=>void}}).domObserver:null;observer?.flush();observer?.stop();try{fn();}finally{observer?.start();}};
    const measure=()=>{if(measuring)return;measuring=true;mutate(()=>{restore();
      const paper=el.closest<HTMLElement>('.pg-paper');if(!paper)return;
      const scale=Number.parseFloat(getComputedStyle(paper).zoom)||1,top=paper.getBoundingClientRect().top;
      const roots=[...el.querySelectorAll<HTMLElement>('.ProseMirror > *, .cd-view > *')].filter(b=>b.getClientRects().length>0);
      const blocks=roots.flatMap(b=>b.matches('.studio-form')&&b.offsetHeight>inner?[...b.children].filter(c=>c instanceof HTMLElement) as HTMLElement[]:[b]);
      for(const block of blocks){const r=block.getBoundingClientRect(),y=(r.top-top)/scale,height=r.height/scale,page=Math.max(0,Math.floor(y/stride)),end=page*stride+s.h-m;
        const forced=block.matches('.doc-page-break,.doc-section[data-new-page]');
        if(forced||(height<=inner&&y+height>end)||y>end){const delta=(page+1)*stride+m-y;if(delta>0){originals.set(block,block.style.marginBlockStart);const margin=parseFloat(getComputedStyle(block).marginBlockStart)||0;block.style.marginBlockStart=(margin+delta)+'px';}}
      }
      const height=el.offsetHeight+2*m;setPages(Math.max(1,Math.ceil((height+pageGap)/stride)));});measuring=false;
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};measure();
    const ro=new ResizeObserver(schedule);ro.observe(el);const mo=new MutationObserver(records=>{if(records.some(r=>r.type!=='attributes'||r.attributeName!=='style'))schedule();});mo.observe(el,{subtree:true,childList:true,characterData:true});
    return()=>{cancelAnimationFrame(frame);ro.disconnect();mo.disconnect();mutate(restore);};
  },[m,inner,s.h,stride,paged,zoom,editor]);
  useEffect(() => {
    if (!paged) return;
    const st = document.createElement('style');
    const footer = [layout.footer ? JSON.stringify(layout.footer) : '', layout.pageNumbers ? 'counter(page)' : ''].filter(Boolean).join(' " · " ');
    st.textContent = `@page { size: ${s.css} ${layout.orientation}; margin: ${m / 96}in; @top-center { content: ${JSON.stringify(layout.header)}; } @bottom-center { content: ${footer || 'none'}; } }`;
    document.head.appendChild(st);
    return () => st.remove();
  }, [s.css, m, layout.orientation, paged, layout.header, layout.footer, layout.pageNumbers]);
  return (
    <div className={paged ? 'pg-desk' : undefined} ref={desk}>
      <div className={paged ? 'pg-paper' : 'pg-flow'} data-paper-theme={appearance} style={paged ? { width: s.w, minHeight: pages * s.h + (pages-1)*pageGap, padding: m, ['--pg-font' as string]: `'${layout.font}'`, ['--pg-pt' as string]: `${layout.pt}pt`, ['--pg-line-height' as string]: layout.lineSpacing, ['--pg-columns' as string]: layout.columns, zoom: zoom / 100 } : undefined}>
        {paged&&Array.from({length:pages},(_,i)=><div key={'sheet-'+i} className="pg-sheet" aria-hidden="true" style={{top:i*stride,height:s.h}}/>)}
        <div ref={ref} className={paged ? 'pg-text' : undefined}>
          {children}
        </div>
        {paged && Array.from({ length: pages - 1 }, (_, i) => (
          <span key={i} className="pg-break" style={{ top: (i + 1) * stride - pageGap }} aria-hidden="true">
            <span>Page {i + 2}</span>
          </span>
        ))}
        {paged && Array.from({ length: pages }, (_, i) => <div key={'running-' + i} className="pg-running" aria-hidden="true">
          {layout.header && <span className="pg-running-header" style={{ top: i * stride + 22, left: m, right: m }}>{layout.header}</span>}
          {(layout.footer || layout.pageNumbers) && <span className="pg-running-footer" style={{ top: i * stride + s.h - 36, left: m, right: m }}>{layout.footer}{layout.footer && layout.pageNumbers ? ' · ' : ''}{layout.pageNumbers ? i + layout.pageNumberStart : ''}</span>}
        </div>)}
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
