import {learnOrigin} from '../lib/site';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { GamePlayer } from './GamePlayer';
import { gameApi } from './api';
import type { GameConfig } from './model';
type Session = {
    id: string;
    title: string;
    game: GameConfig;
    mode: string;
    target: {
        type: string;
        id: string;
    };
    selected: string[];
    state: Record<string, any> | null;
    revision: number;
    ended: boolean;
    runId?: number;
    pointer?: {
        x: number;
        y: number;
        at: number;
        clicked: boolean;
        by: string;
    };
};
type Open = {
    session: Session;
    teacher: boolean;
    uid: string;
    players: {
        id: string;
        name: string;
        state: Record<string, any>;
    }[];
};
export function GameSession({ id }: {
    id: string;
}) {
    const [value, setValue] = useState<Open | null>(null), [error, setError] = useState(''), [qr, setQr] = useState(''), [mode, setMode] = useState('teacher'), [selected, setSelected] = useState<string[]>([]), [members, setMembers] = useState<{
        id: string;
        name: string;
    }[]>([]), [busy, setBusy] = useState(false);
    const pointerAt = useRef(0);
    const current = useRef(value);
    const inFlight = useRef(false);
    if(!inFlight.current)current.current = value;
    const pending = useRef<Record<string, unknown>[]>([]);
    const load = async () => { const r = await gameApi<Open>('open', { id }); setValue(prev => JSON.stringify(prev) === JSON.stringify(r) ? prev : r); return r; };
    useEffect(() => {let alive=true;void gameApi<Open>('open',{id}).then(r=>{if(alive)setValue(r);}).catch(e=>setError(e.message));return()=>{alive=false;};},[id]);
    useEffect(()=>{
      if(!value?.uid)return;
      const fail=(e:Error)=>setError(e.message);
      const a=onSnapshot(doc(db,'gameSessions',id),snap=>{if(!snap.exists()||inFlight.current)return;setValue(v=>v?{...v,session:{...snap.data(),id} as Session}:v);},fail);
      const b=onSnapshot(collection(db,'gameSessions',id,'scores'),snap=>{setValue(v=>v?{...v,players:snap.docs.map(d=>({id:d.id,name:d.data().name,state:d.data()})).map(p=>p.id===v.uid?{...p,state:v.players.find(x=>x.id===p.id)?.state||p.state}:p)}:v);},fail);
      const c=onSnapshot(doc(db,'gameSessions',id,'players',value.uid),snap=>{if(!snap.exists()||inFlight.current)return;setValue(v=>v?{...v,players:[...v.players.filter(p=>p.id!==v.uid),{id:v.uid,name:snap.data().name,state:snap.data().state}]}:v);},fail);
      return()=>{a();b();c();};
    },[id,value?.uid]);
    useEffect(() => { void QRCode.toDataURL(learnOrigin() + '/game/' + encodeURIComponent(id), { width: 180, margin: 2 }).then(setQr); }, [id]);
    useEffect(() => { if (!value?.teacher || value.session.target.type !== 'class')
        return; void getDocs(collection(db, 'classes', value.session.target.id, 'members')).then(s => setMembers(s.docs.map(d => ({ id: d.id, name: d.data().name || d.data().displayName || 'Learner' })))).catch(e => setError(e.message)); }, [value?.teacher, value?.session.target.id]);
    const send = async (state: Record<string, unknown>) => { pending.current.push(state); if (inFlight.current)
        return; inFlight.current = true; try {
        while (pending.current.length) {
            const next = pending.current.shift()!;
            await gameApi('state', { id, state: next, revision: current.current?.session.revision });
            const r = await gameApi<Open>('open', { id });
            current.current = r;
            if (!pending.current.length)
                setValue(r);
        }
        setError('');
    }
    catch (e) {
        pending.current = [];
        setError((e as Error).message);
        await load().catch(() => { });
    }
    finally {
        inFlight.current = false;
    } };
    if (!value)
        return <section className="game-workspace" role="status">{error || 'Opening game…'}</section>;
    const { session: s, teacher, uid } = value;
    const canPlay = !s.ended && (teacher || s.mode === 'individual' || s.selected.includes(uid));
    const remote = s.mode === 'individual' ? value.players.find(p => p.id === uid)?.state : s.state;
    return <section className="game-workspace"><h2>{s.title}</h2><div className="game-print-join">{qr&&<img src={qr} width="180" height="180" alt="Scan to play this game"/>}<p>Scan to play on your phone. Sign in with your class account.</p><small>{learnOrigin()+"/game/"+id}</small></div>{error && <p role="alert">{error}</p>}{teacher && <details><summary>Play mode and sharing</summary><label>Who plays?<select value={mode} onChange={e => setMode(e.target.value)}><option value="teacher">Teacher plays; class watches</option><option value="selected">One selected learner</option><option value="multiplayer">Selected learners play together</option><option value="individual">Everyone on their own device</option></select></label>{['selected', 'multiplayer'].includes(mode) && <div>{members.map(m => <label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e => setSelected(a => e.target.checked ? [...a, m.id] : a.filter(x => x !== m.id))}/>{m.name}</label>)}</div>}<button className="btn" type="button" disabled={busy} onClick={async () => { setBusy(true); try {
        await gameApi('configure', { id, mode, selected });
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>Start this mode</button><p>Changing modes starts a new shared board.</p>{qr && <img src={qr} width="180" height="180" alt="QR code to open this game on a phone"/>}<p><a href={'/game/' + id}>Open this game</a> · Class membership is required.</p><button className="btn" type="button" onClick={() => window.print()}>Print game link</button></details>}
 {!canPlay && <p role="status">{s.ended ? 'This game has ended.' : 'Watch the shared board. Your teacher chooses who plays.'}</p>}
 <div className="game-live-board" onPointerMove={e => { if (!canPlay || s.mode === 'individual' || Date.now() - pointerAt.current < 700)
        return; pointerAt.current = Date.now(); const r = e.currentTarget.getBoundingClientRect(); void gameApi('pointer', { id, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, clicked: false }).catch(() => { }); }} onPointerDown={e => { if (!canPlay || s.mode === 'individual')
        return; const r = e.currentTarget.getBoundingClientRect(); void gameApi('pointer', { id, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, clicked: true }).catch(() => { }); }}><GamePlayer key={s.mode+":"+(s.runId||0)} game={s.game} remote={remote} readOnly={!canPlay} onState={send}/>{s.pointer && s.pointer.by !== uid && Date.now() - s.pointer.at < 5000 && <span aria-hidden="true" className={"game-live-cursor" + (s.pointer.clicked ? " clicked" : "")} style={{ left: `${s.pointer.x * 100}%`, top: `${s.pointer.y * 100}%` }}>➤</span>}</div>
 {s.mode === 'individual' && <section><h3>Class leaderboard</h3><p>Practice points · completed games</p><ol>{value.players.filter(p => p.state?.finished).sort((a, b) => (b.state.score || 0) - (a.state.score || 0)).map(p => <li key={p.id}>{p.name}: {p.state.score || 0}</li>)}</ol></section>}
 {teacher && <button className="btn" type="button" onClick={async () => { try {
        await gameApi('end', { id });
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    } }}>End game</button>}</section>;
}
export function GameSessionPage() { const { id = '' } = useParams(); return <main><GameSession id={id}/></main>; }
