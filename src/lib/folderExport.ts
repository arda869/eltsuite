import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import type { JSONContent } from '@tiptap/react';
import { collection, getDocs, orderBy, query, getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import type { SharedDoc } from './sharedDocs';
import type { ClassLesson } from './classFiles';
import type { ExportTask } from './textformat';
import { readState } from '../collab/provider';
import { brandMark, credit, type Brand } from './brand';
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
import { configOf, plainOf, type Card, type FlashConfig } from './flash';
import { piecesText, reference, type CiteStyle } from './cite';
import type { ReadSource } from '../pd/PdReading';
import { theme, type ThemeKey } from './themes';
import { plainColours } from './pdfMake';
import { pageMetrics, LAYOUT_DEFAULT, type Layout } from '../collab/documentLayout';

// Everything in a folder, downloaded in one go: each kind of file in the form people use
// outside the app, with the brand on it.
//   Collab document → Word and PDF · Slides → PowerPoint · Flashcards → Excel
//   PD reading → Word · PDF → the PDF · Lesson → Word worksheet

export type OutFile = { name: string; data: Uint8Array };
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'File';
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

async function yDoc(key: string) {
  const s = await readState(key);
  const d = new Y.Doc();
  if (s) Y.applyUpdate(d, s);
  return d;
}

// A collab document's text, as the editor keeps it.
// A PDF of a document: its text laid out on A4 pages, with the brand at the top.
export async function htmlToPdf(bodyHtml: string, brand: Brand | null, layout?: Layout): Promise<Uint8Array> {
  const [{ jsPDF }, h2c] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const host = document.createElement('div');
  const metrics = layout ? pageMetrics(layout) : null;
  // On the page but clipped away, so the picture of it is not blank and nobody sees it.
  host.style.cssText = 'position:fixed;left:0;top:0;width:595px;background:#fff;color:#111;font:11pt/1.5 Arial,sans-serif;padding:0;z-index:-1;clip-path:inset(0 0 100% 0);pointer-events:none';
  if (metrics) host.style.width = `${metrics.w - 2 * metrics.margin}px`;
  host.innerHTML = `<style>.pdfx h1{font-size:20pt;margin:0 0 18px;text-align:center}.pdfx h2{font-size:15pt;margin:18px 0 6px}.pdfx h3{font-size:13pt;margin:14px 0 6px}.pdfx p{margin:0 0 10px}.pdfx ul,.pdfx ol{margin:0 0 10px;padding-left:28px}.pdfx table{border-collapse:collapse;width:100%;margin:10px 0}.pdfx td,.pdfx th{border:.5pt solid #666;padding:5px 7px;vertical-align:top;text-align:left}.pdfx img{max-width:100%}.pdfx .brand{display:flex;justify-content:flex-end;margin:0 0 18px}.pdfx .brand img{height:30px}.pdfx .foot{margin-top:28px;color:#8a847d;font-size:9pt;text-align:center}</style><div class="pdfx" style="padding:0 4px">${brand ? `<div class="brand"><img src="${brand.dataUrl}" alt=""></div>` : ''}${bodyHtml}<p class="foot">${esc(credit().by)}<br><span style="font-size:8pt">${esc(credit().note)}</span></p></div>`;
  host.dataset.pdfhost = '';
  document.body.append(host);
  try {
    await Promise.all([...host.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r))))));
    // A picture of the text, cut into A4 pages between blocks so no line is split.
    const scale = 2;
    const canvas = await h2c.default(host, { scale, useCORS: true, backgroundColor: '#fff', windowWidth: metrics ? metrics.w : 595, onclone: (d) => (d.querySelectorAll<HTMLElement>('[data-pdfhost]').forEach((x) => (x.style.clipPath = 'none')), plainColours(d)) });
    const pageW = metrics ? metrics.w * .75 : 595.28, pageH = metrics ? metrics.h * .75 : 841.89, m = metrics ? metrics.margin * .75 : 50;
    const k = (pageW - 2 * m) / host.offsetWidth; // pt per CSS pixel
    const room = (pageH - 2 * m) / k; // CSS pixels a page holds
    const top = host.getBoundingClientRect().top;
    const ends = [...host.querySelectorAll('.pdfx > *, .pdfx li, .pdfx tr')].map((e) => e.getBoundingClientRect().bottom - top).sort((a, b) => a - b);
    const forced = [...host.querySelectorAll('[data-doc-page-break], section[data-new-page]')].map((e) => e.getBoundingClientRect().top - top).filter((n) => n > 1).sort((a, b) => a - b);
    const cuts: number[] = [0];
    const total = host.offsetHeight;
    while (total - cuts[cuts.length - 1] > room || forced.some((n) => n > cuts[cuts.length - 1] + 1 && n < total - 1)) {
      const from = cuts[cuts.length - 1];
      const nextForced = forced.find((n) => n > from + 1);
      const fit = ends.filter((e) => e > from + 40 && e <= from + room);
      cuts.push(nextForced && nextForced <= from + room ? nextForced : fit.length ? fit[fit.length - 1] : Math.min(total, from + room));
    }
    cuts.push(total);
    const pdf = new jsPDF({ unit: 'pt', format: metrics ? [pageW, pageH] : 'a4', orientation: layout?.orientation === 'landscape' ? 'landscape' : 'portrait' });
    for (let i = 0; i < cuts.length - 1; i++) {
      const h = cuts[i + 1] - cuts[i];
      if (h < 2) continue;
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = Math.ceil(h * scale);
      const g = part.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, part.width, part.height);
      g.drawImage(canvas, 0, -cuts[i] * scale);
      if (i) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, pageW - 2 * m, h * k);
      if (layout) {
        pdf.setFontSize(9); pdf.setTextColor(80);
        if (layout.header) pdf.text(layout.header, pageW / 2, Math.max(14, m / 2), { align: 'center' });
        const footer = [layout.footer, layout.pageNumbers ? String(i + layout.pageNumberStart) : ''].filter(Boolean).join(' · ');
        if (footer) pdf.text(footer, pageW / 2, pageH - Math.max(14, m / 2), { align: 'center' });
      }
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    host.remove();
  }
}

async function collabDoc(d: SharedDoc, brand: Brand | null): Promise<OutFile[]> {
  const { docxBlob, docBodyHtml, prepareDocumentPrint, EXPORT_DEFAULT } = await import('../collab/export');
  const state = await yDoc(d.docKey);
  const json = yXmlFragmentToProsemirrorJSON(state.getXmlFragment('default')) as JSONContent;
  const layout = { ...LAYOUT_DEFAULT, ...state.getMap('layout').toJSON() } as Layout;
  state.destroy();
  const o = { ...EXPORT_DEFAULT, layout, style: ((d as SharedDoc & { citeStyle?: CiteStyle }).citeStyle) || EXPORT_DEFAULT.style };
  await prepareDocumentPrint(json);
  const [docx, pdf] = await Promise.all([docxBlob(json, d.title, o, brand).then(bytes), htmlToPdf(docBodyHtml(json, d.title, o), brand, layout).catch(() => null)]);
  return [{ name: safe(d.title) + '.docx', data: docx }, ...(pdf ? [{ name: safe(d.title) + '.pdf', data: pdf }] : [])];
}

async function slides(d: SharedDoc): Promise<OutFile[]> {
  const [{ readSlides }, { pptxBlob }] = await Promise.all([import('../collab/slides/model'), import('../collab/slides/exportSlides')]);
  const list = readSlides(await yDoc(d.docKey));
  return [{ name: safe(d.title) + '.pptx', data: await bytes(await pptxBlob(list, d.title, '#d98f63')) }];
}

// Flashcards: one row a card, one column a field, with the brand and the set's name on top.
async function flash(d: SharedDoc, brand: Brand | null): Promise<OutFile[]> {
  const ExcelJS = (await import('exceljs')).default;
  const cfg: FlashConfig = configOf((d as SharedDoc & { flash?: Partial<FlashConfig> }).flash, !(d as SharedDoc & { flash?: unknown }).flash);
  const cards = (await getDocs(query(collection(db, 'sharedDocs', d.id, 'cards'), orderBy('order')))).docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Card, 'id'>) }));
  const wb = new ExcelJS.Workbook();
  wb.creator = brand?.name ?? 'ELT Suite';
  const ws = wb.addWorksheet('Cards', { views: [{ state: 'frozen', ySplit: 4 }] });
  const fields = cfg.fields.filter((f) => f.type !== 'audio');
  const n = Math.max(2, fields.length);
  if (brand) {
    const id = wb.addImage({ base64: brand.dataUrl, extension: 'png' });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: Math.round((brand.w / brand.h) * 32), height: 32 } });
  }
  ws.getRow(1).height = 28;
  ws.getCell(2, 1).value = d.title;
  ws.getCell(2, 1).font = { bold: true, size: 15, name: 'Georgia' };
  ws.getCell(3, 1).value = `${cards.length} cards · front: ${cfg.front.map((k) => cfg.fields.find((f) => f.id === k)?.name).filter(Boolean).join(', ') || '…'}`;
  ws.getCell(3, 1).font = { color: { argb: 'FF8A847D' }, size: 10 };
  const last = 6 + cards.length;
  ws.getCell(last, 1).value = credit().by;
  ws.getCell(last, 1).font = { color: { argb: 'FF8A847D' }, size: 9 };
  ws.getCell(last + 1, 1).value = credit().note;
  ws.getCell(last + 1, 1).font = { color: { argb: 'FF8A847D' }, size: 9, italic: true };
  const head = ws.getRow(4);
  fields.forEach((f, i) => {
    const c = head.getCell(i + 1);
    c.value = f.name + (cfg.front.includes(f.id) ? ' (front)' : cfg.back.includes(f.id) ? ' (back)' : '');
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (brand?.color ?? '#975f40').replace('#', '').slice(0, 6).toUpperCase() } };
  });
  cards.forEach((card, r) => {
    const row = ws.getRow(5 + r);
    fields.forEach((f, i) => (row.getCell(i + 1).value = f.type === 'image' ? (card.f[f.id] ? '[picture]' : '') : plainOf(card.f[f.id] ?? null)));
  });
  for (let i = 1; i <= n; i++) ws.getColumn(i).width = 28;
  return [{ name: safe(d.title) + '.xlsx', data: new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer) }];
}

// PD reading: the reference list in the file's style, and the notes under each source.
async function pd(d: SharedDoc, brand: Brand | null): Promise<OutFile[]> {
  const { docxBlob, EXPORT_DEFAULT } = await import('../collab/export');
  const style = (((d as SharedDoc & { pd?: { style?: CiteStyle } }).pd)?.style ?? (d as SharedDoc & { citeStyle?: CiteStyle }).citeStyle ?? 'apa') as CiteStyle;
  const srcs = (await getDocs(collection(db, 'sharedDocs', d.id, 'sources'))).docs.map((x) => ({ ...(x.data() as ReadSource), id: x.id })).sort((a, b) => a.order - b.order);
  const content: JSONContent[] = [];
  for (const s of srcs) {
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: s.title || 'Source' }] });
    const ref = piecesText(reference(s, style));
    if (ref) content.push({ type: 'paragraph', content: [{ type: 'text', text: ref }] });
    if (s.notes?.content) content.push(...s.notes.content);
    for (const sec of s.sections ?? []) {
      if (sec.page) content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: `Page ${sec.page}` }] });
      if (sec.content?.content) content.push(...sec.content.content);
    }
  }
  if (!content.length) content.push({ type: 'paragraph', content: [{ type: 'text', text: 'No sources yet.' }] });
  const blob = await docxBlob({ type: 'doc', content }, d.title, EXPORT_DEFAULT, brand);
  return [{ name: safe(d.title) + '.docx', data: await bytes(blob) }];
}

async function pdfFile(d: SharedDoc): Promise<OutFile[]> {
  const { loadPdf } = await import('../pdf/pdfData');
  return [{ name: safe(d.title).replace(/\.pdf$/i, '') + '.pdf', data: await loadPdf('file:' + d.id) }];
}

// A lesson, as the Word worksheet teachers download from it.
async function worksheet(title: string, tasks: ExportTask[], accent: string): Promise<OutFile[]> {
  const { flattenWithSections, lessonDocx } = await import('./worksheet');
  const items = flattenWithSections(tasks.filter((t) => !t.hidden));
  const blob = await lessonDocx(title, items, { header: true, key: true, accent });
  return [{ name: safe(title) + '.docx', data: await bytes(blob) }];
}
async function lessonFile(d: SharedDoc): Promise<OutFile[]> {
  const rows = (await getDocs(query(collection(db, 'sharedDocs', d.id, 'tasks'), orderBy('order')))).docs.map((x) => x.data() as ExportTask & { kind: string });
  return worksheet(d.title, rows, '#d98f63');
}
export async function classLessonFiles(c: ClassLesson): Promise<OutFile[]> {
  const { gatherLesson } = await import('./transfer');
  const [l, cls] = await Promise.all([gatherLesson(c.classId, c.itemId), getDoc(doc(db, 'classes', c.classId)).catch(() => null)]);
  return worksheet(l.title || c.title, l.tasks, theme(cls?.data()?.themeColor as ThemeKey).accent);
}

export async function sharedDocFiles(d: SharedDoc): Promise<OutFile[]> {
  const brand = await brandMark().catch(() => null);
  switch (d.kind) {
    case 'doc':
      return collabDoc(d, brand);
    case 'slides':
      return slides(d);
    case 'flash':
      return flash(d, brand);
    case 'pd':
      return pd(d, brand);
    case 'pdf':
      return pdfFile(d);
    case 'lesson':
      return lessonFile(d);
    case 'design': {
      const { designPdfBytes } = await import('../design/tools');
      const bytes = await designPdfBytes(d.id, d.title);
      return bytes ? [{ name: safe(d.title) + '.pdf', data: bytes }] : [];
    }
    case 'file': {
      const { loadAnyFile, extOf } = await import('./fileStore');
      const x = extOf(d.file?.name ?? '');
      const name = !x || d.title.toLowerCase().endsWith('.' + x) ? d.title : `${d.title}.${x}`;
      return [{ name: name.replace(/[\\/:*?"<>|]/g, '-'), data: new Uint8Array(await (await loadAnyFile(d.id, d.file)).arrayBuffer()) }];
    }
    default:
      return [];
  }
}
