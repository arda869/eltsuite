// Generated from src/lib/questions.ts and src/lib/pack.ts. Run node scripts/sync-import-question-core.mjs.
// src/lib/pack.ts
function shuffle(list, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h += 1831565813;
    let t = h;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.length > 1 && a.every((x, i) => x === list[i])) a.push(a.shift());
  return a;
}
var norm = (s) => String(s ?? "").normalize("NFKC").replace(/[‘’‚‛′`´ʼʹ＇]/g, "'").replace(/[“”„‟″«»＂]/g, '"').toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "").trim();
var words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean);
var clean = (l) => Array.isArray(l) ? l.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
function tokenise(text) {
  const toks = [];
  const groups = [];
  const re = /\{\{([^}]*)\}\}/g;
  let last = 0;
  const push = (s) => words(s).forEach((w) => toks.push(w));
  for (const m of text.matchAll(re)) {
    push(text.slice(last, m.index));
    const g = [];
    words(m[1]).forEach((w) => (g.push(toks.length), toks.push(w)));
    if (g.length) groups.push(g);
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return { toks, groups };
}
var cleanWord = (w) => String(w ?? "").toUpperCase().replace(/[^A-ZÀ-ÿ]/g, "");
function layoutCrossword(items) {
  const ws = items.map((x) => ({ word: cleanWord(x.word), clue: String(x.clue ?? "") })).filter((x) => x.word.length > 1).sort((a, b) => b.word.length - a.word.length);
  if (!ws.length) return { placed: [], rows: 0, cols: 0 };
  const grid = /* @__PURE__ */ new Map();
  const placed = [];
  const at = (r, c) => grid.get(r + "," + c);
  const put = (p) => {
    for (let i = 0; i < p.word.length; i++) grid.set((p.dir === "across" ? p.row : p.row + i) + "," + (p.dir === "across" ? p.col + i : p.col), p.word[i]);
    placed.push(p);
  };
  const fits = (word, row, col, dir) => {
    let crosses = 0;
    for (let i = 0; i < word.length; i++) {
      const r = dir === "across" ? row : row + i;
      const c = dir === "across" ? col + i : col;
      const cur = at(r, c);
      if (cur && cur !== word[i]) return -1;
      if (cur) crosses++;
      else {
        if (dir === "across" && (at(r - 1, c) || at(r + 1, c))) return -1;
        if (dir === "down" && (at(r, c - 1) || at(r, c + 1))) return -1;
      }
    }
    const br = dir === "across" ? row : row - 1;
    const bc = dir === "across" ? col - 1 : col;
    const ar = dir === "across" ? row : row + word.length;
    const ac = dir === "across" ? col + word.length : col;
    if (at(br, bc) || at(ar, ac)) return -1;
    return crosses;
  };
  put({ word: ws[0].word, clue: ws[0].clue, row: 0, col: 0, dir: "across" });
  const leftovers = [];
  for (const w of ws.slice(1)) {
    let best = null;
    let bestScore = 0;
    for (const p of placed) {
      for (let i = 0; i < p.word.length; i++) {
        for (let j = 0; j < w.word.length; j++) {
          if (p.word[i] !== w.word[j]) continue;
          const dir = p.dir === "across" ? "down" : "across";
          const row = p.dir === "across" ? p.row - j : p.row + i;
          const col = p.dir === "across" ? p.col + i : p.col - j;
          const sc = fits(w.word, row, col, dir);
          if (sc > bestScore) bestScore = sc, best = { word: w.word, clue: w.clue, row, col, dir };
        }
      }
    }
    if (best) put(best);
    else leftovers.push(w);
  }
  let bottom = Math.max(...placed.map((p) => p.dir === "down" ? p.row + p.word.length : p.row + 1));
  const left = Math.min(...placed.map((p) => p.col));
  for (const w of leftovers) {
    bottom += 1;
    put({ word: w.word, clue: w.clue, row: bottom, col: left, dir: "across" });
    bottom += 1;
  }
  const minR = Math.min(...placed.map((p) => p.row));
  const minC = Math.min(...placed.map((p) => p.col));
  for (const p of placed) p.row -= minR, p.col -= minC;
  const starts = [...new Set(placed.map((p) => p.row + "," + p.col))].sort((a, b) => {
    const [ar, ac] = a.split(",").map(Number);
    const [br, bc] = b.split(",").map(Number);
    return ar - br || ac - bc;
  });
  for (const p of placed) p.n = starts.indexOf(p.row + "," + p.col) + 1;
  const rows = Math.max(...placed.map((p) => p.dir === "down" ? p.row + p.word.length : p.row + 1));
  const cols = Math.max(...placed.map((p) => p.dir === "across" ? p.col + p.word.length : p.col + 1));
  return { placed, rows, cols };
}
var DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
function layoutWordSearch(items, seed) {
  const ws = items.map((x) => ({ word: cleanWord(x.word), clue: String(x.clue ?? "") })).filter((x) => x.word.length > 1).sort((a, b) => b.word.length - a.word.length);
  const longest = Math.max(0, ...ws.map((w) => w.word.length));
  const size = Math.max(8, Math.min(16, Math.max(longest, Math.ceil(Math.sqrt(ws.reduce((n, w) => n + w.word.length, 0) * 2.2)))));
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h += 1831565813;
    let t = h;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const cells = Array(size * size).fill("");
  const placed = [];
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
  if (placed.length !== ws.length) {
    const n = Math.max(8, longest, ws.length), grid = Array(n * n).fill(""), all = [];
    const rows = shuffle(ws.map((_, i) => i), seed + "_fallback");
    for (const [i, w] of ws.entries()) {
      const reverse = rand() < 0.5, start = Math.floor(rand() * (n - w.word.length + 1));
      const col = reverse ? start + w.word.length - 1 : start, dc = reverse ? -1 : 1;
      for (let k = 0; k < w.word.length; k++) grid[rows[i] * n + col + dc * k] = w.word[k];
      all.push({ word: w.word, clue: w.clue, row: rows[i], col, dir: "0," + dc });
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = alphabet[Math.floor(rand() * 26)];
    return { grid, size: n, placed: all };
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = letters[Math.floor(rand() * 26)];
  return { grid: cells, size, placed };
}
function highlightGroups(value) {
  return Array.isArray(value) ? value.map((g) => Array.isArray(g) ? g : Array.isArray(g?.tokens) ? g.tokens : []).filter((g) => g.length) : [];
}
function splitPack(t, d, id) {
  switch (t) {
    case "fix": {
      const toks = words(d.sentence);
      const wrong = words(d.wrong);
      let at = -1;
      for (let i = 0; i + wrong.length <= toks.length && wrong.length; i++) if (wrong.every((w, k) => norm(w) === norm(toks[i + k]))) at = i, i = toks.length;
      const range = at < 0 ? [] : wrong.map((_, k) => at + k);
      return { pub: { toks }, key: { range, fixes: clean(d.fixes) } };
    }
    case "categorise": {
      const cats = (d.cats ?? []).map((c) => ({ name: String(c.name ?? ""), items: clean(c.items).sort() }));
      const all = cats.flatMap((c, ci) => c.items.map((w) => ({ w, ci })));
      const mixed = shuffle(all, id);
      return { pub: { cats: cats.map((c) => c.name), items: mixed.map((x) => x.w) }, key: { map: mixed.map((x) => x.ci) } };
    }
    case "transform":
      return { pub: { first: d.first ?? "", keyWord: String(d.keyWord ?? "").toUpperCase(), before: d.before ?? "", after: d.after ?? "", min: d.min ?? null, max: d.max ?? null }, key: { answers: clean(d.answers) } };
    case "highlight": {
      const { toks, groups } = tokenise(d.text ?? "");
      return { pub: { instruction: d.instruction ?? "", toks, penalty: !!d.penalty }, key: { groups: groups.map((tokens) => ({ tokens })), penalty: !!d.penalty } };
    }
    case "sentences": {
      const items = clean(d.items);
      const order = shuffle(items.map((_, i) => i), id);
      return { pub: { items: order.map((i) => items[i]) }, key: { order: items.map((_, i) => order.indexOf(i)) } };
    }
    case "label": {
      const pts = (d.points ?? []).filter((p) => String(p.label ?? "").trim());
      const labels = shuffle([...pts.map((p) => p.label.trim()), ...clean(d.extras).sort()], id);
      const used = /* @__PURE__ */ new Set();
      const map = pts.map((p) => {
        const i = labels.findIndex((l, k) => l === p.label.trim() && !used.has(k));
        used.add(i);
        return i;
      });
      return { pub: { image: d.image ?? "", points: pts.map((p) => ({ x: p.x, y: p.y })), labels }, key: { map } };
    }
    case "odd": {
      const ws = (d.words ?? []).map((w) => String(w ?? "").trim());
      const keep = ws.map((w, i) => ({ w, i })).filter((x) => x.w).sort((a, b) => a.w < b.w ? -1 : a.w > b.w ? 1 : a.i - b.i);
      const mixed = shuffle(keep, id);
      return { pub: { words: mixed.map((x) => x.w), reason: !!d.reason }, key: { odd: mixed.findIndex((x) => x.i === d.odd) } };
    }
    case "gapped": {
      const removed = (d.removed ?? []).map((x) => String(x ?? "").trim());
      const extras = clean(d.extras).sort();
      const opts = shuffle([...removed.map((r, i) => ({ r, i })), ...extras.map((r) => ({ r, i: -1 }))].filter((x) => x.r), id);
      return { pub: { text: d.text ?? "", options: opts.map((x) => x.r), gaps: removed.length }, key: { map: removed.map((_, i) => opts.findIndex((x) => x.i === i)) } };
    }
    case "matching": {
      const st = (d.statements ?? []).filter((s) => String(s.text ?? "").trim());
      return { pub: { options: d.options ?? [], names: d.names ?? [], statements: st.map((s) => s.text) }, key: { map: st.map((s) => s.answer) } };
    }
    case "speaking":
      return { pub: d, key: null };
    case "dictation":
      return { pub: { say: d.sentence ?? "", replays: Number(d.replays) || 2, accent: d.accent ?? "RP", count: words(d.sentence ?? "").length }, key: { sentence: d.sentence ?? "" } };
    case "pairs": {
      const items = (d.items ?? []).map((it) => ({ say: String(it.say ?? "").trim(), options: clean(it.options).sort() })).filter((it) => it.say && it.options.length > 1);
      return { pub: { items: items.map((it, i) => ({ say: it.say, options: shuffle(it.options, id + i) })), accent: d.accent ?? "RP" }, key: { map: items.map((it, i) => shuffle(it.options, id + i).findIndex((o) => norm(o) === norm(it.say))) } };
    }
    case "crossword": {
      const { placed, rows, cols } = layoutCrossword(d.words ?? []);
      return { pub: { rows, cols, clues: placed.map((p) => ({ n: p.n, dir: p.dir, row: p.row, col: p.col, len: p.word.length, clue: p.clue })) }, key: { words: placed.map((p) => p.word), layout: placed } };
    }
    case "wordsearch": {
      const { grid, size, placed } = layoutWordSearch(d.words ?? [], id);
      return { pub: { grid, size, clues: placed.map((p) => ({ clue: p.clue, len: p.word.length })) }, key: { placed: placed.map((p) => ({ row: p.row, col: p.col, dir: p.dir, word: p.word })) } };
    }
  }
}
function mergePack(t, p, k) {
  if (!k) return p;
  switch (t) {
    case "fix":
      return { sentence: (p.toks ?? []).join(" "), wrong: (k.range ?? []).map((i) => p.toks[i]).join(" "), fixes: k.fixes ?? [] };
    case "categorise":
      return { cats: (p.cats ?? []).map((name, ci) => ({ name, items: (p.items ?? []).filter((_, i) => k.map[i] === ci) })) };
    case "transform":
      return { ...p, answers: k.answers ?? [] };
    case "highlight": {
      const inG = /* @__PURE__ */ new Map();
      highlightGroups(k.groups).forEach((g, gi) => g.forEach((i) => inG.set(i, gi)));
      const out = [];
      (p.toks ?? []).forEach((w, i) => {
        const g = inG.get(i);
        const startG = g !== void 0 && (i === 0 || inG.get(i - 1) !== g);
        const endG = g !== void 0 && inG.get(i + 1) !== g;
        out.push((startG ? "{{" : "") + w + (endG ? "}}" : ""));
      });
      return { instruction: p.instruction, text: out.join(" "), penalty: p.penalty };
    }
    case "sentences":
      return { items: (k.order ?? []).map((i) => p.items[i]) };
    case "label": {
      const used = new Set(k.map);
      return { image: p.image, points: (p.points ?? []).map((pt, i) => ({ ...pt, label: p.labels[k.map[i]] ?? "" })), extras: (p.labels ?? []).filter((_, i) => !used.has(i)) };
    }
    case "odd":
      return { words: p.words, odd: k.odd, reason: p.reason };
    case "gapped": {
      const used = new Set(k.map);
      return { text: p.text, removed: (k.map ?? []).map((i) => p.options[i] ?? ""), extras: (p.options ?? []).filter((_, i) => !used.has(i)) };
    }
    case "matching":
      return { options: p.options, names: p.names, statements: (p.statements ?? []).map((text, i) => ({ text, answer: k.map[i] ?? 0 })) };
    case "speaking":
      return p;
    case "dictation":
      return { sentence: k.sentence ?? p.say ?? "", replays: p.replays ?? 2, accent: p.accent ?? "RP" };
    case "pairs":
      return { items: (p.items ?? []).map((it) => ({ say: it.say, options: it.options })), accent: p.accent ?? "RP" };
    case "crossword":
      return { words: (p.clues ?? []).map((c, i) => ({ word: k.words?.[i] ?? "", clue: c.clue })), from: "" };
    case "wordsearch":
      return { words: (k.placed ?? []).map((pl, i) => ({ word: pl.word, clue: p.clues?.[i]?.clue ?? "" })), from: "" };
  }
}

// src/lib/questions.ts
function shuffle2(list, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h += 1831565813;
    let t = h;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
var splitWords = (s) => s.trim().split(/\s+/).filter(Boolean);
function splitKey(content) {
  const key = {};
  const dropAnswers = [];
  const walk = (n) => {
    const out = { ...n };
    const a = n.attrs ?? {};
    const id = a.id;
    if (id && !a.example) {
      if (n.type === "gap") {
        key[id] = { kind: "gap", answers: (a.answers ?? []).filter((x) => x.trim()), ...a.caseSensitive ? { cs: true } : {} };
        out.attrs = { ...a, answers: [] };
        delete out.attrs.caseSensitive;
      } else if (n.type === "mcq" || n.type === "choice") {
        const optFb = (a.optFeedback ?? []).some((x) => x?.trim()) ? a.optFeedback : void 0;
        if (a.multi) {
          key[id] = { kind: "multi", correct: Array.isArray(a.correct) ? a.correct : [], ...optFb ? { optFb } : {} };
          out.attrs = { ...a, correct: [] };
        } else {
          key[id] = { kind: "mcq", correct: typeof a.correct === "number" ? a.correct : -1, ...optFb ? { optFb } : {} };
          out.attrs = { ...a, correct: -1 };
        }
        delete out.attrs.optFeedback;
      } else if (n.type === "match") {
        const pairs = (a.pairs ?? []).filter((p) => p.left.trim() || p.right.trim());
        const extras = (a.extras ?? []).filter((x) => x.trim());
        const rights = shuffle2([...pairs.map((p) => p.right), ...extras], id);
        const used = /* @__PURE__ */ new Set();
        const map = pairs.map((p) => {
          const i = rights.findIndex((r, k) => r === p.right && !used.has(k));
          used.add(i);
          return i;
        });
        key[id] = { kind: "match", map };
        out.attrs = { id, left: pairs.map((p) => p.left), right: rights };
      } else if (n.type === "dropgap") {
        key[id] = { kind: "drop", answer: (a.answer ?? "").trim() };
        if ((a.answer ?? "").trim()) dropAnswers.push(a.answer.trim());
        out.attrs = { id };
      } else if (n.type === "order") {
        const sentence = (a.sentence ?? "").trim();
        key[id] = { kind: "order", answer: sentence };
        out.attrs = { id, words: shuffle2(splitWords(sentence), id) };
      } else if (n.type === "pq") {
        const { pub: pub2, key: k } = splitPack(a.kind, a.data ?? {}, id);
        if (k) key[id] = { kind: "pack", t: a.kind, k };
        out.attrs = { id, kind: a.kind, data: pub2, ...a.kind === "odd" && a.data?.reason ? { reason: true } : {} };
      } else if (n.type === "writing") {
        key[id] = { kind: "writing", model: a.model ?? "" };
        out.attrs = { id, minWords: a.minWords ?? null, maxWords: a.maxWords ?? null, rich: !!a.rich, spellcheck: !!a.spellcheck, points: a.points ?? 5, genre: a.genre ?? "", rubric: a.rubric ?? "none", criteria: a.criteria ?? [] };
      }
      if (key[id]) {
        if (a.feedback?.trim()) key[id].feedback = a.feedback.trim();
        if (a.hint?.trim()) key[id].hint = a.hint.trim();
        if (out.attrs) {
          const { feedback: _f, hint: _h, ...rest } = out.attrs;
          out.attrs = rest;
        }
      }
    }
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  const pub = walk(content);
  const fillBanks = (n) => {
    const out = { ...n };
    if (n.type === "wordbank") {
      const extras = (n.attrs?.extras ?? []).filter((x) => x.trim());
      out.attrs = { ...n.attrs, words: shuffle2([...dropAnswers, ...extras], "bank" + dropAnswers.join("|")) };
    }
    if (n.content) out.content = n.content.map(fillBanks);
    return out;
  };
  return { content: fillBanks(pub), key };
}
function mergeKey(content, key) {
  const walk = (n) => {
    const out = { ...n };
    const a = n.attrs ?? {};
    const k = a.id ? key[a.id] : void 0;
    if (k) {
      if (n.type === "gap" && k.kind === "gap") out.attrs = { ...a, answers: k.answers, caseSensitive: !!k.cs };
      if ((n.type === "mcq" || n.type === "choice") && (k.kind === "mcq" || k.kind === "multi")) out.attrs = { ...a, correct: k.correct, optFeedback: k.optFb ?? [] };
      if (n.type === "match" && k.kind === "match") {
        const right = a.right ?? [];
        const usedIdx = new Set(k.map);
        out.attrs = {
          id: a.id,
          pairs: (a.left ?? []).map((l, i) => ({ left: l, right: right[k.map[i]] ?? "" })),
          extras: right.filter((_, i) => !usedIdx.has(i))
        };
      }
      if (n.type === "dropgap" && k.kind === "drop") out.attrs = { ...a, answer: k.answer };
      if (n.type === "order" && k.kind === "order") out.attrs = { id: a.id, sentence: k.answer };
      if (n.type === "writing" && k.kind === "writing") out.attrs = { ...a, model: k.model };
      if (n.type === "pq" && k.kind === "pack") out.attrs = { id: a.id, kind: a.kind, data: mergePack(a.kind, a.data ?? {}, k.k) };
      out.attrs = { ...out.attrs, feedback: k.feedback ?? "", hint: k.hint ?? "" };
    }
    if (n.type === "wordbank") out.attrs = { extras: a.extras ?? [] };
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  return walk(content);
}
export {
  mergeKey,
  splitKey
};
