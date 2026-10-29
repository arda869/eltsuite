import { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorClass } from '../editor/context';
import { openMenuAt } from '../components/ContextMenu';
import { PdfStack, fromStack, toStack } from './PdfStack';
import type { PageSize } from './pdfData';
import { newMedia } from '../editor/MediaNode';

// A PDF with notes on it: text boxes that hold anything a task can (text, IPA, gaps, choices)
// and highlights. The same nodes work in a lesson and in a PDF in Files.

export type PdfTool = 'select' | 'text' | 'mark' | 'draw' | 'erase';
export const MARK_COLORS: { k: string; bg: string; label: string }[] = [
  { k: 'yellow', bg: 'rgba(255, 214, 64, .42)', label: 'Yellow' },
  { k: 'green', bg: 'rgba(110, 200, 130, .38)', label: 'Green' },
  { k: 'blue', bg: 'rgba(100, 160, 240, .34)', label: 'Blue' },
  { k: 'pink', bg: 'rgba(240, 120, 170, .34)', label: 'Pink' },
];
export const INK_COLORS: { k: string; c: string; label: string }[] = [
  { k: 'ink', c: '#23211d', label: 'Black' },
  { k: 'blue', c: '#2b4c9e', label: 'Blue' },
  { k: 'plum', c: '#7a4fa3', label: 'Purple' },
  { k: 'amber', c: '#c07a12', label: 'Amber' },
];
// A colour of its own: each person's colour (as in the document), for drawing together.
export const inkColor = (k: string) => (k.startsWith('#') ? k : INK_COLORS.find((c) => c.k === k)?.c ?? INK_COLORS[0].c);
// Questions that can go on a page, given by the editor that holds the PDF.
type QCmd = { key: string; label: string; run: (e: Editor) => void };
let QUESTIONS: QCmd[] = [];
export const setPdfQuestions = (list: QCmd[]) => void (QUESTIONS = list);
const markBg = (k: string) => MARK_COLORS.find((c) => c.k === k)?.bg ?? MARK_COLORS[0].bg;

type Store = { tool: PdfTool; color: string; ink: string; pending?: QCmd | null };
export const pdfStore = (e: Editor): Store => (e.storage as unknown as { pdfBlock: Store }).pdfBlock;
export function setPdfTool(e: Editor, tool: PdfTool, color?: string, pending?: QCmd | null) {
  const s = pdfStore(e);
  s.tool = tool;
  if (color && tool === 'draw') s.ink = color;
  else if (color) s.color = color;
  s.pending = tool === 'text' ? pending ?? null : null;
  window.dispatchEvent(new CustomEvent('ll:pdf-tool'));
}
function useTool(e: Editor) {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    window.addEventListener('ll:pdf-tool', f);
    return () => window.removeEventListener('ll:pdf-tool', f);
  }, []);
  return pdfStore(e);
}
const pagesOf = (e: Editor, pos: number): PageSize[] => {
  try {
    return (e.state.doc.resolve(pos).parent.attrs.pages as PageSize[]) ?? [];
  } catch {
    return [];
  }
};
const stackOf = (el: Element | null) => el?.closest('.pdf-stack') as HTMLElement | null;

function BlockView({ node, editor, getPos, deleteNode }: NodeViewProps) {
  const { classId } = useEditorClass();
  const store = useTool(editor);
  const pages = (node.attrs.pages as PageSize[]) ?? [];
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [line, setLine] = useState<{ page: number; pts: [number, number][]; color: string } | null>(null);
  const editable = editor.isEditable;
  const tool = editable ? store.tool : 'select';
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || tool === 'select' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.pdf-box, .pdf-mark, .pdf-tools')) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (tool === 'erase') {
      // The drawn line nearest the click, if it is within a few pixels, goes.
      const start = (getPos() ?? 0) + 1;
      let best: { pos: number; size: number; d: number } | null = null;
      node.forEach((c, off) => {
        if (c.type.name !== 'pdfInk') return;
        const at = toStack(pages, c.attrs.page, 0, 0);
        for (const [px, py] of (c.attrs.pts ?? []) as [number, number][]) {
          const x = r.left + px * r.width;
          const y = r.top + ((at.top + py * at.pageH) / 100) * r.height;
          const d = Math.hypot(x - e.clientX, y - e.clientY);
          if (!best || d < best.d) best = { pos: start + off, size: c.nodeSize, d };
        }
      });
      const hit = best as { pos: number; size: number; d: number } | null;
      if (hit && hit.d < 12) {
        e.preventDefault();
        editor.view.dispatch(editor.state.tr.delete(hit.pos, hit.pos + hit.size));
      }
      return;
    }
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    e.preventDefault();
    const end = (getPos() ?? 0) + node.nodeSize - 1;
    if (tool === 'text') {
      const at = fromStack(pages, fx, fy);
      const { schema } = editor.state;
      const box = schema.nodes.pdfBox.create({ page: at.page, x: Math.min(at.x, 0.7), y: at.y, w: store.pending?.key === 'media' ? 0.46 : 0.3, tone: 'paper' }, schema.nodes.paragraph.create());
      const tr = editor.state.tr.insert(end, box);
      tr.setSelection(TextSelection.create(tr.doc, end + 2));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      // and once more after the box is drawn, so what you type goes in it
      // The box is drawn a moment later: then put the cursor in it, so what you type goes there.
      const place = (tries = 0) => {
        const bodies = editor.view.dom.querySelectorAll('.pdf-box .pdf-box-body');
        const p = bodies[bodies.length - 1]?.querySelector('p');
        if (!p) return void (tries < 12 && window.setTimeout(() => place(tries + 1), 25));
        editor.view.focus();
        const r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      };
      window.setTimeout(place, 0);
      // A question: it goes straight into the new box.
      const q = store.pending;
      setPdfTool(editor, 'select');
      if (q) q.run(editor);
      return;
    }
    if (tool === 'draw') {
      // Free drawing: the line follows the pointer, kept in the page's own measures.
      const at0 = fromStack(pages, fx, fy);
      const pts: [number, number][] = [];
      const pageTop = toStack(pages, at0.page, 0, 0).top / 100;
      const pageH = toStack(pages, at0.page, 0, 0).pageH / 100;
      const add = (cx: number, cy: number) => pts.push([+((cx - r.left) / r.width).toFixed(4), +(((cy - r.top) / r.height - pageTop) / pageH).toFixed(4)]);
      add(e.clientX, e.clientY);
      const move = (ev: PointerEvent) => {
        add(ev.clientX, ev.clientY);
        setLine({ page: at0.page, pts: [...pts], color: store.ink });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setLine(null);
        if (pts.length < 2) return;
        editor.view.dispatch(editor.state.tr.insert(end, editor.state.schema.nodes.pdfInk.create({ page: at0.page, pts: thin(pts), color: store.ink })));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    // A highlight: drag across the page.
    const move = (ev: PointerEvent) => {
      const x2 = (ev.clientX - r.left) / r.width;
      const y2 = (ev.clientY - r.top) / r.height;
      setDraft({ x: Math.min(fx, x2), y: Math.min(fy, y2), w: Math.abs(x2 - fx), h: Math.abs(y2 - fy) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDraft(null);
      const x2 = (ev.clientX - r.left) / r.width;
      const y2 = (ev.clientY - r.top) / r.height;
      if (Math.abs(x2 - fx) < 0.01 && Math.abs(y2 - fy) < 0.003) return;
      const a = fromStack(pages, Math.min(fx, x2), Math.min(fy, y2));
      const b = fromStack(pages, Math.max(fx, x2), Math.max(fy, y2));
      const h = b.page === a.page ? b.y - a.y : 1 - a.y;
      editor.view.dispatch(editor.state.tr.insert(end, editor.state.schema.nodes.pdfMark.create({ page: a.page, x: a.x, y: a.y, w: Math.abs(b.x - a.x), h, color: store.color })));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <NodeViewWrapper className={'pdf-block' + (editable ? ' editing' : '')} data-drag-handle="">
      {editable && node.attrs.inLesson && (
        <span className="pdf-tools" contentEditable={false}>
          <b className="pdf-tools-t">{node.attrs.title || 'PDF'}</b>
          <ToolButtons editor={editor} />
          <button type="button" className="pdf-tb" onClick={() => deleteNode()} title="Remove the PDF from the task">
            Remove
          </button>
        </span>
      )}
      <PdfStack src={node.attrs.src} classId={classId} pages={pages} onDown={down} tool={tool} first={Number(node.attrs.first) || 0}>
        <NodeViewContent className="pdf-layer" />
        {line && <InkSvg pages={pages} page={line.page} pts={line.pts} color={line.color} />}
        {draft && <span className="pdf-mark draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%`, background: markBg(store.color) }} />}
      </PdfStack>
    </NodeViewWrapper>
  );
}

export const myColor = (e: Editor): string => ((e.storage as unknown as { collaborationCursor?: { user?: { color?: string } } }).collaborationCursor?.user?.color ?? '');
// The tools, with an icon, a short name and a key to press for each.
const Ic = ({ d }: { d: string }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const TOOLS: { k: PdfTool; label: string; key: string; tip: string; icon: string; hint: string }[] = [
  { k: 'select', label: 'Select', key: 'V', tip: 'Select: write in boxes, move them by their handle', icon: 'M5 3l13 8-6 1.5L9 19z', hint: '' },
  { k: 'text', label: 'Text', key: 'T', tip: 'Text box: then click on the page where it goes', icon: 'M5 6V4h14v2M12 4v16M9 20h6', hint: 'Click on the page where the text box goes.' },
  { k: 'mark', label: 'Highlight', key: 'H', tip: 'Highlight: then drag across the words', icon: 'M4 20h16M7 16l2-6 7-7 3 3-7 7-6 2zM13 6l3 3', hint: 'Drag across the words you want to highlight.' },
  { k: 'draw', label: 'Draw', key: 'D', tip: 'Draw freely on the page', icon: 'M4 20c3-1 4-4 6-7s4-7 7-8c2-1 3 1 2 3-2 4-8 6-11 9-1.5 1.5-2 3-4 3z', hint: 'Draw on the page with the mouse, a pen or your finger.' },
  { k: 'erase', label: 'Eraser', key: 'E', tip: 'Eraser: click a drawn line to remove it', icon: 'M8 20h12M4.5 15.5l9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3L13 19H8.5z', hint: 'Click a line you drew to rub it out.' },
];
export const toolHint = (e: Editor) => {
  const s = pdfStore(e);
  if (s.pending) return `Click on the page where the ${s.pending.label.toLowerCase()} goes.`;
  return TOOLS.find((t) => t.k === s.tool)?.hint ?? '';
};
export const usePdfTool = useTool;
const RECORDING: QCmd = { key: 'media', label: 'Recording', run: (e) => void e.chain().focus().insertContent(newMedia()).run() };

export function ToolButtons({ editor, options = true, labels = true }: { editor: Editor; options?: boolean; labels?: boolean }) {
  const store = useTool(editor);
  return (
    <span className="pdf-tool-seg" role="radiogroup" aria-label="Tool">
      {TOOLS.map((t) => (
        <button key={t.k} type="button" role="radio" aria-checked={store.tool === t.k && !store.pending} aria-keyshortcuts={t.key} aria-label={t.label} className={'pdf-tb' + (store.tool === t.k && !store.pending ? ' on' : '')} data-tip={`${t.tip} (${t.key})`} onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, t.k)}>
          <Ic d={t.icon} />
          {labels && <span className="pdf-tb-l">{t.label}</span>}
        </button>
      ))}
      {QUESTIONS.length > 0 && (
        <button type="button" className={'pdf-tb q' + (store.pending ? ' on' : '')} aria-haspopup="menu" aria-label={store.pending ? store.pending.label : 'Question'} data-tip="A question on the page: choose one, then click where it goes" onMouseDown={(e) => e.preventDefault()} onClick={(e) => openMenuAt(e.currentTarget, QUESTIONS.map((q) => ({ label: q.label, icon: '', onClick: () => setPdfTool(editor, 'text', undefined, q) })))}>
          <Ic d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
          {labels && <span className="pdf-tb-l">{store.pending ? store.pending.label : 'Question'}</span>}
          <span className="pdf-tb-caret" aria-hidden="true">▾</span>
        </button>
      )}
      {!!editor.schema.nodes.media && (
        <button type="button" className={'pdf-tb' + (store.pending?.key === 'media' ? ' on' : '')} aria-label="Recording" data-tip="A recording or video on the page: then click where it goes" onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, 'text', undefined, RECORDING)}>
          <Ic d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          {labels && <span className="pdf-tb-l">Recording</span>}
        </button>
      )}
      {options && <ToolOptions editor={editor} />}
    </span>
  );
}

// The colours of the tool in use: highlighter or pen.
export function ToolOptions({ editor }: { editor: Editor }) {
  const store = useTool(editor);
  if (store.tool === 'mark' && !store.pending)
    return (
      <span className="pdf-opts" role="radiogroup" aria-label="Highlighter colour">
        {MARK_COLORS.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={store.color === c.k} className={'pdf-sw' + (store.color === c.k ? ' on' : '')} style={{ background: c.bg.replace(/[\d.]+\)$/, '.85)') }} aria-label={c.label} data-tip={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, 'mark', c.k)} />
        ))}
      </span>
    );
  if (store.tool === 'draw')
    return (
      <span className="pdf-opts" role="radiogroup" aria-label="Pen colour">
        {myColor(editor) && (
          <button type="button" role="radio" aria-checked={store.ink === myColor(editor)} className={'pdf-sw ink mine' + (store.ink === myColor(editor) ? ' on' : '')} style={{ background: myColor(editor), color: myColor(editor) }} aria-label="My colour" data-tip="My colour: everyone sees who drew what" onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, 'draw', myColor(editor))} />
        )}
        {INK_COLORS.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={(store.ink ?? 'ink') === c.k} className={'pdf-sw ink' + ((store.ink ?? 'ink') === c.k ? ' on' : '')} style={{ background: c.c }} aria-label={c.label} data-tip={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, 'draw', c.k)} />
        ))}
      </span>
    );
  return null;
}

function BoxView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pages = pagesOf(editor, getPos() ?? 0);
  const a = node.attrs as { page: number; x: number; y: number; w: number; tone: string; key?: boolean };
  const at = toStack(pages, a.page, a.x, a.y);
  const editable = editor.isEditable;
  const drag = (mode: 'move' | 'size') => (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const st = stackOf(ref.current);
    if (!st) return;
    const r = st.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = { left: (at.left / 100) * r.width, top: (at.top / 100) * r.height, w: a.w };
    const move = (ev: PointerEvent) => {
      if (mode === 'size') return updateAttributes({ w: Math.max(0.08, Math.min(1 - a.x, start.w + (ev.clientX - x0) / r.width)) });
      const p = fromStack(pages, (start.left + ev.clientX - x0) / r.width, (start.top + ev.clientY - y0) / r.height);
      updateAttributes({ page: p.page, x: Math.min(p.x, 1 - a.w), y: p.y });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <NodeViewWrapper ref={ref} className={'pdf-box tone-' + (a.tone || 'paper') + (a.key ? ' is-key' : '') + (selected ? ' on' : '')} style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${a.w * 100}%` }}>
      {editable && (
        <span className="pdf-box-bar" contentEditable={false}>
          <span className="pdf-grip" onPointerDown={drag('move')} data-tip="Drag to move" aria-label="Move">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>
          </span>
          <span className="pdf-bar-sep" />
          <span className="pdf-tones" role="radiogroup" aria-label="Look">
            {(['paper', 'note', 'clear'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={(a.tone || 'paper') === t} className={'pdf-tone t-' + t + ((a.tone || 'paper') === t ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => updateAttributes({ tone: t })} aria-label={t === 'paper' ? 'White box' : t === 'note' ? 'Sticky note' : 'Just the text'} data-tip={t === 'paper' ? 'White box' : t === 'note' ? 'Sticky note' : 'Just the text, no box'} />
            ))}
          </span>
          <span className="pdf-bar-sep" />
          <button type="button" className={'pdf-keybtn' + (a.key ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => updateAttributes({ key: !a.key })} aria-pressed={!!a.key} data-tip={a.key ? 'Only teachers see this box. Press to show it to everyone' : 'Make it part of the answer key: only teachers see it'}>
            Answer key
          </button>
          <button type="button" className="pdf-x" onMouseDown={(e) => e.preventDefault()} onClick={() => deleteNode()} aria-label="Delete the box" data-tip="Delete the box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5" /></svg>
          </button>
        </span>
      )}
      {a.key && <span className="pdf-keytag" contentEditable={false}>Answer key · teachers only</span>}
      <NodeViewContent className="pdf-box-body" />
      {editable && <span className="pdf-size" onPointerDown={drag('size')} contentEditable={false} title="Drag to change the width" />}
    </NodeViewWrapper>
  );
}

function MarkView({ node, editor, getPos, deleteNode, selected }: NodeViewProps) {
  const pages = pagesOf(editor, getPos() ?? 0);
  const a = node.attrs as { page: number; x: number; y: number; w: number; h: number; color: string };
  const at = toStack(pages, a.page, a.x, a.y);
  return (
    <NodeViewWrapper className={'pdf-mark' + (selected ? ' on' : '')} style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${a.w * 100}%`, height: `${a.h * at.pageH}%`, background: markBg(a.color) }}>
      {selected && editor.isEditable && (
        <button type="button" className="pdf-x" onClick={() => deleteNode()} aria-label="Remove the highlight">
          ×
        </button>
      )}
    </NodeViewWrapper>
  );
}

export const PdfBlock = Node.create({
  name: 'pdfBlock',
  group: 'block',
  content: '(pdfBox | pdfMark | pdfInk)*',
  isolating: true,
  draggable: false,
  // Clicking a page never selects the whole PDF (which would light up every word on it).
  selectable: false,
  addStorage: () => ({ tool: 'select' as PdfTool, color: 'yellow', ink: 'ink', pending: null }),
  addAttributes: () => ({
    src: { default: '' }, // "file:<id>" in Files, "media:<id>" in a class
    pages: { default: [] },
    title: { default: '' },
    from: { default: '' }, // the file it was copied from
    inLesson: { default: false },
    first: { default: 0 }, // the first page of the PDF shown here (a lesson can take a few pages)
    units: { default: [] }, // a coursebook's units: { name, from, to }, pages counted from 1
  }),
  parseHTML: () => [{ tag: 'div[data-pdf]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-pdf': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(BlockView),
});

export const PdfBox = Node.create({
  name: 'pdfBox',
  content: 'block+',
  isolating: true,
  defining: true,
  addAttributes: () => ({ page: { default: 0 }, x: { default: 0.1 }, y: { default: 0.1 }, w: { default: 0.3 }, tone: { default: 'paper' }, key: { default: false } }),
  parseHTML: () => [{ tag: 'div[data-pdfbox]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-pdfbox': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(BoxView),
});

export const PdfMark = Node.create({
  name: 'pdfMark',
  atom: true,
  selectable: true,
  addAttributes: () => ({ page: { default: 0 }, x: { default: 0 }, y: { default: 0 }, w: { default: 0.2 }, h: { default: 0.02 }, color: { default: 'yellow' } }),
  parseHTML: () => [{ tag: 'span[data-pdfmark]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-pdfmark': '' })],
  addNodeView: () => ReactNodeViewRenderer(MarkView),
});

// Fewer points, the same line: every point closer than a hair to the last one goes.
function thin(pts: [number, number][]) {
  const out: [number, number][] = [pts[0]];
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], (p[1] - q[1]) * 1.4) > 0.002) out.push(p);
  }
  return out;
}
const pathOf = (pts: [number, number][]) => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join('');
// A drawn line, over its page.
export function InkSvg({ pages, page, pts, color, onErase }: { pages: PageSize[]; page: number; pts: [number, number][]; color: string; onErase?: () => void }) {
  const at = toStack(pages, page, 0, 0);
  return (
    <svg className={'pdf-ink' + (onErase ? ' erasable' : '')} style={{ top: `${at.top}%`, height: `${at.pageH}%` }} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {onErase && <path d={pathOf(pts)} className="hit" onPointerDown={(e) => (e.preventDefault(), e.stopPropagation(), onErase())} />}
      <path d={pathOf(pts)} stroke={inkColor(color)} />
    </svg>
  );
}
function InkView({ node, editor, getPos, deleteNode }: NodeViewProps) {
  const store = useTool(editor);
  const pages = pagesOf(editor, getPos() ?? 0);
  const a = node.attrs as { page: number; pts: [number, number][]; color: string };
  return (
    <NodeViewWrapper as="span" className="pdf-ink-node" contentEditable={false}>
      <InkSvg pages={pages} page={a.page} pts={a.pts ?? []} color={a.color} onErase={editor.isEditable && store.tool === 'erase' ? () => deleteNode() : undefined} />
    </NodeViewWrapper>
  );
}
export const PdfInk = Node.create({
  name: 'pdfInk',
  atom: true,
  selectable: false,
  addAttributes: () => ({ page: { default: 0 }, pts: { default: [] }, color: { default: 'ink' } }),
  parseHTML: () => [{ tag: 'span[data-pdfink]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes({ 'data-pdfink': '' }, { 'data-page': HTMLAttributes.page })],
  addNodeView: () => ReactNodeViewRenderer(InkView),
});

export const PDF_NODES = [PdfBlock, PdfBox, PdfMark, PdfInk];
