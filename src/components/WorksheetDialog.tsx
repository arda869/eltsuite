import { useEffect, useState } from 'react';
import { gatherLesson } from '../lib/transfer';
import type { ExportTask } from '../lib/textformat';
import { flattenLesson, lessonDocx, saveBlob, type Block, type Run, type WsTask } from '../lib/worksheet';

// Print a lesson as a worksheet (PDF through the browser's print dialog) or download it as a Word file.
export function WorksheetDialog({ classId, itemId, onClose }: { classId: string; itemId: string; onClose: () => void }) {
  const [lesson, setLesson] = useState<{ title: string; tasks: ExportTask[] } | null>(null);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [header, setHeader] = useState(true);
  const [key, setKey] = useState(true);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    gatherLesson(classId, itemId).then(setLesson).catch(() => setLesson({ title: 'Lesson', tasks: [] }));
  }, [classId, itemId]);
  const visible = (lesson?.tasks ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== 'section' && !t.hidden);
  const ids = picked ?? new Set(visible.map((x) => x.i));
  const chosen = () => flattenLesson(lesson!.tasks, ids);

  const print = () => {
    const tasks = chosen();
    const w = window.open('', '_blank');
    if (!w) return setBusy('Your browser blocked the print window. Allow pop-ups for this site.');
    w.document.write(printHtml(lesson!.title, tasks, { header, key }));
    w.document.close();
    w.focus();
    window.setTimeout(() => w.print(), 400);
  };
  const docx = async () => {
    setBusy('Making the Word file…');
    try {
      saveBlob(`${lesson!.title.replace(/[^\w\- ]+/g, '').trim() || 'Worksheet'}.docx`, await lessonDocx(lesson!.title, chosen(), { header, key }));
      setBusy('');
    } catch (e) {
      setBusy('The file could not be made: ' + (e as Error).message);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Worksheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Worksheet</h2>
        {!lesson ? (
          <span className="hint">Loading…</span>
        ) : (
          <>
            <span className="hint">Gaps become lines, choices become (a / b / c), drag and drop becomes a word box, matching becomes two columns, long answers become ruled lines. Hidden tasks are left out.</span>
            <div className="field" style={{ gap: 6 }}>
              <span>Tasks</span>
              <div className="aud-pick ws-tasks">
                {visible.map(({ t, i }) => (
                  <label key={i} className="pop-check">
                    <input type="checkbox" checked={ids.has(i)} onChange={() => setPicked((p) => { const n = new Set(p ?? ids); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                    {t.title}
                  </label>
                ))}
              </div>
            </div>
            <label className="pop-check">
              <input type="checkbox" checked={header} onChange={() => setHeader((v) => !v)} />
              Name and date line at the top
            </label>
            <label className="pop-check">
              <input type="checkbox" checked={key} onChange={() => setKey((v) => !v)} />
              Answer key on a separate page
            </label>
            {busy && <span className="hint">{busy}</span>}
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn" disabled={!ids.size} onClick={docx}>
                Word file (.docx)
              </button>
              <button type="button" className="btn primary" disabled={!ids.size} onClick={print}>
                Print or save as PDF
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const LET = 'abcdefghijklmnop';
function runHtml(r: Run) {
  if (r.blank) return `<span class="blank" style="width:${r.blank * 0.5}em"></span>`;
  if (r.options) return ` <span class="opts">(${r.options.map(esc).join(' / ')})</span> `;
  let t = esc(r.t ?? '').replace(/\n/g, '<br>');
  if (r.bold) t = `<b>${t}</b>`;
  if (r.italic) t = `<i>${t}</i>`;
  return t;
}
function blockHtml(b: Block) {
  switch (b.kind) {
    case 'p':
      return b.heading ? `<h3>${b.runs.map(runHtml).join('')}</h3>` : `<p class="${b.list ?? ''}">${b.list ? (b.list === 'bullet' ? '• ' : '') : ''}${b.runs.map(runHtml).join('')}</p>`;
    case 'note':
      return `<p class="note">${esc(b.text)}</p>`;
    case 'box':
      return `<div class="box"><b>${esc(b.label)}:</b> ${b.words.map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>`;
    case 'lines':
      return (b.prompt ? `<p class="hint">(${b.n}) ${esc(b.prompt)}</p>` : '') + `<div class="lines">${'<div class="line"></div>'.repeat(b.count)}</div>`;
    case 'match':
      return `<table class="match"><tbody>${Array.from({ length: Math.max(b.left.length, b.right.length) }, (_, i) => `<tr><td>${b.left[i] ? `${i + 1}. ${esc(b.left[i])} <span class="blank" style="width:2em"></span>` : ''}</td><td>${b.right[i] ? `${LET[i]}) ${esc(b.right[i])}` : ''}</td></tr>`).join('')}</tbody></table>`;
    case 'table':
      return `<table class="grid"><tbody>${b.rows.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}&nbsp;</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  }
}
export function printHtml(title: string, tasks: WsTask[], opts: { header: boolean; key: boolean }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5pt; line-height: 1.6; color: #111; max-width: 180mm; margin: 18mm auto; padding: 0 10mm; }
  h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 14pt; margin: 18pt 0 4pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; } h3 { font-size: 12.5pt; margin: 10pt 0 2pt; }
  .header { margin: 0 0 14pt; font-family: Arial, sans-serif; font-size: 11pt; } .instr { font-weight: bold; margin: 0 0 6pt; }
  p { margin: 4pt 0; } .blank { display: inline-block; border-bottom: 1px solid #111; height: 1em; vertical-align: baseline; margin: 0 2px; }
  .opts { white-space: nowrap; } .box { border: 1px solid #111; border-radius: 4px; padding: 6pt 10pt; margin: 6pt 0; }
  .lines { margin: 4pt 0 10pt; } .line { border-bottom: 1px solid #999; height: 20pt; }
  table.match { width: 100%; border-collapse: collapse; margin: 6pt 0; } table.match td { width: 50%; padding: 3pt 6pt; vertical-align: top; }
  table.grid { border-collapse: collapse; margin: 6pt 0; width: 100%; } table.grid th, table.grid td { border: 1px solid #111; padding: 4pt 8pt; text-align: left; height: 22pt; }
  .note, .hint { color: #777; font-style: italic; font-size: 10.5pt; }
  .key { page-break-before: always; } .key p { margin: 2pt 0; }
  @media print { body { margin: 0; max-width: none; } }
  </style></head><body>
  <h1>${esc(title)}</h1>
  ${opts.header ? '<p class="header">Name: ______________________________ &nbsp;&nbsp;&nbsp; Date: ______________</p>' : ''}
  ${tasks.map((t, i) => `<h2>${i + 1}. ${esc(t.title)}</h2>${t.instructions ? `<p class="instr">${esc(t.instructions)}</p>` : ''}${t.blocks.map(blockHtml).join('')}`).join('')}
  ${opts.key ? `<div class="key"><h1>Answer key</h1>${tasks.map((t, i) => (t.answers.length ? `<h3>${i + 1}. ${esc(t.title)}</h3>${t.answers.map((a) => `<p><b>(${a.n})</b> ${esc(a.text)}</p>`).join('')}` : '')).join('')}</div>` : ''}
  </body></html>`;
}
