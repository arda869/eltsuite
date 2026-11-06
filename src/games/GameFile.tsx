import { ADVENTURES } from './AdventureBoard';
import { GameDraft } from './GameDraft';
import { useEffect, useRef, useState } from 'react';
import { doc, getDocs, collection, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useMyDocs, type SharedDoc } from '../lib/sharedDocs';
import { configOf, plainOf, type Card, type FlashConfig } from '../lib/flash';
import { TaskEditor } from '../editor/TaskEditor';
import { UiIcon } from '../components/UiIcon';
import { GamePlayer } from './GamePlayer';
import { blankGame, GAME_TYPES, SHOW_TIMERS, THEMES, gameProblems, type GameConfig, type GameRound } from './model';
import './games.css';

export function GameFile({ d, canEdit, onSaved, onChanged }: { d: SharedDoc; canEdit: boolean; onSaved?: () => void; onChanged?: () => void }) {
    const { user } = useAuth();
    const { mine } = useMyDocs(user?.uid);
    const [game, setGame] = useState<GameConfig | null>(null);
    const [play, setPlay] = useState(() => new URLSearchParams(window.location.search).get('play') === '1'), [error, setError] = useState(''), [status, setStatus] = useState('Saved');
    const [loadTry, setLoadTry] = useState(0), [slowLoad, setSlowLoad] = useState(false);
    const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [source, setSource] = useState('');
    const [selected, setSelected] = useState(''), [native, setNative] = useState(false);
    const [undo, setUndo] = useState<GameConfig | null>(null);
    const [pendingCards, setPendingCards] = useState<GameRound[] | null>(null);
    const dirtyRef = useRef(false), revision = useRef(0);
    const latestSave = useRef<() => void>(() => {});
    useEffect(() => {
        dirtyRef.current = false; setDirty(false); setGame(null); setSelected(''); setUndo(null); setStatus('Saved'); setError(''); setSlowLoad(false);
        const timeout = window.setTimeout(() => setSlowLoad(true), 12000);
        const unsubscribe = onSnapshot(doc(db, 'sharedDocs', d.id, 'game', 'main'), s => {
            window.clearTimeout(timeout);
            // A remote snapshot must never replace edits made while a save is in flight.
            if (!dirtyRef.current) {
                const loaded = s.exists() ? s.data() as GameConfig : blankGame();
                setGame(loaded);
                if (play && gameProblems(loaded).length) { setPlay(false); setError('Finish the game questions before playing. Your draft is ready to edit below.'); }
            }
        }, e => { window.clearTimeout(timeout); setError(e.message || 'Could not load this game.'); });
        return () => { window.clearTimeout(timeout); unsubscribe(); };
    }, [d.id, loadTry]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!dirty) return;
        const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', leave);
        return () => window.removeEventListener('beforeunload', leave);
    }, [dirty]);
    useEffect(() => {
        if (!canEdit) return;
        const key = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); latestSave.current(); }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [canEdit]);
    if (!game) return <div className="game-workspace game-load-state" role={error ? 'alert' : 'status'}><h2>{error ? 'Could not open this game' : slowLoad ? 'Still opening your game' : 'Opening game…'}</h2><p>{error || (slowLoad ? 'Check your connection, then try again.' : 'Loading your questions and settings.')}</p>{(error || slowLoad) && <button type="button" className="btn primary" onClick={() => setLoadTry(n => n + 1)}>Retry</button>}<a className="btn" href="/games">Back to Games</a></div>;
    const change = (p: Partial<GameConfig>, checkpoint = false) => {
        if (checkpoint) setUndo(game);
        onChanged?.();
        revision.current++; dirtyRef.current = true;
        setGame({ ...game, ...p }); setDirty(true); setStatus('Unsaved changes');
    };
    const active = game.rounds.find(r => r.id === selected) || game.rounds[0];
    const index = active ? game.rounds.indexOf(active) : -1;
    const round = (p: Partial<GameRound>) => active && change({ rounds: game.rounds.map(r => r.id === active.id ? { ...r, ...p } : r) });
    const problems = gameProblems(game);
    const localProblems = problems.filter(p => p.startsWith(`Question ${index + 1}:`) || p.startsWith(`Sentence ${index + 1}:`));
    const kind = game.type === 'pairs' ? 'Pair' : game.type === 'auction' ? 'Sentence' : 'Question';
    const words = ['hangman', 'search'].includes(game.type);
    const choices = !words && !['pairs', 'auction'].includes(game.type);
    const limit = game.type === 'pairs' ? 12 : game.type === 'search' ? 16 : 60;
    const save = async () => {
        if (busy) return;
        const savedRevision = revision.current;
        setBusy(true); setError(''); setStatus('Saving…');
        try {
            await setDoc(doc(db, 'sharedDocs', d.id, 'game', 'main'), game);
            await updateDoc(doc(db, 'sharedDocs', d.id), { updatedAt: serverTimestamp() });
            if (revision.current === savedRevision) { dirtyRef.current = false; setDirty(false); setStatus('Saved'); onSaved?.(); }
            else setStatus('Unsaved changes');
        } catch (e) { setError((e as Error).message); setStatus('Not saved — try again'); }
        finally { setBusy(false); }
    };
    latestSave.current = () => void save();
    const useRounds = (rounds: GameRound[], append = false) => {
        change({ rounds: append ? [...game.rounds, ...rounds] : rounds }, true);
        setSelected(rounds[0]?.id || ''); setNative(false);
    };
    const add = () => useRounds([{ id: crypto.randomUUID(), prompt: '', answer: '', choices: [] }], true);
    const move = (direction: number) => {
        const rounds = [...game.rounds];
        [rounds[index], rounds[index + direction]] = [rounds[index + direction], rounds[index]];
        change({ rounds }, true); setSelected(active.id);
    };
    const fromCards = async () => {
        if (!source) return;
        setBusy(true); setError('');
        try {
            const f = mine?.find(d => d.id === source) as (SharedDoc & { flash?: FlashConfig });
            const cfg = configOf(f?.flash);
            const cards = await getDocs(collection(db, 'sharedDocs', source, 'cards'));
            const rows = cards.docs.map(d => ({ ...d.data(), id: d.id }) as Card).sort((a, b) => a.order - b.order);
            const rounds = rows.map(c => ({ id: crypto.randomUUID(), prompt: cfg.front.map(k => plainOf(c.f[k])).filter(Boolean).join(' — '), answer: cfg.back.map(k => plainOf(c.f[k])).filter(Boolean).join(' — '), choices: [] as string[] })).filter(r => r.prompt && r.answer).slice(0, limit);
            if (!rounds.length) throw new Error('This set has no text on both sides. Add text clues and answers to the cards first.');
            for (const r of rounds) r.choices = rounds.filter(x => x.answer !== r.answer).slice(0, 3).map(x => x.answer);
            setPendingCards(rounds);
        } catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
    };
    if (play || !canEdit) return <div className="game-workspace">{canEdit && <div className="game-editbar"><button className="btn" type="button" onClick={() => setPlay(false)}><UiIcon name="prev"/>Back to game editor</button><span>Play preview · your answers here are not saved as learner results</span></div>}<GamePlayer game={game} title={d.title}/></div>;
    return <div className="game-workspace game-builder">
        <header className="game-editbar"><div><h2>Build your game</h2><p>Shape the questions. Try it as a learner. Bring it to class.</p></div><div className="game-editor-actions"><span role="status">{status}</span><button className="btn" type="button" title="Save game (Ctrl/⌘ S)" disabled={busy} onClick={() => void save()}><UiIcon name="videoSave"/>{busy ? 'Saving…' : 'Save game'}</button><button className="btn primary" type="button" disabled={!!problems.length} aria-describedby={problems.length ? 'game-readiness' : undefined} onClick={() => setPlay(true)}><UiIcon name="videoPlay"/>Play preview</button></div></header>
        {error && <p role="alert" className="game-error">{error}</p>}
        <div className="game-settings"><div><strong>{GAME_TYPES.find(t => t.id === game.type)?.name || 'Quiz Show'}</strong><p className="hint">{GAME_TYPES.find(t => t.id === game.type)?.about}</p></div><details className="game-appearance"><summary>Appearance and timing</summary><label>Look and feel<select value={game.theme} onChange={e => change({ theme: e.target.value as GameConfig['theme'] })}>{THEMES.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label className="game-check"><input type="checkbox" checked={game.sound} onChange={e => change({ sound: e.target.checked })}/> Start with sound on</label>{ADVENTURES.includes(game.type) && <label>Seconds per question<select value={game.roundSeconds || 30} onChange={e => change({ roundSeconds: Number(e.target.value) })}>{[20, 30, 60, 120].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label>}
        {game.type === 'show' && <div className="game-show-settings"><label>Time to answer<select value={game.showTimer || 0} onChange={e => change({ showTimer: Number(e.target.value) })}>{SHOW_TIMERS.map(n => <option key={n} value={n}>{n ? `${n} seconds a question` : 'No timer'}</option>)}</select></label><p className="hint">{game.showTimer ? 'When time runs out the question scores nothing and the answer is shown. Give more time if your learners need it.' : 'Without a timer, learners take as long as they need.'}</p><label className="game-check"><input type="checkbox" checked={game.showLock !== false} onChange={e => change({ showLock: e.target.checked })}/> Ask players to lock in their answer</label><p className="hint">A second tap confirms the answer, with a moment of suspense before the result.</p><label className="game-check"><input type="checkbox" checked={game.showLifelines !== false} onChange={e => change({ showLifelines: e.target.checked })}/> Offer lifelines</label><p className="hint">Once a game: Take two away removes two wrong options{game.showTimer ? '; Extra time adds 20 seconds' : ''}.</p></div>}</details></div>
        <div className="game-sources"><GameDraft gameId={d.id} type={game.type} existingCount={game.rounds.length} onApply={useRounds}/><details><summary>Use an existing flashcard set</summary><p>Copy text from your cards, then review it here. Your original set stays unchanged.</p><label>Flashcards<select value={source} onChange={e => { setSource(e.target.value); setPendingCards(null); }}><option value="">Choose a set</option>{mine?.filter(d => d.kind === 'flash').map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>{!source && <p className="hint">Choose a flashcard set to review its questions.</p>}<button type="button" className="btn" disabled={!source || busy} onClick={() => void fromCards()}><UiIcon name="import"/>Review card questions</button>{pendingCards && <section><h3>{pendingCards.length} questions ready to use</h3><ol>{pendingCards.map(r => <li key={r.id}>{r.prompt} — <strong>{r.answer}</strong></li>)}</ol><div className="game-editor-actions"><button className="btn" onClick={() => { useRounds(pendingCards); setPendingCards(null); }}>Replace questions</button><button className="btn" onClick={() => { useRounds(pendingCards, true); setPendingCards(null); }}>Add to questions</button></div><p className="hint">Review the answer format for your chosen game before saving.</p></section>}</details></div>
        <div className="game-readiness" id="game-readiness">{problems.length ? <details><summary>{problems.length} {problems.length === 1 ? 'thing' : 'things'} to finish before playing · drafts can still be saved</summary><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></details> : <span><UiIcon name="check"/> Ready to play · {game.rounds.length} {game.rounds.length === 1 ? kind.toLowerCase() : kind.toLowerCase() + 's'}</span>}{undo && <button className="btn" onClick={() => { change(undo); setUndo(null); }}>Undo last change</button>}</div>
        <div className="game-editor-grid">
            <nav className="game-question-list" aria-label="Game questions"><div className="game-list-heading"><h3>{kind}s</h3><span>{game.rounds.length}/{limit}</span></div>{game.rounds.length ? <ol>{game.rounds.map((r, i) => <li key={r.id}><button type="button" aria-current={active?.id === r.id ? 'true' : undefined} onClick={() => { setSelected(r.id); setNative(false); }}><span className="game-question-number">{i + 1}</span><span><strong>{r.prompt || (r.content ? 'Inline activity' : `New ${kind.toLowerCase()}`)}</strong><small>{problems.some(p => p.startsWith(`Question ${i + 1}:`) || p.startsWith(`Sentence ${i + 1}:`)) ? 'Needs attention' : r.answer || 'Inline activity'}</small></span></button></li>)}</ol> : <p className="hint">Your questions will appear here.</p>}<button type="button" className="btn" disabled={game.rounds.length >= limit} onClick={add}><UiIcon name="plus"/>Add question</button>{game.rounds.length >= limit && <p className="hint">This game supports up to {limit} {kind.toLowerCase()}s.</p>}</nav>
            <section className="game-question game-focused-question" aria-label="Question editor">{active ? <><div className="game-question-heading"><h3>{kind} {index + 1}</h3><div className="game-editor-actions"><button className="btn" title="Move earlier" aria-label="Move question earlier" disabled={index === 0} onClick={() => move(-1)}><UiIcon name="prev"/></button><button className="btn" title="Move later" aria-label="Move question later" disabled={index === game.rounds.length - 1} onClick={() => move(1)}><UiIcon name="next"/></button><button className="btn" disabled={game.rounds.length >= limit} onClick={() => useRounds([{ ...active, id: crypto.randomUUID() }], true)}><UiIcon name="copyall"/>Duplicate</button><button className="btn" aria-label={`Remove question ${index + 1}`} onClick={() => { change({ rounds: game.rounds.filter(r => r.id !== active.id) }, true); setSelected(game.rounds[index + 1]?.id || game.rounds[index - 1]?.id || ''); }}><UiIcon name="trash"/>Remove</button></div></div>
            <label>{game.type === 'auction' ? 'Sentence to judge' : game.type === 'pairs' ? 'First side' : 'Question or clue'}<textarea rows={4} value={active.prompt} onChange={e => round({ prompt: e.target.value })} placeholder={game.type === 'pairs' ? 'For example: airport' : 'For example: Where do planes take off?'}/></label>
            {game.type === 'auction' ? <label>Answer<select aria-label="Answer" value={active.answer.toLowerCase()} onChange={e => round({ answer: e.target.value })}><option value="">Choose the judgement</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option>{active.answer && !['correct','incorrect'].includes(active.answer.toLowerCase()) && <option value={active.answer.toLowerCase()}>Review: {active.answer}</option>}</select></label> : <label>{game.type === 'pairs' ? 'Matching side' : words ? 'Word to find' : 'Answer'}<input value={active.answer} onChange={e => round({ answer: e.target.value })} placeholder={game.type === 'pairs' ? 'For example: a place where planes take off' : 'For example: airport'}/></label>}
            {words && <p className="hint">One English word, 2–16 letters, without spaces or punctuation.</p>}
            {choices && <fieldset className="game-answer-options"><legend>Other answer options {['show','wager'].includes(game.type) ? '(optional)' : ''}</legend><p className="hint">Add plausible alternatives. The correct answer above is included automatically.</p>{active.choices.map((value, n) => <div className="game-option-row" key={n}><label>Option {n + 1}<input value={value} onChange={e => round({ choices: active.choices.map((v, j) => j === n ? e.target.value : v) })}/></label><button className="btn" aria-label={`Remove option ${n + 1}`} onClick={() => round({ choices: active.choices.filter((_, j) => j !== n) })}><UiIcon name="trash"/></button></div>)}<button className="btn" onClick={() => round({ choices: [...active.choices, ''] })}><UiIcon name="plus"/>Add answer option</button></fieldset>}
            {game.type === 'show' && <label>Explanation (optional)<textarea rows={2} maxLength={600} value={active.note || ''} onChange={e => round({ note: e.target.value })} placeholder="For example: We borrow books from a library. A bookshop sells them."/><span className="hint">Shown with the correct answer after each question.</span></label>}
            {!!localProblems.length && <div className="game-error" aria-label="Question needs attention">{localProblems.map(p => <p key={p}>{p.replace(/^(Question|Sentence) \d+: /, '')}</p>)}</div>}
            {game.type === 'show' && <div className="game-inline-editor"><button className="btn" aria-expanded={native} onClick={() => setNative(v => !v)}><UiIcon name="task"/>Edit inline task</button>{native && <><p className="hint">Use the same inline elements as your lessons. This activity takes the place of the simple question when played.</p><TaskEditor key={active.id} content={active.content || { type: 'doc', content: [{ type: 'paragraph' }] }} onChange={content => round({ content })}/>{active.content && <button className="btn" onClick={() => { const { content: _content, ...simple } = active; change({ rounds: game.rounds.map(r => r.id === active.id ? simple : r) }, true); }}>Use simple question instead</button>}</>}</div>}
            <div className="game-question-footer"><span className="hint">{index + 1} of {game.rounds.length}</span>{index < game.rounds.length - 1 && <button className="btn" onClick={() => { setSelected(game.rounds[index + 1].id); setNative(false); }}>Next {kind.toLowerCase()}<UiIcon name="next"/></button>}</div></> : <div className="game-empty"><UiIcon name="quiz" size={36}/><h3>Start with what you want learners to practise</h3><p>Add a question, create a draft with AI, or reuse a flashcard set above.</p><button className="btn primary" onClick={add}><UiIcon name="plus"/>Write the first question</button></div>}</section>
            <aside className="game-preview-card" aria-label="Question overview"><h3>At a glance</h3><div className={`game-theme-sample game-theme-${game.theme}`}><UiIcon name="quiz" size={32}/><strong>{GAME_TYPES.find(t => t.id === game.type)?.name}</strong><span>{THEMES.find(t => t.id === game.theme)?.name}</span></div><h4>{kind} {index + 1 || 1}</h4><p>{active?.prompt || 'Your question will appear here.'}</p>{active?.answer && <p><span className="hint">Teacher answer</span><br/><strong>{active.answer}</strong></p>}{active?.content && <p className="hint">Includes an inline activity. Play preview to interact with it.</p>}{game.type === 'show' && <p className="hint">{[game.showTimer ? `${game.showTimer} seconds a question` : 'No timer', game.showLock !== false ? 'Lock in answers' : 'Tap to answer', game.showLifelines !== false ? 'Lifelines on' : 'No lifelines'].join(' · ')}</p>}<p className="hint">Use Play preview above to test the full game with its current settings.</p></aside>
        </div>
    </div>;
}
