import type { JSONContent } from '@tiptap/react';

export const ACTIVITY_KINDS = ['board', 'bingo', 'dominoes', 'memory', 'strips', 'cue', 'survey', 'findSomeone', 'ranking', 'opinion', 'spot', 'taboo', 'speaking'] as const;
export type ActivityKind = typeof ACTIVITY_KINDS[number];
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  board: 'Board game', bingo: 'Bingo', dominoes: 'Dominoes', memory: 'Pelmanism', strips: 'Strip story', cue: 'Cue cards',
  survey: 'Survey', findSomeone: 'Find someone who', ranking: 'Ranking', opinion: 'Opinion line', spot: 'Spot the difference', taboo: 'Taboo cards', speaking: 'Timer',
};
export type ActivityPicture = { src: string; alt: string; fit?: 'cover' | 'contain'; position?: string; bw?: string }; // bw: a black-and-white version for black-and-white prints
export type ActivityItem = {
  id: string; title: string; content?: JSONContent[]; picture?: ActivityPicture; matchPicture?: ActivityPicture;
  dominoRight?: {text:string;picture?:ActivityPicture}; match?: string; call?: string; useful?: string; taboo?: string[];
  cardType?: 'character' | 'secret' | 'opinion' | 'problem';
  special?: 'start' | 'finish' | 'back' | 'miss' | 'again'; move?: number;
  question?: string; followUp?: string; options?: string[];
};
export type Difference = { id: string; x: number; y: number; radius: number; label: string };
// Colours for the activity's game pieces. 'class' follows the class colour, as before.
export type ActivityColours = 'class' | 'coral' | 'ocean' | 'forest' | 'plum' | 'sunshine' | 'slate';
export const ACTIVITY_COLOURS: { v: ActivityColours; label: string }[] = [
  { v: 'class', label: 'Class colour' }, { v: 'coral', label: 'Coral' }, { v: 'ocean', label: 'Ocean' }, { v: 'forest', label: 'Forest' },
  { v: 'plum', label: 'Plum' }, { v: 'sunshine', label: 'Sunshine' }, { v: 'slate', label: 'Slate' },
];
export type ActivitySettings = {
  randomColours?: boolean; // bingo: each card in its own colour
  mode: 'class' | 'groups' | 'individual'; teamScoring?: boolean; teamNames?: Record<string,string>; turnOrderIds?: string[]; boardStyle?: 'snake' | 'spiral' | 'ladders'; turnOrder?: 'fixed' | 'random';
  gridSize?: 3 | 4 | 5; freeCentre?: boolean; winRule?: 'line' | 'twoLines' | 'full'; showCalls?: boolean;
  learnerCalls?: 'none' | 'current' | 'list';
  seconds?: number; timerDirection?: 'down' | 'up'; timerFor?: 'class' | 'individual' | 'group'; timerSize?: 'large' | 'inline'; pinsVisible?: 'reveal' | 'after' | 'always'; pinMove?: boolean; colours?: ActivityColours; scoring?: boolean; useful?: string; listenerTask?: string;
  nameOnce?: boolean; showFollowUp?: boolean; layout?: 'list' | 'grid' | 'diamond';
  noCorrectAnswer?: boolean; showNames?: boolean; lowLabel?: string; highLabel?: string; askReason?: boolean;
  versions?: { name: string; picture: ActivityPicture }[]; differences?: Difference[]; printCards?: number; printDie?: boolean;
};
export type ActivityConfig = { id: string; kind: ActivityKind; instruction: string; items: ActivityItem[]; settings: ActivitySettings };
export type Participant = { id: string; name: string; teamId?: string };
export type ActivityIssue = { field: string; message: string };

export function validateActivity(c: ActivityConfig): ActivityIssue[] {
  const out: ActivityIssue[] = [];
  const issue = (field: string, message: string) => out.push({ field, message });
  if (!c.id) issue('id', 'Save the activity before starting.');
  // Teachers write their own instruction. It can be left blank.
  if (new Set(c.items.map(i => i.id)).size !== c.items.length || c.items.some(i => !i.id)) issue('items', 'Give each item its own identifier.');
  c.items.forEach((i, n) => {
    const hasRichPicture=(nodes:JSONContent[]=[]):boolean=>nodes.some(n=>(['picture','image'].includes(n.type??'')&&!!n.attrs?.src)||hasRichPicture(n.content));
    if (c.kind !== 'speaking' && !i.title.trim() && !plainText(i.content) && !hasRichPicture(i.content) && !i.picture?.src) issue(`items.${n}`, `Add text or a picture to item ${n + 1}.`);
    if (i.matchPicture?.src && !i.matchPicture.alt.trim()) issue(`items.${n}.matchPicture`, `Describe the matching picture in pair ${n + 1}.`);
    if (i.picture?.src && !i.picture.alt.trim()) issue(`items.${n}.picture`, `Describe the picture in item ${n + 1}.`);
  });
  if (c.settings.printCards !== undefined && (!Number.isInteger(c.settings.printCards) || c.settings.printCards < 1 || c.settings.printCards > 100)) issue('printCards','Choose between 1 and 100 printed cards.');
  if (c.kind === 'board') c.items.forEach((item,n)=>{if(item.special==='back'&&(!Number.isInteger(item.move??2)||(item.move??2)<1||(item.move??2)>48))issue(`items.${n}.move`,'Choose between 1 and 48 squares to move back.');});
  if (c.kind === 'board' && (c.items.length < 12 || c.items.length > 48)) issue('items', 'Use between 12 and 48 squares.');
  if (c.kind === 'bingo') {
    const size = c.settings.gridSize ?? 4;
    if (![3,4,5].includes(size)) issue('gridSize','Choose a 3 × 3, 4 × 4 or 5 × 5 card.');
    if (c.items.length <= size * size) issue('items', `A ${size} × ${size} card needs at least ${size * size + 1} items, so every learner gets a different card. You have ${c.items.length}.`);
    if (c.settings.freeCentre && size === 4) issue('freeCentre', 'Use a 3 × 3 or 5 × 5 card for a free centre.');
  }
  if (['dominoes', 'memory'].includes(c.kind)) {
    if (c.items.length < 2) issue('items', 'Add at least two matching pairs.');
    c.items.forEach((i, n) => { if (!i.match?.trim() && !i.matchPicture?.src) issue(`items.${n}.match`, `Pair ${n + 1} needs its other half. Add the word or picture it matches under “Pairs”.`); });
  }
  if (c.kind === 'strips' && c.items.length < 2) issue('items', 'Add at least two strips in their correct order.');
  if (c.kind === 'ranking') {
    if (c.items.length < 4 || c.items.length > 12) issue('items', 'Use between 4 and 12 items.');
    if (c.settings.layout === 'diamond' && c.items.length !== 9) issue('layout', 'Diamond 9 needs exactly nine items.');
  }
  if (c.kind === 'findSomeone' && (c.items.length < 6 || c.items.length > 16)) issue('items', 'Use between 6 and 16 prompts.');
  if (['cue', 'taboo', 'survey', 'opinion'].includes(c.kind) && !c.items.length) issue('items', 'Add at least one item.');
  if (c.kind === 'taboo') c.items.forEach((i, n) => { if ((i.taboo?.length ?? 0) > 5) issue(`items.${n}.taboo`, 'Use up to five taboo words.'); });
  if (c.kind === 'survey') c.items.forEach((i, n) => { if ((i.options?.length ?? 0) < 2 || i.options?.some(x=>!x.trim()) || new Set(i.options?.map(x=>x.trim())).size!==i.options?.length) issue(`items.${n}.options`, `Add at least two different answers to question ${n + 1}, without blank lines.`); });
  if (c.kind === 'taboo' && (!Number.isInteger(c.settings.seconds ?? 60) || (c.settings.seconds ?? 60) < 15 || (c.settings.seconds ?? 60) > 180)) issue('seconds','Choose a turn from 15 seconds to 3 minutes.');
  if (c.kind === 'speaking' && c.settings.timerDirection !== 'up' && (!Number.isFinite(c.settings.seconds ?? 60) || (c.settings.seconds ?? 60) < 5 || (c.settings.seconds ?? 60) > 3600)) issue('seconds', 'Choose a time from 5 seconds to 60 minutes.');
  if (c.kind === 'spot') {
    if (c.settings.versions?.length !== 2 || c.settings.versions.some(v => !v.name.trim() || !v.picture.src)) issue('versions', 'Add and name both pictures.');
    if (!c.settings.differences?.length) issue('differences', 'Mark at least one difference on picture B.');
    if (c.settings.differences?.some(d => !Number.isFinite(d.x) || !Number.isFinite(d.y) || d.x < 0 || d.x > 100 || d.y < 0 || d.y > 100 || !(d.radius > 0))) issue('differences', 'Keep every difference inside the picture.');
  }
  return out;
}

export function plainText(nodes: JSONContent[] = []): string {
  return nodes.map(n => n.text ?? plainText(n.content)).join(' ').replace(/\s+/g, ' ').trim();
}

// Difference regions are coordinates in the displayed frame, not the source file.
export function sameActivityPictureFrame(a?: ActivityPicture | null, b?: ActivityPicture | null): boolean {
  return (a?.src ?? '') === (b?.src ?? '') && (a?.fit ?? 'cover') === (b?.fit ?? 'cover') && (a?.position ?? '50% 50%') === (b?.position ?? '50% 50%');
}

// Keep the existing rich pickCard content. Activities add settings around that same card structure.
export function configFromNode(node: JSONContent): ActivityConfig {
  const attrs = node.attrs ?? {};
  const kind = ACTIVITY_KINDS.includes(attrs.kind) ? attrs.kind as ActivityKind : 'cue';
  const config: ActivityConfig = {
    id: String(attrs.id ?? ''), kind, instruction: String(attrs.instruction ?? ''),
    settings: { mode: 'class', ...(['ranking', 'opinion', 'cue', 'findSomeone', 'survey', 'speaking'].includes(kind) ? { noCorrectAnswer: true } : {}), ...attrs.settings },
    items: (node.content ?? []).map((card, n) => ({
      ...card.attrs, id: String(card.attrs?.activityItemId ?? `${attrs.id}:${n}`), title: String(card.attrs?.title || plainText(card.content)), content: card.content, // an empty title falls back to the card's text
    })),
  };
  if (kind === 'spot' && (config.items.length || !config.settings.versions?.length)) {
    const previous = config.settings.versions;
    const versions = config.items.slice(0, 2).map((i, n) => ({ name: i.title || `Learner ${String.fromCharCode(65 + n)}`, picture: i.picture ?? { src: '', alt: '' } }));
    // Item-backed activities own their current pictures. Saved versions can be a
    // snapshot from before a teacher replaced or removed one of those pictures.
    if (previous?.length && (previous.length !== versions.length || versions.some((version, n) => !sameActivityPictureFrame(version.picture, previous[n]?.picture)))) config.settings.differences = [];
    config.settings.versions = versions;
  }
  return config;
}

export function parseItemList(text: string): { title: string; match?: string }[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const at = line.includes('\t') ? line.indexOf('\t') : line.indexOf(' = ');
    const sep = line.includes('\t') ? 1 : 3;
    return at < 0 ? { title: line } : { title: line.slice(0, at).trim(), match: line.slice(at + sep).trim() };
  });
}

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1))); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function bingoCards(c: ActivityConfig, people: readonly Participant[], random: () => number = Math.random): Record<string, string[]> {
  const size = c.settings.gridSize ?? 4, count = size * size;
  if (c.items.length <= count) throw new Error(`Bingo needs more than ${count} items.`);
  if (people.length > 500) throw new Error('Use no more than 500 Bingo cards in one set.');
  const used = new Set<string>(), cards: Record<string, string[]> = {};
  for (const person of people) {
    let card: string[] = [], signature = '';
    for (let attempt = 0; attempt < 1000; attempt++) {
      card = shuffled(c.items.map(i => i.id), random).slice(0, count);
      if (c.settings.freeCentre && size % 2) card[Math.floor(count / 2)] = '__free__';
      signature = card.join('\u0000');
      if (!used.has(signature)) break;
      if (attempt === 999) throw new Error('Could not make different cards. Shuffle the cards again.');
    }
    used.add(signature); cards[person.id] = card;
  }
  return cards;
}

export function bingoClaim(card: readonly string[], marked: readonly string[], called: readonly string[], size: number, rule: ActivitySettings['winRule']): { valid: boolean; lines: number; uncalled: string[] } {
  const calls = new Set(called), marks = new Set(marked);
  const uncalled = [...marks].filter(id => id !== '__free__' && (!calls.has(id) || !card.includes(id)));
  const on = (n: number) => card[n] === '__free__' || (marks.has(card[n]) && calls.has(card[n]));
  let lines = 0;
  for (let row = 0; row < size; row++) if (Array.from({ length: size }, (_, col) => on(row * size + col)).every(Boolean)) lines++;
  for (let col = 0; col < size; col++) if (Array.from({ length: size }, (_, row) => on(row * size + col)).every(Boolean)) lines++;
  if (Array.from({ length: size }, (_, n) => on(n * size + n)).every(Boolean)) lines++;
  if (Array.from({ length: size }, (_, n) => on(n * size + size - n - 1)).every(Boolean)) lines++;
  return { valid: !uncalled.length && (rule === 'full' ? card.every((_, n) => on(n)) : lines >= (rule === 'twoLines' ? 2 : 1)), lines, uncalled };
}

// A tile is the end of one pair, then the start of the next pair, so the join between two tiles reads as
// the pair ("catch | a train"). The chain is a closed loop.
export function dominoTiles(items: readonly ActivityItem[]) {
  return items.map((item, n) => ({ id: item.id, left: item.match ?? '', leftPicture: item.matchPicture, rightPicture: items[(n + 1) % items.length]?.picture, right: items[(n + 1) % items.length]?.title ?? '', leftPair: item.id, rightPair: items[(n + 1) % items.length]?.id ?? '' }));
}
export function checkDominoes(items: readonly ActivityItem[], order: readonly string[]): boolean {
  if (order.length !== items.length || new Set(order).size !== items.length) return false;
  const tiles = new Map(dominoTiles(items).map(t => [t.id, t]));
  return order.every((id, n) => !!tiles.get(id) && (n === 0 || tiles.get(order[n - 1])!.rightPair === tiles.get(id)!.leftPair));
}

export function oppositePairs(values: readonly { id: string; value: number }[]): string[][] {
  const a = [...values].sort((x, y) => x.value - y.value || x.id.localeCompare(y.id)), pairs: string[][] = [];
  while (a.length > 1) pairs.push([a.shift()!.id, a.pop()!.id]);
  if (a.length) { if (pairs.length) pairs[pairs.length - 1].push(a[0].id); else pairs.push([a[0].id]); }
  return pairs;
}

// One layout for the live board and its printed counterpart. Coordinates are
// one-based CSS grid lines; the spiral remains contiguous for partial rows.
export function boardLayout(count: number, style: ActivitySettings['boardStyle'] = 'snake') {
  // The spiral is a landscape board (about 3:2); the others are about square.
  const cols = style === 'spiral' ? Math.ceil(Math.sqrt(count * 1.5)) : Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / cols);
  const cells: { row: number; col: number }[] = [];
  if (style === 'spiral') {
    let left = 1, right = cols, top = 1, bottom = rows;
    while (left <= right && top <= bottom) {
      for (let col = left; col <= right; col++) cells.push({ row: top, col });
      top++;
      for (let row = top; row <= bottom; row++) cells.push({ row, col: right });
      right--;
      if (top <= bottom) { for (let col = right; col >= left; col--) cells.push({ row: bottom, col }); bottom--; }
      if (left <= right) { for (let row = bottom; row >= top; row--) cells.push({ row, col: left }); left++; }
    }
  } else for (let n = 0; n < count; n++) {
    const row = Math.floor(n / cols), col = n % cols;
    cells.push({ row: rows - row, col: row % 2 === 0 ? col + 1 : cols - col });
  }
  return { cols, rows, cells: cells.slice(0, count) };
}

// Board styles. Old boards saved as 'path' (a grid read left to right) now show as the winding path.
export type BoardStyle = 'snake' | 'spiral' | 'ladders';
export const boardStyleOf = (style?: string): BoardStyle => style === 'spiral' || style === 'ladders' ? style : 'snake';

// Snakes and ladders: the same fixed jumps for every board of this size, so the board, the print and the
// server agree. Square numbers are 0-based. Ladders go up about one row and a bit; snakes come down.
export function boardJumps(count: number): Record<number, number> {
  const { cols, cells } = boardLayout(count, 'snake'), jumps: Record<number, number> = {}, used = new Set([0, count - 1]);
  const pairs = count < 20 ? 1 : count < 36 ? 2 : 3;
  const at = (row: number, col: number) => cells.findIndex(c => c.row === row && c.col === Math.max(1, Math.min(cols, col)));
  const free = (n: number, dir: number) => { while (used.has(n) && n > 0 && n < count - 1) n += dir; return n; };
  const add = (from: number, to: number) => { if (from > 0 && from < count - 1 && to > 0 && to < count - 1 && Math.abs(to - from) >= cols - 1 && !used.has(from) && !used.has(to)) { jumps[from] = to; used.add(from); used.add(to); } };
  // Ladders climb one or two rows, leaning a column; snakes slide down one or two rows the other way.
  [.12, .45, .7].slice(0, pairs).forEach((f, k) => { const from = free(Math.max(1, Math.round(f * (count - 1))), 1), c = cells[from]; if (c) add(from, at(c.row - 1 - k % 2, c.col + (k % 2 ? 1 : -1))); });
  [.58, .88, .32].slice(0, pairs).forEach((f, k) => { const from = free(Math.min(count - 2, Math.round(f * (count - 1))), -1), c = cells[from]; if (c) add(from, at(c.row + 1 + (k + 1) % 2, c.col + (k % 2 ? -1 : 1))); });
  return jumps;
}

// The drawing for the board: the spiral track, or the snakes and ladders. Spaces and lines are drawn here;
// the words sit on top in the page's own text.
export function boardArt(count: number, style?: string): string {
  const kind = boardStyleOf(style);
  if (kind === 'spiral') {
    // One continuous track through the spaces in spiral order. Each ring is one space wide, with a thin gap
    // between rings so the spiral shows; corners are rounded; Start and Finish are filled in the accent.
    const { cols, rows, cells } = boardLayout(count, 'spiral'), n = cells.length;
    const c = cells.map(p => ({ x: p.col - .5, y: p.row - .5 }));
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // The two ends stop just inside their space, so their rounded caps stay on the board.
    const back = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (a.x - b.x) * .02, y: a.y + (a.y - b.y) * .02 });
    const pt = (p: { x: number; y: number }) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    const first = n > 1 ? back(c[0], c[1]) : c[0], last = n > 1 ? back(c[n - 1], c[n - 2]) : c[0];
    const edge = `<polyline class="sp-edge" points="${[first, ...c, last].map(pt).join(' ')}" stroke-width=".845"/>`;
    const kind = (i: number) => i === 0 ? 'start' : i === n - 1 ? 'finish' : i % 2 ? 'even' : 'odd';
    const spaces = c.map((p, i) => `<polyline class="sp-cell ${kind(i)}" points="${[i ? mid(c[i - 1], p) : p, p, i < n - 1 ? mid(p, c[i + 1]) : p].map(pt).join(' ')}" stroke-width=".8"/>`).join('');
    // Start and Finish have rounded outer ends.
    const caps = n > 1 ? `<polyline class="sp-cell sp-cap start" points="${pt(c[0])} ${pt(first)}" stroke-width=".8"/><polyline class="sp-cell sp-cap finish" points="${pt(c[n - 1])} ${pt(last)}" stroke-width=".8"/>` : '';
    const lines = c.slice(1).map((p, i) => { const m = mid(c[i], p), dx = Math.sign(p.x - c[i].x), dy = Math.sign(p.y - c[i].y); return `<line class="sp-div" x1="${(m.x - dy * .4).toFixed(3)}" y1="${(m.y + dx * .4).toFixed(3)}" x2="${(m.x + dy * .4).toFixed(3)}" y2="${(m.y - dx * .4).toFixed(3)}"/>`; }).join('');
    return `<svg class="board-art board-art-spiral" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" aria-hidden="true">${edge}${spaces}${caps}${lines}</svg>`;
  }
  if (kind !== 'ladders') return '';
  const { cols, rows, cells } = boardLayout(count, 'snake');
  const at = (n: number) => ({ x: cells[n].col - .5, y: cells[n].row - .5 });
  let ladders = '', snakes = '';
  for (const [a, b] of Object.entries(boardJumps(count))) {
    const from = at(Number(a)), to = at(b), dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    if (b > Number(a)) {
      // a ladder: two rails and evenly spaced rungs, drawn as outlined bars like a printed board
      const w = .15, x0 = from.x - ux * .25, y0 = from.y - uy * .25, x1 = to.x + ux * .25, y1 = to.y + uy * .25, l = len + .5, steps = Math.max(3, Math.round(l / .24));
      const bar = (ax: number, ay: number, bx: number, by: number) => `<line class="lad-out" x1="${ax.toFixed(3)}" y1="${ay.toFixed(3)}" x2="${bx.toFixed(3)}" y2="${by.toFixed(3)}"/><line class="lad-in" x1="${ax.toFixed(3)}" y1="${ay.toFixed(3)}" x2="${bx.toFixed(3)}" y2="${by.toFixed(3)}"/>`;
      let rungs = ''; for (let i = 1; i < steps; i++) { const k = i / steps, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k; rungs += bar(x - nx * w, y - ny * w, x + nx * w, y + ny * w); }
      ladders += `<g class="ladder">${rungs}${[-1, 1].map(sd => bar(x0 + nx * w * sd, y0 + ny * w * sd, x1 + nx * w * sd, y1 + ny * w * sd)).join('')}</g>`;
    } else {
      // a snake: a tapering body with a pattern down its back, a head with eyes and a forked tongue
      const N = 48, waves = Math.max(1.2, len * .9), spine: { x: number; y: number }[] = [];
      for (let i = 0; i <= N; i++) { const k = i / N, o = (.22 * Math.sin(Math.PI * Math.min(1, k * 1.15))) * Math.sin(k * waves * 2 * Math.PI); spine.push({ x: from.x + dx * k + nx * o, y: from.y + dy * k + ny * o }); }
      const left: string[] = [], right: string[] = [];
      spine.forEach((p, i) => { const q = spine[Math.min(N, i + 1)], o = spine[Math.max(0, i - 1)], tx = q.x - o.x, ty = q.y - o.y, tl = Math.hypot(tx, ty) || 1, half = .095 * (1 - i / N) + .006; left.push(`${(p.x - ty / tl * half).toFixed(3)} ${(p.y + tx / tl * half).toFixed(3)}`); right.unshift(`${(p.x + ty / tl * half).toFixed(3)} ${(p.y - tx / tl * half).toFixed(3)}`); });
      const hx = spine[0].x, hy = spine[0].y, fx = spine[0].x - spine[2].x, fy = spine[0].y - spine[2].y, fl = Math.hypot(fx, fy) || 1, ang = Math.atan2(fy, fx) * 180 / Math.PI;
      snakes += `<g class="snake"><polygon class="sn-body" points="${left.concat(right).join(' ')}"/><polyline class="sn-back" points="${spine.slice(2, N - 4).map(p => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')}"/><path class="sn-tongue" d="M${(hx + fx / fl * .14).toFixed(3)} ${(hy + fy / fl * .14).toFixed(3)} l${(fx / fl * .1).toFixed(3)} ${(fy / fl * .1).toFixed(3)} m0 0 l${(fx / fl * .04 - fy / fl * .03).toFixed(3)} ${(fy / fl * .04 + fx / fl * .03).toFixed(3)} m${(-fx / fl * .04 + fy / fl * .03).toFixed(3)} ${(-fy / fl * .04 - fx / fl * .03).toFixed(3)} l${(fx / fl * .04 + fy / fl * .03).toFixed(3)} ${(fy / fl * .04 - fx / fl * .03).toFixed(3)}"/><ellipse class="sn-head" cx="${hx.toFixed(3)}" cy="${hy.toFixed(3)}" rx=".15" ry=".11" transform="rotate(${ang.toFixed(1)} ${hx.toFixed(3)} ${hy.toFixed(3)})"/><circle class="sn-eye" cx="${(hx + fx / fl * .05 - fy / fl * .055).toFixed(3)}" cy="${(hy + fy / fl * .05 + fx / fl * .055).toFixed(3)}" r=".022"/><circle class="sn-eye" cx="${(hx + fx / fl * .05 + fy / fl * .055).toFixed(3)}" cy="${(hy + fy / fl * .05 - fx / fl * .055).toFixed(3)}" r=".022"/></g>`;
    }
  }
  return `<svg class="board-art board-art-ladders" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" aria-hidden="true">${snakes}${ladders}</svg>`;
}
