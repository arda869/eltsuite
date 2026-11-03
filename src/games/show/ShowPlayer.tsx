// Game show: a stage, a marquee of lights, one question at a time. Players choose an answer, lock
// it in, and the board reveals the result. Questions run in rounds of up to five; a timer and two
// lifelines are the teacher's choice. The same component is the controller for whoever plays and a
// live spectator view for everyone else (readOnly), fed by the same synced state.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { GameFrame } from '../GameFrame';
import { TaskRenderer } from '../../components/TaskRenderer';
import { splitKey, type Responses } from '../../lib/questions';
import { gameProblems, norm, type GameConfig } from '../model';
import { BEATS, FEEDBACK, cardsFor, checked, fiftyPossible, fromRemote, initialShow, keptByFifty, lifelinesOn, lockRequired, questionSize, resultOf, stageName, stageOf, stagesOf, summarise, timerSeconds, toRemote, verdict, withResult, type ShowState } from './showState';
import { playShowSfx, warmShowAudio } from './showSfx';
import { Emblem, IconExtraTime, IconFifty, IconSound, Lozenge, MarkRight, MarkWrong, Marquee, Spotlights, TimerRing } from './ShowArt';
import './show.css';

const stable = (v: any): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
const PHASES = ['welcome', 'intro', 'play', 'locked'];
/** Where a board is in the show, for telling a late echo from a real move. */
const progress = (s: ShowState) => s.round * 10 + (s.finished ? 6 : s.feedback !== null ? 5 : PHASES.indexOf(s.show.phase));
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const LETTERS = 'ABCDEFGH';

export type ShowPlayerProps = {
  game: GameConfig;
  title?: string;
  onFinish?: (score: number, total: number) => void;
  remote?: Record<string, any> | null;
  onState?: (state: Record<string, unknown>) => void;
  readOnly?: boolean;
  expandable?: boolean;
};

export function ShowPlayer({ game, title, onFinish, remote, onState, readOnly = false, expandable = true }: ShowPlayerProps) {
  const [state, setStateRaw] = useState<ShowState>(initialShow);
  const stateRef = useRef(state);
  const [typed, setTyped] = useState('');
  const [draft, setDraft] = useState<Responses>({});
  const [run, setRun] = useState(0);
  const [sound, setSound] = useState(game.sound);
  const [now, setNow] = useState(() => Date.now());
  const signature = useRef('');
  const send = useRef(onState); send.current = onState;
  const mine = useRef(false);
  const soundRef = useRef(sound); soundRef.current = sound;
  const nextButton = useRef<HTMLButtonElement>(null);
  const theme = game.theme;

  const setState = (next: ShowState) => { stateRef.current = next; setStateRaw(next); };
  /** A move by this participant: shown at once, then sent for the server to check. */
  const commit = (patch: Partial<ShowState>) => {
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
  const stages = useMemo(() => stagesOf(game.rounds.length), [game.rounds.length]);
  const stage = stageOf(stages, state.round);
  const cards = useMemo(() => (r ? cardsFor(r, run) : []), [r, run]);
  const native = useMemo(() => (r?.content ? splitKey(r.content) : null), [r]);
  const isChoice = !native && cards.length > 1;
  const kept = r && state.show.fifty === state.round ? keptByFifty(r, cards) : null;
  const result = resultOf(r, state);
  const phase = state.show.phase;
  const revealed = result !== null;
  const locked = phase === 'locked' && !revealed;
  const canAct = !readOnly && phase === 'play' && !revealed && !state.finished;
  const seconds = timerSeconds(game);
  const needLock = lockRequired(game);
  const lifelines = lifelinesOn(game);
  const summary = summarise(state.show.results, game.rounds.length);
  const deadline = state.show.deadline;
  const inPlay = phase === 'play' && !revealed && !state.finished;
  const remaining = inPlay && deadline ? Math.max(0, (deadline - now) / 1000) : 0;
  const total = seconds + (state.show.extra === state.round ? BEATS.extra / 1000 : 0);

  // The clock.
  useEffect(() => {
    if (!inPlay || !deadline) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [inPlay, deadline]);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!inPlay || !deadline) { lastTick.current = -1; return; }
    const s = Math.ceil(remaining);
    if (s <= 5 && s > 0 && s !== lastTick.current) { lastTick.current = s; if (soundRef.current) playShowSfx(theme, 'tick'); }
  }, [remaining, inPlay, deadline, theme]);

  // Automatic beats, run by whoever plays. The participant who made the last move goes first;
  // anyone else sharing the board waits a little longer, so two players do not race the server.
  const later = () => (mine.current ? 0 : BEATS.late);
  useEffect(() => {
    if (readOnly || !inPlay || !deadline) return;
    const id = setTimeout(() => {
      const s = stateRef.current;
      if (s.show.phase !== 'play' || s.feedback !== null || s.finished || s.show.deadline !== deadline) return;
      commit({ answer: '', feedback: FEEDBACK.timeout, show: { ...s.show, results: withResult(s.show.results, s.round, '0') } });
    }, Math.max(0, deadline - Date.now()) + later());
    return () => clearTimeout(id);
  }, [readOnly, inPlay, deadline]);
  useEffect(() => {
    if (readOnly || phase !== 'intro' || state.finished) return;
    const id = setTimeout(() => {
      const s = stateRef.current;
      if (s.show.phase !== 'intro') return;
      commit({ show: { ...s.show, phase: 'play', deadline: seconds ? Date.now() + seconds * 1000 : 0, lockedAt: 0 } });
    }, (reducedMotion() ? 900 : BEATS.intro) + later());
    return () => clearTimeout(id);
  }, [readOnly, phase, state.round, state.finished, seconds]);
  useEffect(() => {
    if (readOnly || !locked) return;
    const id = setTimeout(() => {
      const s = stateRef.current;
      const q = game.rounds[s.round];
      if (s.show.phase !== 'locked' || s.feedback !== null || !q) return;
      const c = checked(q, s, s.answer);
      commit({ answer: c.answer, feedback: c.feedback, score: s.score + (c.result === 'right' ? 10 : 0), show: { ...s.show, results: withResult(s.show.results, s.round, c.result === 'right' ? '1' : c.result === 'unscored' ? 'x' : '0') } });
    }, BEATS.lock + later());
    return () => clearTimeout(id);
  }, [readOnly, locked, state.round]);

  // One cue per beat, whoever caused it. Joining a game part-way through stays quiet.
  const cue = state.finished ? 'complete' : result ? 'result:' + result : phase;
  const lastCue = useRef<string | null>(null);
  useEffect(() => {
    const key = state.round + ':' + cue;
    const first = lastCue.current === null;
    if (lastCue.current === key) return;
    lastCue.current = key;
    if (first || !soundRef.current) return;
    if (cue === 'intro' && state.round > 0) playShowSfx(theme, 'stage');
    else if (cue === 'locked') playShowSfx(theme, 'lock');
    else if (cue === 'result:right') playShowSfx(theme, 'right');
    else if (cue === 'result:wrong' || cue === 'result:unscored') playShowSfx(theme, 'wrong');
    else if (cue === 'result:timeout') playShowSfx(theme, 'timeout');
    else if (cue === 'complete') playShowSfx(theme, 'complete');
  }, [cue, state.round, theme]);
  useEffect(() => { if (revealed && !readOnly) nextButton.current?.focus({ preventScroll: true }); }, [revealed, readOnly]);
  const shownScore = useCountUp(state.score);

  const problems = gameProblems(game);
  if (problems.length) return <div className="game-error" role="alert">{problems.map(p => <p key={p}>{p}</p>)}</div>;

  const start = () => {
    warmShowAudio();
    if (soundRef.current) playShowSfx(theme, 'open');
    const fresh = initialShow();
    setTyped(''); setDraft({});
    if (stateRef.current.finished) setRun(n => n + 1);
    commit({ ...fresh, show: { ...fresh.show, phase: 'intro' } });
  };
  const lock = (value: string) => {
    const s = stateRef.current;
    if (!canAct) return;
    if (native) commit({ responses: draft, answer: '', show: { ...s.show, phase: 'locked' } });
    else commit({ answer: value, show: { ...s.show, phase: 'locked' } });
  };
  const pick = (value: string) => {
    if (!canAct || (kept && !kept.includes(value))) return;
    if (!needLock || stateRef.current.answer === value) { lock(value); return; }
    if (soundRef.current) playShowSfx(theme, 'select');
    commit({ answer: value });
  };
  const takeTwoAway = () => {
    const s = stateRef.current;
    if (!canAct || s.show.fifty !== null || !fiftyPossible(r)) return;
    if (soundRef.current) playShowSfx(theme, 'lifeline');
    const keep = keptByFifty(r, cards);
    commit({ answer: keep.includes(s.answer) ? s.answer : '', show: { ...s.show, fifty: s.round } });
  };
  const extraTime = () => {
    const s = stateRef.current;
    if (!canAct || !seconds || s.show.extra !== null) return;
    if (soundRef.current) playShowSfx(theme, 'lifeline');
    commit({ show: { ...s.show, extra: s.round, deadline: s.show.deadline + BEATS.extra } });
  };
  const next = () => {
    const s = stateRef.current;
    if (s.round + 1 >= game.rounds.length) { commit({ finished: true }); onFinish?.(s.score, game.rounds.length * 10); return; }
    const to = s.round + 1, fresh = stages.some(x => x.start === to);
    setTyped(''); setDraft({});
    commit({ round: to, answer: '', feedback: null, responses: {}, show: { ...s.show, phase: fresh ? 'intro' : 'play', deadline: fresh || !seconds ? 0 : Date.now() + seconds * 1000, lockedAt: 0 } });
  };
  const keys = (e: KeyboardEvent) => {
    if (!canAct || !isChoice || (e.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
    const k = e.key.toUpperCase();
    const i = LETTERS.includes(k) && k.length === 1 ? LETTERS.indexOf(k) : /^[1-8]$/.test(k) ? +k - 1 : -1;
    if (i >= 0 && i < cards.length) { e.preventDefault(); pick(cards[i]); }
  };

  const cardState = (c: string): string => {
    const chosen = norm(c) === norm(state.answer) && state.answer !== '';
    if (revealed) return norm(c) === norm(r.answer) ? 'right' : chosen ? 'wrong' : 'dim';
    if (locked) return chosen ? 'locked' : 'dim';
    if (kept && !kept.includes(c)) return 'removed';
    return chosen ? 'selected' : 'default';
  };
  const soundButton = <button type="button" className="show-sound" onClick={() => setSound(v => !v)} aria-pressed={sound} aria-label={sound ? 'Sound on' : 'Sound off'} title={sound ? 'Sound on' : 'Sound off'}><IconSound on={sound} /></button>;
  const count = game.rounds.length;
  const facts = [`${count} ${count === 1 ? 'question' : 'questions'}${stages.length > 1 ? ` in ${stages.length} rounds` : ''}`, seconds ? `${seconds} seconds a question` : 'No timer', lifelines ? (seconds ? 'Two lifelines' : 'One lifeline') : null].filter(Boolean) as string[];

  let screen: JSX.Element;
  if (state.finished) {
    const missed = summary.missed.map(i => game.rounds[i]).filter(Boolean);
    screen = <div className="show-finish game-finish" role="status">
      <Burst n={summary.accuracy >= 50 ? 36 : 18} />
      <p className="show-kicker">That's the show</p>
      <h2>Game complete</h2>
      <p className="show-final"><b>{shownScore}</b><span>points</span></p>
      <dl className="show-stats">
        <div><dt>Correct</dt><dd>{summary.right} of {summary.scored || count}</dd></div>
        <div><dt>Accuracy</dt><dd>{summary.scored ? summary.accuracy + '%' : '—'}</dd></div>
        <div><dt>Best streak</dt><dd>{summary.bestStreak}</dd></div>
      </dl>
      <Ladder results={state.show.results} count={count} current={-1} />
      <p className="show-verdict">{verdict(summary)}</p>
      {missed.length > 0 && <section className="show-review" aria-label="Worth another look"><h3>Worth another look</h3><ol>{missed.map(q => <li key={q.id}><span>{q.prompt || 'Inline activity'}</span>{q.answer && <b>{q.answer}</b>}{q.note && <small>{q.note}</small>}</li>)}</ol></section>}
      <p className="show-reflect">Choose one question you want to remember. Tell a partner why.</p>
      <div className="show-finish-actions">{!onState && !readOnly && <button type="button" className="show-primary" onClick={start}>Play again</button>}{soundButton}</div>
    </div>;
  } else if (phase === 'welcome') {
    screen = <div className="show-welcome">
      <Emblem />
      <p className="show-kicker">Game show</p>
      <h2 className="show-title">{title || 'Game show'}</h2>
      <ul className="show-facts">{facts.map(f => <li key={f}>{f}</li>)}</ul>
      <p className="show-how">{isChoice || !r?.content ? 'Choose an answer and lock it in. Then see if you were right.' : 'Complete each task and lock it in. Then see how you did.'}</p>
      <div className="show-welcome-actions">
        {readOnly ? <p className="show-waiting" role="status">Waiting for the show to start…</p> : <button type="button" className="show-primary show-start" onClick={start}>Start the show</button>}
        {soundButton}
      </div>
    </div>;
  } else {
    const current = stages[stage];
    screen = <>
      <header className="show-bar">
        <div className="show-bar-left"><span className="show-kicker">{stageName(stage, stages.length)}</span><span className="show-bar-count">Question {state.round + 1} of {count}</span></div>
        <Ladder results={state.show.results} count={count} current={state.round} />
        <div className="show-bar-right">
          {seconds > 0 && phase !== 'intro' && <TimerRing remaining={inPlay ? remaining : 0} total={total} urgent={inPlay && remaining > 0 && remaining <= 5} />}
          <span className="show-score" aria-live="polite" aria-atomic="true"><b key={state.score} className="show-score-value">{shownScore}</b><small>points</small></span>
          {soundButton}
        </div>
      </header>
      {phase === 'intro' ? <div className="show-intro" role="status" aria-live="polite">
        <Marquee count={9} />
        <p className="show-kicker">{stages.length > 1 ? `Round ${stage + 1} of ${stages.length}` : 'Here we go'}</p>
        <h2>{stageName(stage, stages.length)}</h2>
        <p className="show-intro-range">{current && current.start !== current.end ? `Questions ${current.start + 1} to ${current.end + 1}` : `Question ${state.round + 1}`}</p>
        {stage > 0 && <p className="show-intro-recap">So far: {summary.right} of {summary.scored} correct</p>}
      </div> : <div className={'show-floor-area' + (reducedMotion() ? '' : ' animate')} key={state.round}>
        <section className="show-panel" data-size={questionSize(r.prompt || '')} aria-live="polite">
          <p className="show-panel-kicker">Question {state.round + 1}<span aria-hidden="true"> · </span><span>10 points</span></p>
          {r.prompt && <h2 className="show-question">{r.prompt}</h2>}
          {native && <div className="show-native"><TaskRenderer content={native.content} responses={revealed || locked ? state.responses : draft} results={revealed ? native.key : undefined} onChange={(id, v) => setDraft(d => ({ ...d, [id]: v }))} disabled={!canAct} /></div>}
        </section>
        {isChoice ? <div className="show-cards" role="group" aria-label="Answers">{cards.map((c, i) => {
          const st = cardState(c);
          return <button key={c} type="button" className="show-card" style={{ ['--k' as string]: i }} data-state={st} aria-pressed={st === 'selected' || st === 'locked'} disabled={!canAct || st === 'removed'} onClick={() => pick(c)}>
            <Lozenge>{LETTERS[i] || i + 1}</Lozenge>
            <span className="show-card-text">{c}</span>
            {st === 'right' && <MarkRight />}{st === 'wrong' && <MarkWrong />}
            {st === 'removed' && <span className="show-card-removed">Taken away</span>}
          </button>;
        })}</div> : !native && <div className="show-entry">
          <label>Your answer<input value={canAct ? typed : state.answer} disabled={!canAct} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) lock(typed.trim()); }} /></label>
        </div>}
        {!revealed && <div className="show-actions">
          {!locked && <div className="show-actions-main">
            {isChoice && needLock && (state.answer ? <><button type="button" className="show-primary show-lock" disabled={!canAct} onClick={() => lock(state.answer)}>Lock it in</button><span className="show-hint">or tap your answer again</span></> : canAct && <span className="show-hint">{`Choose an answer${lifelines ? ', or use a lifeline' : ''}.`}</span>)}
            {!isChoice && <button type="button" className="show-primary show-lock" disabled={!canAct || (!native && !typed.trim())} onClick={() => lock(typed.trim())}>Lock it in</button>}
          </div>}
          {locked && <p className="show-locking" role="status">Locked in…</p>}
          {lifelines && <div className="show-lifelines" role="group" aria-label="Lifelines">
            <button type="button" className="show-lifeline" disabled={!canAct || state.show.fifty !== null || !fiftyPossible(r)} data-used={state.show.fifty !== null} onClick={takeTwoAway}><IconFifty /><span>Take two away</span>{state.show.fifty !== null && <small>Used</small>}</button>
            {seconds > 0 && <button type="button" className="show-lifeline" disabled={!canAct || state.show.extra !== null} data-used={state.show.extra !== null} onClick={extraTime}><IconExtraTime /><span>Extra time</span>{state.show.extra !== null && <small>Used</small>}</button>}
          </div>}
        </div>}
        {revealed && <div className="show-reveal" data-result={result} role="status">
          {result === 'right' && <Burst n={14} />}
          <div className="show-reveal-text">
            <strong>{result === 'right' ? <><MarkRight /> Correct</> : result === 'timeout' ? "Time's up" : result === 'unscored' ? 'Locked in' : 'Not this time'}</strong>
            {result === 'right' && <span className="show-plus" aria-hidden="true">+10</span>}
            {(result === 'wrong' || result === 'timeout') && r.answer && <p>The answer: <b>{r.answer}</b></p>}
            {result === 'unscored' && <p>{FEEDBACK.unscored}</p>}
            {r.note && <p className="show-note">{r.note}</p>}
          </div>
          {!readOnly && <button ref={nextButton} type="button" className="show-primary" onClick={next}>{state.round + 1 >= count ? 'Finish game' : stages.some(x => x.start === state.round + 1) ? stageName(stage + 1, stages.length) : 'Next question'}</button>}
        </div>}
      </div>}
    </>;
  }

  const body = <section className={`show-stage game-show show-theme-${theme}`} data-phase={state.finished ? 'finished' : phase} data-result={result || undefined} aria-label="Game show" onKeyDown={keys}>
    <Spotlights />
    <Marquee count={13} lit={phase !== 'welcome' || state.finished} />
    {screen}
  </section>;
  return expandable ? <GameFrame title={title || 'Game show'}>{body}</GameFrame> : body;
}

/** One mark per question: done right, done wrong, not scored, the one in play, still to come. */
function Ladder({ results, count, current }: { results: string; count: number; current: number }) {
  if (count > 30) return <span className="show-ladder-compact" aria-label="Progress">{summarise(results, count).right} right so far</span>;
  return <ol className="show-ladder" aria-label="Progress">{Array.from({ length: count }, (_, i) => {
    const c = results[i];
    const st = c === '1' ? 'right' : c === '0' ? 'wrong' : c === 'x' ? 'unscored' : i === current ? 'current' : 'todo';
    return <li key={i} data-state={st} aria-label={`Question ${i + 1}: ${st === 'right' ? 'correct' : st === 'wrong' ? 'incorrect' : st === 'unscored' ? 'not scored' : st === 'current' ? 'now' : 'to come'}`} />;
  })}</ol>;
}

/** A burst of confetti in the stage colours. Still for people who ask for reduced motion. */
function Burst({ n }: { n: number }) {
  return <div className="show-burst" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ ['--i' as string]: i, ['--n' as string]: n }} />)}</div>;
}

/** The score rolls up to its new value rather than jumping. */
function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (reducedMotion()) { from.current = value; setShown(value); return; }
    const t0 = performance.now(), duration = 700;
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
