import type { Block, Options, Run, WsItem, WsTask } from './worksheet';

// The printed worksheet or test, laid out like a coursebook photocopiable: a grey header band
// with a Name box, the Lesson Lit logo and a class-colour graphic; section headings;
// numbered exercises in normal text size; mark boxes for exams. Pages are laid out in the
// browser before printing, so an exercise is never split between two columns or two pages
// (unless it is longer than a whole column).

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LET = 'abcdefghijklmnop';
const FLAME = 'M17 2 C25 14 30 22 30 30 C30 39 24 46 17 46 C10 46 4 39 4 30 C4 22 9 14 17 2 Z';
const SIZES: Record<string, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210] };

const logo = () => `<span class="logo">Lesson L<span class="li-i">ı<svg viewBox="0 0 34 48"><path d="${FLAME}" fill="var(--accent)"/></svg></span>t</span>`;

function runs(rs: Run[]) {
  let stack = '';
  const inline = rs
    .map((r) => {
      if (r.num !== undefined) return `<b class="qn">${r.num}</b>`;
      if (r.blank) return `<span class="blank" style="width:${Math.min(8, Math.max(2.6, r.blank * 0.2)).toFixed(1)}em"></span>`;
      if (r.options) return `<span class="opts">${r.options.map(esc).join(' / ')}</span>`;
      if (r.stack) {
        stack = `<span class="stack">${r.stack.map((o) => `<span>${esc(o).replace(/^(\w)\s+/, '<b class="ml">$1</b>')}</span>`).join('')}</span>`;
        return '';
      }
      let t = esc(r.t ?? '').replace(/\n/g, '<br>');
      if (r.bold) t = `<b>${t}</b>`;
      if (r.italic) t = `<i>${t}</i>`;
      return t;
    })
    .join('');
  return inline + stack;
}

function block(b: Block): string {
  switch (b.kind) {
    case 'p':
      if (b.heading) return `<p class="sub">${runs(b.runs)}</p>`;
      if (b.list === 'number' && b.mark !== undefined) return `<p class="li label"><span class="mk">${esc(b.mark)}</span><span>${runs(b.runs)}</span></p>`;
      if (b.list === 'bullet' && b.mark === '') return `<p class="li"><span class="mk"></span><span>${runs(b.runs)}</span></p>`;
      if (b.list) return `<p class="li ${b.list}"><span class="mk"></span><span>${runs(b.runs)}</span></p>`;
      return `<p>${runs(b.runs)}</p>`;
    case 'note':
      return `<p class="note">${esc(b.text.replace(/^\[|\]$/g, ''))}</p>`;
    case 'box':
      return `<div class="wordbox">${b.words.map((w) => `<span>${esc(w)}</span>`).join('')}</div>`;
    case 'lines':
      return `<div class="lines">${b.prompt ? `<span class="lines-hint">${esc(b.prompt)}</span>` : ''}${'<span class="line"></span>'.repeat(b.count)}</div>`;
    case 'match': {
      const n = Math.max(b.left.length, b.right.length);
      return `<div class="match">${Array.from({ length: n }, (_, i) => `<span class="m-l">${b.left[i] ? `<b class="qn">${i + 1}</b>${esc(b.left[i])}<span class="m-ans"></span>` : ''}</span><span class="m-r">${b.right[i] ? `<b class="ml">${LET[i]}</b>${esc(b.right[i])}` : ''}</span>`).join('')}</div>`;
    }
    case 'table': {
      const puzzle = b.rows.slice(1).every((r) => r.every((c) => c.length <= 2));
      return `<table class="${puzzle ? 'puzzle' : 'grid'}"><tbody>${b.rows
        .map((r, ri) => (ri === 0 && puzzle ? '' : `<tr>${r.map((c) => (ri === 0 ? `<th>${esc(c)}</th>` : c === '■' ? '<td class="blk"></td>' : `<td>${/^\d+$/.test(c) && puzzle ? `<i>${esc(c)}</i>` : esc(c)}</td>`)).join('')}</tr>`))
        .join('')}</tbody></table>`;
    }
    case 'callout': {
      // emails, web pages and notes become a framed text in a sans font, like a coursebook "realia" box;
      // rule and tip boxes get a light grey tint with their label
      const realia = ['paper', 'email', 'web', 'letter', 'message', 'note', 'sticky', 'box'].includes(b.style) && !b.label;
      return `<div class="callout${realia ? ' realia' : ''}">${b.label ? `<div class="c-label">${esc(b.label)}</div>` : ''}${b.blocks.map(block).join('')}</div>`;
    }
  }
}

const markBox = (n: number) => `<span class="markbox"><span class="mb-blank"></span><span class="mb-max">${n}</span></span>`;

function taskUnit(t: WsTask, num: number, marks: boolean) {
  const head = t.instructions?.trim() || t.title;
  return `<div class="unit task"><div class="ex-head"><b class="ex-n">${num}</b><span class="ex-text">${esc(head)}</span></div><div class="ex-body">${t.blocks.map(block).join('')}</div>${marks && t.marks ? `<div class="ex-mark">${markBox(t.marks)}</div>` : ''}</div>`;
}

export function worksheetHtml(title: string, items: WsItem[], opts: Options) {
  const accent = opts.accent || '#d98f63';
  const [pw, ph] = SIZES[opts.paper ?? 'A4'] ?? SIZES.A4;
  const small = opts.paper === 'A5';
  const cols = opts.columns ?? 2;
  const marks = !!opts.marks;
  const tasks = items.filter((i): i is { kind: 'task'; task: WsTask } => i.kind === 'task').map((i) => i.task);

  // Units in reading order. Section totals (exams) follow the last task of each section.
  const units: string[] = [];
  let num = 0;
  let secTitle = '';
  let secMarks = 0;
  const closeSection = () => {
    if (marks && secTitle && secMarks) units.push(`<div class="unit total"><span>${esc(secTitle)} total</span>${markBox(secMarks)}</div>`);
    secMarks = 0;
  };
  for (const it of items) {
    if (it.kind === 'section') {
      closeSection();
      secTitle = it.title;
      units.push(`<div class="unit section" data-keep="1"><h2>${esc(it.title)}</h2></div>`);
    } else {
      num++;
      secMarks += it.task.marks;
      units.push(taskUnit(it.task, num, marks));
    }
  }
  closeSection();
  const grand = tasks.reduce((s, t) => s + t.marks, 0);
  if (marks && grand) units.push(`<div class="unit total grand"><span>Total</span>${markBox(grand)}</div>`);

  const keyUnits = opts.key
    ? tasks
        .map((t, i) => (t.answers.length ? `<div class="unit key"><div class="ex-head"><b class="ex-n">${i + 1}</b><span class="ex-text">${esc(t.instructions?.trim() || t.title)}</span></div><div class="ex-body">${t.answers.map((a) => `<p><b class="qn">${a.n}</b>${esc(a.text)}</p>`).join('')}</div></div>` : ''))
        .filter(Boolean)
    : [];

  // Cut-out cards (draw a card, spin the wheel, open a box): one set per exercise, laid out by the
  // script so that every card on the sheet is the same size.
  const cardSets: string[] = [];
  {
    let k = 0;
    for (const it of items) {
      if (it.kind !== 'task') continue;
      k++;
      for (const set of it.task.cutouts ?? [])
        if (set.cards.length)
          cardSets.push(
            `<div class="cut-set" data-head="${esc(`${k}  ${it.task.instructions?.trim() || it.task.title}`)}">${set.cards
              .map((c) => `<div class="cut-card"><span class="cut-title">${esc(c.title)}</span><div class="cut-body">${c.blocks.map(block).join('')}</div>${set.symbol ? `<span class="cut-sym">${esc(set.symbol)}</span>` : ''}</div>`)
              .join('')}</div>`,
          );
    }
  }

  const kicker = [opts.className, opts.level].filter(Boolean).join(' · ');
  const band = (heading: string) => `
    <header class="band">
      <div class="band-left">
        ${opts.header ? `<div class="namebox"><span>Name</span></div>` : '<div class="namebox empty"></div>'}
        <h1>${esc(heading)}</h1>
      </div>
      <div class="band-right">
        <div class="band-cover">${opts.cover ?? ''}</div>
        <div class="brand">${logo()}<span class="kicker">${esc(kicker || 'Worksheet')}</span></div>
      </div>
    </header>`;
  const foot = `<footer class="foot"><span>${esc([opts.className, title].filter(Boolean).join(' · '))} · Lesson Lit · photocopiable for this class</span><span class="pn"></span></footer>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@font-face { font-family: Fraunces; src: url('${opts.origin ?? ''}/fonts/Fraunces.ttf') format('truetype'); font-weight: 100 900; font-display: block; }
@font-face { font-family: Karla; src: url('${opts.origin ?? ''}/fonts/Karla.ttf') format('truetype'); font-weight: 200 800; font-display: block; }
:root { --accent: ${accent}; --accent-ink: color-mix(in srgb, var(--accent) 72%, black); --tint: color-mix(in srgb, var(--accent) 10%, white); --ink: #262420; --muted: #66615b; --band: #dad8d4; --tint-line: color-mix(in srgb, var(--accent) 35%, white); --pw: ${pw}mm; --ph: ${ph}mm; --side: ${small ? 10 : 13}mm; }
@page { size: ${opts.paper === 'Letter' ? 'letter' : opts.paper ?? 'A4'}; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); font: ${small ? '9pt' : '10.2pt'}/1.5 Fraunces, Georgia, serif; }
.page { width: var(--pw); height: var(--ph); overflow: hidden; display: flex; flex-direction: column; background: #fff; position: relative; break-after: page; }
.page:last-child { break-after: auto; }
@media screen { body { background: #e6e4e0; padding: 20px 0 40px; } .page { margin: 0 auto 18px; box-shadow: 0 8px 26px rgba(0,0,0,.14); } .toolbar { width: var(--pw); margin: 0 auto 14px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; font: 13px Karla, sans-serif; color: #66615b; } .toolbar button { font: 700 13px Karla, sans-serif; padding: 9px 16px; border-radius: 10px; border: 0; background: var(--accent); color: #fff; cursor: pointer; } }
@media print { .toolbar { display: none; } body { background: #fff; } }

/* Header band */
.band { flex: none; display: grid; grid-template-columns: 1fr 34%; height: ${small ? 24 : 30}mm; margin-top: ${small ? 7 : 10}mm; background: var(--band); }
.band-left { padding: 0 0 0 var(--side); display: flex; flex-direction: column; justify-content: space-between; }
.namebox { display: block; width: 78%; height: ${small ? 8 : 10}mm; background: #fff; padding: 1.2mm 3mm 0; font: 600 7pt Karla, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #3d3a36; }
.namebox.empty { background: transparent; }
h1 { margin: 0 0 ${small ? 2.5 : 3.2}mm; font: 800 ${small ? 12.5 : 15.5}pt/1.12 Karla, sans-serif; color: #4b4843; letter-spacing: -.005em; }
.band-right { position: relative; overflow: hidden; }
.band-cover { position: absolute; inset: 0; } .band-cover svg, .band-cover img { width: 100%; height: 100%; display: block; }
.band-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--band) 0%, rgba(218,216,212,0) 28%); }
.brand { background: rgba(255,255,255,.88); padding: 1.6mm 2.6mm 1.4mm; border-radius: 1.6mm; }
.brand { position: absolute; right: var(--side); bottom: ${small ? 2.5 : 3.2}mm; display: flex; flex-direction: column; align-items: flex-end; gap: .6mm; }
.logo { font: 600 ${small ? 14 : 18}pt/1 Fraunces, serif; letter-spacing: -.015em; color: var(--ink); white-space: nowrap; }
.li-i { position: relative; display: inline-block; } .li-i svg { position: absolute; left: 50%; top: .08em; transform: translateX(-50%); width: .32em; height: auto; }
.kicker { font: 700 7.5pt Karla, sans-serif; letter-spacing: .04em; color: #3d3a36; }

/* Body: one or two columns of fixed height, filled by the layout script */
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(${cols}, 1fr); column-gap: ${cols === 2 ? (small ? 6 : 9) : 0}mm; padding: ${small ? 5 : 7}mm var(--side) 0; }
.col { height: 100%; overflow: hidden; }
.foot { flex: none; display: flex; justify-content: space-between; align-items: center; height: ${small ? 11 : 14}mm; padding-left: var(--side); font: 500 6.8pt Karla, sans-serif; color: #4b4843; }
.pn { align-self: center; min-width: 17mm; height: 5mm; display: grid; place-items: center; background: #8d8983; color: #fff; font: 700 8pt Karla, sans-serif; }

/* Sections and exercises */
.unit { padding-bottom: ${small ? 3.5 : 5}mm; }
.section h2 { margin: 0; padding-top: 1mm; font: 800 ${small ? 9.5 : 10.5}pt Karla, sans-serif; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); display: flex; align-items: center; gap: 2.5mm; }
.section h2::after { content: ''; flex: 1; height: .9pt; background: linear-gradient(90deg, var(--accent), rgba(0,0,0,0)); opacity: .55; }
.section { padding-bottom: ${small ? 2 : 3}mm; }
.ex-head { display: flex; gap: 2.4mm; margin-bottom: 1.6mm; font-size: 1.08em; line-height: 1.35; }
.ex-n { flex: none; min-width: 3.4mm; font: 700 1em Fraunces, serif; color: var(--ink); }
.ex-body { padding-left: 5.8mm; }
p { margin: 0 0 1.4mm; }
.sub { font-weight: 600; margin-top: 2mm; }
.qn { display: inline-block; min-width: 3.2mm; margin-right: 1.2mm; font: 600 .96em Fraunces, serif; }
.blank { display: inline-block; height: 1em; border-bottom: .7pt solid var(--ink); margin: 0 .8mm; vertical-align: -.18em; }
.opts { font-style: italic; }
.stack { display: block; margin: .6mm 0 0 4.4mm; } .stack span { display: block; }
.li { display: flex; gap: 2mm; } .li .mk { flex: none; width: 3mm; } .li.bullet .mk::before { content: '•'; color: var(--accent); }
.ex-body { counter-reset: li; } .li.number { counter-increment: li; } .li.number .mk::before { content: counter(li); font-weight: 600; }
.note { font: italic .88em Karla, sans-serif; color: var(--muted); }
.wordbox { display: flex; flex-wrap: wrap; gap: 1mm 4.5mm; margin: .8mm 0 2.6mm; padding: 1.5mm 0 1.6mm; border-top: .7pt solid #8d8983; border-bottom: .7pt solid #8d8983; }
.lines { margin: .5mm 0 2mm; } .line { display: block; height: 7.4mm; border-bottom: .55pt solid #a9a49d; }
.lines-hint { font: 600 7pt Karla, sans-serif; color: var(--muted); }
.match { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 5mm; margin: .5mm 0 2mm; }
.m-l, .m-r { display: flex; align-items: baseline; gap: 1mm; } .m-ans { flex: 1; max-width: 9mm; margin-left: auto; border-bottom: .7pt solid var(--ink); }
.ml { min-width: 3.2mm; margin-right: 1.2mm; font-weight: 600; }
.callout { margin: 1mm 0 2.6mm; padding: 2.4mm 3.2mm 1mm; background: #efeeeb; border-left: 1.6pt solid var(--accent); }
.callout.realia { background: #fff; border: .7pt solid #3d3a36; font: ${small ? '8.2pt' : '9.2pt'}/1.5 Karla, sans-serif; padding: 2.6mm 3.4mm 1.4mm; }
.c-label { font: 800 7pt Karla, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #4b4843; margin-bottom: 1mm; }
table.grid { border-collapse: collapse; width: 100%; margin: 1mm 0 2.6mm; font-size: .95em; }
table.grid th { text-align: left; font: 700 7.5pt Karla, sans-serif; letter-spacing: .04em; padding: 1.4mm 2mm; border-bottom: .9pt solid var(--ink); }
table.grid td { padding: 1.4mm 2mm; border-bottom: .5pt solid #bdb8b1; height: 7mm; }
table.puzzle { border-collapse: collapse; margin: 1mm 0 2.6mm; }
table.puzzle td { width: 6mm; height: 6mm; border: .7pt solid #57534d; text-align: center; font: 600 8.5pt Karla, sans-serif; position: relative; padding: 0; }
table.puzzle td.blk { background: #dad8d4; border-color: #dad8d4; }
table.puzzle td i { position: absolute; top: .2mm; left: .5mm; font: 700 5pt Karla, sans-serif; font-style: normal; }

/* Marks (exams) */
.markbox { display: inline-flex; border: .7pt solid #57534d; height: 5.2mm; }
.mb-blank { width: 7mm; background: #fff; }
.mb-max { min-width: 6mm; display: grid; place-items: center; background: #8d8983; color: #fff; font: 700 7.5pt Karla, sans-serif; }
.ex-mark { display: flex; justify-content: flex-end; margin-top: 1mm; }
.total { display: flex; justify-content: flex-end; align-items: center; gap: 0; }
.total > span:first-child { height: 5.2mm; display: grid; place-items: center; padding: 0 2.4mm; border: .7pt solid #57534d; border-right: 0; font: 700 7pt Karla, sans-serif; }
.total .mb-max { background: #262420; }
.total.grand > span:first-child { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; }

/* Cut-out cards */
.cut-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: ${small ? 4 : 6}mm var(--side) 0; }
.cut-head { flex: none; display: flex; align-items: center; gap: 2.5mm; margin-bottom: 2.5mm; font-size: 1.08em; }
.cut-ex { font: 400 1em Fraunces, serif; white-space: pre; }
.scissors { font-size: 12pt; color: #57534d; line-height: 1; }
.cut-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; align-content: start; padding: .5pt 0 0 .5pt; }
.cut-card { position: relative; overflow: hidden; margin: -.5pt 0 0 -.5pt; border: .9pt dashed #6f6a64; padding: 3.6mm 4.4mm 3mm; display: flex; flex-direction: column; gap: 1.4mm; font: ${small ? '8.6pt' : '9.6pt'}/1.4 Karla, sans-serif; }
.cut-title { font: 700 ${small ? '10.5pt' : '12pt'}/1.25 Karla, sans-serif; color: var(--ink); padding-left: 2.4mm; border-left: 1.6pt solid var(--accent); }
.cut-body p { margin: 0 0 .8mm; }
.cut-body .li { gap: 1.4mm; }
.cut-sym { position: absolute; right: 3mm; bottom: 2.2mm; font-size: 10pt; color: var(--tint-line); }

/* Class colour, more prominent */
h1 { color: var(--ink); }
.section h2 { color: var(--accent-ink); }
.section h2::after { height: 1.4pt; opacity: 1; background: var(--accent); }
.ex-n { color: var(--accent-ink); }
.qn, .ml { color: var(--accent-ink); }
.wordbox { border-color: var(--accent); }
.callout { background: var(--tint); border-left-width: 2.4pt; }
.c-label { color: var(--accent-ink); }
.pn { background: var(--accent); }
.mb-max { background: var(--accent); }
.total .mb-max { background: var(--accent-ink); }
.markbox, .total > span:first-child { border-color: var(--accent-ink); }
.cut-title { border-left: 0; padding: 1.2mm 2.6mm; background: var(--accent); color: #fff; border-radius: 1.2mm; align-self: flex-start; }
.scissors { color: var(--accent-ink); }
.li.bullet .mk::before { color: var(--accent); }
.li.label .mk { width: auto; min-width: 4mm; font-weight: 600; color: var(--accent-ink); font-family: Karla, sans-serif; }

/* Answer key */
.key .ex-body p { margin-bottom: .6mm; }
</style></head><body>
<div class="toolbar"><span id="status">Laying out the pages…</span><button onclick="window.print()">Print or save as PDF</button></div>
<div id="pages"></div>
<template id="u-main">${units.join('')}</template>
<template id="cards">${cardSets.join('')}</template>
<template id="band-cards">${band(title + ' · Cards to cut out')}</template>
<template id="u-key">${keyUnits.join('')}</template>
<template id="band-main">${band(title)}</template>
<template id="band-key">${band(title + ' · Answer key')}</template>
<template id="foot">${foot}</template>
<script>
(function () {
  var COLS = ${cols};
  var pagesEl = document.getElementById('pages');
  function newPage(bandId) {
    var page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = document.getElementById(bandId).innerHTML + '<div class="cols"></div>' + document.getElementById('foot').innerHTML;
    var wrap = page.querySelector('.cols');
    var cols = [];
    for (var i = 0; i < COLS; i++) { var c = document.createElement('div'); c.className = 'col'; wrap.appendChild(c); cols.push(c); }
    pagesEl.appendChild(page);
    return cols;
  }
  var over = function (col) { return col.scrollHeight > col.clientHeight + 1; };
  function flow(templateId, bandId) {
    var units = Array.prototype.slice.call(document.getElementById(templateId).content.children).map(function (n) { return n.cloneNode(true); });
    if (!units.length) return;
    var cols = newPage(bandId), ci = 0;
    function nextCol() { ci++; if (ci >= cols.length) { cols = newPage(bandId); ci = 0; } }
    function hasOther(col, u) { for (var k = 0; k < col.children.length; k++) { var c = col.children[k]; if (c !== u && !c.classList.contains('section')) return true; } return false; }
    for (var i = 0; i < units.length; i++) {
      var u = units[i], col = cols[ci];
      if (u.classList.contains('section') && units[i + 1]) {
        // a section heading always stays with the exercise after it
        col.appendChild(u); col.appendChild(units[i + 1]);
        if (!over(col)) { i++; continue; }
        col.removeChild(units[i + 1]);
        if (hasOther(col, u)) { col.removeChild(u); nextCol(); i--; continue; }
        continue; // empty column: the next exercise is split under the heading
      }
      col.appendChild(u);
      if (!over(col)) continue;
      if (hasOther(col, u)) { col.removeChild(u); nextCol(); i--; continue; }
      // taller than a whole column: split it between its blocks
      var body = u.querySelector('.ex-body');
      if (!body || body.children.length < 2) { nextCol(); continue; }
      var rest = u.cloneNode(true), restBody = rest.querySelector('.ex-body');
      restBody.innerHTML = '';
      var mark = u.querySelector('.ex-mark');
      if (mark) u.removeChild(mark);
      while (over(col) && body.children.length > 1) restBody.insertBefore(body.lastElementChild, restBody.firstChild);
      var n = rest.querySelector('.ex-n'); if (n) n.textContent = n.textContent.replace(/ ?\\(cont\\.\\)$/, '') + ' (cont.)';
      units.splice(i + 1, 0, rest);
      nextCol();
    }
  }
  // Cards: measure the tallest card at the column width, then give every card that height and
  // fit as many rows as the page takes. Each exercise's cards start on a new sheet.
  function cardPage(head) {
    var page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = document.getElementById('band-cards').innerHTML + '<div class="cut-wrap"><div class="cut-head"><span class="scissors">✂</span><span class="cut-ex"></span></div><div class="cut-grid"></div></div>' + document.getElementById('foot').innerHTML;
    page.querySelector('.cut-ex').textContent = head;
    pagesEl.appendChild(page);
    return page.querySelector('.cut-grid');
  }
  function layoutCards(set) {
    var cards = Array.prototype.slice.call(set.children).map(function (n) { return n.cloneNode(true); });
    var head = set.getAttribute('data-head') || '';
    var grid = cardPage(head);
    var colW = grid.clientWidth / 2;
    var avail = grid.clientHeight;
    var probe = document.createElement('div');
    probe.className = 'cut-grid';
    probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;height:auto;width:' + grid.clientWidth + 'px;grid-auto-rows:auto';
    document.body.appendChild(probe);
    var tallest = 0;
    cards.forEach(function (c) { probe.appendChild(c); tallest = Math.max(tallest, c.getBoundingClientRect().height); });
    document.body.removeChild(probe);
    var minH = avail / 7; // never smaller than a seventh of the page, so cards are easy to cut and hold
    var rows = Math.max(1, Math.min(7, Math.floor(avail / Math.max(tallest, minH))));
    var h = Math.floor(avail / rows);
    var per = rows * 2;
    for (var i = 0; i < cards.length; i++) {
      if (i > 0 && i % per === 0) grid = cardPage(head + ' (cont.)');
      cards[i].style.height = h + 'px';
      grid.appendChild(cards[i]);
    }
  }
  function layout() {
    pagesEl.innerHTML = '';
    flow('u-main', 'band-main');
    var sets = document.getElementById('cards').content.children;
    for (var si = 0; si < sets.length; si++) layoutCards(sets[si]);
    flow('u-key', 'band-key');
    var pages = pagesEl.querySelectorAll('.page');
    for (var p = 0; p < pages.length; p++) pages[p].querySelector('.pn').textContent = (p + 1) + ' / ' + pages.length;
    document.getElementById('status').textContent = pages.length + (pages.length === 1 ? ' page' : ' pages');
    window.__laidOut = true;
    if (window.__autoPrint) setTimeout(function () { window.print(); }, 120);
  }
  // Lay out only once our fonts have loaded, so the measurements match what is printed.
  var done = false;
  var go = function () { if (!done) { done = true; layout(); } };
  if (document.fonts && document.fonts.load) {
    Promise.all(['400 10pt Fraunces', '600 10pt Fraunces', 'italic 400 10pt Fraunces', '400 10pt Karla', '700 10pt Karla', '800 10pt Karla'].map(function (f) { return document.fonts.load(f); }))
      .then(function () { return document.fonts.ready; })
      .then(go, go);
    setTimeout(go, 4000); // never wait for ever
  } else setTimeout(go, 400);
  window.__relayout = layout;
})();
</script>
</body></html>`;
}
