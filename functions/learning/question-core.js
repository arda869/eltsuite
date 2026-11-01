// Generated from the learner renderer scoring implementation. Run node scripts/sync-learning-core.mjs.
// src/lib/pack.ts
var norm = (s) => String(s ?? "").normalize("NFKC").replace(/[‘’‚‛′`´ʼʹ＇]/g, "'").replace(/[“”„‟″«»＂]/g, '"').toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "").trim();
var words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean);
function diffWords(expected, typed) {
  const e = words(expected).map(norm);
  const t = words(typed).map(norm);
  const dp = Array.from({ length: e.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i2 = e.length - 1; i2 >= 0; i2--) for (let j2 = t.length - 1; j2 >= 0; j2--) dp[i2][j2] = e[i2] === t[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
  const okE = /* @__PURE__ */ new Set();
  const okT = /* @__PURE__ */ new Set();
  let i = 0;
  let j = 0;
  while (i < e.length && j < t.length) {
    if (e[i] === t[j]) okE.add(i), okT.add(j), i++, j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { expected: words(expected).map((w, k) => ({ w, ok: okE.has(k) })), typed: words(typed).map((w, k) => ({ w, ok: okT.has(k) })), got: okE.size, max: e.length };
}
function highlightGroups(value) {
  return Array.isArray(value) ? value.map((g) => Array.isArray(g) ? g : Array.isArray(g?.tokens) ? g.tokens : []).filter((g) => g.length) : [];
}
var arr = (r) => Array.isArray(r) ? r : [];
function scorePack(e, r) {
  const k = e.k;
  switch (e.t) {
    case "fix": {
      const pick = arr(r?.pick);
      const found = k.range.length > 0 && pick.length === k.range.length && pick.every((i) => k.range.includes(i));
      const fixed = found && (k.fixes ?? []).some((f) => norm(f) === norm(r?.fix ?? ""));
      return { got: (found ? 1 : 0) + (fixed ? 1 : 0), max: 2 };
    }
    case "categorise":
    case "label":
    case "gapped":
    case "matching": {
      const a = arr(r);
      return { got: k.map.filter((m, i) => a[i] === m && m >= 0).length, max: k.map.length };
    }
    case "transform": {
      const v = norm(r ?? "");
      return { got: v && (k.answers ?? []).some((a) => norm(a) === v) ? 1 : 0, max: 1 };
    }
    case "highlight": {
      const pick = new Set(arr(r));
      const groups = highlightGroups(k.groups);
      const found = groups.filter((g) => g.every((i) => pick.has(i))).length;
      const inAny = new Set(groups.flat());
      const wrong = [...pick].filter((i) => !inAny.has(i)).length;
      return { got: Math.max(0, found - (e.k.penalty === false ? 0 : wrong)), max: groups.length };
    }
    case "sentences": {
      const a = Array.isArray(r) && r.length ? arr(r) : (k.order ?? []).map((_, i) => i);
      return { got: (k.order ?? []).filter((o, i) => a[i] === o).length, max: (k.order ?? []).length };
    }
    case "odd":
      return { got: r && typeof r === "object" && r.pick === k.odd ? 1 : 0, max: 1 };
    case "speaking":
      return { got: 0, max: 0 };
    case "dictation": {
      const d = diffWords(k.sentence ?? "", typeof r === "string" ? r : "");
      return { got: d.got, max: d.max };
    }
    case "pairs": {
      const a = arr(r);
      return { got: (k.map ?? []).filter((m, i) => a[i] === m && m >= 0).length, max: (k.map ?? []).length };
    }
    case "crossword": {
      const cells = r && typeof r === "object" && !Array.isArray(r) ? r : {};
      let got = 0;
      const lay = k.layout ?? [];
      lay.forEach((p) => {
        let ok = p.word.length > 0;
        for (let i = 0; i < p.word.length && ok; i++) {
          const rr = p.dir === "across" ? p.row : p.row + i;
          const cc = p.dir === "across" ? p.col + i : p.col;
          if (norm(cells[rr + "," + cc] ?? "") !== norm(p.word[i])) ok = false;
        }
        if (ok) got++;
      });
      return { got, max: lay.length || (k.words ?? []).length };
    }
    case "wordsearch": {
      const found = new Set(Array.isArray(r) ? r.map((x) => String(x).split(",").slice(0, 4).join(",")) : []);
      const pl = k.placed ?? [];
      return { got: pl.filter((p) => found.has(`${p.row},${p.col},${p.dir}`)).length, max: pl.length };
    }
  }
}

// src/lib/questions.ts
var QUESTION_TYPES = ["gap", "mcq", "choice", "match", "dropgap", "order", "writing", "reflect", "upload", "pq", "tt"];
var isQuestion = (n) => !!n.attrs?.id && !n.attrs?.example && QUESTION_TYPES.includes(n.type ?? "") && !(n.type === "pq" && n.attrs?.kind === "speaking") && !(n.type === "tt" && n.attrs?.mode !== "complete");
function pickState(r) {
  if (Array.isArray(r)) return { h: r.filter((x) => typeof x === "number"), b: [] };
  if (r && typeof r === "object" && Array.isArray(r.h)) return { h: r.h, b: r.b ?? [] };
  return { h: [], b: [] };
}
function drawnCards(r) {
  const out = [];
  for (const x of pickState(r).h) if (!out.includes(x)) out.push(x);
  return out;
}
function questionIds(content, responses) {
  const out = [];
  const walk = (n) => {
    if (isQuestion(n)) out.push({ id: n.attrs.id, type: n.type === "pq" ? "pq:" + n.attrs.kind : n.type, rows: n.type === "match" ? (n.attrs?.left ?? []).length || 1 : 1 });
    if (n.type === "randomPick" && responses) {
      for (const i of drawnCards(responses[n.attrs?.id])) if (n.content?.[i]) walk(n.content[i]);
      return;
    }
    n.content?.forEach(walk);
  };
  if (content) walk(content);
  return out;
}
function normalise(s) {
  return s.normalize("NFKC").replace(/[‘’‚‛′`´ʼʹ＇]/g, "'").replace(/[“”„‟″«»＂]/g, '"').replace(/[‐-―]/g, "-").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "").trim();
}
function normaliseKeepCase(s) {
  return s.normalize("NFKC").replace(/[‘’‚‛′`´ʼʹ＇]/g, "'").replace(/[“”„‟″«»＂]/g, '"').replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "").trim();
}
function textOf(r) {
  if (r && typeof r === "object" && !Array.isArray(r) && "fields" in r) return Object.values(r.fields ?? {}).filter((x) => typeof x === "string" && x.trim()).join(" \xB7 ");
  if (r && typeof r === "object" && !Array.isArray(r)) {
    const parts = [];
    const walk = (n) => {
      if (n.text) parts.push(n.text);
      n.content?.forEach((c) => {
        walk(c);
        if (c.type === "paragraph" || c.type === "listItem") parts.push(" ");
      });
    };
    walk(r);
    return parts.join("").trim();
  }
  return r === void 0 || r === null ? "" : String(r);
}
var reflectAnswered = (r) => {
  const v = r;
  return !!v.ratings && Object.values(v.ratings).some((x) => typeof x === "number" ? x > 0 || x === 0 : Array.isArray(x) ? x.length > 0 : typeof x === "string" && !!x.trim());
};
var isAnswered = (r) => !!r && typeof r === "object" && !Array.isArray(r) && "files" in r ? (r.files?.length ?? 0) > 0 : !!r && typeof r === "object" && !Array.isArray(r) && "pick" in r ? Array.isArray(r.pick) ? r.pick.length > 0 : typeof r.pick === "number" : !!r && typeof r === "object" && !Array.isArray(r) && "ratings" in r ? reflectAnswered(r) : !!(r !== void 0 && !(r && typeof r === "object" && !Array.isArray(r) && !textOf(r)) && r !== void 0 && r !== null && r !== "" && !(Array.isArray(r) && (r.length === 0 || r.every((x) => x === -1 || x === null))));
function scoreQuestion(entry, r) {
  if (!entry) return { got: 0, max: 0 };
  switch (entry.kind) {
    case "gap":
      return { got: isAnswered(r) && entry.answers.some((a) => entry.cs ? normaliseKeepCase(a) === normaliseKeepCase(String(r)) : normalise(a) === normalise(String(r))) ? 1 : 0, max: 1 };
    case "mcq":
      return { got: isAnswered(r) && Number(r) === entry.correct ? 1 : 0, max: 1 };
    case "multi": {
      const picked = Array.isArray(r) ? r : [];
      if (!entry.correct.length) return { got: 0, max: 1 };
      const right = picked.filter((x) => entry.correct.includes(x)).length;
      const wrong = picked.length - right;
      return { got: Math.max(0, Math.round((right - wrong) / entry.correct.length * 100) / 100), max: 1 };
    }
    case "match": {
      const arr2 = Array.isArray(r) ? r : [];
      return { got: entry.map.filter((m, i) => arr2[i] === m).length, max: entry.map.length };
    }
    case "drop":
      return { got: isAnswered(r) && normalise(String(r)) === normalise(entry.answer) ? 1 : 0, max: 1 };
    case "order":
      return { got: isAnswered(r) && normalise(String(r)) === normalise(entry.answer) ? 1 : 0, max: 1 };
    case "writing":
      return { got: 0, max: 0 };
    case "pack":
      return scorePack(entry, r);
  }
}
export {
  isAnswered,
  questionIds,
  scoreQuestion
};
