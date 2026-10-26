import type { JSONContent } from '@tiptap/react';
import { textColor } from '../editor/TextColor';
import { highlightBg } from '../editor/Highlight';

// Shared documents as files: a Word document, or a page to print or save as PDF. Suggestions
// are shown as if accepted; comments are left out.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hex = (c?: string) => {
  const v = textColor(c) ?? '';
  return v.startsWith('#') ? v : c === 'accent' ? '#b8744e' : '';
};

function inlineHtml(n: JSONContent): string {
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
  if (n.type === 'ipa') return `<span class="ipa">/${esc(String(n.attrs?.text ?? ''))}/</span>`;
  if (n.type === 'stress') {
    const syl: string[] = n.attrs?.syllables ?? [];
    return syl.map((s, i) => (i === Number(n.attrs?.stressed ?? 0) ? `<b class="st">${esc(s)}</b>` : esc(s))).join('');
  }
  if (n.type === 'sym') return `<span class="sym">${esc(String(n.attrs?.text ?? ''))}</span>`;
  return (n.content ?? []).map(inlineHtml).join('');
}
function blockHtml(n: JSONContent): string {
  const kids = () => (n.content ?? []).map(blockHtml).join('');
  switch (n.type) {
    case 'doc':
      return kids();
    case 'paragraph':
      return `<p>${(n.content ?? []).map(inlineHtml).join('') || '&nbsp;'}</p>`;
    case 'heading':
      return `<h${n.attrs?.level === 3 ? 3 : 2}>${(n.content ?? []).map(inlineHtml).join('')}</h${n.attrs?.level === 3 ? 3 : 2}>`;
    case 'bulletList':
      return `<ul>${kids()}</ul>`;
    case 'orderedList':
      return `<ol>${kids()}</ol>`;
    case 'listItem':
      return `<li>${kids()}</li>`;
    case 'blockquote':
      return `<blockquote>${kids()}</blockquote>`;
    default:
      return (n.content ?? []).map((c) => (c.type === 'text' ? inlineHtml(c) : blockHtml(c))).join('');
  }
}

export function printDoc(json: JSONContent, title: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Document')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Karla:wght@400;600&family=Noto+Sans&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 20mm 18mm; }
body { font: 11pt/1.6 Fraunces, Georgia, serif; color: #2b2a28; max-width: 170mm; margin: 0 auto; }
h1 { font: 600 20pt/1.2 Fraunces, Georgia, serif; margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 1.2pt solid #d98f63; }
h2 { font: 600 14pt/1.3 Fraunces, Georgia, serif; margin: 6mm 0 2mm; } h3 { font: 600 12pt Fraunces, Georgia, serif; margin: 5mm 0 2mm; }
p { margin: 0 0 3mm; } ul, ol { margin: 0 0 3mm; padding-left: 7mm; }
.ipa { font-family: 'Noto Sans', 'Lucida Sans Unicode', sans-serif; } .st { text-decoration: underline; }
.sym { font: 600 9pt Karla, sans-serif; border: .5pt solid #3d3a36; border-radius: 1mm; padding: 0 1mm; }
.defn { font: 9pt Karla, sans-serif; color: #8a847d; } mark { padding: 0 .5mm; border-radius: .6mm; }
.foot { margin-top: 10mm; font: 8pt Karla, sans-serif; color: #8a847d; }
</style></head><body><h1>${esc(title || 'Document')}</h1>${blockHtml(json)}<div class="foot">Lesson Lit · ${new Date().toLocaleDateString()}</div>
<script>document.fonts.ready.then(() => setTimeout(() => print(), 200));</script></body></html>`);
  w.document.close();
}

type Run = { text: string; bold?: boolean; italics?: boolean; underline?: object; strike?: boolean; color?: string; shading?: object; font?: string };
function runsOf(nodes: JSONContent[] | undefined, out: Run[] = []): Run[] {
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
      if (def?.meaning) out.push({ text: ` (${def.meaning})`, color: '8A847D' });
    } else if (n.type === 'ipa') out.push({ text: `/${n.attrs?.text ?? ''}/`, font: 'Segoe UI' });
    else if (n.type === 'stress') (n.attrs?.syllables ?? []).forEach((s: string, i: number) => out.push(i === Number(n.attrs?.stressed ?? 0) ? { text: s, bold: true, underline: {} } : { text: s }));
    else if (n.type === 'sym') out.push({ text: ` ${n.attrs?.text ?? ''} `, bold: true });
    else if (n.type === 'hardBreak') out.push({ text: '\n' });
    else runsOf(n.content, out);
  }
  return out;
}

export async function downloadDocx(json: JSONContent, title: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = await import('docx');
  const SERIF = 'Fraunces';
  const para = (runs: Run[], opts: Record<string, unknown> = {}) => new Paragraph({ ...opts, children: runs.map((r) => new TextRun({ ...r, font: r.font ?? SERIF } as never)) });
  const out: InstanceType<typeof Paragraph>[] = [para([{ text: title || 'Document', bold: true }], { heading: HeadingLevel.TITLE, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 'D98F63', space: 6 } }, spacing: { after: 240 } })];
  const walk = (n: JSONContent, list?: { kind: 'bullet' | 'number'; i: number }) => {
    switch (n.type) {
      case 'doc':
        n.content?.forEach((c) => walk(c));
        return;
      case 'paragraph':
        out.push(para(list?.kind === 'number' ? [{ text: `${list.i}. ` }, ...runsOf(n.content)] : runsOf(n.content), { ...(list?.kind === 'bullet' ? { bullet: { level: 0 } } : {}), spacing: { after: 120, line: 320 } }));
        return;
      case 'heading':
        out.push(para(runsOf(n.content).map((r) => ({ ...r, bold: true })), { heading: n.attrs?.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
        return;
      case 'bulletList':
      case 'orderedList':
        n.content?.forEach((li, i) => li.content?.forEach((c) => walk(c, { kind: n.type === 'bulletList' ? 'bullet' : 'number', i: i + 1 })));
        return;
      default:
        n.content?.forEach((c) => walk(c, list));
    }
  };
  walk(json);
  const doc = new Document({ styles: { default: { document: { run: { font: SERIF, size: 22 } } } }, sections: [{ children: out }] });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(title || 'Document').replace(/[^\w\- ]+/g, '').trim() || 'Document'}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
