import type { JSONContent } from '@tiptap/react';
import { newId } from './tasks';
import type { ImportedTask, ImportError } from './textformat';

// Imports Moodle GIFT question files. Questions become one task per category (or one task
// for the whole file): multiple choice → choice, true/false → choice, short answer and
// numeric → gap, matching → match, essay → writing, missing word → choice inside the sentence.

type Q = { line: number; title: string; text: string; body: string | null; after: string; category?: string };

const unesc = (s: string) => s.replace(/\\([{}=~#:\\])/g, '$1').replace(/\\n/g, '\n');
const stripFormat = (s: string) =>
  s
    .replace(/^\s*\[(html|markdown|plain|moodle)\]\s*/i, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
const T = (text: string): JSONContent => ({ type: 'text', text });
const P = (content: JSONContent[]): JSONContent => ({ type: 'paragraph', content: content.filter((c) => c.type !== 'text' || c.text) });

// Splits the file into raw questions, honouring escapes, comments and $CATEGORY lines.
function tokenize(src: string): { qs: Q[]; errors: ImportError[] } {
  const qs: Q[] = [];
  const errors: ImportError[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let buf: string[] = [];
  let start = 0;
  let category: string | undefined;
  const flush = (end: number) => {
    const raw = buf.join('\n').trim();
    buf = [];
    if (!raw) return;
    const cat = /^\$CATEGORY:\s*(.+)$/m.exec(raw);
    if (cat) {
      category = cat[1].trim().split('/').pop();
      return;
    }
    const q = parseRaw(raw, start + 1);
    if ('error' in q) errors.push({ line: start + 1, message: q.error });
    else qs.push({ ...q, category });
    void end;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\/\//.test(l)) continue;
    if (!l.trim()) {
      // a blank line ends a question unless we are inside unmatched braces
      const open = depth(buf.join('\n'));
      if (open <= 0) {
        flush(i);
        start = i + 1;
      } else buf.push(l);
      continue;
    }
    if (!buf.length) start = i;
    buf.push(l);
  }
  flush(lines.length);
  return { qs, errors };
}
function depth(s: string) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === '{') d++;
    else if (s[i] === '}') d--;
  }
  return d;
}
function parseRaw(raw: string, line: number): Omit<Q, 'category'> | { error: string } {
  let title = '';
  let rest = raw;
  const tm = /^::((?:\\:|[^:])*?)::/s.exec(rest);
  if (tm) {
    title = unesc(tm[1]).trim();
    rest = rest.slice(tm[0].length);
  }
  // find the answer block { ... } (first unescaped brace at depth 0)
  let open = -1;
  let close = -1;
  let d = 0;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '\\') {
      i++;
      continue;
    }
    if (rest[i] === '{') {
      if (d === 0) open = i;
      d++;
    } else if (rest[i] === '}') {
      d--;
      if (d === 0) {
        close = i;
        break;
      }
    }
  }
  if (open < 0) return { line, title, text: stripFormat(unesc(rest)), body: null, after: '' };
  if (close < 0) return { error: 'A { was opened but never closed' };
  return { line, title, text: stripFormat(unesc(rest.slice(0, open))), body: rest.slice(open + 1, close).trim(), after: stripFormat(unesc(rest.slice(close + 1))) };
}

// Splits an answer body into answers, each starting with = or ~, with optional %weight% and #feedback.
type Ans = { right: boolean; weight: number | null; text: string; feedback: string };
function answers(body: string): Ans[] {
  const out: Ans[] = [];
  let cur = '';
  const push = () => {
    const s = cur.trim();
    cur = '';
    if (!s) return;
    const right = s[0] === '=';
    let t = s.slice(1).trim();
    let weight: number | null = null;
    const w = /^%(-?\d+(?:\.\d+)?)%/.exec(t);
    if (w) {
      weight = Number(w[1]);
      t = t.slice(w[0].length).trim();
    }
    let feedback = '';
    const fi = indexUnescaped(t, '#');
    if (fi >= 0) {
      feedback = stripFormat(unesc(t.slice(fi + 1)));
      t = t.slice(0, fi).trim();
    }
    out.push({ right, weight, text: stripFormat(unesc(t)), feedback });
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\') {
      cur += ch + (body[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '=' || ch === '~') {
      // a new answer begins at every unescaped = or ~
      push();
      cur = ch;
      continue;
    }
    cur += ch;
  }
  push();
  return out;
}
function indexUnescaped(s: string, ch: string) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === ch) return i;
  }
  return -1;
}

type Built = { blocks: JSONContent[]; kind: string } | { error: string };
function build(q: Q): Built {
  const text = q.text;
  const lead = (extra: JSONContent[] = []) => [...(text ? [P([T(text), ...extra])] : extra.length ? [P(extra)] : [])];
  if (q.body === null) return { kind: 'text', blocks: [P([T(text)])] };
  const body = q.body;
  if (body === '') return { kind: 'essay', blocks: [...lead(), { type: 'writing', attrs: { id: newId(), minWords: null, maxWords: null, model: '', rich: false, spellcheck: false, points: 5, genre: '', rubric: 'none', criteria: [] } }] };
  if (/^(T|F|TRUE|FALSE)(\s*#.*)?$/is.test(body)) {
    const right = /^T/i.test(body) ? 0 : 1;
    const fb = body.split('#').slice(1).map((s) => stripFormat(unesc(s)));
    return { kind: 'tf', blocks: lead([T(' '), { type: 'choice', attrs: { id: newId(), options: ['True', 'False'], correct: right, multi: false, display: 'letters', hint: '', feedback: fb[1] ?? fb[0] ?? '', optFeedback: [] } }]) };
  }
  if (body.startsWith('#')) {
    // numeric: {#5}, {#5:0.1}, {#1..5}, {#=5 =%50%4:1}
    const parts = answers(body.slice(1).trim().replace(/^(?![=~])/, '='));
    const accepted = parts.filter((a) => a.right && (a.weight === null || a.weight >= 100)).map((a) => numericText(a.text));
    const alt = parts.filter((a) => a.right && a.weight !== null && a.weight < 100).map((a) => numericText(a.text));
    return { kind: 'numeric', blocks: lead([T(' '), { type: 'gap', attrs: { id: newId(), answers: [...accepted, ...alt].filter(Boolean), caseSensitive: false, hint: '', feedback: '' } }, ...(q.after ? [T(' ' + q.after)] : [])]) };
  }
  const list = answers(body);
  if (!list.length) return { error: 'The answer block has no answers' };
  if (list.some((a) => a.text.includes('->'))) {
    const pairs = list.filter((a) => a.text.includes('->')).map((a) => {
      const [l, r] = a.text.split('->').map((s) => s.trim());
      return { left: l, right: r };
    });
    return { kind: 'match', blocks: [...lead(), { type: 'match', attrs: { id: newId(), pairs, extras: [], hint: '', feedback: '' } }] };
  }
  const rights = list.filter((a) => a.right);
  const wrongs = list.filter((a) => !a.right);
  if (rights.length && !wrongs.length) {
    // short answer: every answer is accepted; weights under 100 are still accepted (no partial credit here)
    const node: JSONContent = { type: 'gap', attrs: { id: newId(), answers: rights.map((a) => a.text).filter(Boolean), caseSensitive: false, hint: '', feedback: rights.find((a) => a.feedback)?.feedback ?? '' } };
    return { kind: 'short', blocks: q.after ? [P([T(text + ' '), node, T(' ' + q.after)])] : lead([T(' '), node]) };
  }
  // multiple choice, possibly with weights (several right answers)
  const weighted = list.filter((a) => a.weight !== null && a.weight > 0);
  const multi = !rights.length && weighted.length > 1 ? true : rights.length > 1;
  const options = list.map((a) => a.text);
  const correctIdx = list.map((a, i) => (a.right || (a.weight !== null && a.weight > 0) ? i : -1)).filter((i) => i >= 0);
  const general = q.after && /^#{4}/.test(q.after) ? q.after.replace(/^#{4}\s*/, '') : '';
  const node: JSONContent = {
    type: 'choice',
    attrs: { id: newId(), options, correct: multi ? correctIdx : correctIdx[0] ?? -1, multi, display: 'letters', hint: '', feedback: general, optFeedback: list.map((a) => (a.right ? '' : a.feedback)) },
  };
  if (q.after && !general) return { kind: 'missing', blocks: [P([T(text + ' '), node, T(' ' + q.after)])] };
  return { kind: 'mcq', blocks: lead([T(' '), node]) };
}
function numericText(s: string) {
  // "5:0.5" → "5", "1..5" → "1" (ranges collapse to their first value; exact matching only)
  const m = /^(-?\d+(?:\.\d+)?)/.exec(s.trim());
  return m ? m[1] : s.trim();
}

export function importGift(src: string): { title: string; tasks: ImportedTask[]; errors: ImportError[]; count: number } {
  const { qs, errors } = tokenize(src);
  const groups = new Map<string, { line: number; blocks: JSONContent[]; n: number }>();
  let count = 0;
  for (const q of qs) {
    const b = build(q);
    if ('error' in b) {
      errors.push({ line: q.line, message: b.error });
      continue;
    }
    const key = q.category ?? '';
    if (!groups.has(key)) groups.set(key, { line: q.line, blocks: [], n: 0 });
    const g = groups.get(key)!;
    g.n++;
    count++;
    const titled = q.title && q.title !== q.text ? [{ type: 'heading', attrs: { level: 3 }, content: [T(q.title)] } as JSONContent] : [];
    g.blocks.push(...titled, ...b.blocks);
  }
  const tasks: ImportedTask[] = [...groups.entries()].map(([cat, g]) => ({
    line: g.line,
    kind: 'task',
    title: cat || 'Questions',
    instructions: '',
    content: { type: 'doc', content: g.blocks.length ? g.blocks : [P([])] },
  }));
  return { title: 'Imported questions', tasks, errors, count };
}

export const looksLikeGift = (text: string) => /(^|\n)\s*(::|\$CATEGORY:)|\{\s*(=|~|T\b|F\b|TRUE\b|FALSE\b|#)/.test(text) && !/^\s*#\s/.test(text);
