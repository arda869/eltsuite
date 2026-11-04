// The state of a chase game (Shark escape, Taxi town): one question at a time against a clock.
// Only fields the server already accepts are used (functions/games/state.js, `arcade`), so saved
// games, live sessions and the offline player all keep working: round, score, answer, feedback,
// finished, and arcade.{phase, deadline, roadLane, hint, loss}. The server sets the deadline from
// its own clock when a round starts, and decides when time has run out (functions/games/scoring.js).
import { norm, optionsFor, type GameConfig, type GameRound } from '../model';

export type ChasePhase = 'ready' | 'running' | 'cleared' | 'lost';
export type ChaseState = {
  round: number;
  score: number;
  /** While a round runs: the wrong options tried so far, one per line. Once cleared: the answer. */
  answer: string;
  feedback: string | null;
  finished: boolean;
  arcade: { phase: ChasePhase; deadline: number; roadLane: number; hint: string; loss: '' | 'time' };
};

export const HINTS = { wrong: 'Not yet. Try another answer.', cone: 'Steer around the cone first.' } as const;
export const FEEDBACK = { right: 'Correct.', timeout: 'Time ran out.' } as const;
/** Milliseconds a client waits past the deadline before calling time, so a slow network never calls it early. */
export const GRACE = 450;
export const LANES = 3;
const PHASES: ChasePhase[] = ['ready', 'running', 'cleared', 'lost'];

export const initialChase = (): ChaseState => ({ round: 0, score: 0, answer: '', feedback: null, finished: false, arcade: { phase: 'ready', deadline: 0, roadLane: 1, hint: '', loss: '' } });

export function fromRemote(remote: Record<string, any>): ChaseState {
  const a = remote.arcade && typeof remote.arcade === 'object' ? remote.arcade : {};
  return {
    round: Number.isInteger(remote.round) && remote.round >= 0 ? remote.round : 0,
    score: Number.isFinite(remote.score) ? remote.score : 0,
    answer: typeof remote.answer === 'string' ? remote.answer : '',
    feedback: typeof remote.feedback === 'string' ? remote.feedback : null,
    finished: remote.finished === true,
    arcade: {
      phase: PHASES.includes(a.phase) ? a.phase : 'ready',
      deadline: Number.isFinite(a.deadline) && a.deadline > 0 ? a.deadline : 0,
      roadLane: Number.isInteger(a.roadLane) && a.roadLane >= 0 && a.roadLane < LANES ? a.roadLane : 1,
      hint: typeof a.hint === 'string' ? a.hint : '',
      loss: a.loss === 'time' ? 'time' : '',
    },
  };
}
export const toRemote = (s: ChaseState): Record<string, unknown> => ({ round: s.round, score: s.score, answer: s.answer, feedback: s.feedback, finished: s.finished, arcade: { ...s.arcade } });

/** How far a board has got, to tell a late echo of an older move from a real one. */
export const progress = (s: ChaseState) => s.round * 10 + (s.finished ? 6 : s.feedback !== null ? 5 : PHASES.indexOf(s.arcade.phase));

export const roundSeconds = (game: GameConfig) => ([20, 30, 60, 120].includes(game.roundSeconds || 0) ? (game.roundSeconds as number) : 30);
/** The lane a cone blocks this round (Taxi town). The taxi starts in the middle lane. */
export const coneLane = (round: number) => round % LANES;

export const tried = (s: ChaseState): string[] => (s.arcade.phase === 'running' && s.answer ? s.answer.split('\n').filter(Boolean) : []);
export const isTried = (s: ChaseState, option: string) => tried(s).some(t => norm(t) === norm(option));
export const isRight = (r: GameRound | undefined, option: string) => !!r && norm(option) === norm(r.answer);
export const optionsOf = (r: GameRound | undefined) => (r ? optionsFor(r) : []);

/** Where the clock is, 0 at the start of a round and 1 when time is up. */
export function timeFraction(s: ChaseState, seconds: number, now: number) {
  if (s.arcade.phase !== 'running' || !s.arcade.deadline) return s.arcade.phase === 'lost' ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - (s.arcade.deadline - now) / (seconds * 1000)));
}
export const remainingSeconds = (s: ChaseState, now: number) => (s.arcade.phase === 'running' && s.arcade.deadline ? Math.max(0, (s.arcade.deadline - now) / 1000) : 0);

export type ChaseResult = 'right' | 'timeout' | null;
export const resultOf = (s: ChaseState): ChaseResult => (s.feedback === null ? null : s.arcade.loss === 'time' || s.feedback === FEEDBACK.timeout ? 'timeout' : 'right');
