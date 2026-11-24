import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { MARK_COLORS, inkColor } from './colours';

// The PDF as it looks in ELT Suite: the original pages, untouched and sharp, with the highlights and
// drawings drawn on as shapes and each text box as a crisp picture where it sits. Answer boxes are
// left out unless asked for.

const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex) ?? ['', 'ff', 'ff', '00'];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
};
// A highlight colour as solid RGB: the mark colours are CSS colours, sometimes with alpha.
function markRgb(k: string): [number, number, number] {
  const bg = MARK_COLORS.find((c) => c.k === k)?.bg ?? '#ffe066';
  const probe = document.createElement('span');
  probe.style.color = bg;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const n = c.match(/[\d.]+/g)?.map(Number) ?? [255, 224, 102];
  return [n[0] / 255, n[1] / 255, n[2] / 255];
}

export type ExportChoice = { answers: boolean; ocr?: Record<number, import('./ocr').OcrPage> };

export async function annotatedPdf(bytes: Uint8Array, editor: Editor, opts: ExportChoice): Promise<Uint8Array> {
  const [{ PDFDocument, rgb, BlendMode, StandardFonts }, { toPng }] = await Promise.all([import('pdf-lib/dist/pdf-lib.esm.js'), import('html-to-image')]); // the self-contained ES module build
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  let block: PMNode | null = null;
  editor.state.doc.descendants((n) => { if (!block && n.type.name === 'pdfBlock') block = n; return !block; });
  if (!block) return bytes;
  const b = block as PMNode;
  const first = Number(b.attrs.first) || 0;
  const pageAt = (i: number) => pdf.getPage(Math.min(pdf.getPageCount() - 1, first + i));
  const jobs: Promise<void>[] = [];
  b.forEach((child, offset) => {
    const a = child.attrs as Record<string, unknown>;
    const page = pageAt(Number(a.page) || 0);
    const { width: W, height: H } = page.getSize();
    if (child.type.name === 'pdfMark') {
      const [r, g, bl] = markRgb(String(a.color || 'yellow'));
      page.drawRectangle({ x: Number(a.x) * W, y: H - (Number(a.y) + Number(a.h)) * H, width: Number(a.w) * W, height: Number(a.h) * H, color: rgb(r, g, bl), opacity: 0.45, blendMode: BlendMode.Multiply });
    } else if (child.type.name === 'pdfInk') {
      const pts = (a.pts as [number, number][]) ?? [];
      if (pts.length < 2) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * W).toFixed(2)} ${(p[1] * H).toFixed(2)}`).join(' ');
      const [r, g, bl] = hexRgb(inkColor(String(a.color || 'ink')));
      page.drawSvgPath(d, { x: 0, y: H, borderColor: rgb(r, g, bl), borderWidth: Math.max(1.2, W / 420), borderLineCap: 1 as never });
    } else if (child.type.name === 'pdfBox') {
      if (a.key && !opts.answers) return;
      // The box as it shows on the page, without its handle bar or selection.
      const pos = b === block ? findPos(editor, child) : null;
      const el = pos !== null ? (editor.view.nodeDOM(pos) as HTMLElement | null) : null;
      const box = el?.classList.contains('pdf-box') ? el : el?.querySelector<HTMLElement>('.pdf-box') ?? null;
      if (!box) return;
      jobs.push((async () => {
        const rect = box.getBoundingClientRect();
        if (!rect.width) return;
        const png = await toPng(box, { pixelRatio: 3, cacheBust: true, filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('pdf-box-bar') || n.classList.contains('ProseMirror-gapcursor'))), style: { boxShadow: 'none', outline: 'none' } });
        const img = await pdf.embedPng(png);
        const w = Number(a.w) * W;
        const h = w * (rect.height / rect.width);
        page.drawImage(img, { x: Number(a.x) * W, y: H - Number(a.y) * H - h, width: w, height: h });
      })());
    }
    void offset;
  });
  await Promise.all(jobs);
  // Scanned pages: the words OCR found go in as invisible text in their places, so the PDF can be
  // searched and its words copied in any PDF reader.
  if (opts.ocr && Object.keys(opts.ocr).length) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const safe = (t: string) => t.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '');
    for (const [k, p] of Object.entries(opts.ocr)) {
      const n = Number(k);
      if (n < 0 || n >= pdf.getPageCount()) continue;
      const page = pdf.getPage(n);
      const { width: W, height: H } = page.getSize();
      for (const w of p.words) {
        const t = safe(w.t);
        if (!t) continue;
        const size = Math.max(2, w.h * H * 0.9);
        try { page.drawText(t, { x: w.x * W, y: H - (w.y + w.h) * H + w.h * H * 0.18, size, font, opacity: 0 }); } catch { /* a character the font can't show */ }
      }
    }
  }
  return pdf.save();
}

function findPos(editor: Editor, node: PMNode): number | null {
  let at: number | null = null;
  editor.state.doc.descendants((n, pos) => { if (at === null && n === node) at = pos; return at === null; });
  return at;
}

export function savePdf(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = (name || 'PDF').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\.pdf$/i, '') + '.pdf';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function printPdf(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const w = window.open(url, '_blank');
  if (!w) throw new Error('Your browser blocked the print window. Allow pop-ups, or download the PDF and print it.');
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
