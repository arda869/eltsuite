// Game show rules that do not touch the screen: how questions group into rounds, what a move
// means, what the server is sent and how a saved or remote board is read back. The server
// (functions/games/scoring.js) owns the score and the clock; this file mirrors its vocabulary.
import { norm, optionsFor, shuffled, type GameConfig, type GameRound } from '../model';
import { questionIds, scoreTask, splitKey, type Responses } from '../../lib/questions';

export type ShowPhase = 'welcome' | 'intro' | 'play' | 'locked';
export type ShowMeta = {
  phase: ShowPhase;
  /** Absolute time the current question closes (0: no timer). Set by the server in live games. */
  deadline: number;
  lockedAt: number;
  /** Round index where "Take two away" was spent, or null. */
  fifty: number | null;
  /** Round index where "Extra time" was spent, or null. */
  extra: number | null;
  /** One character per answered question: 1 right, 0 wrong, x not scored. */
  results: string;
};
export type ShowState = {
  round: number;
  score: number;
  answer: string;
  feedback: string | null;
  responses: Responses;
  finished: boolean;
  show: ShowMeta;
};
export type ShowResult = 'right' | 'wrong' | 'unscored' | 'timeout';

export const FEEDBACK = {
  right: 'Correct!',
  timeout: 'Time ran out.',
  unscored: 'Discuss your answer with your teacher. This round is not automatically scored.',
  wrong: (answer: string) => `Answer: ${answer}`,
};
/** Beats of the show, in milliseconds. The server allows 1.5 s of latency on top of these. */
export const BEATS = { intro: 1900, lock: 1150, late: 1500, extra: 20000 };
export const QUESTIONS_PER_ROUND = 5;

export const initialShow = (): ShowState => ({ round: 0, score: 0, answer: '', feedback: null, responses: {}, finished: false, show: { phase: 'welcome', deadline: 0, lockedAt: 0, fifty: null, extra: null, results: '' } });

/** A board saved before the show had phases is picked up mid-game rather than restarted. */
export function fromRemote(remote: Record<string, any>): ShowState {
  const s = remote.show && typeof remote.show === 'object' ? remote.show : null;
  const started = (remote.round || 0) > 0 || !!remote.answer || remote.feedback != null || !!remote.finished;
  return {
    round: remote.round || 0,
    score: remote.score || 0,
    answer: remote.answer || '',
    feedback: remote.feedback ?? null,
    responses: remote.responses || {},
    finished: !!remote.finished,
    show: {
      phase: s && ['welcome', 'intro', 'play', 'locked'].includes(s.phase) ? s.phase : started ? 'play' : 'welcome',
      deadline: s?.deadline || 0,
      lockedAt: s?.lockedAt || 0,
      fifty: Number.isInteger(s?.fifty) ? s.fifty : null,
      extra: Number.isInteger(s?.extra) ? s.extra : null,
      results: typeof s?.results === 'string' ? s.results : '',
    },
  };
}

export const timerSeconds = (game: GameConfig) => ([15, 30, 45, 60, 90].includes(game.showTimer || 0) ? game.showTimer! : 0);
export const lockRequired = (game: GameConfig) => game.showLock !== false;
export const lifelinesOn = (game: GameConfig) => game.showLifelines !== false;

/** Questions in rounds of up to five, as even as possible: 12 questions → 4, 4, 4. */
export function stagesOf(count: number): { start: number; end: number }[] {
  if (count <= 0) return [];
  const k = Math.ceil(count / QUESTIONS_PER_ROUND), base = Math.floor(count / k), extra = count % k;
  const out: { start: number; end: number }[] = [];
  let at = 0;
  for (let i = 0; i < k; i++) { const size = base + (i < extra ? 1 : 0); out.push({ start: at, end: at + size - 1 }); at += size; }
  return out;
}
export const stageOf = (stages: { start: number; end: number }[], round: number) => Math.max(0, stages.findIndex(s => round >= s.start && round <= s.end));
export const stageName = (index: number, total: number) => (total > 1 && index === total - 1 ? 'Final round' : `Round ${index + 1}`);

/** Answer cards for a question; a replay reshuffles them, a live game keeps one shared order. */
export const cardsFor = (r: GameRound, run = 0) => (run ? shuffled(optionsFor(r), `${r.id}:${run}`) : optionsFor(r));

/** "Take two away" keeps the right answer and one other, the same two for everyone. */
export function keptByFifty(r: GameRound, cards: string[]): string[] {
  const right = cards.find(c => norm(c) === norm(r.answer));
  const others = shuffled(cards.filter(c => norm(c) !== norm(r.answer)), r.id + ':fifty');
  return right && others.length ? [right, others[0]] : cards;
}
export const fiftyPossible = (r: GameRound | undefined) => !!r && !r.content && optionsFor(r).length >= 3;

/** What the board shows after an answer is checked, worked out the same way by every participant. */
export function resultOf(r: GameRound | undefined, state: ShowState): ShowResult | null {
  if (!r || state.feedback === null) return null;
  if (state.feedback === FEEDBACK.timeout) return 'timeout';
  if (state.feedback === FEEDBACK.unscored) return 'unscored';
  if (r.content) {
    const { content, key } = splitKey(r.content);
    const s = scoreTask(questionIds(content), key, state.responses);
    if (s.hasWriting || !s.total) return 'unscored';
    return s.score === s.total ? 'right' : 'wrong';
  }
  return norm(state.answer) === norm(r.answer) ? 'right' : 'wrong';
}

/** The move that checks an answer: feedback for the server's ledger, a result for the ladder. */
export function checked(r: GameRound, state: ShowState, answer: string): { answer: string; feedback: string; result: ShowResult } {
  const trial: ShowState = { ...state, answer, feedback: FEEDBACK.right };
  const result = r.content ? resultOf(r, trial)! : norm(answer) === norm(r.answer) ? 'right' : 'wrong';
  const feedback = result === 'right' ? FEEDBACK.right : result === 'unscored' ? FEEDBACK.unscored : FEEDBACK.wrong(r.answer);
  return { answer, feedback, result };
}

export const withResult = (results: string, round: number, mark: '1' | '0' | 'x') => {
  const chars = results.padEnd(round, '.').split('');
  chars[round] = mark;
  return chars.join('');
};

export type ShowSummary = { right: number; wrong: number; unscored: number; scored: number; accuracy: number; bestStreak: number; missed: number[] };
export function summarise(results: string, count: number): ShowSummary {
  let right = 0, wrong = 0, unscored = 0, streak = 0, bestStreak = 0;
  const missed: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = results[i];
    if (c === '1') { right++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else if (c === '0') { wrong++; streak = 0; missed.push(i); }
    else if (c === 'x') unscored++;
    else streak = 0;
  }
  const scored = right + wrong;
  return { right, wrong, unscored, scored, accuracy: scored ? Math.round((right / scored) * 100) : 0, bestStreak, missed };
}

export function verdict(s: ShowSummary): string {
  if (!s.scored) return 'Your answers are ready for your teacher to look at.';
  if (s.accuracy === 100) return 'Every answer right. A clean sweep.';
  if (s.accuracy >= 80) return 'A strong show. One or two to look at again.';
  if (s.accuracy >= 50) return 'Good work. The questions below are worth another look.';
  return 'A tough set. Look at the questions below, then play again.';
}

/** Size class for the question panel so long questions still fit without scrolling. */
export const questionSize = (text: string) => (text.length <= 48 ? 'xl' : text.length <= 110 ? 'lg' : text.length <= 220 ? 'md' : 'sm');

/** Only the fields the server accepts (functions/games/state.js). */
export const toRemote = (s: ShowState): Record<string, unknown> => ({ round: s.round, score: s.score, answer: s.answer, feedback: s.feedback, responses: s.responses, finished: s.finished, show: s.show });
