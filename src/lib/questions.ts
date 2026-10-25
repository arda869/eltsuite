// Question types: what is public, what goes into the answer key, and how answers are scored.
import type { JSONContent } from '@tiptap/react';

export type KeyEntry = (
  | { kind: 'gap'; answers: string[] }
  | { kind: 'mcq'; correct: number }
  | { kind: 'multi'; correct: number[] }
  | { kind: 'match'; map: number[] } // for each left item, the index of the matching right item (as shown)
  | { kind: 'drop'; answer: string }
  | { kind: 'order'; answer: string }
  | { kind: 'writing'; model: string }
) & { feedback?: string; hint?: string };
export type AnswerKey = Record<string, KeyEntry>;
export type Response = string | number | number[] | JSONContent | null | undefined;
export type Responses = Record<string, Response>;

export const QUESTION_TYPES = ['gap', 'mcq', 'choice', 'match', 'dropgap', 'order', 'writing', 'reflect'] as const;
export const isQuestion = (n: JSONContent) => !!n.attrs?.id && (QUESTION_TYPES as readonly string[]).includes(n.type ?? '');

// Seeded shuffle so a question always appears in the same shuffled order.
export function shuffle<T>(list: T[], seed: string): T[] {
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
  return a;
}

export const splitWords = (s: string) => s.trim().split(/\s+/).filter(Boolean);

// Splitting: editor content (with answers) -> public content + key ------------------

export function splitKey(content: JSONContent): { content: JSONContent; key: AnswerKey } {
  const key: AnswerKey = {};
  const dropAnswers: string[] = [];

  const walk = (n: JSONContent): JSONContent => {
    const out: JSONContent = { ...n };
    const a = n.attrs ?? {};
    const id = a.id as string | undefined;
    if (id) {
      if (n.type === 'gap') {
        key[id] = { kind: 'gap', answers: (a.answers ?? []).filter((x: string) => x.trim()) };
        out.attrs = { ...a, answers: [] };
      } else if (n.type === 'mcq' || n.type === 'choice') {
        if (a.multi) {
          key[id] = { kind: 'multi', correct: Array.isArray(a.correct) ? a.correct : [] };
          out.attrs = { ...a, correct: [] };
        } else {
          key[id] = { kind: 'mcq', correct: typeof a.correct === 'number' ? a.correct : -1 };
          out.attrs = { ...a, correct: -1 };
        }
      } else if (n.type === 'match') {
        const pairs: { left: string; right: string }[] = (a.pairs ?? []).filter((p: { left: string; right: string }) => p.left.trim() || p.right.trim());
        const extras: string[] = (a.extras ?? []).filter((x: string) => x.trim());
        const rights = shuffle([...pairs.map((p) => p.right), ...extras], id);
        const used = new Set<number>();
        const map = pairs.map((p) => {
          const i = rights.findIndex((r, k) => r === p.right && !used.has(k));
          used.add(i);
          return i;
        });
        key[id] = { kind: 'match', map };
        out.attrs = { id, left: pairs.map((p) => p.left), right: rights };
      } else if (n.type === 'dropgap') {
        key[id] = { kind: 'drop', answer: (a.answer ?? '').trim() };
        if ((a.answer ?? '').trim()) dropAnswers.push(a.answer.trim());
        out.attrs = { id };
      } else if (n.type === 'order') {
        const sentence = (a.sentence ?? '').trim();
        key[id] = { kind: 'order', answer: sentence };
        out.attrs = { id, words: shuffle(splitWords(sentence), id) };
      } else if (n.type === 'writing') {
        key[id] = { kind: 'writing', model: a.model ?? '' };
        out.attrs = { id, minWords: a.minWords ?? null, maxWords: a.maxWords ?? null, rich: !!a.rich, spellcheck: !!a.spellcheck };
      }
      if (key[id]) {
        if (a.feedback?.trim()) key[id].feedback = a.feedback.trim();
        if (a.hint?.trim()) key[id].hint = a.hint.trim();
        if (out.attrs) {
          const { feedback: _f, hint: _h, ...rest } = out.attrs as Record<string, unknown>;
          void _f;
          void _h;
          out.attrs = rest;
        }
      }
    }
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  const pub = walk(content);

  // Word banks show every drag-and-drop answer in the task plus extra words, shuffled.
  const fillBanks = (n: JSONContent): JSONContent => {
    const out: JSONContent = { ...n };
    if (n.type === 'wordbank') {
      const extras = (n.attrs?.extras ?? []).filter((x: string) => x.trim());
      out.attrs = { ...n.attrs, words: shuffle([...dropAnswers, ...extras], 'bank' + dropAnswers.join('|')) };
    }
    if (n.content) out.content = n.content.map(fillBanks);
    return out;
  };
  return { content: fillBanks(pub), key };
}

// Merging: public content + key -> editor content ---------------------------------

export function mergeKey(content: JSONContent, key: AnswerKey): JSONContent {
  const walk = (n: JSONContent): JSONContent => {
    const out: JSONContent = { ...n };
    const a = n.attrs ?? {};
    const k = a.id ? key[a.id] : undefined;
    if (k) {
      if (n.type === 'gap' && k.kind === 'gap') out.attrs = { ...a, answers: k.answers };
      if ((n.type === 'mcq' || n.type === 'choice') && (k.kind === 'mcq' || k.kind === 'multi')) out.attrs = { ...a, correct: k.correct };
      if (n.type === 'match' && k.kind === 'match') {
        const right: string[] = a.right ?? [];
        const usedIdx = new Set(k.map);
        out.attrs = {
          id: a.id,
          pairs: (a.left ?? []).map((l: string, i: number) => ({ left: l, right: right[k.map[i]] ?? '' })),
          extras: right.filter((_, i) => !usedIdx.has(i)),
        };
      }
      if (n.type === 'dropgap' && k.kind === 'drop') out.attrs = { ...a, answer: k.answer };
      if (n.type === 'order' && k.kind === 'order') out.attrs = { id: a.id, sentence: k.answer };
      if (n.type === 'writing' && k.kind === 'writing') out.attrs = { ...a, model: k.model };
      out.attrs = { ...out.attrs, feedback: k.feedback ?? '', hint: k.hint ?? '' };
    }
    if (n.type === 'wordbank') out.attrs = { extras: a.extras ?? [] };
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  return walk(content);
}

// Questions in reading order --------------------------------------------------------

export type QRef = { id: string; type: string; rows: number };

// Cards a learner has drawn in a "draw a card" activity, in the order first drawn.
// The response is the full draw history (a card can come up more than once).
export type PickState = { h: number[]; b: number[] }; // h: cards in draw order, b: boxes opened
export function pickState(r: Response): PickState {
  if (Array.isArray(r)) return { h: r.filter((x): x is number => typeof x === 'number'), b: [] };
  if (r && typeof r === 'object' && Array.isArray((r as PickState).h)) return { h: (r as PickState).h, b: (r as PickState).b ?? [] };
  return { h: [], b: [] };
}
export function drawnCards(r: Response): number[] {
  const out: number[] = [];
  for (const x of pickState(r).h) if (!out.includes(x)) out.push(x);
  return out;
}

// Questions in reading order. With responses, a "draw a card" activity only counts the
// questions on cards the learner has drawn; without them (teacher views) it counts all.
export function questionIds(content: JSONContent | null, responses?: Responses): QRef[] {
  const out: QRef[] = [];
  const walk = (n: JSONContent) => {
    if (isQuestion(n)) out.push({ id: n.attrs!.id, type: n.type!, rows: n.type === 'match' ? (n.attrs?.left ?? []).length || 1 : 1 });
    if (n.type === 'randomPick' && responses) {
      for (const i of drawnCards(responses[n.attrs?.id])) if (n.content?.[i]) walk(n.content[i]);
      return;
    }
    n.content?.forEach(walk);
  };
  if (content) walk(content);
  return out;
}

// Checking ------------------------------------------------------------------------

export function normalise(s: string) {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′`´ʼʹ＇]/g, "'")
    .replace(/[“”„‟″«»＂]/g, '"')
    .replace(/[‐-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
}

// Plain text of a rich-text answer.
export function textOf(r: Response): string {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const parts: string[] = [];
    const walk = (n: JSONContent) => {
      if (n.text) parts.push(n.text);
      n.content?.forEach((c) => {
        walk(c);
        if (c.type === 'paragraph' || c.type === 'listItem') parts.push(' ');
      });
    };
    walk(r as JSONContent);
    return parts.join('').trim();
  }
  return r === undefined || r === null ? '' : String(r);
}

const reflectAnswered = (r: Response) => {
  const v = r as { ratings?: Record<string, unknown> };
  return !!v.ratings && Object.values(v.ratings).some((x) => (typeof x === 'number' ? x > 0 || x === 0 : Array.isArray(x) ? x.length > 0 : typeof x === 'string' && !!x.trim()));
};
export const isAnswered = (r: Response): boolean =>
  !!r && typeof r === 'object' && !Array.isArray(r) && 'ratings' in (r as object) ? reflectAnswered(r) : !!(
  r !== undefined && !(r && typeof r === 'object' && !Array.isArray(r) && !textOf(r)) &&
  r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && (r.length === 0 || r.every((x) => x === -1 || x === null))));

export function scoreQuestion(entry: KeyEntry | undefined, r: Response): { got: number; max: number } {
  if (!entry) return { got: 0, max: 0 };
  switch (entry.kind) {
    case 'gap':
      return { got: isAnswered(r) && entry.answers.some((a) => normalise(a) === normalise(String(r))) ? 1 : 0, max: 1 };
    case 'mcq':
      return { got: isAnswered(r) && Number(r) === entry.correct ? 1 : 0, max: 1 };
    case 'multi': {
      const chosen = Array.isArray(r) ? [...r].sort().join(',') : '';
      return { got: chosen && chosen === [...entry.correct].sort().join(',') ? 1 : 0, max: 1 };
    }
    case 'match': {
      const arr = Array.isArray(r) ? r : [];
      return { got: entry.map.filter((m, i) => arr[i] === m).length, max: entry.map.length };
    }
    case 'drop':
      return { got: isAnswered(r) && normalise(String(r)) === normalise(entry.answer) ? 1 : 0, max: 1 };
    case 'order':
      return { got: isAnswered(r) && normalise(String(r)) === normalise(entry.answer) ? 1 : 0, max: 1 };
    case 'writing':
      return { got: 0, max: 0 }; // marked by the teacher
  }
}

export const isCorrect = (entry: KeyEntry | undefined, r: Response) => {
  const s = scoreQuestion(entry, r);
  return s.max > 0 && s.got === s.max;
};

export function scoreTask(qs: QRef[], key: AnswerKey, responses: Responses) {
  let got = 0;
  let max = 0;
  for (const q of qs) {
    const s = scoreQuestion(key[q.id], responses[q.id]);
    got += s.got;
    max += s.max;
  }
  return { score: got, total: max, hasWriting: qs.some((q) => q.type === 'writing' || q.type === 'reflect') };
}
