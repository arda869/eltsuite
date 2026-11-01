import { SpeakingBlock, newSpeaking } from './SpeakingNode';
import { auth } from '../lib/firebase';
import { imageToData } from '../lib/flash';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { tell } from '../lib/ask';
import { createPortal } from 'react-dom';
import { newTimeline, TimelineNode } from './Timeline';
import { DG, DG_KINDS, DiagramCell, DiagramNode, newDiagram } from './Diagram';
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
import { ProsodyTool } from './Prosody';
import { LANG_MARKS } from './langMarks';
import { newPhonCard, newPhonChart } from './Phonemes';
import { TTNode, newTT, newTTCustom, useTrainingClass } from '../training/Training';
import { noteSlash, topSlash } from '../lib/slashUse';
import { useToolGate } from '../lib/toolbarPrefs';
import { composing } from '../lib/keys';
import { useEditorKeys } from './editorKeys';
import { cleanPastedHTML } from './pasteClean';
import { installPopKeys } from './popKeys';

installPopKeys();
import { DictCut } from './DictCut';
import { Ipa, newIpa, type Accent } from './Ipa';
import { Reflect, newReflect } from './Reflect';
import { RevealBox, newReveal } from './Reveal';
import { SubTask, newSubTask } from './SubTask';
import { StoryboardNode, newStoryboard } from '../storyboard/StoryboardNode';
import { LinkCard } from './LinkCard';
import { MediaBlock, InlineMedia, newInlineMedia, newMedia } from './MediaNode';
import { UploadBlock, newUpload } from './UploadNode';
import { CollabBlock, newCollab } from './CollabNode';
import { BLOCKS } from './coursebook';
import Link from '@tiptap/extension-link';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { DialogueLine, DialogueNode, insertDialogue } from './Dialogue';
import { listLabel, parseListStart } from '../lib/listLabel';
import { EditorContextMenu } from './ContextMenu';
import { LineAdder } from './LineAdder';
import { Picture, PictureDialog, insertPictures } from './Picture';
import { uploadPicture } from './PackNode';
import { EditorClassContext } from './context';
import { Highlight, HighlightTool } from './Highlight';
import { TextColor, TextColorTool } from './TextColor';
import { IconNode, IconTool } from './Icons';
import { SymNode, SymbolTool } from './Symbols';
import { BoardNode, newBoard } from './BoardNode';
import { DrawBoardNode, newDrawBoard } from './DrawBoard';
import { newPack, PackNode } from './PackNode';
import { newSurvey, SurveyNode } from './SurveyNode';
import { BankLinkNode } from './BankLink';
import type { PackKind } from '../lib/pack';
import { Mention, MentionMenu, useMentionMenu } from './Mention';
import { CELL_COLORS, cellBg } from './tableStyle';
import { LessonLink, LinkPop, type LinkPlace } from './LessonLink';
import { PickCard, RandomPick, newRandomPick } from './RandomPick';
import { TextBox, newTextBox } from './TextBox';
import { ColumnBreak, DropGap, Match, Order, WordBank, Writing, newColumnBreak, newDropGap, newMatch, newOrder, newWordBank, newWriting } from './blocks';
import { InsertGallery } from './InsertGallery';
import { PDF_NODES, setPdfQuestions } from '../pdf/PdfNodes';
import { openMenu, openMenuAt } from '../components/ContextMenu';
import { currentOrg } from '../lib/admin';
import { PdfPick } from '../pdf/PdfPick';

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

export type Cmd = { key: string; label: string; hint: string; group: 'Questions' | 'Text' | 'Blocks' | 'More' | 'Basic' | 'Media' | 'Writing' | 'Language' | 'Training'; run: (e: Editor) => void };

const BLOCK_CMDS: Cmd[] = BLOCKS.map((b) => ({ key: 'b-' + b.key, label: b.label, hint: b.hint, group: 'Blocks', run: (e) => e.chain().focus().insertContent([...b.make(), { type: 'paragraph' }]).run() }));

export const COMMANDS: Cmd[] = [
  { key: 'gap', label: 'Gap fill', hint: 'A blank inside a sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newGap()).run() },
  { key: 'lettergap', label: 'Letter gaps', hint: 'One line per letter, for a word or a whole sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent({ ...newGap(), attrs: { ...newGap().attrs, letters: true } }).run() },
  { key: 'wordform', label: 'Word formation', hint: 'A gap with the stem word in capitals beside it', group: 'Questions', run: (e) => e.chain().focus().insertContent({ ...newGap(), attrs: { ...newGap().attrs, stem: 'WORD' } }).run() },
  { key: 'radio', label: 'Multiple choice, as a list', hint: 'Options listed under the sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newChoice('radio')).run() },
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
  { key: 'board', label: 'Message board', hint: 'Learners post messages the whole class sees', group: 'Questions', run: (e) => e.chain().focus().insertContent([newBoard('board'), { type: 'paragraph' }]).run() },
  { key: 'postits', label: 'Post-it wall', hint: 'Learners stick notes on a shared wall', group: 'Questions', run: (e) => e.chain().focus().insertContent([newBoard('postits'), { type: 'paragraph' }]).run() },
  { key: 'dialogue', label: 'Dialogue', hint: 'A and B (or names), one line under the other or side by side; gaps and choices work inside', group: 'Text', run: (e) => insertDialogue(e) },
...DG_KINDS.map((k): Cmd => ({ key: 'dg-' + k, label: DG[k].label, hint: DG[k].hint, group: 'Text', run: (e) => e.chain().focus().insertContent([newDiagram(k), { type: 'paragraph' }]).run() })),
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
  { key: 'pq-crossword', label: 'Crossword', hint: 'Made from words and clues', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('crossword' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'pq-wordsearch', label: 'Word search', hint: 'Find the words that match the clues', group: 'Questions', run: (e) => e.chain().focus().insertContent([newPack('wordsearch' as PackKind), { type: 'paragraph' }]).run() },
  { key: 'survey', label: 'Survey', hint: 'Ratings, faces, choices, ranking or open answers; anonymous if you like', group: 'Questions', run: (e) => e.chain().focus().insertContent([newSurvey(), { type: 'paragraph' }]).run() },
  { key: 'drawcard', label: 'Draw a card', hint: 'Learners draw a random card from a pile', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('cards'), { type: 'paragraph' }]).run() },
  { key: 'wheel', label: 'Spin the wheel', hint: 'The same cards on a wheel learners spin', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('wheel'), { type: 'paragraph' }]).run() },
  { key: 'boxes', label: 'Open a box', hint: 'The same cards hidden in boxes learners open', group: 'Questions', run: (e) => e.chain().focus().insertContent([newRandomPick('boxes'), { type: 'paragraph' }]).run() },
  { key: 'subtask', label: 'Sub-task (a, b, c)', hint: 'A part of the task with its own instruction: learners open the next part when they are ready', group: 'Text', run: (e) => {
      // Add it, then put the cursor inside it, ready to type.
      const from = e.state.selection.from;
      e.chain().focus().insertContent([newSubTask(), { type: 'paragraph' }]).run();
      let at = -1;
      e.state.doc.nodesBetween(Math.max(0, from - 2), Math.min(e.state.doc.content.size, from + 6), (n, pos) => {
        if (at < 0 && n.type.name === 'subTask') at = pos;
        return at < 0;
      });
      if (at >= 0) e.chain().focus().setTextSelection(at + 2).run();
    } },
  { key: 'storyboard', label: 'Storyboard', hint: 'Scenes with people and speech bubbles, from your files', group: 'Text', run: (e) => e.chain().focus().insertContent([newStoryboard(), { type: 'paragraph' }]).run() },
  { key: 'reveal', label: 'Reveal box', hint: 'Hidden until a learner opens it: hints, answers', group: 'Text', run: (e) => e.chain().focus().insertContent([newReveal(), { type: 'paragraph' }]).run() },
  { key: 'speaking', label: 'AI conversation', hint: 'A private AI conversation for each learner, with lesson-focused feedback', group: 'Text', run: (e) => e.chain().focus().insertContent([newSpeaking(e), { type: 'paragraph' }]).run() },
  { key: 'inline-video', label: 'Video in line', hint: 'Embed a video within text, tables, dialogues or any rich element', group: 'Text', run: e => e.chain().focus().insertContent(newInlineMedia()).run() },
  { key: 'media', label: 'Sound or video', hint: 'Record, upload or link, with a karaoke script', group: 'Text', run: (e) => e.chain().focus().insertContent([newMedia(), { type: 'paragraph' }]).run() },
  { key: 'pdf', label: 'PDF', hint: 'Pages of a PDF with text boxes, gaps and highlights on them', group: 'Text', run: () => void window.dispatchEvent(new CustomEvent('ll:add-pdf')) },
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
  { key: 'dictcut', label: 'Dictionary cutout', hint: 'A word’s entry, as if cut out of a dictionary page', group: 'Text', run: (e) => e.chain().focus().insertContent([{ type: 'dictCut', attrs: { word: '', data: {} } }, { type: 'paragraph' }]).run() },
  { key: 'tt-analysis', label: 'Language analysis', hint: 'Meaning, form, pronunciation, concept questions, problems and solutions', group: 'Text', run: (e) => e.chain().focus().insertContent([newTT('analysis'), { type: 'paragraph' }]).run() },
  { key:'tt-rehearsal',label:'Microteaching rehearsal',hint:'Rehearse, observe, give feedback and try again',group:'Text',run:e=>e.chain().focus().insertContent([newTT('rehearsal'),{type:'paragraph'}]).run() },
  { key:'tt-exam',label:'Exam practice debrief',hint:'Task demands, pacing, evidence and next practice',group:'Text',run:e=>e.chain().focus().insertContent([newTT('exam'),{type:'paragraph'}]).run() },
  { key:'tt-reflection',label:'Reflective inquiry',hint:'Evidence, interpretation, a change and follow-up',group:'Text',run:e=>e.chain().focus().insertContent([newTT('reflection'),{type:'paragraph'}]).run() },
  { key: 'tt-plan', label: 'Lesson plan', hint: 'Aims, assumptions and stages, from a framework', group: 'Text', run: (e) => e.chain().focus().insertContent([newTT('plan'), { type: 'paragraph' }]).run() },
  { key: 'tt-observe', label: 'Observation form', hint: 'Criteria, strengths and action points', group: 'Text', run: (e) => e.chain().focus().insertContent([newTT('observe'), { type: 'paragraph' }]).run() },
  {
    key: 'tt-org',
    label: 'Your organisation’s forms',
    hint: 'Observation, feedback and planning forms your organisation made',
    group: 'Text',
    run: (e) => {
      const forms = Object.values(currentOrg()?.ttForms ?? {});
      if (!forms.length) return void tell('Your organisation has no forms of its own yet. Its admins add them in Organisation admin.');
      const at = e.view.coordsAtPos(e.state.selection.from);
      openMenu({ clientX: at.left, clientY: at.bottom + 4, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent, forms.map((f) => ({ label: f.name, hint: f.about, icon: '', onClick: () => e.chain().focus().insertContent([newTTCustom(f), { type: 'paragraph' }]).run() })));
    },
  },
  { key: 'tt-loop', label: 'Loop input: step back', hint: 'What you just modelled, and why; trainees open it after', group: 'Text', run: (e) => e.chain().focus().insertContent([newTT('loop'), { type: 'paragraph' }]).run() },
  { key: 'phonchart', label: 'Phonemic chart', hint: 'The sounds of English, British or American; tap to hear', group: 'Text', run: (e) => e.chain().focus().insertContent(newPhonChart()).run() },
  { key: 'phoncard', label: 'Sound card', hint: 'One sound, in its colour, with an example word', group: 'Text', run: (e) => e.chain().focus().insertContent(newPhonCard('sound')).run() },
  { key: 'phonhow', label: 'How a sound is made', hint: 'Place and manner, or tongue and lips, for one sound', group: 'Text', run: (e) => e.chain().focus().insertContent(newPhonCard('how')).run() },
  { key: 'subst', label: 'Substitution slot', hint: 'Words that can go in one place, stacked between two lines', group: 'Text', run: (e) => e.chain().focus().insertContent({ type: 'subst', attrs: { options: [] } }).run() },
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
// The questions that can sit on a PDF page, in a box of their own.
export const PDF_Q_KEYS = ['gap', 'lettergap', 'wordform', 'radio', 'dropdown', 'truefalse', 'notgiven', 'match', 'drop', 'order', 'writing'];
setPdfQuestions(PDF_Q_KEYS.map((k) => COMMANDS.find((c) => c.key === k)).filter((c): c is Cmd => !!c));

// Writing that is not a task (an email): only text tools, no questions or task elements.
const MORE: Cmd = { key: '__more', label: 'Show all', hint: 'Everything you can add', group: 'More', run: () => {} };
// The order of the groups in every / menu (lessons show Questions, Text, Blocks; documents Basic to Training).
const GROUP_RANK: Cmd['group'][] = ['Basic', 'Media', 'Writing', 'Language', 'Questions', 'Text', 'Blocks', 'Training', 'More'];
const TEXT_ONLY = ['inline-video', 'stress', 'ipa', 'subst', 'phonchart', 'phoncard', 'phonhow', 'heading', 'list', 'numbered', 'quote', 'table', 'textbox', 'info', 'dialogue'];
export function useSlash(editor: Editor | null, extra: Cmd[] = [], textOnly = false, training = false, only?: (c: Cmd) => boolean) {
  const [state, setState] = useState<{ query: string; from: number; to: number; top: number; left: number; above: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(false);
  const startRef = useRef(-1);
  const dismissed = useRef(-1);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, empty } = editor.state.selection;
      if (!empty) return setState(null);
      const $from = editor.state.selection.$from;
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const m = before.match(/(?:^|\s)\/([a-z0-9 -]{0,20})$/i);
      if (!m) return (dismissed.current = -1), setState(null);
      const start = from - m[1].length - 1;
      // Closed with Escape: it stays closed for this "/", until a new one is typed.
      if (dismissed.current === start) return setState(null);
      const coords = editor.view.coordsAtPos(from);
      // Screen positions: the menu is drawn on the page itself, so a scrolling chat box or a
      // zoomed task can't cut it off.
      // A new / starts with the short list again.
      if (startRef.current !== start) {
        startRef.current = start;
        setAll(false);
      }
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
      const fit = (only ? extra.filter(only) : [...COMMANDS, ...extra]).filter((c) => training || !c.key.startsWith('tt-')).filter((c) => !textOnly || TEXT_ONLY.includes(c.key)).filter((c) => !(c.key === 'column' && (hasColumns || nested)) && !(['drawcard', 'wheel', 'boxes', 'board', 'postits', 'reveal', 'linkcard', 'dictcut'].includes(c.key) && nested) && !(c.group === 'Blocks' && nested));
      const q = state.query.trim();
      // In the order the menu shows them (by group), so the arrow keys go down the list as seen.
      const shown = (l: Cmd[]) => l.map((c, i) => [c, i] as const).sort((a, b) => GROUP_RANK.indexOf(a[0].group) - GROUP_RANK.indexOf(b[0].group) || a[1] - b[1]).map(([c]) => c);
      if (q) return shown(fit.filter((c) => (c.label + ' ' + c.key).toLowerCase().includes(q)));
      // Just "/": the teacher's three most used, then "Show all".
      if (!all && fit.length > 4) return [...topSlash(fit, 3), MORE];
      return shown(fit);
    },
    [state, editor, extra, textOnly, all, training, only],
  );

  const choose = (c: Cmd) => {
    if (!editor || !state) return;
    if (c.key === MORE.key) {
      setAll(true);
      setIndex(0);
      return;
    }
    noteSlash(c.key);
    editor.chain().focus().deleteRange({ from: state.from, to: state.to }).run();
    c.run(editor);
    setState(null);
  };

  return { state: items.length ? state : null, items, index, setIndex, choose, close: () => ((dismissed.current = state?.from ?? -1), setState(null)) };
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

export const cellAttrs = {
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
const INLINE_KEYS = ['subst', 'phonchart', 'phoncard', 'phonhow', 'dialogue', 'gap', 'lettergap', 'wordform', 'dropdown', 'drop', 'stress', 'ipa', 'heading', 'list', 'numbered', 'quote'];
const TOP_ONLY = ['pdf', 'tt-analysis', 'tt-plan', 'tt-observe', 'tt-loop', 'tt-rehearsal', 'tt-exam', 'tt-reflection', 'tt-org', 'column', 'dictcut', 'drawcard', 'wheel', 'boxes', 'board', 'postits', 'reveal', 'linkcard', 'drawboard', 'media', 'upload', 'collab', 'collab-slides', 'timeline', 'storyboard', ...DG_KINDS.map((k) => 'dg-' + k)];
export function placeForBlock(e: Editor, c: { key: string; group: string }) {
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

// The face of each toolbar button, for the toolbar settings, which show the same bar.
export const TOOL_FACE: Record<string, React.ReactNode> = {
  bold: <b className="ti ti-b">B</b>,
  italic: <i className="ti ti-i">I</i>,
  underline: <u className="ti ti-u">U</u>,
  strike: <s className="ti ti-s">S</s>,
  heading: <span className="ti ti-h">H</span>,
  bullets: ICON_LIST,
  numbers: ICON_OL,
  table: ICON_TABLE,
  definition: <span className="ti-def">Aa</span>,
  link: ICON_LINK,
  questions: (
    <span className="ti-row">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></svg>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
    </span>
  ),
  add: ICON(<><rect x="1.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="9.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="1.5" y="9.5" width="5" height="5" rx="1.2" /><path d="M12 9.5v5M9.5 12h5" /></>),
};
const BTN = (label: string, active: boolean, onClick: () => void, text: React.ReactNode) => (
  <button key={label} type="button" className={'tool' + (active ? ' on' : '')} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {text}
  </button>
);

// Older plain images become pictures, which have settings, crop and resizing.
function withPictures(n: JSONContent): JSONContent {
  if (!n.content) return n;
  return { ...n, content: n.content.map((c) => (c.type === 'image' && c.attrs?.src ? { type: 'paragraph', content: [{ type: 'picture', attrs: { src: c.attrs.src, alt: c.attrs.alt ?? '', size: 'm' } }] } : withPictures(c))) };
}

// The task always ends with an empty line, so there is somewhere to click and type after the last box or question.
export const TrailingLine = Extension.create({
  name: 'trailingLine',
  onCreate() {
    const { state, view } = this.editor;
    const last = state.doc.lastChild;
    if (!last || last.type.name !== 'paragraph' || last.content.size) view.dispatch(state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create()).setMeta('addToHistory', false));
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingLine'),
        appendTransaction: (_trs, _old, state) => {
          const last = state.doc.lastChild;
          if (last && last.type.name === 'paragraph' && last.content.size === 0) return null;
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create()).setMeta('addToHistory', false);
        },
      }),
    ];
  },
});

// The toolbar is one stop for Tab: ← → Home End move between its tools (as in Google Docs),
// Enter or Space uses one, Escape goes back to the text. A tool's panel (colours, symbols,
// pronunciation) gets the keys while it is open: arrows move in it, Escape closes it.
const TB_TOOL = ':scope > .tb-slot > button, :scope > .tb-slot > * > button.tool, :scope > button.tool, :scope > .tb-more-tools';
function toolbarTools(bar: HTMLElement) {
  return Array.from(bar.querySelectorAll<HTMLElement>(TB_TOOL)).filter((b) => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden');
}
function toolbarFocus(e: React.FocusEvent<HTMLDivElement>) {
  const bar = e.currentTarget;
  const tools = toolbarTools(bar);
  if (!tools.includes(e.target as HTMLElement)) return;
  tools.forEach((b) => ((b.tabIndex = b === e.target ? 0 : -1), (b.dataset.tbStop = b === e.target ? '1' : '')));
}
function toolbarClick(e: React.MouseEvent<HTMLDivElement>) {
  // From the keyboard (no pointer): a panel that opens gets the focus.
  if (e.detail !== 0) return;
  const slot = (e.target as HTMLElement).closest('.tb-slot');
  window.setTimeout(() => slot?.querySelector<HTMLElement>('.hl-pop button, .hl-pop input')?.focus(), 0);
}
function toolbarKeys(e: React.KeyboardEvent<HTMLDivElement>, editor: Editor) {
  const bar = e.currentTarget;
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' && e.key !== 'Escape') return; // "Start at" and other boxes type normally
  const pop = t.closest('.hl-pop');
  if (pop) {
    const btns = Array.from(pop.querySelectorAll<HTMLElement>('button:not([disabled]), input'));
    const i = btns.indexOf(t);
    const go = (j: number) => (e.preventDefault(), e.stopPropagation(), btns[(j + btns.length) % btns.length]?.focus());
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const tool = pop.closest('.tb-slot')?.querySelector<HTMLElement>('button');
      tool?.click();
      tool?.focus();
    }
    return;
  }
  const tools = toolbarTools(bar);
  const i = tools.indexOf(t);
  if (i < 0) return;
  const go = (j: number) => {
    e.preventDefault();
    const b = tools[Math.max(0, Math.min(tools.length - 1, j))];
    tools.forEach((x) => ((x.tabIndex = x === b ? 0 : -1), (x.dataset.tbStop = x === b ? '1' : '')));
    b.focus();
  };
  if (e.key === 'ArrowRight') go(i + 1 >= tools.length ? 0 : i + 1);
  else if (e.key === 'ArrowLeft') go(i - 1 < 0 ? tools.length - 1 : i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(tools.length - 1);
  else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    editor.commands.focus();
  }
}

export function TaskEditor({ content, onChange, places = [], classmates = [], classId = '', lessonId = '', taskContext = '', taskTitle = '', onNotebook, onBank, onPickBank, placeholder, handles = true, compact = false, textOnly = false, enterHint, label = 'Task' }: { label?: string; enterHint?: 'send' | 'enter' | 'done'; textOnly?: boolean; compact?: boolean; handles?: boolean; placeholder?: string; content: JSONContent; onChange: (c: JSONContent) => void; places?: LinkPlace[]; classmates?: { id: string; name: string }[]; classId?: string; lessonId?: string; taskContext?: string; taskTitle?: string; onNotebook?: (word: string, sentence: string) => void; onBank?: (nodes: JSONContent[]) => void; onPickBank?: (insert: (nodes: JSONContent[]) => void) => void }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3] }, orderedList: false, listItem: false }),
      // A list item may start with a dialogue (1. A: … B: …) as well as a paragraph.
      ListItem.extend({ content: '(paragraph | dialogue) block*' }),
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
      DiagramNode,
      DiagramCell,
      DialogueNode,
      DialogueLine,
      Mention,
      ...(handles ? [TrailingLine] : []),
      RevealBox,
      SubTask,
      StoryboardNode,
      ...PDF_NODES,
      LinkCard,
      MediaBlock,
      InlineMedia,
      SpeakingBlock,
      UploadBlock,
      CollabBlock,
      Link.configure({ openOnClick: false, autolink: true, protocols: ['https'], HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Stress,
      ...LANG_MARKS,
      DictCut,
      TTNode,
      Ipa,
      LessonLink,
      jsonClip(Reflect, 'div', 'data-reflect'),
      FreshIds,
      Placeholder.configure({ placeholder: placeholder ?? 'Write the task. Type / for a question, list or image.' }),
    ],
    content: withPictures(content),
    onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, ...(enterHint ? { enterkeyhint: enterHint } : {}) },
      // Word and Outlook: real lists and paragraphs, without Office markup or empty lines.
      transformPastedHTML: cleanPastedHTML,
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
      const uid = auth.currentUser?.uid;
      // Outside a class (notes, documents) the picture sits in the page; a copy goes into My files.
      for (const f of files) {
        if (classRef.current) srcs.push(await uploadPicture(classRef.current, f));
        else {
          srcs.push(await imageToData(f, 1100));
          if (uid) void uploadPicture('user:' + uid, f).catch(() => {});
        }
      }
      insertPictures(ed, srcs);
    } catch {
      void tell('We couldn’t upload the picture. Try a smaller one.');
    }
  }
  const [picOpen, setPicOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  useEffect(() => {
    const open = () => setPdfOpen(true);
    window.addEventListener('ll:add-pdf', open);
    return () => window.removeEventListener('ll:add-pdf', open);
  }, []);
  useEffect(() => {
    const open = () => setPicOpen(true);
    window.addEventListener('ll:add-picture', open);
    return () => window.removeEventListener('ll:add-picture', open);
  }, []);

  const bankCmds = useMemo<Cmd[]>(
    () => (onPickBank ? [{ key: 'bankpick', label: 'From my question bank…', hint: 'Insert a saved question or task', group: 'Questions', run: (e) => onPickBank((nodes) => e.chain().focus().insertContent(nodes).run()) }] : []),
    [onPickBank],
  );
  const training = useTrainingClass(classId);
  const slash = useSlash(editor, bankCmds, textOnly, training);
  const toolPlace = useToolGate();
  // The extra tools are out by default; closing them is remembered on this device.
  const [moreOpen, setMoreOpenState] = useState(() => {
    try {
      return localStorage.getItem('ll.tb.more') !== '0';
    } catch {
      return true;
    }
  });
  const setMoreOpen = (f: (v: boolean) => boolean) =>
    setMoreOpenState((v) => {
      const n = f(v);
      try {
        localStorage.setItem('ll.tb.more', n ? '1' : '0');
      } catch {
        /* fine */
      }
      return n;
    });
  const [gallery, setGallery] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [defOpen, setDefOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const mention = useMentionMenu(editor, classmates, !classId.startsWith('chat:'));
  // Editor shortcuts: ⌘K link, Alt+↑/↓ move the current block (the same in shared documents).
  useEditorKeys(editor, () => {
    if (!editor || (editor.state.selection.empty && !editor.isActive('lessonLink') && !editor.isActive('link'))) return false;
    setLinkOpen(true);
    return true;
  });
  const classCtx = useMemo(() => ({ classmates, classId, lessonId, taskContext, taskTitle }), [classmates, classId, lessonId, taskContext, taskTitle]);

  // A narrow toolbar (in a chat): the tools that fit, and an arrow that opens the rest on new lines.
  const tbRef = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsOver, setToolsOver] = useState(false);
  useEffect(() => {
    const el = tbRef.current;
    if (!compact || !el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      const kids = Array.from(el.children).filter((k) => !(k as HTMLElement).classList.contains('tb-more-tools')) as HTMLElement[];
      kids.forEach((k) => (k.style.visibility = ''));
      // A slot has no box of its own (display: contents): measure the tool in it.
      const box = (k: HTMLElement) => ((getComputedStyle(k).display === 'contents' ? k.firstElementChild : k) as HTMLElement | null)?.getBoundingClientRect();
      const rows = kids.map(box).filter((b): b is DOMRect => !!b && b.width > 0);
      const top = rows.length ? Math.min(...rows.map((b) => b.top)) : r.top;
      const over = kids.filter((k) => {
        const b = box(k);
        return !!b && b.width > 0 && (b.right > r.right - 34 || b.top > top + 6);
      });
      setToolsOver(over.length > 0);
      // Closed: a tool that only partly fits is hidden, so the row ends cleanly at the arrow.
      if (!toolsOpen) over.forEach((k) => (k.style.visibility = 'hidden'));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact, editor, toolsOpen]);
  // One Tab stop for the whole toolbar: the tool used last, or the first.
  useEffect(() => {
    const bar = tbRef.current;
    if (!bar) return;
    const tools = toolbarTools(bar);
    if (!tools.length) return;
    const keep = tools.find((b) => b.tabIndex === 0 && b === document.activeElement) ?? tools.find((b) => b.dataset.tbStop === '1') ?? tools[0];
    tools.forEach((b) => {
      b.tabIndex = b === keep ? 0 : -1;
      b.dataset.tbStop = b === keep ? '1' : '';
    });
  });
  if (!editor) return null;

  return (
    <EditorClassContext.Provider value={classCtx}>
    <div className={'task-editor' + (handles ? ' with-handles' : '')}>
      <div ref={tbRef} className={'toolbar' + (compact ? ' tb-compact' + (toolsOpen ? ' open' : '') : '')} role="toolbar" aria-label="Formatting" aria-orientation="horizontal" onKeyDown={(e) => toolbarKeys(e, editor)} onClickCapture={(e) => toolbarClick(e)} onFocus={(e) => toolbarFocus(e)}>
        {(() => {
          const tools: [string, React.ReactNode][] = [
            ['bold', BTN('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b className="ti ti-b">B</b>)],
            ['italic', BTN('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i className="ti ti-i">I</i>)],
            ['underline', BTN('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <u className="ti ti-u">U</u>)],
            ['strike', BTN('Strikethrough', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <s className="ti ti-s">S</s>)],
            ['color', <TextColorTool key="c" editor={editor} />],
            ['highlight', <HighlightTool key="h" editor={editor} />],
            ['heading', BTN('Heading', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), TOOL_FACE.heading)],
            ['bullets', BTN('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), ICON_LIST)],
            ['numbers', BTN('Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ICON_OL)],
            ['table', BTN('Insert a table', editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), TOOL_FACE.table)],
            [
              'definition',
              BTN(
                editor.isActive('definition') ? 'Edit the definition' : 'Add a definition to the selected word',
                editor.isActive('definition'),
                () => {
                  if (editor.state.selection.empty && !editor.isActive('definition')) {
                    void tell('Select a word or phrase first, then add its definition.');
                    return;
                  }
                  setDefOpen(true);
                },
                TOOL_FACE.definition,
              ),
            ],
            [
              'link',
              BTN(
                editor.isActive('lessonLink') || editor.isActive('link') ? 'Change the link' : 'Link the selected words to another task or a web page',
                editor.isActive('lessonLink') || editor.isActive('link'),
                () => {
                  if (editor.state.selection.empty && !editor.isActive('lessonLink') && !editor.isActive('link')) {
                    void tell('Select the words to link first.');
                    return;
                  }
                  setLinkOpen(true);
                },
                TOOL_FACE.link,
              ),
            ],
            ['sep', <span key="sep" className="tool-sep" />],
            ...(!textOnly
              ? ([
                  // Every question type behind one button, as pronunciation is.
                  [
                    'questions',
                    <button
                      key="q"
                      type="button"
                      className="tool tb-qs"
                      aria-haspopup="menu"
                      aria-label="Questions" data-tip="Questions: gaps, choices, matching and more"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => openMenuAt(e.currentTarget, COMMANDS.filter((c) => c.group === 'Questions' && !['collab', 'collab-slides', 'upload', 'board', 'postits', 'bankpick'].includes(c.key)).map((c) => ({ label: c.label, hint: c.hint, icon: '', onClick: () => c.run(editor) })))}
                    >
                      {TOOL_FACE.questions}
                    </button>,
                  ],
                ] as [string, React.ReactNode][])
              : []),
            ['icons', <IconTool key="i" editor={editor} />],
            ['symbols', <SymbolTool key="s" editor={editor} />],
            ['pron', <ProsodyTool key="p" editor={editor} />],
            ...(!textOnly ? ([['add', BTN('Everything you can add, with pictures', false, () => setGallery(true), TOOL_FACE.add)]] as [string, React.ReactNode][]) : []),
          ];
          const shown = tools.filter(([k]) => toolPlace(k) === 'show');
          const more = tools.filter(([k]) => toolPlace(k) === 'more');
          return (
            <>
              {shown.map(([k, n]) => (
                <span key={k} className="tb-slot">
                  {n}
                </span>
              ))}
              {moreOpen && more.length > 0 && <span className="tool-sep tb-extra-sep" aria-hidden="true" />}
              {moreOpen &&
                more.map(([k, n]) => (
                  <span key={k} className="tb-slot tb-extra">
                    {n}
                  </span>
                ))}
              {more.length > 0 && (
                <button type="button" className={'tool tb-more-arrow' + (moreOpen ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-label={moreOpen ? 'Fewer tools' : 'More tools'} data-tip={moreOpen ? `Fewer tools: hide ${more.length === 1 ? 'the extra tool' : `the ${more.length} extra tools`}` : `More tools: ${more.length} more`}>
                  <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                    <path d={moreOpen ? 'M7.5 3l-3 3 3 3' : 'M4.5 3l3 3-3 3'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {!moreOpen && <span className="tb-more-n">{more.length}</span>}
                </button>
              )}
            </>
          );
        })()}
        {compact && (toolsOver || toolsOpen) && (
          <button type="button" className={'tb-more-tools' + (toolsOpen ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen} aria-label={toolsOpen ? 'Fewer tools' : 'All the tools'} data-tip={toolsOpen ? 'Fewer tools' : 'All the tools'}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
      {picOpen && editor && <PictureDialog editor={editor} classId={classId} onClose={() => setPicOpen(false)} />}
      {pdfOpen && editor && <PdfPick classId={classId} onClose={() => setPdfOpen(false)} onPick={(n) => (setPdfOpen(false), editor.chain().focus().insertContent([n, { type: 'paragraph' }]).run())} />}
      {gallery && (
        <InsertGallery
          commands={[...COMMANDS, ...bankCmds].filter((c) => training || !c.key.startsWith('tt-'))}
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
        {!editor.view.dom.closest('.text-only') && <SlashMenu editor={editor} slash={slash} />}
      </div>
    </div>
    </EditorClassContext.Provider>
  );
}

type Slash = ReturnType<typeof useSlash>;
// The "/" menu: arrows to move, Enter to choose, Esc to close.
export function SlashMenu({ editor, slash, groups }: { editor: Editor; slash: Slash; groups?: { k: Cmd['group']; label: string }[] }) {
  // The mouse only takes over when it really moves, not when the list scrolls under a still pointer.
  const mouse = useRef(false);
  useEffect(() => {
    if (!slash.state) return;
    const n = slash.items.length;
    const onKey = (e: KeyboardEvent) => {
      if (!slash.state || composing(e)) return;
      const go = (i: number) => (e.preventDefault(), e.stopPropagation(), (mouse.current = false), slash.setIndex(((i % n) + n) % n));
      if (e.key === 'ArrowDown') go(slash.index + 1);
      else if (e.key === 'ArrowUp') go(slash.index - 1);
      else if (e.key === 'PageDown') go(Math.min(n - 1, slash.index + 6));
      else if (e.key === 'PageUp') go(Math.max(0, slash.index - 6));
      else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        slash.choose(slash.items[slash.index]);
      } else if (e.key === 'Escape') {
        // Only the menu closes, not the window the editor is in.
        e.preventDefault();
        e.stopPropagation();
        slash.close();
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [editor, slash]);
  // Screen readers: the editor points at the highlighted choice.
  useEffect(() => {
    const dom = editor.view.dom;
    if (!slash.state) {
      if (dom.getAttribute('aria-activedescendant')?.startsWith('slash-')) dom.removeAttribute('aria-activedescendant');
      return;
    }
    dom.setAttribute('aria-activedescendant', 'slash-o-' + slash.index);
  }, [editor, slash.state, slash.index]);

  const slashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    slashRef.current?.querySelector('.slash-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [slash.index, slash.state]);

  if (!slash.state) return null;
  return createPortal(
          <div ref={slashRef} id="slash-list" className="slash slash-float" role="listbox" aria-label="Insert" onMouseMove={() => (mouse.current = true)} style={window.innerHeight - slash.state.top < 320 && slash.state.above > 320 ? { bottom: window.innerHeight - slash.state.above + 6, left: Math.max(8, Math.min(slash.state.left - 8, window.innerWidth - 298)) } : { top: slash.state.top + 6, left: Math.max(8, Math.min(slash.state.left - 8, window.innerWidth - 298)) }}>
            {(slash.items.some((c) => c.key === '__more') ? (['Top', 'More'] as const) : (groups ? groups.map((x) => x.k) : (['Questions', 'Text', 'Blocks'] as const))).map((g) => {
              const list = g === 'Top' ? slash.items.filter((c) => c.key !== '__more') : slash.items.filter((c) => c.group === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  {g !== 'More' && <span className="slash-group">{groups?.find((x) => x.k === g)?.label ?? (g === 'Blocks' ? 'Lesson boxes' : g === 'Top' ? 'You use these most' : g)}</span>}
                  {list.map((c) => {
                    const i = slash.items.indexOf(c);
                    return (
                      <div
                        key={c.key}
                        id={'slash-o-' + i}
                        role="option"
                        aria-selected={i === slash.index}
                        className={'slash-item' + (i === slash.index ? ' on' : '') + (c.key === '__more' ? ' slash-more' : '')}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          slash.choose(c);
                        }}
                        onMouseMove={() => mouse.current && i !== slash.index && slash.setIndex(i)}
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
        );
}
