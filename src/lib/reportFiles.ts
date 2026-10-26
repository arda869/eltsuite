// Reports as files: an Excel workbook, a well-set PDF (print or save), a Word document, or CSV.
// Every report is a title, a few headline figures and a table.

export type Cell = string | number;
export type Report = {
  title: string; // e.g. "Class report"
  context: string; // e.g. the class name
  summary?: [string, string][]; // headline figures
  columns: string[];
  rows: Cell[][];
  note?: string;
  sheets?: Report[]; // more tables in the same file (Excel: more sheets)
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fileName = (r: Report, ext: string) => `${`${r.context} ${r.title}`.replace(/[^\w\- ]+/g, '').trim() || 'Report'}.${ext}`;
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const all = (r: Report) => [r, ...(r.sheets ?? [])];
const isNum = (v: Cell) => typeof v === 'number' || /^-?\d+(\.\d+)?%?$/.test(String(v).trim());
const pctOf = (v: Cell) => {
  const m = String(v).match(/^(\d+(?:\.\d+)?)%/);
  return m ? Number(m[1]) : null;
};

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function saveCsv(r: Report) {
  const cell = (v: Cell) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  save(new Blob(['﻿' + [r.columns, ...r.rows].map((x) => x.map(cell).join(',')).join('\n')], { type: 'text/csv' }), fileName(r, 'csv'));
}

export async function saveXlsx(r: Report, accent: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lesson Lit';
  const argb = 'FF' + accent.replace('#', '').toUpperCase();
  const tint = 'FF' + mix(accent, 0.12).replace('#', '').toUpperCase();
  for (const t of all(r)) {
    const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[*?:\\/[\]]/g, ' '), { views: [{ state: 'frozen', ySplit: 4 + (t.summary?.length ? 1 : 0), xSplit: 1 }] });
    ws.addRow([t.title]).font = { name: 'Georgia', size: 16, bold: true };
    ws.addRow([`${t.context} · ${today()}`]).font = { name: 'Calibri', size: 10, color: { argb: 'FF8A847D' } };
    if (t.summary?.length) ws.addRow([t.summary.map(([k, v]) => `${k}: ${v}`).join('    ')]).font = { size: 10, color: { argb: 'FF3D3A36' } };
    ws.addRow([]);
    const head = ws.addRow(t.columns);
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    head.height = 30;
    t.rows.forEach((row, i) => {
      const x = ws.addRow(row.map((v) => (typeof v === 'number' ? v : pctOf(v) !== null && String(v).trim().match(/^\d+(\.\d+)?%$/) ? (pctOf(v) as number) / 100 : v)));
      x.eachCell((c, col) => {
        if (typeof row[col - 1] === 'string' && /^\d+(\.\d+)?%$/.test(String(row[col - 1]).trim())) c.numFmt = '0%';
        if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
        c.border = { bottom: { style: 'hair', color: { argb: 'FFE0DCD6' } } };
      });
    });
    ws.columns.forEach((col, i) => {
      const longest = Math.max(t.columns[i]?.length ?? 8, ...t.rows.map((row) => String(row[i] ?? '').length));
      col.width = Math.min(i === 0 ? 34 : 28, Math.max(i === 0 ? 18 : 10, longest + 2));
    });
    if (t.note) ws.addRow([]), (ws.addRow([t.note]).font = { italic: true, size: 9, color: { argb: 'FF8A847D' } });
  }
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(r, 'xlsx'));
}

function mix(hex: string, pct: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * pct + 255 * (1 - pct));
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

// Percentages get a quiet bar, so the page reads at a glance.
function cellHtml(v: Cell, accent: string) {
  const p = pctOf(v);
  if (p !== null) return `<span class="pc"><i style="width:${Math.min(100, p)}%;background:${accent}"></i></span>${esc(String(v))}`;
  return esc(String(v ?? ''));
}

export function savePdf(r: Report, accent: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const wide = Math.max(...all(r).map((t) => t.columns.length)) > 6;
  const section = (t: Report, first: boolean) => `
<section${first ? '' : ' class="next"'}>
  <header><div class="eyebrow">${esc(t.context)}</div><h1>${esc(t.title)}</h1><div class="date">${today()}</div></header>
  ${t.summary?.length ? `<div class="sum">${t.summary.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : ''}
  <table><thead><tr>${t.columns.map((c, i) => `<th${i && t.rows.every((row) => isNum(row[i]) || row[i] === '') ? ' class="n"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${t.rows.map((row) => `<tr>${row.map((v, i) => `<td${i && isNum(v) ? ' class="n"' : ''}>${cellHtml(v, accent)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
</section>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(`${r.context} ${r.title}`)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Karla:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 16mm 14mm; }
* { box-sizing: border-box; } body { margin: 0; font: 9.5pt/1.45 Karla, sans-serif; color: #2b2a28; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
header { border-bottom: 1.4pt solid ${accent}; padding-bottom: 4mm; margin-bottom: 5mm; position: relative; }
.eyebrow { font: 700 8pt Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: ${accent}; }
h1 { font: 600 21pt/1.15 Fraunces, Georgia, serif; margin: 1.5mm 0 0; }
.date { position: absolute; right: 0; bottom: 4mm; color: #8a847d; font-size: 8.5pt; }
.sum { display: flex; gap: 4mm; margin: 0 0 6mm; }
.sum div { flex: 1; padding: 3mm 4mm; border-radius: 2.5mm; background: ${mix(accent, 0.1)}; }
.sum b { display: block; font: 600 15pt Fraunces, Georgia, serif; } .sum span { font-size: 8pt; color: #6b655e; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; } tr { break-inside: avoid; }
th { text-align: left; font: 700 8pt Karla, sans-serif; color: #fff; background: ${accent}; padding: 2.2mm 2.5mm; vertical-align: bottom; }
th:first-child { border-radius: 1.5mm 0 0 0; } th:last-child { border-radius: 0 1.5mm 0 0; }
td { padding: 2mm 2.5mm; border-bottom: .4pt solid #e6e2dc; vertical-align: top; }
tbody tr:nth-child(even) td { background: #faf8f5; }
td:first-child { font-weight: 600; } .n { text-align: right; white-space: nowrap; }
.pc { display: inline-block; width: 12mm; height: 1.6mm; margin-right: 2mm; border-radius: 1mm; background: #ece8e2; vertical-align: middle; overflow: hidden; }
.pc i { display: block; height: 100%; }
.note { margin-top: 4mm; font-size: 8pt; color: #8a847d; }
.next { break-before: page; }
footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #b0aaa2; }
</style></head><body>${all(r).map((t, i) => section(t, i === 0)).join('')}<footer>Lesson Lit</footer>
<script>document.fonts.ready.then(() => setTimeout(() => print(), 250));</script></body></html>`);
  w.document.close();
}

export async function saveDocx(r: Report, accent: string) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, PageOrientation, HeadingLevel } = d;
  const hex = accent.replace('#', '').toUpperCase();
  const tint = mix(accent, 0.08).replace('#', '').toUpperCase();
  const wide = Math.max(...all(r).map((t) => t.columns.length)) > 6;
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  all(r).forEach((t, k) => {
    children.push(
      new Paragraph({ pageBreakBefore: k > 0, children: [new TextRun({ text: t.context.toUpperCase(), bold: true, size: 16, color: hex, font: 'Calibri' })] }),
      new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 60 }, children: [new TextRun({ text: t.title, bold: true, size: 40, font: 'Georgia', color: '2B2A28' })] }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: hex, space: 6 } }, spacing: { after: 200 }, children: [new TextRun({ text: today(), size: 17, color: '8A847D', font: 'Calibri' })] }),
    );
    if (t.summary?.length) children.push(new Paragraph({ spacing: { after: 200 }, children: t.summary.flatMap(([k2, v], i) => [new TextRun({ text: (i ? '      ' : '') + v, bold: true, size: 26, font: 'Georgia' }), new TextRun({ text: '  ' + k2, size: 17, color: '6B655E', font: 'Calibri' })]) }));
    const cell = (v: Cell, head: boolean, i: number, odd: boolean) =>
      new TableCell({
        shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: hex } : odd ? { type: ShadingType.CLEAR, color: 'auto', fill: tint } : undefined,
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        borders: { top: none, left: none, right: none, bottom: head ? none : { style: BorderStyle.SINGLE, size: 2, color: 'E6E2DC' } },
        children: [new Paragraph({ alignment: i && !head && isNum(v) ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: String(v ?? ''), bold: head || i === 0, color: head ? 'FFFFFF' : '2B2A28', size: head ? 17 : 18, font: 'Calibri' })] })],
      });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ tableHeader: true, children: t.columns.map((c, i) => cell(c, true, i, false)) }), ...t.rows.map((row, ri) => new TableRow({ cantSplit: true, children: t.columns.map((_, i) => cell(row[i] ?? '', false, i, ri % 2 === 1)) }))],
      }),
    );
    if (t.note) children.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: t.note, italics: true, size: 16, color: '8A847D', font: 'Calibri' })] }));
  });
  const doc = new Document({ sections: [{ properties: { page: { size: { orientation: wide ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }] });
  save(await Packer.toBlob(doc), fileName(r, 'docx'));
}
