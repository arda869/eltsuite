import type { JSONContent } from '@tiptap/react';
import { textColor } from '../../editor/TextColor';
import { credit } from '../../lib/brand';
import { auth } from '../../lib/firebase';
import { textHtml as blockHtml } from '../export';
import { BGS, H, PT, W, textJSON, type El, type Slide } from './model';

// Slides as files: PowerPoint (.pptx), or pages to print or save as PDF.

const mix = (hex: string, pct: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * pct + 255 * (1 - pct));
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
};
export const bgHex = (k: string, accent: string) => (k === 'accent' ? accent : k === 'tint' ? mix(accent, 0.12) : k === 'paper' ? '#faf7f2' : k === 'dark' ? '#2b2a28' : '#ffffff');
const inkOf = (k: string) => BGS.find((b) => b.k === k)?.ink ?? '#2b2a28';
const fillHex = (c: string | undefined, accent: string) => (c === 'accent' ? accent : !c || c === 'none' ? '' : c);

type PRun = { text: string; options: Record<string, unknown> };
function runsOf(json: JSONContent, base: Record<string, unknown>): PRun[] {
  const out: PRun[] = [];
  const para = (p: JSONContent, extra: Record<string, unknown> = {}) => {
    const kids = p.content ?? [];
    if (!kids.length) return out.push({ text: ' ', options: { ...base, ...extra, breakLine: true } });
    kids.forEach((n, i) => {
      const o: Record<string, unknown> = { ...base, ...extra };
      if (n.type === 'text') {
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') o.bold = true;
          else if (m.type === 'italic') o.italic = true;
          else if (m.type === 'underline') o.underline = { style: 'sng' };
          else if (m.type === 'textColor') {
            const c = textColor(m.attrs?.color);
            if (c?.startsWith('#')) o.color = c.slice(1);
          }
        }
        out.push({ text: n.text ?? '', options: { ...o, ...(i === kids.length - 1 ? { breakLine: true } : {}) } });
      } else if (n.type === 'hardBreak') out.push({ text: '', options: { ...o, breakLine: true } });
    });
    return out.length;
  };
  for (const b of json.content ?? []) {
    if (b.type === 'paragraph' || b.type === 'heading') para(b);
    else if (b.type === 'bulletList' || b.type === 'orderedList') (b.content ?? []).forEach((li) => (li.content ?? []).forEach((p) => para(p, { bullet: b.type === 'orderedList' ? { type: 'number' } : true })));
  }
  if (out.length) delete out[out.length - 1].options.breakLine;
  return out;
}

export async function downloadPptx(slides: Slide[], title: string, accent: string) {
  const pptx = await buildPptx(slides, title, accent);
  await pptx.writeFile({ fileName: `${(title || 'Slides').replace(/[^\w\- ]+/g, '').trim() || 'Slides'}.pptx` });
}
export async function pptxBlob(slides: Slide[], title: string, accent: string): Promise<Blob> {
  const pptx = await buildPptx(slides, title, accent);
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}
async function buildPptx(slides: Slide[], title: string, accent: string) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9'; // 10 × 5.625 inches
  pptx.title = title;
  const cr = credit();
  pptx.author = (auth.currentUser?.displayName ?? '').trim() || 'ELT Suite';
  pptx.subject = cr.note;
  const inch = (u: number) => +(u / 100).toFixed(3);
  for (const s of slides) {
    const sl = pptx.addSlide();
    sl.background = { color: bgHex(s.bg, accent).slice(1) };
    const ink = inkOf(s.bg).slice(1);
    for (const e of s.els) {
      const box = { x: inch(e.x), y: inch(e.y), w: inch(e.w), h: inch(e.h) };
      if (e.type === 'text') {
        const runs = runsOf(textJSON(e.text), { fontFace: e.role === 'title' ? 'Georgia' : 'Arial', fontSize: PT[e.size ?? 'm'], color: ink });
        if (runs.length) sl.addText(runs as never, { ...box, valign: 'top', align: e.align ?? 'left', margin: 4, fit: 'shrink' } as never);
      } else if (e.type === 'image' && e.src) sl.addImage({ data: e.src, ...box, sizing: { type: 'cover', w: box.w, h: box.h } } as never);
      else if (e.type === 'shape') {
        const fill = fillHex(e.fill, accent);
        const stroke = fillHex(e.stroke, accent) || (e.shape === 'line' || e.shape === 'arrow' ? fill || '2b2a28' : '');
        const kind = e.shape === 'ellipse' ? pptx.ShapeType.ellipse : e.shape === 'round' ? pptx.ShapeType.roundRect : e.shape === 'line' || e.shape === 'arrow' ? pptx.ShapeType.line : pptx.ShapeType.rect;
        const line = e.shape === 'line' || e.shape === 'arrow';
        sl.addShape(kind, { ...box, ...(line ? { h: 0, y: inch(e.y + e.h / 2) } : {}), ...(fill && !line ? { fill: { color: fill.replace('#', '') } } : { fill: { type: 'none' } }), line: { color: (stroke || fill || '#2b2a28').replace('#', ''), width: line ? 2.5 : stroke ? 1.5 : 0, ...(e.shape === 'arrow' ? { endArrowType: 'triangle' } : {}) }, ...(e.shape === 'round' ? { rectRadius: 0.15 } : {}) } as never);
      }
    }
  }
  // Who made it, on the last slide, small.
  const end = pptx.addSlide();
  end.background = { color: 'FFFFFF' };
  end.addText([{ text: cr.by, options: { bold: true, breakLine: true } }, { text: cr.note, options: {} }] as never, { x: 0.8, y: 2.3, w: 8.4, h: 1, fontFace: 'Arial', fontSize: 12, color: '6F6A64', align: 'center' } as never);
  return pptx;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function elHtml(e: El, accent: string, ink: string): string {
  const pos = `left:${(e.x / W) * 100}%;top:${(e.y / H) * 100}%;width:${(e.w / W) * 100}%;height:${(e.h / H) * 100}%`;
  if (e.type === 'text') return `<div class="el t ${e.role === 'title' ? 'title' : ''}" style="${pos};font-size:${PT[e.size ?? 'm'] / 7.2}cqw;text-align:${e.align ?? 'left'};color:${ink}">${blockHtml(textJSON(e.text))}</div>`;
  if (e.type === 'image') return e.src ? `<div class="el" style="${pos}"><img src="${e.src}" alt=""></div>` : '';
  const fill = fillHex(e.fill, accent) || 'none';
  const stroke = fillHex(e.stroke, accent) || (e.shape === 'line' || e.shape === 'arrow' ? (fill === 'none' ? '#2b2a28' : fill) : 'none');
  const svg =
    e.shape === 'ellipse'
      ? `<ellipse cx="50" cy="50" rx="49" ry="49" fill="${fill}" stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
      : e.shape === 'line' || e.shape === 'arrow'
        ? `<line x1="1" y1="50" x2="${e.shape === 'arrow' ? 92 : 99}" y2="50" stroke="${stroke}" stroke-width="3" vector-effect="non-scaling-stroke"/>${e.shape === 'arrow' ? `<path d="M90 38 L100 50 L90 62 Z" fill="${stroke}"/>` : ''}`
        : `<rect x="1" y="1" width="98" height="98" rx="${e.shape === 'round' ? 10 : 0}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  return `<div class="el" style="${pos}"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg></div>`;
}

export function printSlides(slides: Slide[], title: string, accent: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const pages = slides
    .map((s) => `<section class="slide" style="background:${bgHex(s.bg, accent)}">${s.els.map((e) => elHtml(e, accent, inkOf(s.bg))).join('')}</section>`)
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Slides')}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Karla:wght@400;600&display=swap" rel="stylesheet">
<style>
@page { size: 254mm 142.875mm; margin: 0; }
html, body { margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.slide { position: relative; width: 254mm; height: 142.875mm; overflow: hidden; container-type: inline-size; page-break-after: always; break-after: page; font-family: Karla, sans-serif; }
.el { position: absolute; box-sizing: border-box; overflow: hidden; }
.el.t { padding: .6cqw .8cqw; line-height: 1.3; } .el.t.title { font-family: Fraunces, Georgia, serif; font-weight: 600; line-height: 1.15; }
.el.t p { margin: 0 0 .35em; } .el.t ul, .el.t ol { margin: 0; padding-left: 1.3em; }
.el img { width: 100%; height: 100%; object-fit: cover; display: block; } .el svg { width: 100%; height: 100%; display: block; overflow: visible; }
</style></head><body>${pages}<script>document.fonts.ready.then(() => setTimeout(() => print(), 300));</script></body></html>`);
  w.document.close();
}
