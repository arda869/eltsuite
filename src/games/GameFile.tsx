import {ADVENTURES} from './AdventureBoard';
import { GameDraft } from './GameDraft';
import { useEffect, useState } from 'react';
import { doc, getDocs, collection, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useMyDocs, type SharedDoc } from '../lib/sharedDocs';
import { configOf, plainOf, type Card, type FlashConfig } from '../lib/flash';
import { TaskEditor } from '../editor/TaskEditor';
import { GamePlayer } from './GamePlayer';
import { blankGame, GAME_TYPES, THEMES, gameProblems, type GameConfig, type GameRound } from './model';
import './games.css';
export function GameFile({ d, canEdit }: {
    d: SharedDoc;
    canEdit: boolean;
}) {
    const { user } = useAuth();
    const { mine } = useMyDocs(user?.uid);
    const [game, setGame] = useState<GameConfig | null>(null), [play, setPlay] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [source, setSource] = useState(''), [native, setNative] = useState<string | null>(null);
    useEffect(() => onSnapshot(doc(db, 'sharedDocs', d.id, 'game', 'main'), s => { setGame(s.exists() ? s.data() as GameConfig : blankGame()); }, e => setError(e.message)), [d.id]);
    useEffect(() => { if (!dirty)
        return; const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);
    if (!game)
        return <p role="status">Opening game…</p>;
    const change = (p: Partial<GameConfig>) => { setGame({ ...game, ...p }); setDirty(true); setStatus('Unsaved changes'); };
    const round = (id: string, p: Partial<GameRound>) => change({ rounds: game.rounds.map(r => r.id === id ? { ...r, ...p } : r) });
    const problems = gameProblems(game);
    const save = async () => { setBusy(true); setError(''); try {
        await setDoc(doc(db, 'sharedDocs', d.id, 'game', 'main'), game);
        await updateDoc(doc(db, 'sharedDocs', d.id), { updatedAt: serverTimestamp() });
        setDirty(false);
        setStatus('Saved');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const fromCards = async () => { if (!source)
        return; setBusy(true); setError(''); try {
        const f = mine?.find(d => d.id === source) as (SharedDoc & {
            flash?: FlashConfig;
        });
        const cfg = configOf(f?.flash);
        const cards = await getDocs(collection(db, 'sharedDocs', source, 'cards'));
        const rows = cards.docs.map(d => ({ ...d.data(), id: d.id }) as Card).sort((a, b) => a.order - b.order);
        const rounds = rows.map(c => ({ id: crypto.randomUUID(), prompt: cfg.front.map(k => plainOf(c.f[k])).filter(Boolean).join(' — '), answer: cfg.back.map(k => plainOf(c.f[k])).filter(Boolean).join(' — '), choices: [] as string[] })).filter(r => r.prompt && r.answer).slice(0, 60);
        if (!rounds.length)
            throw new Error('This set has no text on both sides. Add text clues and answers to the cards first.');
        for (const r of rounds)
            r.choices = rounds.filter(x => x.answer !== r.answer).slice(0, 3).map(x => x.answer);
        change({ rounds, sourceId: source });
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    if (play || !canEdit)
        return <div className="game-workspace">{canEdit && <button className="btn" type="button" onClick={() => setPlay(false)}>Back to game editor</button>}<GamePlayer game={game}/></div>;
    return <div className="game-workspace"><div className="game-editbar"><h2>Build your game</h2><span role="status">{status}</span><button className="btn" type="button" disabled={busy} onClick={() => void save()}>Save game</button><button className="btn primary" type="button" disabled={!!problems.length} onClick={() => setPlay(true)}>Play preview</button></div>{error && <p role="alert">{error}</p>}{!!problems.length && <div className="game-error">{problems.map(p => <p key={p}>{p}</p>)}</div>}
 <div className="game-settings"><label>Game<select value={game.type} onChange={e => change({ type: e.target.value as GameConfig['type'] })}>{GAME_TYPES.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>Look and feel<select value={game.theme} onChange={e => change({ theme: e.target.value as GameConfig['theme'] })}>{THEMES.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label><input type="checkbox" checked={game.sound} onChange={e => change({ sound: e.target.checked })}/> Start with sound on</label>{ADVENTURES.includes(game.type)&&<label>Seconds per question<select value={game.roundSeconds||30} onChange={e=>change({roundSeconds:Number(e.target.value)})}>{[20,30,60,120].map(n=><option key={n} value={n}>{n} seconds</option>)}</select></label>}</div>
 <GameDraft gameId={d.id} type={game.type} onApply={rounds => change({ rounds })}/>
 <details><summary>Use an existing flashcard set</summary><p>This copies the current card text into the game. Later card edits do not change a saved game.</p><label>Flashcards<select value={source} onChange={e => setSource(e.target.value)}><option value="">Choose a set</option>{mine?.filter(d => d.kind === 'flash').map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button type="button" className="btn" disabled={!source || busy} onClick={() => void fromCards()}>Replace questions with these cards</button></details>
 {game.rounds.map((r, i) => <section className="game-question" key={r.id}><h3>{game.type === 'auction' ? 'Sentence' : 'Question'} {i + 1}</h3><label>{game.type === 'auction' ? 'Sentence to judge' : 'Question or clue'}<textarea value={r.prompt} onChange={e => round(r.id, { prompt: e.target.value })}/></label><label>Answer<input value={r.answer} onChange={e => round(r.id, { answer: e.target.value })}/></label><label>Other answer options (one per line)<textarea value={r.choices.join('\n')} onChange={e => round(r.id, { choices: e.target.value.split('\n') })}/></label>{game.type === 'show' && <><button className="btn" type="button" onClick={() => setNative(native === r.id ? null : r.id)}>Edit inline task</button>{native === r.id && <TaskEditor content={r.content || { type: 'doc', content: [{ type: 'paragraph' }] }} onChange={content => round(r.id, { content })}/>}</>}
 <button type="button" className="btn" onClick={() => change({ rounds: game.rounds.filter(x => x.id !== r.id) })}>Remove question {i + 1}</button></section>)}
 <button className="btn" type="button" onClick={() => change({ rounds: [...game.rounds, { id: crypto.randomUUID(), prompt: '', answer: '', choices: [] }] })}>Add question</button></div>;
}
