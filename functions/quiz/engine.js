// The live quiz show's rules, with no database in them: how task content becomes slides, what the
// players' phones may see, and how an answer is scored. Used by the server (service.js) and by the
// test stand-ins (test/mock/functions.ts), so both play by exactly the same rules.
import { questionIds, scoreQuestion } from '../learning/question-core.js';

/** Question types that can't be marked in a race. They are left out of live slides. */
const UNSCORED = new Set(['writing', 'reflect', 'upload']);
export const SECONDS = [5, 10, 20, 30, 45, 60, 90, 120, 240];
export const DEFAULT_SECONDS = 20;
/** Seconds of 3, 2, 1 before each question opens. */
export const COUNTDOWN_MS = 3500;
/** Answers that arrive this long after the clock (network delay) still count. */
export const GRACE_MS = 1500;
export const MAX_PLAYERS = 300;
/** How a multiple-choice question is answered: cards to tap, moles that pop up and hide, or balloons drifting in the wind. */
export const SKINS = ['cards', 'moles', 'balloons'];
/** Seconds of "get ready" before each question when a learner plays at their own pace. */
export const SELF_READY_MS = 1500;

/** The game block with this id in some task content, or null. */
export function findBlock(content, blockId) {
  let found = null;
  const walk = (n) => {
    if (found || !n) return;
    if (n.type === 'gameBlock' && n.attrs?.id === blockId) found = n;
    else (n.content || []).forEach(walk);
  };
  walk(content);
  return found;
}

const doc = (blocks) => ({ type: 'doc', content: blocks });
const inPick = (content) => {
  const ids = new Set();
  const walk = (n, cards) => {
    if (cards && n?.attrs?.id) ids.add(n.attrs.id);
    (n?.content || []).forEach((c) => walk(c, cards || n.type === 'randomPick'));
  };
  walk(content, false);
  return ids;
};

/** The marked questions in some content, in reading order. */
export function liveQuestions(content) {
  if (!content) return [];
  const cards = inPick(content);
  return questionIds(content).filter((q) => !UNSCORED.has(q.type) && !cards.has(q.id));
}

/**
 * A slide is the blocks up to and including the next block that holds a question: a heading, a picture
 * or a sentence before a question goes on the screen with it. Blocks after the last question join the
 * last slide. settings[i] tunes slide i: { seconds, points: 0 | 1 | 2, poll }.
 */
export function slidesOf(content, settings = [], sizes = null) {
  const blocks = content?.content || [];
  // A quiz made in the quiz editor says how many blocks each slide has. Trust that only while it
  // still adds up (the task may have been edited since); otherwise read the blocks in order.
  const groups = [];
  if (Array.isArray(sizes) && sizes.length && sizes.every((n) => Number.isInteger(n) && n > 0) && sizes.reduce((a, b) => a + b, 0) === blocks.length) {
    let at = 0;
    for (const n of sizes) groups.push(blocks.slice(at, (at += n)));
  } else {
    let cur = [];
    for (const b of blocks) {
      cur.push(b);
      if (liveQuestions(doc([b])).length) groups.push(cur), (cur = []);
    }
    if (cur.length) groups.push(cur);
  }
  const slides = [];
  let lead = [];
  for (const g of groups) {
    const qs = liveQuestions(doc(g));
    if (!qs.length) {
      lead.push(...g);
      continue;
    }
    slides.push({ blocks: [...lead, ...g], qids: qs.map((q) => q.id), types: qs.map((q) => q.type) });
    lead = [];
  }
  if (lead.length && slides.length) slides[slides.length - 1].blocks.push(...lead);
  return slides.map((s, i) => {
    const set = settings[i] || {};
    const seconds = SECONDS.includes(set.seconds) ? set.seconds : DEFAULT_SECONDS;
    const points = [0, 1, 2].includes(set.points) ? set.points : 1;
    const skin = SKINS.includes(set.skin) ? set.skin : 'cards';
    return { ...s, index: i, seconds, points: set.poll ? 0 : points, poll: !!set.poll, skin };
  });
}

/** The single multiple-choice question on a slide, when that's all it asks. */
function choiceOf(slide) {
  if (slide.qids.length !== 1 || slide.types[0] !== 'mcq') return null;
  let found = null;
  const walk = (n) => {
    if (n?.type === 'mcq' && n.attrs?.id === slide.qids[0]) found = n;
    (n?.content || []).forEach(walk);
  };
  slide.blocks.forEach(walk);
  return found;
}

/** A short, answer-free name for a slide, for the results page. */
export function slideLabel(slide) {
  const text = (n) => (n?.type === 'text' ? n.text || '' : n?.type === 'mcq' ? String(n.attrs?.prompt || '') : n?.type === 'gap' || n?.type === 'dropgap' ? '___' : (n?.content || []).map(text).join(''));
  const t = slide.blocks.map(text).join(' ').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 139) + '…' : t || 'Question ' + (slide.index + 1);
}

/**
 * What everyone may see while a question is open: the blocks without answers (content passed in has
 * already had its key taken out), and for a multiple-choice slide the prompt and the options.
 */
export function publicSlide(slide, total) {
  const choice = choiceOf(slide);
  const lead = choice ? slide.blocks.filter((b) => b !== choice && !(b.content || []).some((c) => c === choice)) : slide.blocks;
  return {
    index: slide.index,
    total,
    kind: choice ? 'choice' : 'task',
    seconds: slide.seconds,
    points: slide.points,
    poll: slide.poll,
    qids: slide.qids,
    ...(choice
      ? { prompt: String(choice.attrs.prompt || ''), options: (choice.attrs.options || []).map(String), multi: !!choice.attrs.multi, lead: lead.length ? doc(lead) : null, skin: choice.attrs.multi ? 'cards' : slide.skin || 'cards' }
      : { content: doc(slide.blocks), skin: 'cards' }),
  };
}

/** How much of a slide an answer got right: 1 all, 0 none, null when nothing on it can be marked. */
export function markSlide(key, slide, responses) {
  let got = 0;
  let max = 0;
  for (const qid of slide.qids) {
    const s = scoreQuestion(key[qid], responses?.[qid]);
    got += s.got;
    max += s.max;
  }
  return { got, max, frac: max > 0 ? got / max : null };
}

/** Points for an answer: up to 500 for being right and up to 500 more for being quick. */
export function pointsFor(slide, frac, elapsedMs) {
  if (slide.poll || !slide.points || frac === null || frac <= 0) return 0;
  const speed = Math.max(0, Math.min(1, 1 - elapsedMs / (slide.seconds * 1000)));
  return Math.round(frac * (500 + 500 * speed)) * slide.points;
}

/**
 * Marks one player's answer to a slide: the points it earns (with a streak bonus) and their new totals.
 * Used when a live question closes and when a learner answers at their own pace.
 */
export function scoreAnswer(slide, key, player, answer) {
  const m = answer ? markSlide(key, slide, answer.responses) : { got: 0, max: 0, frac: null };
  const scored = !slide.poll && m.frac !== null;
  const right = scored && m.frac === 1;
  const streak = slide.poll ? player.streak || 0 : right ? (player.streak || 0) + 1 : 0;
  const gained = answer ? pointsFor(slide, m.frac, answer.ms) + (right && slide.points ? streakBonus(streak) : 0) : 0;
  const maxHere = slide.poll ? 0 : slide.qids.reduce((n, q) => n + (key[q] ? 1 : 0), 0);
  return {
    frac: m.frac,
    scored,
    right,
    gained,
    next: { score: (player.score || 0) + gained, streak, got: (player.got || 0) + (scored ? m.got : 0), max: (player.max || 0) + (slide.poll ? 0 : m.max || maxHere) },
  };
}

/** A streak of right answers earns a bonus from the second one: 100, 200, up to 500. */
export const streakBonus = (streak) => (streak >= 2 ? 100 * Math.min(streak - 1, 5) : 0);

/** What the reveal shows: the right options and how the room answered. */
export function revealFor(slide, key, answers) {
  const pub = { right: 0, partly: 0, wrong: 0, none: 0 };
  const choice = slide.qids.length === 1 && slide.types[0] === 'mcq' ? key[slide.qids[0]] : null;
  const counts = [];
  for (const a of answers) {
    if (choice) {
      const v = a.responses?.[slide.qids[0]];
      for (const i of Array.isArray(v) ? v : [v]) if (Number.isInteger(i) && i >= 0 && i < 12) counts[i] = (counts[i] || 0) + 1;
    }
    const m = markSlide(key, slide, a.responses);
    if (m.frac === null) continue;
    if (m.frac === 1) pub.right++;
    else if (m.frac > 0) pub.partly++;
    else pub.wrong++;
  }
  const subset = Object.fromEntries(slide.qids.filter((q) => key[q]).map((q) => [q, key[q]]));
  const correct = choice ? (choice.kind === 'multi' ? choice.correct : choice.correct >= 0 ? [choice.correct] : []) : null;
  return { ...pub, answered: answers.length, key: subset, ...(choice ? { counts: Array.from({ length: Math.max(counts.length, 0) }, (_, i) => counts[i] || 0), correct } : {}) };
}

/** Places for the leaderboard: highest score first, ties share a place. */
export function ranked(players) {
  const list = Object.entries(players).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 0;
  let last = null;
  list.forEach((p, i) => {
    if (p.score !== last) place = i + 1;
    last = p.score;
    p.place = place;
  });
  return list;
}

// Nicknames: short, printable, and nothing rude on the big screen.
const RUDE = /\b(f+u+c+k+\w*|s+h+i+t+\w*|c+u+n+t+\w*|b+i+t+c+h+\w*|d+i+c+k+\w*|p+u+s+s+y+\w*|a+s+s+h+o+l+e+\w*|w+h+o+r+e+\w*|s+l+u+t+\w*|n+i+g+g+\w*|f+a+g+\w*|r+a+p+e+\w*|p+o+r+n+\w*|s+e+x+y?|k+i+l+l+\w*)\b/i;
export function cleanName(raw) {
  const name = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (name.length < 1) return { error: 'Type a nickname.' };
  if (RUDE.test(name.replace(/[^a-z0-9 ]/gi, ''))) return { error: 'Choose a different nickname.' };
  return { name };
}

/** A name nobody else in the game has: “Sam”, then “Sam 2”. */
export function uniqueName(name, taken) {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!used.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

/** Keep a phone's answer small and plain before it is stored. */
export function cleanResponses(input, qids) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const q of qids) {
    const v = input[q];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') out[q] = v.slice(0, 500);
    else if (typeof v === 'number' && Number.isFinite(v)) out[q] = v;
    else if (Array.isArray(v) && v.length <= 40 && v.every((x) => typeof x === 'number' || typeof x === 'string')) out[q] = v.map((x) => (typeof x === 'string' ? x.slice(0, 200) : x));
    else if (typeof v === 'object' && JSON.stringify(v).length <= 4000) out[q] = v;
  }
  return out;
}

export const newCode = () => String(100000 + Math.floor(Math.random() * 900000));
export const newToken = () => Array.from({ length: 24 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
