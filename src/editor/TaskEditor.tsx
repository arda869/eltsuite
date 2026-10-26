import { createPortal } from 'react-dom';
import { newTimeline, TimelineNode } from './Timeline';
import { TableHandles } from './TableHandles';
import { BlockHandles } from './BlockMenu';
import { clipHtml, freshIds, readClip, type Clip } from '../lib/clip';
import { carryMedia, remap } from '../lib/fullcopy';
import { getHTMLFromFragment } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
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
import { MediaBlock, newMedia } from './MediaNode';
import { UploadBlock, newUpload } from './UploadNode';
import { CollabBlock, newCollab } from './CollabNode';
import { BLOCKS } from './coursebook';
import Link from '@tiptap/extension-link';
import OrderedList from '@tiptap/extension-ordered-list';
import { listLabel, parseListStart } from '../lib/listLabel';
import { EditorContextMenu } from './ContextMenu';
import { LineAdder } from './LineAdder';
import { Picture, PictureDialog, insertPictures } from './Picture';
import { uploadPicture } from './PackNode';
import { EditorClassContext } from './context';
import { Selection } from '@tiptap/pm/state';
import { Highlight, HighlightTool } from './Highlight';
import { TextColor, TextColorTool } from './TextColor';
import { IconNode, IconTool } from './Icons';
import { SymNode, SymbolTool } from './Symbols';
import { BoardNode, newBoard } from './BoardNode';
import { DrawBoardNode, newDrawBoard } from './DrawBoard';
import { newPack, PackNode } from './PackNode';
import { newSurvey, SurveyNode } from './SurveyNode';
import { BankLinkNode, newBankLink } from './BankLink';
import type { PackKind } from '../lib/pack';
import { Mention, MentionMenu, useMentionMenu } from './Mention';
import { CELL_COLORS, cellBg } from './tableStyle';
import { LessonLink, LinkPop, type LinkPlace } from './LessonLink';
import { PickCard, RandomPick, newRandomPick } from './RandomPick';
import { TextBox, newTextBox } from './TextBox';
import { ColumnBreak, DropGap, Match, Order, WordBank, Writing, newColumnBreak, newDropGap, newMatch, newOrder, newWordBank, newWriting } from './blocks';
import { InsertGallery } from './InsertGallery';

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
  { key: 'lettergap', label: 'Letter gaps', hint: 'One line per letter, for a word or a whole sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent({ ...newGap(), attrs: { ...newGap().attrs, letters: true } }).run() },
  { key: 'wordform', label: 'Word formation', hint: 'A gap with the stem word in capitals beside it', group: 'Questions', run: (e) => e.chain().focus().insertContent({ ...newGap(), attrs: { ...newGap().attrs, stem: 'WORD' } }).run() },
  { key: 'radio', label: 'Multiple choice radio buttons', hint: 'Options listed under the sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio')).run() },
  { key: 'dropdown', label: 'Multiple choice in line', hint: 'go / goes / going · learners circle one', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('dropdown')).run() },
  { key: 'truefalse', label: 'True or false', hint: 'True / False inside the sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio', ['True', 'False'])).run() },
  { key: 'notgiven', label: 'True, false or not given', hint: 'For reading tasks', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio', ['True', 'False', 'Not given'])).run() },
  { key: 'match', label: 'Matching', hint: 'Match items on the left to the right', group: 'Questions', run: (e) => e.chain().focus().insertContent([newMatch(), { type: 'paragraph' }]).run() },
  { key: 'drop', label: 'Drag-and-drop gap', hint: 'A gap filled from the word bank', group: 'Questions', run: (e) => insertDropGap(e) },
  {
    key: 'bank',
    label: 'Word bank',
    hint: 'The words for drag-and-drop gaps',
    group: 'Questions',
    run: (e) => {
      // One word bank holds the words of every drag-and-drop gap in the task, so a second one would
      // only repeat them: go to the one that is there instead.
      let at = -1;
      e.state.doc.descendants((n, pos) => {
        if (at < 0 && n.type.name === 'wordbank') at = pos;
      });
      if (at >= 0) {
        e.chain().focus().setNodeSelection(at).scrollIntoView().run();
        const dom = e.view.nodeDOM(at) as HTMLElement | null;
        dom?.classList.add('flash');
        window.setTimeout(() => dom?.classList.remove('flash'), 1200);
        return;
      }
      e.chain().focus().insertContent([newWordBank(), { type: 'paragraph' }]).run();
    },
  },
  { key: 'order', label: 'Word order', hint: 'Put the words in the right order', group: 'Questions', run: (e) => e.chain().focus().insertContent([newOrder(), { type: 'paragraph' }]).run() },
  { key: 'collab', label: 'Shared document', hint: 'A document the class writes together, live: edit, suggest, comment', group: 'Questions', run: (e) => e.chain().focus().insertContent([newCollab(), { type: 'paragraph' }]).run() },
  { key: 'upload', label: 'File upload', hint: 'Learners hand in files: documents, photos, sound or video', group: 'Questions', run: (e) => e.chain().focus().insertContent([newUpload(), { type: 'paragraph' }]).run() },
  { key: 'writing', label: 'Long answer', hint: 'Writing with a word count; you mark it', group: 'Questions', run: (e) => e.chain().focus().insertContent([newWriting(), { type: 'paragraph' }]).run() },
  { key: 'reflect', label: 'Self-reflection', hint: 'Learners rate how they did: stars, faces, scales, can-do lists', group: 'Questions', run: (e) => e.chain().focus().insertContent([newReflect('self'), { type: 'paragraph' }]).run() },
  { key: 'peer', label: 'Peer feedback', hint: 'Learners choose a classmate and rate how they did', group: 'Questions', run: (e) => e.chain().focus().insertContent([newReflect('peer'), { type: 'paragraph' }]).run() },
  { key: 'collab-slides', label: 'Shared slides', hint: 'Slides the class makes together, live, like Google Slides', group: 'Questions', run: (e) => e.chain().focus().insertContent([{ ...newCollab(), attrs: { ...newCollab().attrs, kind: 'slides' } }, { type: 'paragraph' }]).run() },
  { key: 'board', label: 'Message board', hint: 'Learners post messages the whole class sees', group: 'Questions', run: (e) => e.chain().focus().insertContent([newBoard('board'), { type: 'paragraph' }]).run() },
  { key: 'postits', label: 'Post-it wall', hint: 'Learners stick notes on a shared wall', group: 'Questions', run: (e) => e.chain().focus().insertContent([newBoard('postits'), { type: 'paragraph' }]).run() },
  { key: 'grammarlink', label: 'Grammar bank link', hint: 'A card that opens a grammar page in the notebook', group: 'Blocks', run: (e) => e.chain().focus().insertContent([newBankLink('grammar'), { type: 'paragraph' }]).run() },
  { key: 'vocablink', label: 'Vocabulary bank link', hint: 'A card that opens a vocabulary page in the notebook', group: 'Blocks', run: (e) => e.chain().focus().insertContent([newBankLink('vocab'), { type: 'paragraph' }]).run() },
  { key: 'timeline', label: 'Timeline', hint: 'A tense timeline: events, actions in progress, periods, arrows and labels', group: 'Text', run: (e) => e.chain().focus().insertContent([newTimeline(), { type: 'paragraph' }]).run() },
  { key: 'drawboard', label: 'Board', hint: 'A drawing board: draw, write and add pictures, live in class', group: 'Blocks', run: (e) => e.chain().focus().insertContent([newDrawBoard(), { type: 'paragraph' }]).run() },
  { key: 'pq-fix', label: 'Find and fix the mistake', hint: 'Learners tap the wrong word, then correct it', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('fix' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-categorise', label: 'Categorise', hint: 'Sort words into labelled columns', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('categorise' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-transform', label: 'Key word transformation', hint: 'Rewrite a sentence using a given word', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('transform' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-highlight', label: 'Highlight in text', hint: 'Learners tap every word that matches', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('highlight' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-sentences', label: 'Order sentences', hint: 'Put sentences or paragraphs in order', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('sentences' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-label', label: 'Label the image', hint: 'Drag labels onto points on a picture', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('label' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-odd', label: 'Odd one out', hint: 'Pick the word that doesn’t belong', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('odd' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-gapped', label: 'Gapped text', hint: 'Put removed sentences back into a text', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('gapped' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-matching', label: 'Multiple matching', hint: 'Match statements to texts A, B, C, D', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('matching' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-speaking', label: 'Speaking prompt', hint: 'A prompt card with photos, questions and a timer', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('speaking' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-dictation', label: 'Dictation', hint: 'Learners hear a sentence and type it; marked word by word', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('dictation' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-pairs', label: 'Minimal pairs', hint: 'Hear a word, pick it: ship / sheep', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('pairs' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-crossword', label: 'Crossword', hint: 'Made from words and clues, or from the class notebook', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('crossword' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-wordsearch', label: 'Word search', hint: 'Find the words that match the clues', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('wordsearch' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'survey', label: 'Survey', hint: 'Ratings, faces, choices, ranking or open answers; anonymous if you like', group: 'Questions', run: (e) => e.chain().focus().insertContent([newSurvey(), { type: 'paragraph' }]).run() },
  { key: 'drawcard', label: 'Draw a card', hint: 'Learners draw a random card from a pile', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('cards'), { type: 'paragraph' }]).run() },
  { key: 'wheel', label: 'Spin the wheel', hint: 'The same cards on a wheel learners spin', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('wheel'), { type: 'paragraph' }]).run() },
  { key: 'boxes', label: 'Open a box', hint: 'The same cards hidden in boxes learners open', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('boxes'), { type: 'paragraph' }]).run() },
  { key: 'reveal', label: 'Reveal box', hint: 'Hidden until a learner opens it: hints, answers', group: 'Text', run: (e) => e.chain().focus().insertContent([newReveal(), { type: 'paragraph' }]).run() },
  { key: 'media', label: 'Sound or video', hint: 'Record, upload or link, with a karaoke script', group: 'Text', run: (e) => e.chain().focus().insertContent([newMedia(), { type: 'paragraph' }]).run() },
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
    hint: 'Upload pictures or use a web address; label them 1, 2, 3 or a, b, c',
    group: 'Text',
    run: () => void window.dispatchEvent(new CustomEvent('ll:add-picture')),
  },
  { key: 'table', label: 'Table', hint: '3 × 3, with a header row', group: 'Text', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: 'quote', label: 'Quote', hint: 'Set a passage apart', group: 'Text', run: (e) => e.chain().focus().toggleBlockquote().run() },
  ...BLOCK_CMDS,
];

function useSlash(editor: Editor | null, extra: Cmd[] = []) {
  const [state, setState] = useState<{ query: string; from: number; to: number; top: number; left: number; above: number } | null>(null);
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
      // Screen positions: the menu is drawn on the page itself, so a scrolling chat box or a
      // zoomed task can't cut it off.
      setState({ query: m[1].toLowerCase(), from: start, to: from, top: coords.bottom, left: coords.left, above: coords.top });
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
      return [...COMMANDS, ...extra].filter((c) => !(c.key === 'column' && (hasColumns || nested)) && !(['drawcard', 'wheel', 'boxes', 'board', 'postits', 'reveal', 'linkcard'].includes(c.key) && nested) && !(c.group === 'Blocks' && nested)).filter((c) => (c.label + ' ' + c.key).toLowerCase().includes(state.query.trim()));
    },
    [state, editor, extra],
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

// "Start at" for a numbered list: type 4, d, D, iv or IV.
function ListStart({ editor }: { editor: Editor }) {
  const a = editor.getAttributes('orderedList');
  const type = (a.listType as string) ?? '1';
  const cur = listLabel((a.start as number) ?? 1, type);
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur]);
  const apply = (refocus: boolean) => {
    const p = parseListStart(v, type);
    if (!p) return setV(cur);
    const chain = refocus ? editor.chain().focus() : editor.chain();
    chain.updateAttributes('orderedList', p).run();
  };
  return (
    <input
      className="tb-start"
      aria-label="Start numbering at"
      data-tip="Type a number or letter: 4, d, D, iv or IV"
      value={v}
      size={4}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => apply(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply(true);
        }
        if (e.key === 'Escape') setV(cur);
      }}
    />
  );
}

// A block from "+ Add…" goes after the bullet list (or, for big blocks, after the box) the cursor is in,
// rather than inside a bullet point.
const INLINE_KEYS = ['gap', 'lettergap', 'wordform', 'dropdown', 'drop', 'stress', 'ipa', 'heading', 'list', 'numbered', 'quote'];
const TOP_ONLY = ['column', 'drawcard', 'wheel', 'boxes', 'board', 'postits', 'reveal', 'linkcard', 'drawboard', 'media', 'upload', 'collab', 'collab-slides', 'timeline'];
function placeForBlock(e: Editor, c: { key: string; group: string }) {
  if (INLINE_KEYS.includes(c.key)) return;
  const { $from } = e.state.selection;
  let target = 0;
  for (let d = 1; d <= $from.depth; d++) {
    const name = $from.node(d).type.name;
    if (name === 'bulletList' || name === 'orderedList') {
      target = d;
      break;
    }
  }
  if (!target && (TOP_ONLY.includes(c.key) || c.group === 'Blocks') && $from.depth > 1) target = 1;
  if (!target) return;
  const after = $from.after(target);
  e.chain().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run();
}

const BTN = (label: string, active: boolean, onClick: () => void, text: React.ReactNode) => (
  <button type="button" className={'tool' + (active ? ' on' : '')} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {text}
  </button>
);

// Older plain images become pictures, which have settings, crop and resizing.
function withPictures(n: JSONContent): JSONContent {
  if (!n.content) return n;
  return { ...n, content: n.content.map((c) => (c.type === 'image' && c.attrs?.src ? { type: 'paragraph', content: [{ type: 'picture', attrs: { src: c.attrs.src, alt: c.attrs.alt ?? '', size: 'm' } }] } : withPictures(c))) };
}

export function TaskEditor({ content, onChange, places = [], classmates = [], classId = '', onNotebook, onBank, onPickBank, placeholder, handles = true }: { handles?: boolean; placeholder?: string; content: JSONContent; onChange: (c: JSONContent) => void; places?: LinkPlace[]; classmates?: { id: string; name: string }[]; classId?: string; onNotebook?: (word: string, sentence: string) => void; onBank?: (nodes: JSONContent[]) => void; onPickBank?: (insert: (nodes: JSONContent[]) => void) => void }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3] }, orderedList: false }),
      OrderedList.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            listType: { default: '1', parseHTML: (el: HTMLElement) => el.getAttribute('type') || '1', renderHTML: (a: { listType: string }) => ({ type: a.listType }) },
          };
        },
      }),
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
      Picture,
      jsonClip(Gap, 'span', 'data-gap'),
      jsonClip(Mcq, 'div', 'data-mcq'),
      jsonClip(Choice, 'span', 'data-choice'),
      jsonClip(DropGap, 'span', 'data-dropgap'),
      jsonClip(WordBank, 'div', 'data-wordbank'),
      jsonClip(Match, 'div', 'data-match'),
      jsonClip(Order, 'div', 'data-order'),
      jsonClip(Writing, 'div', 'data-writing'),
      jsonClip(PackNode, 'div', 'data-pq'),
      jsonClip(SurveyNode, 'div', 'data-survey'),
      BankLinkNode,
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
      DrawBoardNode,
      jsonClip(TimelineNode, 'div', 'data-timeline'),
      Mention,
      RevealBox,
      LinkCard,
      MediaBlock,
      UploadBlock,
      CollabBlock,
      Link.configure({ openOnClick: false, autolink: true, protocols: ['https'], HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Stress,
      Ipa,
      LessonLink,
      jsonClip(Reflect, 'div', 'data-reflect'),
      FreshIds,
      Placeholder.configure({ placeholder: placeholder ?? 'Write the task. Type / for a question, list or image.' }),
    ],
    content: withPictures(content),
    onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
    editorProps: {
      // Paste or drop pictures straight into the task: they are uploaded to the class.
      handlePaste: (view, e) => {
        // Elements copied from a message or another task: with answers, pictures and sounds.
        const clip = readClip(e.clipboardData?.getData('text/html'));
        if (clip) {
          e.preventDefault();
          void pasteClip(clip);
          return true;
        }
        void view;
        const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length || !classRef.current) return false;
        pastePictures(files);
        return true;
      },
      handleDOMEvents: {
        copy: (view, e) => copyOut(view, e as ClipboardEvent, false),
        cut: (view, e) => copyOut(view, e as ClipboardEvent, true),
      },
      handleDrop: (_view, e) => {
        const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length || !classRef.current) return false;
        e.preventDefault();
        pastePictures(files);
        return true;
      },
    },
  });
  const classRef = useRef(classId);
  classRef.current = classId;
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;
  // Copy: the usual, plus the elements as JSON with where their media live.
  function copyOut(view: EditorView, e: ClipboardEvent, cut: boolean) {
    const sel = view.state.selection;
    if (sel.empty || !e.clipboardData) return false;
    const slice = sel.content();
    const ed = editorRef.current;
    if (!ed) return false;
    const html = getHTMLFromFragment(slice.content, ed.schema);
    const text = slice.content.textBetween(0, slice.content.size, '\n', ' ');
    const json = (slice.content.toJSON() ?? []) as JSONContent[];
    e.clipboardData.setData('text/html', clipHtml({ v: 1, space: classRef.current, content: json }, html, text));
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    if (cut) view.dispatch(view.state.tr.deleteSelection());
    return true;
  }
  async function pasteClip(clip: Clip) {
    const ed = editorRef.current;
    if (!ed) return;
    let content = clip.content;
    const to = classRef.current;
    if (to && clip.space && clip.space !== to) {
      const map = await carryMedia(clip.space, to, [content]).catch(() => ({}) as Record<string, string>);
      content = remap(content, map) as JSONContent[];
    }
    ed.chain().focus().insertContent(content.map(freshIds)).run();
  }
  async function pastePictures(files: File[]) {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      const srcs: string[] = [];
      for (const f of files) srcs.push(await uploadPicture(classRef.current, f));
      insertPictures(ed, srcs);
    } catch {
      window.alert('The picture could not be uploaded. Try a smaller one.');
    }
  }
  const [picOpen, setPicOpen] = useState(false);
  useEffect(() => {
    const open = () => setPicOpen(true);
    window.addEventListener('ll:add-picture', open);
    return () => window.removeEventListener('ll:add-picture', open);
  }, []);

  const bankCmds = useMemo<Cmd[]>(
    () => (onPickBank ? [{ key: 'bankpick', label: 'From my question bank…', hint: 'Insert a saved question or task', group: 'Questions', run: (e) => onPickBank((nodes) => e.chain().focus().insertContent(nodes).run()) }] : []),
    [onPickBank],
  );
  const slash = useSlash(editor, bankCmds);
  const [gallery, setGallery] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [defOpen, setDefOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const mention = useMentionMenu(editor, classmates);
  // Editor shortcuts: ⌘K link, Alt+↑/↓ move the current block.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!editor.state.selection.empty || editor.isActive('lessonLink') || editor.isActive('link')) setLinkOpen(true);
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const { state } = editor;
        const $f = state.selection.$from;
        const index = $f.index(0);
        const doc = state.doc;
        const j = e.key === 'ArrowUp' ? index - 1 : index + 1;
        if (j < 0 || j >= doc.childCount) return;
        e.preventDefault();
        const a = doc.child(Math.min(index, j));
        const b = doc.child(Math.max(index, j));
        let pos = 0;
        for (let k = 0; k < Math.min(index, j); k++) pos += doc.child(k).nodeSize;
        const tr = state.tr.replaceWith(pos, pos + a.nodeSize + b.nodeSize, [b, a]);
        const offset = state.selection.from - (pos + (index < j ? 0 : a.nodeSize));
        const newStart = index < j ? pos + b.nodeSize : pos;
        try {
          tr.setSelection(Selection.near(tr.doc.resolve(Math.max(0, Math.min(tr.doc.content.size, newStart + offset)))));
        } catch {
          /* keep the cursor where it lands */
        }
        editor.view.dispatch(tr.scrollIntoView());
      }
    };
    dom.addEventListener('keydown', key);
    return () => dom.removeEventListener('keydown', key);
  }, [editor]);
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
    <div className={'task-editor' + (handles ? ' with-handles' : '')}>
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
        {BTN('Everything you can add, with pictures', false, () => setGallery(true), '+ Add…')}
      </div>
      {picOpen && editor && <PictureDialog editor={editor} classId={classId} onClose={() => setPicOpen(false)} />}
      {gallery && (
        <InsertGallery
          commands={[...COMMANDS, ...bankCmds]}
          onClose={() => setGallery(false)}
          onPick={(key) => {
            setGallery(false);
            const c = [...COMMANDS, ...bankCmds].find((x) => x.key === key);
            if (c)
              window.setTimeout(() => {
                placeForBlock(editor, c);
                c.run(editor);
              }, 0);
          }}
        />
      )}
      {editor.isActive('orderedList') && (
        <div className="table-bar" role="toolbar" aria-label="Numbered list">
          <span className="tb-group">
            <span className="tb-label">Numbering</span>
            {(
              [
                ['1', '1, 2, 3'],
                ['a', 'a, b, c'],
                ['A', 'A, B, C'],
                ['i', 'i, ii, iii'],
                ['I', 'I, II, III'],
              ] as const
            ).map(([k, l]) => BTN('Numbering ' + l, (editor.getAttributes('orderedList').listType ?? '1') === k, () => editor.chain().focus().updateAttributes('orderedList', { listType: k }).run(), l))}
          </span>
          <span className="tb-group">
            <span className="tb-label">Start at</span>
            <ListStart editor={editor} />
          </span>
        </div>
      )}
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
        {handles && <LineAdder editor={editor} host={host} />}
        {handles && <BlockHandles editor={editor} host={host} space={classId} />}
        {handles && <TableHandles editor={editor} host={host} />}
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
            notebook: onNotebook,
            bank: onBank ? () => onBank(((editor.state.selection.content().toJSON() as { content?: JSONContent[] } | null)?.content ?? []) as JSONContent[]) : undefined,
          }}
        />
        {slash.state && editor && !editor.view.dom.closest('.text-only') && createPortal(
          <div ref={slashRef} className="slash slash-float" role="listbox" aria-label="Insert" style={window.innerHeight - slash.state.top < 320 && slash.state.above > 320 ? { bottom: window.innerHeight - slash.state.above + 6, left: Math.max(8, Math.min(slash.state.left - 8, window.innerWidth - 298)) } : { top: slash.state.top + 6, left: Math.max(8, Math.min(slash.state.left - 8, window.innerWidth - 298)) }}>
            {(['Questions', 'Text', 'Blocks'] as const).map((g) => {
              const list = slash.items.filter((c) => c.group === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  <span className="slash-group">{g === 'Blocks' ? 'Lesson boxes' : g}</span>
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
          </div>,
          document.body,
        )}
      </div>
    </div>
    </EditorClassContext.Provider>
  );
}
