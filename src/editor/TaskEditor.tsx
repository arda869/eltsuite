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
import { Definition, DefinitionPop } from './Definition';
import { Stress, newStress } from './Stress';
import { Ipa, newIpa, type Accent } from './Ipa';
import { Reflect, newReflect } from './Reflect';
import { RevealBox, newReveal } from './Reveal';
import { LinkCard } from './LinkCard';
import { BLOCKS } from './coursebook';
import Link from '@tiptap/extension-link';
import { EditorContextMenu } from './ContextMenu';
import { EditorClassContext } from './context';
import { Highlight, HighlightTool } from './Highlight';
import { TextColor, TextColorTool } from './TextColor';
import { IconNode, IconTool } from './Icons';
import { SymNode, SymbolTool } from './Symbols';
import { BoardNode, newBoard } from './BoardNode';
import { Mention, MentionMenu, useMentionMenu } from './Mention';
import { CELL_COLORS, cellBg } from './tableStyle';
import { LessonLink, LinkPop, type LinkPlace } from './LessonLink';
import { PickCard, RandomPick, newRandomPick } from './RandomPick';
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

type Cmd = { key: string; label: string; hint: string; group: 'Questions' | 'Text' | 'Blocks'; run: (e: Editor) => void };

const BLOCK_CMDS: Cmd[] = BLOCKS.map((b) => ({ key: 'b-' + b.key, label: b.label, hint: b.hint, group: 'Blocks', run: (e) => e.chain().focus().insertContent([...b.make(), { type: 'paragraph' }]).run() }));

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
  { key: 'reflect', label: 'Self-reflection', hint: 'Learners rate how they did: stars, faces, scales, can-do lists', group: 'Questions', run: (e) => e.chain().focus().insertContent([newReflect('self'), { type: 'paragraph' }]).run() },
  { key: 'peer', label: 'Peer feedback', hint: 'Learners choose a classmate and rate how they did', group: 'Questions', run: (e) => e.chain().focus().insertContent([newReflect('peer'), { type: 'paragraph' }]).run() },
  { key: 'board', label: 'Message board', hint: 'Learners post messages the whole class sees', group: 'Questions', run: (e) => e.chain().focus().insertContent([newBoard('board'), { type: 'paragraph' }]).run() },
  { key: 'postits', label: 'Post-it wall', hint: 'Learners stick notes on a shared wall', group: 'Questions', run: (e) => e.chain().focus().insertContent([newBoard('postits'), { type: 'paragraph' }]).run() },
  { key: 'drawcard', label: 'Draw a card', hint: 'Learners draw a random card from a pile', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('cards'), { type: 'paragraph' }]).run() },
  { key: 'wheel', label: 'Spin the wheel', hint: 'The same cards on a wheel learners spin', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('wheel'), { type: 'paragraph' }]).run() },
  { key: 'boxes', label: 'Open a box', hint: 'The same cards hidden in boxes learners open', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('boxes'), { type: 'paragraph' }]).run() },
  { key: 'reveal', label: 'Reveal box', hint: 'Hidden until a learner opens it: hints, answers', group: 'Text', run: (e) => e.chain().focus().insertContent([newReveal(), { type: 'paragraph' }]).run() },
  { key: 'linkcard', label: 'Link card', hint: 'A YouTube video, audio file or web page', group: 'Text', run: (e) => e.chain().focus().insertContent([{ type: 'linkCard', attrs: { url: '', title: '', note: '' } }, { type: 'paragraph' }]).run() },
  { key: 'column', label: 'Next column', hint: 'Start the second column (two-column layout)', group: 'Text', run: (e) => e.chain().focus().insertContent([newColumnBreak(), { type: 'paragraph' }]).run() },
  { key: 'textbox', label: 'Text box', hint: 'Reading texts, model answers, emails, web pages, speech bubbles…', group: 'Text', run: (e) => e.chain().focus().insertContent([newTextBox('paper'), { type: 'paragraph' }]).run() },
  { key: 'info', label: 'Information box', hint: 'Grammar rules, tips, useful language', group: 'Text', run: (e) => e.chain().focus().insertContent([newTextBox('info', 'sand', 'Grammar', '!'), { type: 'paragraph' }]).run() },
  {
    key: 'stress',
    label: 'Word stress',
    hint: 'A word with its stressed syllable marked',
    group: 'Text',
    run: (e) => {
      let last: string | undefined;
      e.state.doc.descendants((n) => {
        if (n.type.name === 'stress') last = n.attrs.style;
      });
      e.chain().focus().insertContent(newStress((last as 'box' | 'bold' | 'big') ?? 'box')).run();
    },
  },
  {
    key: 'ipa',
    label: 'IPA transcription',
    hint: 'Phonemic symbols, British or American',
    group: 'Text',
    run: (e) => {
      let last: Accent | undefined;
      e.state.doc.descendants((n) => {
        if (n.type.name === 'ipa') last = n.attrs.accent;
      });
      e.chain().focus().insertContent(newIpa(last ?? 'RP')).run();
    },
  },
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
  ...BLOCK_CMDS,
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
      return COMMANDS.filter((c) => !(c.key === 'column' && (hasColumns || nested)) && !(['drawcard', 'wheel', 'boxes', 'board', 'postits', 'reveal', 'linkcard'].includes(c.key) && nested) && !(c.group === 'Blocks' && nested)).filter((c) => (c.label + ' ' + c.key).toLowerCase().includes(state.query.trim()));
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

const ICON = (d: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    {d}
  </svg>
);
const ICON_LIST = ICON(<><circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" /><path d="M6 4h8M6 8h8M6 12h8" /></>);
const ICON_OL = ICON(<><text x="0.5" y="5.5" fontSize="5" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="0.5" y="9.5" fontSize="5" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="0.5" y="13.5" fontSize="5" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text><path d="M6 4h8M6 8h8M6 12h8" /></>);
const ICON_LINK = ICON(<><path d="M6.5 9.5l3-3" /><path d="M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2" /><path d="M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8" /></>);
const ICON_TABLE = ICON(<><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M1.5 6.5h13M6 6.5v7M10.5 6.5v7" /></>);

const cellAttrs = {
  bg: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-bg') || '', renderHTML: (a: { bg: string }) => (a.bg ? { 'data-bg': a.bg, style: `background-color: ${cellBg(a.bg)}` } : {}) },
  align: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-align') || '', renderHTML: (a: { align: string }) => (a.align ? { 'data-align': a.align, style: `text-align: ${a.align}` } : {}) },
};

const BTN = (label: string, active: boolean, onClick: () => void, text: React.ReactNode) => (
  <button type="button" className={'tool' + (active ? ' on' : '')} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {text}
  </button>
);

export function TaskEditor({ content, onChange, places = [], classmates = [], classId = '' }: { content: JSONContent; onChange: (c: JSONContent) => void; places?: LinkPlace[]; classmates?: { id: string; name: string }[]; classId?: string }) {
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
            striped: { default: false, parseHTML: (el: HTMLElement) => el.hasAttribute('data-striped'), renderHTML: (a: { striped: boolean }) => (a.striped ? { 'data-striped': '' } : {}) },
            lines: { default: 'all', parseHTML: (el: HTMLElement) => el.getAttribute('data-lines') || 'all', renderHTML: (a: { lines: string }) => ({ 'data-lines': a.lines, class: 'lines-' + a.lines }) },
          };
        },
      }).configure({ resizable: false }),
      TableRow,
      TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } }),
      TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } }),
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
      RandomPick,
      PickCard,
      Definition,
      Highlight,
      TextColor,
      IconNode,
      SymNode,
      BoardNode,
      Mention,
      RevealBox,
      LinkCard,
      Link.configure({ openOnClick: false, autolink: true, protocols: ['https'], HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Stress,
      Ipa,
      LessonLink,
      jsonClip(Reflect, 'div', 'data-reflect'),
      FreshIds,
      Placeholder.configure({ placeholder: 'Write the task. Type / for a question, list or image.' }),
    ],
    content,
    onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
  });

  const slash = useSlash(editor);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [defOpen, setDefOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const mention = useMentionMenu(editor, classmates);
  const classCtx = useMemo(() => ({ classmates, classId }), [classmates, classId]);

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
    <EditorClassContext.Provider value={classCtx}>
    <div className="task-editor">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {BTN('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b className="ti ti-b">B</b>)}
        {BTN('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i className="ti ti-i">I</i>)}
        {BTN('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <u className="ti ti-u">U</u>)}
        {BTN('Strikethrough', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <s className="ti ti-s">S</s>)}
        <TextColorTool editor={editor} />
        <HighlightTool editor={editor} />
        {BTN('Heading', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span className="ti ti-h">Heading</span>)}
        {BTN('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), ICON_LIST)}
        {BTN('Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ICON_OL)}
        {BTN('Insert a table', editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <span className="ti-row">{ICON_TABLE}<span>Table</span></span>)}
        {BTN(
          editor.isActive('definition') ? 'Edit the definition' : 'Add a definition to the selected word',
          editor.isActive('definition'),
          () => {
            if (editor.state.selection.empty && !editor.isActive('definition')) {
              window.alert('Select a word or phrase first, then add its definition.');
              return;
            }
            setDefOpen(true);
          },
          <span className="ti-row"><span className="ti-def">Aa</span><span>Definition</span></span>,
        )}
        {BTN(
          editor.isActive('lessonLink') || editor.isActive('link') ? 'Change the link' : 'Link the selected words to another task or a web page',
          editor.isActive('lessonLink') || editor.isActive('link'),
          () => {
            if (editor.state.selection.empty && !editor.isActive('lessonLink') && !editor.isActive('link')) {
              window.alert('Select the words to link first.');
              return;
            }
            setLinkOpen(true);
          },
          <span className="ti-row">{ICON_LINK}<span>Link</span></span>,
        )}
        <span className="tool-sep" />
        {BTN('Insert gap', false, () => editor.chain().focus().insertContent(newGap()).run(), '+ Gap')}
        {BTN('Insert multiple choice in line', false, () => editor.chain().focus().insertContent(newChoice('dropdown')).run(), '+ Multiple choice')}
        <IconTool editor={editor} />
        <SymbolTool editor={editor} />
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
          <span className="tb-group">
            <span className="tb-label">Cell colour</span>
            <span className="hl-swatches">
              {CELL_COLORS.map((c) => (
                <button key={c.key} type="button" title={c.label} className={'hl-sw' + ((editor.getAttributes('tableCell').bg || editor.getAttributes('tableHeader').bg) === c.key ? ' on' : '')} style={{ background: c.bg }} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setCellAttribute('bg', c.key).run()} />
              ))}
              <button type="button" className="hl-none" title="No colour" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setCellAttribute('bg', '').run()}>
                ×
              </button>
            </span>
          </span>
          <span className="tb-group">
            {BTN('Align left', (editor.getAttributes('tableCell').align || editor.getAttributes('tableHeader').align || 'left') === 'left', () => editor.chain().focus().setCellAttribute('align', 'left').run(), 'Left')}
            {BTN('Centre', (editor.getAttributes('tableCell').align || editor.getAttributes('tableHeader').align) === 'center', () => editor.chain().focus().setCellAttribute('align', 'center').run(), 'Centre')}
            {BTN('Striped rows', !!editor.getAttributes('table').striped, () => editor.chain().focus().updateAttributes('table', { striped: !editor.getAttributes('table').striped }).run(), 'Striped')}
          </span>
          <span className="tb-group" style={{ marginLeft: 'auto' }}>
            {BTN('Delete table', false, () => editor.chain().focus().deleteTable().run(), 'Delete table')}
          </span>
        </div>
      )}
      <div className="editor-host" ref={setHost}>
        <EditorContent editor={editor} className="doc" />
        <TableInsert editor={editor} host={host} />
        <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
        <MentionMenu menu={mention} />
        <LinkPop editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} places={places} />
        <EditorContextMenu
          editor={editor}
          host={host}
          onDefinition={() => setDefOpen(true)}
          onLink={() => setLinkOpen(true)}
          actions={{
            gap: (t) => editor.chain().focus().insertContent({ ...newGap(), attrs: { ...newGap().attrs, answers: [t] } }).run(),
            drop: (t) => {
              const d = newDropGap();
              let hasBank = false;
              editor.state.doc.descendants((n) => {
                if (n.type.name === 'wordbank') hasBank = true;
              });
              editor.chain().focus().insertContent({ ...d, attrs: { ...d.attrs, answer: t } }).run();
              if (!hasBank) editor.chain().insertContentAt(editor.state.selection.$from.before(1), newWordBank()).run();
            },
            choice: (t) => {
              const c = newChoice('dropdown', [t, '', '']);
              editor.chain().focus().insertContent({ ...c, attrs: { ...c.attrs, correct: 0 } }).run();
            },
            stress: (t) => editor.chain().focus().insertContent({ ...newStress('box'), attrs: { ...newStress('box').attrs, syllables: [t] } }).run(),
            ipa: () => {
              let last: Accent | undefined;
              editor.state.doc.descendants((n) => {
                if (n.type.name === 'ipa') last = n.attrs.accent;
              });
              editor.chain().focus().insertContent([{ type: 'text', text: ' ' }, newIpa(last ?? 'RP')]).run();
            },
          }}
        />
        {slash.state && (
          <div ref={slashRef} className="slash" role="listbox" aria-label="Insert" style={{ top: slash.state.top, left: Math.max(0, slash.state.left - 8) }}>
            {(['Questions', 'Text', 'Blocks'] as const).map((g) => {
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
    </EditorClassContext.Provider>
  );
}
