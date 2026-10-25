import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Choice, Gap, Mcq, newChoice, newGap } from './nodes';
import { FreshIds, jsonClip } from './clipboard';
import { TableInsert } from './TableInsert';
import { TextBox, newTextBox } from './TextBox';
import { ColumnBreak, DropGap, Match, Order, WordBank, Writing, newColumnBreak, newDropGap, newMatch, newOrder, newWordBank, newWriting } from './blocks';

// Adds a drag-and-drop gap, and a word bank above the paragraph if the task has none yet.
function insertDropGap(e: Editor) {
  let hasBank = false;
  e.state.doc.descendants((n) => {
    if (n.type.name === 'wordbank') hasBank = true;
  });
  e.chain().focus().insertContent(newDropGap()).run();
  if (!hasBank) {
    const pos = e.state.selection.$from.before(1);
    e.chain().insertContentAt(pos, newWordBank()).run();
  }
}

type Cmd = { key: string; label: string; hint: string; group: 'Questions' | 'Text'; run: (e: Editor) => void };

const COMMANDS: Cmd[] = [
  { key: 'gap', label: 'Gap fill', hint: 'A blank inside a sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newGap()).run() },
  { key: 'radio', label: 'Multiple choice radio buttons', hint: 'Options listed under the sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio')).run() },
  { key: 'dropdown', label: 'Multiple choice in line', hint: 'go / goes / going · learners circle one', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('dropdown')).run() },
  { key: 'truefalse', label: 'True or false', hint: 'True / False inside the sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio', ['True', 'False'])).run() },
  { key: 'notgiven', label: 'True, false or not given', hint: 'For reading tasks', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio', ['True', 'False', 'Not given'])).run() },
  { key: 'match', label: 'Matching', hint: 'Match items on the left to the right', group: 'Questions', run: (e) => e.chain().focus().insertContent([newMatch(), { type: 'paragraph' }]).run() },
  { key: 'drop', label: 'Drag-and-drop gap', hint: 'A gap filled from the word bank', group: 'Questions', run: (e) => insertDropGap(e) },
  { key: 'bank', label: 'Word bank', hint: 'The words for drag-and-drop gaps', group: 'Questions', run: (e) => e.chain().focus().insertContent([newWordBank(), { type: 'paragraph' }]).run() },
  { key: 'order', label: 'Word order', hint: 'Put the words in the right order', group: 'Questions', run: (e) => e.chain().focus().insertContent([newOrder(), { type: 'paragraph' }]).run() },
  { key: 'writing', label: 'Long answer', hint: 'Writing with a word count; you mark it', group: 'Questions', run: (e) => e.chain().focus().insertContent([newWriting(), { type: 'paragraph' }]).run() },
  { key: 'column', label: 'Next column', hint: 'Start the second column (two-column layout)', group: 'Text', run: (e) => e.chain().focus().insertContent([newColumnBreak(), { type: 'paragraph' }]).run() },
  { key: 'textbox', label: 'Text box', hint: 'Reading texts, model answers, emails, web pages, speech bubbles…', group: 'Text', run: (e) => e.chain().focus().insertContent([newTextBox('paper'), { type: 'paragraph' }]).run() },
  { key: 'info', label: 'Information box', hint: 'Grammar rules, tips, useful language', group: 'Text', run: (e) => e.chain().focus().insertContent([newTextBox('info', 'sand', 'Grammar', '!'), { type: 'paragraph' }]).run() },
  { key: 'heading', label: 'Heading', hint: 'A small heading inside the task', group: 'Text', run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run() },
  { key: 'list', label: 'Bulleted list', hint: 'A simple list', group: 'Text', run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'numbered', label: 'Numbered list', hint: 'A list with numbers', group: 'Text', run: (e) => e.chain().focus().toggleOrderedList().run() },
  {
    key: 'image',
    label: 'Image',
    hint: 'From a web address',
    group: 'Text',
    run: (e) => {
      const src = window.prompt('Image address (https://…)');
      if (src && /^https:\/\//.test(src)) e.chain().focus().setImage({ src }).run();
    },
  },
  { key: 'table', label: 'Table', hint: '3 × 3, with a header row', group: 'Text', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: 'quote', label: 'Quote', hint: 'Set a passage apart', group: 'Text', run: (e) => e.chain().focus().toggleBlockquote().run() },
];

function useSlash(editor: Editor | null) {
  const [state, setState] = useState<{ query: string; from: number; to: number; top: number; left: number } | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, empty } = editor.state.selection;
      if (!empty) return setState(null);
      const $from = editor.state.selection.$from;
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const m = before.match(/(?:^|\s)\/([a-z ]{0,20})$/i);
      if (!m) return setState(null);
      const start = from - m[1].length - 1;
      const coords = editor.view.coordsAtPos(from);
      const host = editor.view.dom.getBoundingClientRect();
      setState({ query: m[1].toLowerCase(), from: start, to: from, top: coords.bottom - host.top + 6, left: coords.left - host.left });
      setIndex(0);
    };
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  const items = useMemo(
    () => {
      if (!state || !editor) return [];
      let hasColumns = false;
      editor.state.doc.descendants((n) => {
        if (n.type.name === 'columnBreak') hasColumns = true;
      });
      const nested = editor.state.selection.$from.depth > 1; // inside a list, table or box
      return COMMANDS.filter((c) => !(c.key === 'column' && (hasColumns || nested))).filter((c) => (c.label + ' ' + c.key).toLowerCase().includes(state.query.trim()));
    },
    [state, editor],
  );

  const choose = (c: Cmd) => {
    if (!editor || !state) return;
    editor.chain().focus().deleteRange({ from: state.from, to: state.to }).run();
    c.run(editor);
    setState(null);
  };

  return { state: items.length ? state : null, items, index, setIndex, choose, close: () => setState(null) };
}

const BTN = (label: string, active: boolean, onClick: () => void, text: string) => (
  <button type="button" className={'tool' + (active ? ' on' : '')} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {text}
  </button>
);

export function TaskEditor({ content, onChange }: { content: JSONContent; onChange: (c: JSONContent) => void }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3] } }),
      Underline,
      Table.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            lines: { default: 'all', parseHTML: (el: HTMLElement) => el.getAttribute('data-lines') || 'all', renderHTML: (a: { lines: string }) => ({ 'data-lines': a.lines, class: 'lines-' + a.lines }) },
          };
        },
      }).configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      jsonClip(Gap, 'span', 'data-gap'),
      jsonClip(Mcq, 'div', 'data-mcq'),
      jsonClip(Choice, 'span', 'data-choice'),
      jsonClip(DropGap, 'span', 'data-dropgap'),
      jsonClip(WordBank, 'div', 'data-wordbank'),
      jsonClip(Match, 'div', 'data-match'),
      jsonClip(Order, 'div', 'data-order'),
      jsonClip(Writing, 'div', 'data-writing'),
      ColumnBreak,
      TextBox,
      FreshIds,
      Placeholder.configure({ placeholder: 'Write the task. Type / for a question, list or image.' }),
    ],
    content,
    onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
  });

  const slash = useSlash(editor);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editor || !slash.state) return;
    const onKey = (e: KeyboardEvent) => {
      if (!slash.state) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slash.setIndex((i) => (i + 1) % slash.items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        slash.setIndex((i) => (i - 1 + slash.items.length) % slash.items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        slash.choose(slash.items[slash.index]);
      } else if (e.key === 'Escape') {
        slash.close();
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [editor, slash]);

  const slashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    slashRef.current?.querySelector('.slash-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [slash.index, slash.state]);

  if (!editor) return null;

  return (
    <div className="task-editor">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {BTN('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B')}
        {BTN('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I')}
        {BTN('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'U')}
        {BTN('Heading', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H')}
        {BTN('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '•')}
        {BTN('Table', editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), '▦')}
        <span className="tool-sep" />
        {BTN('Insert gap', false, () => editor.chain().focus().insertContent(newGap()).run(), '+ Gap')}
        {BTN('Insert multiple choice in line', false, () => editor.chain().focus().insertContent(newChoice('dropdown')).run(), '+ Multiple choice')}
        {BTN('More question types', false, () => editor.chain().focus().insertContent(' /').run(), '/ More')}
      </div>
      {editor.isActive('table') && (
        <div className="table-bar" role="toolbar" aria-label="Table">
          <span className="tb-group">
            <span className="tb-label">Row</span>
            {BTN('Add row above', false, () => editor.chain().focus().addRowBefore().run(), '+ Above')}
            {BTN('Add row below', false, () => editor.chain().focus().addRowAfter().run(), '+ Below')}
            {BTN('Delete row', false, () => editor.chain().focus().deleteRow().run(), 'Delete')}
          </span>
          <span className="tb-group">
            <span className="tb-label">Column</span>
            {BTN('Add column left', false, () => editor.chain().focus().addColumnBefore().run(), '+ Left')}
            {BTN('Add column right', false, () => editor.chain().focus().addColumnAfter().run(), '+ Right')}
            {BTN('Delete column', false, () => editor.chain().focus().deleteColumn().run(), 'Delete')}
          </span>
          <span className="tb-group">
            {BTN('Header row', false, () => editor.chain().focus().toggleHeaderRow().run(), 'Header row')}
            {editor.can().mergeCells() && BTN('Merge the selected cells', false, () => editor.chain().focus().mergeCells().run(), 'Merge cells')}
            {editor.can().splitCell() && BTN('Split this cell back into separate cells', false, () => editor.chain().focus().splitCell().run(), 'Split cell')}
            {!editor.can().mergeCells() && !editor.can().splitCell() && <span className="tb-hint">Drag across cells to merge them</span>}
          </span>
          <span className="tb-group">
            <span className="tb-label">Lines</span>
            {(['all', 'rows', 'none'] as const).map((l) =>
              BTN(l === 'all' ? 'Show all lines' : l === 'rows' ? 'Lines between rows only' : 'Hide the lines', (editor.getAttributes('table').lines ?? 'all') === l, () => editor.chain().focus().updateAttributes('table', { lines: l }).run(), l === 'all' ? 'All' : l === 'rows' ? 'Rows' : 'None'),
            )}
          </span>
          <span className="tb-group" style={{ marginLeft: 'auto' }}>
            {BTN('Delete table', false, () => editor.chain().focus().deleteTable().run(), 'Delete table')}
          </span>
        </div>
      )}
      <div className="editor-host" ref={setHost}>
        <EditorContent editor={editor} className="doc" />
        <TableInsert editor={editor} host={host} />
        {slash.state && (
          <div ref={slashRef} className="slash" role="listbox" aria-label="Insert" style={{ top: slash.state.top, left: Math.max(0, slash.state.left - 8) }}>
            {(['Questions', 'Text'] as const).map((g) => {
              const list = slash.items.filter((c) => c.group === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  <span className="slash-group">{g}</span>
                  {list.map((c) => {
                    const i = slash.items.indexOf(c);
                    return (
                      <div
                        key={c.key}
                        role="option"
                        aria-selected={i === slash.index}
                        className={'slash-item' + (i === slash.index ? ' on' : '')}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          slash.choose(c);
                        }}
                        onMouseEnter={() => slash.setIndex(i)}
                      >
                        <strong>{c.label}</strong>
                        <span>{c.hint}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
