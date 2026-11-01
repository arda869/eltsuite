// Question pack 1: block questions that share one editor node ("pq", with a kind).
// Each kind says how its editor data splits into what learners see plus an answer key,
// how the two merge back for editing, how an answer is scored and how it is shown in the
// live grid. Learners never receive the answers before checking.

export type PackKind = 'fix' | 'categorise' | 'transform' | 'highlight' | 'sentences' | 'label' | 'odd' | 'gapped' | 'matching' | 'speaking' | 'dictation' | 'pairs' | 'crossword' | 'wordsearch';
export const PACK_SCORED: PackKind[] = ['fix', 'categorise', 'transform', 'highlight', 'sentences', 'label', 'odd', 'gapped', 'matching', 'dictation', 'pairs', 'crossword', 'wordsearch'];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = Record<string, any>;
export type PackKey = { kind: 'pack'; t: PackKind; k: Data; feedback?: string; hint?: string };

// Seeded shuffle (same as questions.ts) so the order is stable for a question.
function shuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Never leave a list in its original order when it has more than one item.
  if (a.length > 1 && a.every((x, i) => x === list[i])) a.push(a.shift()!);
  return a;
}
const norm = (s: string) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’‚‛′`´ʼʹ＇]/g, "'")
    .replace(/[“”„‟″«»＂]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
const words = (s: string) => String(s ?? '').trim().split(/\s+/).filter(Boolean);
const clean = (l: unknown) => (Array.isArray(l) ? l.map((x) => String(x ?? '').trim()).filter(Boolean) : []);

// Text with {{targets}} into words, marking which words belong to which target.
export function tokenise(text: string) {
  const toks: string[] = [];
  const groups: number[][] = [];
  const re = /\{\{([^}]*)\}\}/g;
  let last = 0;
  const push = (s: string) => words(s).forEach((w) => toks.push(w));
  for (const m of text.matchAll(re)) {
    push(text.slice(last, m.index));
    const g: number[] = [];
    words(m[1]).forEach((w) => (g.push(toks.length), toks.push(w)));
    if (g.length) groups.push(g);
    last = m.index! + m[0].length;
  }
  push(text.slice(last));
  return { toks, groups };
}

export const PACK_LABELS: Record<PackKind, string> = {
  fix: 'Find and fix the mistake',
  categorise: 'Categorise',
  transform: 'Key word transformation',
  highlight: 'Highlight in text',
  sentences: 'Order sentences',
  label: 'Label the image',
  odd: 'Odd one out',
  gapped: 'Gapped text',
  matching: 'Multiple matching',
  speaking: 'Speaking prompt',
  dictation: 'Dictation',
  pairs: 'Minimal pairs',
  crossword: 'Crossword',
  wordsearch: 'Word search',
};

export const newPackData = (t: PackKind): Data => {
  switch (t) {
    case 'fix':
      return { sentence: '', wrong: '', fixes: [] };
    case 'categorise':
      return { cats: [{ name: 'Countable', items: [] }, { name: 'Uncountable', items: [] }] };
    case 'transform':
      return { first: '', keyWord: '', before: '', after: '', answers: [], min: 2, max: 5 };
    case 'highlight':
      return { instruction: 'Tap every …', text: '', penalty: true };
    case 'sentences':
      return { items: ['', '', ''] };
    case 'label':
      return { image: '', points: [], extras: [] };
    case 'odd':
      return { words: ['', '', '', ''], odd: 3, reason: false };
    case 'gapped':
      return { text: '', removed: ['', ''], extras: [''] };
    case 'matching':
      return { options: ['A', 'B', 'C', 'D'], names: ['', '', '', ''], statements: [{ text: '', answer: 0 }, { text: '', answer: 1 }] };
    case 'speaking':
      return { prompt: '', images: [], questions: [], timer: 60, pairs: true };
    case 'dictation':
      return { sentence: '', replays: 2, accent: 'RP' };
    case 'pairs':
      return { items: [{ say: 'ship', options: ['ship', 'sheep'] }, { say: 'live', options: ['live', 'leave'] }], accent: 'RP' };
    case 'crossword':
    case 'wordsearch':
      return { words: [{ word: '', clue: '' }, { word: '', clue: '' }, { word: '', clue: '' }], from: '' };
  }
};

// ---- Crossword and word search layouts -------------------------------------------------
export type Placed = { word: string; clue: string; row: number; col: number; dir: 'across' | 'down' | string; n?: number };
const cleanWord = (w: string) => String(w ?? '').toUpperCase().replace(/[^A-ZÀ-ÿ]/g, '');

// A simple crossword: the longest word goes across, every other word tries to cross an existing letter.
export function layoutCrossword(items: { word: string; clue: string }[]): { placed: Placed[]; rows: number; cols: number } {
  const ws = items.map((x) => ({ word: cleanWord(x.word), clue: String(x.clue ?? '') })).filter((x) => x.word.length > 1).sort((a, b) => b.word.length - a.word.length);
  if (!ws.length) return { placed: [], rows: 0, cols: 0 };
  const grid = new Map<string, string>();
  const placed: Placed[] = [];
  const at = (r: number, c: number) => grid.get(r + ',' + c);
  const put = (p: Placed) => {
    for (let i = 0; i < p.word.length; i++) grid.set((p.dir === 'across' ? p.row : p.row + i) + ',' + (p.dir === 'across' ? p.col + i : p.col), p.word[i]);
    placed.push(p);
  };
  const fits = (word: string, row: number, col: number, dir: 'across' | 'down') => {
    let crosses = 0;
    for (let i = 0; i < word.length; i++) {
      const r = dir === 'across' ? row : row + i;
      const c = dir === 'across' ? col + i : col;
      const cur = at(r, c);
      if (cur && cur !== word[i]) return -1;
      if (cur) crosses++;
      else {
        // no touching neighbours along the sides of a new letter
        if (dir === 'across' && (at(r - 1, c) || at(r + 1, c))) return -1;
        if (dir === 'down' && (at(r, c - 1) || at(r, c + 1))) return -1;
      }
    }
    // nothing directly before or after the word
    const br = dir === 'across' ? row : row - 1;
    const bc = dir === 'across' ? col - 1 : col;
    const ar = dir === 'across' ? row : row + word.length;
    const ac = dir === 'across' ? col + word.length : col;
    if (at(br, bc) || at(ar, ac)) return -1;
    return crosses;
  };
  put({ word: ws[0].word, clue: ws[0].clue, row: 0, col: 0, dir: 'across' });
  const leftovers: typeof ws = [];
  for (const w of ws.slice(1)) {
    let best: Placed | null = null;
    let bestScore = 0;
    for (const p of placed) {
      for (let i = 0; i < p.word.length; i++) {
        for (let j = 0; j < w.word.length; j++) {
          if (p.word[i] !== w.word[j]) continue;
          const dir = p.dir === 'across' ? 'down' : 'across';
          const row = p.dir === 'across' ? p.row - j : p.row + i;
          const col = p.dir === 'across' ? p.col + i : p.col - j;
          const sc = fits(w.word, row, col, dir);
          if (sc > bestScore) (bestScore = sc), (best = { word: w.word, clue: w.clue, row, col, dir });
        }
      }
    }
    if (best) put(best);
    else leftovers.push(w);
  }
  // words that cross nothing go below the grid, across, on their own rows
  let bottom = Math.max(...placed.map((p) => (p.dir === 'down' ? p.row + p.word.length : p.row + 1)));
  const left = Math.min(...placed.map((p) => p.col));
  for (const w of leftovers) {
    bottom += 1;
    put({ word: w.word, clue: w.clue, row: bottom, col: left, dir: 'across' });
    bottom += 1;
  }
  // normalise to start at 0,0 and number the starts
  const minR = Math.min(...placed.map((p) => p.row));
  const minC = Math.min(...placed.map((p) => p.col));
  for (const p of placed) (p.row -= minR), (p.col -= minC);
  const starts = [...new Set(placed.map((p) => p.row + ',' + p.col))].sort((a, b) => {
    const [ar, ac] = a.split(',').map(Number);
    const [br, bc] = b.split(',').map(Number);
    return ar - br || ac - bc;
  });
  for (const p of placed) p.n = starts.indexOf(p.row + ',' + p.col) + 1;
  const rows = Math.max(...placed.map((p) => (p.dir === 'down' ? p.row + p.word.length : p.row + 1)));
  const cols = Math.max(...placed.map((p) => (p.dir === 'across' ? p.col + p.word.length : p.col + 1)));
  return { placed, rows, cols };
}

// A word search: words in eight directions, the rest filled with random letters (seeded).
const DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
export function layoutWordSearch(items: { word: string; clue: string }[], seed: string): { grid: string[]; size: number; placed: Placed[] } {
  const ws = items.map((x) => ({ word: cleanWord(x.word), clue: String(x.clue ?? '') })).filter((x) => x.word.length > 1).sort((a, b) => b.word.length - a.word.length);
  const longest = Math.max(0, ...ws.map((w) => w.word.length));
  const size = Math.max(8, Math.min(16, Math.max(longest, Math.ceil(Math.sqrt(ws.reduce((n, w) => n + w.word.length, 0) * 2.2)))));
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const cells: string[] = Array(size * size).fill('');
  const placed: Placed[] = [];
  for (const w of ws) {
    if (w.word.length > size) continue;
    let done = false;
    for (let tries = 0; tries < 200 && !done; tries++) {
      const [dr, dc] = DIRS[Math.floor(rand() * (tries < 100 ? 4 : 8))];
      const row = Math.floor(rand() * size);
      const col = Math.floor(rand() * size);
      const er = row + dr * (w.word.length - 1);
      const ec = col + dc * (w.word.length - 1);
      if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
      let ok = true;
      for (let i = 0; i < w.word.length && ok; i++) {
        const cur = cells[(row + dr * i) * size + col + dc * i];
        if (cur && cur !== w.word[i]) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < w.word.length; i++) cells[(row + dr * i) * size + col + dc * i] = w.word[i];
      placed.push({ word: w.word, clue: w.clue, row, col, dir: `${dr},${dc}` });
      done = true;
    }
  }
  // Dense lists must not silently lose source answers. Use a guaranteed seeded layout
  // if random packing could not fit every word; each word gets its own shuffled row.
  if (placed.length !== ws.length) {
    const n = Math.max(8, longest, ws.length), grid = Array(n * n).fill(''), all: Placed[] = [];
    const rows = shuffle(ws.map((_, i) => i), seed + '_fallback');
    for (const [i, w] of ws.entries()) {
      const reverse = rand() < .5, start = Math.floor(rand() * (n - w.word.length + 1));
      const col = reverse ? start + w.word.length - 1 : start, dc = reverse ? -1 : 1;
      for (let k = 0; k < w.word.length; k++) grid[rows[i] * n + col + dc * k] = w.word[k];
      all.push({ word: w.word, clue: w.clue, row: rows[i], col, dir: '0,' + dc });
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = alphabet[Math.floor(rand() * 26)];
    return { grid, size: n, placed: all };
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = letters[Math.floor(rand() * 26)];
  return { grid: cells, size, placed };
}

// Word-by-word comparison for dictation: which typed words match the original, in order.
export function diffWords(expected: string, typed: string) {
  const e = words(expected).map(norm);
  const t = words(typed).map(norm);
  // longest common subsequence
  const dp: number[][] = Array.from({ length: e.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = e.length - 1; i >= 0; i--) for (let j = t.length - 1; j >= 0; j--) dp[i][j] = e[i] === t[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const okE = new Set<number>();
  const okT = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < e.length && j < t.length) {
    if (e[i] === t[j]) (okE.add(i), okT.add(j), i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { expected: words(expected).map((w, k) => ({ w, ok: okE.has(k) })), typed: words(typed).map((w, k) => ({ w, ok: okT.has(k) })), got: okE.size, max: e.length };
}

// Firestore cannot store an array directly inside another array. Read legacy groups
// as well as the object-wrapped groups used by all new saves.
export function highlightGroups(value: unknown): number[][] {
  return Array.isArray(value) ? value.map(g => Array.isArray(g) ? g : Array.isArray(g?.tokens) ? g.tokens : []).filter(g => g.length) : [];
}

// Editor data -> public data + key.
export function splitPack(t: PackKind, d: Data, id: string): { pub: Data; key: Data | null } {
  switch (t) {
    case 'fix': {
      const toks = words(d.sentence);
      const wrong = words(d.wrong);
      let at = -1;
      for (let i = 0; i + wrong.length <= toks.length && wrong.length; i++) if (wrong.every((w, k) => norm(w) === norm(toks[i + k]))) (at = i), (i = toks.length);
      const range = at < 0 ? [] : wrong.map((_, k) => at + k);
      return { pub: { toks }, key: { range, fixes: clean(d.fixes) } };
    }
    case 'categorise': {
      const cats: { name: string; items: string[] }[] = (d.cats ?? []).map((c: Data) => ({ name: String(c.name ?? ''), items: clean(c.items).sort() }));
      const all = cats.flatMap((c, ci) => c.items.map((w) => ({ w, ci })));
      const mixed = shuffle(all, id);
      return { pub: { cats: cats.map((c) => c.name), items: mixed.map((x) => x.w) }, key: { map: mixed.map((x) => x.ci) } };
    }
    case 'transform':
      return { pub: { first: d.first ?? '', keyWord: String(d.keyWord ?? '').toUpperCase(), before: d.before ?? '', after: d.after ?? '', min: d.min ?? null, max: d.max ?? null }, key: { answers: clean(d.answers) } };
    case 'highlight': {
      const { toks, groups } = tokenise(d.text ?? '');
      return { pub: { instruction: d.instruction ?? '', toks, penalty: !!d.penalty }, key: { groups: groups.map(tokens => ({ tokens })), penalty: !!d.penalty } };
    }
    case 'sentences': {
      const items = clean(d.items);
      const order = shuffle(items.map((_, i) => i), id);
      return { pub: { items: order.map((i) => items[i]) }, key: { order: items.map((_, i) => order.indexOf(i)) } };
    }
    case 'label': {
      const pts: { x: number; y: number; label: string }[] = (d.points ?? []).filter((p: Data) => String(p.label ?? '').trim());
      const labels = shuffle([...pts.map((p) => p.label.trim()), ...clean(d.extras).sort()], id);
      const used = new Set<number>();
      const map = pts.map((p) => {
        const i = labels.findIndex((l, k) => l === p.label.trim() && !used.has(k));
        used.add(i);
        return i;
      });
      return { pub: { image: d.image ?? '', points: pts.map((p) => ({ x: p.x, y: p.y })), labels }, key: { map } };
    }
    case 'odd': {
      const ws: string[] = (d.words ?? []).map((w: string) => String(w ?? "").trim());
      const keep = ws.map((w, i) => ({ w, i })).filter((x) => x.w).sort((a,b) => a.w < b.w ? -1 : a.w > b.w ? 1 : a.i - b.i);
      const mixed = shuffle(keep, id);
      return { pub: { words: mixed.map((x) => x.w), reason: !!d.reason }, key: { odd: mixed.findIndex((x) => x.i === d.odd) } };
    }
    case 'gapped': {
      const removed = (d.removed ?? []).map((x: string) => String(x ?? '').trim());
      const extras = clean(d.extras).sort();
      const opts = shuffle([...removed.map((r: string, i: number) => ({ r, i })), ...extras.map((r) => ({ r, i: -1 }))].filter((x) => x.r), id);
      return { pub: { text: d.text ?? '', options: opts.map((x) => x.r), gaps: removed.length }, key: { map: removed.map((_: string, i: number) => opts.findIndex((x) => x.i === i)) } };
    }
    case 'matching': {
      const st: { text: string; answer: number }[] = (d.statements ?? []).filter((s: Data) => String(s.text ?? '').trim());
      return { pub: { options: d.options ?? [], names: d.names ?? [], statements: st.map((s) => s.text) }, key: { map: st.map((s) => s.answer) } };
    }
    case 'speaking':
      return { pub: d, key: null };
    case 'dictation':
      // the sentence has to reach the learner's browser so it can be read aloud; it is hidden until they check
      return { pub: { say: d.sentence ?? '', replays: Number(d.replays) || 2, accent: d.accent ?? 'RP', count: words(d.sentence ?? '').length }, key: { sentence: d.sentence ?? '' } };
    case 'pairs': {
      const items: { say: string; options: string[] }[] = (d.items ?? []).map((it: Data) => ({ say: String(it.say ?? '').trim(), options: clean(it.options).sort() })).filter((it: Data) => it.say && it.options.length > 1);
      return { pub: { items: items.map((it, i) => ({ say: it.say, options: shuffle(it.options, id + i) })), accent: d.accent ?? 'RP' }, key: { map: items.map((it, i) => shuffle(it.options, id + i).findIndex((o) => norm(o) === norm(it.say))) } };
    }
    case 'crossword': {
      const { placed, rows, cols } = layoutCrossword(d.words ?? []);
      return { pub: { rows, cols, clues: placed.map((p) => ({ n: p.n, dir: p.dir, row: p.row, col: p.col, len: p.word.length, clue: p.clue })) }, key: { words: placed.map((p) => p.word), layout: placed } };
    }
    case 'wordsearch': {
      const { grid, size, placed } = layoutWordSearch(d.words ?? [], id);
      return { pub: { grid, size, clues: placed.map((p) => ({ clue: p.clue, len: p.word.length })) }, key: { placed: placed.map((p) => ({ row: p.row, col: p.col, dir: p.dir, word: p.word })) } };
    }
  }
}

// Public data + key -> editor data.
export function mergePack(t: PackKind, p: Data, k: Data | undefined): Data {
  if (!k) return p;
  switch (t) {
    case 'fix':
      return { sentence: (p.toks ?? []).join(' '), wrong: (k.range ?? []).map((i: number) => p.toks[i]).join(' '), fixes: k.fixes ?? [] };
    case 'categorise':
      return { cats: (p.cats ?? []).map((name: string, ci: number) => ({ name, items: (p.items ?? []).filter((_: string, i: number) => k.map[i] === ci) })) };
    case 'transform':
      return { ...p, answers: k.answers ?? [] };
    case 'highlight': {
      const inG = new Map<number, number>();
      highlightGroups(k.groups).forEach((g: number[], gi: number) => g.forEach((i) => inG.set(i, gi)));
      const out: string[] = [];
      (p.toks ?? []).forEach((w: string, i: number) => {
        const g = inG.get(i);
        const startG = g !== undefined && (i === 0 || inG.get(i - 1) !== g);
        const endG = g !== undefined && inG.get(i + 1) !== g;
        out.push((startG ? '{{' : '') + w + (endG ? '}}' : ''));
      });
      return { instruction: p.instruction, text: out.join(' '), penalty: p.penalty };
    }
    case 'sentences':
      return { items: (k.order ?? []).map((i: number) => p.items[i]) };
    case 'label': {
      const used = new Set<number>(k.map);
      return { image: p.image, points: (p.points ?? []).map((pt: Data, i: number) => ({ ...pt, label: p.labels[k.map[i]] ?? '' })), extras: (p.labels ?? []).filter((_: string, i: number) => !used.has(i)) };
    }
    case 'odd':
      return { words: p.words, odd: k.odd, reason: p.reason };
    case 'gapped': {
      const used = new Set<number>(k.map);
      return { text: p.text, removed: (k.map ?? []).map((i: number) => p.options[i] ?? ''), extras: (p.options ?? []).filter((_: string, i: number) => !used.has(i)) };
    }
    case 'matching':
      return { options: p.options, names: p.names, statements: (p.statements ?? []).map((text: string, i: number) => ({ text, answer: k.map[i] ?? 0 })) };
    case 'speaking':
      return p;
    case 'dictation':
      return { sentence: k.sentence ?? p.say ?? '', replays: p.replays ?? 2, accent: p.accent ?? 'RP' };
    case 'pairs':
      return { items: (p.items ?? []).map((it: Data) => ({ say: it.say, options: it.options })), accent: p.accent ?? 'RP' };
    case 'crossword':
      return { words: (p.clues ?? []).map((c: Data, i: number) => ({ word: k.words?.[i] ?? '', clue: c.clue })), from: '' };
    case 'wordsearch':
      return { words: (k.placed ?? []).map((pl: Data, i: number) => ({ word: pl.word, clue: p.clues?.[i]?.clue ?? '' })), from: '' };
  }
}

const arr = (r: unknown) => (Array.isArray(r) ? (r as number[]) : []);

export function scorePack(e: PackKey, r: any): { got: number; max: number } {
  const k = e.k;
  switch (e.t) {
    case 'fix': {
      const pick: number[] = arr(r?.pick);
      const found = k.range.length > 0 && pick.length === k.range.length && pick.every((i) => k.range.includes(i));
      const fixed = found && (k.fixes ?? []).some((f: string) => norm(f) === norm(r?.fix ?? ''));
      return { got: (found ? 1 : 0) + (fixed ? 1 : 0), max: 2 };
    }
    case 'categorise':
    case 'label':
    case 'gapped':
    case 'matching': {
      const a = arr(r);
      return { got: k.map.filter((m: number, i: number) => a[i] === m && m >= 0).length, max: k.map.length };
    }
    case 'transform': {
      const v = norm(r ?? '');
      return { got: v && (k.answers ?? []).some((a: string) => norm(a) === v) ? 1 : 0, max: 1 };
    }
    case 'highlight': {
      const pick = new Set(arr(r));
      const groups = highlightGroups(k.groups);
      const found = groups.filter((g) => g.every((i) => pick.has(i))).length;
      const inAny = new Set(groups.flat());
      const wrong = [...pick].filter((i) => !inAny.has(i)).length;
      return { got: Math.max(0, found - (e.k.penalty === false ? 0 : wrong)), max: groups.length };
    }
    case 'sentences': {
      // Until the learner moves something, the order shown counts as their answer.
      const a = Array.isArray(r) && r.length ? arr(r) : (k.order ?? []).map((_: number, i: number) => i);
      return { got: (k.order ?? []).filter((o: number, i: number) => a[i] === o).length, max: (k.order ?? []).length };
    }
    case 'odd':
      return { got: r && typeof r === 'object' && r.pick === k.odd ? 1 : 0, max: 1 };
    case 'speaking':
      return { got: 0, max: 0 };
    case 'dictation': {
      const d = diffWords(k.sentence ?? '', typeof r === 'string' ? r : '');
      return { got: d.got, max: d.max };
    }
    case 'pairs': {
      const a = arr(r);
      return { got: (k.map ?? []).filter((m: number, i: number) => a[i] === m && m >= 0).length, max: (k.map ?? []).length };
    }
    case 'crossword': {
      // r: letters per cell, keyed "row,col"
      const cells: Record<string, string> = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
      let got = 0;
      const lay: Placed[] = k.layout ?? [];
      lay.forEach((p) => {
        let ok = p.word.length > 0;
        for (let i = 0; i < p.word.length && ok; i++) {
          const rr = p.dir === 'across' ? p.row : p.row + i;
          const cc = p.dir === 'across' ? p.col + i : p.col;
          if (norm(cells[rr + ',' + cc] ?? '') !== norm(p.word[i])) ok = false;
        }
        if (ok) got++;
      });
      return { got, max: lay.length || (k.words ?? []).length };
    }
    case 'wordsearch': {
      // r: list of found words as "row,col,dir"
      // r: marked lines as "row,col,dr,dc,len" (both directions are stored)
      const found = new Set<string>(Array.isArray(r) ? r.map((x) => String(x).split(',').slice(0, 4).join(',')) : []);
      const pl: Data[] = k.placed ?? [];
      return { got: pl.filter((p) => found.has(`${p.row},${p.col},${p.dir}`)).length, max: pl.length };
    }
  }
}

export function packAnswered(t: PackKind, r: any) {
  if (r === undefined || r === null) return false;
  if (t === 'fix') return arr(r.pick).length > 0;
  if (t === 'odd') return typeof r.pick === 'number';
  if (t === 'transform' || t === 'dictation') return !!String(r).trim();
  if (t === 'crossword') return r && typeof r === 'object' && Object.values(r).some((v) => String(v ?? '').trim());
  if (t === 'wordsearch') return Array.isArray(r) && r.length > 0;
  return Array.isArray(r) && r.some((x) => x !== -1 && x !== null);
}

// Short text for the live grid.
export function packLabel(t: PackKind, p: Data, r: any): string {
  if (!packAnswered(t, r)) return '';
  switch (t) {
    case 'fix':
      return `${arr(r.pick).map((i) => p.toks?.[i]).join(' ')} → ${r.fix ?? '…'}`;
    case 'transform':
      return String(r);
    case 'odd':
      return p.words?.[r.pick] ?? '';
    case 'highlight':
      return `${arr(r).length} tapped`;
    case 'sentences':
      return arr(r).map((i) => i + 1).join('-');
    case 'dictation':
      return String(r).slice(0, 60);
    case 'pairs':
      return arr(r).map((i, k) => p.items?.[k]?.options?.[i] ?? '?').join(', ');
    case 'crossword':
      return `${Object.values(r ?? {}).filter((v) => String(v ?? '').trim()).length} letters`;
    case 'wordsearch':
      return `${Math.floor((r as string[]).length / 2)} marked`;
    default: {
      const a = arr(r);
      return `${a.filter((x) => x !== -1 && x !== null).length} placed`;
    }
  }
}

// A fully correct answer, for showing revealed answers in pen on the teaching screen.
export function answerFromKey(e: PackKey): unknown {
  const k = e.k;
  switch (e.t) {
    case 'fix':
      return { pick: k.range, fix: k.fixes?.[0] ?? '' };
    case 'transform':
      return k.answers?.[0] ?? '';
    case 'highlight':
      return highlightGroups(k.groups).flat();
    case 'sentences':
      return k.order;
    case 'odd':
      return { pick: k.odd };
    case 'dictation':
      return k.sentence ?? '';
    case 'crossword': {
      const cells: Record<string, string> = {};
      (k.layout ?? []).forEach((p: Placed) => {
        for (let i = 0; i < p.word.length; i++) cells[(p.dir === 'across' ? p.row : p.row + i) + ',' + (p.dir === 'across' ? p.col + i : p.col)] = p.word[i];
      });
      return cells;
    }
    case 'wordsearch':
      return (k.placed ?? []).map((p: Data) => `${p.row},${p.col},${p.dir},${p.word.length}`);
    default:
      return k.map;
  }
}

const L = 'ABCDEFGHIJKLMNOP';
// The answer in words, for the "answer" chip learners see when the teacher reveals it.
export function packAnswerText(e: PackKey, p: Data): string {
  const k = e.k;
  switch (e.t) {
    case 'fix':
      return `${(k.range ?? []).map((i: number) => p.toks?.[i]).join(' ')} → ${k.fixes?.[0] ?? ''}`;
    case 'transform':
      return (k.answers ?? []).join(' / ');
    case 'highlight':
      return highlightGroups(k.groups).map((g: number[]) => g.map((i) => p.toks?.[i]).join(' ')).join(', ');
    case 'sentences':
      return (k.order ?? []).map((i: number) => String(p.items?.[i] ?? '').slice(0, 40)).join(' → ');
    case 'odd':
      return p.words?.[k.odd] ?? '';
    case 'categorise':
      return (p.cats ?? []).map((c: string, ci: number) => `${c}: ${(p.items ?? []).filter((_: string, i: number) => k.map[i] === ci).join(', ')}`).join(' · ');
    case 'label':
      return (k.map ?? []).map((m: number, i: number) => `${i + 1} ${p.labels?.[m] ?? ''}`).join(' · ');
    case 'gapped':
      return (k.map ?? []).map((m: number, i: number) => `${i + 1} ${L[m] ?? '?'}`).join(' · ');
    case 'matching':
      return (k.map ?? []).map((m: number, i: number) => `${i + 1} ${p.options?.[m] ?? '?'}`).join(' · ');
    case 'dictation':
      return k.sentence ?? '';
    case 'pairs':
      return (p.items ?? []).map((it: Data) => it.say).join(', ');
    case 'crossword':
      return (k.layout ?? k.words ?? []).map((w: Data | string, i: number) => `${p.clues?.[i]?.n ?? i + 1}${p.clues?.[i]?.dir === 'down' ? 'd' : 'a'} ${typeof w === 'string' ? w : w.word}`).join(' · ');
    case 'wordsearch':
      return (k.placed ?? []).map((w: Data) => w.word).join(', ');
    default:
      return '';
  }
}
