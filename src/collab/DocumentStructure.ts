import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export const PageBreak = Node.create({
  name: 'docPageBreak', group: 'block', atom: true, selectable: true,
  parseHTML: () => [{ tag: 'div[data-doc-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-doc-page-break': '', class: 'doc-page-break', role: 'separator', 'aria-label': 'Page break' }), ['span', { contenteditable: 'false' }, 'Page break']],
});
export const DocumentSection = Node.create({
  name: 'docSection', group: 'block', content: 'block+', defining: true, isolating: true,
  addAttributes: () => ({ columns: { default: 1, parseHTML: (el) => Number(el.getAttribute('data-columns')) || 1 }, newPage: { default: true, parseHTML: (el) => el.hasAttribute('data-new-page') } }),
  parseHTML: () => [{ tag: 'section[data-doc-section]' }],
  renderHTML: ({ HTMLAttributes }) => {
    const columns = Math.min(3, Math.max(1, Number(HTMLAttributes.columns) || 1));
    return ['section', { 'data-doc-section': '', 'data-columns': columns, ...(HTMLAttributes.newPage ? { 'data-new-page': '' } : {}), class: 'doc-section', style: `column-count:${columns};column-gap:24px;column-span:all` }, 0];
  },
});

export function changeIndent(editor: Editor, direction: number): boolean {
  if (editor.isActive('listItem')) return (direction > 0 ? editor.chain().focus().sinkListItem('listItem') : editor.chain().focus().liftListItem('listItem')).run();
  if (editor.isActive('taskItem')) return (direction > 0 ? editor.chain().focus().sinkListItem('taskItem') : editor.chain().focus().liftListItem('taskItem')).run();
  const { from, to } = editor.state.selection;
  const tr = editor.state.tr;
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: Math.max(0, Math.min(8, (Number(node.attrs.indent) || 0) + direction)) });
  });
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
export const DocumentIndent = Extension.create({
  name: 'documentIndent',
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading'],
    attributes: { indent: {
      default: 0,
      parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
      renderHTML: (a) => a.indent ? { 'data-indent': a.indent, style: `margin-inline-start:${Math.max(0, Math.min(8, Number(a.indent))) * 12.7}mm` } : {},
    } },
  }],
  addKeyboardShortcuts() {
    return {
      Tab: () => !this.editor.isActive('table') && changeIndent(this.editor, 1),
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
