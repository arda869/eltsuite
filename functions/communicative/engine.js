// Generated from src/communicative. Run node scripts/sync-communicative-engine.mjs.
// src/communicative/model.ts
var ACTIVITY_KINDS = ["board", "bingo", "dominoes", "memory", "strips", "cue", "survey", "findSomeone", "ranking", "opinion", "spot", "taboo", "speaking"];
var ACTIVITY_LABELS = {
  board: "Board game",
  bingo: "Bingo",
  dominoes: "Dominoes",
  memory: "Pelmanism",
  strips: "Strip story",
  cue: "Cue cards",
  survey: "Survey",
  findSomeone: "Find someone who",
  ranking: "Ranking",
  opinion: "Opinion line",
  spot: "Spot the difference",
  taboo: "Taboo cards",
  speaking: "Speaking timer"
};
function validateActivity(c) {
  const out = [];
  const issue = (field, message) => out.push({ field, message });
  if (!c.id) issue("id", "Save the activity before starting.");
  if (new Set(c.items.map((i) => i.id)).size !== c.items.length || c.items.some((i) => !i.id)) issue("items", "Give each item its own identifier.");
  c.items.forEach((i, n) => {
    const hasRichPicture = (nodes = []) => nodes.some((n2) => ["picture", "image"].includes(n2.type ?? "") && !!n2.attrs?.src || hasRichPicture(n2.content));
    if (!i.title.trim() && !plainText(i.content) && !hasRichPicture(i.content) && !i.picture?.src) issue(`items.${n}`, `Add text or a picture to item ${n + 1}.`);
    if (i.matchPicture?.src && !i.matchPicture.alt.trim()) issue(`items.${n}.matchPicture`, `Describe the matching picture in pair ${n + 1}.`);
    if (i.picture?.src && !i.picture.alt.trim()) issue(`items.${n}.picture`, `Describe the picture in item ${n + 1}.`);
  });
  if (c.settings.printCards !== void 0 && (!Number.isInteger(c.settings.printCards) || c.settings.printCards < 1 || c.settings.printCards > 100)) issue("printCards", "Choose between 1 and 100 printed cards.");
  if (c.kind === "board") c.items.forEach((item, n) => {
    if (item.special === "back" && (!Number.isInteger(item.move ?? 2) || (item.move ?? 2) < 1 || (item.move ?? 2) > 48)) issue(`items.${n}.move`, "Choose between 1 and 48 squares to move back.");
  });
  if (c.kind === "board" && (c.items.length < 12 || c.items.length > 48)) issue("items", "Use between 12 and 48 squares.");
  if (c.kind === "bingo") {
    const size = c.settings.gridSize ?? 4;
    if (![3, 4, 5].includes(size)) issue("gridSize", "Choose a 3 \xD7 3, 4 \xD7 4 or 5 \xD7 5 card.");
    if (c.items.length <= size * size) issue("items", `A ${size} \xD7 ${size} card needs at least ${size * size + 1} items, so every learner gets a different card. You have ${c.items.length}.`);
    if (c.settings.freeCentre && size === 4) issue("freeCentre", "Use a 3 \xD7 3 or 5 \xD7 5 card for a free centre.");
  }
  if (["dominoes", "memory"].includes(c.kind)) {
    if (c.items.length < 2) issue("items", "Add at least two matching pairs.");
    c.items.forEach((i, n) => {
      if (!i.match?.trim() && !i.matchPicture?.src) issue(`items.${n}.match`, `Pair ${n + 1} needs its other half. Add the word or picture it matches under \u201CPairs\u201D.`);
    });
  }
  if (c.kind === "strips" && c.items.length < 2) issue("items", "Add at least two strips in their correct order.");
  if (c.kind === "ranking") {
    if (c.items.length < 4 || c.items.length > 12) issue("items", "Use between 4 and 12 items.");
    if (c.settings.layout === "diamond" && c.items.length !== 9) issue("layout", "Diamond 9 needs exactly nine items.");
  }
  if (c.kind === "findSomeone" && (c.items.length < 6 || c.items.length > 16)) issue("items", "Use between 6 and 16 prompts.");
  if (["cue", "taboo", "survey", "opinion"].includes(c.kind) && !c.items.length) issue("items", "Add at least one item.");
  if (c.kind === "taboo") c.items.forEach((i, n) => {
    if ((i.taboo?.length ?? 0) > 5) issue(`items.${n}.taboo`, "Use up to five taboo words.");
  });
  if (c.kind === "survey") c.items.forEach((i, n) => {
    if ((i.options?.length ?? 0) < 2 || i.options?.some((x) => !x.trim()) || new Set(i.options?.map((x) => x.trim())).size !== i.options?.length) issue(`items.${n}.options`, `Add at least two different answers to question ${n + 1}, without blank lines.`);
  });
  if (c.kind === "taboo" && (!Number.isInteger(c.settings.seconds ?? 60) || (c.settings.seconds ?? 60) < 15 || (c.settings.seconds ?? 60) > 180)) issue("seconds", "Choose a turn from 15 seconds to 3 minutes.");
  if (c.kind === "speaking" && c.settings.timerDirection !== "up" && (!Number.isFinite(c.settings.seconds ?? 60) || (c.settings.seconds ?? 60) < 5 || (c.settings.seconds ?? 60) > 3600)) issue("seconds", "Choose a time from 5 seconds to 60 minutes.");
  if (c.kind === "spot") {
    if (c.settings.versions?.length !== 2 || c.settings.versions.some((v) => !v.name.trim() || !v.picture.src)) issue("versions", "Add and name both pictures.");
    if (!c.settings.differences?.length) issue("differences", "Mark at least one difference on picture B.");
    if (c.settings.differences?.some((d) => !Number.isFinite(d.x) || !Number.isFinite(d.y) || d.x < 0 || d.x > 100 || d.y < 0 || d.y > 100 || !(d.radius > 0))) issue("differences", "Keep every difference inside the picture.");
  }
  return out;
}
function plainText(nodes = []) {
  return nodes.map((n) => n.text ?? plainText(n.content)).join(" ").replace(/\s+/g, " ").trim();
}
function sameActivityPictureFrame(a, b) {
  return (a?.src ?? "") === (b?.src ?? "") && (a?.fit ?? "cover") === (b?.fit ?? "cover") && (a?.position ?? "50% 50%") === (b?.position ?? "50% 50%");
}
function configFromNode(node) {
  const attrs = node.attrs ?? {};
  const kind = ACTIVITY_KINDS.includes(attrs.kind) ? attrs.kind : "cue";
  const config = {
    id: String(attrs.id ?? ""),
    kind,
    instruction: String(attrs.instruction ?? ""),
    settings: { mode: "class", ...["ranking", "opinion", "cue", "findSomeone", "survey", "speaking"].includes(kind) ? { noCorrectAnswer: true } : {}, ...attrs.settings },
    items: (node.content ?? []).map((card, n) => ({
      ...card.attrs,
      id: String(card.attrs?.activityItemId ?? `${attrs.id}:${n}`),
      title: String(card.attrs?.title || plainText(card.content)),
      content: card.content
      // an empty title falls back to the card's text
    }))
  };
  if (kind === "spot" && (config.items.length || !config.settings.versions?.length)) {
    const previous = config.settings.versions;
    const versions = config.items.slice(0, 2).map((i, n) => ({ name: i.title || `Learner ${String.fromCharCode(65 + n)}`, picture: i.picture ?? { src: "", alt: "" } }));
    if (previous?.length && (previous.length !== versions.length || versions.some((version, n) => !sameActivityPictureFrame(version.picture, previous[n]?.picture)))) config.settings.differences = [];
    config.settings.versions = versions;
  }
  return config;
}
function parseItemList(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const at = line.includes("	") ? line.indexOf("	") : line.indexOf(" = ");
    const sep = line.includes("	") ? 1 : 3;
    return at < 0 ? { title: line } : { title: line.slice(0, at).trim(), match: line.slice(at + sep).trim() };
  });
}
function shuffled(items, random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function bingoCards(c, people, random = Math.random) {
  const size = c.settings.gridSize ?? 4, count = size * size;
  if (c.items.length <= count) throw new Error(`Bingo needs more than ${count} items.`);
  if (people.length > 500) throw new Error("Use no more than 500 Bingo cards in one set.");
  const used = /* @__PURE__ */ new Set(), cards = {};
  for (const person of people) {
    let card = [], signature = "";
    for (let attempt = 0; attempt < 1e3; attempt++) {
      card = shuffled(c.items.map((i) => i.id), random).slice(0, count);
      if (c.settings.freeCentre && size % 2) card[Math.floor(count / 2)] = "__free__";
      signature = card.join("\0");
      if (!used.has(signature)) break;
      if (attempt === 999) throw new Error("Could not make different cards. Shuffle the cards again.");
    }
    used.add(signature);
    cards[person.id] = card;
  }
  return cards;
}
function bingoClaim(card, marked, called, size, rule) {
  const calls = new Set(called), marks = new Set(marked);
  const uncalled = [...marks].filter((id) => id !== "__free__" && (!calls.has(id) || !card.includes(id)));
  const on = (n) => card[n] === "__free__" || marks.has(card[n]) && calls.has(card[n]);
  let lines = 0;
  for (let row = 0; row < size; row++) if (Array.from({ length: size }, (_, col) => on(row * size + col)).every(Boolean)) lines++;
  for (let col = 0; col < size; col++) if (Array.from({ length: size }, (_, row) => on(row * size + col)).every(Boolean)) lines++;
  if (Array.from({ length: size }, (_, n) => on(n * size + n)).every(Boolean)) lines++;
  if (Array.from({ length: size }, (_, n) => on(n * size + size - n - 1)).every(Boolean)) lines++;
  return { valid: !uncalled.length && (rule === "full" ? card.every((_, n) => on(n)) : lines >= (rule === "twoLines" ? 2 : 1)), lines, uncalled };
}
function dominoTiles(items) {
  return items.map((item, n) => ({ id: item.id, left: item.title, leftPicture: item.picture, rightPicture: items[(n + 1) % items.length]?.matchPicture, right: items[(n + 1) % items.length]?.match ?? "", leftPair: item.id, rightPair: items[(n + 1) % items.length]?.id ?? "" }));
}
function checkDominoes(items, order) {
  if (order.length !== items.length || new Set(order).size !== items.length) return false;
  const tiles = new Map(dominoTiles(items).map((t) => [t.id, t]));
  return order.every((id, n) => !!tiles.get(id) && (n === 0 || tiles.get(order[n - 1]).rightPair === tiles.get(id).leftPair));
}
function oppositePairs(values) {
  const a = [...values].sort((x, y) => x.value - y.value || x.id.localeCompare(y.id)), pairs = [];
  while (a.length > 1) pairs.push([a.shift().id, a.pop().id]);
  if (a.length) {
    if (pairs.length) pairs[pairs.length - 1].push(a[0].id);
    else pairs.push([a[0].id]);
  }
  return pairs;
}
function boardLayout(count, style = "snake") {
  const cols = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / cols);
  const cells = [];
  if (style === "spiral") {
    let left = 1, right = cols, top = 1, bottom = rows;
    while (left <= right && top <= bottom) {
      for (let col = left; col <= right; col++) cells.push({ row: top, col });
      top++;
      for (let row = top; row <= bottom; row++) cells.push({ row, col: right });
      right--;
      if (top <= bottom) {
        for (let col = right; col >= left; col--) cells.push({ row: bottom, col });
        bottom--;
      }
      if (left <= right) {
        for (let row = bottom; row >= top; row--) cells.push({ row, col: left });
        left++;
      }
    }
  } else for (let n = 0; n < count; n++) {
    const row = Math.floor(n / cols), col = n % cols;
    cells.push({ row: rows - row, col: style === "path" || row % 2 === 0 ? col + 1 : cols - col });
  }
  return { cols, rows, cells: cells.slice(0, count) };
}

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
function highlightScript(text) {
  const toks = [], groups = [], turns = [];
  for (const line of text.split(/\r?\n/).filter((x) => x.trim())) {
    const match = /^\s*([^:{}\n]{1,60}):\s*(.*)$/.exec(line);
    const part = tokenise(match ? match[2] : line), start = toks.length;
    toks.push(...part.toks);
    groups.push(...part.groups.map((g) => g.map((i) => i + start)));
    turns.push({ speaker: match?.[1].trim() || "", start, end: toks.length });
  }
  return { toks, groups, turns };
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
      const script = d.format === "dialogue" || d.format !== "text" && String(d.text ?? "").split(/\r?\n/).filter((line) => /^\s*[^:{}\n]{1,60}:\s*\S/.test(line)).length >= 2 ? highlightScript(d.text ?? "") : null;
      const { toks, groups } = script ?? tokenise(d.text ?? "");
      return { pub: { instruction: d.instruction ?? "", toks, penalty: !!d.penalty, ...script ? { format: "dialogue", turns: script.turns } : {} }, key: { groups: groups.map((tokens) => ({ tokens })), penalty: !!d.penalty } };
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
      return { pub: { image: d.image ?? "", ...d.imageSize ? { imageSize: d.imageSize } : {}, points: pts.map((p) => ({ x: p.x, y: p.y })), labels }, key: { map } };
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
function splitKey(content, keepActivities = false) {
  const key = {};
  const activities = {};
  const dropAnswers = [];
  const walk = (n) => {
    const out = { ...n };
    const a = n.attrs ?? {};
    const id = a.id;
    if (n.type === "communicativeActivity" && id && !keepActivities) {
      activities[id] = structuredClone(n);
      return { type: n.type, attrs: { id, kind: a.kind, instruction: a.instruction ?? "", sealed: true }, content: [] };
    }
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
        const rights = shuffle2([...pairs.map((p) => p.right).filter((r) => r.trim()), ...extras], id);
        const used = /* @__PURE__ */ new Set();
        const map = pairs.map((p) => {
          if (!p.right.trim()) return -1;
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
        if (a.noCorrectAnswer === true) {
          key[id].ungraded = true;
          out.attrs = { ...out.attrs, noCorrectAnswer: true };
        }
        if (a.spellingOverride === true) out.attrs = { ...out.attrs, spellingOverride: true };
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
  return { content: fillBanks(pub), key, activities };
}

// src/communicative/state.ts
function initialActivity(c, people, random = Math.random) {
  const deckMap = {};
  if (c.kind === "memory") for (const item of c.items) for (const side of ["a", "b"]) {
    let id = "";
    for (let tries = 0; tries < 32; tries++) {
      id = Math.floor(random() * 4294967295).toString(36) + Math.floor(random() * 4294967295).toString(36);
      if (!deckMap[id]) break;
    }
    if (deckMap[id]) throw new Error("Shuffle the cards again.");
    deckMap[id] = { itemId: item.id, side };
  }
  return {
    actorRevisions: {},
    seq: 0,
    phase: "ready",
    people: c.settings.turnOrder === "random" ? shuffled(people, random) : [...people],
    turn: 0,
    positions: Object.fromEntries(people.map((p) => [p.id, 0])),
    skip: {},
    scores: {},
    die: null,
    order: ["strips", "dominoes", "ranking", "speaking"].includes(c.kind) ? shuffled(c.items.map((i) => i.id), random) : c.items.map((i) => i.id),
    agreed: [],
    submitted: false,
    checked: false,
    correct: null,
    cards: c.kind === "bingo" ? bingoCards(c, people, random) : {},
    marked: {},
    called: [],
    currentCall: null,
    claims: {},
    faceUp: [],
    won: {},
    deckMap,
    deck: c.kind === "memory" ? shuffled(Object.keys(deckMap), random) : [],
    assignments: {},
    cardIndex: 0,
    round: 0,
    answers: {},
    details: {},
    opinions: {},
    found: {},
    startedAt: null,
    endsAt: null
  };
}
var currentPerson = (s) => s.people[s.turn % Math.max(1, s.people.length)];
var learnerCallVisibility = (c) => c.settings.learnerCalls ?? (c.settings.showCalls ? "current" : "none");
var sameIds = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
var cardPair = (s, id) => s.deckMap?.[id]?.itemId ?? id.slice(0, -2);
function transition(c, state, a, actor, now, random = Math.random) {
  const member = state.people.some((p) => p.id === actor.id);
  if (!actor.teacher && !member) throw new Error("Join this activity before playing.");
  const teacherOnly = () => {
    if (!actor.teacher) throw new Error("Your teacher controls this step.");
  };
  const ownTurn = () => {
    if (!actor.teacher && currentPerson(state)?.id !== actor.id) throw new Error("Wait for your turn.");
  };
  const running = () => {
    if (state.phase !== "running") throw new Error("Wait for your teacher to start.");
  };
  const itemExists = (id) => c.items.some((i) => i.id === id);
  let s = structuredClone(state);
  const advance = () => {
    if (!s.people.length) return;
    for (let n = 0; n < s.people.length * 2; n++) {
      s.turn = (s.turn + 1) % s.people.length;
      const id = currentPerson(s).id;
      if (!s.skip[id]) break;
      delete s.skip[id];
    }
  };
  switch (a.type) {
    case "start":
      teacherOnly();
      if (validateActivity(c).length) throw new Error(validateActivity(c)[0].message);
      if (state.phase !== "ready") throw new Error("Reset the activity before starting again.");
      if (!s.people.length) throw new Error("Add learners before starting.");
      s.phase = "running";
      s.startedAt = now;
      if (["speaking", "taboo"].includes(c.kind)) s.endsAt = now + (c.settings.seconds ?? 60) * 1e3;
      if (c.kind === "cue" && !Object.keys(s.assignments).length) {
        const items = shuffled(c.items, random);
        s.assignments = Object.fromEntries(s.people.map((p, n) => [p.id, [items[n % items.length].id]]));
      }
      if (c.kind === "spot") s.assignments = Object.fromEntries(s.people.map((p, n) => [p.id, [String(n % 2)]]));
      break;
    case "reset":
      teacherOnly();
      s = initialActivity(c, s.people, random);
      break;
    case "reveal":
      teacherOnly();
      s.phase = "revealed";
      if (["strips", "dominoes"].includes(c.kind)) {
        s.order = c.items.map((i) => i.id);
        s.correct = true;
        s.checked = true;
      }
      if (c.kind === "memory") s.faceUp = [...s.deck];
      break;
    case "end":
      teacherOnly();
      s.phase = "ended";
      s.endsAt = null;
      break;
    case "assign": {
      teacherOnly();
      if (c.kind !== "cue") throw new Error("This activity does not use cue-card assignments.");
      for (const [id, cards] of Object.entries(a.assignments)) {
        if (!s.people.some((p) => p.id === id) || !cards.every(itemExists)) throw new Error("Choose a learner and an available card.");
      }
      s.assignments = structuredClone(a.assignments);
      break;
    }
    case "roll": {
      running();
      ownTurn();
      if (c.kind !== "board" || s.die !== null) throw new Error("Finish the current square first.");
      if (!Number.isInteger(a.die) || a.die < 1 || a.die > 6) throw new Error("Roll a six-sided die.");
      const who = currentPerson(s).id;
      const pos = Math.min(c.items.length - 1, (s.positions[who] ?? 0) + a.die);
      const item = c.items[pos];
      s.positions[who] = pos;
      s.die = a.die;
      if (item.special === "back") s.positions[who] = Math.max(0, pos - Math.max(1, item.move ?? 2));
      if (item.special === "miss") s.skip[who] = true;
      if (pos === c.items.length - 1 || item.special === "finish") {
        s.phase = "ended";
        s.scores[currentPerson(s)?.teamId ?? who] = 1;
      }
      break;
    }
    case "nextTurn":
      running();
      ownTurn();
      if (c.kind === "board") {
        if (s.die === null) throw new Error("Roll the die first.");
        const again = c.items[s.positions[currentPerson(s).id]]?.special === "again";
        s.die = null;
        if (!again) advance();
      } else throw new Error("Use the controls for this activity.");
      break;
    case "call":
      teacherOnly();
      running();
      if (c.kind !== "bingo" || !itemExists(a.itemId) || s.called.includes(a.itemId)) throw new Error("Choose an item that has not been called.");
      s.called.push(a.itemId);
      s.currentCall = a.itemId;
      break;
    case "mark": {
      running();
      if (c.kind !== "bingo" || !s.cards[actor.id]?.includes(a.itemId) || a.itemId === "__free__") throw new Error("Choose a square on your card.");
      const marks = s.marked[actor.id] ?? [];
      s.marked[actor.id] = marks.includes(a.itemId) ? marks.filter((id) => id !== a.itemId) : [...marks, a.itemId];
      delete s.claims[actor.id];
      break;
    }
    case "claim":
      running();
      if (c.kind !== "bingo" || !s.cards[actor.id]) throw new Error("Choose your Bingo card first.");
      s.claims[actor.id] = bingoClaim(s.cards[actor.id], s.marked[actor.id] ?? [], s.called, c.settings.gridSize ?? 4, c.settings.winRule);
      break;
    case "flip": {
      running();
      ownTurn();
      if (c.kind !== "memory" || !s.deck.includes(a.cardId) || s.won[cardPair(s, a.cardId)] || s.faceUp.includes(a.cardId) || s.faceUp.length === 2) throw new Error("Choose a face-down card.");
      s.faceUp.push(a.cardId);
      if (s.faceUp.length === 2 && cardPair(s, s.faceUp[0]) === cardPair(s, s.faceUp[1])) {
        const who = currentPerson(s);
        s.won[cardPair(s, a.cardId)] = who.id;
        const scoreId = who.teamId ?? who.id;
        s.scores[scoreId] = (s.scores[scoreId] ?? 0) + 1;
        s.faceUp = [];
        if (Object.keys(s.won).length === c.items.length) s.phase = "ended";
      }
      break;
    }
    case "settle":
      running();
      ownTurn();
      if (c.kind !== "memory" || s.faceUp.length !== 2) throw new Error("Turn over two cards first.");
      s.faceUp = [];
      advance();
      break;
    case "order":
      running();
      if (!["ranking", "strips", "dominoes"].includes(c.kind) || !sameIds(a.ids, c.items.map((i) => i.id))) throw new Error("Keep every item in the list once.");
      s.order = [...a.ids];
      s.agreed = [];
      s.submitted = false;
      s.checked = false;
      s.correct = null;
      break;
    case "agree":
      running();
      if (c.kind !== "ranking" || !member) throw new Error("Only this group can agree its ranking.");
      if (!s.agreed.includes(actor.id)) s.agreed.push(actor.id);
      s.submitted = s.people.every((p) => s.agreed.includes(p.id));
      break;
    case "check":
      running();
      if (!["strips", "dominoes"].includes(c.kind)) throw new Error("This activity has no order to check.");
      s.checked = true;
      s.correct = c.kind === "dominoes" ? checkDominoes(c.items, s.order) : s.order.every((id, n) => id === c.items[n].id);
      break;
    case "answer": {
      running();
      const item = c.items.find((i) => i.id === a.itemId);
      if (!item || !["findSomeone", "survey"].includes(c.kind)) throw new Error("Choose an available question.");
      if (c.kind === "survey" && !item.options?.includes(a.value)) throw new Error("Choose one of the available answers.");
      if (c.kind === "findSomeone") {
        if (!s.people.some((p) => p.id === a.value) || a.value === actor.id) throw new Error("Choose a classmate.");
        if (c.settings.nameOnce && Object.entries(s.answers[actor.id] ?? {}).some(([id, value]) => id !== a.itemId && value === a.value)) throw new Error("Choose a name you have not used yet.");
      }
      s.answers[actor.id] = { ...s.answers[actor.id], [a.itemId]: a.value };
      if (a.detail !== void 0) s.details[actor.id] = { ...s.details[actor.id], [a.itemId]: a.detail.slice(0, 1e3) };
      break;
    }
    case "summary":
      running();
      if (c.kind !== "survey" || !member || typeof a.text !== "string") throw new Error("Write a summary of your survey.");
      s.summaries = { ...s.summaries, [actor.id]: a.text.slice(0, 2500) };
      break;
    case "opinion":
      running();
      if (c.kind !== "opinion" || !Number.isFinite(a.value) || a.value < 0 || a.value > 100) throw new Error("Choose a place on the line.");
      s.opinions[actor.id] = { value: a.value, reason: (a.reason ?? "").slice(0, 1e3) };
      break;
    case "found": {
      running();
      if (c.kind !== "spot" || !Number.isFinite(a.x) || !Number.isFinite(a.y) || a.x < 0 || a.x > 100 || a.y < 0 || a.y > 100) throw new Error("Choose a point inside your picture.");
      const hit = c.settings.differences?.find((d) => Math.hypot(d.x - a.x, d.y - a.y) <= d.radius);
      if (hit) {
        const own = s.found[actor.id] ?? [];
        const points = { ...s.foundPoints?.[actor.id] };
        if (own.includes(hit.id)) delete points[hit.id];
        else points[hit.id] = { x: a.x, y: a.y };
        s.found[actor.id] = own.includes(hit.id) ? own.filter((id) => id !== hit.id) : [...own, hit.id];
        s.foundPoints = { ...s.foundPoints, [actor.id]: points };
      }
      break;
    }
    case "gotIt":
    case "skip": {
      running();
      ownTurn();
      if (c.kind !== "taboo" || s.endsAt !== null && now >= s.endsAt) throw new Error("This turn has finished.");
      if (a.type === "gotIt" && c.settings.scoring !== false) {
        const who = currentPerson(s);
        const key = who.teamId ?? who.id;
        s.scores[key] = (s.scores[key] ?? 0) + 1;
      }
      s.cardIndex++;
      if (s.cardIndex >= c.items.length) s.phase = "ended";
      break;
    }
    case "timerElapsed":
      running();
      if (c.kind !== "speaking" || c.settings.mode !== "groups" || s.people.length !== 2 || s.endsAt === null || now < s.endsAt) throw new Error("Wait for this speaking turn to finish.");
      advance();
      s.round++;
      s.startedAt = now;
      s.endsAt = now + (c.settings.seconds ?? 60) * 1e3;
      break;
    case "swap":
      teacherOnly();
      if (!["speaking", "taboo"].includes(c.kind) || !["running", "ended"].includes(s.phase)) throw new Error("Start the speaking turns first.");
      advance();
      s.round++;
      s.phase = "running";
      s.startedAt = now;
      s.endsAt = now + (c.settings.seconds ?? 60) * 1e3;
      break;
    default:
      throw new Error("Choose an available action.");
  }
  s.seq = state.seq + 1;
  return s;
}
function stateForLearner(c, s, learnerId) {
  const out = structuredClone(s);
  out.actorRevisions = s.actorRevisions?.[learnerId] !== void 0 ? { [learnerId]: s.actorRevisions[learnerId] } : {};
  out.deckMap = Object.fromEntries(Object.entries(s.deckMap ?? {}).filter(([id, entry]) => s.faceUp.includes(id) || s.won[entry.itemId]));
  out.cards = s.cards[learnerId] ? { [learnerId]: s.cards[learnerId] } : {};
  out.marked = s.marked[learnerId] ? { [learnerId]: s.marked[learnerId] } : {};
  out.assignments = s.assignments[learnerId] ? { [learnerId]: s.assignments[learnerId] } : {};
  out.answers = s.answers[learnerId] ? { [learnerId]: s.answers[learnerId] } : {};
  out.details = s.details[learnerId] ? { [learnerId]: s.details[learnerId] } : {};
  out.claims = s.claims[learnerId] ? { [learnerId]: s.claims[learnerId] } : {};
  out.summaries = s.summaries?.[learnerId] ? { [learnerId]: s.summaries[learnerId] } : {};
  out.foundPoints = s.foundPoints?.[learnerId] ? { [learnerId]: s.foundPoints[learnerId] } : {};
  out.found = s.found[learnerId] ? { [learnerId]: s.found[learnerId] } : {};
  if (c.kind === "survey") out.surveyResults = Object.fromEntries(c.items.map((item) => [item.id, surveyCounts(s, item.id)]));
  if (c.kind === "opinion" && s.phase !== "revealed") out.opinions = s.opinions[learnerId] ? { [learnerId]: s.opinions[learnerId] } : {};
  else if (c.kind === "opinion" && c.settings.showNames === false) out.opinions = Object.fromEntries(Object.values(s.opinions).map((v, n) => [`anonymous-${n}`, v]));
  if (c.kind === "bingo") {
    const visibility = learnerCallVisibility(c);
    out.currentCall = visibility === "current" ? s.currentCall : null;
    out.called = visibility === "list" ? [...s.called] : visibility === "current" && s.currentCall ? [s.currentCall] : [];
  }
  return out;
}
function configForLearner(c, s, learnerId) {
  const out = structuredClone(c);
  out.items = out.items.map((item) => ({ ...item, ...item.content ? { content: splitKey({ type: "doc", content: item.content }).content.content } : {} }));
  if (c.kind === "bingo") {
    const visibility = learnerCallVisibility(c);
    const visibleCalls = visibility === "list" ? s.called : visibility === "current" && s.currentCall ? [s.currentCall] : [];
    const visibleIds = /* @__PURE__ */ new Set([...s.cards[learnerId] ?? [], ...visibleCalls]);
    const callIds = new Set(visibleCalls);
    out.items = out.items.filter((item) => visibleIds.has(item.id)).map((item) => ({ ...item, call: callIds.has(item.id) ? item.call : void 0 }));
  }
  if (c.kind === "memory") {
    const visible = Object.entries(s.deckMap ?? {}).filter(([id, entry]) => s.faceUp.includes(id) || s.won[entry.itemId]);
    if (s.deckMap) out.items = out.items.filter((item) => visible.some(([, entry]) => entry.itemId === item.id)).map((item) => {
      const a = visible.some(([, entry]) => entry.itemId === item.id && entry.side === "a"), b = visible.some(([, entry]) => entry.itemId === item.id && entry.side === "b");
      return { ...item, ...!a ? { title: "", content: [], picture: void 0 } : {}, ...!b ? { match: "", matchPicture: void 0 } : {} };
    });
  }
  if (c.kind === "dominoes") {
    const tiles = dominoTiles(c.items);
    out.items = s.order.map((id) => out.items.find((item) => item.id === id)).filter(Boolean).map((item) => {
      const tile = tiles.find((t) => t.id === item.id);
      return { ...item, match: void 0, matchPicture: void 0, dominoRight: { text: tile.right, ...tile.rightPicture ? { picture: tile.rightPicture } : {} } };
    });
  }
  if (c.kind === "strips" && s.phase !== "revealed") out.items = s.order.map((id) => out.items.find((item) => item.id === id)).filter(Boolean);
  if (s.phase === "revealed") return out;
  if (c.kind === "cue") out.items = out.items.filter((i) => s.assignments[learnerId]?.includes(i.id));
  if (c.kind === "taboo") out.items = currentPerson(s)?.id === learnerId ? out.items.slice(s.cardIndex, s.cardIndex + 1) : [];
  if (c.kind === "spot") {
    const version = Number(s.assignments[learnerId]?.[0]);
    out.items = Number.isInteger(version) ? out.items.slice(version, version + 1) : [];
    out.settings.versions = Number.isInteger(version) && out.settings.versions?.[version] ? [out.settings.versions[version]] : [];
    out.settings.differences = [];
  }
  return out;
}
function surveyCounts(s, itemId) {
  if (s.surveyResults?.[itemId]) return s.surveyResults[itemId];
  return Object.values(s.answers).reduce((out, answers) => {
    const a = answers[itemId];
    if (a) out[a] = (out[a] ?? 0) + 1;
    return out;
  }, {});
}
export {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  bingoCards,
  bingoClaim,
  boardLayout,
  checkDominoes,
  configForLearner,
  configFromNode,
  currentPerson,
  dominoTiles,
  initialActivity,
  learnerCallVisibility,
  oppositePairs,
  parseItemList,
  plainText,
  sameActivityPictureFrame,
  shuffled,
  stateForLearner,
  surveyCounts,
  transition,
  validateActivity
};
