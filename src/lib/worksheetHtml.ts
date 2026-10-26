import type { Block, Options, Run, WsTask } from './worksheet';

// The print / PDF version of a worksheet, in the app's own look: Fraunces and Karla, the class
// colour for numbers and accents, tinted boxes like the ones in the task, running header and
// page numbers, and an answer key on its own page.

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LET = 'abcdefghijklmnop';
const TONES: Record<string, [string, string]> = {
  sand: ['#fbf4ea', '#e9d6b9'],
  sky: ['#eef4f8', '#c9dbe8'],
  sage: ['#eef4ef', '#c9dccd'],
  rose: ['#faeeec', '#e8cdc7'],
  grey: ['#f4f3f1', '#dedbd6'],
  accent: ['var(--tint)', 'var(--tint-line)'],
};
const FLAME = 'M17 2 C25 14 30 22 30 30 C30 39 24 46 17 46 C10 46 4 39 4 30 C4 22 9 14 17 2 Z';
const logo = (cls = 'logo') => `<span class="${cls}" aria-label="Lesson Lit">Lesson L<span class="li-i">ı<svg viewBox="0 0 34 48"><path d="${FLAME}" fill="#d98f63"/></svg></span>t</span>`;
const PAPER: Record<string, string> = { A4: 'A4', Letter: 'letter', A5: 'A5' };

function runs(rs: Run[]) {
  return rs
    .map((r) => {
      if (r.blank) return `<span class="blank" style="min-width:${Math.min(16, r.blank * 0.42).toFixed(1)}em"></span>`;
      if (r.options) return `<span class="opts">${r.options.map((o) => `<span class="opt">${esc(o)}</span>`).join('<span class="slash">/</span>')}</span>`;
      let t = esc(r.t ?? '').replace(/\n/g, '<br>');
      // question numbers "(3)" become small class-colour badges
      t = t.replace(/^\s*\((\d+)\)\s*$/, '<span class="qn">$1</span>');
      if (r.bold && !/class="qn"/.test(t)) t = `<b>${t}</b>`;
      if (r.italic) t = `<i>${t}</i>`;
      return t;
    })
    .join('');
}

function block(b: Block): string {
  switch (b.kind) {
    case 'p':
      if (b.heading) return `<h4>${runs(b.runs)}</h4>`;
      if (b.list) return `<p class="li ${b.list}"><span class="mk">${b.list === 'bullet' ? '•' : ''}</span><span>${runs(b.runs)}</span></p>`;
      return `<p>${runs(b.runs)}</p>`;
    case 'note':
      return `<p class="note">${esc(b.text)}</p>`;
    case 'box':
      return `<div class="wordbox"><span class="wb-label">${esc(b.label)}</span><span class="wb-words">${b.words.map((w) => `<span>${esc(w)}</span>`).join('')}</span></div>`;
    case 'lines':
      return `<div class="lines">${b.prompt ? `<span class="lines-hint">${esc(b.prompt)}</span>` : ''}${'<span class="line"></span>'.repeat(b.count)}</div>`;
    case 'match': {
      const n = Math.max(b.left.length, b.right.length);
      return `<div class="match">${Array.from({ length: n }, (_, i) => `<div class="m-row"><span class="m-l">${b.left[i] ? `<span class="m-n">${i + 1}</span>${esc(b.left[i])}<span class="m-ans"></span>` : ''}</span><span class="m-r">${b.right[i] ? `<span class="m-k">${LET[i]}</span>${esc(b.right[i])}` : ''}</span></div>`).join('')}</div>`;
    }
    case 'table': {
      const crossword = b.rows.slice(1).every((r) => r.every((c) => c.length <= 2));
      return `<table class="${crossword ? 'grid-puzzle' : 'grid'}"><tbody>${b.rows
        .map((r, ri) => (ri === 0 && crossword ? '' : `<tr>${r.map((c) => (ri === 0 ? `<th>${esc(c)}</th>` : c === '■' ? '<td class="blk"></td>' : `<td>${/^\d+$/.test(c) && crossword ? `<i>${esc(c)}</i>` : esc(c)}</td>`)).join('')}</tr>`))
        .join('')}</tbody></table>`;
    }
    case 'callout': {
      const [bg, line] = TONES[b.tone] ?? TONES.grey;
      const plain = b.style === 'paper' || b.style === 'box';
      return `<div class="callout${plain && !b.label ? ' plain' : ''}" style="--cb:${bg};--cl:${line}">${b.label ? `<div class="c-label">${b.symbol ? `<span class="c-sym">${esc(b.symbol)}</span>` : ''}${esc(b.label)}</div>` : ''}${b.blocks.map(block).join('')}</div>`;
    }
  }
}

export function worksheetHtml(title: string, tasks: WsTask[], opts: Options) {
  const accent = opts.accent || '#d98f63';
  const paper = PAPER[opts.paper ?? 'A4'] ?? 'A4';
  const small = opts.paper === 'A5';
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const running = [opts.className, title].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root { --accent: ${accent}; --ink: #2f2c29; --muted: #6f6a64; --hair: #dcd8d2; --tint: color-mix(in srgb, var(--accent) 9%, white); --tint-line: color-mix(in srgb, var(--accent) 30%, white); --accent-ink: color-mix(in srgb, var(--accent) 70%, black); }
@page { size: ${paper}; margin: ${small ? '14mm 12mm 16mm' : '18mm 17mm 20mm'};
  @top-left { content: "${esc(running).replace(/"/g, '\\"')}"; font: 500 8pt Karla, sans-serif; color: #8a847d; letter-spacing: .04em; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 600 8pt Karla, sans-serif; color: #8a847d; }
  @bottom-left { content: "Lesson Lit"; font: 500 8pt Fraunces, serif; color: #b3ada6; } }
@page :first { @bottom-left { content: none; } }
@page :first { @top-left { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); font: ${small ? '10pt' : '11pt'}/1.6 Fraunces, Georgia, serif; font-optical-sizing: auto; }
.sheet { max-width: 186mm; margin: 0 auto; }
@media screen { body { background: #ebe9e5; padding: 24px 0; } .sheet { background: #fff; padding: 18mm 17mm; box-shadow: 0 10px 30px rgba(0,0,0,.12); } .toolbar { max-width: 186mm; margin: 0 auto 14px; display: flex; justify-content: flex-end; gap: 8px; font: 13px Karla, sans-serif; } .toolbar button { font: 600 13px Karla, sans-serif; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; } }
@media print { .toolbar { display: none; } }

/* Brand */
.logo { font: 500 13pt Fraunces, serif; letter-spacing: -.01em; color: var(--ink); white-space: nowrap; }
.li-i { position: relative; display: inline-block; } .li-i svg { position: absolute; left: 50%; top: .08em; transform: translateX(-50%); width: .32em; height: auto; }
.brandbar { display: flex; align-items: center; justify-content: space-between; margin: -2mm 0 5mm; padding: 2.4mm 4mm; border-radius: 3mm; background: #f2f0ec; }
.brandbar .tag { font: 600 7pt Karla, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #8a847d; }
.brandbar .stripe { display: flex; gap: 1.2mm; } .brandbar .stripe i { width: 7mm; height: 1.6mm; border-radius: 1mm; background: var(--accent); } .brandbar .stripe i:nth-child(2) { background: var(--tint-line); } .brandbar .stripe i:nth-child(3) { background: #d6d2cb; }
.sheet-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10mm; padding-top: 3mm; border-top: .8pt solid var(--hair); font: 500 7.5pt Karla, sans-serif; color: #8a847d; }
.sheet-foot .logo { font-size: 10pt; color: #8a847d; }
.field { background: #f6f5f2; border-color: #e4e0da; }
.task-head { padding: 2mm 3mm; margin-left: -3mm; border-radius: 3mm; background: linear-gradient(90deg, #f2f0ec, rgba(242,240,236,0)); }

/* Title block */
.masthead { display: grid; grid-template-columns: 1fr auto; gap: 6mm; align-items: end; padding-bottom: 5mm; border-bottom: 2.5pt solid var(--accent); margin-bottom: 6mm; }
.kicker { font: 700 8pt Karla, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-ink); }
h1 { font: 600 ${small ? '20pt' : '26pt'}/1.1 Fraunces, serif; margin: 2mm 0 0; letter-spacing: -.01em; }
.meta { font: 500 8.5pt Karla, sans-serif; color: var(--muted); text-align: right; line-height: 1.5; }
.fields { display: grid; grid-template-columns: 2.2fr 1fr 1fr; gap: 4mm; margin: 0 0 8mm; }
.field { border: 1pt solid var(--hair); border-radius: 3mm; padding: 1.8mm 3mm 5mm; font: 600 7pt Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }

/* Tasks */
.task { margin: 0 0 9mm; }
.task-head { display: flex; align-items: center; gap: 3mm; margin-bottom: 1.5mm; break-after: avoid; }
.tnum { flex: none; display: inline-grid; place-items: center; width: 8mm; height: 8mm; border-radius: 50%; background: var(--accent); color: #fff; font: 700 10.5pt Karla, sans-serif; }
h2 { font: 600 ${small ? '13pt' : '15pt'}/1.2 Fraunces, serif; margin: 0; }
.instr { font: 700 ${small ? '9.5pt' : '10.5pt'}/1.4 Karla, sans-serif; color: var(--accent-ink); margin: 0 0 3.5mm 11mm; break-after: avoid; }
.body { margin-left: 11mm; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
h4 { font: 600 11.5pt Fraunces, serif; margin: 4mm 0 1.5mm; }
.li { display: flex; gap: 2.5mm; margin-bottom: 1.6mm; } .li .mk { color: var(--accent); width: 3mm; flex: none; }
.li.number { counter-increment: li; } .li.number .mk::before { content: counter(li) "."; font: 600 9pt Karla, sans-serif; }
.body { counter-reset: li; }
.qn { display: inline-grid; place-items: center; min-width: 4.6mm; height: 4.6mm; padding: 0 1mm; margin: 0 1.2mm 0 .4mm; border-radius: 2.3mm; background: var(--tint); color: var(--accent-ink); font: 700 7pt Karla, sans-serif; vertical-align: .35em; }
.blank { display: inline-block; height: 1em; border-bottom: .9pt solid var(--ink); margin: 0 1mm; vertical-align: -0.15em; }
.opts { display: inline-flex; align-items: baseline; gap: 1.2mm; margin: 0 1mm; } .opt { padding: 0 2mm; border: .8pt solid var(--hair); border-radius: 3mm; font-size: .94em; } .slash { color: #b3ada6; }
.note { font: italic 9pt Karla, sans-serif; color: var(--muted); }
.wordbox { display: flex; gap: 3mm; align-items: baseline; margin: 2mm 0 4mm; padding: 2.6mm 4mm; border: 1pt dashed var(--tint-line); border-radius: 3mm; background: var(--tint); break-inside: avoid; }
.wb-label { flex: none; font: 700 7.5pt Karla, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--accent-ink); }
.wb-words { display: flex; flex-wrap: wrap; gap: 1.5mm 5mm; }
.lines { margin: 1mm 0 4mm; break-inside: avoid; } .line { display: block; height: 8.5mm; border-bottom: .6pt solid #c9c4bd; }
.lines-hint { font: 600 7.5pt Karla, sans-serif; color: var(--muted); letter-spacing: .04em; }
.match { display: flex; flex-direction: column; gap: 2mm; margin: 2mm 0 4mm; break-inside: avoid; }
.m-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
.m-l, .m-r { display: flex; align-items: baseline; gap: 2.5mm; }
.m-n, .m-k { flex: none; display: inline-grid; place-items: center; width: 5mm; height: 5mm; border-radius: 50%; font: 700 7.5pt Karla, sans-serif; }
.m-n { background: var(--tint); color: var(--accent-ink); } .m-k { border: .8pt solid var(--hair); color: var(--muted); }
.m-ans { margin-left: auto; width: 9mm; border-bottom: .9pt solid var(--ink); }
.callout { margin: 2mm 0 4.5mm; padding: 3.5mm 4.5mm 1.5mm; border-radius: 3.5mm; background: var(--cb); border: .8pt solid var(--cl); break-inside: avoid; }
.callout.plain { background: #fff; }
.c-label { display: flex; align-items: center; gap: 2mm; margin-bottom: 2mm; font: 700 7.5pt Karla, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.c-sym { display: inline-grid; place-items: center; width: 5mm; height: 5mm; border-radius: 50%; border: .8pt solid currentColor; font-size: 7pt; letter-spacing: 0; }
table.grid { border-collapse: separate; border-spacing: 0; width: 100%; margin: 2mm 0 4mm; border: .8pt solid var(--hair); border-radius: 3mm; overflow: hidden; break-inside: avoid; font-size: .95em; }
table.grid th { background: var(--tint); color: var(--accent-ink); font: 700 8pt Karla, sans-serif; letter-spacing: .06em; text-align: left; padding: 2mm 3mm; }
table.grid td { padding: 2.2mm 3mm; border-top: .6pt solid var(--hair); height: 8mm; }
table.grid-puzzle { border-collapse: collapse; margin: 3mm 0 4mm; break-inside: avoid; }
table.grid-puzzle td { width: 7mm; height: 7mm; border: .8pt solid #9d978f; text-align: center; font: 600 9pt Karla, sans-serif; position: relative; padding: 0; }
table.grid-puzzle td.blk { background: #e6e3de; border-color: #e6e3de; }
table.grid-puzzle td i { position: absolute; top: .3mm; left: .6mm; font: 700 5.5pt Karla, sans-serif; font-style: normal; color: var(--accent-ink); }

/* Answer key */
.key { break-before: page; }
.key .masthead { margin-bottom: 5mm; }
.key-grid { columns: 2; column-gap: 9mm; }
.key-task { break-inside: avoid; margin: 0 0 5mm; }
.key-task h3 { display: flex; align-items: center; gap: 2mm; font: 600 11pt Fraunces, serif; margin: 0 0 1.5mm; }
.key-task h3 .tnum { width: 5.5mm; height: 5.5mm; font-size: 8pt; }
.key-task p { display: flex; gap: 2mm; margin: 0 0 1mm; font-size: 9.5pt; }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Print or save as PDF</button></div>
<div class="sheet">
  <div class="brandbar">${logo()}<span class="tag">Worksheet</span><span class="stripe"><i></i><i></i><i></i></span></div>
  <header class="masthead">
    <div><div class="kicker">${esc([opts.className, opts.level].filter(Boolean).join(' · ') || 'Worksheet')}</div><h1>${esc(title)}</h1></div>
    <div class="meta">${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}<br>${esc(today)}</div>
  </header>
  ${opts.header ? '<div class="fields"><div class="field">Name</div><div class="field">Class</div><div class="field">Date</div></div>' : ''}
  ${tasks
    .map(
      (t, i) => `<section class="task"><div class="task-head"><span class="tnum">${i + 1}</span><h2>${esc(t.title)}</h2></div>${t.instructions ? `<p class="instr">${esc(t.instructions)}</p>` : ''}<div class="body">${t.blocks.map(block).join('')}</div></section>`,
    )
    .join('')}
  ${
    opts.key
      ? `<section class="key"><header class="masthead"><div><div class="kicker">For the teacher</div><h1>Answer key</h1></div><div class="meta">${esc(title)}</div></header><div class="key-grid">${tasks
          .map((t, i) => (t.answers.length ? `<div class="key-task"><h3><span class="tnum">${i + 1}</span>${esc(t.title)}</h3>${t.answers.map((a) => `<p><span class="qn">${a.n}</span><span>${esc(a.text)}</span></p>`).join('')}</div>` : ''))
          .join('')}</div></section>`
      : ''
  }
  <footer class="sheet-foot">${logo()}<span>${esc([opts.className, title].filter(Boolean).join(' · '))}</span></footer>
</div>
<script>document.fonts && document.fonts.ready.then(function(){ if (location.hash === '#print') setTimeout(function(){ window.print(); }, 200); });</script>
</body></html>`;
}
