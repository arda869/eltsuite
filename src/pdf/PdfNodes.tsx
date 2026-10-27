import { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorClass } from '../editor/context';
import { PdfStack, fromStack, toStack } from './PdfStack';
import type { PageSize } from './pdfData';

// A PDF with notes on it: text boxes that hold anything a task can (text, IPA, gaps, choices)
// and highlights. The same nodes work in a lesson and in a PDF in Files.

export type PdfTool = 'select' | 'text' | 'mark';
export const MARK_COLORS: { k: string; bg: string; label: string }[] = [
  { k: 'yellow', bg: 'rgba(255, 214, 64, .42)', label: 'Yellow' },
  { k: 'green', bg: 'rgba(110, 200, 130, .38)', label: 'Green' },
  { k: 'blue', bg: 'rgba(100, 160, 240, .34)', label: 'Blue' },
  { k: 'pink', bg: 'rgba(240, 120, 170, .34)', label: 'Pink' },
];
const markBg = (k: string) => MARK_COLORS.find((c) => c.k === k)?.bg ?? MARK_COLORS[0].bg;

type Store = { tool: PdfTool; color: string };
export const pdfStore = (e: Editor): Store => (e.storage as unknown as { pdfBlock: Store }).pdfBlock;
export function setPdfTool(e: Editor, tool: PdfTool, color?: string) {
  const s = pdfStore(e);
  s.tool = tool;
  if (color) s.color = color;
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
  const editable = editor.isEditable;
  const tool = editable ? store.tool : 'select';
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || tool === 'select' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.pdf-box, .pdf-mark, .pdf-tools')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    e.preventDefault();
    const end = (getPos() ?? 0) + node.nodeSize - 1;
    if (tool === 'text') {
      const at = fromStack(pages, fx, fy);
      const { schema } = editor.state;
      const box = schema.nodes.pdfBox.create({ page: at.page, x: Math.min(at.x, 0.7), y: at.y, w: 0.3, tone: 'paper' }, schema.nodes.paragraph.create());
      const tr = editor.state.tr.insert(end, box);
      tr.setSelection(TextSelection.create(tr.doc, end + 2));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      setPdfTool(editor, 'select');
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
      <PdfStack src={node.attrs.src} classId={classId} pages={pages} onDown={down} tool={tool}>
        <NodeViewContent className="pdf-layer" />
        {draft && <span className="pdf-mark draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%`, background: markBg(store.color) }} />}
      </PdfStack>
    </NodeViewWrapper>
  );
}

export function ToolButtons({ editor }: { editor: Editor }) {
  const store = useTool(editor);
  return (
    <span className="pdf-tool-seg" role="radiogroup" aria-label="Tool">
      {(
        [
          ['select', 'Select', 'Click and type in boxes, move them by their handle'],
          ['text', '+ Text box', 'Then click on the page where it goes'],
          ['mark', 'Highlight', 'Then drag across the page'],
        ] as const
      ).map(([k, l, tip]) => (
        <button key={k} type="button" role="radio" aria-checked={store.tool === k} className={'pdf-tb' + (store.tool === k ? ' on' : '')} data-tip={tip} onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, k)}>
          {l}
        </button>
      ))}
      {store.tool === 'mark' &&
        MARK_COLORS.map((c) => (
          <button key={c.k} type="button" className={'pdf-sw' + (store.color === c.k ? ' on' : '')} style={{ background: c.bg }} aria-label={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => setPdfTool(editor, 'mark', c.k)} />
        ))}
    </span>
  );
}

function BoxView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pages = pagesOf(editor, getPos() ?? 0);
  const a = node.attrs as { page: number; x: number; y: number; w: number; tone: string };
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
    <NodeViewWrapper ref={ref} className={'pdf-box tone-' + (a.tone || 'paper') + (selected ? ' on' : '')} style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${a.w * 100}%` }}>
      {editable && (
        <span className="pdf-box-bar" contentEditable={false}>
          <span className="pdf-grip" onPointerDown={drag('move')} title="Drag to move" aria-label="Move">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.1" /><circle cx="9" cy="3" r="1.1" /><circle cx="3" cy="9" r="1.1" /><circle cx="9" cy="9" r="1.1" /><circle cx="6" cy="6" r="1.1" /></g></svg>
          </span>
          {(['paper', 'note', 'clear'] as const).map((t) => (
            <button key={t} type="button" className={'pdf-tone t-' + t + (a.tone === t ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => updateAttributes({ tone: t })} aria-label={t === 'paper' ? 'White box' : t === 'note' ? 'Sticky note' : 'No box'} title={t === 'paper' ? 'White box' : t === 'note' ? 'Sticky note' : 'Just the text'} />
          ))}
          <button type="button" className="pdf-x" onMouseDown={(e) => e.preventDefault()} onClick={() => deleteNode()} aria-label="Delete the box" title="Delete the box">
            ×
          </button>
        </span>
      )}
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
  content: '(pdfBox | pdfMark)*',
  isolating: true,
  draggable: false,
  addStorage: () => ({ tool: 'select' as PdfTool, color: 'yellow' }),
  addAttributes: () => ({
    src: { default: '' }, // "file:<id>" in Files, "media:<id>" in a class
    pages: { default: [] },
    title: { default: '' },
    from: { default: '' }, // the file it was copied from
    inLesson: { default: false },
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
  addAttributes: () => ({ page: { default: 0 }, x: { default: 0.1 }, y: { default: 0.1 }, w: { default: 0.3 }, tone: { default: 'paper' } }),
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

export const PDF_NODES = [PdfBlock, PdfBox, PdfMark];
