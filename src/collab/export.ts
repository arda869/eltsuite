import type { JSONContent } from '@tiptap/react';
import { textColor } from '../editor/TextColor';
import { highlightBg } from '../editor/Highlight';
import { inText, reference, refsTitle, sortKey, type CiteStyle, type Piece, type Source } from '../lib/cite';

// Shared documents as files: a Word document, or a page to print or save as PDF. Suggestions
// are shown as if accepted; comments are left out. Citations and the reference list are written
// in the document's citation style, so an assignment can go straight to a tutor.

export type ExportOpts = { style: CiteStyle; font: string; size: number; spacing: number; title: boolean; pageNumbers: boolean; wordCount: boolean };
export const EXPORT_DEFAULT: ExportOpts = { style: 'apa', font: 'Arial', size: 12, spacing: 1.5, title: true, pageNumbers: true, wordCount: false };
export const FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Verdana'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hex = (c?: string) => {
  const v = textColor(c) ?? '';
  return v.startsWith('#') ? v : c === 'accent' ? '#b8744e' : '';
};

// Words in the document, without the reference list (as assignments count them).
export function wordCount(json: JSONContent): number {
  let n = 0;
  const walk = (x: JSONContent) => {
    if (x.type === 'refList') return;
    if (x.type === 'text' && !(x.marks ?? []).some((m) => m.type === 'suggestDel')) n += (x.text ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    if (x.type === 'cite') n += 2;
    x.content?.forEach(walk);
  };
  walk(json);
  return n;
}
function cited(json: JSONContent): Source[] {
  const m = new Map<string, Source>();
  const walk = (x: JSONContent) => {
    if (x.type === 'cite' && x.attrs?.src) m.set(x.attrs.src.id || JSON.stringify(x.attrs.src), x.attrs.src as Source);
    x.content?.forEach(walk);
  };
  walk(json);
  return [...m.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

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
      else if (m.type === 'definition') {
        const d = m.attrs?.data ?? {};
        out = `<span class="defw">${out}</span>${d.meaning ? `<span class="defn"> (${esc(String(d.meaning))})</span>` : ''}`;
      }
    }
    return out;
  }
  if (n.type === 'hardBreak') return '<br>';
  if (n.type === 'cite' && n.attrs?.src) return esc(inText(n.attrs.src, o.style, n.attrs.page, n.attrs.narrative));
  if (n.type === 'ipa') return `<span class="ipa">/${esc(String(n.attrs?.text ?? ''))}/</span>`;
  if (n.type === 'stress') {
    const syl: string[] = n.attrs?.syllables ?? [];
    return syl.map((s, i) => (i === Number(n.attrs?.stressed ?? 0) ? `<b class="st">${esc(s)}</b>` : esc(s))).join('');
  }
  if (n.type === 'sym') return `<span class="sym">${esc(String(n.attrs?.text ?? ''))}</span>`;
  if (n.type === 'image' && n.attrs?.src) return `<img src="${esc(n.attrs.src)}" alt="${esc(n.attrs.alt ?? '')}">`;
  return (n.content ?? []).map((c) => inlineHtml(c, o)).join('');
}
const align = (n: JSONContent) => (n.attrs?.textAlign && n.attrs.textAlign !== 'left' ? ` style="text-align:${n.attrs.textAlign}"` : '');
// What the plain exporter writes itself; anything else (text boxes, timelines, sound cards,
// pronunciation marks) is printed as it looks on screen.
const PLAIN_BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'table', 'tableRow', 'tableHeader', 'tableCell', 'image', 'refList', 'horizontalRule', 'text', 'hardBreak', 'cite', 'ipa', 'stress', 'sym']);
const PLAIN_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'textColor', 'highlight', 'definition', 'suggestIns', 'suggestDel', 'comment', 'link']);
export function plainOnly(n: JSONContent): boolean {
  if (!PLAIN_BLOCKS.has(n.type ?? '')) return false;
  if ((n.marks ?? []).some((m) => !PLAIN_MARKS.has(m.type))) return false;
  return (n.content ?? []).every(plainOnly);
}
function blockHtml(n: JSONContent, o: ExportOpts, doc: JSONContent, live?: Element[]): string {
  if (n.type === 'doc' && live) return (n.content ?? []).map((c, i) => (plainOnly(c) || !live[i] ? blockHtml(c, o, doc) : `<div class="live doc cd-doc"><div class="ProseMirror">${cleanLive(live[i])}</div></div>`)).join('');
  const kids = () => (n.content ?? []).map((c) => blockHtml(c, o, doc)).join('');
  const inl = () => (n.content ?? []).map((c) => inlineHtml(c, o)).join('');
  switch (n.type) {
    case 'doc':
      return kids();
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
      return `<h2 class="refs-h">${refsTitle(o.style)}</h2>${cited(doc)
        .map((s) => `<p class="ref">${reference(s, o.style).map((p) => (p.i ? `<i>${esc(p.t)}</i>` : esc(p.t))).join('')}</p>`)
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

export function printDoc(json: JSONContent, title: string, o: ExportOpts = EXPORT_DEFAULT, liveRoot?: Element | null) {
  const live = liveRoot ? Array.from(liveRoot.children) : undefined;
  const needsApp = !!live && (json.content ?? []).some((c) => !plainOnly(c));
  const w = window.open('', '_blank');
  if (!w) return;
  const words = wordCount(json);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Document')}</title>${needsApp ? `<base href="${location.origin}/">${appStyles()}` : ''}
<style>
html, body { background: #fff !important; min-height: 0 !important; display: block !important; }
.live { margin: 0 0 3mm; } .live .ProseMirror { min-height: 0 !important; font: inherit; } .live * { break-inside: avoid; }
@page { size: A4; margin: 25mm 25mm; ${o.pageNumbers ? '@bottom-center { content: counter(page); }' : ''} }
body { font: ${o.size}pt/${o.spacing} '${o.font}', Arial, sans-serif; color: #111; max-width: 160mm; margin: 0 auto; }
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

type Run = { text: string; bold?: boolean; italics?: boolean; underline?: object; strike?: boolean; color?: string; shading?: object; font?: string };
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
        else if (m.type === 'textColor' && hex(m.attrs?.color)) r.color = hex(m.attrs?.color).slice(1);
        else if (m.type === 'highlight') r.shading = { type: 'clear', color: 'auto', fill: highlightBg(m.attrs?.color).slice(1) };
      }
      out.push(r);
      const def = marks.find((m) => m.type === 'definition')?.attrs?.data;
      if (def?.meaning) out.push({ text: ` (${def.meaning})`, color: '666666' });
    } else if (n.type === 'cite' && n.attrs?.src) out.push({ text: inText(n.attrs.src, o.style, n.attrs.page, n.attrs.narrative) });
    else if (n.type === 'ipa') out.push({ text: `/${n.attrs?.text ?? ''}/`, font: 'Segoe UI' });
    else if (n.type === 'stress') (n.attrs?.syllables ?? []).forEach((s: string, i: number) => out.push(i === Number(n.attrs?.stressed ?? 0) ? { text: s, bold: true, underline: {} } : { text: s }));
    else if (n.type === 'sym') out.push({ text: ` ${n.attrs?.text ?? ''} `, bold: true });
    else if (n.type === 'hardBreak') out.push({ text: '\n' });
    else runsOf(n.content, o, out);
  }
  return out;
}

export async function downloadDocx(json: JSONContent, title: string, o: ExportOpts = EXPORT_DEFAULT) {
  const D = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Footer, PageNumber, ImageRun } = D;
  const sz = o.size * 2;
  const line = Math.round(o.spacing * 240);
  const al = (n: JSONContent) => ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[n.attrs?.textAlign as string] ?? undefined);
  const run = (r: Run, extra: Record<string, unknown> = {}) => new TextRun({ ...r, font: r.font ?? o.font, size: sz, ...extra } as never);
  const para = (runs: Run[], opts: Record<string, unknown> = {}) => new Paragraph({ spacing: { after: 160, line }, ...opts, children: runs.map((r) => run(r)) });
  type Block = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  const out: Block[] = [];
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
    switch (n.type) {
      case 'doc':
        for (const c of n.content ?? []) await walk(c);
        return;
      case 'paragraph':
        out.push(para(list?.kind === 'number' ? [{ text: `${list.i}. ` }, ...runsOf(n.content, o)] : runsOf(n.content, o), { alignment: al(n), ...(list?.kind === 'bullet' ? { bullet: { level: 0 } } : {}) }));
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
        for (const s of cited(json)) out.push(new Paragraph({ spacing: { after: 160, line }, indent: { left: 720, hanging: 720 }, children: reference(s, o.style).map((p: Piece) => new TextRun({ text: p.t, italics: !!p.i, font: o.font, size: sz })) }));
        return;
      default:
        for (const c of n.content ?? []) await walk(c, list);
    }
  };
  await walk(json);
  if (o.wordCount) out.push(new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: `Word count: ${wordCount(json)} (without the reference list)`, font: o.font, size: sz - 2, color: '555555' })] }));
  const footers = o.pageNumbers ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: o.font, size: sz - 2 })] })] }) } : undefined;
  const doc = new Document({
    styles: { default: { document: { run: { font: o.font, size: sz } } } },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, footers, children: out }],
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(title || 'Document').replace(/[^\w\- ]+/g, '').trim() || 'Document'}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// For slides: one text box as HTML, in the default style.
export const textHtml = (json: JSONContent) => blockHtml(json, EXPORT_DEFAULT, json);
