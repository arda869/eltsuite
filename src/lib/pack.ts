// Question pack 1: block questions that share one editor node ("pq", with a kind).
// Each kind says how its editor data splits into what learners see plus an answer key,
// how the two merge back for editing, how an answer is scored and how it is shown in the
// live grid. Learners never receive the answers before checking.

export type PackKind = 'fix' | 'categorise' | 'transform' | 'highlight' | 'sentences' | 'label' | 'odd' | 'gapped' | 'matching' | 'speaking';
export const PACK_SCORED: PackKind[] = ['fix', 'categorise', 'transform', 'highlight', 'sentences', 'label', 'odd', 'gapped', 'matching'];

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
  }
};

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
      const cats: { name: string; items: string[] }[] = (d.cats ?? []).map((c: Data) => ({ name: String(c.name ?? ''), items: clean(c.items) }));
      const all = cats.flatMap((c, ci) => c.items.map((w) => ({ w, ci })));
      const mixed = shuffle(all, id);
      return { pub: { cats: cats.map((c) => c.name), items: mixed.map((x) => x.w) }, key: { map: mixed.map((x) => x.ci) } };
    }
    case 'transform':
      return { pub: { first: d.first ?? '', keyWord: String(d.keyWord ?? '').toUpperCase(), before: d.before ?? '', after: d.after ?? '', min: d.min ?? null, max: d.max ?? null }, key: { answers: clean(d.answers) } };
    case 'highlight': {
      const { toks, groups } = tokenise(d.text ?? '');
      return { pub: { instruction: d.instruction ?? '', toks, penalty: !!d.penalty }, key: { groups, penalty: !!d.penalty } };
    }
    case 'sentences': {
      const items = clean(d.items);
      const order = shuffle(items.map((_, i) => i), id);
      return { pub: { items: order.map((i) => items[i]) }, key: { order: items.map((_, i) => order.indexOf(i)) } };
    }
    case 'label': {
      const pts: { x: number; y: number; label: string }[] = (d.points ?? []).filter((p: Data) => String(p.label ?? '').trim());
      const labels = shuffle([...pts.map((p) => p.label.trim()), ...clean(d.extras)], id);
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
      const keep = ws.map((w, i) => ({ w, i })).filter((x) => x.w);
      const mixed = shuffle(keep, id);
      return { pub: { words: mixed.map((x) => x.w), reason: !!d.reason }, key: { odd: mixed.findIndex((x) => x.i === d.odd) } };
    }
    case 'gapped': {
      const removed = (d.removed ?? []).map((x: string) => String(x ?? '').trim());
      const extras = clean(d.extras);
      const opts = shuffle([...removed.map((r: string, i: number) => ({ r, i })), ...extras.map((r) => ({ r, i: -1 }))].filter((x) => x.r), id);
      return { pub: { text: d.text ?? '', options: opts.map((x) => x.r), gaps: removed.length }, key: { map: removed.map((_: string, i: number) => opts.findIndex((x) => x.i === i)) } };
    }
    case 'matching': {
      const st: { text: string; answer: number }[] = (d.statements ?? []).filter((s: Data) => String(s.text ?? '').trim());
      return { pub: { options: d.options ?? [], names: d.names ?? [], statements: st.map((s) => s.text) }, key: { map: st.map((s) => s.answer) } };
    }
    case 'speaking':
      return { pub: d, key: null };
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
      (k.groups ?? []).forEach((g: number[], gi: number) => g.forEach((i) => inG.set(i, gi)));
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
      const groups: number[][] = k.groups ?? [];
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
  }
}

export function packAnswered(t: PackKind, r: any) {
  if (r === undefined || r === null) return false;
  if (t === 'fix') return arr(r.pick).length > 0;
  if (t === 'odd') return typeof r.pick === 'number';
  if (t === 'transform') return !!String(r).trim();
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
      return (k.groups ?? []).flat();
    case 'sentences':
      return k.order;
    case 'odd':
      return { pick: k.odd };
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
      return (k.groups ?? []).map((g: number[]) => g.map((i) => p.toks?.[i]).join(' ')).join(', ');
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
    default:
      return '';
  }
}
