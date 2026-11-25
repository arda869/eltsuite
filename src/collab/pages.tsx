import { NSelect } from '../components/Select';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Mark, mergeAttributes, type Editor } from '@tiptap/react';
import type * as Y from 'yjs';
import { useDismiss } from '../lib/useDismiss';

// A Collab document opens pageless, or can use one long pageless canvas,
// like Word: a page size, margins, a font for the whole document, and fonts and sizes for any
// text. The setting is part of the shared document, so everyone writing in it sees the same pages.
// Switching layout preserves the document's text formatting.

import { LAYOUT_DEFAULT, SIZES, type Layout } from './documentLayout';
export { LAYOUT_DEFAULT, SIZES, MARGINS, type Layout } from './documentLayout';
import { footerSlots, marginBoxesCss, marginsOf, runningOf, RUN_FIELDS, type Align } from './documentLayout';
import { PageSetupDialog } from './PageSetup';
import { Ruler } from './Ruler';

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
        {open && <PageSetupDialog layout={layout} onApply={setLayout} onClose={() => setOpen(false)} />}
      </span>}
    </>
  );
}

// A paged document: white sheets of the chosen size, with a line and a page number where each
// page ends, and the same page size and margins when printed.
export function Paper({ layout, children, appearance = 'auto', paged = layout.paged, editor, ruler = false, onMargins, onRunning, title = '' }: { title?: string; editor?:Editor; layout: Layout; children: ReactNode; appearance?: 'auto' | 'white' | 'black'; paged?: boolean; ruler?: boolean; onMargins?: (m: import('./documentLayout').PageMargins) => void; onRunning?: (p: Partial<Layout>) => void }) {
  const [running, setRunning] = useState<{ page: number; part: 'header' | 'footer' } | null>(null);
  // The organisation's logo (or ELT Suite's) in the header, when chosen.
  const [logo, setLogo] = useState('');
  useEffect(() => { if (!layout.runLogo) return; let on = true; void import('../lib/brand').then((m) => m.brandMark()).then((b) => on && setLogo(b.dataUrl)).catch(() => {}); return () => { on = false; }; }, [layout.runLogo]);
  const runFont: React.CSSProperties = { fontWeight: layout.runBold ? 700 : undefined, fontStyle: layout.runItalic ? 'italic' : undefined };
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const desk = useRef<HTMLDivElement>(null);
  // Pages open as wide as the space allows (up to 125%), so the page fills the window.
  const [zoomChoice, setZoomChoice] = useState('fill');
  const [available, setAvailable] = useState({ width: 800, height: 650 });
  const base = SIZES[layout.size];
  const s = layout.orientation === 'landscape' ? { ...base, w: base.h, h: base.w } : base;
  const mg = marginsOf(layout);
  const m = mg.top;
  const inner = s.h - mg.top - mg.bottom;
  const pageGap=24, stride=s.h+pageGap;
  const fitWidth = available.width / s.w;
  const scale = zoomChoice === 'fit' ? Math.min(fitWidth, available.height / s.h) : zoomChoice === 'fill' ? Math.min(1.25, fitWidth) : Number(zoomChoice) / 100;
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
      for(const block of blocks){const r=block.getBoundingClientRect(),y=(r.top-top)/scale,height=r.height/scale,page=Math.max(0,Math.floor(y/stride)),end=page*stride+s.h-mg.bottom;
        const forced=block.matches('.doc-page-break,.doc-section[data-new-page]');
        if(forced||(height<=inner&&y+height>end)||y>end){const delta=(page+1)*stride+m-y;if(delta>0){originals.set(block,block.style.marginBlockStart);const margin=parseFloat(getComputedStyle(block).marginBlockStart)||0;block.style.marginBlockStart=(margin+delta)+'px';}}
      }
      const height=el.offsetHeight+mg.top+mg.bottom;setPages(Math.max(1,Math.ceil((height+pageGap)/stride)));});measuring=false;
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};measure();
    const ro=new ResizeObserver(schedule);ro.observe(el);const mo=new MutationObserver(records=>{if(records.some(r=>r.type!=='attributes'||r.attributeName!=='style'))schedule();});mo.observe(el,{subtree:true,childList:true,characterData:true});
    return()=>{cancelAnimationFrame(frame);ro.disconnect();mo.disconnect();mutate(restore);};
  },[m,mg.bottom,inner,s.h,stride,paged,zoom,editor]);
  useEffect(() => {
    if (!paged) return;
    const st = document.createElement('style');
    st.textContent = `@page { size: ${s.css} ${layout.orientation}; margin: ${mg.top / 96}in ${mg.right / 96}in ${mg.bottom / 96}in ${mg.left / 96}in; } ${marginBoxesCss(layout)}`;
    document.head.appendChild(st);
    return () => st.remove();
  }, [s.css, m, mg.left, mg.right, mg.bottom, layout.orientation, paged, layout.header, layout.footer, layout.pageNumbers, layout.firstDifferent, layout.headerFirst, layout.footerFirst, layout.numberStyle, layout.numberAlign]);
  return (
    <div className={paged ? 'pg-desk' : undefined} ref={desk}>
      <div className={paged ? 'pg-column' : 'pg-flow-column'}>
      {paged && ruler && <Ruler width={s.w} zoom={zoom} margins={mg} onChange={(m2) => onMargins?.(m2)} canEdit={!!onMargins} />}
      <div className={paged ? 'pg-paper' : 'pg-flow'} data-paper-theme={appearance} style={paged ? { width: s.w, minHeight: pages * s.h + (pages-1)*pageGap, padding: `${mg.top}px ${mg.right}px ${mg.bottom}px ${mg.left}px`, ...(layout.pageColour && appearance !== 'black' ? { ['--pg-page-colour' as string]: layout.pageColour } : {}), ['--pg-font' as string]: `'${layout.font}'`, ['--pg-pt' as string]: `${layout.pt}pt`, ['--pg-line-height' as string]: layout.lineSpacing, ['--pg-columns' as string]: layout.columns, zoom: zoom / 100 } : undefined}>
        {paged&&Array.from({length:pages},(_,i)=><div key={'sheet-'+i} className="pg-sheet" aria-hidden="true" style={{top:i*stride,height:s.h}}/>)}
        <div ref={ref} className={paged ? 'pg-text' : undefined}>
          {children}
        </div>
        {paged && Array.from({ length: pages - 1 }, (_, i) => (
          <span key={i} className="pg-break" style={{ top: (i + 1) * stride - pageGap }} aria-hidden="true">
            <span>Page {i + 2}</span>
          </span>
        ))}
        {paged && Array.from({ length: pages }, (_, i) => {
          const r = runningOf(layout, i, pages, { title });
          const first = i === 0 && !!layout.firstDifferent;
          const edit = (part: 'header' | 'footer') => onRunning && setRunning({ page: i, part });
          const foot = footerSlots(r);
          const logoAt = r.headerAlign === 'right' ? 'l' : 'r';
          return (
            <div key={'running-' + i} className="pg-running">
              {/* Double-click the top or bottom margin to write the header or footer there. */}
              <span className={'pg-run-zone top' + (onRunning ? ' editable' : '')} style={{ top: i * stride, height: mg.top, left: 0, right: 0 }} onDoubleClick={() => edit('header')} title={onRunning ? 'Double-click to edit the header' : undefined} />
              <span className={'pg-run-zone bottom' + (onRunning ? ' editable' : '')} style={{ top: i * stride + s.h - mg.bottom, height: mg.bottom, left: 0, right: 0 }} onDoubleClick={() => edit('footer')} title={onRunning ? 'Double-click to edit the footer' : undefined} />
              {(r.header || (layout.runLogo && logo)) && (
                <span className="pg-running-header pg-run-row" aria-hidden="true" style={{ ...runFont, top: i * stride + Math.max(12, mg.top / 2 - 11), left: mg.left, right: mg.right }}>
                  {(['left', 'center', 'right'] as const).map((side) => (
                    <span key={side} className={side[0]}>
                      {r.headerAlign === side ? r.header : ''}
                      {layout.runLogo && logo && side[0] === logoAt && <img className="pg-run-logo" src={logo} alt="" />}
                    </span>
                  ))}
                </span>
              )}
              {(r.footer || r.number) && (
                <span className="pg-running-footer pg-run-row" aria-hidden="true" style={{ ...runFont, top: i * stride + s.h - Math.max(26, mg.bottom / 2 + 9), left: mg.left, right: mg.right }}>
                  <span className="l">{foot.left}</span>
                  <span className="c">{foot.center}</span>
                  <span className="r">{foot.right}</span>
                </span>
              )}
              {running?.page === i && onRunning && (
                <RunningEditor
                  layout={layout}
                  part={running.part}
                  first={first}
                  style={{ top: running.part === 'header' ? i * stride + 8 : i * stride + s.h - mg.bottom + 4, left: Math.max(8, mg.left - 8), right: Math.max(8, mg.right - 8) }}
                  onChange={onRunning}
                  onClose={() => setRunning(null)}
                />
              )}
            </div>
          );
        })}
      </div>
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

// Writing a header or footer on the page, with its options.
function RunningEditor({ layout, part, first, style, onChange, onClose }: { layout: Layout; part: 'header' | 'footer'; first: boolean; style: React.CSSProperties; onChange: (p: Partial<Layout>) => void; onClose: () => void }) {
  const key = (first ? (part === 'header' ? 'headerFirst' : 'footerFirst') : part) as 'header' | 'footer' | 'headerFirst' | 'footerFirst';
  const alignKey = part === 'header' ? 'headerAlign' : 'footerAlign';
  const [text, setText] = useState(String(layout[key] ?? ''));
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as globalThis.Node) && !(e.target as HTMLElement).closest?.('.sel-list') && save();
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  });
  const save = () => { if (text !== String(layout[key] ?? '')) onChange({ [key]: text.slice(0, 160) }); onClose(); };
  // A field goes in where the cursor is.
  const addField = (f: string) => {
    const el = input.current;
    const at = el?.selectionStart ?? text.length, to = el?.selectionEnd ?? at;
    const next = (text.slice(0, at) + f + text.slice(to)).slice(0, 160);
    setText(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + f.length, at + f.length); });
  };
  const label = `${first ? 'First page ' : ''}${part}`;
  const align = (layout[alignKey] ?? 'center') as Align;
  const icon = (a: Align) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{a === 'left' ? <path d="M4 6h16M4 10h10M4 14h16M4 18h10" /> : a === 'center' ? <path d="M4 6h16M7 10h10M4 14h16M7 18h10" /> : <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />}</svg>;
  return (
    <div ref={box} className="pg-run-edit" style={style} role="group" aria-label={`Edit the ${label}`} onMouseDown={(e) => e.stopPropagation()}>
      <span className="pg-run-line">
        <input ref={input} autoFocus className="pg-run-input" value={text} maxLength={160} placeholder={part === 'header' ? 'Header, for example: {title} · Unit 4' : 'Footer, for example: {date}'} aria-label={label} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }} style={{ fontWeight: layout.runBold ? 700 : undefined, fontStyle: layout.runItalic ? 'italic' : undefined }} />
        <NSelect className="pg-run-sel" aria-label="Add a field" value="" onChange={(e) => e.target.value && addField(e.target.value)}>
          <option value="">Add a field…</option>
          {RUN_FIELDS.map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}
        </NSelect>
      </span>
      <span className="pg-run-opts">
        <span className="pg-run-seg" role="group" aria-label={`Place the ${part}`}>
          {(['left', 'center', 'right'] as const).map((a) => <button key={a} type="button" className={'pg-run-ic' + (align === a ? ' on' : '')} aria-pressed={align === a} aria-label={a === 'center' ? 'Centre' : a[0].toUpperCase() + a.slice(1)} data-tip={a === 'center' ? 'Centre' : a[0].toUpperCase() + a.slice(1)} onClick={() => onChange({ [alignKey]: a })}>{icon(a)}</button>)}
        </span>
        <span className="pg-run-seg" role="group" aria-label="Text style">
          <button type="button" className={'pg-run-ic' + (layout.runBold ? ' on' : '')} aria-pressed={!!layout.runBold} aria-label="Bold" data-tip="Bold" onClick={() => onChange({ runBold: !layout.runBold })}><b>B</b></button>
          <button type="button" className={'pg-run-ic' + (layout.runItalic ? ' on' : '')} aria-pressed={!!layout.runItalic} aria-label="Italic" data-tip="Italic" onClick={() => onChange({ runItalic: !layout.runItalic })}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></button>
        </span>
        {part === 'header' && <label className="pg-run-check"><input type="checkbox" checked={!!layout.runLogo} onChange={(e) => onChange({ runLogo: e.target.checked })} />Logo</label>}
        <label className="pg-run-check"><input type="checkbox" checked={!!layout.firstDifferent} onChange={(e) => onChange({ firstDifferent: e.target.checked })} />Different first page</label>
        <NSelect className="pg-run-sel" aria-label="Page numbers" value={layout.pageNumbers ? layout.numberStyle ?? 'n' : 'off'} onChange={(e) => onChange(e.target.value === 'off' ? { pageNumbers: false } : { pageNumbers: true, numberStyle: e.target.value as 'n' | 'page' | 'of' })}>
          <option value="off">No page numbers</option>
          <option value="n">3</option>
          <option value="page">Page 3</option>
          <option value="of">3 of 8</option>
        </NSelect>
        {layout.pageNumbers && (
          <>
            <NSelect className="pg-run-sel" aria-label="Page number position" value={layout.numberAlign ?? 'center'} onChange={(e) => onChange({ numberAlign: e.target.value as Align })}>
              <option value="left">Number on the left</option>
              <option value="center">Number in the centre</option>
              <option value="right">Number on the right</option>
            </NSelect>
            <label className="pg-run-check">Start at<input type="number" className="pg-run-num" min={0} max={999} value={layout.pageNumberStart || 1} onChange={(e) => onChange({ pageNumberStart: Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) })} aria-label="First page number" /></label>
          </>
        )}
        <button type="button" className="btn small-btn primary" onClick={save}>Done</button>
      </span>
    </div>
  );
}
