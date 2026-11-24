import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { forgetPdf, loadPdf, openPdf, pageSizes, saveFilePdf, type PageSize } from './pdfData';
import { newSharedDoc } from '../lib/sharedDocs';

// Changing a PDF's pages: turn, move, add a blank page, delete; and save some pages as a new PDF.
// The file itself changes, and every note on the pages (boxes, highlights, drawings, shapes) moves
// with its page, or goes with a deleted page. OCR words move too. Everyone editing gets the new
// pages, because the PDF's `rev` goes up.

export type PageOp = { kind: 'rotate'; page: number; dir: 1 | -1 } | { kind: 'move'; page: number; to: number } | { kind: 'delete'; page: number } | { kind: 'blank'; after: number };

const lib = () => import('pdf-lib/dist/pdf-lib.esm.js');

function blockOf(editor: Editor): { node: PMNode; pos: number } | null {
  let out: { node: PMNode; pos: number } | null = null;
  editor.state.doc.descendants((n, pos) => { if (!out && n.type.name === 'pdfBlock') out = { node: n, pos }; return !out; });
  return out;
}

// Where each old page goes: its new index, or null when it is deleted.
function pageMap(count: number, op: PageOp): (number | null)[] {
  const order = Array.from({ length: count }, (_, i) => i as number | 'new');
  if (op.kind === 'delete') order.splice(op.page, 1);
  if (op.kind === 'move') { const [p] = order.splice(op.page, 1); order.splice(op.to, 0, p); }
  if (op.kind === 'blank') order.splice(op.after + 1, 0, 'new');
  const map: (number | null)[] = Array(count).fill(null);
  order.forEach((o, i) => { if (o !== 'new') map[o] = i; });
  return map;
}

// A point on a page turned a quarter: clockwise (x, y) → (1 − y, x); the other way (y, 1 − x).
const turn = (dir: 1 | -1) => (x: number, y: number): [number, number] => (dir === 1 ? [1 - y, x] : [y, 1 - x]);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function moved(n: PMNode, map: (number | null)[], op: PageOp, oldSize: PageSize | undefined): Record<string, unknown> | null {
  const a = { ...n.attrs } as Record<string, unknown>;
  const page = Number(a.page) || 0;
  const to = map[page];
  if (to === null || to === undefined) return null;
  a.page = to;
  if (op.kind !== 'rotate' || op.page !== page) return a;
  const t = turn(op.dir);
  const box = (x: number, y: number, w: number, h: number) => {
    const ps = [t(x, y), t(x + w, y), t(x, y + h), t(x + w, y + h)];
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    return { x: clamp(Math.min(...xs)), y: clamp(Math.min(...ys)), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const ratio = oldSize ? oldSize.h / oldSize.w : 1.414;
  if (n.type.name === 'pdfMark') Object.assign(a, box(Number(a.x), Number(a.y), Number(a.w), Number(a.h)));
  if (n.type.name === 'pdfInk') a.pts = ((a.pts as [number, number][]) ?? []).map(([x, y]) => t(x, y).map((v) => +v.toFixed(4)));
  if (n.type.name === 'pdfShape') { const p1 = t(Number(a.x1), Number(a.y1)), p2 = t(Number(a.x2), Number(a.y2)); Object.assign(a, { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }); }
  if (n.type.name === 'pdfBox') {
    // A text box keeps its corner and reads the right way up; its width follows the new page width.
    const w = Number(a.w), [x, y] = t(Number(a.x), Number(a.y));
    const nw = Math.min(0.9, w * ratio);
    Object.assign(a, { x: clamp(op.dir === 1 ? x - nw : x), y: clamp(y), w: nw });
  }
  return a;
}

export async function changePages(editor: Editor, fileId: string, op: PageOp) {
  const found = blockOf(editor);
  if (!found) throw new Error('No PDF here.');
  const { node, pos } = found;
  const src = String(node.attrs.src);
  const rev = Number(node.attrs.rev) || 0;
  const { PDFDocument, degrees } = await lib();
  const pdf = await PDFDocument.load(await loadPdf(src, '', rev), { ignoreEncryption: true });
  const count = pdf.getPageCount();
  if (op.kind === 'delete' && count < 2) throw new Error('A PDF needs at least one page.');
  if (op.kind === 'rotate') { const p = pdf.getPage(op.page); p.setRotation(degrees((p.getRotation().angle + 90 * op.dir + 360) % 360)); }
  if (op.kind === 'delete') pdf.removePage(op.page);
  if (op.kind === 'move') { const [copy] = await pdf.copyPages(pdf, [op.page]); pdf.removePage(op.page); pdf.insertPage(op.to, copy); }
  if (op.kind === 'blank') { const near = pdf.getPage(op.after); const { width, height } = near.getSize(); pdf.insertPage(op.after + 1, [width, height]); }
  const bytes = await pdf.save();
  const pages = await pageSizes(await openPdf(bytes));
  await saveFilePdf(fileId, bytes, pages);
  forgetPdf(src);
  // The notes, moved with their pages.
  const map = pageMap(count, op);
  const oldPages = (node.attrs.pages as PageSize[]) ?? [];
  const { schema } = editor.state;
  const kids: PMNode[] = [];
  node.forEach((c) => {
    const a = moved(c, map, op, oldPages[Number(c.attrs.page) || 0]);
    if (a) kids.push(schema.nodes[c.type.name].create(a, c.content, c.marks));
  });
  const units = ((node.attrs.units as { name: string; from: number; to: number }[]) ?? []).map((u) => {
    const ins = Array.from({ length: u.to - u.from + 1 }, (_, k) => map[u.from - 1 + k]).filter((v): v is number => v !== null && v !== undefined);
    return ins.length ? { ...u, from: Math.min(...ins) + 1, to: Math.max(...ins) + 1 } : null;
  }).filter(Boolean);
  const next = node.type.create({ ...node.attrs, pages, units, rev: rev + 1 }, kids);
  editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, next));
  // OCR words move with their pages; a turned page is read again later.
  const col = collection(db, 'sharedDocs', fileId, 'ocr');
  const all = await getDocs(col).catch(() => null);
  if (all) {
    const keep = all.docs.map((d) => ({ n: Number(d.id.slice(1)), data: d.data() }));
    await Promise.all(all.docs.map((d) => deleteDoc(d.ref)));
    await Promise.all(keep.map(({ n, data }) => {
      const to = map[n];
      if (to === null || to === undefined || (op.kind === 'rotate' && op.page === n)) return null;
      return setDoc(doc(col, 'p' + to), data);
    }));
  }
}

// "1-3, 5" → [0, 1, 2, 4], within the PDF.
export function parsePages(text: string, count: number): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= count) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

// Some pages as a new PDF file in Files (the pages only, without the notes).
export async function pagesToNewFile(src: string, rev: number, owner: { uid: string; name: string }, title: string, pick: number[]): Promise<string> {
  const { PDFDocument } = await lib();
  const from = await PDFDocument.load(await loadPdf(src, '', rev), { ignoreEncryption: true });
  const out = await PDFDocument.create();
  (await out.copyPages(from, pick)).forEach((p) => out.addPage(p));
  const bytes = await out.save();
  const id = await newSharedDoc(owner, 'pdf', title);
  await saveFilePdf(id, bytes, await pageSizes(await openPdf(bytes)));
  return id;
}
