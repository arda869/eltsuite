import {GameFrame} from './GameFrame';
import {AdventureBoard,ADVENTURES} from './AdventureBoard';
import { AuctionBoard, newAuction, type AuctionState } from './AuctionBoard';
import { ArcadeBoard } from './ArcadeBoard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskRenderer } from '../components/TaskRenderer';
import { questionIds, scoreTask, splitKey, type Responses } from '../lib/questions';
import { GAME_TYPES, gameProblems, norm, optionsFor, shuffled, wordGrid, type GameConfig } from './model';
import './games.css';
import { playSfx } from './sfx';
const stable = (v: any): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export function GamePlayer({ game, onFinish, remote, onState, readOnly = false, expandable = true }: {
    game: GameConfig;
    onFinish?: (score: number, total: number) => void;
    remote?: Record<string, any> | null;
    onState?: (state: Record<string, unknown>) => void;
    readOnly?: boolean;
    expandable?: boolean;
}) {
    const [round, setRound] = useState(0), [score, setScore] = useState(0), [answer, setAnswer] = useState(''), [feedback, setFeedback] = useState<string | null>(null), [stake, setStake] = useState(10), [responses, setResponses] = useState<Responses>({});
    const [auction, setAuction] = useState<AuctionState>(newAuction);
    const [arcade, setArcade] = useState<Record<string, any>>({});
    const [guessed, setGuessed] = useState<string[]>([]), [flipped, setFlipped] = useState<string[]>([]), [matched, setMatched] = useState<string[]>([]), [found, setFound] = useState<string[]>([]), [selected, setSelected] = useState<number[]>([]), [sound, setSound] = useState(game.sound), [finished, setFinished] = useState(false);
    const signature = useRef('');
    const mounted = useRef(false);
    const hydrating = useRef(false);
    const send = useRef(onState);
    send.current = onState;
    useEffect(() => { if (!remote || signature.current === stable(remote))
        return; hydrating.current=true; signature.current = stable(remote); setRound(remote.round || 0); setScore(remote.score || 0); setAnswer(remote.answer || ''); setFeedback(remote.feedback ?? null); setStake(remote.stake || 10); setResponses(remote.responses || {}); setGuessed(remote.guessed || []); setFlipped(remote.flipped || []); setMatched(remote.matched || []); setFound(remote.found || []); setSelected(remote.selected || []); setFinished(!!remote.finished); setArcade(remote.arcade || {}); setAuction(remote.auction || newAuction()); }, [remote]);
    useEffect(() => { const state = { round, score, answer, feedback, stake, responses, guessed, flipped, matched, found, selected, finished, arcade, auction }; const json = stable(state);
        // Joining a board is a read: do not race other players with an empty initial move.
        if (!mounted.current) { mounted.current = true; if (!remote) { signature.current = json; return; } }
        if(hydrating.current){hydrating.current=false;return;} if (readOnly || json === signature.current)
        return; signature.current = json; send.current?.(state); }, [round, score, answer, feedback, stake, responses, guessed, flipped, matched, found, selected, finished, arcade, auction, readOnly]);
    const r = game.rounds[round];
    const options = r ? optionsFor(r) : [];
    const word = r?.answer.toUpperCase() || '';
    const board = useMemo(() => game.type==='search'?wordGrid(game.rounds):{grid:[],paths:{} as Record<string,number[]>,size:0}, [game.rounds,game.type]);
    const cards = useMemo(() => shuffled(game.rounds.flatMap(r => [{ id: r.id + 'a', pair: r.id, text: r.prompt }, { id: r.id + 'b', pair: r.id, text: r.answer }]), 'pairs'), [game.rounds]);
    // An unsuccessful match briefly stays open, then turns face down automatically.
    // Only the controlling player clears shared state; spectators do not publish moves.
    useEffect(() => {
        if (readOnly || flipped.length !== 2) return;
        const first = cards.find(c => c.id === flipped[0]), second = cards.find(c => c.id === flipped[1]);
        if (!first || !second || first.pair === second.pair) return;
        const timeout = window.setTimeout(() => setFlipped(current =>
            current.length === 2 && current[0] === flipped[0] && current[1] === flipped[1] ? [] : current
        ), 900);
        return () => window.clearTimeout(timeout);
    }, [cards, flipped, readOnly]);
    const native = useMemo(() => r?.content ? splitKey(r.content) : null, [r]);
    // Word cloud: this round's choices drift among the other rounds' answers.
    const cloudWords = useMemo(() => game.type !== 'cloud' || !r ? [] : shuffled([...new Map([...options, ...game.rounds.map(x => x.answer), ...game.rounds.flatMap(x => x.choices)].map(w => w.trim()).filter(Boolean).map(w => [norm(w), w])).values()].slice(0, 14), r.id + 'cloud'), [game.type, game.rounds, r, options.join('|')]);
    const problems = gameProblems(game);
    if (problems.length)
        return <div className="game-error" role="alert">{problems.map(p => <p key={p}>{p}</p>)}</div>;
    const tone = (ok: boolean) => { if (sound) playSfx(game.theme, ok ? 'right' : 'wrong'); };
    const finish = (points: number, total: number) => { setScore(points); setFinished(true); if (sound) playSfx(game.theme, points > 0 ? 'win' : 'lose'); onFinish?.(points, total); };
    const check = (value = answer) => {
        if (feedback !== null)
            return;
        setAnswer(value);
        let correct = norm(value) === norm(r.answer);
        if (native) {
            const s = scoreTask(questionIds(native.content), native.key, responses);
            if (s.hasWriting || !s.total) {
                setFeedback('Discuss your answer with your teacher. This round is not automatically scored.');
                return;
            }
            correct = s.score === s.total;
        }
        const change = game.type === 'wager' || game.type === 'auction' ? (correct ? stake : -stake) : (correct ? 10 : 0);
        setScore(s => s + change);
        setFeedback(correct ? 'Correct!' : `Answer: ${r.answer}`);
        tone(correct);
    };
    const next = () => { if (round + 1 === game.rounds.length) {
        finish(score, game.rounds.length * 10);
        return;
    } setRound(round + 1); setAnswer(''); setResponses({}); setFeedback(null); setGuessed([]); setStake(10); setArcade(ADVENTURES.includes(game.type)?{stack:arcade.stack||[],phase:"ready"}:{}); };
    const replay = () => {
        setRound(0); setScore(0); setAnswer(''); setFeedback(null); setStake(10);
        setResponses({}); setAuction(newAuction()); setArcade({}); setGuessed([]);
        setFlipped([]); setMatched([]); setFound([]); setSelected([]); setFinished(false);
    };
    const flip = (id: string) => { if (flipped.length === 2 || flipped.includes(id) || matched.includes(cards.find(c => c.id === id)!.pair))
        return; const next = [...flipped, id]; setFlipped(next); if (sound) playSfx(game.theme, 'flip'); if (next.length === 2) {
        const a = cards.find(c => c.id === next[0])!, b = cards.find(c => c.id === next[1])!;
        if (a.pair === b.pair) {
            const m = [...matched, a.pair];
            setMatched(m);
            tone(true);
            setFlipped([]);
            if (m.length === game.rounds.length)
                finish(m.length * 10, m.length * 10);
        }
    } };
    const cell = (i: number) => {
        // Keep only valid prefixes. A mistaken tap starts a new selection instead
        // of forcing learners to clear the whole attempt manually.
        const paths = Object.entries(board.paths).filter(([id]) => !found.includes(id));
        const prefixes = paths.flatMap(([, path]) => [path, [...path].reverse()]);
        const attempt = [...selected, i];
        const starts = (path: number[], values: number[]) => values.every((v, n) => path[n] === v);
        const next = prefixes.some(path => starts(path, attempt)) ? attempt
            : prefixes.some(path => path[0] === i) ? [i] : [];
        setSelected(next);
        for (const [id, path] of paths) {
            if (next.length === path.length && (starts(path, next) || starts([...path].reverse(), next))) {
                const complete = [...new Set([...found, id])];
                setFound(complete); setSelected([]); tone(true);
                if (complete.length === game.rounds.length) finish(complete.length * 10, complete.length * 10);
                break;
            }
        }
    };
    const result = feedback === null ? undefined : feedback.startsWith('Correct') ? 'right' : feedback.startsWith('Discuss') ? undefined : 'wrong';
    const completedSteps = finished ? game.rounds.length
        : game.type === 'pairs' ? matched.length
        : game.type === 'search' ? found.length
        : game.type === 'auction' ? auction.lot
        : round + (feedback !== null ? 1 : 0);
    const completion = Math.round(completedSteps / game.rounds.length * 100);
    const body = <section className={`game-stage game-${game.type} game-theme-${game.theme}`} data-result={finished ? 'finished' : result} aria-label={GAME_TYPES.find(g => g.id === game.type)?.name}>
 {(result === 'right' || finished) && <div key={finished ? 'end' : 'r' + round} className="game-burst" aria-hidden="true">{Array.from({ length: finished ? 28 : 16 }, (_, i) => <i key={i} style={{ ['--i' as string]: i, ['--n' as string]: finished ? 28 : 16 }} />)}</div>}
 <header className="game-toolbar"><div className="game-title"><span className="game-title-eyebrow">THE PLAYROOM</span><strong>{GAME_TYPES.find(g => g.id === game.type)?.name}</strong></div><div className="game-toolbar-actions"><span className="game-score" key={score}>{score} points</span><button type="button" className="game-sound" onClick={() => setSound(!sound)} aria-pressed={sound}>Sound {sound ? 'on' : 'off'}</button></div></header>
 <div className="game-progress" aria-label="Game progress"><div className="game-progress-text"><span>{game.type === 'pairs' ? 'Pairs matched' : game.type === 'search' ? 'Words found' : game.type === 'auction' ? 'Lots completed' : 'Rounds completed'}</span><strong>{completedSteps} / {game.rounds.length}</strong></div><div className="game-progress-track" role="progressbar" aria-label="Game completed" aria-valuemin={0} aria-valuemax={game.rounds.length} aria-valuenow={completedSteps}><span style={{width:completion+'%'}}/></div></div>
 <fieldset disabled={readOnly} className="game-controls">{game.type === 'auction' ? <><AuctionBoard rounds={game.rounds} state={auction} onChange={a => { setAuction(a); if (a.complete) {
            const points = a.bought.filter(b => norm(game.rounds[b.lot].answer) === 'correct').length * 10;
            finish(points, game.rounds.length * 10);
        } }} disabled={readOnly}/>{auction.complete && !onState && <button type="button" className="game-replay" onClick={replay}>Play again</button>}</> : finished ? <div className="game-finish" role="status"><span className="game-finish-icon" aria-hidden="true">★</span><span className="game-finish-eyebrow">{arcade.loss?'THE ADVENTURE ENDS':'WELL PLAYED'}</span><h2>{arcade.loss?"Game over":"Game complete"}</h2><p className="game-finish-score">{['pairs', 'search'].includes(game.type) ? game.rounds.length * 10 : score} points</p>{arcade.loss?<><p>{arcade.loss==="stack"?"The blocks reached the top.":"Time ran out."} Answer: {r.answer}</p><p>{onState?"Your teacher can start a new game from Play mode and sharing.":"Try again to improve your score."}</p></>:<p>Discuss one answer you want to remember.</p>}{!onState && <button type="button" className="game-replay" onClick={replay}>Play again</button>}</div> : game.type === 'pairs' ? <><p>Turn over two cards. Match each clue to its answer.</p><div className="game-pairs">{cards.map(c => <button key={c.id} data-card-id={c.id} type="button" className={matched.includes(c.pair) ? 'matched' : ''} aria-label={flipped.includes(c.id) || matched.includes(c.pair) ? c.text : `Face-down card ${cards.indexOf(c) + 1}`} onClick={() => flip(c.id)} disabled={matched.includes(c.pair)}>{flipped.includes(c.id) || matched.includes(c.pair) ? c.text : <span className="game-card-back" aria-hidden="true">✦</span>}</button>)}</div><p className="game-pair-status" role="status">{flipped.length === 2 ? 'Not a match. Turning the cards back over…' : matched.length ? matched.length + ' of ' + game.rounds.length + ' pairs found' : 'Find your first pair'}</p></> : game.type === 'search' ? <><p>Select letters in order, in any direction. A mistaken tap starts a new attempt.</p><ul className="game-word-clues">{game.rounds.map(r => <li key={r.id} className={found.includes(r.id)?'found':''}>{found.includes(r.id) ? '✓ ' : ''}{r.prompt}</li>)}</ul><div className="game-wordgrid-scroll" role="region" aria-label="Word search letter grid" tabIndex={0}><div className="game-wordgrid" style={{ gridTemplateColumns: `repeat(${board.size},minmax(36px,1fr))` }}>{board.grid.flat().map((letter, i) => <button type="button" key={i} aria-label={`Row ${Math.floor(i / board.size) + 1}, column ${i % board.size + 1}: ${letter}`} aria-pressed={selected.includes(i) || found.some(id => board.paths[id].includes(i))} onClick={() => cell(i)}>{letter}</button>)}</div></div><button type="button" className="game-clear" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button></> : <>
 <p className="game-round">Round {round + 1} of {game.rounds.length}</p><h2>{r.prompt}</h2>
 {game.type === 'hangman' ? <><p>Choose letters to discover the word. You have six mistakes.</p><div className="game-word" aria-live="polite">{[...word].map(c => guessed.includes(c) ? c : '_').join(' ')}</div><p>{guessed.filter(c => !word.includes(c)).length} / 6 mistakes</p><div className="game-keyboard">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => <button type="button" key={c} disabled={guessed.includes(c) || feedback !== null} onClick={() => { const g = [...guessed, c]; setGuessed(g); if ([...word].every(x => g.includes(x)))
                check(r.answer);
            else if (g.filter(x => !word.includes(x)).length === 6)
                check(''); }}>{c}</button>)}</div></> : <>
 {game.type === 'wager' && <label>Points to risk <select disabled={feedback !== null} value={stake} onChange={e => setStake(+e.target.value)}>{[5, 10, 20, 50].map(n => <option key={n}>{n}</option>)}</select></label>}
 {ADVENTURES.includes(game.type)?<AdventureBoard key={r.id} type={game.type} round={round} seconds={game.roundSeconds||30} options={options} answer={r.answer} remote={arcade} onState={setArcade} onCorrect={check} onLose={()=>{setAnswer('');setFeedback('Time ran out.');setFinished(true);tone(false);}} disabled={readOnly||feedback!==null}/>:['targets', 'pinball', 'maze', 'slice', 'moles'].includes(game.type) ? <ArcadeBoard key={r.id} type={game.type} remote={arcade} onState={setArcade} options={options} onAnswer={check} disabled={feedback !== null || readOnly}/> : native ? <TaskRenderer content={native.content} responses={responses} results={feedback !== null ? native.key : undefined} onChange={(id, v) => setResponses(s => ({ ...s, [id]: v }))} disabled={readOnly || feedback !== null}/> : game.type === 'cloud' ? <WordCloud key={r.id} words={cloudWords} disabled={feedback !== null} onPick={check}/> : options.length > 1 ? <div className="game-options">{options.map((v, i) => <button key={v} type="button" disabled={feedback !== null} data-answer-state={feedback !== null ? norm(v) === norm(r.answer) ? 'correct' : norm(v) === norm(answer) ? 'incorrect' : undefined : undefined} onClick={() => check(v)}><span className="game-object" aria-hidden="true">{game.type === 'slice' ? ['🍊', '🍉', '🍎', '🍐'][i % 4] : game.type === 'moles' ? '🐹' : game.type === 'targets' ? '◎' : game.type === 'pinball' ? '●' : game.type === 'maze' ? '➜' : String.fromCharCode(65 + i)}</span>{v}</button>)}</div> : <label>Your answer<input value={answer} disabled={feedback !== null} onChange={e => setAnswer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter')
                check(); }}/></label>}
 {(native || options.length <= 1) && <button type="button" disabled={feedback !== null} onClick={() => check()}>Check answer</button>}</>}
 {feedback !== null && <div className="game-feedback" role="status"><p>{feedback}</p><button type="button" onClick={next}>{round + 1 === game.rounds.length ? 'Finish game' : 'Next round'}</button></div>}</>}
 </fieldset></section>;
 return expandable?<GameFrame title={GAME_TYPES.find(g=>g.id===game.type)?.name||'Game'}>{body}</GameFrame>:body;
}

// A cloud of words drifting on the stage. Learners tap the one that answers the question.
function WordCloud({ words, disabled, onPick }: { words: string[]; disabled: boolean; onPick: (w: string) => void }) {
    const sizes = [1.9, 1.25, 1.55, 1.05, 1.7, 1.15, 1.4, 1.0, 1.6, 1.2, 1.35, 1.1, 1.5, 1.0];
    return <div className="game-wordcloud" role="group" aria-label="Word cloud">{words.map((w, i) => <button key={w} type="button" disabled={disabled} onClick={() => onPick(w)} style={{ ['--s' as string]: sizes[i % sizes.length], ['--d' as string]: `${(i * 0.37) % 2.4}s`, ['--r' as string]: `${((i * 53) % 9) - 4}deg` }}>{w}</button>)}</div>;
}
