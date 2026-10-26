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
  | { kind: 'note'; text: string };
export type WsTask = { title: string; instructions?: string; blocks: Block[]; answers: { n: number; text: string }[] };
export type Options = { header: boolean; key: boolean; taskIds?: string[] };

const LET = 'abcdefghijklmnop';
const UP = 'ABCDEFGHIJKLMNOP';
const text = (n?: JSONContent): string => (n ? (n.text ?? '') + (n.content ?? []).map(text).join('') : '');

export function flattenTask(t: ExportTask): WsTask {
  const blocks: Block[] = [];
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
        if (runs.length) blocks.push({ kind: 'p', runs, list });
        return;
      }
      case 'heading':
        blocks.push({ kind: 'p', runs: [{ t: text(node), bold: true }], heading: true });
        return;
      case 'bulletList':
      case 'orderedList':
        node.content?.forEach((li) => li.content?.forEach((c) => walk(c, node.type === 'bulletList' ? 'bullet' : 'number')));
        return;
      case 'table':
        blocks.push({ kind: 'table', rows: (node.content ?? []).map((r) => (r.content ?? []).map((c) => text(c).trim())) });
        return;
      case 'match': {
        n++;
        const pairs: { left: string; right: string }[] = a.pairs ?? [];
        const extras: string[] = a.extras ?? [];
        const right = [...pairs.map((p) => p.right), ...extras].sort(() => 0.5 - Math.random());
        answers.push({ n, text: pairs.map((p, i) => `${i + 1}–${LET[right.indexOf(p.right)]}`).join(', ') });
        blocks.push({ kind: 'match', n, left: pairs.map((p) => p.left), right });
        return;
      }
      case 'wordbank':
        blocks.push({ kind: 'box', words: [...bank, ...(a.extras ?? [])].sort(() => 0.5 - Math.random()), label: 'Words' });
        return;
      case 'order': {
        n++;
        answers.push({ n, text: a.sentence ?? '' });
        const words = String(a.sentence ?? '').split(/\s+/).sort(() => 0.5 - Math.random());
        blocks.push({ kind: 'p', runs: [{ t: `(${n}) `, bold: true }, { t: words.join(' / '), italic: true }] });
        blocks.push({ kind: 'lines', n, count: 1 });
        return;
      }
      case 'writing': {
        n++;
        answers.push({ n, text: a.model ? 'Model: ' + a.model : '(marked by the teacher)' });
        const words = a.maxWords ?? a.minWords;
        blocks.push({ kind: 'lines', n, count: Math.min(14, Math.max(5, Math.ceil(((words as number) || 100) / 12))), prompt: words ? `${a.minWords ? a.minWords + '–' : 'up to '}${a.maxWords ?? a.minWords} words` : undefined });
        return;
      }
      case 'pq': {
        const kind = a.kind as PackKind;
        const d = a.data ?? {};
        if (kind === 'speaking') {
          blocks.push({ kind: 'p', runs: [{ t: 'Speaking: ' + (d.prompt ?? ''), bold: true }] });
          (d.questions ?? []).filter(Boolean).forEach((q: string) => blocks.push({ kind: 'p', runs: [{ t: q }], list: 'bullet' }));
          return;
        }
        n++;
        const { pub, key } = splitPack(kind, d, 'ws');
        if (key) answers.push({ n, text: packAnswerText({ kind: 'pack', t: kind, k: key }, pub) });
        const pre = { t: `(${n}) `, bold: true };
        switch (kind) {
          case 'fix':
            blocks.push({ kind: 'p', runs: [pre, { t: 'Find and correct the mistake: ' }, { t: d.sentence ?? '' }] });
            blocks.push({ kind: 'lines', n, count: 1 });
            break;
          case 'categorise':
            blocks.push({ kind: 'box', words: pub.items, label: 'Put each word in the right column' });
            blocks.push({ kind: 'table', rows: [pub.cats, pub.cats.map(() => ''), pub.cats.map(() => ''), pub.cats.map(() => '')] });
            break;
          case 'transform':
            blocks.push({ kind: 'p', runs: [pre, { t: d.first ?? '' }] });
            blocks.push({ kind: 'p', runs: [{ t: String(d.keyWord ?? '').toUpperCase(), bold: true }] });
            blocks.push({ kind: 'p', runs: [{ t: (d.before ?? '') + ' ' }, { blank: 24 }, { t: ' ' + (d.after ?? '') }] });
            break;
          case 'highlight':
            blocks.push({ kind: 'p', runs: [pre, { t: (d.instruction ?? '') + ' ', bold: true }, { t: pub.toks.join(' ') }] });
            break;
          case 'sentences':
            blocks.push({ kind: 'p', runs: [pre, { t: 'Put in the right order:', bold: true }] });
            pub.items.forEach((s: string, i: number) => blocks.push({ kind: 'p', runs: [{ t: `${UP[i]}  ${s}` }] }));
            blocks.push({ kind: 'lines', n, count: 1 });
            break;
          case 'label':
            blocks.push({ kind: 'p', runs: [pre, { t: `Label the picture (see the screen): ${pub.points.map((_: unknown, i: number) => i + 1).join(', ')}` }] });
            blocks.push({ kind: 'box', words: pub.labels, label: 'Labels' });
            break;
          case 'odd':
            blocks.push({ kind: 'p', runs: [pre, { t: 'Circle the odd one out: ' }, { t: pub.words.join('   ') }] });
            break;
          case 'gapped':
            blocks.push({ kind: 'p', runs: [pre, { t: String(pub.text ?? '').replace(/\{\{(\d+)\}\}/g, ' [ $1 ] ') }] });
            pub.options.forEach((o: string, i: number) => blocks.push({ kind: 'p', runs: [{ t: `${UP[i]}  ${o}` }] }));
            break;
          case 'matching':
            blocks.push({ kind: 'p', runs: [pre, { t: `Options: ${pub.options.join(', ')}`, bold: true }] });
            pub.statements.forEach((s: string, i: number) => blocks.push({ kind: 'p', runs: [{ t: `${i + 1}. ${s}  ` }, { blank: 4 }] }));
            break;
        }
        return;
      }
      case 'textBox':
      case 'revealBox':
        if (a.label) blocks.push({ kind: 'p', runs: [{ t: String(a.label).toUpperCase(), bold: true }] });
        node.content?.forEach((c) => walk(c));
        return;
      case 'randomPick':
        node.content?.forEach((c, i) => {
          blocks.push({ kind: 'p', runs: [{ t: `Card ${i + 1}${c.attrs?.title ? ': ' + c.attrs.title : ''}`, bold: true }] });
          c.content?.forEach((x) => walk(x));
        });
        return;
      case 'survey':
      case 'board':
      case 'drawBoard':
      case 'bankLink':
      case 'linkCard':
      case 'reflect':
        blocks.push({ kind: 'note', text: `[${node.type === 'survey' ? 'Survey' : node.type === 'reflect' ? 'Self-reflection' : 'Interactive block'}: done in the app]` });
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
  const blankRun = (w: number) => new TextRun({ text: '_'.repeat(w) });
  const runsToDocx = (runs: Run[]) =>
    runs.flatMap((r) => {
      if (r.blank) return [blankRun(r.blank)];
      if (r.options) return [new TextRun({ text: ' (' + r.options.join(' / ') + ') ' })];
      return [new TextRun({ text: r.t ?? '', bold: r.bold, italics: r.italic })];
    });
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  if (opts.header) children.push(new Paragraph({ children: [new TextRun('Name: ______________________________        Date: ______________')], spacing: { after: 300 } }));
  tasks.forEach((t, ti) => {
    children.push(new Paragraph({ text: `${ti + 1}. ${t.title}`, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    if (t.instructions) children.push(new Paragraph({ children: [new TextRun({ text: t.instructions, bold: true })] }));
    for (const b of t.blocks) {
      if (b.kind === 'p') children.push(new Paragraph({ children: runsToDocx(b.runs), bullet: b.list === 'bullet' ? { level: 0 } : undefined, numbering: b.list === 'number' ? { reference: 'nums', level: 0 } : undefined, heading: b.heading ? HeadingLevel.HEADING_3 : undefined }));
      else if (b.kind === 'note') children.push(new Paragraph({ children: [new TextRun({ text: b.text, italics: true, color: '888888' })] }));
      else if (b.kind === 'box') children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: b.label + ': ', bold: true }), new TextRun(b.words.join('   ·   '))] })] })] })] }));
      else if (b.kind === 'lines') {
        if (b.prompt) children.push(new Paragraph({ children: [new TextRun({ text: `(${b.n}) ${b.prompt}`, italics: true })] }));
        for (let i = 0; i < b.count; i++) children.push(new Paragraph({ children: [new TextRun('_'.repeat(90))], spacing: { before: 120 } }));
      } else if (b.kind === 'match')
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: Array.from({ length: Math.max(b.left.length, b.right.length) }, (_, i) => new TableRow({ children: [new TableCell({ borders: noBorders, children: [new Paragraph(b.left[i] ? `${i + 1}. ${b.left[i]}  ____` : '')] }), new TableCell({ borders: noBorders, children: [new Paragraph(b.right[i] ? `${LET[i]}) ${b.right[i]}` : '')] })] })),
          }),
        );
      else if (b.kind === 'table') children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, ri) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })] })) })) }));
    }
  });
  if (opts.key) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ text: 'Answer key', heading: HeadingLevel.HEADING_1 }));
    tasks.forEach((t, ti) => {
      if (!t.answers.length) return;
      children.push(new Paragraph({ text: `${ti + 1}. ${t.title}`, heading: HeadingLevel.HEADING_3 }));
      t.answers.forEach((a) => children.push(new Paragraph({ children: [new TextRun({ text: `(${a.n}) `, bold: true }), new TextRun(a.text)] })));
    });
  }
  const doc = new Document({
    numbering: { config: [{ reference: 'nums', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }] }] },
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
    sections: [{ children }],
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
