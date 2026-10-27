import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Highlight } from '../editor/Highlight';
import { TextColor } from '../editor/TextColor';
import { Definition } from '../editor/Definition';
import { Ipa } from '../editor/Ipa';
import { Stress } from '../editor/Stress';
import { IconNode } from '../editor/Icons';
import { SymNode } from '../editor/Symbols';
import { LANG_MARKS } from '../editor/langMarks';
import { CiteNode, RefListNode } from '../editor/Cite';
import { Picture } from '../editor/Picture';
import { TextBox } from '../editor/TextBox';
import { RevealBox } from '../editor/Reveal';
import { LinkCard } from '../editor/LinkCard';
import { DialogueLine, DialogueNode } from '../editor/Dialogue';
import { TimelineNode } from '../editor/Timeline';
import { DictCut } from '../editor/DictCut';
import { TTNode } from '../training/Training';
import { LessonLink } from '../editor/LessonLink';
import { COMMANDS, cellAttrs, type Cmd } from '../editor/TaskEditor';
import { imageToData } from '../lib/flash';

// Everything a shared document can hold: the lesson editor's text, language and teaching
// elements, without learner tasks (gaps, choices and the other questions). Every editor that
// opens the same document uses this list, so the shared text always fits.
export const DOC_NODES = [
  StarterKit.configure({ history: false, heading: { levels: [1, 2, 3] }, codeBlock: false, orderedList: false, listItem: false }),
  ListItem.extend({ content: '(paragraph | dialogue) block*' }),
  OrderedList.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        listType: { default: '1', parseHTML: (el: HTMLElement) => el.getAttribute('type') || '1', renderHTML: (a: { listType: string }) => ({ type: a.listType }) },
      };
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
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
  Image.configure({ inline: false, allowBase64: true }),
  Picture,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Link.configure({ openOnClick: false, autolink: true, protocols: ['https'], HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  LessonLink,
  CiteNode,
  RefListNode,
  Underline,
  Highlight,
  TextColor,
  Definition,
  Ipa,
  Stress,
  IconNode,
  SymNode,
  ...LANG_MARKS,
  TextBox,
  RevealBox,
  LinkCard,
  DialogueNode,
  DialogueLine,
  TimelineNode,
  DictCut,
  TTNode,
];

// Pictures in a document live in the document itself, made small enough to share live.
export function pickPictures(editor: Editor) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.multiple = true;
  inp.onchange = () => void addPictures(editor, Array.from(inp.files ?? []));
  inp.click();
}
export async function addPictures(editor: Editor, files: File[], at?: number) {
  const nodes = [];
  for (const f of files.filter((x) => x.type.startsWith('image/'))) nodes.push({ type: 'paragraph', content: [{ type: 'picture', attrs: { src: await imageToData(f, 1100), alt: f.name.replace(/\.[a-z0-9]+$/i, ''), size: 'l' } }] });
  if (!nodes.length) return;
  const c = editor.chain().focus();
  (at != null ? c.insertContentAt(at, nodes) : c.insertContent(nodes)).run();
}

const from = (key: string, group: Cmd['group'], over: Partial<Cmd> = {}): Cmd | null => {
  const c = COMMANDS.find((x) => x.key === key);
  return c ? { ...c, group, ...over } : null;
};
const block = (e: Editor, n: object) => e.chain().focus().insertContent([n, { type: 'paragraph' }]).run();

// The "/" menu in a document, in the order a writer reaches for things.
const DOC_ALL: (Cmd | null)[] = [
  { key: 'h1', label: 'Heading 1', hint: 'A big section heading', group: 'Basic', run: (e) => e.chain().focus().setNode('heading', { level: 1 }).run() },
  { key: 'h2', label: 'Heading 2', hint: 'A medium heading', group: 'Basic', run: (e) => e.chain().focus().setNode('heading', { level: 2 }).run() },
  { key: 'h3', label: 'Heading 3', hint: 'A small heading', group: 'Basic', run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run() },
  { key: 'text', label: 'Text', hint: 'Plain writing', group: 'Basic', run: (e) => e.chain().focus().setParagraph().run() },
  from('list', 'Basic'),
  from('numbered', 'Basic'),
  { key: 'checklist', label: 'Checklist', hint: 'Items to tick off', group: 'Basic', run: (e) => e.chain().focus().toggleTaskList().run() },
  from('table', 'Basic'),
  from('quote', 'Basic'),
  { key: 'divider', label: 'Divider', hint: 'A line between sections', group: 'Basic', run: (e) => e.chain().focus().setHorizontalRule().run() },
  from('info', 'Basic', { label: 'Callout', hint: 'A coloured box for a rule, a tip or useful language' }),
  from('textbox', 'Basic'),
  from('reveal', 'Basic', { label: 'Toggle', hint: 'Hidden until someone opens it' }),
  { key: 'image', label: 'Picture', hint: 'Upload pictures from your device', group: 'Media', run: (e) => pickPictures(e) },
  from('linkcard', 'Media', { label: 'Video or web page', hint: 'A YouTube video, a sound file or a web page' }),
  { key: 'cite', label: 'Citation', hint: 'Cite a source from your PD reading', group: 'Writing', run: () => void window.dispatchEvent(new CustomEvent('ll:cite')) },
  {
    key: 'reflist',
    label: 'Reference list',
    hint: 'Every source you cite, in the citation style',
    group: 'Writing',
    run: (e) => {
      let has = false;
      e.state.doc.descendants((n) => {
        if (n.type.name === 'refList') has = true;
      });
      if (!has) block(e, { type: 'refList' });
    },
  },
  from('stress', 'Language'),
  from('ipa', 'Language'),
  from('subst', 'Language'),
  from('phonchart', 'Language'),
  from('phoncard', 'Language'),
  from('phonhow', 'Language'),
  from('dictcut', 'Language'),
  from('dialogue', 'Language'),
  from('timeline', 'Language'),
  from('tt-analysis', 'Training'),
  from('tt-plan', 'Training'),
  from('tt-observe', 'Training'),
  from('tt-loop', 'Training'),
];
export const DOC_CMDS: Cmd[] = DOC_ALL.filter((c): c is Cmd => !!c);

export const DOC_GROUPS: { k: Cmd['group']; label: string }[] = [
  { k: 'Basic', label: 'Basic' },
  { k: 'Media', label: 'Pictures and media' },
  { k: 'Writing', label: 'Academic writing' },
  { k: 'Language', label: 'Language' },
  { k: 'Training', label: 'Teacher training' },
];
export const PRON_KEYS = ['stress', 'ipa', 'subst', 'phonchart', 'phoncard', 'phonhow'];

export const DOC_SECTIONS = [
  { title: 'Basic', blurb: 'Headings, lists, checklists, tables and boxes.', keys: ['h1', 'h2', 'h3', 'text', 'list', 'numbered', 'checklist', 'table', 'quote', 'divider', 'info', 'textbox', 'reveal'] },
  { title: 'Pictures and media', blurb: 'Pictures from your device, videos and web pages.', keys: ['image', 'linkcard'] },
  { title: 'Academic writing', blurb: 'Citations from your PD reading and a reference list in the document’s style.', keys: ['cite', 'reflist'] },
  { title: 'Language', blurb: 'Pronunciation, dictionary entries, dialogues and timelines.', keys: ['stress', 'ipa', 'subst', 'phonchart', 'phoncard', 'phonhow', 'dictcut', 'dialogue', 'timeline'] },
  { title: 'Teacher training', blurb: 'Language analysis, lesson plans, observation forms and loop input.', keys: ['tt-analysis', 'tt-plan', 'tt-observe', 'tt-loop'] },
];
