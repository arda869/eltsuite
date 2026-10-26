import type { JSONContent } from '@tiptap/react';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak, HeadingLevel, BorderStyle } from 'docx';
import type { ExportTask } from './textformat';
import { packAnswerText, splitPack, type PackKind } from './pack';

// Printable worksheets. A task becomes a list of blocks: paragraphs made of runs (text or a
// blank), word boxes, two-column matching, ruled lines, and the answer key.

export type Run = { t?: string; blank?: number; options?: string[]; bold?: boolean; italic?: boolean };
export type Block =
  | { kind: 'p'; runs: Run[]; n?: number; heading?: boolean; list?: 'bullet' | 'number' }
  | { kind: 'box'; words: string[]; label: string }
  | { kind: 'match'; left: string[]; right: string[]; n: number }
  | { kind: 'lines'; n: number; count: number; prompt?: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'note'; text: string }
  | { kind: 'callout'; label: string; tone: string; symbol: string; style: string; blocks: Block[] };
export type WsTask = { title: string; instructions?: string; blocks: Block[]; answers: { n: number; text: string }[] };
export type Paper = 'A4' | 'Letter' | 'A5';
export type Options = { header: boolean; key: boolean; taskIds?: string[]; paper?: Paper; accent?: string; className?: string; level?: string };

const LET = 'abcdefghijklmnop';
const UP = 'ABCDEFGHIJKLMNOP';
const text = (n?: JSONContent): string => (n ? (n.text ?? '') + (n.content ?? []).map(text).join('') : '');

export function flattenTask(t: ExportTask): WsTask {
  const blocks: Block[] = [];
  let cur: Block[] = blocks;
  const answers: { n: number; text: string }[] = [];
  let n = 0;
  const bank: string[] = [];
  const runsOf = (nodes: JSONContent[] | undefined): Run[] => {
    const out: Run[] = [];
    for (const node of nodes ?? []) {
      const a = node.attrs ?? {};
      switch (node.type) {
        case 'text':
          out.push({ t: node.text ?? '', bold: node.marks?.some((m) => m.type === 'bold'), italic: node.marks?.some((m) => m.type === 'italic') });
          break;
        case 'gap': {
          n++;
          answers.push({ n, text: (a.answers ?? []).join(' / ') });
          out.push({ t: ` (${n}) `, bold: true }, { blank: Math.max(8, ((a.answers?.[0] ?? '').length + 4) * 2) });
          if (a.stem) out.push({ t: ` ${a.stem} `, bold: true });
          break;
        }
        case 'choice': {
          n++;
          const opts: string[] = a.options ?? [];
          const correct: number[] = Array.isArray(a.correct) ? a.correct : [a.correct];
          answers.push({ n, text: correct.map((i) => opts[i]).filter(Boolean).join(', ') });
          if (a.display === 'radio') out.push({ t: ` (${n}) `, bold: true }, { t: opts.map((o, i) => `${LET[i]}) ${o}`).join('   ') });
          else out.push({ t: ` (${n}) `, bold: true }, { options: opts });
          break;
        }
        case 'dropgap': {
          n++;
          answers.push({ n, text: a.answer ?? '' });
          if (a.answer) bank.push(a.answer);
          out.push({ t: ` (${n}) `, bold: true }, { blank: 14 });
          break;
        }
        case 'hardBreak':
          out.push({ t: '\n' });
          break;
        default:
          if (node.content) out.push(...runsOf(node.content));
          else if (node.type === 'ipa') out.push({ t: ` /${a.text ?? ''}/ ` });
          else if (node.type === 'stress') out.push({ t: (a.syllables ?? []).join('·') });
      }
    }
    return out;
  };
  const walk = (node: JSONContent, list?: 'bullet' | 'number') => {
    const a = node.attrs ?? {};
    switch (node.type) {
      case 'paragraph': {
        const runs = runsOf(node.content);
        if (runs.length) cur.push({ kind: 'p', runs, list });
        return;
      }
      case 'heading':
        cur.push({ kind: 'p', runs: [{ t: text(node), bold: true }], heading: true });
        return;
      case 'bulletList':
      case 'orderedList':
        node.content?.forEach((li) => li.content?.forEach((c) => walk(c, node.type === 'bulletList' ? 'bullet' : 'number')));
        return;
      case 'table':
        cur.push({ kind: 'table', rows: (node.content ?? []).map((r) => (r.content ?? []).map((c) => text(c).trim())) });
        return;
      case 'match': {
        n++;
        const pairs: { left: string; right: string }[] = a.pairs ?? [];
        const extras: string[] = a.extras ?? [];
        const right = [...pairs.map((p) => p.right), ...extras].sort(() => 0.5 - Math.random());
        answers.push({ n, text: pairs.map((p, i) => `${i + 1}–${LET[right.indexOf(p.right)]}`).join(', ') });
        cur.push({ kind: 'match', n, left: pairs.map((p) => p.left), right });
        return;
      }
      case 'wordbank':
        cur.push({ kind: 'box', words: [...bank, ...(a.extras ?? [])].sort(() => 0.5 - Math.random()), label: 'Words' });
        return;
      case 'order': {
        n++;
        answers.push({ n, text: a.sentence ?? '' });
        const words = String(a.sentence ?? '').split(/\s+/).sort(() => 0.5 - Math.random());
        cur.push({ kind: 'p', runs: [{ t: `(${n}) `, bold: true }, { t: words.join(' / '), italic: true }] });
        cur.push({ kind: 'lines', n, count: 1 });
        return;
      }
      case 'writing': {
        n++;
        answers.push({ n, text: a.model ? 'Model: ' + a.model : '(marked by the teacher)' });
        const words = a.maxWords ?? a.minWords;
        cur.push({ kind: 'lines', n, count: Math.min(14, Math.max(5, Math.ceil(((words as number) || 100) / 12))), prompt: words ? `${a.minWords ? a.minWords + '–' : 'up to '}${a.maxWords ?? a.minWords} words` : undefined });
        return;
      }
      case 'pq': {
        const kind = a.kind as PackKind;
        const d = a.data ?? {};
        if (kind === 'speaking') {
          cur.push({ kind: 'p', runs: [{ t: 'Speaking: ' + (d.prompt ?? ''), bold: true }] });
          (d.questions ?? []).filter(Boolean).forEach((q: string) => cur.push({ kind: 'p', runs: [{ t: q }], list: 'bullet' }));
          return;
        }
        n++;
        const { pub, key } = splitPack(kind, d, 'ws');
        if (key) answers.push({ n, text: packAnswerText({ kind: 'pack', t: kind, k: key }, pub) });
        const pre = { t: `(${n}) `, bold: true };
        switch (kind) {
          case 'fix':
            cur.push({ kind: 'p', runs: [pre, { t: 'Find and correct the mistake: ' }, { t: d.sentence ?? '' }] });
            cur.push({ kind: 'lines', n, count: 1 });
            break;
          case 'categorise':
            cur.push({ kind: 'box', words: pub.items, label: 'Put each word in the right column' });
            cur.push({ kind: 'table', rows: [pub.cats, pub.cats.map(() => ''), pub.cats.map(() => ''), pub.cats.map(() => '')] });
            break;
          case 'transform':
            cur.push({ kind: 'p', runs: [pre, { t: d.first ?? '' }] });
            cur.push({ kind: 'p', runs: [{ t: String(d.keyWord ?? '').toUpperCase(), bold: true }] });
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
            cur.push({ kind: 'p', runs: [pre, { t: `Label the picture (see the screen): ${pub.points.map((_: unknown, i: number) => i + 1).join(', ')}` }] });
            cur.push({ kind: 'box', words: pub.labels, label: 'Labels' });
            break;
          case 'odd':
            cur.push({ kind: 'p', runs: [pre, { t: 'Circle the odd one out: ' }, { t: pub.words.join('   ') }] });
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
        if (inner.length) cur.push({ kind: 'callout', label: String(a.label ?? (node.type === 'revealBox' ? a.title ?? '' : '')), tone: String(a.tone ?? 'grey'), symbol: String(a.symbol ?? ''), style: String(a.style ?? 'box'), blocks: inner });
        return;
      }
      case 'randomPick':
        node.content?.forEach((c, i) => {
          cur.push({ kind: 'p', runs: [{ t: `Card ${i + 1}${c.attrs?.title ? ': ' + c.attrs.title : ''}`, bold: true }] });
          c.content?.forEach((x) => walk(x));
        });
        return;
      case 'survey':
      case 'board':
      case 'drawBoard':
      case 'bankLink':
      case 'linkCard':
      case 'reflect':
        cur.push({ kind: 'note', text: `[${node.type === 'survey' ? 'Survey' : node.type === 'reflect' ? 'Self-reflection' : 'Interactive block'}: done in the app]` });
        return;
      case 'columnBreak':
        return;
      default:
        if (node.content) node.content.forEach((c) => walk(c));
    }
  };
  (t.content.content ?? []).forEach((c) => walk(c));
  return { title: t.title, instructions: t.instructions, blocks, answers };
}

export function flattenLesson(tasks: ExportTask[], ids?: Set<number>) {
  return tasks.map((t, i) => ({ t, i })).filter(({ t, i }) => t.kind !== 'section' && !t.hidden && (!ids || ids.has(i))).map(({ t }) => flattenTask(t));
}

// ---------------------------------------------------------------- DOCX

export async function lessonDocx(title: string, tasks: WsTask[], opts: Options): Promise<Blob> {
  // Word keeps the same look as the print version: serif text, the class colour for numbers and
  // labels, tinted boxes. Fonts that ship with Word and Google Docs are used so it looks right anywhere.
  const ACC = (opts.accent ?? '#d98f63').replace('#', '').toUpperCase();
  const SERIF = 'Georgia';
  const SANS = 'Arial';
  const TINT: Record<string, string> = { sand: 'FBF4EA', sky: 'EEF4F8', sage: 'EEF4EF', rose: 'FAEEEC', grey: 'F4F3F1' };
  const label = (t: string) => new TextRun({ text: t.toUpperCase(), bold: true, font: SANS, size: 15, color: '8A847D', characterSpacing: 30 });
  const runsToDocx = (runs: Run[]) =>
    runs.flatMap((r) => {
      if (r.blank) return [new TextRun({ text: '\u00A0'.repeat(Math.min(40, r.blank)), underline: {} })];
      if (r.options) return [new TextRun({ text: ' ' + r.options.join('  /  ') + ' ', font: SANS, size: 20 })];
      const q = /^\s*\((\d+)\)\s*$/.exec(r.t ?? '');
      if (q) return [new TextRun({ text: ` ${q[1]} `, bold: true, font: SANS, size: 16, color: ACC, superScript: false })];
      return [new TextRun({ text: r.t ?? '', bold: r.bold, italics: r.italic, font: SERIF })];
    });
  const shaded = (fill: string, kids: Paragraph[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'E4E0DA' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
      rows: [new TableRow({ children: [new TableCell({ shading: { fill, color: 'auto', type: 'clear' as never }, margins: { top: 120, bottom: 120, left: 180, right: 180 }, children: kids })] })],
    });
  const toParas = (list: Block[]): (Paragraph | Table)[] => {
    const out: (Paragraph | Table)[] = [];
    for (const b of list) {
      if (b.kind === 'p') out.push(new Paragraph({ children: runsToDocx(b.runs), bullet: b.list === 'bullet' ? { level: 0 } : undefined, numbering: b.list === 'number' ? { reference: 'nums', level: 0 } : undefined, heading: b.heading ? HeadingLevel.HEADING_3 : undefined, spacing: { after: 100, line: 320 } }));
      else if (b.kind === 'note') out.push(new Paragraph({ children: [new TextRun({ text: b.text, italics: true, color: '8A847D', font: SANS, size: 18 })] }));
      else if (b.kind === 'box') out.push(shaded('F7EFE9', [new Paragraph({ children: [label(b.label + '   '), new TextRun({ text: b.words.join('     '), font: SERIF })] })]), new Paragraph({ text: '' }));
      else if (b.kind === 'callout') out.push(shaded(TINT[b.tone] ?? 'F4F3F1', [...(b.label ? [new Paragraph({ children: [label((b.symbol ? b.symbol + '  ' : '') + b.label)], spacing: { after: 80 } })] : []), ...(toParas(b.blocks).filter((x) => x instanceof Paragraph) as Paragraph[])]), new Paragraph({ text: '' }));
      else if (b.kind === 'lines') {
        if (b.prompt) out.push(new Paragraph({ children: [new TextRun({ text: b.prompt, font: SANS, size: 16, color: '8A847D' })] }));
        const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const rule = { style: BorderStyle.SINGLE, size: 4, color: 'C9C4BD' };
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: rule, left: none, right: none, insideHorizontal: rule, insideVertical: none }, rows: Array.from({ length: b.count }, () => new TableRow({ height: { value: 480, rule: 'atLeast' as never }, children: [new TableCell({ children: [new Paragraph('')] })] })) }), new Paragraph({ text: '' }));
      } else if (b.kind === 'match')
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: Array.from({ length: Math.max(b.left.length, b.right.length) }, (_, i) => new TableRow({ children: [new TableCell({ borders: noBorders, children: [new Paragraph({ children: b.left[i] ? [new TextRun({ text: `${i + 1}  `, bold: true, color: ACC, font: SANS, size: 18 }), new TextRun({ text: b.left[i], font: SERIF }), new TextRun({ text: '   ______', font: SERIF })] : [] })] }), new TableCell({ borders: noBorders, children: [new Paragraph({ children: b.right[i] ? [new TextRun({ text: `${LET[i]}  `, bold: true, color: '8A847D', font: SANS, size: 18 }), new TextRun({ text: b.right[i], font: SERIF })] : [] })] })] })),
          }),
        );
      else if (b.kind === 'table') out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, ri) => new TableRow({ children: r.map((c) => new TableCell({ shading: ri === 0 ? { fill: 'F7EFE9', color: 'auto', type: 'clear' as never } : c === '■' ? { fill: 'E6E3DE', color: 'auto', type: 'clear' as never } : undefined, children: [new Paragraph({ children: [new TextRun({ text: c === '■' ? '' : c, bold: ri === 0, font: ri === 0 ? SANS : SERIF, size: ri === 0 ? 18 : 22 })] })] })) })) }));
    }
    return out;
  };
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ children: [new TextRun({ text: 'Lesson Lit', font: SERIF, size: 22, color: '8A847D' }), new TextRun({ text: '      WORKSHEET', font: SANS, size: 14, bold: true, color: 'A29C95', characterSpacing: 40 })], spacing: { after: 160 } }));
  if (opts.className) children.push(new Paragraph({ children: [new TextRun({ text: [opts.className, opts.level].filter(Boolean).join(' · ').toUpperCase(), font: SANS, size: 15, bold: true, color: ACC, characterSpacing: 40 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: title, font: SERIF, size: 48, bold: true })], border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACC, space: 8 } }, spacing: { after: 240 } }));
  if (opts.header) children.push(new Paragraph({ children: [label('Name   '), new TextRun({ text: '_____________________________     ', font: SERIF }), label('Class   '), new TextRun({ text: '__________     ', font: SERIF }), label('Date   '), new TextRun({ text: '__________', font: SERIF })], spacing: { after: 360 } }));
  tasks.forEach((t, ti) => {
    children.push(new Paragraph({ keepNext: true, spacing: { before: 320, after: 60 }, children: [new TextRun({ text: ` ${ti + 1} `, bold: true, font: SANS, size: 22, color: 'FFFFFF', shading: { fill: ACC, color: 'auto', type: 'clear' as never } }), new TextRun({ text: '  ' + t.title, font: SERIF, size: 30, bold: true })] }));
    if (t.instructions) children.push(new Paragraph({ keepNext: true, spacing: { after: 160 }, children: [new TextRun({ text: t.instructions, bold: true, font: SANS, size: 21, color: ACC })] }));
    children.push(...toParas(t.blocks));
  });
  if (opts.key) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'FOR THE TEACHER', font: SANS, size: 15, bold: true, color: ACC, characterSpacing: 40 })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'Answer key', font: SERIF, size: 40, bold: true })], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACC, space: 6 } }, spacing: { after: 200 } }));
    tasks.forEach((t, ti) => {
      if (!t.answers.length) return;
      children.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `${ti + 1}  `, bold: true, color: ACC, font: SANS }), new TextRun({ text: t.title, bold: true, font: SERIF })] }));
      t.answers.forEach((a) => children.push(new Paragraph({ children: [new TextRun({ text: `${a.n}   `, bold: true, font: SANS, size: 18, color: ACC }), new TextRun({ text: a.text, font: SERIF })] })));
    });
  }
  const SIZES: Record<string, { width: number; height: number }> = { A4: { width: 11906, height: 16838 }, Letter: { width: 12240, height: 15840 }, A5: { width: 8391, height: 11906 } };
  const doc = new Document({
    numbering: { config: [{ reference: 'nums', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }] }] },
    styles: { default: { document: { run: { font: SERIF, size: opts.paper === 'A5' ? 20 : 22, color: '2F2C29' } } } },
    sections: [{ properties: { page: { size: SIZES[opts.paper ?? 'A4'], margin: { top: 1000, bottom: 1100, left: 1000, right: 1000 } } }, children }],
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
