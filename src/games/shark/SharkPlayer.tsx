// Shark escape: row from island to island, one question each. The shark closes in as the clock
// runs; a right answer lands you on the next island, a wrong one costs nothing but time. Time out
// and the shark catches up: game over, with the answer shown.
import { GameFrame } from '../GameFrame';
import { useChase, type ChaseProps } from '../chase/useChase';
import { Answers, Clock, Facts, Outcome, Pips, QuestionCard, Score, SoundButton, Burst, useChaseKeys, useStageFocus } from '../chase/ChaseParts';
import { SharkScene, type SharkMood } from './SharkScene';
import '../chase/chase.css';
import './shark.css';

export function SharkPlayer(props: ChaseProps) {
  const { title, expandable = true, onState } = props;
  const chase = useChase(props, false);
  const { state, r, phase, result, running, welcome, fraction, remaining, seconds, count, wrongTries, sound, setSound, problems, start, readOnly, theme } = chase;
  const keys = useChaseKeys(chase);
  const stage = useStageFocus(chase);
  if (problems.length) return <div className="game-error" role="alert">{problems.map(p => <p key={p}>{p}</p>)}</div>;

  const lost = state.finished && state.arcade.loss === 'time';
  const mood: SharkMood = lost || phase === 'lost' ? 'lost' : result === 'right' ? 'cleared' : running ? 'running' : 'idle';
  const progress = mood === 'lost' ? 1 : mood === 'cleared' ? Math.max(0, fraction - .25) : running ? fraction : 0.04;
  const reached = state.finished && !lost ? count : state.round + (result === 'right' ? 1 : 0);
  const soundButton = <SoundButton on={sound} onToggle={() => setSound(v => !v)} />;
  const facts = [`${count} ${count === 1 ? 'island' : 'islands'} to reach`, `${seconds} seconds a question`, 'Wrong answers: try again'];

  const body = <section className={`chase-stage shark-stage game-shark shark-theme-${theme}`} data-phase={state.finished ? 'finished' : phase} data-result={result || undefined} aria-label="Shark escape" onKeyDown={keys} tabIndex={-1} ref={stage}>
    <div className="ch-scene">
      <SharkScene progress={progress} mood={mood} splashes={wrongTries.length} urgent={running && remaining > 0 && remaining <= 5} />
      {!welcome && !state.finished && <header className="ch-hud">
        <div className="ch-hud-left"><span className="ch-chip"><span className="ch-kicker">Island {Math.min(count, state.round + 1)}</span></span><Pips count={count} round={state.round} state={state} label="Islands" /></div>
        <div className="ch-hud-right"><Clock remaining={remaining} fraction={fraction} running={running} seconds={seconds} /><Score value={state.score} label="points" />{soundButton}</div>
      </header>}
      {welcome && <div className="ch-overlay"><div className="ch-panel sk-welcome">
        <span className="ch-kicker">Shark escape</span>
        <h2>{title || 'Shark escape'}</h2>
        <Facts items={facts} />
        <p className="ch-how">Answer each question before the shark catches up. A right answer takes you to the next island.</p>
        <div className="ch-panel-actions">{readOnly ? <p className="ch-waiting" role="status">Waiting for the game to start…</p> : <button type="button" className="ch-primary big" onClick={start}>Start rowing</button>}{soundButton}</div>
      </div></div>}
      {state.finished && <div className="ch-overlay ch-overlay-side"><div className="ch-panel sk-finish" role="status">
        {!lost && <Burst n={32} />}
        <span className="ch-kicker">{lost ? 'Game over' : 'Safe and dry'}</span>
        <h2>{lost ? 'The shark caught up' : 'Game complete'}</h2>
        <p className="ch-final"><b>{state.score}</b><span>points</span></p>
        <dl className="ch-stats"><div><dt>Islands</dt><dd>{reached} of {count}</dd></div><div><dt>Time a question</dt><dd>{seconds}s</dd></div><div><dt>Result</dt><dd>{lost ? 'Caught' : 'Escaped'}</dd></div></dl>
        {lost && r && <p className="ch-answer-recap">Time ran out. The answer was <b>{r.answer}</b>.</p>}
        <p className="ch-reflect">{lost ? 'Say the answer you missed in a sentence of your own.' : 'Which question was the hardest? Tell a partner why.'}</p>
        <div className="ch-panel-actions">{!onState && !readOnly && <button type="button" className="ch-primary" onClick={start}>{lost ? 'Try again' : 'Play again'}</button>}{onState && lost && <p className="ch-waiting">Your teacher can start a new game from Play mode and sharing.</p>}{soundButton}</div>
      </div></div>}
    </div>
    {!welcome && !state.finished && r && <div className="ch-body" key={state.round}>
      <QuestionCard r={r} round={state.round} count={count} kicker="Question" />
      <Answers chase={chase} r={r} />{result === 'right' && <Outcome chase={chase} title={<>Island reached</>} detail={<>The answer: <b>{r.answer}</b></>} nextLabel={state.round + 1 >= count ? 'Finish game' : 'Next island'} />}
    </div>}
  </section>;
  return expandable ? <GameFrame title={title || 'Shark escape'}>{body}</GameFrame> : body;
}
