import { ACTIVITY_LABELS, bingoCards, boardArt, boardLayout, boardStyleOf, spiralLayout, dominoTiles, plainText, shuffled, type ActivityConfig, type ActivityItem, type Participant } from './model';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
export type ActivityPrintPiece = { html: string; cutout: boolean; label: string };
export type ActivityPrintOptions = { cards?: number; seed?: number; renderItem?: (item: ActivityItem) => string; media?: Record<string, { data: string }> };
const source = (src: string, o: ActivityPrintOptions) => o.media?.[src]?.data ?? (/^(https?:|data:image\/)/.test(src) ? src : '');
const picture = (item: ActivityItem, o: ActivityPrintOptions) => {
  const src = item.picture && source(item.picture.src, o);
  return src ? `<img class="pa-picture" src="${esc(src)}" alt="${esc(item.picture?.alt)}" style="object-fit:${item.picture?.fit === 'contain' ? 'contain' : 'cover'};object-position:${esc(item.picture?.position || '50% 50%')}">` : '';
};
const text = (item: ActivityItem, o: ActivityPrintOptions) => o.renderItem?.(item) || esc(plainText(item.content) || item.title);
const useful = (value?: string) => value?.trim() ? `<div class="pa-useful"><b>Useful language</b>${value.split('\n').filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : '';
const card = (content: string, cls = '', label = '') => `<article class="cut-card ${cls}">${label ? `<span class="pa-label">${esc(label)}</span>` : ''}${content}</article>`;
const grid = (cards: string[], cols: number) => `<div class="pa-cut-grid" style="--pa-cols:${cols}">${cards.join('')}</div>`;
const section = (lead: string, html: string) => `<div class="pa-activity">${lead.trim() ? `<p class="pa-lead">${esc(lead)}</p>` : ''}${html}</div>`;
function dieNet() {
  const faces=[{x:30,y:5,n:2},{x:5,y:30,n:3},{x:30,y:30,n:1},{x:55,y:30,n:4},{x:30,y:55,n:5},{x:30,y:80,n:6}];
  const pips: Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  const tiles=faces.map(f=>`<rect x="${f.x}" y="${f.y}" width="25" height="25" fill="white" stroke="#555" stroke-dasharray="1 1"/>${pips[f.n].map(p=>`<circle cx="${f.x+6+(p%3)*6.5}" cy="${f.y+6+Math.floor(p/3)*6.5}" r="1.8" fill="#222"/>`).join('')}`).join('');
  const tabs=['30,5 34,1 51,1 55,5','5,30 1,34 1,51 5,55','5,30 9,26 26,26 30,30','55,30 59,26 76,26 80,30','80,30 84,34 84,51 80,55','30,55 26,59 26,76 30,80','55,55 59,59 59,76 55,80','30,80 26,84 26,101 30,105','55,80 59,84 59,101 55,105','30,105 34,109 51,109 55,105'];
  return `<div class="pa-die"><h3>A die to make</h3><p>Cut around the outside. Fold the dotted lines. Glue the tabs inside.</p><svg role="img" aria-label="A net for a six-sided die, with glue tabs" viewBox="0 0 86 111" style="width:86mm;height:111mm">${tabs.map(points=>`<polygon points="${points}" fill="#eee" stroke="#555" stroke-width=".3"/>`).join('')}${tiles}</svg></div>`;
}
function chunks<T>(items: T[], size: number): T[][] { return Array.from({ length: Math.ceil(items.length / size) }, (_, n) => items.slice(n * size, (n + 1) * size)); }
export function printActivity(c: ActivityConfig, o: ActivityPrintOptions = {}): ActivityPrintPiece[] {
  let seed = o.seed ?? 8191;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const piece = (html: string, label: string, cutout = false): ActivityPrintPiece => ({ html: section(c.instruction, html), label, cutout });
  const itemCards = (items: ActivityItem[], cls: string, perPage: number, cols: number, render: (item: ActivityItem, n: number) => string) => chunks(items.map((item, n) => card(render(item, n), cls)), perPage).map(cards => piece(grid(cards, cols), ACTIVITY_LABELS[c.kind], true));
  switch (c.kind) {
    case 'board': {
      const style = boardStyleOf(c.settings.boardStyle);
      const { cols, rows, cells } = boardLayout(c.items.length, style);
      const spiral = style === 'spiral' ? spiralLayout(c.items.length) : null;
      const art = boardArt(c.items.length, style);
      const at = (n: number) => spiral ? `left:${((spiral.points[n].x - spiral.size / 2) * 100).toFixed(2)}%;top:${((spiral.points[n].y - spiral.size / 2) * 100).toFixed(2)}%;width:${(spiral.size * 100).toFixed(2)}%;height:${(spiral.size * 100).toFixed(2)}%` : `grid-row:${cells[n].row};grid-column:${cells[n].col}`;
      const board = `<div class="pa-board pa-board-${style}" style="${spiral ? `--t:${spiral.size.toFixed(3)}` : `grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},${rows <= 5 ? '27mm' : rows === 6 ? '23mm' : '19mm'})`};--pa-board-font:${c.items.length > 36 ? '8' : '9.2'}pt">${style === 'spiral' ? `<div class="pa-board-art">${art}</div>` : ''}${c.items.map((item, n) => `<div class="pa-sq ${item.special ? 'special' : ''} ${esc(item.special || '')}" style="${at(n)}"><b class="n">${n + 1}</b>${picture(item, o)}<span>${esc(item.special === 'start' ? 'Start' : item.special === 'finish' ? 'Finish' : item.title || plainText(item.content))}</span></div>`).join('')}${style === 'ladders' ? `<div class="pa-board-art">${art}</div>` : ''}</div>`;
      // No cut-out counters: learners use a coin or a rubber.
      return [piece(board, 'Board game'), ...(c.settings.printDie ? [piece(dieNet(),'Die net',true)] : [])];
    }
    case 'bingo': {
      const count = Math.max(1, Math.min(100, o.cards ?? c.settings.printCards ?? 12));
      const people: Participant[] = Array.from({ length: count }, (_, n) => ({ id: String(n), name: `Card ${n + 1}` }));
      const cards = bingoCards(c, people, random), size = c.settings.gridSize ?? 4;
      // As many cards on a page as stay readable: small grids and short words fit more.
      const longest = Math.max(0, ...c.items.map(item => (item.title || plainText(item.content)).length));
      const pictures = c.items.some(item => item.picture?.src);
      const perCol = size === 3 ? 3 : 2;
      const perPage = size === 3 ? (pictures || longest > 18 ? 6 : 9) : size === 4 ? (pictures || longest > 22 ? 4 : 6) : (longest > 14 || pictures ? 2 : 4);
      const pages = chunks(people.map(p => card(`<div class="pa-bingo-head"><b>Bingo</b><span>${esc(p.name)}</span></div><div class="pa-bingo-grid" style="grid-template-columns:repeat(${size},1fr)">${cards[p.id].map(id => { const item = c.items.find(i => i.id === id); return `<span>${id === '__free__' ? 'Free' : item ? picture(item, o) + esc(item.title) : ''}</span>`; }).join('')}</div>`, 'pa-bingo')), perPage).map(group => piece(grid(group, perCol), 'Bingo cards', true));
      const calls = shuffled(c.items, random).map(item => card(`${picture(item, o)}<span>${text(item, o)}</span>${item.call?.trim() && item.call !== (plainText(item.content) || item.title) ? `<small>${esc(item.call)}</small>` : ''}`, 'pa-caller-strip'));
      return [...pages, ...chunks(calls, 24).map(group => piece(grid(group, 2), 'Caller strips', true))];
    }
    case 'dominoes': {
      const tiles = shuffled(dominoTiles(c.items), random);
      return chunks(tiles, 12).map(group => piece(grid(group.map(tile => card(`<span>${picture({id:tile.id,title:tile.left,picture:tile.leftPicture},o)}${esc(tile.left)}</span><span>${picture({id:tile.id,title:tile.right,picture:tile.rightPicture},o)}${esc(tile.right)}</span>`, 'pa-dom')), 2), 'Dominoes', true));
    }
    case 'memory': {
      const halves = shuffled(c.items.flatMap(item => [{ item, side: 'a' }, { item, side: 'b' }]), random);
      return chunks(halves, 16).map(group => piece(grid(group.map(({ item, side }) => card(side === 'a' ? picture(item, o) + esc(item.title) : picture({...item,picture:item.matchPicture},o) + esc(item.match), 'pa-memory')), 4), 'Pelmanism cards', true));
    }
    case 'strips':
      return chunks(shuffled(c.items, random), 10).map(group => piece(grid(group.map(item => card(`${picture(item, o)}<span>${text(item, o)}</span>`, 'pa-strip')), 1), 'Story strips', true));
    case 'cue':
      return itemCards(c.items, 'pa-cue', 4, 2, item => `<span class="pa-role">${esc(item.cardType === 'secret' ? 'Secret objective' : item.cardType || 'Character')}</span><h3>${esc(item.title)}</h3>${picture(item, o)}<div>${text(item, o)}</div>${useful(item.useful || c.settings.useful)}`);
    case 'taboo':
      return itemCards(c.items, 'pa-taboo', 8, 2, item => `<h3>${esc(item.title)}</h3>${picture(item, o)}<div class="pa-taboo-words"><span class="pa-label">Do not say</span>${(item.taboo ?? []).map(word => `<span>${esc(word)}</span>`).join('')}</div>`);
    case 'speaking':
      return itemCards(c.items, 'pa-cue', 4, 2, item => `<span class="pa-label">${c.settings.seconds ?? 60} seconds</span><div>${picture(item, o)}${text(item, o)}</div>${useful(c.settings.useful)}<p class="pa-listener"><b>Listener:</b> ${esc(c.settings.listenerTask || 'Ask one follow-up question.')}</p>`);
    case 'findSomeone':
      return [piece(`<table class="pa-fsw" style="--pa-row-height:${c.items.length > 10 ? '9' : '15.5'}mm"><thead><tr><th>Find someone who…</th><th>Name</th>${c.settings.showFollowUp ? '<th>One extra detail</th>' : ''}</tr></thead><tbody>${c.items.map(item => `<tr><td>${picture(item, o)}${esc(item.title)}${item.question ? `<small>${esc(item.question)}</small>` : ''}</td><td><span class="pa-answer-line"></span></td>${c.settings.showFollowUp ? '<td><span class="pa-answer-line"></span></td>' : ''}</tr>`).join('')}</tbody></table><p class="pa-soft">${c.settings.nameOnce ? 'Use each name once.' : 'You may use a name more than once.'}</p>${useful(c.settings.useful)}`, 'Find someone who')];
    case 'survey':
      return c.items.map(item => piece(`<h3>${picture(item,o)}${esc(item.title)}</h3><div class="pa-row"><div class="pa-grow"><table class="pa-tally"><thead><tr><th>Answer</th><th>Tally</th><th>Total</th></tr></thead><tbody>${(item.options ?? []).map(option => `<tr><td>${esc(option)}</td><td></td><td></td></tr>`).join('')}</tbody></table></div><div class="pa-grow"><div class="pa-chart" style="--pa-bars:${item.options?.length ?? 2}">${(item.options ?? []).map(option => `<div><span class="pa-blank-bar"></span><small>${esc(option)}</small></div>`).join('')}</div></div></div><p>Describe your results.</p><div class="pa-summary-lines"><span></span><span></span><span></span></div>`, 'Survey chart'));
    case 'ranking': {
      const template = c.settings.layout === 'diamond' ? `<div class="pa-diamond">${[1, 2, 3, 2, 1].map((length, row) => `<div>${Array.from({ length }, (_, n) => `<span>${[0, 1, 3, 6, 8][row] + n + 1}</span>`).join('')}</div>`).join('')}</div>` : `<ol class="pa-ranking-list">${c.items.map(() => '<li><span></span></li>').join('')}</ol>`;
      return [piece(template + useful(c.settings.useful), 'Ranking template'), ...itemCards(shuffled(c.items, random), 'pa-ranking-card', 12, 3, item => picture(item, o) + esc(item.title))];
    }
    case 'opinion':
      return [piece(c.items.map(item => `<div class="pa-opinion"><p>${picture(item, o)}${esc(item.title)}</p><div class="pa-opinion-line">${Array.from({ length: 5 }, () => '<i></i>').join('')}</div><div class="pa-opinion-labels"><span>${esc(c.settings.lowLabel || 'Strongly disagree')}</span><span>${esc(c.settings.highLabel || 'Strongly agree')}</span></div><p>Because <span class="pa-answer-line"></span></p></div>`).join(''), 'Opinion line')];
    case 'spot': {
      const versions = c.settings.versions ?? [];
      // Images are measured by the existing worksheet paginator. Each labelled half is indivisible.
      return [piece(`<div class="pa-versions">${versions.map((v, n) => `<section class="pa-version"><span class="pa-role"><b>${String.fromCharCode(65 + n)}</b>${esc(v.name)}</span><div class="pa-version-frame"><img class="pa-version-picture" src="${esc(source(v.picture.src, o))}" alt="${esc(v.picture.alt)}" style="width:100%;height:100%;max-width:none;max-height:none;margin:0;object-fit:${v.picture.fit === 'contain' ? 'contain' : 'cover'};object-position:${esc(v.picture.position || '50% 50%')}"></div><p>Describe your picture. Keep it hidden from your partner.</p></section>`).join('')}</div>`, 'Spot the difference', true)];
    }
  }
}
