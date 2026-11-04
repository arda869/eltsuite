// Taxi town: one passenger a question. Steer around the cone, answer before the meter runs out,
// and the passenger reaches their destination. A wrong answer costs nothing but time; when time
// runs out the passenger leaves and the shift is over.
import { GameFrame } from '../GameFrame';
import { useChase, type ChaseProps } from '../chase/useChase';
import { Answers, Clock, Facts, Outcome, Pips, QuestionCard, Score, SoundButton, Burst, useChaseKeys, useStageFocus } from '../chase/ChaseParts';
import { HINTS, LANES } from '../chase/chaseState';
import { TaxiScene, type TaxiMood } from './TaxiScene';
import '../chase/chase.css';
import './taxi.css';

const Arrow = ({ dir }: { dir: -1 | 1 }) => <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{dir < 0 ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}</svg>;

export function TaxiPlayer(props: ChaseProps) {
  const { title, expandable = true, onState } = props;
  const chase = useChase(props, true);
  const { state, r, phase, result, running, canAct, welcome, fraction, remaining, seconds, count, lane, cone, blocked, wrongTries, sound, setSound, problems, start, steer, readOnly, theme } = chase;
  const keys = useChaseKeys(chase);
  const stage = useStageFocus(chase);
  if (problems.length) return <div className="game-error" role="alert">{problems.map(p => <p key={p}>{p}</p>)}</div>;

  const lost = state.finished && state.arcade.loss === 'time';
  const mood: TaxiMood = lost || phase === 'lost' ? 'lost' : result === 'right' ? 'cleared' : running ? 'running' : 'idle';
  const progress = mood === 'lost' ? 1 : mood === 'cleared' ? 0 : running ? fraction : 0;
  const delivered = state.finished && !lost ? count : state.round + (result === 'right' ? 1 : 0);
  const soundButton = <SoundButton on={sound} onToggle={() => setSound(v => !v)} />;
  const facts = [`${count} ${count === 1 ? 'passenger' : 'passengers'}`, `${seconds} seconds a fare`, 'Steer around the cones'];

  const body = <section className={`chase-stage taxi-stage game-taxi taxi-theme-${theme}`} data-phase={state.finished ? 'finished' : phase} data-result={result || undefined} aria-label="Taxi town" onKeyDown={keys} tabIndex={-1} ref={stage}>
    <div className="ch-scene">
      <TaxiScene progress={progress} mood={mood} lane={lane} cone={cone} honks={wrongTries.length} urgent={running && remaining > 0 && remaining <= 5} />
      {!welcome && !state.finished && <header className="ch-hud">
        <div className="ch-hud-left"><span className="ch-chip"><span className="ch-kicker">Passenger {Math.min(count, state.round + 1)}</span></span><Pips count={count} round={state.round} state={state} label="Passengers" /></div>
        <div className="ch-hud-right"><Clock remaining={remaining} fraction={fraction} running={running} seconds={seconds} /><Score value={state.score} label="points" />{soundButton}</div>
      </header>}
      {welcome && <div className="ch-overlay"><div className="ch-panel tx-welcome">
        <span className="ch-kicker">Taxi town</span>
        <h2>{title || 'Taxi town'}</h2>
        <Facts items={facts} />
        <p className="ch-how">Each passenger asks a question. Steer out of the cone's lane, answer before the meter runs out, and drop them off.</p>
        <div className="ch-panel-actions">{readOnly ? <p className="ch-waiting" role="status">Waiting for the game to start…</p> : <button type="button" className="ch-primary big" onClick={start}>Start your shift</button>}{soundButton}</div>
      </div></div>}
      {state.finished && <div className="ch-overlay ch-overlay-side"><div className="ch-panel tx-finish" role="status">
        {!lost && <Burst n={32} />}
        <span className="ch-kicker">{lost ? 'Game over' : 'End of shift'}</span>
        <h2>{lost ? 'Your passenger left' : 'Game complete'}</h2>
        <p className="ch-final"><b>{state.score}</b><span>points</span></p>
        <dl className="ch-stats"><div><dt>Delivered</dt><dd>{delivered} of {count}</dd></div><div><dt>Time a fare</dt><dd>{seconds}s</dd></div><div><dt>Result</dt><dd>{lost ? 'Timed out' : 'All delivered'}</dd></div></dl>
        {lost && r && <p className="ch-answer-recap">Time ran out. The answer was <b>{r.answer}</b>.</p>}
        <p className="ch-reflect">{lost ? 'Say the answer you missed in a sentence of your own.' : 'Which passenger had the hardest question? Tell a partner why.'}</p>
        <div className="ch-panel-actions">{!onState && !readOnly && <button type="button" className="ch-primary" onClick={start}>{lost ? 'Try again' : 'Play again'}</button>}{onState && lost && <p className="ch-waiting">Your teacher can start a new game from Play mode and sharing.</p>}{soundButton}</div>
      </div></div>}
    </div>
    {!welcome && !state.finished && r && <div className="ch-body" key={state.round}>
      <QuestionCard r={r} round={state.round} count={count} kicker="Passenger asks" />
      {result === 'right' ? <><Answers chase={chase} r={r} /><Outcome chase={chase} title={<>Passenger delivered</>} detail={<>The answer: <b>{r.answer}</b></>} nextLabel={state.round + 1 >= count ? 'Finish game' : 'Next passenger'} /></> : <>
        <div className={'ch-controls' + (readOnly ? ' ch-controls-watch' : '')} role="group" aria-label="Steering">
          {!readOnly && <button type="button" className="ch-steer" disabled={!canAct || lane === 0} onClick={() => steer(-1)}><Arrow dir={-1} />Steer left</button>}
          <p className={'ch-note tx-lane-note' + (blocked ? ' blocked' : '')} aria-live="polite">{blocked ? HINTS.cone : `Lane ${lane + 1} of ${LANES} · clear road ahead`}</p>
          {!readOnly && <button type="button" className="ch-steer" disabled={!canAct || lane === LANES - 1} onClick={() => steer(1)}>Steer right<Arrow dir={1} /></button>}
        </div>
        <Answers chase={chase} r={r} quietHint={HINTS.cone} />
      </>}
    </div>}
  </section>;
  return expandable ? <GameFrame title={title || 'Taxi town'}>{body}</GameFrame> : body;
}
