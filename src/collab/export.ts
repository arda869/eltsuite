import { credit } from '../lib/brand';
import type { JSONContent } from '@tiptap/react';
import { textColor } from '../editor/TextColor';
import { highlightBg } from '../editor/Highlight';
import { pageMetrics, type Layout } from './documentLayout';
import { questionIds as questionsIn } from '../lib/questions';
import { inText, orderFor, reference, refsTitle, type CiteStyle, type Piece, type Source } from '../lib/cite';

// Shared documents as files: a Word document, or a page to print or save as PDF. Suggestions
// are shown as if accepted; comments are left out. Citations and the reference list are written
// in the document's citation style, so an assignment can go straight to a tutor.

export type ExportOpts = { style: CiteStyle; font: string; size: number; spacing: number; title: boolean; pageNumbers: boolean; wordCount: boolean; layout?: Layout };
export const EXPORT_DEFAULT: ExportOpts = { style: 'apa', font: 'Arial', size: 12, spacing: 1.5, title: true, pageNumbers: true, wordCount: false };
export const FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Verdana'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cssString = (s: string) => JSON.stringify(s).replace(/</g, '\\3c ');
const layoutOptions = (o: ExportOpts): ExportOpts => o.layout ? { ...o, font: o.layout.font, size: o.layout.pt, spacing: o.layout.lineSpacing, pageNumbers: o.layout.pageNumbers } : o;
const worksheetNodes = new WeakMap<JSONContent, string>();
export async function prepareDocumentPrint(json: JSONContent) {
  if (!questionsIn(json).length) return;
  const [{ flattenTask }, { inlineWorksheetHtml }] = await Promise.all([import('../lib/worksheet'), import('../lib/worksheetHtml')]);
  const walk = (n: JSONContent) => {
    if (n.type === 'doc' || n.type === 'docSection') { n.content?.forEach(walk); return; }
    if (questionsIn(n).length) worksheetNodes.set(n, inlineWorksheetHtml(flattenTask({ title: '', content: { type: 'doc', content: [n] } })));
  };
  walk(json);
}
const hex = (c?: string) => {
  const v = textColor(c) ?? '';
  return v.startsWith('#') ? v : c === 'accent' ? '#b8744e' : '';
};

// Words in the document, without the reference list (as assignments count them).
export function documentStats(json: JSONContent) {
  let paragraphs = 0;
  const textOf = (n: JSONContent): string => {
    if (n.type === 'refList' || n.marks?.some((m) => m.type === 'suggestDel')) return '';
    if (n.type === 'text') return n.text ?? '';
    if (n.type === 'cite') return ' citation reference ';
    if (n.type === 'inlineMedia' && n.attrs?.media) return `<span>[Video: ${esc(String(n.attrs.title || 'Play in ELT Suite'))}]</span>`;
  if (n.type === 'hardBreak') return '\n';
    const text = (n.content ?? []).map(textOf).join('');
    if (n.type === 'paragraph' || n.type === 'heading') { if (text.trim()) paragraphs++; return text + '\n'; }
    return text;
  };
  const text = textOf(json).trim();
  const words = (text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? []).length;
  return { words, characters: Array.from(text).length, charactersNoSpaces: Array.from(text.replace(/\s/g, '')).length, paragraphs, readingMinutes: Math.ceil(words / 200) };
}
export const wordCount = (json: JSONContent): number => documentStats(json).words;
function cited(json: JSONContent, style: CiteStyle): Source[] {
  const m = new Map<string, Source>();
  const walk = (x: JSONContent) => {
    const k = x.attrs?.src && (x.attrs.src.id || JSON.stringify(x.attrs.src));
    if (x.type === 'cite' && k && !m.has(k)) m.set(k, x.attrs!.src as Source);
    x.content?.forEach(walk);
  };
  walk(json);
  return orderFor([...m.values()], style);
}
// For numbered styles: each source's number, set for the document being written out.
let nums = new Map<string, number>();
const numberAll = (json: JSONContent, style: CiteStyle) => void (nums = new Map(cited(json, style).map((s, i) => [s.id || JSON.stringify(s), i + 1])));
const numOf = (s: Source) => nums.get(s.id || JSON.stringify(s)) ?? 1;

function inlineHtml(n: JSONContent, o: ExportOpts): string {
  if (n.type === 'text') {
    const marks = n.marks ?? [];
    if (marks.some((m) => m.type === 'suggestDel')) return '';
    let out = esc(n.text ?? '');
    for (const m of marks) {
      if (m.type === 'bold') out = `<strong>${out}</strong>`;
      else if (m.type === 'italic') out = `<em>${out}</em>`;
      else if (m.type === 'underline') out = `<u>${out}</u>`;
      else if (m.type === 'strike') out = `<s>${out}</s>`;
      else if (m.type === 'textColor' && hex(m.attrs?.color)) out = `<span style="color:${hex(m.attrs?.color)}">${out}</span>`;
      else if (m.type === 'highlight') out = `<mark style="background:${highlightBg(m.attrs?.color)}">${out}</mark>`;
      else if (m.type === 'fontStyle' && (m.attrs?.family || m.attrs?.pt)) out = `<span style="${m.attrs?.family ? `font-family:'${esc(String(m.attrs.family))}';` : ''}${m.attrs?.pt ? `font-size:${Number(m.attrs.pt)}pt;` : ''}">${out}</span>`;
      else if (m.type === 'definition') {
        const d = m.attrs?.data ?? {};
        out = `<span class="defw">${out}</span>${d.meaning ? `<span class="defn"> (${esc(String(d.meaning))})</span>` : ''}`;
      }
    }
    return out;
  }
  if (n.type === 'inlineMedia' && n.attrs?.media) return `<span>[Video: ${esc(String(n.attrs.title || 'Play in ELT Suite'))}]</span>`;
  if (n.type === 'hardBreak') return '<br>';
  if (n.type === 'cite' && n.attrs?.src) return esc(inText(n.attrs.src, o.style, n.attrs.page, n.attrs.narrative, numOf(n.attrs.src)));
  if (n.type === 'ipa') return `<span class="ipa">/${esc(String(n.attrs?.text ?? ''))}/</span>`;
  if (n.type === 'stress') {
    const syl: string[] = n.attrs?.syllables ?? [];
    return syl.map((s, i) => (i === Number(n.attrs?.stressed ?? 0) ? `<b class="st">${esc(s)}</b>` : esc(s))).join('');
  }
  if (n.type === 'sym') return `<span class="sym">${esc(String(n.attrs?.text ?? ''))}</span>`;
  if (n.type === 'image' && n.attrs?.src) return `<img src="${esc(n.attrs.src)}" alt="${esc(n.attrs.alt ?? '')}">`;
  return (n.content ?? []).map((c) => inlineHtml(c, o)).join('');
}
const align = (n: JSONContent) => {
  const styles = [n.attrs?.textAlign && ['left', 'right', 'center', 'justify'].includes(n.attrs.textAlign) ? `text-align:${n.attrs.textAlign}` : '', n.attrs?.indent ? `margin-inline-start:${Math.max(0, Math.min(8, Number(n.attrs.indent))) * 12.7}mm` : ''].filter(Boolean).join(';');
  return styles ? ` style="${styles}"` : '';
};
// What the plain exporter writes itself; anything else (text boxes, timelines, sound cards,
// pronunciation marks) is printed as it looks on screen.
const PLAIN_BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'table', 'tableRow', 'tableHeader', 'tableCell', 'image', 'refList', 'horizontalRule', 'text', 'hardBreak', 'cite', 'ipa', 'stress', 'sym', 'docPageBreak', 'docSection']);
const PLAIN_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'textColor', 'highlight', 'definition', 'suggestIns', 'suggestDel', 'comment', 'link']);
export function plainOnly(n: JSONContent): boolean {
  if (!PLAIN_BLOCKS.has(n.type ?? '')) return false;
  if ((n.marks ?? []).some((m) => !PLAIN_MARKS.has(m.type))) return false;
  return (n.content ?? []).every(plainOnly);
}
function blockHtml(n: JSONContent, o: ExportOpts, doc: JSONContent, live?: Element[]): string {
  if (worksheetNodes.has(n)) return worksheetNodes.get(n)!;
  if (n.type === 'doc' && live) return (n.content ?? []).map((c, i) => (worksheetNodes.has(c) || c.type === 'docSection' || plainOnly(c) || !live[i] ? blockHtml(c, o, doc) : `<div class="live doc cd-doc"><div class="ProseMirror">${cleanLive(live[i])}</div></div>`)).join('');
  const kids = () => (n.content ?? []).map((c) => blockHtml(c, o, doc)).join('');
  const inl = () => (n.content ?? []).map((c) => inlineHtml(c, o)).join('');
  switch (n.type) {
    case 'doc':
      return kids();
    case 'docPageBreak':
      return '<div data-doc-page-break="" class="doc-page-break"></div>';
    case 'docSection':
      return `<section data-doc-section="" ${n.attrs?.newPage ? 'data-new-page=""' : ''} style="column-count:${Math.max(1, Math.min(3, Number(n.attrs?.columns) || 1))};column-gap:18pt;column-span:all;${n.attrs?.newPage ? 'break-before:page' : ''}">${kids()}</section>`;
    case 'paragraph':
      return `<p${align(n)}>${inl() || '&nbsp;'}</p>`;
    case 'heading': {
      const l = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)));
      return `<h${l + 1}${align(n)}>${inl()}</h${l + 1}>`;
    }
    case 'bulletList':
      return `<ul>${kids()}</ul>`;
    case 'orderedList':
      return `<ol>${kids()}</ol>`;
    case 'listItem':
      return `<li>${kids()}</li>`;
    case 'taskList':
      return `<ul style="list-style:none">${kids()}</ul>`;
    case 'taskItem':
      return `<li>${n.attrs?.checked ? '☑' : '☐'} ${kids()}</li>`;
    case 'blockquote':
      return `<blockquote>${kids()}</blockquote>`;
    case 'table':
      return `<table>${kids()}</table>`;
    case 'tableRow':
      return `<tr>${kids()}</tr>`;
    case 'tableHeader':
      return `<th>${kids()}</th>`;
    case 'tableCell':
      return `<td>${kids()}</td>`;
    case 'image':
      return inlineHtml(n, o);
    case 'horizontalRule':
      return '<hr>';
    case 'refList':
      return `<h2 class="refs-h">${refsTitle(o.style)}</h2>${cited(doc, o.style)
        .map((s, i) => `<p class="ref">${reference(s, o.style, i + 1).map((p) => (p.i ? `<i>${esc(p.t)}</i>` : esc(p.t))).join('')}</p>`)
        .join('')}`;
    default:
      return (n.content ?? []).map((c) => (c.type === 'text' ? inlineHtml(c, o) : blockHtml(c, o, doc))).join('');
  }
}

// A block as it is on screen, without the editing controls.
function cleanLive(el: Element): string {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('button, .block-handle, .line-add, [data-no-print], .ProseMirror-widget, .collaboration-cursor__caret').forEach((x) => x.remove());
  c.querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
  return c.outerHTML;
}
const appStyles = () =>
  Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((x) => x.outerHTML)
    .join('');

export async function printDoc(json: JSONContent, title: string, o: ExportOpts = EXPORT_DEFAULT, liveRoot?: Element | null) {
  // Open synchronously so browser popup blocking does not consume the user's click.
  const w = window.open('', '_blank');
  if (!w) return;
  await prepareDocumentPrint(json);
  o = layoutOptions(o);
  numberAll(json, o.style);
  const live = liveRoot ? Array.from(liveRoot.children) : undefined;
  const needsApp = !!live && (json.content ?? []).some((c) => !plainOnly(c));
  const metrics = o.layout ? pageMetrics(o.layout) : null;
  const footer = [o.layout?.footer ? cssString(o.layout.footer) : '', o.pageNumbers ? 'counter(page)' : ''].filter(Boolean).join(' " · " ');
  const words = wordCount(json);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Document')}</title>${needsApp ? `<base href="${location.origin}/">${appStyles()}` : ''}
<style>
html, body { background: #fff !important; min-height: 0 !important; display: block !important; }
.live { margin: 0 0 3mm; } .live .ProseMirror { min-height: 0 !important; font: inherit; } .live * { break-inside: avoid; }
@page { size: ${metrics ? `${metrics.css} ${o.layout!.orientation}` : 'A4'}; margin: ${metrics ? `${metrics.margin / 96}in` : '25mm'}; @top-center { content: ${cssString(o.layout?.header ?? '')}; } @bottom-center { content: ${footer || 'none'}; } }
${o.layout?.pageNumbers ? `@page:first { counter-reset: page ${o.layout.pageNumberStart}; }` : ''}
body { font: ${o.size}pt/${o.spacing} ${cssString(o.font)}, Arial, sans-serif; color: #111; margin: 0; column-count: ${o.layout?.columns ?? 1}; column-gap: 18pt; }
.doc-page-break { break-before: page; height:0 !important; min-height:0; } .doc-page-break span { display:none; }
.doc-worksheet .blank { display:inline-block; border-bottom:1px solid #333; min-width:3em; height:1em; vertical-align:baseline; } .doc-worksheet .qn { margin-right:.5em; } .doc-worksheet .stack { display:flex; gap:1em; flex-wrap:wrap; } .doc-worksheet .line { display:block; height:1.5em; border-bottom:1px solid #777; }
h1 { font-size: ${o.size + 6}pt; margin: 0 0 6mm; text-align: center; } h2 { font-size: ${o.size + 3}pt; margin: 6mm 0 2mm; } h3 { font-size: ${o.size + 1}pt; margin: 5mm 0 2mm; } h4 { font-size: ${o.size}pt; font-style: italic; margin: 4mm 0 2mm; }
p { margin: 0 0 3mm; } ul, ol { margin: 0 0 3mm; padding-left: 8mm; } blockquote { margin: 0 0 3mm 10mm; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0; } td, th { border: .5pt solid #666; padding: 1.5mm 2mm; vertical-align: top; text-align: left; } th { background: #f0f0f0; }
td p, th p { margin: 0; } img { max-width: 100%; }
.ref { padding-left: 12.7mm; text-indent: -12.7mm; } .ipa { font-family: 'Lucida Sans Unicode', 'Segoe UI', sans-serif; }
.defn { color: #666; } .wc { color: #555; font-size: ${o.size - 1}pt; margin-top: 8mm; }
</style></head><body>${o.title ? `<h1>${esc(title || 'Document')}</h1>` : ''}${blockHtml(json, o, json, live)}${o.wordCount ? `<p class="wc">Word count: ${words} (without the reference list)</p>` : ''}
<script>setTimeout(() => print(), ${needsApp ? 900 : 300});</script></body></html>`);
  w.document.close();
}

type Run = { text: string; bold?: boolean; italics?: boolean; underline?: object; strike?: boolean; color?: string; shading?: object; font?: string; size?: number };
function runsOf(nodes: JSONContent[] | undefined, o: ExportOpts, out: Run[] = []): Run[] {
  for (const n of nodes ?? []) {
    if (n.type === 'text') {
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === 'suggestDel')) continue;
      const r: Run = { text: n.text ?? '' };
      for (const m of marks) {
        if (m.type === 'bold') r.bold = true;
        else if (m.type === 'italic') r.italics = true;
        else if (m.type === 'underline') r.underline = {};
        else if (m.type === 'strike') r.strike = true;
        else if (m.type === 'fontStyle') { if (m.attrs?.family) r.font = m.attrs.family; if (m.attrs?.pt) r.size = Number(m.attrs.pt) * 2; }
        else if (m.type === 'textColor' && hex(m.attrs?.color)) r.color = hex(m.attrs?.color).slice(1);
        else if (m.type === 'highlight') r.shading = { type: 'clear', color: 'auto', fill: highlightBg(m.attrs?.color).slice(1) };
      }
      out.push(r);
      const def = marks.find((m) => m.type === 'definition')?.attrs?.data;
      if (def?.meaning) out.push({ text: ` (${def.meaning})`, color: '666666' });
    } else if (n.type === 'cite' && n.attrs?.src) out.push({ text: inText(n.attrs.src, o.style, n.attrs.page, n.attrs.narrative, numOf(n.attrs.src)) });
    else if (n.type === 'ipa') out.push({ text: `/${n.attrs?.text ?? ''}/`, font: 'Segoe UI' });
    else if (n.type === 'stress') (n.attrs?.syllables ?? []).forEach((s: string, i: number) => out.push(i === Number(n.attrs?.stressed ?? 0) ? { text: s, bold: true, underline: {} } : { text: s }));
    else if (n.type === 'sym') out.push({ text: ` ${n.attrs?.text ?? ''} `, bold: true });
    else if (n.type === 'hardBreak') out.push({ text: '\n' });
    else runsOf(n.content, o, out);
  }
  return out;
}

// The brand at the top of every page: the organisation's logo, or ELT Suite's. See lib/brand.ts.
export type BrandMark = { png: Uint8Array; w: number; h: number; name: string };
export async function downloadDocx(json: JSONContent, title: string, o: ExportOpts = EXPORT_DEFAULT) {
  const { brandMark } = await import('../lib/brand');
  const blob = await docxBlob(json, title, o, await brandMark().catch(() => null));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(title || 'Document').replace(/[^\w\- ]+/g, '').trim() || 'Document'}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function docxBlob(json: JSONContent, title: string, o: ExportOpts = EXPORT_DEFAULT, brand: BrandMark | null = null): Promise<Blob> {
  o = layoutOptions(o);
  await prepareDocumentPrint(json);
  numberAll(json, o.style);
  const D = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Footer, PageNumber, ImageRun } = D;
  const sz = o.size * 2;
  const line = Math.round(o.spacing * 240);
  const al = (n: JSONContent) => ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[n.attrs?.textAlign as string] ?? undefined);
  const run = (r: Run, extra: Record<string, unknown> = {}) => new TextRun({ ...r, font: r.font ?? o.font, size: r.size ?? sz, ...extra } as never);
  const para = (runs: Run[], opts: Record<string, unknown> = {}) => new Paragraph({ spacing: { after: 160, line }, ...opts, children: runs.map((r) => run(r)) });
  type Block = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  let out: Block[] = [];
  const sectionParts: { children: Block[]; columns: number; newPage: boolean }[] = [];
  let columns = o.layout?.columns ?? 1;
  let newPage = true;
  const finishSection = () => { if (out.length) sectionParts.push({ children: out, columns, newPage }); out = []; };
  if (o.title) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, heading: HeadingLevel.TITLE, children: [new TextRun({ text: title || 'Document', bold: true, font: o.font, size: sz + 12 })] }));
  const img = async (src: string) => {
    if (!src.startsWith('data:image/')) return null;
    const bytes = Uint8Array.from(atob(src.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    const dims = await new Promise<{ w: number; h: number }>((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res({ w: 600, h: 400 });
      i.src = src;
    });
    const w = Math.min(560, dims.w);
    return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new ImageRun({ type: src.startsWith('data:image/png') ? 'png' : 'jpg', data: bytes, transformation: { width: w, height: Math.round((dims.h / dims.w) * w) } } as never)] });
  };
  const cellParas = (c: JSONContent, head: boolean) => (c.content ?? []).map((p) => new Paragraph({ spacing: { after: 0, line: 260 }, children: runsOf(p.content, o).map((r) => run(head ? { ...r, bold: true } : r, { size: sz - 2 })) }));
  const walk = async (n: JSONContent, list?: { kind: 'bullet' | 'number'; i: number }) => {
    if (worksheetNodes.has(n)) {
      const html = new DOMParser().parseFromString(worksheetNodes.get(n)!, 'text/html');
      html.querySelectorAll('.blank').forEach((el) => { el.textContent = ' __________ '; });
      const text = (html.body.textContent ?? '').trim();
      out.push(para([{ text }]));
      return;
    }
    switch (n.type) {
      case 'doc':
        for (const c of n.content ?? []) await walk(c);
        return;
      case 'paragraph':
        out.push(para(list?.kind === 'number' ? [{ text: `${list.i}. ` }, ...runsOf(n.content, o)] : runsOf(n.content, o), { alignment: al(n), ...(n.attrs?.indent ? { indent: { left: Math.min(8, Number(n.attrs.indent)) * 720 } } : {}), ...(list?.kind === 'bullet' ? { bullet: { level: 0 } } : {}) }));
        return;
      case 'docPageBreak':
        out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        return;
      case 'docSection':
        finishSection();
        columns = Math.max(1, Math.min(3, Number(n.attrs?.columns) || 1));
        newPage = !!n.attrs?.newPage;
        for (const child of n.content ?? []) await walk(child);
        finishSection();
        columns = o.layout?.columns ?? 1;
        newPage = false;
        return;
      case 'heading': {
        const l = Number(n.attrs?.level ?? 2);
        out.push(new Paragraph({ heading: l === 1 ? HeadingLevel.HEADING_1 : l === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, alignment: al(n), spacing: { before: 240, after: 120 }, children: runsOf(n.content, o).map((r) => run({ ...r, bold: true }, { size: sz + (l === 1 ? 6 : l === 2 ? 3 : 1), color: '000000', italics: l === 3 || r.italics })) }));
        return;
      }
      case 'bulletList':
      case 'orderedList': {
        let i = 0;
        for (const li of n.content ?? []) {
          i++;
          for (const c of li.content ?? []) await walk(c, { kind: n.type === 'bulletList' ? 'bullet' : 'number', i });
        }
        return;
      }
      case 'blockquote':
        for (const c of n.content ?? []) out.push(para(runsOf(c.content, o), { indent: { left: 720 } }));
        return;
      case 'taskList':
        for (const li of n.content ?? []) out.push(para([{ text: li.attrs?.checked ? '☑ ' : '☐ ' }, ...runsOf((li.content ?? [])[0]?.content, o)]));
        return;
      case 'horizontalRule':
        out.push(new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, children: [] }));
        return;
      case 'table': {
        const rows = (n.content ?? []).map((r) => new TableRow({ children: (r.content ?? []).map((c) => new TableCell({ children: cellParas(c, c.type === 'tableHeader'), shading: c.type === 'tableHeader' ? { type: 'clear' as never, color: 'auto', fill: 'F0F0F0' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 } })) }));
        const b = { style: BorderStyle.SINGLE, size: 4, color: '777777' };
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, borders: { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b } }), new Paragraph({ spacing: { after: 120 }, children: [] }));
        return;
      }
      case 'image': {
        const p = await img(String(n.attrs?.src ?? ''));
        if (p) out.push(p);
        return;
      }
      case 'refList':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, pageBreakBefore: false, children: [new TextRun({ text: refsTitle(o.style), bold: true, font: o.font, size: sz + 6, color: '000000' })] }));
        for (const [i, s] of cited(json, o.style).entries()) out.push(new Paragraph({ spacing: { after: 160, line }, indent: { left: 720, hanging: 720 }, children: reference(s, o.style, i + 1).map((p: Piece) => new TextRun({ text: p.t, italics: !!p.i, font: o.font, size: sz })) }));
        return;
      default:
        for (const c of n.content ?? []) await walk(c, list);
    }
  };
  await walk(json);
  if (o.wordCount) out.push(new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: `Word count: ${wordCount(json)} (without the reference list)`, font: o.font, size: sz - 2, color: '555555' })] }));
  const mark = (t: string) => new TextRun({ text: t, font: o.font, size: sz - 4, color: '8A847D' });
  finishSection();
  const footers = { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [...(o.layout?.footer ? [mark(o.layout.footer + '   ')] : []), ...(o.pageNumbers ? [new TextRun({ children: [PageNumber.CURRENT], font: o.font, size: sz - 2 }), mark('   ·   ')] : []), mark(credit().by)] }), new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: credit().note, font: o.font, size: sz - 6, color: '8A847D', italics: true })] })] }) };
  const { Header } = D;
  const headers = brand || o.layout?.header ? { default: new Header({ children: [...(brand ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ data: brand.png, transformation: { width: Math.round((brand.w / brand.h) * 28), height: 28 }, type: 'png' } as never)] })] : []), ...(o.layout?.header ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [mark(o.layout.header)] })] : [])] }) } : undefined;
  const metrics = o.layout ? pageMetrics(o.layout) : null;
  const doc = new Document({
    styles: { default: { document: { run: { font: o.font, size: sz } } } },
    sections: (sectionParts.length ? sectionParts : [{ children: [], columns: 1, newPage: true }]).map((part, i) => ({ properties: { type: part.newPage ? D.SectionType.NEXT_PAGE : D.SectionType.CONTINUOUS, column: { count: part.columns, space: 360 }, page: { ...(metrics ? { size: { width: Math.round(Math.min(metrics.w, metrics.h) * 15), height: Math.round(Math.max(metrics.w, metrics.h) * 15), orientation: o.layout!.orientation === 'landscape' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT } } : {}), margin: { top: metrics ? metrics.margin * 15 : 1440, bottom: metrics ? metrics.margin * 15 : 1440, left: metrics ? metrics.margin * 15 : 1440, right: metrics ? metrics.margin * 15 : 1440 }, ...(i === 0 && o.layout?.pageNumbers ? { pageNumbers: { start: o.layout.pageNumberStart } } : {}) } }, headers, footers, children: part.children })),
  });
  return Packer.toBlob(doc);
}

// For slides: one text box as HTML, in the default style.
export const textHtml = (json: JSONContent) => blockHtml(json, EXPORT_DEFAULT, json);

// The document as a page of HTML, for the PDF in a folder download.
export const docBodyHtml = (json: JSONContent, title: string, o: ExportOpts = EXPORT_DEFAULT) => {
  o = layoutOptions(o);
  numberAll(json, o.style);
  const style = `font-family:${cssString(o.font)};font-size:${o.size}pt;line-height:${o.spacing};column-count:${o.layout?.columns ?? 1};column-gap:18pt`;
  return `<style>.doc-worksheet .blank{display:inline-block;border-bottom:1px solid #333;min-width:3em;height:1em}.doc-worksheet .qn{margin-right:.5em}.doc-worksheet .stack{display:flex;gap:1em;flex-wrap:wrap}.doc-worksheet .line{display:block;height:1.5em;border-bottom:1px solid #777}.doc-page-break{height:0!important;min-height:0}.doc-page-break span{display:none}</style><div class="doc-export" style="${style.replace(/"/g, '&quot;')}">${o.title ? `<h1>${esc(title || 'Document')}</h1>` : ''}${blockHtml(json, o, json)}</div>`;
};
