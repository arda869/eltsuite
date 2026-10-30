import { credit } from './brand';
import { BoxFrame, type BoxAttrs } from '../editor/TextBox';
import { MARK } from '../components/Wordmark';
import { currentOrg } from './admin';
import appCss from '../styles.css?raw';
import extrasCss from './extras.css?raw';
import { translationsFor } from './langs';
import { LinkMark } from '../editor/Prosody';
import { SubstSlot } from '../editor/Subst';
import { PhonView } from '../editor/Phonemes';
import { DictCutout } from '../editor/DictCut';
import { timelineSvgString } from '../editor/Timeline';
import { StoryStrip } from '../storyboard/Stage';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../editor/Icons';
import { Sym } from '../editor/Symbols';
import type { Block, FormItem, Options, Run, WsItem, WsTask } from './worksheet';

// The printed worksheet or test, laid out like a coursebook photocopiable: a grey header band
// with a Name box, the ELT Suite logo and a class-colour graphic; section headings;
// numbered exercises in normal text size; mark boxes for exams. Pages are laid out in the
// browser before printing, so an exercise is never split between two columns or two pages
// (unless it is longer than a whole column).

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LET = 'abcdefghijklmnop';
const SIZES: Record<string, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210] };

const logo = (accent: string) => `<span class="logo"><span class="logo-mark">${MARK(accent)}</span><b>ELT</b> Suite</span>`;

// Safari (and iPhone printing) paints SVG colours given as var() or color-mix() black, so the cover
// gets plain colours here.
const hexMix = (hex: string, t: number) => {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return '#' + c.map((v) => Math.round(v * t + 255 * (1 - t)).toString(16).padStart(2, '0')).join('');
};
const plainColours = (svg: string, accent: string) =>
  svg.replace(/color-mix\(in srgb,\s*var\(--accent\)\s*(\d+)%,\s*(?:white|#fff(?:fff)?)\)/g, (_m, p) => hexMix(accent, Number(p) / 100)).replace(/var\(--accent\)/g, accent);

function runs(rs: Run[]) {
  let stack = '';
  const inline = rs
    .map((r) => {
      if (r.num !== undefined) return `<b class="qn">${r.num}</b>`;
      if (r.letters) return `<span class="lgp">${r.letters.split(' ').map((w) => `<span class="lgp-w">${Array.from(w).map((c) => (c === '_' ? '<i></i>' : `<b>${esc(c)}</b>`)).join('')}</span>`).join('')}</span>`;
      if (r.blank) return `<span class="blank" style="width:${Math.min(8, Math.max(2.6, r.blank * 0.2)).toFixed(1)}em"></span>`;
      if (r.options) return `<span class="opts">${r.options.map(esc).join(' / ')}</span>`;
      if (r.stack) {
        stack = `<span class="stack">${r.stack.map((o) => `<span>${esc(o).replace(/^(\w)\s+/, '<b class="ml">$1</b>')}</span>`).join('')}</span>`;
        return '';
      }
      if (r.ipa) return `<span class="ipa">${r.ipa.show ? `<span class="ipa-acc">${r.ipa.accent === 'GA' ? 'US' : 'UK'}</span>` : ''}/${esc(r.ipa.text)}/</span>`;
      if (r.stress) return `<span class="stw st-${esc(r.stress.style)}">${r.stress.syl.map((s, i) => `<span class="${i === r.stress!.on ? 'on' : ''}">${esc(s)}</span>`).join('')}</span>`;
      if (r.icon) return `<span class="emo tone-${esc(r.icon.tone)}">${iconSvg(r.icon.name)}</span>`;
      if (r.sym) return symHtml(r.sym);
      if (r.pic) {
        const src = MEDIA[r.pic.key ?? r.pic.src]?.data ?? MEDIA[r.pic.src]?.data ?? (r.pic.src.startsWith('media:') ? '' : r.pic.src);
        const dots = (r.pic.pts ?? []).map((p, i) => `<span class="pic-pt" style="left:${p.x}%;top:${p.y}%">${i + 1}</span>`).join('');
        const tags = (r.pic.tags ?? []).map((t) => `<span class="pic-tag" style="left:${t.x}%;top:${t.y}%">${esc(t.text)}</span>`).join('');
        return `<span class="pic pic-${esc(r.pic.size)}${tags ? ' has-tags' : ''}">${src ? `<img src="${esc(src)}" alt="${esc(r.pic.alt ?? '')}">` : '<span class="pic-wait"></span>'}${r.pic.label ? `<span class="pic-label">${esc(r.pic.label)}</span>` : ''}${dots}${tags}</span>`;
      }
      if (r.pl) return renderToStaticMarkup(createElement(LinkMark, { k: r.pl.k, s: r.pl.s }));
      if (r.phon) return renderToStaticMarkup(createElement(PhonView, { type: r.phon.type, a: r.phon.a }));
      if (r.subs) return renderToStaticMarkup(createElement(SubstSlot, { options: r.subs }));
      let t = esc(r.t ?? '').replace(/\n/g, '<br>');
      if (r.kw) return `<span class="kw${r.stem ? ' stem' : ''}">${t}</span>`;
      if (r.bold) t = `<b>${t}</b>`;
      if (r.italic) t = `<i>${t}</i>`;
      if (r.u) t = `<u>${t}</u>`;
      if (r.s) t = `<s>${t}</s>`;
      const style = [r.color ? `color:${r.color}` : '', r.hl ? `background:${r.hl}` : ''].filter(Boolean).join(';');
      if (style) t = `<span style="${style}">${t}</span>`;
      if (r.def) t = `<span class="defw">${t}</span>`;
      if (r.ex) return `<span class="ex-ans">${esc(r.t ?? '')}</span>`;
      for (const w of [...(r.wrap ?? [])].reverse()) t = `<span ${Object.entries(w).map(([k, v]) => `${k === 'className' ? 'class' : k}="${esc(v)}"`).join(' ')}>${t}</span>`;
      return t;
    })
    .join('');
  return inline + stack;
}

// Emoji icons and symbols, drawn the same way as in the app.
const iconSvg = (name: string) => renderToStaticMarkup(createElement(Icon, { name, size: '1.05em' }));
const symHtml = (y: { text: string; shape: string; tone: string }) => (y.shape === 'mont' ? renderToStaticMarkup(createElement(Sym, { text: y.text, shape: 'mont', tone: y.tone } as never)) : `<span class="sym sym-${esc(y.shape)} tone-${esc(y.tone)}${y.text.length > 2 ? ' wide' : ''}">${esc(y.text)}</span>`);

// Small drawings for paper forms: stars, faces and thumbs to circle or colour in.
const STAR = '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/></svg>';
const face = (mouth: string) => `<svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="${mouth}"/></svg>`;
const FACES = [face('M8.5 16.2c2-1.8 5-1.8 7 0'), face('M8.5 15.4h7'), face('M8.5 14.6c2 1.8 5 1.8 7 0')];
const THUMB = (down: boolean) => `<svg viewBox="0 0 24 24" width="1.4em" height="1.4em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" ${down ? 'style="transform:scaleY(-1)"' : ''}><path d="M7 10.5v9H4.5v-9zM7 10.5l3.6-6.3c1.4 0 2.2 1 1.9 2.4l-.6 2.9h5.4c1.3 0 2.2 1.2 1.9 2.4l-1.5 6.1c-.3 1.1-1.2 1.5-2.2 1.5H7"/></svg>`;
function formItem(it: FormItem, i: number): string {
  const head = `<p class="fi-q"><b class="qn">${i + 1}</b>${esc(it.prompt)}</p>`;
  const ends = (inner: string) => `<div class="fi-scale">${it.low ? `<span class="fi-end">${esc(it.low)}</span>` : ''}${inner}${it.high ? `<span class="fi-end">${esc(it.high)}</span>` : ''}</div>`;
  switch (it.type) {
    case 'stars':
      return head + ends(`<span class="fi-stars">${STAR.repeat(Math.max(3, Math.min(10, it.points ?? 5)))}</span>`);
    case 'faces':
      return head + `<div class="fi-faces">${FACES.join('')}</div>`;
    case 'thumbs':
      return head + `<div class="fi-faces">${THUMB(false)}${THUMB(true)}</div>`;
    case 'scale':
      return head + ends(`<span class="fi-boxes">${Array.from({ length: Math.max(2, Math.min(10, it.points ?? 5)) }, (_, k) => `<span>${k + 1}</span>`).join('')}</span>`);
    case 'choice':
    case 'checklist':
    case 'rank':
      return head + `<div class="fi-opts">${(it.options ?? []).filter(Boolean).map((o) => `<span><i class="fi-${it.type}"></i>${esc(o)}</span>`).join('')}</div>`;
    default:
      return head + `<div class="lines">${'<span class="line"></span>'.repeat(2)}</div>`;
  }
}

// A diagram on paper: the same layout as on screen, the lines drawn for the layout's fixed places.
const RINGP: Record<string, [number, number]> = { T: [1, 2], TR: [1, 3], R: [2, 3], BR: [3, 3], B: [3, 2], BL: [3, 1], L: [2, 1], TL: [1, 1] };
const MINDP = ['L', 'R', 'T', 'B', 'TL', 'TR', 'BR', 'BL'];
const CYCLEP: Record<number, string[]> = { 3: ['T', 'BR', 'BL'], 4: ['T', 'R', 'B', 'L'], 5: ['T', 'R', 'BR', 'BL', 'L'], 6: ['TL', 'TR', 'R', 'BR', 'BL', 'L'] };
function diagramHtml(b: Extract<Block, { kind: 'diagram' }>): string {
  const k = b.dkind;
  const n = b.cells.length;
  const inner = (c: { label: string; blocks: Block[] }) => `${c.label ? `<span class="dgw-l">${esc(c.label)}</span>` : ''}${c.blocks.map(block).join('')}`;
  const at = (i: number): [number, number] | null => (k === 'mind' ? (i ? RINGP[MINDP[(i - 1) % 8]] : [2, 2]) : k === 'cycle' ? RINGP[(CYCLEP[n] ?? CYCLEP[6])[i % 6]] : null);
  const cellsHtml = b.cells.map((c, i) => { const g = at(i); return `<div class="dgw-c c${i}${i === 0 && (k === 'mind' || k === 'tree') ? ' main' : ''}"${g ? ` style="grid-row:${g[0]};grid-column:${g[1]}"` : ''}>${inner(c)}</div>`; });
  let body = '';
  if (k === 'mind' || k === 'cycle') {
    const pt = (g: [number, number]) => [(g[1] - 0.5) * 100, (g[0] - 0.5) * 100];
    const pts = b.cells.map((_, i) => pt(at(i)!));
    const segs = k === 'mind' ? pts.slice(1).map((q) => [pts[0], q]) : pts.map((q, i) => [q, pts[(i + 1) % n]]);
    const lines = segs.map(([a, c]) => { const dx = c[0] - a[0]; const dy = c[1] - a[1]; const s = k === 'cycle' ? 0.3 : 0; return `<line x1="${a[0] + dx * s}" y1="${a[1] + dy * s}" x2="${c[0] - dx * s}" y2="${c[1] - dy * s}"${k === 'cycle' ? ' marker-end="url(#dgw-a)"' : ''}/>`; }).join('');
    body = `<svg class="dgw-svg" viewBox="0 0 300 300" preserveAspectRatio="none"><defs><marker id="dgw-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="currentColor" stroke-width="1.6"/></marker></defs>${lines}</svg><div class="dgw-grid">${cellsHtml.join('')}</div>`;
  } else if (k === 'flow') body = `<div class="dgw-row">${cellsHtml.join('<span class="dgw-ar">→</span>')}</div>`;
  else if (k === 'tree') body = `<div class="dgw-root">${cellsHtml[0] ?? ''}</div><div class="dgw-kids" style="grid-template-columns:repeat(${Math.max(1, n - 1)},1fr)">${cellsHtml.slice(1).join('')}</div>`;
  else if (k === 'cline') body = `<div class="dgw-scale"><span>${esc(b.labels[0] ?? '')}</span><i></i><span>${esc(b.labels[1] ?? '')}</span></div><div class="dgw-cols" style="grid-template-columns:repeat(${n},1fr)">${cellsHtml.join('')}</div>`;
  else if (k === 'quad') body = `<span class="dgw-ax x0">${esc(b.labels[0] ?? '')}</span><span class="dgw-ax x2">${esc(b.labels[2] ?? '')}</span><div class="dgw-q">${cellsHtml.join('')}</div><span class="dgw-ax x3">${esc(b.labels[3] ?? '')}</span><span class="dgw-ax x1">${esc(b.labels[1] ?? '')}</span>`;
  else if (k === 'pyramid') body = `<div class="dgw-pyr">${b.cells.map((c, i) => { const w = ((i + 0.5) / n + 0.35) / 1.35; const t = ((i / n + 0.35) / 1.35) / w; return `<div class="dgw-c" style="width:${(w * 100).toFixed(1)}%;clip-path:polygon(${((1 - t) * 50).toFixed(1)}% 0,${(100 - (1 - t) * 50).toFixed(1)}% 0,100% 100%,0 100%)">${inner(c)}</div>`; }).join('')}</div>`;
  else body = `<div class="dgw-cols" style="grid-template-columns:${k === 'venn' ? '1fr .7fr 1fr' : `repeat(${n},1fr)`}">${cellsHtml.join('')}</div>`;
  return `<figure class="dgw k-${k}">${b.title ? `<figcaption class="dgw-t">${esc(b.title)}</figcaption>` : ''}<div class="dgw-s">${body}</div></figure>`;
}

function block(b: Block): string {
  switch (b.kind) {
    case 'form':
      return `<div class="form">${b.title ? `<p class="form-t">${esc(b.title)}</p>` : ''}${b.peer ? '<p class="form-name">Classmate’s name <span class="line"></span></p>' : ''}${b.items.map(formItem).join('')}</div>`;
    case 'draw':
      return `${b.prompt ? `<p>${esc(b.prompt)}</p>` : ''}<div class="draw-box"></div>`;
    case 'media': {
      // A recording used again: its number at the start of the exercise is enough.
      if (MEDIA_SEEN.has(b.id)) return '';
      MEDIA_SEEN.add(b.id);
      const info = SOUNDS[b.id];
      const no = MEDIA_NO[b.id] ? `${b.video ? 'Video' : 'Recording'} ${MEDIA_NO[b.id]} · ` : '';
      const kind = no + (b.video ? 'Scan to watch' : 'Scan to listen');
      if (QR_ON && info?.svg) return `<div class="qr-block"><span class="qr-code">${info.svg}</span><span class="qr-text"><span class="qr-kind">${kind}</span><strong>${esc(b.title)}</strong><span class="qr-url">${esc(info.url.replace(/^https?:\/\//, '').split('/')[0])}</span></span></div>`;
      return `<p class="qr-plain"><span class="qr-kind">${no || (b.video ? 'Video' : 'Listening')}</span> <strong>${esc(b.title)}</strong></p>`;
    }
    case 'dict':
      return `<div class="dcut-wrap">${renderToStaticMarkup(createElement(DictCutout, { word: b.word, d: b.d }))}</div>`;
    case 'glossary':
      return `<div class="gloss"><span class="gloss-h">Glossary</span>${b.items
        .map(({ word, d }) => `<p><b>${esc(word)}</b>${d.pos ? ` <i>(${esc(d.pos)})</i>` : ''}${d.ipa ? ` <span class="ipa">${esc(d.ipa)}</span>` : ''}${d.meaning ? ` ${esc(d.meaning)}` : ''}${translationsFor(d, null).map(([l, v]) => ` <span class="gloss-tr">${esc(l)}: ${esc(v)}</span>`).join('')}</p>`)
        .join('')}</div>`;
    case 'p':
      if (b.heading) return `<p class="sub">${runs(b.runs)}</p>`;
      if (b.list === 'number' && b.mark !== undefined) return `<p class="li label"><span class="mk">${esc(b.mark)}</span><span>${runs(b.runs)}</span></p>`;
      if (b.list === 'bullet' && b.mark === '') return `<p class="li"><span class="mk"></span><span>${runs(b.runs)}</span></p>`;
      if (b.list) return `<p class="li ${b.list}"><span class="mk"></span><span>${runs(b.runs)}</span></p>`;
      return `<p>${runs(b.runs)}</p>`;
    case 'diagram':
      return diagramHtml(b);
    case 'storyboard':
      return `<div class="sbw-p" style="--sb-accent: var(--accent)">${renderToStaticMarkup(createElement(StoryStrip, { snap: b.a.snap!, cols: b.a.cols ?? 2, width: 'fluid' }))}</div>`;
    case 'timeline':
      return `<figure class="tl">${b.a.title ? `<figcaption class="tl-title">${esc(b.a.title)}</figcaption>` : ''}${timelineSvgString(b.a)}${b.a.sentence ? `<p class="tl-sentence">${esc(b.a.sentence)}</p>` : ''}</figure>`;
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
      // Sorting into columns: labelled columns with room to write, as on screen.
      if (b.head) return `<div class="sortcols">${b.rows[0].map((c) => `<div class="sortcol"><span class="sortcol-h">${esc(c)}</span>${'<span class="line"></span>'.repeat(b.rows.length - 1)}</div>`).join('')}</div>`;
      const puzzle = b.rows.slice(1).every((r) => r.every((c) => c.length <= 2));
      return `<table class="${puzzle ? 'puzzle' : 'grid'}"><tbody>${b.rows
        .map((r, ri) => (ri === 0 && puzzle ? '' : `<tr>${r.map((c, ci) => { const rich = b.cells?.[ri]?.[ci]; const inner = rich && !puzzle ? runs(rich) : esc(c); return ri === 0 ? `<th>${inner}</th>` : c === '■' ? '<td class="blk"></td>' : `<td>${/^\d+$/.test(c) && puzzle ? `<i>${esc(c)}</i>` : inner}</td>`; }).join('')}</tr>`))
        .join('')}</tbody></table>`;
    }
    case 'subtask':
      return `<div class="subex"><div class="subex-h"><b class="subex-l">${esc(b.letter)}</b><span>${esc(b.text)}</span></div><div class="subex-b">${b.blocks.map(block).join('')}</div></div>`;
    case 'callout': {
      // Text boxes print exactly as they look on screen: the same drawing and the same styles.
      if (b.box) return boxHtml(b.box, b.blocks.map(block).join(''));
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
  const runsText = (t.instrRuns ?? []).map((r) => r.t ?? '').join('').trim();
  const first = t.blocks[0];
  // A task with no title or instruction that starts with a sub-task: "1  a  The sub-task's instruction"
  // on one line, as in a coursebook.
  if (!head?.trim() && !runsText && first?.kind === 'subtask') {
    const rest = t.blocks.slice(1);
    return `<div class="unit task"><div class="ex-head"><b class="ex-n">${num}</b><b class="subex-l">${esc(first.letter)}</b><span class="ex-text">${exIcons(t)}${esc(first.text)}</span></div><div class="ex-body"><div class="subex-b">${first.blocks.map(block).join('')}</div>${rest.map(block).join('')}</div>${marks && t.marks ? `<div class="ex-mark">${markBox(t.marks)}</div>` : ''}</div>`;
  }
  return `<div class="unit task"><div class="ex-head"><b class="ex-n">${num}</b><span class="ex-text">${exIcons(t)}${t.instrRuns ? runs(t.instrRuns) : esc(head)}</span></div><div class="ex-body">${t.blocks.map(block).join('')}</div>${marks && t.marks ? `<div class="ex-mark">${markBox(t.marks)}</div>` : ''}</div>`;
}

// Pictures for this print, set at the start of worksheetHtml.
let MEDIA: NonNullable<Options['media']> = {};
let SOUNDS: NonNullable<Options['sounds']> = {};
let QR_ON = true;
// Recordings and videos are numbered in the order they first come in the worksheet. One used again
// keeps its number, and its QR code is printed only the first time.
let MEDIA_NO: Record<string, number> = {};
let MEDIA_SEEN = new Set<string>();
function numberMedia(items: WsItem[]) {
  MEDIA_NO = {};
  MEDIA_SEEN = new Set();
  let k = 0;
  for (const it of items) if (it.kind === 'task') for (const id of it.task.media ?? []) if (!(id in MEDIA_NO)) MEDIA_NO[id] = ++k;
}
const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.6v6.8L9.6 6z" fill="currentColor"/></svg>';
const CARDS = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="3.4" width="5.4" height="7" rx=".8" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.6 3.2V2.4a.8.8 0 0 1 .8-.8h3.8a.8.8 0 0 1 .8.8v5.4a.8.8 0 0 1-.8.8h-1.4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
// Small square icons at the start of an exercise: a play sign with the recording's number, or cards
// for an exercise with cards to cut out.
function exIcons(t: WsTask) {
  const ids = [...new Set(t.media ?? [])];
  const play = ids.map((id) => `<span class="ex-ic" title="Recording ${MEDIA_NO[id] ?? ''}"><i>${PLAY}</i><b>${MEDIA_NO[id] ?? ''}</b></span>`).join('');
  const cards = t.cutouts?.some((c) => c.cards.length) ? `<span class="ex-ic" title="Cards to cut out"><i>${CARDS}</i></span>` : '';
  return play + cards;
}

// The worksheet's styles: the house style (see "How printed worksheets look" in CLAUDE.md).
export function sheetCss(opts: Options) {
  const org = currentOrg();
  const accent = org?.brand?.color || opts.accent || '#d98f63';
  const [pw, ph] = SIZES[opts.paper ?? 'A4'] ?? SIZES.A4;
  const small = opts.paper === 'A5';
  const cols = opts.columns ?? 2;
  return `${BOX_CSS}
${extrasCss}
.dcut { break-inside: avoid; } .dcut-wrap { break-inside: avoid; }
${opts.size && opts.size !== 'standard' ? `.cols .unit { zoom: ${opts.size === 'xl' ? 1.4 : 1.2}; }` : ''}
${opts.clear ? `.cols, .cols :not(svg, svg *) { font-family: 'Atkinson Hyperlegible', Verdana, sans-serif !important; } .cols { --serif: 'Atkinson Hyperlegible', Verdana, sans-serif; --sans: 'Atkinson Hyperlegible', Verdana, sans-serif; letter-spacing: .02em; } .cols p { line-height: 1.65; }` : ''}
.sbw-p { margin: 2mm 0 4mm; } .sbw-s { position: relative; } .sbw-n { position: absolute; left: 1.6mm; top: 1.6mm; min-width: 4.6mm; height: 4.6mm; padding: 0 1.2mm; border-radius: 2.3mm; background: var(--accent); color: #fff; font: 800 6.8pt/4.6mm Karla, sans-serif; text-align: center; box-sizing: border-box; } .sbw-c { margin: 1.4mm 0 0; font-size: 9pt; line-height: 1.35; } .sbw-t { font: 800 7.5pt Karla, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin-bottom: 2mm; } .dgw { margin: 3mm 0 4mm; break-inside: avoid; color: #2b2a28; } .dgw-t { font-weight: 600; font-size: 10pt; margin-bottom: 2mm; text-align: center; } .dgw-s { position: relative; } .dgw-l { display: block; font: 700 7.5pt/1.2 Karla, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin-bottom: 1mm; } .dgw-c p { margin: 0; } .dgw-svg { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--accent); stroke: var(--accent); stroke-width: 1.4; fill: none; z-index: 0; } .dgw-grid { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, minmax(16mm, auto)); align-items: center; justify-items: center; } .k-mind .dgw-c, .k-cycle .dgw-c, .k-flow .dgw-c, .k-tree .dgw-c { background: #fff; border: 1.2pt solid var(--accent); border-radius: 3mm; padding: 2mm 3.5mm; text-align: center; max-width: 48mm; } .dgw-c.main { background: color-mix(in srgb, var(--accent) 14%, #fff); font-weight: 600; } .dgw-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2mm 3mm; } .dgw-ar { color: var(--accent); font-size: 14pt; } .dgw-root { display: flex; justify-content: center; padding-bottom: 4mm; } .dgw-kids { display: grid; gap: 3mm; justify-items: center; border-top: 1.2pt solid var(--accent); padding-top: 4mm; } .dgw-cols { display: grid; gap: 3mm; } .k-venn .dgw-s { padding: 6mm 7%; } .k-venn .dgw-s::before, .k-venn .dgw-s::after { content: ''; position: absolute; top: 0; bottom: 0; width: 64%; border: 1.2pt solid var(--accent); border-radius: 50%; background: color-mix(in srgb, var(--accent) 7%, transparent); } .k-venn .dgw-s::before { left: 2%; } .k-venn .dgw-s::after { right: 2%; } .k-venn .dgw-cols { position: relative; z-index: 1; align-items: center; min-height: 34mm; text-align: center; } .k-compare .dgw-c { border-left: 1.2pt solid var(--accent); padding: 0 3mm; } .k-compare .dgw-c.c0 { border-left: 0; } .k-compare .dgw-l { font: 600 10pt Fraunces, serif; letter-spacing: 0; text-transform: none; color: #2b2a28; border-bottom: 1.2pt solid var(--accent); padding-bottom: 1mm; margin-bottom: 2mm; } .dgw-scale { display: flex; align-items: center; gap: 2mm; font: 600 8pt Karla, sans-serif; color: #6f6a64; margin-bottom: 2mm; } .dgw-scale i { flex: 1; height: 0; border-top: 1.2pt solid var(--accent); position: relative; } .dgw-scale i::before, .dgw-scale i::after { position: absolute; top: -6pt; color: var(--accent); font-style: normal; font-size: 9pt; } .dgw-scale i::before { content: '◀'; left: -3pt; } .dgw-scale i::after { content: '▶'; right: -3pt; } .k-cline .dgw-c { text-align: center; background: color-mix(in srgb, var(--accent) 8%, #fff); border-radius: 2mm; padding: 1.5mm; } .k-quad .dgw-s { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: '. t .' 'l q r' '. b .'; gap: 1.5mm 2mm; align-items: center; } .dgw-ax { font: 600 8pt Karla, sans-serif; color: #6f6a64; text-align: center; } .dgw-ax.x0 { grid-area: t; } .dgw-ax.x1 { grid-area: b; } .dgw-ax.x2 { grid-area: l; } .dgw-ax.x3 { grid-area: r; } .dgw-q { grid-area: q; display: grid; grid-template-columns: 1fr 1fr; } .dgw-q .dgw-c { padding: 3mm; min-height: 14mm; text-align: center; } .dgw-q .c0, .dgw-q .c1 { border-bottom: 1.2pt solid var(--accent); } .dgw-q .c0, .dgw-q .c2 { border-right: 1.2pt solid var(--accent); } .dgw-pyr { display: flex; flex-direction: column; align-items: center; gap: 1mm; } .dgw-pyr .dgw-c { background: color-mix(in srgb, var(--accent) 16%, #fff); padding: 2.5mm 6mm; text-align: center; box-sizing: border-box; }
.tl { margin: 3mm 0 4mm; break-inside: avoid; } .tl-svg { width: 100%; height: auto; display: block; color: #2b2a28; } .tl-title { font-weight: 600; font-size: 10pt; margin-bottom: 1mm; } .tl-sentence { font-style: italic; margin: 1mm 0 0; text-align: center; }
.tl-line { stroke: #2b2a28; stroke-width: 2.5; color: #2b2a28; } .tl-end { font: 600 11px sans-serif; letter-spacing: .1em; fill: #8a847d; } .tl-now line { stroke: #2b2a28; stroke-width: 3; } .tl-now text { font: 700 13px sans-serif; letter-spacing: .1em; fill: #2b2a28; } .tl-label { font: 15px Georgia, serif; } .tl-q { font: 700 34px Georgia, serif; } .tl-hit { display: none; }
@font-face { font-family: Fraunces; src: url('${opts.origin ?? ''}/fonts/Fraunces.ttf') format('truetype'); font-weight: 100 900; font-display: block; }
@font-face { font-family: Karla; src: url('${opts.origin ?? ''}/fonts/Karla.ttf') format('truetype'); font-weight: 200 800; font-display: block; }
:root { --accent: ${accent}; --accent-ink: color-mix(in srgb, var(--accent) 72%, black); --accent-text: var(--accent-ink); --tint: color-mix(in srgb, var(--accent) 10%, white); --ink: #262420; --muted: #66615b; --band: #ecebe7; --tint-line: color-mix(in srgb, var(--accent) 35%, white); --pw: ${pw}mm; --ph: ${ph}mm; --side: ${small ? 10 : 13}mm; }
@page { size: ${opts.paper === 'Letter' ? 'letter' : opts.paper ?? 'A4'}; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); font: ${small ? '9pt' : '10.2pt'}/1.5 Fraunces, Georgia, serif; }
.page { width: var(--pw); height: var(--ph); overflow: hidden; display: flex; flex-direction: column; background: #fff; position: relative; break-after: page; }
.page:last-child { break-after: auto; }
@media screen { body { background: #e6e4e0; padding: 20px 0 40px; } .page { margin: 0 auto 18px; box-shadow: 0 8px 26px rgba(0,0,0,.14); } .toolbar { width: var(--pw); margin: 0 auto 14px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; font: 13px Karla, sans-serif; color: #66615b; } .toolbar button { font: 700 13px Karla, sans-serif; padding: 9px 16px; border-radius: 10px; border: 0; background: var(--accent); color: #fff; cursor: pointer; } }
@media print { .toolbar { display: none; } body { background: #fff; } }
/* Safari and every iPhone or iPad browser keep their own page margins and print the address and date in
   them, so a full-size page spills onto a second sheet. There the pages print a little smaller. */
@media print { html.wk body { zoom: .85; } .page { break-inside: avoid; } }

/* Header band */
.band { flex: none; display: grid; grid-template-columns: 1fr 34%; height: ${small ? 24 : 30}mm; margin-top: 0; background: var(--band); }
.band-left { padding: 0 0 0 var(--side); display: flex; flex-direction: column; justify-content: space-between; }
.namebox { display: block; width: 78%; height: ${small ? 8 : 10}mm; background: #fff; padding: 1.2mm 3mm 0; font: 600 7pt Karla, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #3d3a36; }
.namebox.empty { background: transparent; }
h1 { margin: 0 0 ${small ? 2.5 : 3.2}mm; font: 800 ${small ? 12.5 : 15.5}pt/1.12 Karla, sans-serif; color: #4b4843; letter-spacing: -.005em; }
.band-right { position: relative; overflow: hidden; }
.band-cover { position: absolute; inset: 0; } .band-cover svg, .band-cover img { width: 100%; height: 100%; display: block; }
.band-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--band) 0%, rgba(236,235,231,0) 28%); }
.brand { background: rgba(255,255,255,.88); padding: 1.6mm 2.6mm 1.4mm; border-radius: 1.6mm; }
.brand { position: absolute; right: var(--side); bottom: ${small ? 2.5 : 3.2}mm; display: flex; flex-direction: column; align-items: flex-end; gap: .6mm; }
.org-logo { display: block; max-height: ${small ? 26 : 36}pt; max-width: ${small ? 90 : 130}pt; object-fit: contain; margin-left: auto; } .logo-mark svg { width: 1em; height: 1em; vertical-align: -0.12em; margin-right: .3em; } .logo b { font-weight: 700; } .logo { font: 600 ${small ? 14 : 18}pt/1 Fraunces, serif; letter-spacing: -.015em; color: var(--ink); white-space: nowrap; }
.li-i { position: relative; display: inline-block; } .li-i svg { position: absolute; left: 50%; top: .08em; transform: translateX(-50%); width: .32em; height: auto; }
.kicker { font: 700 7.5pt Karla, sans-serif; letter-spacing: .04em; color: #3d3a36; }

/* Body: one or two columns of fixed height, filled by the layout script */
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(${cols}, 1fr); column-gap: ${cols === 2 ? (small ? 6 : 9) : 0}mm; padding: ${small ? 5 : 7}mm var(--side) 0; }
.col { height: 100%; overflow: hidden; }
.ws-credit { margin-top: 6mm; padding-top: 2.5mm; border-top: .5pt solid #d6d3cd; display: flex; flex-direction: column; gap: .6mm; font: 7.5pt/1.4 Karla, sans-serif; color: #6f6a64; break-inside: avoid; } .ws-credit b { font-weight: 700; color: #4b4843; }
.foot { flex: none; display: flex; justify-content: space-between; align-items: center; height: ${small ? 11 : 14}mm; padding-left: var(--side); font: 500 6.8pt Karla, sans-serif; color: #4b4843; }
.foot-l { display: flex; flex-direction: column; gap: .5mm; min-width: 0; padding-right: 4mm; }
.foot-note { font: 400 5.6pt/1.3 Karla, sans-serif; color: #8a847d; }
.pn { align-self: center; min-width: 17mm; height: 5mm; padding: 0 2.6mm; white-space: nowrap; display: grid; place-items: center; background: #8d8983; color: #fff; font: 700 8pt Karla, sans-serif; }

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
.wordbox { display: flex; flex-wrap: wrap; gap: 1.2mm 1.6mm; margin: .8mm 0 2.6mm; padding: 1mm 0; border-top: .6pt solid #d6d2cc; border-bottom: .6pt solid #d6d2cc; }
.wordbox span { padding: .3mm 2.6mm .4mm; border: .7pt solid #cfcac3; border-radius: 999px; background: #fff; }
.kw { display: inline-block; padding: .5mm 2.6mm; border: .8pt solid var(--ink); border-radius: 1.2mm; font: 700 .82em Karla, sans-serif; letter-spacing: .1em; }
.kw.stem { padding: .2mm 1.6mm; border: 0; background: #eeece8; color: var(--muted); font-size: .66em; vertical-align: .15em; }
.sortcols { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3mm; margin: .5mm 0 2.8mm; }
.sortcol { background: #f6f5f3; border: .6pt solid #e4e1dc; border-radius: 2mm; padding: 2mm 3mm 1.5mm; }
.sortcol-h { display: block; font: 700 6.8pt Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.sortcol .line { height: 6.6mm; border-bottom-color: #cfcac3; }
.pic-pt { position: absolute; transform: translate(-50%, -50%); width: 5mm; height: 5mm; display: grid; place-items: center; border-radius: 999px; background: var(--accent); color: #fff; font: 700 7.5pt/1 Karla, sans-serif; box-shadow: 0 0 0 .5mm #fff; }
.lines { margin: .5mm 0 2mm; } .line { display: block; height: 7.4mm; border-bottom: .55pt solid #a9a49d; }
.lines-hint { font: 600 7pt Karla, sans-serif; color: var(--muted); }
.match { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 5mm; margin: .5mm 0 2mm; }
.m-l, .m-r { display: flex; align-items: baseline; gap: 1mm; } .m-ans { flex: 1; max-width: 9mm; margin-left: auto; border-bottom: .7pt solid var(--ink); }
.ml { min-width: 3.2mm; margin-right: 1.2mm; font-weight: 600; }
.callout { margin: 1mm 0 2.6mm; padding: 2.4mm 3.2mm 1mm; background: #efeeeb; border-left: 1.6pt solid var(--accent); }
.callout.realia { background: #fff; border: .7pt solid #3d3a36; font: ${small ? '8.2pt' : '9.2pt'}/1.5 Karla, sans-serif; padding: 2.6mm 3.4mm 1.4mm; }
.c-label { font: 800 7pt Karla, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #4b4843; margin-bottom: 1mm; }
table.grid { border-collapse: collapse; width: auto; max-width: 100%; margin: 1mm 0 2.6mm; font-size: .95em; }
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
.scissors { display: inline-flex; font-size: 12pt; color: var(--accent-ink); line-height: 1; } .scissors svg { display: block; }
.cut-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; align-content: start; padding: .5pt 0 0 .5pt; }
.cut-card { position: relative; overflow: hidden; margin: -.5pt 0 0 -.5pt; border: .9pt dashed #6f6a64; padding: 3.6mm 4.4mm 3mm; display: flex; flex-direction: column; gap: 1.4mm; font: ${small ? '8.6pt' : '9.6pt'}/1.4 Karla, sans-serif; }
.cut-title { font: 700 ${small ? '10.5pt' : '12pt'}/1.25 Karla, sans-serif; color: var(--ink); padding-left: 2.4mm; border-left: 1.6pt solid var(--accent); }
.cut-body p { margin: 0 0 .8mm; }
.cut-body .li { gap: 1.4mm; }
.cut-sym { position: absolute; right: 3mm; bottom: 2.2mm; font-size: 10pt; color: var(--tint-line); }

.ex-ic { display: inline-flex; align-items: center; gap: .9mm; margin-right: 1.6mm; vertical-align: -.2em; }
.ex-ic i { display: grid; place-items: center; width: 1.15em; height: 1.15em; border-radius: .2em; background: var(--accent); color: #fff; }
.ex-ic i svg { width: .8em; height: .8em; }
.ex-ic b { font: 700 .86em Karla, sans-serif; color: var(--accent-ink); }
.subex { margin: 1.6mm 0 2.4mm; break-inside: avoid; }
.subex-h { display: flex; gap: 2.2mm; margin-bottom: 1.2mm; }
.subex-l { flex: none; min-width: 3.4mm; font: 700 .98em Karla, sans-serif; color: var(--accent-ink); }
.ex-head .subex-l { line-height: inherit; align-self: baseline; }
.subex-b { padding-left: 5.6mm; }
/* Inline language tools on paper */
.ipa { font-family: 'Noto Sans', 'Charis SIL', 'Doulos SIL', 'Gentium Plus', 'Lucida Sans Unicode', 'Segoe UI', 'Arial Unicode MS', sans-serif; color: #6f6a64; font-size: .9em; white-space: nowrap; }
.ipa-acc { font: 700 .62em Karla, sans-serif; letter-spacing: .06em; color: var(--accent-ink); margin-right: .25em; vertical-align: .15em; }
.stw { white-space: nowrap; }
.stw.st-bold .on { font-weight: 700; }
.stw.st-big .on { font-size: 1.18em; font-weight: 600; }
.stw.st-box .on { position: relative; display: inline-block; }
.stw.st-box .on::before { content: ''; position: absolute; left: 50%; top: -.1em; width: .36em; height: .36em; margin-left: -.18em; border: 1pt solid var(--accent-ink); border-radius: .06em; }
.emo { display: inline-block; vertical-align: -.18em; } .emo svg { display: block; } .emo.tone-accent { color: var(--accent-ink); } .emo.tone-soft { color: #8f8f8c; }
.sym { display: inline-flex; align-items: center; justify-content: center; vertical-align: .08em; font: 700 .68em/1 Karla, sans-serif; min-width: 1.6em; height: 1.6em; padding: 0 .3em; box-sizing: border-box; margin: 0 .08em; }
.sym-box { border: 1pt solid currentColor; border-radius: .22em; } .sym-circle { border: 1pt solid currentColor; border-radius: 999px; } .sym-circle:not(.wide) { width: 1.6em; padding: 0; }
.sym-pill { border-radius: 999px; background: var(--tint); } .sym.tone-accent { color: var(--accent-ink); } .sym.tone-soft { color: #8f8f8c; }
svg.sym-mont { width: 1.05em; height: 1.05em; vertical-align: -.15em; }
.defw { border-bottom: .8pt dotted var(--accent-ink); }
.gloss { margin-top: 2.2mm; padding: 1.6mm 2.4mm; border-top: .6pt solid var(--tint-line); font-size: .92em; }
.gloss-h { display: block; font: 700 6.6pt Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--accent-ink); margin-bottom: .6mm; }
.gloss p { margin: .4mm 0; } .gloss-tr { color: #6f6a64; font-style: italic; }

.tnotes { margin-top: 1.6mm; padding: 1.6mm 2.4mm; border-left: 1.6pt solid var(--accent); background: var(--tint); font: 8.6pt/1.45 Karla, sans-serif; color: #3d3a36; }
.tnotes-h { display: block; font: 700 6.4pt Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--accent-ink); margin-bottom: .6mm; }
.tnotes p { margin: .3mm 0; }
.tscript { margin-top: 1.6mm; padding: 1.6mm 2.4mm; border-left: 1.6pt solid var(--hair, #d8d4cd); font: 9pt/1.5 Fraunces, Georgia, serif; color: #2b2a28; }
.tscript .tnotes-h i { font-style: normal; font-weight: 600; letter-spacing: 0; text-transform: none; color: #8a847d; margin-left: 1mm; }
.tscript p { margin: .3mm 0; }
.qr-block { display: flex; align-items: center; gap: 3.2mm; margin: 1.6mm 0 2.4mm; break-inside: avoid; }
.qr-code { flex: 0 0 auto; width: 20mm; height: 20mm; padding: 1.2mm; border-radius: 1.6mm; box-shadow: 0 0 0 .3mm #d8d4cd; background: #fff; }
.qr-code svg { display: block; width: 100%; height: 100%; }
.qr-text { display: flex; flex-direction: column; gap: .5mm; }
.qr-kind { font: 700 6.4pt Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--accent-ink); }
.qr-text strong { font: 600 10.5pt/1.25 Fraunces, Georgia, serif; color: #2b2a28; }
.qr-url { font: 7pt Karla, sans-serif; color: #8a847d; }
.qr-plain { margin: 1mm 0 2mm; } .qr-plain strong { font-family: Fraunces, Georgia, serif; }

/* Self-reflection, peer feedback and surveys on paper */
.form { margin: 1mm 0 2mm; }
.form-t { font-weight: 600; margin-bottom: 1.2mm; }
.form-name { display: flex; align-items: flex-end; gap: 2mm; font: 600 8pt Karla, sans-serif; color: #4b4843; } .form-name .line { flex: 1; margin: 0; }
.fi-q { margin: 1.8mm 0 .8mm; }
.fi-scale { display: flex; align-items: center; gap: 2.4mm; padding-left: 5mm; flex-wrap: wrap; }
.fi-end { font: 500 7.4pt Karla, sans-serif; color: #66615b; }
.fi-stars { display: inline-flex; gap: 1mm; color: var(--accent-ink); }
.fi-faces { display: flex; gap: 4mm; padding-left: 5mm; color: #4b4843; }
.fi-boxes { display: inline-flex; gap: 1.4mm; } .fi-boxes span { width: 6.4mm; height: 6.4mm; display: grid; place-items: center; border: .8pt solid #8a847d; border-radius: 1mm; font: 600 7.6pt Karla, sans-serif; color: #66615b; }
.fi-opts { display: flex; flex-direction: column; gap: .9mm; padding-left: 5mm; }
.fi-opts span { display: flex; align-items: center; gap: 2mm; }
.fi-opts i { flex: none; display: inline-block; width: 3.4mm; height: 3.4mm; border: .8pt solid #6f6a64; }
.fi-opts i.fi-choice { border-radius: 50%; } .fi-opts i.fi-checklist { border-radius: .6mm; } .fi-opts i.fi-rank { width: 6mm; border-width: 0 0 .8pt; border-radius: 0; }
.draw-box { height: 46mm; border: .8pt dashed #b8b2aa; border-radius: 2mm; margin: 1.4mm 0 2mm; }

/* Pictures, with their label in the top-right corner */
.pic { position: relative; display: inline-block; vertical-align: top; margin: .6mm 2.4mm 1.6mm 0; border-radius: 1.6mm; overflow: hidden; line-height: 0; background: #f1efeb; }
.pic img { display: block; width: 100%; height: auto; }
.pic.has-tags { overflow: visible; } .pic.has-tags img { border-radius: 1.6mm; }
.pic-tag { position: absolute; transform: translate(-50%, -50%); padding: .5mm 2mm; border-radius: 1.2mm; background: #fff; box-shadow: 0 0 0 .5pt rgba(51,48,44,.35); font: 600 8pt/1.3 Karla, sans-serif; color: #262420; white-space: nowrap; }
.pic-s { width: 28mm; } .pic-m { width: 46mm; } .pic-l { width: 70mm; max-width: 100%; } .pic-full { width: 100%; margin-right: 0; }
p:has(> .pic ~ .pic) > .pic:not(.pic-full), div:has(> .pic ~ .pic) > .pic:not(.pic-full) { max-width: calc(50% - 2.4mm); }
p:has(> .pic ~ .pic ~ .pic) > .pic:not(.pic-full), div:has(> .pic ~ .pic ~ .pic) > .pic:not(.pic-full) { max-width: calc(33.3% - 2.4mm); }
.pic-wait { display: block; aspect-ratio: 4 / 3; }
.pic-label { position: absolute; top: 1.2mm; left: 1.2mm; min-width: 3.8mm; height: 3.8mm; padding: 0 1mm; display: grid; place-items: center; border-radius: 999px; background: var(--accent); color: #fff; font: 700 6.4pt/1 Karla, sans-serif; box-shadow: 0 0 0 .35mm #fff; }

.ex-ans { display: inline-block; min-width: 10mm; padding: 0 1mm; border-bottom: .6pt solid #2f2c29; font-style: italic; color: #2f5fa8; }

.lgp { display: inline; } .lgp-w { display: inline-flex; align-items: flex-end; gap: .9mm; margin-right: 2.6mm; white-space: nowrap; vertical-align: -.1em; }
.lgp-w i { display: inline-block; width: 2.6mm; height: 1em; border-bottom: .7pt solid #2f2c29; }
.lgp-w b { font-weight: 400; line-height: 1; }

/* Class colour, more prominent */
h1 { color: var(--ink); }
.section h2 { color: var(--accent-ink); }
.section h2::after { height: 1.4pt; opacity: 1; background: var(--accent); }
.ex-n { color: var(--accent-ink); }
.qn, .ml { color: var(--accent-ink); }

.callout { background: var(--tint); border-left-width: 2.4pt; }
.c-label { color: var(--accent-ink); }
.pn { background: var(--accent); }
.mb-max { background: var(--accent); }
.total .mb-max { background: var(--accent-ink); }
.markbox, .total > span:first-child { border-color: var(--accent-ink); }
.cut-title { border-left: 0; padding: 0; background: none; color: var(--accent-ink); border-radius: 0; align-self: flex-start; }
.scissors { color: var(--accent-ink); }
.li.bullet .mk::before { color: var(--accent); }
.li.label .mk { width: auto; min-width: 4mm; font-weight: 600; color: var(--accent-ink); font-family: Karla, sans-serif; }

/* Answer key */
.key .ex-body p { margin-bottom: .6mm; }
`;
}

// The pieces of a worksheet for the worksheet view in the lesson editor: its styles, the header band,
// the footer, and each item (a section or a task) printed on its own, in order.
export function inlineWorksheetHtml(task: WsTask) {
  MEDIA = {}; SOUNDS = {}; QR_ON = false; MEDIA_SEEN.clear();
  return `<div class="doc-worksheet">${task.blocks.map(block).join('')}</div>`;
}
export function sheetParts(title: string, items: WsItem[], opts: Options) {
  MEDIA = opts.media ?? {};
  SOUNDS = opts.sounds ?? {};
  QR_ON = opts.qr !== false;
  const marks = !!opts.marks;
  numberMedia(items);
  let num = 0;
  const pieces = items.map((it) => (it.kind === 'section' ? `<div class="unit section"><h2>${esc(it.title)}</h2></div>` : taskUnit(it.task, ++num, marks)));
  const html = worksheetHtml(title, items, opts);
  const pick = (id: string) => html.match(new RegExp(`<template id="${id}">([\\s\\S]*?)</template>`))?.[1] ?? '';
  return { css: sheetCss(opts), band: pick('band-main'), foot: pick('foot'), pieces, credit: '' };
}

export function worksheetHtml(title: string, items: WsItem[], opts: Options) {
  MEDIA = opts.media ?? {};
  SOUNDS = opts.sounds ?? {};
  QR_ON = opts.qr !== false;
  // An organisation's teachers print with its logo and colour.
  const org = currentOrg();
  const brandLogo = org?.brand?.wide || org?.brand?.logo || '';
  const accent = org?.brand?.color || opts.accent || '#d98f63';
  const brandName = org?.name ?? '';
  const cols = opts.columns ?? 2;
  const marks = !!opts.marks;
  const tasks = items.filter((i): i is { kind: 'task'; task: WsTask } => i.kind === 'task').map((i) => i.task);

  // Units in reading order. Section totals (exams) follow the last task of each section.
  numberMedia(items);
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

  // For the teacher: each exercise's answers and, when chosen, its teacher's notes.
  const keyUnits =
    opts.key || opts.notes
      ? tasks
          .map((t, i) => {
            const answers = opts.key ? t.answers : [];
            const notes = opts.notes ? t.notes ?? '' : '';
            const scripts = opts.key ? (t.media ?? []).map((id) => SOUNDS[id]).filter((m) => m && m.script.length) : [];
            if (!answers.length && !notes && !scripts.length) return '';
            const sc = scripts.map((m) => `<div class="tscript"><span class="tnotes-h">${m.video ? 'Video script' : 'Audioscript'} <i>${esc(m.title)}</i></span>${m.script.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('');
            return `<div class="unit key"><div class="ex-head"><b class="ex-n">${i + 1}</b><span class="ex-text">${esc(t.instructions?.trim() || t.title)}</span></div><div class="ex-body">${answers.map((a) => `<p><b class="qn">${a.n}</b>${esc(a.text)}</p>`).join('')}${sc}${notes ? `<div class="tnotes"><span class="tnotes-h">Notes</span>${notes.split('\n').filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}</div></div>`;
          })
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
        <div class="band-cover">${plainColours(opts.cover ?? '', accent)}</div>
        <div class="brand">${brandLogo ? `<img class="org-logo" src="${brandLogo}" alt="${esc(brandName)}">` : logo(accent)}<span class="kicker">${esc(kicker || 'Worksheet')}</span></div>
      </div>
    </header>`;
  // Every page: the class and lesson, who made it, and the note that the content is theirs and ELT Suite
  // is only the tool, small, as a footnote.
  const foot = `<footer class="foot"><span class="foot-l"><span>${esc([opts.className, title].filter(Boolean).join(' · '))} · ${esc(credit().by)}</span><span class="foot-note">${esc(credit().note)}</span></span><span class="pn"></span></footer>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>${opts.clear ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=block">' : ''}
<style>
${sheetCss(opts)}
</style></head><body>
<div class="toolbar"><span id="status">Laying out the pages…</span><button onclick="window.print()">Print or save as PDF</button></div>
<div id="pages"></div>
<template id="u-main">${units.join('')}</template>
<template id="cards">${cardSets.join('')}</template>
<template id="band-cards">${band(title + ' · Cards to cut out')}</template>
<template id="u-key">${keyUnits.join('')}</template>
<template id="band-main">${band(title)}</template>
<template id="band-key">${band(title + (opts.key && opts.notes ? ' · Answer key and notes' : opts.key ? ' · Answer key' : ' · Teacher’s notes'))}</template>
<template id="foot">${foot}</template>
<script>
(function () {
  var ua = navigator.userAgent;
  var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var safari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua);
  if (ios || safari) document.documentElement.className += ' wk';
})();
(function () {
  var COLS = ${cols};
  var pagesEl = document.getElementById('pages');
  function newPage(bandId) {
    var page = document.createElement('div');
    page.className = bandId === 'band-key' ? 'page key-page' : 'page';
    page.innerHTML = document.getElementById(bandId).innerHTML + '<div class="cols"></div>' + document.getElementById('foot').innerHTML;
    var wrap = page.querySelector('.cols');
    var cols = [];
    for (var i = 0; i < COLS; i++) { var c = document.createElement('div'); c.className = 'col'; wrap.appendChild(c); cols.push(c); }
    pagesEl.appendChild(page);
    return cols;
  }
  var over = function (col) { return col.scrollHeight > col.clientHeight + 1; };
  // Move the last parts of el into restEl (an empty copy of it) until the column is no longer too
  // full, going inside the last part when it is too tall on its own. Pictures, tables and drawings
  // are never cut.
  var SOLID = 'svg, img, table, figure, .qr-block, .tl, .dgw, .dcut-wrap, .wordbox, .sbw-p, .ws-lines, p, li';
  function cut(col, el, restEl) {
    while (over(col) && el.children.length) {
      var last = el.lastElementChild;
      var solid = !last.children.length || last.matches(SOLID);
      // Without it, would the column fit? If not, it goes on whole.
      el.removeChild(last);
      var fits = !over(col);
      el.appendChild(last);
      if (!fits && el.children.length > 1) { restEl.insertBefore(last, restEl.firstChild); continue; }
      if (solid) { if (el.children.length > 1) restEl.insertBefore(last, restEl.firstChild); return; }
      // It fits partly: the rest of it goes on, in a copy of it.
      var part = last.cloneNode(false);
      restEl.insertBefore(part, restEl.firstChild);
      cut(col, last, part);
      if (!part.children.length) restEl.removeChild(part);
      return;
    }
  }
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
      // taller than a whole column: split it between its blocks, and inside a block (a text box,
      // a list, a dialogue) that is itself taller than the column
      var body = u.querySelector('.ex-body');
      if (!body || !body.children.length) { nextCol(); continue; }
      var rest = u.cloneNode(true), restBody = rest.querySelector('.ex-body');
      restBody.innerHTML = '';
      var mark = u.querySelector('.ex-mark');
      if (mark) u.removeChild(mark);
      cut(col, body, restBody);
      if (!restBody.children.length) { nextCol(); continue; }
      var n = rest.querySelector('.ex-n'); if (n) n.textContent = n.textContent.replace(/ ?\\(cont\\.\\)$/, '') + ' (cont.)';
      units.splice(i + 1, 0, rest);
      nextCol();
    }
  }
  // Cards: measure the tallest card at the column width, then give every card that height and
  // fit as many rows as the page takes. Each exercise's cards start on a new sheet.
  function cardPage(head) {
    var page = document.createElement('div');
    page.className = 'page cut-page';
    page.innerHTML = document.getElementById('band-cards').innerHTML + '<div class="cut-wrap"><div class="cut-head"><span class="scissors"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/></svg></span><span class="cut-ex"></span></div><div class="cut-grid"></div></div>' + document.getElementById('foot').innerHTML;
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
    // The worksheet, then the answer key, then the cards to cut out: always last, and not numbered.
    flow('u-main', 'band-main');
    flow('u-key', 'band-key');
    var sets = document.getElementById('cards').content.children;
    for (var si = 0; si < sets.length; si++) layoutCards(sets[si]);
    // The worksheet and the teacher's pages are numbered separately; the cut-outs are not numbered.
    var numbered = pagesEl.querySelectorAll('.page:not(.cut-page):not(.key-page)');
    for (var p = 0; p < numbered.length; p++) numbered[p].querySelector('.pn').textContent = (p + 1) + ' / ' + numbered.length;
    var keyPages = pagesEl.querySelectorAll('.key-page');
    for (var kp = 0; kp < keyPages.length; kp++) keyPages[kp].querySelector('.pn').textContent = 'Teacher ' + (kp + 1) + ' / ' + keyPages.length;
    var cutPages = pagesEl.querySelectorAll('.cut-page .pn');
    for (var q = 0; q < cutPages.length; q++) cutPages[q].style.display = 'none';
    var all = pagesEl.querySelectorAll('.page').length;
    var cutN = pagesEl.querySelectorAll('.cut-page').length;
    document.getElementById('status').textContent = numbered.length + (numbered.length === 1 ? ' page' : ' pages') + (keyPages.length ? ' + ' + keyPages.length + ' for the teacher' : '') + (cutN ? ' + ' + cutN + ' to cut out' : '');
    void all;
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

// The screen's text box styles, taken from the app's own style sheet (top-level rules only).
function rulesFor(css: string, keep: (sel: string) => boolean) {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let sel = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) sel = css.slice(start, i).trim();
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (!sel.startsWith('@') && !sel.includes('data-theme') && !sel.includes('-node') && keep(sel)) out.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (depth === 0 && ch === ';') start = i + 1;
  }
  return out.join('\n');
}
const BOX_CSS = `:root { --ink: #33302c; --muted: #696969; --soft: #868686; --faint: #9c9c9c; --hair: rgba(51,48,44,.12); --hair-strong: rgba(51,48,44,.2); --surface: #f4f4f3; --paper: #fff; --paper-soft: #fafaf8; --serif: Fraunces, Georgia, serif; --sans: Karla, Arial, sans-serif; }
.ws-box { break-inside: avoid; margin: 1.5mm 0 3mm; font-size: 10pt; } .ws-box .tbox { margin: 0; font-size: 10.5pt; line-height: 1.5; } .ws-box .tbox-body p { margin: 0 0 .8mm; } .ws-box .tbox { padding-top: 2.6mm; padding-bottom: 2.8mm; } .ws-box .tbox-body > :last-child { margin-bottom: 0; }
.ws-box .tbox { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${rulesFor(appCss, (s) => /\.tbox|paper-wrap/.test(s))}
.ws-box .tbox.s-info .tbox-body { font-size: 10.5pt; line-height: 1.5; }
.ws-box .tbox.s-message .bubble { font-family: var(--sans); font-size: 10pt; }
.ws-box .tbox.s-notebook { line-height: 1.65; } .ws-box .tbox.s-notebook .tbox-title { font-size: 1em; line-height: 1.65; }
.ws-box .paper-wrap { filter: drop-shadow(0 0 .6px rgba(51,48,44,.45)); } .ws-box .paper-wrap .tbox.s-paper { transform: none; }`;
function boxHtml(a: Record<string, unknown>, inner: string) {
  const attrs = { style: 'box', tone: 'grey', label: '', meta: '', side: 'left', symbol: '', numbering: 'none', ...a } as BoxAttrs;
  const html = renderToStaticMarkup(createElement(BoxFrame, { attrs: { ...attrs, numbering: attrs.numbering === 'lines' ? 'paras' : attrs.numbering }, children: createElement('span', { 'data-ws-slot': '' }) }));
  return `<div class="ws-box">${html.replace('<span data-ws-slot=""></span>', inner)}</div>`;
}
