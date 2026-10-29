import type { DPage, El } from './model';
import { artKey, pageCanvas, type Env } from './render';
import { credit } from '../lib/brand';

// ------------------------------------------------------------------ removing a background

// Like a magic eraser: the colour where you click, and every colour like it joined to it, becomes
// see-through. Works best on pictures with a plain background (clip art, photos on white).
export function eraseFrom(im: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }, px: number, py: number, tolerance = 32, everywhere = false): HTMLCanvasElement {
  const w = (im.naturalWidth || im.width) as number;
  const h = (im.naturalHeight || im.height) as number;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const d = data.data;
  const sx = Math.max(0, Math.min(w - 1, Math.round(px)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(py)));
  const i0 = (sy * w + sx) * 4;
  const [r0, g0, b0] = [d[i0], d[i0 + 1], d[i0 + 2]];
  const t2 = tolerance * tolerance * 3;
  const near = (i: number) => d[i + 3] > 0 && (d[i] - r0) ** 2 + (d[i + 1] - g0) ** 2 + (d[i + 2] - b0) ** 2 <= t2;
  const done = new Uint8Array(w * h);
  if (everywhere) {
    for (let k = 0; k < w * h; k++) if (near(k * 4)) done[k] = 1;
  } else {
    const stack = [sy * w + sx];
    while (stack.length) {
      const k = stack.pop()!;
      if (done[k] || !near(k * 4)) continue;
      done[k] = 1;
      const x = k % w;
      if (x > 0) stack.push(k - 1);
      if (x < w - 1) stack.push(k + 1);
      if (k >= w) stack.push(k - w);
      if (k < w * (h - 1)) stack.push(k + w);
    }
  }
  // Soften the edge: pixels next to the cleared area become half see-through.
  for (let k = 0; k < w * h; k++) {
    if (done[k]) d[k * 4 + 3] = 0;
    else if (d[k * 4 + 3] && ((k % w > 0 && done[k - 1]) || (k % w < w - 1 && done[k + 1]) || (k >= w && done[k - w]) || (k < w * (h - 1) && done[k + w]))) d[k * 4 + 3] = Math.round(d[k * 4 + 3] * 0.5);
  }
  g.putImageData(data, 0, 0);
  return c;
}

// Where a point on the page falls in a picture's own pixels, allowing for turning, flipping and cropping.
export function pagePointToImage(e: El, x: number, y: number, iw: number, ih: number) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const a = (-(e.rot ?? 0) * Math.PI) / 180;
  let lx = (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a);
  let ly = (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
  if (e.flipX) lx = -lx;
  if (e.flipY) ly = -ly;
  const u = (lx + e.w / 2) / e.w;
  const v = (ly + e.h / 2) / e.h;
  const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return { x: (c.x + u * c.w) * iw, y: (c.y + v * c.h) * ih, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

// ------------------------------------------------------------------ downloads

export type Copy = { view: Env['view']; learner: boolean; label: string };

const saveBlob = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
};
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Design';

export async function downloadImage(page: DPage, els: El[], env: Env, name: string, type: 'png' | 'jpg', scale = 2) {
  const c = pageCanvas(page, els, env, scale);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type === 'png' ? 'image/png' : 'image/jpeg', 0.92));
  saveBlob(blob, `${safeName(name)}.${type}`);
}

export async function pageBlob(page: DPage, els: El[], env: Env, scale = 2) {
  const c = pageCanvas(page, els, env, scale);
  return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
}

const PT = 0.75; // points per page pixel (96 to the inch)

async function buildPdf(pages: DPage[], els: El[], env: Env, name: string, copies: Copy[]) {
  const { jsPDF } = await import('jspdf');
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const cp of copies)
    for (const p of pages) {
      const w = p.w * PT;
      const h = p.h * PT;
      const o = w > h ? 'l' : 'p';
      if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: o, compress: true });
      else pdf.addPage([w, h], o);
      const c = pageCanvas(p, els, { ...env, view: cp.view, learner: cp.learner }, 2.5);
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, undefined, 'FAST');
    }
  pdf?.setProperties({ title: name, author: credit().by, creator: 'ELT Suite' });
  return pdf;
}
export async function downloadPdf(pages: DPage[], els: El[], env: Env, name: string, copies: Copy[]) {
  const pdf = await buildPdf(pages, els, env, name, copies);
  if (pdf) saveBlob(pdf.output('blob'), `${safeName(name)}.pdf`);
}

// A design as a PDF, for downloading a whole folder: everything loaded first.
export async function designPdfBytes(id: string, title: string): Promise<Uint8Array | null> {
  const [{ getDocs, getDoc }, m, a] = await Promise.all([import('firebase/firestore'), import('./model'), import('./assets')]);
  const pages = (await getDocs(m.pagesCol(id))).docs.map((x) => ({ id: x.id, ...(x.data() as Omit<DPage, 'id'>) })).sort((x, y) => x.order - y.order);
  if (!pages.length) return null;
  const els = (await getDocs(m.elsCol(id))).docs.map((x) => ({ id: x.id, ...(x.data() as Omit<El, 'id'>) }));
  const accent = ((await getDoc(m.metaRef(id))).data()?.accent as string | undefined) ?? '#c8764a';
  const imgs = new Map<string, CanvasImageSource>();
  await Promise.all(
    els.map(async (e) => {
      try {
        if (e.t === 'image' && e.img) imgs.set(e.img, await m.loadPicture(id, e.img));
        if (e.t === 'art') imgs.set(artKey(e, accent), await a.artImage(e, accent));
        if (e.t === 'qr' && e.url) imgs.set('qr:' + e.url, await a.qrImage(e.url));
        if (e.font) await m.ensureFont(e.font);
      } catch {
        /* drawn without it */
      }
    }),
  );
  const pdf = await buildPdf(pages, els, { imgs, view: 'all', accent }, title, [{ view: 'all', learner: false, label: '' }]);
  return pdf ? new Uint8Array(pdf.output('arraybuffer')) : null;
}

// Cut-out cards: each page cut into equal pieces, laid out on A4 with dashed lines to cut along,
// and scissors in the accent. Shuffled for a jigsaw.
export async function downloadCards(pages: DPage[], els: El[], env: Env, name: string, rows: number, cols: number, shuffle: boolean) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p', compress: true });
  const m = 12;
  const gap = 6;
  let first = true;
  for (const p of pages) {
    const c = pageCanvas(p, els, env, 2.5);
    const pw = c.width / cols;
    const ph = c.height / rows;
    const pieces: HTMLCanvasElement[] = [];
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const pc = document.createElement('canvas');
        pc.width = Math.round(pw);
        pc.height = Math.round(ph);
        pc.getContext('2d')!.drawImage(c, k * pw, r * ph, pw, ph, 0, 0, pc.width, pc.height);
        pieces.push(pc);
      }
    if (shuffle) pieces.sort(() => Math.random() - 0.5);
    // As many as fit on a page, the same size each, keeping the shape of the pieces.
    const ratio = ph / pw;
    let per = Math.max(1, Math.min(cols, 3));
    let cw = (210 - 2 * m - gap * (per - 1)) / per;
    while (cw * ratio > 297 - 2 * m && per < 6) per++, (cw = (210 - 2 * m - gap * (per - 1)) / per);
    const ch = cw * ratio;
    const down = Math.max(1, Math.floor((297 - 2 * m + gap) / (ch + gap)));
    pieces.forEach((pc, i) => {
      const at = i % (per * down);
      if (at === 0) {
        if (!first) pdf.addPage('a4', 'p');
        first = false;
      }
      const x = m + (at % per) * (cw + gap);
      const y = m + Math.floor(at / per) * (ch + gap);
      pdf.addImage(pc.toDataURL('image/jpeg', 0.9), 'JPEG', x, y, cw, ch, undefined, 'FAST');
      pdf.setLineDashPattern([2, 1.5], 0);
      pdf.setDrawColor(150, 145, 138);
      pdf.setLineWidth(0.3);
      pdf.rect(x, y, cw, ch);
      if (at === 0) {
        pdf.setLineDashPattern([], 0);
        // Scissors, drawn: two loops and two blades.
        pdf.setDrawColor(env.accent);
        pdf.setLineWidth(0.35);
        const sx = x + 2;
        const sy = y - 3.2;
        pdf.circle(sx, sy - 1, 0.8);
        pdf.circle(sx, sy + 1, 0.8);
        pdf.line(sx + 0.7, sy - 0.6, sx + 4, sy + 0.8);
        pdf.line(sx + 0.7, sy + 0.6, sx + 4, sy - 0.8);
      }
    });
  }
  pdf.setProperties({ title: name + ' – cards', author: credit().by, creator: 'ELT Suite' });
  saveBlob(pdf.output('blob'), `${safeName(name)} – cards.pdf`);
}
