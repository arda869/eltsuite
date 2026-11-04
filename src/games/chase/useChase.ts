// The engine behind Shark escape and Taxi town. One component is both the controller for whoever
// plays and the live view for everyone else (readOnly), fed by the same synced state. Moves are
// shown at once, then sent for the server to check; the server owns the clock.
import { useEffect, useMemo, useRef, useState } from 'react';
import { gameProblems, type GameConfig } from '../model';
import { playSfx } from '../sfx';
import { FEEDBACK, GRACE, HINTS, LANES, coneLane, fromRemote, initialChase, isRight, isTried, optionsOf, progress, remainingSeconds, resultOf, roundSeconds, timeFraction, toRemote, tried, type ChaseState } from './chaseState';

const stable = (v: any): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Whoever made the last move calls time first; anyone else sharing the board waits a little longer. */
const LATE = 1200;

export type ChaseProps = {
  game: GameConfig;
  title?: string;
  onFinish?: (score: number, total: number) => void;
  remote?: Record<string, any> | null;
  onState?: (state: Record<string, unknown>) => void;
  readOnly?: boolean;
  expandable?: boolean;
};

export function useChase({ game, onFinish, remote, onState, readOnly = false }: ChaseProps, steering: boolean) {
  const [state, setStateRaw] = useState<ChaseState>(initialChase);
  const stateRef = useRef(state);
  const [sound, setSound] = useState(game.sound);
  const [now, setNow] = useState(() => Date.now());
  const [run, setRun] = useState(0);
  const signature = useRef('');
  const send = useRef(onState); send.current = onState;
  const finish = useRef(onFinish); finish.current = onFinish;
  const mine = useRef(false);
  const soundRef = useRef(sound); soundRef.current = sound;
  const theme = game.theme;
  const seconds = roundSeconds(game);
  const count = game.rounds.length;

  const setState = (next: ChaseState) => { stateRef.current = next; setStateRaw(next); };
  const commit = (patch: Partial<ChaseState>) => {
    const next = { ...stateRef.current, ...patch };
    mine.current = true;
    setState(next);
    if (readOnly) return;
    const json = stable(toRemote(next));
    if (json === signature.current) return;
    signature.current = json;
    send.current?.(toRemote(next));
  };

  // A board shared by others: take it as it comes, unless it is plainly an echo of an older move.
  useEffect(() => {
    if (!remote) return;
    const json = stable(remote);
    if (json === signature.current) return;
    signature.current = json;
    const next = fromRemote(remote);
    if (!readOnly && progress(next) < progress(stateRef.current)) return;
    mine.current = false;
    setState(next);
  }, [remote, readOnly]);

  const r = game.rounds[state.round];
  const options = useMemo(() => optionsOf(r), [r]);
  const phase = state.arcade.phase;
  const result = resultOf(state);
  const running = phase === 'running' && !state.finished && state.feedback === null;
  const canAct = !readOnly && running;
  const welcome = state.round === 0 && phase === 'ready' && state.feedback === null && !state.finished;
  const fraction = timeFraction(state, seconds, now);
  const remaining = remainingSeconds(state, now);
  const lane = state.arcade.roadLane;
  const cone = coneLane(state.round);
  const blocked = steering && lane === cone;
  const wrongTries = tried(state);

  // The clock.
  useEffect(() => {
    if (!running || !state.arcade.deadline) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running, state.arcade.deadline]);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!running) { lastTick.current = -1; return; }
    const s = Math.ceil(remaining);
    if (s <= 5 && s > 0 && s !== lastTick.current) { lastTick.current = s; if (soundRef.current) playSfx(theme, 'tick'); }
  }, [remaining, running, theme]);

  // Time runs out: whoever plays calls it; the server agrees only if its own clock has passed.
  useEffect(() => {
    if (readOnly || !running || !state.arcade.deadline) return;
    const deadline = state.arcade.deadline;
    const id = setTimeout(() => {
      const s = stateRef.current;
      if (s.arcade.phase !== 'running' || s.feedback !== null || s.finished || s.arcade.deadline !== deadline) return;
      commit({ answer: '', feedback: FEEDBACK.timeout, finished: true, arcade: { ...s.arcade, phase: 'lost', loss: 'time', hint: '' } });
      finish.current?.(s.score, count * 10);
    }, Math.max(0, deadline - Date.now()) + GRACE + (mine.current ? 0 : LATE));
    return () => clearTimeout(id);
  }, [readOnly, running, state.arcade.deadline]);

  // One sound per beat, whoever caused it. Joining part-way through stays quiet.
  const cue = state.finished ? (result === 'right' || !state.arcade.loss ? 'win' : 'lose') : result ? 'result:' + result : phase;
  const lastCue = useRef<string | null>(null);
  useEffect(() => {
    const key = state.round + ':' + cue;
    const first = lastCue.current === null;
    if (lastCue.current === key) return;
    lastCue.current = key;
    if (first || !soundRef.current) return;
    if (cue === 'running') playSfx(theme, 'start');
    else if (cue === 'result:right') playSfx(theme, 'right');
    else if (cue === 'win') playSfx(theme, 'win');
    else if (cue === 'lose') playSfx(theme, 'lose');
  }, [cue, state.round, theme]);
  const lastTries = useRef(0);
  useEffect(() => {
    if (wrongTries.length > lastTries.current && running) { if (soundRef.current) playSfx(theme, 'wrong'); }
    lastTries.current = wrongTries.length;
  }, [wrongTries.length, running, theme]);

  const problems = gameProblems(game);

  const startRound = (round: number, extra: Partial<ChaseState> = {}) => {
    const s = stateRef.current;
    commit({ ...extra, round, answer: '', feedback: null, arcade: { ...s.arcade, phase: 'running', deadline: Date.now() + seconds * 1000, hint: '', loss: '' } });
  };
  /** From the opening screen, or again after the game. */
  const start = () => {
    if (readOnly) return;
    if (stateRef.current.finished) { setRun(n => n + 1); lastTries.current = 0; setState(initialChase()); signature.current = ''; }
    startRound(0, { score: 0, finished: false });
  };
  const choose = (option: string) => {
    const s = stateRef.current;
    if (!canAct || isTried(s, option)) return;
    if (Date.now() >= s.arcade.deadline + GRACE) return;
    if (!isRight(r, option)) { commit({ answer: [...tried(s), option].join('\n'), arcade: { ...s.arcade, hint: HINTS.wrong } }); return; }
    if (blocked) { commit({ arcade: { ...s.arcade, hint: HINTS.cone } }); return; }
    commit({ answer: option, feedback: FEEDBACK.right, score: s.score + 10, arcade: { ...s.arcade, phase: 'cleared', hint: '' } });
  };
  const steer = (dir: -1 | 1) => {
    const s = stateRef.current;
    if (!canAct || !steering) return;
    const to = Math.max(0, Math.min(LANES - 1, s.arcade.roadLane + dir));
    if (to === s.arcade.roadLane) return;
    if (soundRef.current) playSfx(theme, 'tap');
    commit({ arcade: { ...s.arcade, roadLane: to, hint: s.arcade.hint === HINTS.cone && to !== cone ? '' : s.arcade.hint } });
  };
  const next = () => {
    const s = stateRef.current;
    if (readOnly || s.feedback === null || s.finished) return;
    if (s.round + 1 >= count) { commit({ finished: true }); finish.current?.(s.score, count * 10); return; }
    startRound(s.round + 1);
  };

  return { state, r, options, phase, result, running, canAct, welcome, fraction, remaining, seconds, count, lane, cone, blocked, wrongTries, sound, setSound, run, problems, start, choose, steer, next, readOnly, theme };
}
export type Chase = ReturnType<typeof useChase>;
