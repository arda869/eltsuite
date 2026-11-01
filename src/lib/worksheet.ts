import { credit } from './brand';
import type { TlAttrs } from '../editor/Timeline';
import type { SbAttrs } from '../storyboard/StoryboardNode';
import { listLabel } from './listLabel';
import type { JSONContent } from '@tiptap/react';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle, SectionType, ImageRun } from 'docx';
import type { ExportTask } from './textformat';
import { packAnswerText, scorePack, splitPack, type PackKind } from './pack';
import type { DefData } from '../editor/Definition';
import { highlightBg } from '../editor/Highlight';
import { textColor } from '../editor/TextColor';
import { prosodyAttrs } from '../editor/Prosody';
import { glabelAttrs } from '../editor/Symbols';
import { translationsFor } from './langs';

// Printable worksheets. A task becomes a list of blocks: paragraphs made of runs (text or a
// blank), word boxes, two-column matching, ruled lines, and the answer key.

export type Run = {
  t?: string;
  blank?: number;
  options?: string[];
  stack?: string[];
  num?: number;
  bold?: boolean;
  italic?: boolean;
  u?: boolean; // underline
  s?: boolean; // strikethrough
  hl?: string; // highlight colour
  color?: string; // text colour
  def?: boolean; // a word with a definition (listed under the exercise)
  ipa?: { text: string; accent: string; show: boolean };
  stress?: { syl: string[]; on: number; style: string };
  icon?: { name: string; tone: string };
  sym?: { text: string; shape: string; tone: string };
  pic?: { src: string; size: string; label: string; alt?: string; key?: string; crop?: string; filter?: string; pts?: { x: number; y: number }[]; tags?: { x: number; y: number; text: string }[] };
  kw?: boolean; // a key word in a frame, as on screen
  stem?: boolean; // the word to change, in a small grey tag // key: the picture as edited (crop, colour)
  ex?: boolean; // the answer of an example, written in
  letters?: string; // letter gaps: the pattern, "_" for each letter to write
  wrap?: Record<string, string>[]; // pronunciation marks and grammar labels, as on screen
  pl?: { k: string; s: string }; // linking between words, or a pause
  subs?: string[]; // a substitution slot
  phon?: { type: string; a: Record<string, unknown> }; // the phonemic chart or a sound card
};
export type Block =
  | { kind: 'p'; runs: Run[]; n?: number; heading?: boolean; list?: 'bullet' | 'number'; mark?: string }
  | { kind: 'box'; words: string[]; label: string }
  | { kind: 'match'; left: string[]; right: string[]; n: number }
  | { kind: 'lines'; n: number; count: number; prompt?: string }
  | { kind: 'table'; rows: string[][]; head?: boolean; cells?: Run[][][] }
  | { kind: 'note'; text: string }
  | { kind: 'callout'; label: string; tone: string; symbol: string; style: string; blocks: Block[]; box?: Record<string, unknown> }
  | { kind: 'glossary'; items: { word: string; d: DefData }[] }
  | { kind: 'dict'; word: string; d: DefData }
  | { kind: 'form'; title?: string; peer?: boolean; items: FormItem[] }
  | { kind: 'draw'; prompt?: string }
  | { kind: 'timeline'; a: TlAttrs }
  | { kind: 'storyboard'; a: SbAttrs }
  | { kind: 'diagram'; dkind: string; title: string; labels: string[]; cells: { label: string; blocks: Block[] }[] }
  | { kind: 'media'; id: string; title: string; video: boolean; mode: string }
  | { kind: 'subtask'; letter: string; text: string; blocks: Block[] };

// Self-reflection, peer feedback and surveys on paper.
export type FormItem = { type: 'stars' | 'faces' | 'thumbs' | 'scale' | 'choice' | 'checklist' | 'rank' | 'text'; prompt: string; options?: string[]; points?: number; low?: string; high?: string };
export type CutCard = { title: string; blocks: Block[] };
export type WsTask = { online?: string[]; title: string; instructions?: string; instrRuns?: Run[]; notes?: string; media?: string[]; blocks: Block[]; answers: { n: number; text: string }[]; marks: number; cutouts?: { mode: string; symbol: string; cards: CutCard[] }[] };
export type WsItem = { kind: 'section'; title: string } | { kind: 'task'; task: WsTask };
export type Paper = 'A4' | 'Letter' | 'A5';
// Uploaded pictures, read before printing: "media:<id>" → the picture and its size.
export type MediaMap = Record<string, { data: string; w: number; h: number }>;
// Sounds and videos: a QR code that opens them, and their script for the answer key.
export type MediaInfo = { url: string; svg: string; png: string; title: string; video: boolean; script: string[] };
export type Options = { lessonStyle?: import('./lessonStyle').LessonStyle; header: boolean; key: boolean; notes?: boolean; media?: MediaMap; sounds?: Record<string, MediaInfo>; qr?: boolean; taskIds?: string[]; paper?: Paper; accent?: string; className?: string; level?: string; columns?: 1 | 2; marks?: boolean; exam?: boolean; cover?: string; origin?: string; size?: 'standard' | 'large' | 'xl'; clear?: boolean };

const abc = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });
// The same order every time for the same words (a jumbled sentence stays jumbled the same way).
const seeded = (list: string[], seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) | 0;
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const LET = 'abcdefghijklmnop';
const UP = 'ABCDEFGHIJKLMNOP';
const text = (n?: JSONContent): string => (n ? (n.text ?? '') + (n.content ?? []).map(text).join('') : '');

// Gap lengths a teacher can choose for paper (in the units the print uses for a blank).
const GAP: Record<string, number> = { short: 8, medium: 18, long: 36 };
// Elements that only work on a screen, by name, for the note in the worksheet view.
const ONLINE: Record<string, string> = { mcq: 'Quiz', reveal: 'Reveal', phonChart: 'Phonemic chart', phonCard: 'Sound card', lessonLink: 'Link to another task', refList: 'Reference list', stress: 'Word stress', poll: 'Poll' };

export function flattenTask(t: ExportTask, lessonStyle: import('./lessonStyle').LessonStyle = 'adult'): WsTask {
  const blocks: Block[] = [];
  let cur: Block[] = blocks;
  const answers: { n: number; text: string }[] = [];
  let n = 0;
  let marks = 0;
  const cutouts: NonNullable<WsTask['cutouts']> = [];
  // Every word to drag in the task, read first: the word box usually comes before its gaps.
  const bank: string[] = [];
  const findDrops = (x: JSONContent) => {
    if (x.type === 'dropgap' && x.attrs?.answer) bank.push(String(x.attrs.answer));
    x.content?.forEach(findDrops);
  };
  findDrops(t.content);
  // Words with a definition: listed under the exercise, since paper can't be tapped.
  const glossary: { word: string; d: DefData; key: string }[] = [];
  const picCount: Record<string, number> = {};
  const mediaUsed: string[] = [];
  const online: string[] = []; // what only works on a screen, left off the paper
  let subN = 0; // sub-tasks so far: a, b, c
  let lastDef = '';
  const runsOf = (nodes: JSONContent[] | undefined): Run[] => {
    const out: Run[] = [];
    for (const node of nodes ?? []) {
      const a = node.attrs ?? {};
      switch (node.type) {
        case 'text': {
          const mk = (k: string) => node.marks?.find((m) => m.type === k);
          const hl = mk('highlight');
          const tc = mk('textColor');
          const def = mk('definition');
          const d = (def?.attrs?.data ?? {}) as DefData;
          const run: Run = { t: node.text ?? '', bold: !!mk('bold'), italic: !!mk('italic'), u: !!mk('underline'), s: !!mk('strike'), ...(hl ? { hl: highlightBg(hl.attrs?.color) } : {}), ...(tc ? { color: textColor(tc.attrs?.color) } : {}) };
          const wrap = (node.marks ?? []).map((m) => (m.type === 'glabel' ? glabelAttrs(m.attrs) : prosodyAttrs(m.type, m.attrs))).filter((x): x is Record<string, string> => !!x);
          if (wrap.length) run.wrap = wrap;
          if (def && Object.values(d).some((v) => typeof v === 'string' && v.trim())) {
            run.def = true;
            const key = JSON.stringify(d);
            const last = glossary[glossary.length - 1];
            if (last && last.key === key && lastDef === key) last.word += node.text ?? '';
            else glossary.push({ word: node.text ?? '', d, key });
            lastDef = key;
          } else lastDef = '';
          out.push(run);
          break;
        }
        case 'gap':
        case 'choice':
          if (a.example) {
            // An example: 0, with the answer written in. Not in the key and not marked.
            const opts: string[] = a.options ?? [];
            const correct: number[] = Array.isArray(a.correct) ? a.correct : [a.correct];
            const ans = node.type === 'gap' ? (a.answers ?? [])[0] ?? '' : correct.map((i) => opts[i]).filter(Boolean).join(', ');
            out.push({ num: 0 }, { t: ans, italic: true, u: true, ex: true });
            if (a.stem) out.push({ t: ' ' }, { t: String(a.stem), bold: true, kw: true, stem: true }, { t: ' ' });
            break;
          }
          if (node.type === 'choice') {
            n++;
            const opts: string[] = a.options ?? [];
            const correct: number[] = Array.isArray(a.correct) ? a.correct : [a.correct];
            marks++;
            answers.push({ n, text: correct.map((i) => opts[i]).filter(Boolean).join(', ') });
            if (a.display === 'radio') out.push({ num: n }, { stack: opts.map((o, i) => `${LET[i]}  ${o}`) });
            else out.push({ num: n }, { options: opts });
            break;
          }
          {
          n++;
          marks++;
          answers.push({ n, text: (a.answers ?? []).join(' / ') });
          if (a.letters && a.pattern) out.push({ num: n }, { letters: String(a.pattern) });
          else out.push({ num: n }, { blank: GAP[String(t.print?.gap)] ?? Math.max(8, ((a.answers?.[0] ?? '').length + 4) * 2) });
          if (a.stem) out.push({ t: ' ' }, { t: String(a.stem), bold: true, kw: true, stem: true }, { t: ' ' });
          break;
          }
        case 'dropgap': {
          if (a.example) {
            out.push({ num: 0 }, { t: String(a.answer ?? ''), italic: true, u: true, ex: true });
            break;
          }
          n++;
          marks++;
          answers.push({ n, text: a.answer ?? '' });
          out.push({ num: n }, { blank: GAP[String(t.print?.gap)] ?? 14 });
          break;
        }
        case 'inlineMedia':
          if (a.media) out.push({t: `[${a.kind === 'video' ? 'Video' : 'Recording'}: ${a.title || 'Play'}]`});
          break;
        case 'hardBreak':
          out.push({ t: '\n' });
          break;
        default:
          if (node.content) out.push(...runsOf(node.content));
          else if (node.type === 'ipa') out.push({ ipa: { text: String(a.text ?? ''), accent: String(a.accent ?? 'RP'), show: !!a.showAccent } });
          else if (node.type === 'stress') out.push({ stress: { syl: (a.syllables ?? []) as string[], on: Number(a.stressed ?? 0), style: String(a.style ?? 'box') } });
          else if (node.type === 'plink') out.push({ t: a.k === 'pause' ? ' | ' : a.k === 'stop' ? ' || ' : ['j', 'w', 'r'].includes(a.k) ? `‿/${a.k}/‿` : '‿', pl: { k: String(a.k ?? 'link'), s: String(a.s ?? 'under') } });
          else if (node.type === 'phonChart' || node.type === 'phonCard') out.push({ t: node.type === 'phonCard' ? ` /${String(a.sound ?? '')}/ ` : ' [phonemic chart] ', phon: { type: node.type, a: a as Record<string, unknown> } });
          else if (node.type === 'subst') out.push({ t: ` | ${((a.options ?? []) as string[]).join(' / ')} | `, subs: (a.options ?? []) as string[] });
          else if (node.type === 'icon') out.push({ icon: { name: String(a.name ?? ''), tone: String(a.tone ?? 'ink') } });
          else if (node.type === 'picture') {
            const mk = String(a.mark ?? '');
            if (mk) picCount[mk] = (picCount[mk] ?? 0) + 1;
            if (a.src) out.push({ pic: { src: String(a.src), size: String(a.size ?? 'm'), label: mk ? listLabel(picCount[mk], mk) : '', alt: String(a.alt ?? ''), key: picKey(String(a.src), a.crop, a.filter), crop: a.crop || undefined, filter: a.filter || undefined, tags: Array.isArray(a.tags) && a.tags.length ? a.tags.filter((t: { text?: string }) => t.text?.trim()) : undefined } });
            if(a.credit)out.push({t:' '+String(a.credit)+' '});
          } else if (node.type === 'sym') out.push({ sym: { text: String(a.text ?? ''), shape: String(a.shape ?? 'box'), tone: String(a.tone ?? 'ink') } });
      }
    }
    return out;
  };
  const walk = (node: JSONContent, list?: 'bullet' | 'number', mark?: string) => {
    const a = node.attrs ?? {};
    // A whole question as an example: printed as usual, numbered 0, with its answer written in.
    if (a.example && ['mcq', 'match', 'order', 'writing', 'pq'].includes(node.type ?? '') && !(node.type === 'pq' && a.kind === 'speaking')) {
      const n0 = n;
      const m0 = marks;
      const al = answers.length;
      const cl = cur.length;
      walk({ ...node, attrs: { ...a, example: false } }, list, mark);
      const got = answers.splice(al);
      n = n0;
      marks = m0;
      const made = cur.splice(cl).filter((b) => b.kind !== 'lines');
      made.forEach((b) => {
      if (b.kind === 'p') b.runs = b.runs.map((r) => (r.num !== undefined ? { ...r, num: 0 } : r));
        if (b.kind === 'match') b.n = 0;
      });
      cur.push(...made);
      const ans = node.type === 'writing' ? String(a.model ?? '') : got.map((x) => x.text.replace(/^Model: /, '')).join('; ');
      if (ans) cur.push({ kind: 'p', runs: [{ t: 'Example: ', italic: true }, { t: ans, ex: true }] });
      return;
    }
    switch (node.type) {
      case 'paragraph': {
        const runs = runsOf(node.content);
        if (runs.length) cur.push({ kind: 'p', runs, list, mark });
        return;
      }
      case 'dialogue': {
        // On paper: one line under the other, each with its speaker in bold.
        const sp: string[] = Array.isArray(a.speakers) && a.speakers.length ? a.speakers : ['A', 'B'];
        (node.content ?? []).forEach((ln, k) => {
          const who = sp[Number(ln.attrs?.who) || 0] ?? '';
          if (lessonStyle === 'young') {
            cur.push({ kind: 'callout', label: who, tone: 'grey', symbol: '', style: 'speech', box: { style: 'speech', label: who, side: Number(ln.attrs?.who) % 2 ? 'right' : 'left' }, blocks: [{ kind: 'p', runs: runsOf(ln.content), list, mark: k === 0 ? mark : list ? '' : undefined }] });
          } else {
          cur.push({ kind: 'p', runs: [{ t: who + '   ', bold: true }, ...runsOf(ln.content)], list, mark: k === 0 ? mark : list ? '' : undefined });
          }
        });
        return;
      }
      case 'heading':
        cur.push({ kind: 'p', runs: [{ t: text(node), bold: true }], heading: true });
        return;
      case 'bulletList':
        node.content?.forEach((li) => li.content?.forEach((c, k) => walk(c, 'bullet', k ? '' : undefined)));
        return;
      case 'orderedList': {
        // Keep the teacher's start and style: 4, 5, 6 · d, e, f · iv, v, vi
        const start = typeof a.start === 'number' ? a.start : 1;
        node.content?.forEach((li, i) => li.content?.forEach((c, k) => walk(c, 'number', k ? '' : listLabel(start + i, String(a.listType ?? '1')) + '.')));
        return;
      }
      case 'table':
        // Plain text for Word and puzzles; the formatting (bold, colours…) for the print.
        cur.push({ kind: 'table', rows: (node.content ?? []).map((r) => (r.content ?? []).map((c) => text(c).trim())), cells: (node.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).flatMap((pp, k) => [...(k ? [{ t: ' ' }] : []), ...runsOf(pp.content)]))) });
        return;
      case 'match': {
        n++;
        const pairs: { left: string; right: string }[] = a.pairs ?? [];
        const extras: string[] = a.extras ?? [];
        const right = [...pairs.map((p) => p.right), ...extras].sort(abc);
        marks += pairs.length;
        answers.push({ n, text: pairs.map((p, i) => `${i + 1}–${LET[right.indexOf(p.right)]}`).join(', ') });
        cur.push({ kind: 'match', n, left: pairs.map((p) => p.left), right });
        return;
      }
      case 'wordbank':
        cur.push({ kind: 'box', words: [...bank, ...(a.extras ?? [])].sort(abc), label: 'Words' });
        return;
      case 'order': {
        n++;
        marks++;
        answers.push({ n, text: a.sentence ?? '' });
        const words = seeded(String(a.sentence ?? '').split(/\s+/), String(a.sentence ?? ''));
        cur.push({ kind: 'p', runs: [{ num: n }, { t: words.join(' / '), italic: true }] });
        cur.push({ kind: 'lines', n, count: 1 });
        return;
      }
      case 'writing': {
        n++;
        marks += Number(a.points) || 5;
        answers.push({ n, text: a.model ? 'Model: ' + a.model : '(marked by the teacher)' });
        const words = a.maxWords ?? a.minWords;
        const prompt = words ? `${a.minWords ? a.minWords + '–' : 'up to '}${a.maxWords ?? a.minWords} words` : undefined;
        // The teacher can choose the number of lines, or none (learners write on their own paper).
        const want = t.print?.lines;
        if (want === 0) {
          if (prompt) cur.push({ kind: 'note', text: prompt });
        } else cur.push({ kind: 'lines', n, count: typeof want === 'number' ? want : Math.min(14, Math.max(5, Math.ceil(((words as number) || 100) / 12))), prompt });
        return;
      }
      case 'pq': {
        const kind = a.kind as PackKind;
        const d = a.data ?? {};
        if (kind === 'speaking') {
          cur.push({ kind: 'p', runs: [{ t: 'Speaking: ' + (d.prompt ?? ''), bold: true }] });
          const imgs = ((d.images ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : String((x as { src?: string })?.src ?? ''))).filter(Boolean);
          if (imgs.length) cur.push({ kind: 'p', runs: imgs.map((src) => ({ pic: { src, size: imgs.length > 1 ? 'm' : 'l', label: '' } })) });
          (d.questions ?? []).filter(Boolean).forEach((q: string) => cur.push({ kind: 'p', runs: [{ t: q }], list: 'bullet' }));
          return;
        }
        n++;
        const { pub, key } = splitPack(kind, d, 'ws');
        if (key) answers.push({ n, text: packAnswerText({ kind: 'pack', t: kind, k: key }, pub) });
        if (key) marks += Math.max(1, scorePack({ kind: 'pack', t: kind, k: key }, undefined).max);
        const pre: Run = { num: n };
        switch (kind) {
          case 'fix':
            cur.push({ kind: 'p', runs: [pre, { t: 'Find and correct the mistake: ' }, { t: d.sentence ?? '' }] });
            cur.push({ kind: 'lines', n, count: 1 });
            break;
          case 'categorise':
            cur.push({ kind: 'p', runs: [pre, { t: 'Put each word in the right column.' }] });
            cur.push({ kind: 'box', words: pub.items, label: 'Words' });
            cur.push({ kind: 'table', head: true, rows: [pub.cats, ...Array.from({ length: Math.max(3, Math.ceil(pub.items.length / Math.max(1, pub.cats.length)) + 1) }, () => pub.cats.map(() => ''))] });
            break;
          case 'transform':
            cur.push({ kind: 'p', runs: [pre, { t: d.first ?? '' }] });
            cur.push({ kind: 'p', runs: [{ t: String(d.keyWord ?? '').toUpperCase(), bold: true, kw: true }] });
            cur.push({ kind: 'p', runs: [{ t: (d.before ?? '') + ' ' }, { blank: 24 }, { t: ' ' + (d.after ?? '') }] });
            break;
          case 'highlight':
            cur.push({ kind: 'p', runs: [pre, { t: (d.instruction ?? '') + ' ', bold: true }, { t: pub.toks.join(' ') }] });
            break;
          case 'sentences':
            cur.push({ kind: 'p', runs: [pre, { t: 'Put in the right order:', bold: true }] });
            pub.items.forEach((s: string, i: number) => cur.push({ kind: 'p', runs: [{ t: `${UP[i]}  ${s}` }] }));
            cur.push({ kind: 'lines', n, count: 1 });
            break;
          case 'label':
            cur.push({ kind: 'p', runs: [pre, { t: 'Write the right label next to each number.' }] });
            if (pub.image) cur.push({ kind: 'p', runs: [{ pic: { src: String(pub.image), size: 'full', label: '', pts: pub.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })) } }] });
            cur.push({ kind: 'box', words: pub.labels, label: 'Labels' });
            cur.push({ kind: 'p', runs: pub.points.flatMap((_: unknown, i: number) => [{ t: `${i ? '    ' : ''}${i + 1} ` }, { blank: 12 }]) });
            break;
          case 'odd':
            cur.push({ kind: 'p', runs: [pre, { t: 'Circle the odd one out.' }] });
            cur.push({ kind: 'box', words: pub.words, label: 'Odd one out' });
            break;
          case 'gapped':
            cur.push({ kind: 'p', runs: [pre, { t: String(pub.text ?? '').replace(/\{\{(\d+)\}\}/g, ' [ $1 ] ') }] });
            pub.options.forEach((o: string, i: number) => cur.push({ kind: 'p', runs: [{ t: `${UP[i]}  ${o}` }] }));
            break;
          case 'matching':
            cur.push({ kind: 'p', runs: [pre, { t: `Options: ${pub.options.join(', ')}`, bold: true }] });
            pub.statements.forEach((s: string, i: number) => cur.push({ kind: 'p', runs: [{ t: `${i + 1}. ${s}  ` }, { blank: 4 }] }));
            break;
          case 'dictation':
            cur.push({ kind: 'p', runs: [pre, { t: `Dictation (${pub.count} words): your teacher reads the sentence.` }] });
            cur.push({ kind: 'lines', n, count: 2 });
            break;
          case 'pairs':
            pub.items.forEach((it: { options: string[] }, i: number) => cur.push({ kind: 'p', runs: [i === 0 ? pre : { t: '' }, { t: `${i + 1}. Circle the word you hear: ` }, { t: it.options.join(' / ') }] }));
            break;
          case 'crossword': {
            const rows: string[][] = Array.from({ length: pub.rows }, () => Array(pub.cols).fill('■'));
            pub.clues.forEach((c: { n: number; dir: string; row: number; col: number; len: number }) => {
              for (let i = 0; i < c.len; i++) rows[c.dir === 'across' ? c.row : c.row + i][c.dir === 'across' ? c.col + i : c.col] = i === 0 ? String(c.n) : ' ';
            });
            cur.push({ kind: 'p', runs: [pre, { t: 'Crossword', bold: true }] });
            cur.push({ kind: 'table', rows: [rows[0].map(() => ''), ...rows] });
            (['across', 'down'] as const).forEach((dir) => {
              const list = pub.clues.filter((c: { dir: string }) => c.dir === dir).sort((a: { n: number }, b: { n: number }) => a.n - b.n);
              if (list.length) cur.push({ kind: 'p', runs: [{ t: dir[0].toUpperCase() + dir.slice(1) + ': ', bold: true }, { t: list.map((c: { n: number; clue: string; len: number }) => `${c.n} ${c.clue} (${c.len})`).join('  ·  ') }] });
            });
            break;
          }
          case 'wordsearch': {
            const rows: string[][] = Array.from({ length: pub.size }, (_, r) => (pub.grid as string[]).slice(r * pub.size, (r + 1) * pub.size));
            cur.push({ kind: 'p', runs: [pre, { t: 'Word search', bold: true }] });
            cur.push({ kind: 'table', rows: [rows[0].map(() => ''), ...rows] });
            cur.push({ kind: 'p', runs: [{ t: 'Find: ', bold: true }, { t: pub.clues.map((c: { clue: string; len: number }) => `${c.clue} (${c.len})`).join('  ·  ') }] });
            break;
          }
        }
        return;
      }
      case 'textBox':
      case 'revealBox': {
        const inner: Block[] = [];
        const prev = cur;
        cur = inner;
        node.content?.forEach((c) => walk(c));
        cur = prev;
        if (inner.length) cur.push({ kind: 'callout', label: String(a.label ?? (node.type === 'revealBox' ? a.title ?? '' : '')), tone: String(a.tone ?? 'grey'), symbol: String(a.symbol ?? ''), style: String(a.style ?? 'box'), blocks: inner, ...(node.type === 'textBox' ? { box: a } : {}) });
        return;
      }
      case 'randomPick': {
        // cards, wheels and boxes print as cut-out cards on their own sheet
        const cards: CutCard[] = [];
        const prev = cur;
        node.content?.forEach((c, i) => {
          const inner: Block[] = [];
          cur = inner;
          c.content?.forEach((x) => walk(x));
          cards.push({ title: String(c.attrs?.title || `Card ${i + 1}`), blocks: inner });
        });
        cur = prev;
        cutouts.push({ mode: String(a.mode ?? 'cards'), symbol: String(a.symbol ?? ''), cards });
        return;
      }
      case 'reflect': {
        const items = ((a.items ?? []) as { type: string; prompt: string; options?: string[]; points?: number; low?: string; high?: string }[]).map((it) => ({ ...it, type: (it.type === 'choice' || it.type === 'checklist' || it.type === 'stars' || it.type === 'faces' || it.type === 'scale' ? it.type : 'text') as FormItem['type'], prompt: String(it.prompt ?? '').replace(/\{name\}|\(name\)/gi, 'your classmate') }));
        if (items.length) cur.push({ kind: 'form', title: String(a.title ?? ''), peer: a.about === 'peer', items });
        return;
      }
      case 'survey': {
        const MAP: Record<string, FormItem['type']> = { scale: 'scale', emoji: 'faces', thumbs: 'thumbs', single: 'choice', multi: 'checklist', rank: 'rank', text: 'text' };
        const items = ((a.questions ?? a.items ?? []) as { type: string; prompt: string; options?: string[]; max?: number; low?: string; high?: string }[]).map((q) => ({ type: MAP[q.type] ?? 'text', prompt: String(q.prompt ?? ''), options: q.options, points: q.max, low: q.low, high: q.high }));
        if (items.length) cur.push({ kind: 'form', title: String(a.title ?? ''), items });
        return;
      }
      case 'board':
        // A message board or post-it wall: the question, and room to write.
        if (a.prompt) cur.push({ kind: 'p', runs: [{ t: String(a.prompt) }] });
        cur.push({ kind: 'lines', n: 0, count: 3 });
        return;
      case 'timeline':
        cur.push({ kind: 'timeline', a: a as TlAttrs });
        return;
      case 'storyboard':
        if ((a as SbAttrs).snap?.scenes?.length) cur.push({ kind: 'storyboard', a: a as SbAttrs });
        return;
      case 'diagram': {
        // Each box keeps what is in it, gaps and all; the drawing is made around them.
        const prev = cur;
        const cells = (node.content ?? []).map((c) => {
          const inner: Block[] = [];
          cur = inner;
          (c.content ?? []).forEach((k) => walk(k));
          return { label: String(c.attrs?.label ?? ''), blocks: inner };
        });
        cur = prev;
        cur.push({ kind: 'diagram', dkind: String(a.kind ?? 'mind'), title: String(a.title ?? ''), labels: Array.isArray(a.labels) ? a.labels.map(String) : [], cells });
        return;
      }
      case 'drawBoard':
        cur.push({ kind: 'draw', prompt: String(a.prompt ?? '') });
        return;
      case 'collab':
        cur.push({ kind: 'note', text: `${a.title ? a.title + ': ' : ''}a shared document, written together in ELT Suite.` });
        cur.push({ kind: 'lines', n: 0, count: 6 });
        return;
      case 'upload': {
        const kinds = (a.kinds ?? []) as string[];
        const what = kinds.includes('any') || !kinds.length ? 'your file' : kinds.map((k) => ({ documents: 'a document', pictures: 'a photo', sound: 'a recording', video: 'a video' })[k] ?? k).join(' or ');
        cur.push({ kind: 'note', text: `${a.note ? a.note + ' ' : ''}Hand in ${what} in ELT Suite.` });
        return;
      }
      case 'subTask': {
        // A part of the exercise: a, b, c, each with its own instruction and its questions under it.
        const inner: Block[] = [];
        const prev = cur;
        cur = inner;
        node.content?.forEach((c) => walk(c));
        cur = prev;
        cur.push({ kind: 'subtask', letter: String.fromCharCode(97 + (subN++ % 26)), text: String(a.instr ?? ''), blocks: inner });
        return;
      }
      case 'media':
        if (a.media) {
          cur.push({ kind: 'media', id: String(a.media), title: String(a.title || (a.kind === 'video' ? 'Video' : 'Listening')), video: a.kind === 'video', mode: String(a.scriptMode || 'karaoke') });
          mediaUsed.push(String(a.media));
        }
        return;
      case 'dictCut':
        if (a.word || Object.keys(a.data ?? {}).length) cur.push({ kind: 'dict', word: String(a.word ?? ''), d: (a.data ?? {}) as DefData });
        return;
      case 'linkCard':
        if (a.url) cur.push({ kind: 'p', runs: [{ t: '▸ ', bold: true }, { t: String(a.title || a.url), bold: true }, ...(a.title ? [{ t: `  ${a.url}`, italic: true }] : []), ...(a.note ? [{ t: ` · ${a.note}` }] : [])] });
        return;
      case 'bankLink':
        return;
      case 'image':
        if (a.src) cur.push({ kind: 'p', runs: [{ pic: { src: String(a.src), size: 'l', label: '', alt: String(a.alt ?? '') } }] });
        return;
      case 'columnBreak':
        return;
      default:
        if (node.content) node.content.forEach((c) => walk(c));
        else if (node.type && ONLINE[node.type]) online.push(ONLINE[node.type]);
    }
  };
  // A formatted instruction keeps its bold, colour, IPA and word stress on paper too.
  // An instruction written for paper replaces the online one.
  const paperInstr = t.print?.instr?.trim();
  const instrRuns = paperInstr ? undefined : t.instrDoc ? (t.instrDoc.content ?? []).flatMap((p, i) => [...(i ? [{ t: ' ' }] : []), ...runsOf(p.content)]) : undefined;
  (t.content.content ?? []).forEach((c) => walk(c));
  const inlineRefs = (node: JSONContent) => {
    if (node.type === 'inlineMedia' && node.attrs?.media && !mediaUsed.includes(String(node.attrs.media))) {
      const a = node.attrs; mediaUsed.push(String(a.media));
      blocks.push({kind:'media',id:String(a.media),title:String(a.title || 'Video'),video:a.kind === 'video',mode:String(a.scriptMode || 'none')});
    }
    node.content?.forEach(inlineRefs);
  };
  inlineRefs(t.content); if (t.instrDoc && !paperInstr) inlineRefs(t.instrDoc);
  if (glossary.length) blocks.push({ kind: 'glossary', items: glossary.map(({ word, d }) => ({ word: word.trim(), d })) });
  return { ...(online.length ? { online: [...new Set(online)] } : {}), title: t.title, instructions: paperInstr || t.instructions, ...(instrRuns?.length ? { instrRuns } : {}), ...(t.notes?.trim() ? { notes: t.notes.trim() } : {}), ...(mediaUsed.length ? { media: mediaUsed } : {}), blocks, answers, marks, ...(cutouts.length ? { cutouts } : {}) };
}

// The lesson as printed: section headings followed by their tasks. A section is kept only
// when at least one of its tasks is printed.
export function flattenWithSections(tasks: ExportTask[], ids?: Set<number>, lessonStyle: import('./lessonStyle').LessonStyle = 'adult'): WsItem[] {
  const out: WsItem[] = [];
  let pending: string | null = null;
  tasks.forEach((t, i) => {
    if (t.kind === 'section') return void (pending = t.title);
    if (t.hidden || t.print?.show === 'screen' || (ids && !ids.has(i))) return;
    if (pending !== null) out.push({ kind: 'section', title: pending }), (pending = null);
    out.push({ kind: 'task', task: flattenTask(t, lessonStyle) });
  });
  return out;
}

export function flattenLesson(tasks: ExportTask[], ids?: Set<number>) {
  return tasks.map((t, i) => ({ t, i })).filter(({ t, i }) => t.kind !== 'section' && !t.hidden && t.print?.show !== 'screen' && (!ids || ids.has(i))).map(({ t }) => flattenTask(t));
}

// ---------------------------------------------------------------- DOCX

export async function lessonDocx(title: string, items: WsItem[], opts: Options): Promise<Blob> {
  // Word keeps the same look as the print version: serif text, the class colour for numbers and
  // labels, tinted boxes. Fonts that ship with Word and Google Docs are used so it looks right anywhere.
  const ACC = (opts.accent ?? '#d98f63').replace('#', '').toUpperCase();
  // Same mixes as the printed page: a darker accent for text, a pale accent for boxes.
  const mix = (hex: string, other: number, t: number) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + other * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  const ACC_INK = mix(ACC, 0, 0.28);
  const ACC_TINT = mix(ACC, 255, 0.9);
  // List items: bullets as Word bullets; numbered items keep the teacher's own labels (4. · d. · iv.).
  const listParas = (b: Extract<Block, { kind: 'p' }>) => {
    if (b.list === 'bullet' && b.mark === undefined) return { bullet: { level: 0 } };
    if (!b.list) return {};
    return { indent: { left: 400, hanging: b.mark ? 400 : 0 }, tabStops: [{ type: 'left' as never, position: 400 }] };
  };
  // Our fonts, embedded in the file so Word shows them even where they are not installed
  // (Google Docs has both as Google Fonts).
  // The clearer (dyslexia-friendly) version uses Verdana throughout, which every computer has.
  const SERIF = opts.clear ? 'Verdana' : 'Fraunces';
  const SANS = opts.clear ? 'Verdana' : 'Karla';
  const K = { standard: 1, large: 1.2, xl: 1.4 }[opts.size ?? 'standard'];
  const S = (n: number) => Math.round(n * K);
  const fontData = async (f: string) => new Uint8Array(await (await fetch(`/fonts/${f}`)).arrayBuffer()) as unknown as Buffer;
  const embedded = await Promise.all([fontData('Fraunces-Regular.ttf'), fontData('Karla-Regular.ttf')]).then(
    ([fr, ka]) => [
      { name: 'Fraunces', data: fr },
      { name: 'Karla', data: ka },
    ],
    () => [],
  );
  const label = (t: string) => new TextRun({ text: t.toUpperCase(), bold: true, font: SANS, size: S(15), color: '8A847D', characterSpacing: 30 });
  const runsToDocx = (runs: Run[]) =>
    runs.flatMap((r) => {
      if (r.letters) return [new TextRun({ text: ' ' + Array.from(r.letters).map((c) => (c === '_' ? '_' : c === ' ' ? '  ' : c)).join(' ') + ' ', font: SANS })];
      if (r.blank) return [new TextRun({ text: '\u00A0'.repeat(Math.max(6, Math.min(18, Math.round(r.blank * 0.6)))), underline: {} })];
      if (r.options) return [new TextRun({ text: ' ' + r.options.join('  /  ') + ' ', font: SANS, size: S(20) })];
      if (r.stack) return r.stack.map((o) => new TextRun({ text: '      ' + o, break: 1, font: SERIF }));
      if (r.num !== undefined) return [new TextRun({ text: ` ${r.num} `, bold: true, font: SERIF, color: ACC_INK })];
      const q = /^\s*\((\d+)\)\s*$/.exec(r.t ?? '');
      if (q) return [new TextRun({ text: ` ${q[1]} `, bold: true, font: SANS, size: S(16), color: ACC, superScript: false })];
      const IPA_FONT = 'Segoe UI';
      if (r.ipa) return [...(r.ipa.show ? [new TextRun({ text: (r.ipa.accent === 'GA' ? 'US' : 'UK') + ' ', bold: true, font: SANS, size: S(14), color: ACC_INK })] : []), new TextRun({ text: `/${r.ipa.text}/`, font: IPA_FONT, color: '6F6A64' })];
      // Word stress: the stressed syllable in bold and underlined (Word has no box above a letter).
      if (r.stress) return r.stress.syl.map((sy, i) => new TextRun({ text: sy, font: SERIF, ...(i === r.stress!.on ? { bold: true, underline: {}, color: ACC_INK } : {}) }));
      if (r.sym) return [new TextRun({ text: ` ${r.sym.text} `, bold: true, font: SANS, size: S(16), border: { style: BorderStyle.SINGLE, size: 4, color: r.sym.tone === 'accent' ? ACC_INK : '3D3A36', space: 1 } })];
      if (r.icon) return [];
      if (r.pic) {
        const m = opts.media?.[r.pic.key ?? r.pic.src];
        if (!m) return [new TextRun({ text: `[picture${r.pic.label ? ' ' + r.pic.label : ''}]`, italics: true, color: '8A847D', font: SANS, size: S(16) })];
        const maxW = { s: 120, m: 200, l: 300, full: opts.columns === 1 ? 600 : 300 }[r.pic.size as 's' | 'm' | 'l' | 'full'] ?? 200;
        const w = Math.min(maxW, m.w);
        const h = Math.round((m.h / m.w) * w);
        const type = /^data:image\/png/.test(m.data) ? 'png' : /^data:image\/gif/.test(m.data) ? 'gif' : 'jpg';
        const bytes = Uint8Array.from(atob(m.data.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
        return [
          ...(r.pic.label ? [new TextRun({ text: ` ${r.pic.label} `, bold: true, font: SANS, size: S(16), color: 'FFFFFF', shading: { type: 'clear' as never, color: 'auto', fill: ACC } }), new TextRun({ text: ' ' })] : []),
          new ImageRun({ type, data: bytes, transformation: { width: w, height: h }, altText: { name: r.pic.label || 'Picture', description: r.pic.alt || '', title: r.pic.label || '' } }),
          new TextRun({ text: '  ' }),
        ];
      }
      const hex = (c?: string) => (!c ? undefined : c.startsWith('#') ? c.slice(1).toUpperCase() : ACC_INK);
      return [
        new TextRun({
          text: r.t ?? '',
          bold: r.bold,
          italics: r.italic,
          strike: r.s,
          font: SERIF,
          ...(r.u ? { underline: {} } : r.def ? { underline: { type: 'dotted' as never, color: ACC_INK } } : {}),
          ...(r.color ? { color: hex(r.color) } : {}),
          ...(r.hl ? { shading: { type: 'clear' as never, color: 'auto', fill: hex(r.hl) } } : {}),
        }),
      ];
    });
  const shaded = (fill: string, kids: Paragraph[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
      rows: [new TableRow({ children: [new TableCell({ shading: { fill, color: 'auto', type: 'clear' as never }, margins: { top: 120, bottom: 120, left: 180, right: 180 }, children: kids })] })],
    });
  const toParas = (list: Block[], kn = false): (Paragraph | Table)[] => {
    const out: (Paragraph | Table)[] = [];
    for (const b of list) {
      if (b.kind === 'p') out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [...(b.list === 'number' && b.mark ? [new TextRun({ text: b.mark + '\t', bold: true, font: SANS, color: ACC_INK })] : []), ...runsToDocx(b.runs)], ...listParas(b), heading: b.heading ? HeadingLevel.HEADING_3 : undefined, spacing: b.runs.some((r) => r.pic) ? { after: 100 } : { after: 100, line: 320 } }));
      else if (b.kind === 'form') {
        if (b.title) out.push(new Paragraph({ keepNext: kn, keepLines: true, spacing: { after: 60 }, children: [new TextRun({ text: b.title, bold: true, font: SERIF })] }));
        if (b.peer) out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: 'Classmate’s name  ', bold: true, font: SANS, size: S(16) }), new TextRun({ text: '\u00A0'.repeat(40), underline: {} })] }));
        b.items.forEach((it, i) => {
          out.push(new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 80, after: 30 }, children: [new TextRun({ text: ` ${i + 1} `, bold: true, font: SERIF, color: ACC_INK }), new TextRun({ text: it.prompt, font: SERIF })] }));
          const line = (text: string) => out.push(new Paragraph({ keepNext: kn, keepLines: true, indent: { left: 360 }, children: [new TextRun({ text, font: 'Segoe UI Symbol', size: S(22) })] }));
          const ends = (mid: string) => line(`${it.low ? it.low + '   ' : ''}${mid}${it.high ? '   ' + it.high : ''}`);
          if (it.type === 'stars') ends('☆  '.repeat(Math.max(3, Math.min(10, it.points ?? 5))).trim());
          else if (it.type === 'faces') line('☹      😐      ☺');
          else if (it.type === 'thumbs') line('👍      👎');
          else if (it.type === 'scale') ends(Array.from({ length: Math.max(2, Math.min(10, it.points ?? 5)) }, (_, k) => `${k + 1} ☐`).join('   '));
          else if (it.type === 'choice' || it.type === 'checklist' || it.type === 'rank') (it.options ?? []).filter(Boolean).forEach((o) => line(`${it.type === 'choice' ? '○' : it.type === 'checklist' ? '☐' : '____'}  ${o}`));
          else out.push(new Paragraph({ keepNext: kn, keepLines: true, indent: { left: 360 }, children: [new TextRun({ text: '\u00A0'.repeat(80), underline: {} })] }), new Paragraph({ keepNext: kn, keepLines: true, indent: { left: 360 }, children: [new TextRun({ text: '\u00A0'.repeat(80), underline: {} })] }));
        });
      } else if (b.kind === 'media') {
        const info = opts.sounds?.[b.id];
        const kind = b.video ? 'Scan to watch' : 'Scan to listen';
        if (opts.qr !== false && info?.png) {
          const bytes = Uint8Array.from(atob(info.png.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
          const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
          out.push(
            new Table({
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
              rows: [
                new TableRow({
                  cantSplit: true,
                  children: [
                    new TableCell({ width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 0, right: 120 }, children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: bytes, transformation: { width: 76, height: 76 }, altText: { name: 'QR code', description: `${kind}: ${b.title}`, title: b.title } })] })] }),
                    new TableCell({
                      verticalAlign: 'center' as never,
                      margins: { top: 60, bottom: 60, left: 120, right: 0 },
                      children: [
                        new Paragraph({ children: [new TextRun({ text: kind.toUpperCase(), bold: true, font: SANS, size: S(14), color: ACC, characterSpacing: 30 })] }),
                        new Paragraph({ children: [new TextRun({ text: b.title, bold: true, font: SERIF, size: S(22) })] }),
                        new Paragraph({ children: [new TextRun({ text: info.url.replace(/^https?:\/\//, '').split('/')[0], font: SANS, size: S(14), color: '8A847D' })] }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            new Paragraph({ keepNext: kn, text: '' }),
          );
        } else out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: (b.video ? 'VIDEO  ' : 'LISTENING  '), bold: true, font: SANS, size: S(14), color: ACC, characterSpacing: 30 }), new TextRun({ text: b.title, bold: true, font: SERIF })] }));
      } else if (b.kind === 'draw') {
        if (b.prompt) out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: b.prompt, font: SERIF })] }));
        const dash = { style: BorderStyle.DASHED, size: 4, color: 'B8B2AA' };
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: dash, bottom: dash, left: dash, right: dash, insideHorizontal: dash, insideVertical: dash }, rows: [new TableRow({ cantSplit: true, height: { value: 2600, rule: 'exact' as never }, children: [new TableCell({ children: [new Paragraph({ text: '' })] })] })] }), new Paragraph({ keepNext: kn, keepLines: true, text: '' }));
      } else if (b.kind === 'dict') {
        const d = b.d;
        if(d.image)out.push(new Paragraph({keepNext:true,children:runsToDocx([{pic:{src:d.image,size:'s',label:'',alt:d.imageAlt||b.word}}])}));
        out.push(
          new Paragraph({
            keepNext: kn,
            keepLines: true,
            spacing: { before: 120, after: 120 },
            border: { top: { style: BorderStyle.DASHED, size: 4, color: 'B8B2AA', space: 4 }, bottom: { style: BorderStyle.DASHED, size: 4, color: 'B8B2AA', space: 4 }, left: { style: BorderStyle.DASHED, size: 4, color: 'B8B2AA', space: 4 }, right: { style: BorderStyle.DASHED, size: 4, color: 'B8B2AA', space: 4 } },
            children: [
              new TextRun({ text: b.word, bold: true, font: SERIF, size: S(26), color: ACC_INK }),
              ...(d.ipa ? [new TextRun({ text: '  ' + (d.ipa.startsWith('/') ? d.ipa : `/${d.ipa}/`), font: 'Segoe UI' })] : []),
              ...(d.pos ? [new TextRun({ text: '  ' + d.pos, italics: true, font: SERIF })] : []),
              ...(d.meaning ? [new TextRun({ text: d.meaning, font: SERIF, break: 1 })] : []),
              ...(d.example ? [new TextRun({ text: d.example, italics: true, font: SERIF, break: 1 })] : []),
              ...(
                [
                  ['COLLOCATIONS', d.collocations],
                  ['SYN', d.synonyms],
                  ['OPP', d.antonyms],
                  ...translationsFor(d, null).map(([l, v]) => [l.toUpperCase(), v]),
                  ['COMMON MISTAKE', d.mistakes],
                ] as [string, string | undefined][]
              ).filter(([, v]) => v).flatMap(([k, v]) => [new TextRun({ text: k + '  ', bold: true, font: SANS, size: S(14), color: ACC_INK, break: 1 }), new TextRun({ text: v!, font: SERIF })]),
            ],
          }),
        );
      } else if (b.kind === 'glossary')
        out.push(
          new Paragraph({ keepNext: kn, keepLines: true, spacing: { before: 100, after: 40 }, children: [new TextRun({ text: 'GLOSSARY', bold: true, font: SANS, size: S(14), color: ACC_INK, characterSpacing: 30 })] }),
          ...b.items.map(
            ({ word, d }) =>
              new Paragraph({
                keepNext: kn,
                keepLines: true,
                spacing: { after: 30 },
                children: [
                  new TextRun({ text: word, bold: true, font: SERIF, size: S(20) }),
                  ...(d.pos ? [new TextRun({ text: ` (${d.pos})`, italics: true, font: SERIF, size: S(20) })] : []),
                  ...(d.ipa ? [new TextRun({ text: ` ${d.ipa}`, font: 'Segoe UI', size: S(18), color: '6F6A64' })] : []),
                  ...(d.meaning ? [new TextRun({ text: ` ${d.meaning}`, font: SERIF, size: S(20) })] : []),
                  ...translationsFor(d, null).map(([l, v]) => new TextRun({ text: `  ${l}: ${v}`, italics: true, font: SERIF, size: S(20), color: '6F6A64' })),
                ],
              }),
          ),
        );
      else if (b.kind === 'diagram')
        out.push(shaded(ACC_TINT, [...(b.title ? [new Paragraph({ keepNext: kn, keepLines: true, children: [label(b.title)], spacing: { after: 80 } })] : []), ...b.cells.flatMap((c, i) => [new Paragraph({ keepNext: kn, keepLines: true, children: [label(`${i + 1}${c.label ? '  ' + c.label : ''}`)], spacing: { before: 60 } }), ...(toParas(c.blocks, kn).filter((x) => x instanceof Paragraph) as Paragraph[])])]), new Paragraph({ keepNext: kn, keepLines: true, text: '' }));
      else if (b.kind === 'storyboard') {
        const sc = [...(b.a.snap?.scenes ?? [])].sort((x, y) => x.order - y.order);
        out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [label('STORYBOARD  '), new TextRun({ text: b.a.title || '', font: SERIF })], spacing: { after: 60 } }));
        sc.forEach((x, i) => x.caption && out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: `${i + 1}  `, bold: true, font: SANS, color: ACC_INK }), new TextRun({ text: x.caption, font: SERIF })] })));
      } else if (b.kind === 'timeline') {
        const t = b.a;
        out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [label('TIMELINE  '), new TextRun({ text: [t.title, (t.items ?? []).map((i) => i.label).filter(Boolean).join(' · '), t.sentence].filter(Boolean).join(' — '), font: SERIF })], spacing: { after: 100 } }));
      } else if (b.kind === 'note') out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: b.text, italics: true, color: '8A847D', font: SANS, size: S(18) })] }));
      else if (b.kind === 'box') out.push(shaded('F7EFE9', [new Paragraph({ keepNext: kn, keepLines: true, children: [label(b.label + '   '), new TextRun({ text: b.words.join('     '), font: SERIF })] })]), new Paragraph({ keepNext: kn, keepLines: true, text: '' }));
      else if (b.kind === 'subtask') {
        out.push(new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: b.letter + '  ', bold: true, font: SANS, color: ACC_INK }), new TextRun({ text: b.text, font: SERIF })] }));
        out.push(...toParas(b.blocks, kn));
      }
      else if (b.kind === 'callout') out.push(shaded(ACC_TINT, [...(b.label ? [new Paragraph({ keepNext: kn, keepLines: true, children: [label((b.symbol ? b.symbol + '  ' : '') + b.label)], spacing: { after: 80 } })] : []), ...(toParas(b.blocks, kn).filter((x) => x instanceof Paragraph) as Paragraph[])]), new Paragraph({ keepNext: kn, keepLines: true, text: '' }));
      else if (b.kind === 'lines') {
        if (b.prompt) out.push(new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: b.prompt, font: SANS, size: S(16), color: '8A847D' })] }));
        const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const rule = { style: BorderStyle.SINGLE, size: 4, color: 'C9C4BD' };
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: rule, left: none, right: none, insideHorizontal: rule, insideVertical: none }, rows: Array.from({ length: b.count }, () => new TableRow({ cantSplit: true, height: { value: 480, rule: 'atLeast' as never }, children: [new TableCell({ children: [new Paragraph({ text: '', keepNext: kn })] })] })) }), new Paragraph({ keepNext: kn, keepLines: true, text: '' }));
      } else if (b.kind === 'match')
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: Array.from({ length: Math.max(b.left.length, b.right.length) }, (_, i) => new TableRow({ cantSplit: true, children: [new TableCell({ borders: noBorders, children: [new Paragraph({ keepNext: kn, keepLines: true, children: b.left[i] ? [new TextRun({ text: `${i + 1}  `, bold: true, color: ACC, font: SANS, size: S(18) }), new TextRun({ text: b.left[i], font: SERIF }), new TextRun({ text: '   ______', font: SERIF })] : [] })] }), new TableCell({ borders: noBorders, children: [new Paragraph({ keepNext: kn, keepLines: true, children: b.right[i] ? [new TextRun({ text: `${LET[i]}  `, bold: true, color: '8A847D', font: SANS, size: S(18) }), new TextRun({ text: b.right[i], font: SERIF })] : [] })] })] })),
          }),
        );
      else if (b.kind === 'table') out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c) => new TableCell({ shading: ri === 0 ? { fill: 'F7EFE9', color: 'auto', type: 'clear' as never } : c === '■' ? { fill: 'E6E3DE', color: 'auto', type: 'clear' as never } : undefined, children: [new Paragraph({ keepNext: kn, keepLines: true, children: [new TextRun({ text: c === '■' ? '' : c, bold: ri === 0, font: ri === 0 ? SANS : SERIF, size: ri === 0 ? 18 : 22 })] })] })) })) }));
    }
    return out;
  };
  const children: (Paragraph | Table)[] = [];
  const tasks = items.flatMap((i) => (i.kind === 'task' ? [i.task] : []));
  children.push(new Paragraph({ shading: { fill: 'ECEBE7', color: 'auto', type: 'clear' as never }, children: [new TextRun({ text: opts.header ? 'NAME ________________________________' : ' ', font: SANS, size: S(15), bold: true, color: '3D3A36' }), new TextRun({ text: '\tELT Suite', font: SERIF, size: S(26), bold: true, color: '262420' })], tabStops: [{ type: 'right' as never, position: 9600 }], spacing: { after: 0 } }));
  children.push(new Paragraph({ shading: { fill: 'ECEBE7', color: 'auto', type: 'clear' as never }, children: [new TextRun({ text: title, font: SANS, size: S(30), bold: true, color: '4B4843' }), new TextRun({ text: '\t' + [opts.className, opts.level].filter(Boolean).join(' · '), font: SANS, size: S(15), bold: true, color: ACC })], tabStops: [{ type: 'right' as never, position: 9600 }], spacing: { after: 280 } }));
  const body: (Paragraph | Table)[] = [];
  const markRun = (n: number) => new TextRun({ text: `   _____ / ${n}`, font: SANS, size: S(17), bold: true, color: '57534D' });
  let num = 0;
  let sec = '';
  let secMarks = 0;
  const closeSec = () => {
    if (opts.marks && sec && secMarks) body.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 200 }, children: [new TextRun({ text: `${sec} total`, font: SANS, size: S(16), bold: true }), markRun(secMarks)] }));
    secMarks = 0;
  };
  for (const it of items) {
    if (it.kind === 'section') {
      closeSec();
      sec = it.title;
      body.push(new Paragraph({ keepNext: true, spacing: { before: 240, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 2 } }, children: [new TextRun({ text: it.title.toUpperCase(), font: SANS, size: S(21), bold: true, color: ACC_INK, characterSpacing: 20 })] }));
      continue;
    }
    let t = it.task;
    num++;
    secMarks += t.marks;
    const lead = !(t.instructions?.trim() || t.title?.trim()) && !(t.instrRuns ?? []).some((r) => (r.t ?? '').trim()) && t.blocks[0]?.kind === 'subtask' ? (t.blocks[0] as Extract<Block, { kind: 'subtask' }>) : null;
    if (lead) {
      // No title or instruction: the first sub-task goes on the task's own line.
      body.push(new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: `${num}  `, bold: true, font: SERIF, size: S(23), color: ACC_INK }), new TextRun({ text: lead.letter + '  ', bold: true, font: SANS, color: ACC_INK }), new TextRun({ text: lead.text, font: SERIF, size: S(23) })] }));
      t = { ...t, blocks: [...lead.blocks, ...t.blocks.slice(1)] };
    } else
    body.push(new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: `${num}  `, bold: true, font: SERIF, size: S(23), color: ACC_INK }), ...(t.instrRuns ? runsToDocx(t.instrRuns) : [new TextRun({ text: t.instructions?.trim() || t.title, font: SERIF, size: S(23) })])] }));
    body.push(...toParas(t.blocks, true));
    body.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 160 }, children: opts.marks && t.marks ? [markRun(t.marks)] : [] }));
  }
  closeSec();
  const grand = tasks.reduce((sum, t) => sum + t.marks, 0);
  if (opts.marks && grand) body.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120 }, children: [new TextRun({ text: 'TOTAL', font: SANS, size: S(18), bold: true }), markRun(grand)] }));
  const keyParas: (Paragraph | Table)[] = [];
  const withNotes = !!opts.notes;
  if (opts.key || withNotes) {
    keyParas.push(new Paragraph({ children: [new TextRun({ text: 'FOR THE TEACHER', font: SANS, size: S(15), bold: true, color: ACC, characterSpacing: 40 })] }));
    keyParas.push(new Paragraph({ children: [new TextRun({ text: opts.key && withNotes ? 'Answer key and notes' : opts.key ? 'Answer key' : 'Teacher’s notes', font: SERIF, size: S(40), bold: true })], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACC, space: 6 } }, spacing: { after: 200 } }));
    tasks.forEach((t, ti) => {
      const answers = opts.key ? t.answers : [];
      const notes = withNotes ? t.notes ?? '' : '';
      const scripts = opts.key ? (t.media ?? []).map((id) => opts.sounds?.[id]).filter((m): m is MediaInfo => !!m && m.script.length > 0) : [];
      if (!answers.length && !notes && !scripts.length) return;
      keyParas.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `${ti + 1}  `, bold: true, color: ACC, font: SANS }), new TextRun({ text: t.title, bold: true, font: SERIF })] }));
      answers.forEach((a) => keyParas.push(new Paragraph({ children: [new TextRun({ text: `${a.n}   `, bold: true, font: SANS, size: S(18), color: ACC }), new TextRun({ text: a.text, font: SERIF })] })));
      scripts.forEach((m) =>
        keyParas.push(
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: (m.video ? 'VIDEO SCRIPT' : 'AUDIOSCRIPT') + '  ', bold: true, font: SANS, size: S(14), color: ACC, characterSpacing: 30 }), new TextRun({ text: m.title, font: SANS, size: S(16), color: '8A847D' })] }),
          ...m.script.map((l) => new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: l, font: SERIF, size: S(20) })] })),
        ),
      );
      if (notes)
        keyParas.push(
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: 'NOTES', bold: true, font: SANS, size: S(14), color: ACC, characterSpacing: 30 })] }),
          ...notes.split('\n').filter((l) => l.trim()).map((l) => new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: l, font: SANS, size: S(19), color: '3D3A36' })] })),
        );
    });
  }
  // Cut-out cards: a two-column table with dashed cut lines, on its own page.
  const cutCards = items.flatMap((i, k) => (i.kind === 'task' ? (i.task.cutouts ?? []).flatMap((set) => set.cards.map((c) => ({ ...c, ex: items.slice(0, k + 1).filter((x) => x.kind === 'task').length }))) : []));
  const cardParas: (Paragraph | Table)[] = [];
  if (cutCards.length) {
    const dash = { style: BorderStyle.DASHED, size: 6, color: '8D8983' };
    cardParas.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: '\u2702\uFE0E  ', font: 'Segoe UI Symbol', size: S(24), color: ACC_INK }), new TextRun({ text: 'Cards to cut out', font: SANS, size: S(24), bold: true })] }));
    const rows: TableRow[] = [];
    for (let i = 0; i < cutCards.length; i += 2) {
      rows.push(
        new TableRow({
          cantSplit: true,
          height: { value: 3000, rule: 'atLeast' as never },
          children: [0, 1].map((j) => {
            const c = cutCards[i + j];
            return new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 240, bottom: 240, left: 240, right: 240 },
              children: c ? [new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: c.title.toUpperCase(), font: SANS, size: S(18), bold: true, color: ACC, characterSpacing: 20 }), new TextRun({ text: `\tEx. ${c.ex}`, font: SANS, size: S(13), color: '8D8983' })], tabStops: [{ type: 'right' as never, position: 4200 }] }), ...(toParas(c.blocks).filter((x) => x instanceof Paragraph) as Paragraph[])] : [new Paragraph('')],
            });
          }),
        }),
      );
    }
    cardParas.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: dash, bottom: dash, left: dash, right: dash, insideHorizontal: dash, insideVertical: dash }, rows }));
  }
  const SIZES: Record<string, { width: number; height: number }> = { A4: { width: 11906, height: 16838 }, Letter: { width: 12240, height: 15840 }, A5: { width: 8391, height: 11906 } };
  // Who made it, at the end of the worksheet.
  const cr = credit();
  body.push(new Paragraph({ spacing: { before: 360, after: 40 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D6D3CD', space: 6 } }, children: [new TextRun({ text: cr.by, font: SANS, size: S(14), bold: true, color: '4B4843' })] }));
  body.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: cr.note, font: SANS, size: S(13), color: '6F6A64' })] }));
  const doc = new Document({
    fonts: embedded,
    styles: { default: { document: { run: { font: SERIF, size: S(opts.paper === 'A5' ? 20 : 22), color: '2F2C29' } } } },
    sections: [
      { properties: { page: { size: SIZES[opts.paper ?? 'A4'], margin: { top: 800, bottom: 1000, left: 1000, right: 1000 } } }, children },
      { properties: { type: SectionType.CONTINUOUS, column: { count: opts.columns ?? 2, space: 500 }, page: { size: SIZES[opts.paper ?? 'A4'], margin: { top: 800, bottom: 1000, left: 1000, right: 1000 } } }, children: body },
      ...(keyParas.length ? [{ properties: { type: SectionType.NEXT_PAGE, column: { count: 2, space: 500 }, page: { size: SIZES[opts.paper ?? 'A4'], margin: { top: 800, bottom: 1000, left: 1000, right: 1000 } } }, children: keyParas }] : []),
      // Cards to cut out always come last, after the answer key.
      ...(cardParas.length ? [{ properties: { type: SectionType.NEXT_PAGE, page: { size: SIZES[opts.paper ?? 'A4'], margin: { top: 800, bottom: 1000, left: 1000, right: 1000 } } }, children: cardParas }] : []),
    ],
  });
  return Packer.toBlob(doc);
}
const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };

export function saveBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Every sound and video the worksheet uses.
export function collectMedia(items: WsItem[]): { id: string; mode: string }[] {
  const out = new Map<string, string>();
  const walk = (bs: Block[]) =>
    bs.forEach((b) => {
      if (b.kind === 'media' && !out.has(b.id)) out.set(b.id, b.mode);
      if (b.kind === 'callout' || b.kind === 'subtask') walk(b.blocks);
    });
  items.forEach((it) => it.kind === 'task' && walk(it.task.blocks));
  return [...out].map(([id, mode]) => ({ id, mode }));
}

// A picture with its crop and colour, as one key.
export const picKey = (src: string, crop?: string, filter?: string) => (crop || filter ? `${src}#${crop ?? ''}|${filter ?? ''}` : src);

// Every picture the worksheet uses, so they can be read (and edited copies made) before printing.
export function collectPictures(items: WsItem[]): { key: string; src: string; crop?: string; filter?: string }[] {
  const out = new Map<string, { key: string; src: string; crop?: string; filter?: string }>();
  const blocks = (bs: Block[]) =>
    bs.forEach((b) => {
      if (b.kind === 'p') b.runs.forEach((r) => r.pic && out.set(r.pic.key ?? r.pic.src, { key: r.pic.key ?? r.pic.src, src: r.pic.src, crop: r.pic.crop, filter: r.pic.filter }));
      if (b.kind === 'callout' || b.kind === 'subtask') blocks(b.blocks);
    });
  items.forEach((it) => {
    if (it.kind !== 'task') return;
    blocks(it.task.blocks);
    it.task.cutouts?.forEach((set) => set.cards.forEach((c) => blocks(c.blocks)));
  });
  return [...out.values()];
}
