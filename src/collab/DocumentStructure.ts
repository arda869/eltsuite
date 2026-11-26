import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

export const PageBreak = Node.create({
  name: 'docPageBreak', group: 'block', atom: true, selectable: true,
  parseHTML: () => [{ tag: 'div[data-doc-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-doc-page-break': '', class: 'doc-page-break', role: 'separator', 'aria-label': 'Page break' }), ['span', { contenteditable: 'false' }, 'Page break']],
});
export const DocumentSection = Node.create({
  name: 'docSection', group: 'block', content: 'block+', defining: true, isolating: true,
  addAttributes: () => ({ columns: { default: 1, parseHTML: (el) => Number(el.getAttribute('data-columns')) || 1 }, newPage: { default: true, parseHTML: (el) => el.hasAttribute('data-new-page') }, orientation: { default: null, parseHTML: (el) => el.getAttribute('data-orient') || null } }),
  parseHTML: () => [{ tag: 'section[data-doc-section]' }],
  renderHTML: ({ HTMLAttributes }) => {
    const columns = Math.min(3, Math.max(1, Number(HTMLAttributes.columns) || 1));
    // A section can turn its pages: printed and in Word they are landscape (or portrait); on screen a label says so.
    return ['section', { 'data-doc-section': '', 'data-columns': columns, ...(HTMLAttributes.newPage ? { 'data-new-page': '' } : {}), ...(HTMLAttributes.orientation ? { 'data-orient': HTMLAttributes.orientation } : {}), class: 'doc-section', style: `column-count:${columns};column-gap:24px;column-span:all` }, 0];
  },
});

// A paragraph's indents in px (96 per inch): the left edge, the first line (negative for a hanging
// indent) and the right edge. Older documents keep a step count (indent, 1.27 cm each).
export const INDENT_STEP = 48;
export type Indents = { left: number; first: number; right: number };
const px = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-400, Math.min(800, Math.round(v))) : null);
export function indentsOf(a: Record<string, unknown> | undefined): Indents {
  return { left: px(a?.indentPx) ?? Math.max(0, Math.min(8, Number(a?.indent) || 0)) * INDENT_STEP, first: px(a?.firstLine) ?? 0, right: px(a?.indentRight) ?? 0 };
}
export function indentCss(a: Record<string, unknown> | undefined) {
  const i = indentsOf(a);
  return [i.left ? `margin-inline-start:${i.left}px` : '', i.first ? `text-indent:${i.first}px` : '', i.right ? `margin-inline-end:${i.right}px` : ''].filter(Boolean).join(';');
}
// The tab stops: the ones set on the ruler, then every 1.27 cm.
export function nextStop(x: number, tabs: number[] = [], back = false) {
  const set = [...tabs].sort((p, q) => p - q);
  // As in a word processor, the 1.27 cm stops only count after the last stop you set.
  const last = set.length ? set[set.length - 1] : -1;
  if (back) {
    const prev = [...set].reverse().find((t) => t < x - 1) ?? 0;
    const grid = Math.max(0, Math.ceil(x / INDENT_STEP) - 1) * INDENT_STEP;
    return grid > last && grid < x ? Math.max(prev, grid) : prev;
  }
  const next = set.find((t) => t > x + 1);
  return next ?? (Math.floor(x / INDENT_STEP) + 1) * INDENT_STEP;
}
// Set the indents of every paragraph in the selection.
export function setIndents(editor: Editor, change: (i: Indents) => Partial<Indents>) {
  const { from, to } = editor.state.selection;
  const tr = editor.state.tr;
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;
    const cur = indentsOf(node.attrs);
    const n = { ...cur, ...change(cur) };
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: 0, indentPx: Math.max(0, n.left), firstLine: n.first || null, indentRight: Math.max(0, n.right) || null });
  });
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  return true;
}

export function changeIndent(editor: Editor, direction: number): boolean {
  if (editor.isActive('listItem')) return (direction > 0 ? editor.chain().focus().sinkListItem('listItem') : editor.chain().focus().liftListItem('listItem')).run();
  if (editor.isActive('taskItem')) return (direction > 0 ? editor.chain().focus().sinkListItem('taskItem') : editor.chain().focus().liftListItem('taskItem')).run();
  // The left edge moves to the next tab stop (or back to the one before).
  const tabs = (editor.storage as { documentIndent?: { tabs?: number[] } }).documentIndent?.tabs ?? [];
  return setIndents(editor, (i) => ({ left: nextStop(i.left, tabs, direction < 0) }));
}

// A tab in the text: it reaches to the next tab stop, measured on the page (see TabStops.ts).
export const DocTab = Node.create({
  name: 'docTab', group: 'inline', inline: true, atom: true, selectable: false,
  parseHTML: () => [{ tag: 'span[data-doc-tab]' }],
  renderHTML: () => ['span', { 'data-doc-tab': '', class: 'doc-tab' }, '\t'],
  renderText: () => '\t',
  addNodeView: () => () => {
    const dom = document.createElement('span');
    dom.className = 'doc-tab';
    dom.setAttribute('data-doc-tab', '');
    dom.contentEditable = 'false';
    dom.textContent = '\u200b';
    return { dom, ignoreMutation: () => true };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({ view: (view) => {
      let frame = 0;
      const tabsOf = () => (editor.storage as { documentIndent?: { tabs?: number[] } }).documentIndent?.tabs ?? [];
      const lay = () => {
        const spans = [...view.dom.querySelectorAll<HTMLElement>('span.doc-tab')];
        if (!spans.length) return;
        const box = view.dom.getBoundingClientRect();
        const scale = view.dom.offsetWidth ? box.width / view.dom.offsetWidth : 1;
        const origin = box.left + (parseFloat(getComputedStyle(view.dom).paddingLeft) || 0) * scale;
        for (const sp of spans) sp.style.width = '0px';
        // One at a time, in order: each tab moves what comes after it on its line.
        for (const sp of spans) {
          const x = (sp.getBoundingClientRect().left - origin) / scale;
          sp.style.width = Math.max(4, nextStop(x, tabsOf()) - x) + 'px';
        }
      };
      const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(lay); };
      const ro = new ResizeObserver(schedule);
      ro.observe(view.dom);
      window.addEventListener('doc-tabs-changed', schedule);
      schedule();
      return { update: schedule, destroy: () => { cancelAnimationFrame(frame); ro.disconnect(); window.removeEventListener('doc-tabs-changed', schedule); } };
    } })];
  },
});

export const DocumentIndent = Extension.create({
  name: 'documentIndent',
  addStorage: () => ({ tabs: [] as number[] }),
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading'],
    attributes: {
      indent: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
        renderHTML: (a) => { const css = indentCss(a); return css ? { ...(a.indent ? { 'data-indent': a.indent } : {}), style: css } : {}; },
      },
      indentPx: { default: null, parseHTML: (el) => (el.hasAttribute('data-indent-px') ? Number(el.getAttribute('data-indent-px')) : null), renderHTML: (a) => (a.indentPx != null ? { 'data-indent-px': a.indentPx } : {}) },
      firstLine: { default: null, parseHTML: (el) => (el.hasAttribute('data-first-line') ? Number(el.getAttribute('data-first-line')) : null), renderHTML: (a) => (a.firstLine != null ? { 'data-first-line': a.firstLine } : {}) },
      indentRight: { default: null, parseHTML: (el) => (el.hasAttribute('data-indent-right') ? Number(el.getAttribute('data-indent-right')) : null), renderHTML: (a) => (a.indentRight != null ? { 'data-indent-right': a.indentRight } : {}) },
    },
  }],
  addKeyboardShortcuts() {
    const atStart = () => { const { selection } = this.editor.state; return selection.empty && selection.$from.parentOffset === 0; };
    const inText = () => { const { $from } = this.editor.state.selection; return ['paragraph', 'heading'].includes($from.parent.type.name) && !this.editor.isActive('listItem') && !this.editor.isActive('taskItem'); };
    return {
      // Tab at the start of a line moves the paragraph to the next stop; in the text it adds a tab.
      Tab: () => {
        if (this.editor.isActive('table')) return false;
        if (!atStart() && inText() && this.editor.schema.nodes.docTab) return this.editor.chain().insertContent({ type: 'docTab' }).run();
        return changeIndent(this.editor, 1);
      },
      'Shift-Tab': () => !this.editor.isActive('table') && changeIndent(this.editor, -1),
      'Mod-Enter': () => this.editor.chain().focus().insertContent({ type: 'docPageBreak' }).run(),
    };
  },
});

// Split at the caret and move the remaining blocks into the new section without flattening them.
export function insertDocumentSection(editor: Editor, columns: number) {
  const { $from } = editor.state.selection;
  if ($from.depth !== 1 || !$from.parent.isTextblock) return false;
  editor.commands.splitBlock();
  const state = editor.state;
  const start = state.selection.$from.before(1);
  const rest = state.doc.slice(start).content;
  const section = state.schema.nodes.docSection.create({ columns, newPage: true }, rest);
  const tr = state.tr.replaceWith(start, state.doc.content.size, section);
  tr.setSelection(TextSelection.near(tr.doc.resolve(start + 2)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
  return true;
}
export function sectionColumns(editor: Editor, columns: number) {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'docSection') {
    editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(d), undefined, { ...$from.node(d).attrs, columns }));
    return true;
  }
  return false;
}

// The section the cursor is in: turn its pages (null: as the document).
export function sectionOrientation(editor: Editor, orientation: 'landscape' | 'portrait' | null) {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'docSection') {
    editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(d), undefined, { ...$from.node(d).attrs, orientation }));
    return true;
  }
  return false;
}
export function currentSectionOrientation(editor: Editor): string | null | undefined {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'docSection') return ($from.node(d).attrs.orientation as string | null) ?? null;
  return undefined; // not in a section
}
