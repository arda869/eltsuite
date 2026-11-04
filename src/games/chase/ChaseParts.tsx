// Pieces shared by Shark escape and Taxi town: the question card, answer tiles, clock, progress
// pips, score, the opening and closing screens. Each game dresses them in its own palette.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameRound } from '../model';
import { isRight, type ChaseState } from './chaseState';
import { reducedMotion, type Chase } from './useChase';

const LETTERS = 'ABCDEFGH';

export function SoundButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <button type="button" className="ch-sound" onClick={onToggle} aria-pressed={on} aria-label={on ? 'Sound on' : 'Sound off'} title={on ? 'Sound on' : 'Sound off'}>
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5z" fill="currentColor" stroke="none" />
      {on ? <><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></> : <path d="M15.5 9.5l5 5m0-5l-5 5" />}
    </svg>
  </button>;
}

/** One pip per question: reached, the one in play, still to come. */
export function Pips({ count, round, state, label }: { count: number; round: number; state: ChaseState; label: string }) {
  if (count > 24) return <span className="ch-pips-compact" aria-label={label}>{round} of {count}</span>;
  return <ol className="ch-pips" aria-label={label}>{Array.from({ length: count }, (_, i) => {
    const st = i < round || (i === round && state.feedback !== null && state.arcade.loss !== 'time') ? 'done' : i === round ? (state.arcade.loss === 'time' ? 'lost' : 'now') : 'todo';
    return <li key={i} data-state={st} aria-label={`${i + 1}: ${st === 'done' ? 'done' : st === 'now' ? 'now' : st === 'lost' ? 'time ran out' : 'to come'}`} />;
  })}</ol>;
}

/** The clock as a bar that drains, turning urgent for the last five seconds. */
export function Clock({ remaining, fraction, running, seconds }: { remaining: number; fraction: number; running: boolean; seconds: number }) {
  const urgent = running && remaining > 0 && remaining <= 5;
  const shown = running ? Math.ceil(remaining) : seconds;
  return <div className={'ch-clock' + (urgent ? ' urgent' : '') + (running ? ' running' : '')} role="timer" aria-live={urgent ? 'assertive' : 'off'} aria-label={running ? `${shown} seconds left` : `${seconds} seconds a question`}>
    <b>{shown}</b><small>s</small>
    <span className="ch-clock-track" aria-hidden="true"><i style={{ transform: `scaleX(${running ? 1 - fraction : 1})` }} /></span>
  </div>;
}

export function Score({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value);
  return <span className="ch-score" aria-live="polite" aria-atomic="true"><b key={value}>{shown}</b><small>{label}</small></span>;
}

export function QuestionCard({ r, round, count, kicker, children }: { r: GameRound; round: number; count: number; kicker: string; children?: ReactNode }) {
  const size = (r.prompt || '').length <= 44 ? 'xl' : (r.prompt || '').length <= 100 ? 'lg' : (r.prompt || '').length <= 200 ? 'md' : 'sm';
  return <section className="ch-question" data-size={size} aria-live="polite">
    <p className="ch-question-kicker"><span>{kicker}</span><span aria-hidden="true"> · </span><span>{round + 1} of {count}</span></p>
    <h2>{r.prompt}</h2>
    {children}
  </section>;
}

// quietHint: a hint the player already shows elsewhere (Taxi town's lane note), so it isn't said twice.
export function Answers({ chase, r, quietHint }: { chase: Chase; r: GameRound; quietHint?: string }) {
  const { options, state, canAct, result, wrongTries, choose } = chase;
  const revealed = result !== null;
  const stateOf = (o: string) => (revealed ? (isRight(r, o) ? 'right' : 'dim') : wrongTries.some(t => t.toLowerCase() === o.toLowerCase()) ? 'wrong' : 'default');
  return <div className="ch-answers" role="group" aria-label="Answers" data-count={options.length}>{options.map((o, i) => {
    const st = stateOf(o);
    return <button key={o} type="button" className="ch-answer" style={{ ['--k' as string]: i }} data-state={st} disabled={!canAct || st === 'wrong'} aria-disabled={st === 'wrong' || undefined} onClick={() => choose(o)}>
      <span className="ch-lozenge" aria-hidden="true">{LETTERS[i] || i + 1}</span>
      <span className="ch-answer-text">{o}</span>
      {st === 'right' && <Mark kind="right" />}{st === 'wrong' && <Mark kind="wrong" />}
    </button>;
  })}{state.arcade.hint && state.arcade.hint !== quietHint && !revealed && <p className="ch-hint" role="status" key={state.arcade.hint + wrongTries.length}>{state.arcade.hint}</p>}</div>;
}

export function Mark({ kind }: { kind: 'right' | 'wrong' }) {
  return <svg className={'ch-mark ' + kind} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    {kind === 'right' ? <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M8 8l8 8m0-8l-8 8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
  </svg>;
}

/** Confetti in the game's colours. Still for people who ask for reduced motion. */
export function Burst({ n }: { n: number }) {
  return <div className="ch-burst" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ ['--i' as string]: i, ['--n' as string]: n }} />)}</div>;
}

/** The result of a round, with what to do next. Focus lands on the button so Enter moves on. */
export function Outcome({ chase, title, detail, nextLabel, children }: { chase: Chase; title: ReactNode; detail?: ReactNode; nextLabel: string; children?: ReactNode }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!chase.readOnly) button.current?.focus({ preventScroll: true }); }, [chase.readOnly]);
  return <div className="ch-outcome" data-result={chase.result || undefined} role="status">
    {chase.result === 'right' && <Burst n={16} />}
    <div className="ch-outcome-text">
      <h3>{title}</h3>
      {chase.result === 'right' && <span className="ch-plus" aria-hidden="true">+10</span>}
      {detail && <p>{detail}</p>}
      {children}
    </div>
    {!chase.readOnly && <button ref={button} type="button" className="ch-primary" onClick={chase.next}>{nextLabel}</button>}
  </div>;
}

export function Facts({ items }: { items: string[] }) {
  return <ul className="ch-facts">{items.map(f => <li key={f}>{f}</li>)}</ul>;
}

/** The score rolls up to its new value rather than jumping. */
export function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (reducedMotion()) { from.current = value; setShown(value); return; }
    const t0 = performance.now(), duration = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration), eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return shown;
}

/** Arrow keys steer, letters and numbers answer. Lives on the stage so focus anywhere inside works. */
export function useChaseKeys(chase: Chase) {
  return (e: React.KeyboardEvent) => {
    if (!chase.canAct || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); chase.steer(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); chase.steer(1); return; }
    const k = e.key.toUpperCase();
    const i = k.length === 1 && LETTERS.includes(k) ? LETTERS.indexOf(k) : /^[1-8]$/.test(k) ? +k - 1 : -1;
    if (i >= 0 && i < chase.options.length) { e.preventDefault(); chase.choose(chase.options[i]); }
  };
}

// Once a round is running, keep keyboard focus inside the stage so arrow and letter keys work
// straight after the start button has gone. Nothing moves if the person is already in the stage.
export function useStageFocus(chase: Chase) {
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!chase.running || chase.readOnly) return;
    const el = stage.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [chase.running, chase.readOnly, chase.state.round]);
  return stage;
}
