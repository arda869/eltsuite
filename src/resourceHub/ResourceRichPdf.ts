import { refText, resolveRef } from '../lib/identity';
import type { JSONContent } from '@tiptap/react';
import type { HubActivity, HubCollection } from './catalog';
import { generatedAnswerLinesForSection } from './hubAnswerKey';
import { monoContours } from './monoPrint';

type Section = NonNullable<HubActivity['editorSections']>[number];
type PrintCollection = HubCollection & { paperAccent?: string; headerImage?: string };
type RichPackOptions = { activity: HubActivity; collection?: PrintCollection; learnerIds: string[]; teacherIds: string[]; copies: number; paper: 'a4' | 'letter'; colour: 'colour' | 'mono' };
type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; href?: string };
type Block = { kind: 'text' | 'heading' | 'table'; runs?: Run[]; rows?: string[][]; level?: number };

const textOf = (node: JSONContent): string => node.text ?? (node.content ?? []).map(textOf).join('');
const printNodes = new Set(['doc', 'text', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader', 'gap', 'dropgap', 'choice', 'mcq', 'match', 'order', 'writing', 'wordbank', 'subTask']);
export const hasDigitalOnlyItems = (node: JSONContent): boolean => !printNodes.has(node.type ?? '') || !!node.content?.some(hasDigitalOnlyItems);
const runsOf = (node: JSONContent, gapChars: number): Run[] => node.type === 'activityRef' ? [{ text: (v => v.version ? `[${v.version}] ${v.label}` : refText(v))(resolveRef(node.attrs ?? {}, null)), bold: true }] : node.type === 'ipa' ? [{ text: `/${String(node.attrs?.text ?? '')}/` }] : node.type === 'stress' ? [{ text: (node.attrs?.syllables ?? []).join('') }] : node.type === 'sym' ? [{ text: String(node.attrs?.text ?? '') }] : node.type === 'inlineMedia' ? [{ text: `[${node.attrs?.kind === 'video' ? 'Video' : 'Recording'}: ${node.attrs?.title || 'Play'}]` }] : node.type === 'hardBreak' ? [{ text: ' ' }] : node.type === 'text' ? [{ text: node.text ?? '', bold: node.marks?.some(mark => mark.type === 'bold'), italic: node.marks?.some(mark => mark.type === 'italic'), underline: node.marks?.some(mark => mark.type === 'underline' || mark.type === 'link'), strike: node.marks?.some(mark => mark.type === 'strike'), href: node.marks?.find(mark => mark.type === 'link')?.attrs?.href as string | undefined }] : node.type === 'gap' || node.type === 'dropgap' ? [{ text: ` ${'_'.repeat(gapChars)} ` }] : node.type === 'choice' || node.type === 'mcq' ? [{ text: ` (${(node.attrs?.options ?? []).filter(Boolean).join(' / ')}) ` }] : (node.content ?? []).flatMap(child => runsOf(child, gapChars));
/** One paper width per resource, based on the mean answer length rather than the longest outlier. */
export function averageGapChars(sections: Section[]): number {
  const lengths: number[] = [];
  const visit = (node: JSONContent) => {
    if (!node.attrs?.example && (node.type === 'gap' || node.type === 'dropgap')) {
      const answers = node.type === 'gap' ? node.attrs?.answers ?? [] : [node.attrs?.answer];
      lengths.push(Math.max(0, ...answers.map((answer: unknown) => String(answer ?? '').trim().length)) || 8);
    }
    node.content?.forEach(visit);
  };
  sections.forEach(section => visit(section.content));
  return Math.max(8, Math.min(30, Math.round(lengths.reduce((total, value) => total + value, 0) / (lengths.length || 1)) + 3));
}
const questionText = (node: JSONContent): string => {
  const a = node.attrs ?? {};
  if (node.type === 'match') return `Match the items: ${(a.pairs ?? []).map((pair: { left: string }) => pair.left).filter(Boolean).join(' · ')} | Options: ${[...(a.pairs ?? []).map((pair: { right: string }) => pair.right), ...(a.extras ?? [])].filter(Boolean).join(' · ')}`;
  if (node.type === 'order') return `Put the words in order: ${String(a.sentence ?? '').split(/\s+/).filter(Boolean).reverse().join(' / ')}`;
  if (node.type === 'writing') return `Long answer${a.minWords ? ` · at least ${a.minWords} words` : ''}`;
  if (node.type === 'pq') {
    const data = a.data ?? {};
    const prompt = data.instruction || data.first || data.sentence || data.text || data.prompt || '';
    return `${String(a.kind ?? 'Question').replace(/^./, (letter: string) => letter.toUpperCase())}: ${String(prompt)}`;
  }
  return `${String(node.type ?? 'Interactive item').replace(/([A-Z])/g, ' $1')}: ${String(a.title || a.prompt || a.instruction || '').trim()}`.trim();
};
function blocksOf(content: JSONContent, gapChars: number): Block[] {
  const blocks: Block[] = [];
  let subTaskIndex = 0;
  const dropAnswers: string[] = [];
  const findDropAnswers = (node: JSONContent) => { if (node.type === 'dropgap' && node.attrs?.answer) dropAnswers.push(String(node.attrs.answer)); node.content?.forEach(findDropAnswers); };
  findDropAnswers(content);
  const visit = (node: JSONContent, prefix = '') => {
    if (node.type === 'subTask') {
      const letter = String.fromCharCode(97 + subTaskIndex++);
      const instruction = String(node.attrs?.paperInstr || node.attrs?.instr || '').trim();
      blocks.push({ kind: 'text', runs: [{ text: `${letter}. ${instruction}`.trim() }] });
      node.content?.forEach(child => visit(child));
      return;
    }
    if (node.type === 'image' || node.type === 'picture' || node.type === 'media') { blocks.push({ kind: 'text', runs: [{ text: `DIGITAL ONLY — ${node.type === 'media' ? 'Media' : 'Image'} is available in the Class activity and is not reproduced on this page.` }] }); return; }
    if (node.type === 'table') {
      blocks.push({ kind: 'table', rows: (node.content ?? []).map(row => (row.content ?? []).map(cell => textOf(cell).trim())) });
      return;
    }
    if (node.type === 'wordbank') { blocks.push({ kind: 'text', runs: [{ text: `Word bank: ${[...dropAnswers, ...(node.attrs?.extras ?? [])].filter(Boolean).join(' · ')}` }] }); return; }
    if (node.type === 'heading') { blocks.push({ kind: 'heading', runs: runsOf(node, gapChars), level: Number(node.attrs?.level) || 3 }); return; }
    if (node.type === 'paragraph') { const runs = [...(prefix ? [{ text: prefix }] : []), ...runsOf(node, gapChars)]; if (runs.some(run => run.text.trim())) blocks.push({ kind: 'text', runs }); return; }
    if (node.type === 'bulletList' || node.type === 'orderedList') { (node.content ?? []).forEach((child, index) => visit(child, node.type === 'bulletList' ? '• ' : `${index + 1}. `)); return; }
    if (node.type === 'listItem') { (node.content ?? []).forEach((child, index) => visit(child, index === 0 ? prefix : '')); return; }
    if (node.type && !['doc', 'text', 'gap', 'dropgap', 'choice', 'mcq'].includes(node.type) && node.attrs?.id) {
      blocks.push({ kind: 'text', runs: [{ text: questionText(node) }] });
      return;
    }
    for (const child of node.content ?? []) visit(child, prefix);
  };
  visit(content);
  return blocks;
}

const fontData = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error('The print font could not be loaded.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

const colourOf = (hex: string | undefined): readonly [number, number, number] => /^#[0-9a-f]{6}$/i.test(hex ?? '')
  ? [1, 3, 5].map(index => Number.parseInt((hex ?? '').slice(index, index + 2), 16)) as [number, number, number]
  : [143, 81, 54];

async function printableHeader(source: string, mono: boolean): Promise<{ data: string; width: number; height: number }> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The collection header image could not be loaded for print.'));
    image.src = source;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The collection header image could not be prepared for print.');
  context.drawImage(image, 0, 0);
  if (mono) monoContours(context, canvas.width, canvas.height);
  try { return { data: canvas.toDataURL(mono ? 'image/png' : 'image/jpeg', .86), width: canvas.width, height: canvas.height }; }
  catch { throw new Error('The collection header image cannot be printed from its current URL.'); }
}

/** Builds a real PDF from editor sections; learner copies are grouped first and private teacher sections last. */
export async function makeEditorResourcePdf({ activity, collection, learnerIds, teacherIds, copies, paper, colour }: RichPackOptions): Promise<Uint8Array> {
  const sections = activity.editorSections ?? [];
  const learners = sections.filter(section => section.audience === 'learner' && learnerIds.includes(section.id));
  const teachers = sections.filter(section => section.audience === 'teacher' && teacherIds.includes(section.id));
  const gapChars = averageGapChars(learners);
  if (!learners.length && !teachers.length) throw new Error('Choose at least one section.');
  if (!Number.isInteger(copies) || copies < 1 || copies > 30) throw new Error('Choose 1–30 learner copies.');
  const [{ jsPDF }, regular, bold, italic, header] = await Promise.all([import('jspdf'), fontData('/fonts/atkinson/Regular.ttf'), fontData('/fonts/atkinson/Bold.ttf'), fontData('/fonts/atkinson/Italic.ttf'), collection?.headerImage ? printableHeader(collection.headerImage, colour === 'mono') : Promise.resolve(null)]);
  const createPdf = () => {
    const file = new jsPDF({ unit: 'mm', format: paper, orientation: 'portrait', compress: true });
    file.addFileToVFS('Atkinson-Regular.ttf', regular); file.addFont('Atkinson-Regular.ttf', 'Atkinson', 'normal');
    file.addFileToVFS('Atkinson-Bold.ttf', bold); file.addFont('Atkinson-Bold.ttf', 'Atkinson', 'bold');
    file.addFileToVFS('Atkinson-Italic.ttf', italic); file.addFont('Atkinson-Italic.ttf', 'Atkinson', 'italic');
    return file;
  };
  let pdf = createPdf();
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  const margin = 19, contentWidth = width - margin * 2, bottom = height - 20;
  let started = false, y = 0, sectionBottom = bottom;
  const ink = colour === 'mono' ? [0, 0, 0] as const : [58, 56, 48] as const;
  const accent = colour === 'mono' ? [0, 0, 0] as const : colourOf(collection?.paperAccent || collection?.accent);
  const setInk = (rgb: readonly number[]) => pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
  const begin = (section: Section, placement: 'full' | 'top' | 'bottom' = 'full') => {
    if (started && placement !== 'bottom') pdf.addPage(paper, 'portrait');
    started = true; y = placement === 'bottom' ? height / 2 + 15 : 22;
    sectionBottom = placement === 'top' ? height / 2 - 9 : bottom;
    if (header) {
      const fitWidth = Math.min(contentWidth, 25 * header.width / header.height);
      const fitHeight = fitWidth * header.height / header.width;
      pdf.addImage(header.data, colour === 'mono' ? 'PNG' : 'JPEG', margin, y - 8, fitWidth, fitHeight);
      y += fitHeight + 2;
    }
    pdf.setFont('Atkinson', 'bold'); pdf.setFontSize(9); setInk(accent);
    const activityLines = pdf.splitTextToSize(activity.title.toUpperCase(), contentWidth) as string[];
    pdf.text(activityLines, margin, y); y += activityLines.length * 4 + 3;
    pdf.setDrawColor(colour === 'mono' ? 0 : 211, colour === 'mono' ? 0 : 207, colour === 'mono' ? 0 : 197); pdf.line(margin, y, width - margin, y); y += 11;
    pdf.setFontSize(18); setInk(ink);
    const titleLines = pdf.splitTextToSize(section.versionLabel ? `${section.title} · ${section.versionLabel}` : section.title, contentWidth) as string[];
    pdf.text(titleLines, margin, y); y += titleLines.length * 8 + 2;
  };
  const nextPage = () => { pdf.addPage(paper, 'portrait'); y = 21; sectionBottom = bottom; };
  const lines = (text: string, fontSize = 10.5, boldLine = false, gap = 3) => {
    pdf.setFont('Atkinson', boldLine ? 'bold' : 'normal'); pdf.setFontSize(fontSize); setInk(boldLine ? accent : ink);
    const wrapped = pdf.splitTextToSize(text, contentWidth) as string[];
    const lineHeight = fontSize * .45;
    for (const line of wrapped) { if (y + lineHeight > sectionBottom) nextPage(); pdf.text(line, margin, y); y += lineHeight; }
    y += gap;
  };
  const richLines = (runs: Run[], fontSize = 10.5, heading = false) => {
    let x = margin;
    const lineHeight = fontSize * .48;
    for (const run of runs) {
      pdf.setFont('Atkinson', run.bold || heading ? 'bold' : run.italic ? 'italic' : 'normal');
      pdf.setFontSize(fontSize); setInk(run.href && colour !== 'mono' ? [77, 100, 146] : heading ? accent : ink);
      const tokens = run.text.split(/(\s+)/).filter(Boolean);
      for (const token of tokens) {
        if (/^\s+$/.test(token) && x === margin) continue;
        const pieces = pdf.getTextWidth(token) > contentWidth ? pdf.splitTextToSize(token, contentWidth) as string[] : [token];
        for (const piece of pieces) {
          const tokenWidth = pdf.getTextWidth(piece);
          if (x + tokenWidth > width - margin && x > margin) { y += lineHeight; x = margin; }
          if (y + lineHeight > sectionBottom) { nextPage(); x = margin; }
          if (!/^\s+$/.test(piece)) {
            pdf.text(piece, x, y);
            if (run.underline || run.href) { pdf.setDrawColor(run.href && colour !== 'mono' ? 77 : ink[0], run.href && colour !== 'mono' ? 100 : ink[1], run.href && colour !== 'mono' ? 146 : ink[2]); pdf.line(x, y + .7, x + tokenWidth, y + .7); }
            if (run.strike) { pdf.setDrawColor(ink[0], ink[1], ink[2]); pdf.line(x, y - fontSize * .15, x + tokenWidth, y - fontSize * .15); }
            if (run.href && /^https?:\/\//i.test(run.href)) pdf.link(x, y - fontSize * .34, tokenWidth, lineHeight, { url: run.href });
          }
          x += tokenWidth;
        }
      }
    }
    y += lineHeight + (heading ? 4 : 3);
  };
  const table = (rows: string[][]) => {
    if (!rows.length) return;
    const columns = Math.max(1, ...rows.map(row => row.length));
    const cellWidth = contentWidth / columns;
    for (const [rowIndex, row] of rows.entries()) {
      pdf.setFont('Atkinson', rowIndex === 0 ? 'bold' : 'normal'); pdf.setFontSize(8.5); setInk(ink);
      const cells = Array.from({ length: columns }, (_, col) => pdf.splitTextToSize(row[col] ?? '', cellWidth - 5) as string[]);
      const rowHeight = Math.max(9, ...cells.map(cell => cell.length * 4.1 + 4));
      if (y + rowHeight > sectionBottom) nextPage();
      cells.forEach((cell, col) => {
        pdf.setDrawColor(colour === 'mono' ? 0 : 194, colour === 'mono' ? 0 : 191, colour === 'mono' ? 0 : 181); pdf.rect(margin + col * cellWidth, y, cellWidth, rowHeight);
        cell.forEach((line, lineIndex) => pdf.text(line, margin + col * cellWidth + 2.5, y + 5 + lineIndex * 4.1));
      });
      y += rowHeight;
    }
    y += 4;
  };
  const drawBlocks = (content: JSONContent) => {
    for (const block of blocksOf(content, gapChars)) {
      if (block.kind === 'table') table(block.rows ?? []);
      else if (block.kind === 'heading') richLines(block.runs ?? [], block.level === 2 ? 15 : 12, true);
      else richLines(block.runs ?? []);
    }
  };
  const draw = (section: Section, placement: 'full' | 'top' | 'bottom' = 'full') => {
    begin(section, placement);
    if (hasDigitalOnlyItems(section.content)) lines('DIGITAL ONLY CONTENT · This print page does not reproduce every interactive or visual item. Use the Class activity for the complete task.', 9.5, true, 6);
    const paperOverride = !!section.printInstructions?.trim() || !!section.printInstrDoc;
    const instruction = paperOverride ? section.printInstructions?.trim() ?? '' : section.instructions.trim();
    const instructionDoc = paperOverride ? section.printInstrDoc : section.instrDoc;
    if (instructionDoc) richLines(runsOf(instructionDoc, gapChars), 10.5, true);
    else if (instruction) lines(instruction, 10.5, true, 7);
    drawBlocks(section.content);
  };
  const drawTeacherGuide = () => {
    if (!teachers.length) return;
    begin({ id: 'teacher-guide', title: 'Teacher notes', audience: 'teacher', kind: 'notes', instructions: '', content: { type: 'doc', content: [] } });
    // Teacher-led phases can stand alone; they do not need a matching learner page.
    for (const section of teachers.filter(item => item.kind === 'notes')) {
      lines(section.title, 13, true, 4);
      if (section.instrDoc) richLines(runsOf(section.instrDoc, gapChars), 10.5);
      else if (section.instructions.trim()) lines(section.instructions.trim(), 10.5, false, 5);
      drawBlocks(section.content);
      y += 4;
    }
    // Keep each key directly under its task's instruction, as in the Class teacher export.
    for (const section of learners) {
      const answers = generatedAnswerLinesForSection(section);
      if (!answers.length) continue;
      lines(section.versionLabel ? `${section.title} · ${section.versionLabel}` : section.title, 13, true, 4);
      const paperOverride = !!section.printInstructions?.trim() || !!section.printInstrDoc;
      const instruction = paperOverride ? section.printInstructions?.trim() ?? '' : section.instructions.trim();
      const instructionDoc = paperOverride ? section.printInstrDoc : section.instrDoc;
      if (instructionDoc) richLines(runsOf(instructionDoc, gapChars), 10.5);
      else if (instruction) lines(instruction, 10.5, false, 4);
      answers.forEach(answer => lines(answer, 10.5, false, 1));
      y += 5;
    }
    // Preserve teacher-authored suggested answers without repeating the generated key.
    for (const section of teachers.filter(item => item.kind === 'answer-key')) {
      const manual = { ...section.content, content: (section.content.content ?? []).filter(node => node.attrs?.hubGeneratedAnswer !== true) };
      if (!manual.content?.length && !section.instructions.trim()) continue;
      lines(section.title, 13, true, 4);
      if (section.instructions.trim()) lines(section.instructions.trim(), 10.5, false, 4);
      drawBlocks(manual);
    }
  };
  const groups = new Map<string, Section[]>();
  learners.forEach(section => { if (section.versionGroup) groups.set(section.versionGroup, [...(groups.get(section.versionGroup) ?? []), section]); });
  const shortGroups = new Set<string>();
  for (const [groupId, versions] of groups) {
    if (versions.length < 2) continue;
    const short = versions.every(section => {
      pdf = createPdf(); started = false; y = 0; sectionBottom = bottom;
      draw(section);
      return pdf.getNumberOfPages() === 1 && y <= height / 2 - 9;
    });
    if (short) shortGroups.add(groupId);
  }
  pdf = createPdf(); started = false; y = 0; sectionBottom = bottom;
  for (let copy = 0; copy < copies; copy++) {
    const renderedGroups = new Set<string>();
    for (const section of learners) {
      const groupId = section.versionGroup;
      if (!groupId || !groups.has(groupId) || groups.get(groupId)!.length < 2) { draw(section); continue; }
      if (renderedGroups.has(groupId)) continue;
      renderedGroups.add(groupId);
      const versions = groups.get(groupId)!;
      versions.forEach((version, index) => {
        if (!shortGroups.has(groupId) || index % 2 === 0 && index === versions.length - 1) { draw(version); return; }
        if (index % 2 === 0) { draw(version, 'top'); return; }
        pdf.setDrawColor(colour === 'mono' ? 0 : 111, colour === 'mono' ? 0 : 106, colour === 'mono' ? 0 : 100); pdf.setLineWidth(.28); pdf.setLineDashPattern([2, 1.2], 0);
        pdf.line(margin, height / 2, width - margin, height / 2); pdf.setLineDashPattern([], 0);
        pdf.circle(margin - 6, height / 2 - 1.8, 1.2); pdf.circle(margin - 6, height / 2 + 1.8, 1.2);
        pdf.line(margin - 5, height / 2 - 1, margin - 2, height / 2 + 1.5); pdf.line(margin - 5, height / 2 + 1, margin - 2, height / 2 - 1.5);
        draw(version, 'bottom');
      });
    }
  }
  drawTeacherGuide();
  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index); pdf.setFont('Atkinson', 'normal'); pdf.setFontSize(8); pdf.setTextColor(colour === 'mono' ? 0 : 125, colour === 'mono' ? 0 : 122, colour === 'mono' ? 0 : 112);
    pdf.text(`${index} / ${pages}`, width - margin, height - 10, { align: 'right' });
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
