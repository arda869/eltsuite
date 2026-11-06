// A game. Each slide is ordinary task content (the same question blocks as a
// lesson, answers included), so a quiz can become a class task and a class task can be played as a quiz.
// Saved in sharedDocs/{id}/game/main (version 2). The server's rules are in functions/quiz/engine.js.
import type { JSONContent } from '@tiptap/react';
import { questionIds } from '../lib/questions';

export type SlideKind = 'choice' | 'truefalse' | 'type' | 'poll' | 'task';
export type QuizSlide = {
  id: string;
  kind: SlideKind;
  /** The slide as task content, with its answers. */
  content: JSONContent;
  /** Seconds to answer. */
  seconds: number;
  /** 0 no points, 1 standard, 2 double. */
  points: 0 | 1 | 2;
  /** How a multiple-choice question is answered: cards, moles or balloons. */
  skin?: 'cards' | 'moles' | 'balloons';
};
export type QuizDoc = { version: 2; slides: QuizSlide[]; music: string };
export type QuizPlan = { sizes: number[]; settings: { seconds: number; points: number; poll?: boolean; skin?: string; kind?: SlideKind; id?: string }[]; music?: string; source?: string };

export const SECONDS = [5, 10, 20, 30, 45, 60, 90, 120, 240] as const;
export const KINDS: { id: SlideKind; name: string; about: string }[] = [
  { id: 'choice', name: 'Multiple choice', about: 'Two to six answers. One or more are right.' },
  { id: 'truefalse', name: 'True or false', about: 'A statement. Learners say if it’s true.' },
  { id: 'type', name: 'Type the answer', about: 'Learners type a word or phrase. Add every answer you accept.' },
  { id: 'poll', name: 'Poll', about: 'An opinion question. No right answer and no points.' },
  { id: 'task', name: 'Any class question', about: 'Gap fill, matching, word order, drag and drop and every other marked question from your lessons.' },
];
export const MAX_SLIDES = 100;
export const MAX_OPTIONS = 6;

export const newId = () => Math.random().toString(36).slice(2, 10);
const para = (text = ''): JSONContent => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

export function newSlide(kind: SlideKind): QuizSlide {
  const base = { id: newId(), kind, seconds: kind === 'type' || kind === 'task' ? 30 : 20, points: (kind === 'poll' ? 0 : 1) as 0 | 1 | 2 };
  if (kind === 'choice') return { ...base, content: doc({ type: 'mcq', attrs: { id: newId(), prompt: '', options: ['', '', '', ''], correct: -1 } }) };
  if (kind === 'truefalse') return { ...base, content: doc({ type: 'mcq', attrs: { id: newId(), prompt: '', options: ['True', 'False'], correct: 0 } }) };
  if (kind === 'poll') return { ...base, content: doc({ type: 'mcq', attrs: { id: newId(), prompt: '', options: ['', '', ''], correct: -1 } }) };
  if (kind === 'type') return { ...base, content: doc(para(''), { type: 'paragraph', content: [{ type: 'gap', attrs: { id: newId(), answers: [] } }] }) };
  return { ...base, content: doc(para('')) };
}

export const blankQuiz = (): QuizDoc => ({ version: 2, slides: [newSlide('choice')], music: '' });

// ---- Reading and changing the quick slide kinds -----------------------------------------------------
type Choice = { prompt: string; options: string[]; correct: number[]; multi: boolean };
export function choiceOf(s: QuizSlide): Choice {
  const m = (s.content.content || []).find((n) => n.type === 'mcq');
  const a = m?.attrs || {};
  const multi = !!a.multi;
  const correct: number[] = multi ? (Array.isArray(a.correct) ? a.correct : []) : typeof a.correct === 'number' && a.correct >= 0 ? [a.correct] : [];
  return { prompt: String(a.prompt || ''), options: (a.options || []).map(String), correct, multi };
}
export function withChoice(s: QuizSlide, c: Partial<Choice>): QuizSlide {
  const cur = choiceOf(s);
  const next = { ...cur, ...c };
  const multi = next.correct.length > 1 || (c.multi ?? cur.multi);
  const id = (s.content.content || []).find((n) => n.type === 'mcq')?.attrs?.id || newId();
  const correct = s.kind === 'poll' ? -1 : multi ? next.correct : next.correct[0] ?? -1;
  return { ...s, content: doc({ type: 'mcq', attrs: { id, prompt: next.prompt, options: next.options, correct, ...(multi && s.kind !== 'poll' ? { multi: true } : {}) } }) };
}

type Typed = { prompt: string; answers: string[] };
export function typedOf(s: QuizSlide): Typed {
  const blocks = s.content.content || [];
  let gap: JSONContent | null = null;
  const walk = (n: JSONContent) => {
    if (n.type === 'gap') gap = n;
    n.content?.forEach(walk);
  };
  blocks.forEach(walk);
  const prompt = blocks[0]?.type === 'paragraph' && !(blocks[0].content || []).some((n) => n.type === 'gap') ? textOf(blocks[0]) : '';
  return { prompt, answers: ((gap as JSONContent | null)?.attrs?.answers || []).map(String) };
}
export function withTyped(s: QuizSlide, t: Partial<Typed>): QuizSlide {
  const cur = typedOf(s);
  const next = { ...cur, ...t };
  let id = '';
  const walk = (n: JSONContent) => {
    if (n.type === 'gap') id = n.attrs?.id;
    n.content?.forEach(walk);
  };
  (s.content.content || []).forEach(walk);
  return { ...s, content: doc(para(next.prompt), { type: 'paragraph', content: [{ type: 'gap', attrs: { id: id || newId(), answers: next.answers } }] }) };
}

export function textOf(n: JSONContent | undefined): string {
  if (!n) return '';
  if (n.type === 'text') return n.text || '';
  return (n.content || []).map(textOf).join('');
}

/** A one-line name for a slide in lists and results. */
export function slideTitle(s: QuizSlide): string {
  if (s.kind === 'type') return typedOf(s).prompt;
  if (s.kind !== 'task') return choiceOf(s).prompt;
  const words = (s.content.content || []).map(textOf).join(' ').replace(/\s+/g, ' ').trim();
  return words || KINDS.find((k) => k.id === 'task')!.name;
}

/** The marked questions in some content: long answers and uploads can’t be marked in a race. */
export const liveQuestions = (content: JSONContent | null | undefined) => (content ? questionIds(content).filter((q) => !['writing', 'reflect', 'upload'].includes(q.type)) : []);

/** What still needs doing before a slide can be played, or '' when it's ready. */
export function slideProblem(s: QuizSlide): string {
  if (s.kind === 'task') return liveQuestions(s.content).length ? '' : 'Add a question that can be marked, such as a gap or a matching task.';
  if (s.kind === 'type') {
    const t = typedOf(s);
    if (!t.prompt.trim()) return 'Write the question.';
    return t.answers.some((a) => a.trim()) ? '' : 'Add the answer.';
  }
  const c = choiceOf(s);
  if (!c.prompt.trim()) return s.kind === 'truefalse' ? 'Write the statement.' : 'Write the question.';
  const filled = c.options.filter((o) => o.trim()).length;
  if (filled < 2 || c.options.some((o) => !o.trim())) return 'Fill in every answer, or remove the empty ones.';
  if (new Set(c.options.map((o) => o.trim().toLowerCase())).size !== c.options.length) return 'Give each answer different words.';
  if (s.kind !== 'poll' && !c.correct.length) return 'Choose the right answer.';
  return '';
}
export const quizProblems = (q: QuizDoc) => q.slides.map((s, i) => ({ i, problem: slideProblem(s) })).filter((x) => x.problem);

/** A quiz as a class task: its content, and the plan that keeps its slides and timings. */
export function toTask(q: QuizDoc): { content: JSONContent; plan: QuizPlan } {
  const slides = q.slides.filter((s) => (s.content.content || []).length);
  return {
    content: doc(...slides.flatMap((s) => s.content.content || [])),
    plan: { sizes: slides.map((s) => (s.content.content || []).length), settings: slides.map((s) => ({ id: s.id, kind: s.kind, seconds: s.seconds, points: s.points, skin: s.skin || 'cards', ...(s.kind === 'poll' ? { poll: true } : {}) })), music: q.music || '' },
  };
}

// ---- Games saved before the quiz show ----------------------------------------------------------------
type LegacyRound = { id: string; prompt: string; answer: string; choices: string[]; content?: JSONContent; note?: string };
type Legacy = { version?: number; type?: string; rounds?: LegacyRound[]; showTimer?: number; roundSeconds?: number };
const seeded = <T,>(values: T[], seed: string) => {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return values.map((v) => ((n = (Math.imul(n, 1664525) + 1013904223) | 0), { v, k: n >>> 0 })).sort((a, b) => a.k - b.k).map((x) => x.v);
};

/** Any saved game becomes a quiz: choices become multiple choice, single answers become typed answers. */
export function fromSaved(data: unknown): QuizDoc {
  const d = (data || {}) as Partial<QuizDoc> & Legacy;
  if (d.version === 2 && Array.isArray(d.slides)) return { version: 2, slides: d.slides, music: d.music || '' };
  const seconds = [5, 10, 20, 30, 45, 60, 90, 120, 240].includes(d.showTimer || 0) ? d.showTimer! : 20;
  const slides: QuizSlide[] = (d.rounds || []).map((r) => {
    const base = { id: r.id || newId(), seconds, points: 1 as const };
    if (r.content) return { ...base, kind: 'task' as const, seconds: 30, content: r.prompt ? doc(para(r.prompt), ...(r.content.content || [])) : r.content };
    if (d.type === 'auction') {
      const right = r.answer.trim().toLowerCase() === 'correct';
      return { ...base, kind: 'truefalse' as const, content: doc({ type: 'mcq', attrs: { id: newId(), prompt: r.prompt, options: ['Correct', 'Incorrect'], correct: right ? 0 : 1 } }) };
    }
    const options = [...new Map([r.answer, ...(r.choices || [])].map((x) => x.trim()).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];
    if (options.length >= 2) {
      const shown = seeded(options, r.id || r.prompt).slice(0, MAX_OPTIONS);
      if (!shown.includes(r.answer.trim())) shown[0] = r.answer.trim();
      return { ...base, kind: 'choice' as const, content: doc({ type: 'mcq', attrs: { id: newId(), prompt: r.prompt, options: shown, correct: shown.indexOf(r.answer.trim()) } }) };
    }
    return { ...base, kind: 'type' as const, seconds: 30, content: doc(para(r.prompt), { type: 'paragraph', content: [{ type: 'gap', attrs: { id: newId(), answers: [r.answer] } }] }) };
  });
  return { version: 2, slides: slides.length ? slides : [newSlide('choice')], music: '' };
}

/** AI-drafted rounds (prompt, answer, wrong choices) become multiple-choice slides. */
export function slidesFromRounds(rounds: { prompt: string; answer: string; choices: string[] }[]): QuizSlide[] {
  return fromSaved({ rounds: rounds.map((r) => ({ ...r, id: newId() })) }).slides;
}

/** Questions whose answers can ride on moles or balloons: one right answer from a short list. */
export const canSkin = (s: QuizSlide) => (s.kind === 'choice' || s.kind === 'truefalse' || s.kind === 'poll') && !choiceOf(s).multi;

// ---- A game inside a lesson task -----------------------------------------------------------------------
// The block holds the game's questions as its own content, so they're marked, kept and shown to the
// teacher like any other question in the task; its attributes keep each question's settings.
export type GameBlockAttrs = { id: string; title: string; sizes: number[]; settings: QuizPlan['settings']; source?: string };

export function blockFromQuiz(q: QuizDoc, title: string, id = newId(), source?: string): JSONContent {
  const { content, plan } = toTask(q);
  return { type: 'gameBlock', attrs: { id, title: title || 'Game', sizes: plan.sizes, settings: plan.settings, ...(source ? { source } : {}) }, content: content.content?.length ? content.content : [{ type: 'paragraph' }] };
}

export function quizFromBlock(node: JSONContent): QuizDoc {
  const a = (node.attrs || {}) as Partial<GameBlockAttrs>;
  const blocks = node.content || [];
  const sizes = Array.isArray(a.sizes) && a.sizes.reduce((x, y) => x + y, 0) === blocks.length ? a.sizes : null;
  if (!sizes || !blocks.length) return blankQuiz();
  let at = 0;
  const slides: QuizSlide[] = sizes.map((n, i) => {
    const set = a.settings?.[i] || ({} as QuizPlan['settings'][number]);
    const content = doc(...blocks.slice(at, (at += n)));
    const kind: SlideKind = set.kind && KINDS.some((k) => k.id === set.kind) ? set.kind : set.poll ? 'poll' : 'task';
    return { id: set.id || newId(), kind, content, seconds: SECONDS.includes(set.seconds as (typeof SECONDS)[number]) ? set.seconds : 20, points: ([0, 1, 2].includes(set.points) ? set.points : 1) as 0 | 1 | 2, skin: (['cards', 'moles', 'balloons'].includes(String(set.skin)) ? set.skin : 'cards') as QuizSlide['skin'] };
  });
  return { version: 2, slides, music: '' };
}

/** A copy of a game with fresh question ids, so two copies in one lesson keep their answers apart. */
export function freshIds(q: QuizDoc): QuizDoc {
  return JSON.parse(JSON.stringify(q).replace(/"id":"[a-z0-9]{8}"/g, () => `"id":"${newId()}"`));
}
