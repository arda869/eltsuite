import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { NSelect } from '../components/Select';
import { useImageSrc } from '../editor/PackNode';
import { ACTIVITY_LABELS, boardArt, boardLayout, boardStyleOf, dominoTiles, plainText, type ActivityConfig, type ActivityPicture, type ActivityItem, type Participant } from './model';
import { currentPerson, learnerCallVisibility, nextRoller, opinionsShown, surveyCounts, type ActivityAction, type ActivityState } from './state';

export type ActivityStageProps = {
  config: ActivityConfig; state: ActivityState; selfId: string; teacher?: boolean;
  send: (action: ActivityAction) => void; busy?: boolean; error?: string;
  renderItem?: (item: ActivityItem) => ReactNode; classId?: string;
};
const MediaClass = createContext('');
const vars = (v: Record<string, string | number>) => v as CSSProperties;
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const colour = (n: number) => `var(--team-${n % 6 + 1})`;

// A picture added in the card with / (the editor preview has no rich renderer, so show the first one).
function richPicture(nodes: ActivityItem['content'] = []): ActivityPicture | undefined {
  for (const n of nodes) {
    if (['picture', 'image'].includes(n.type ?? '') && typeof n.attrs?.src === 'string' && n.attrs.src) return { src: n.attrs.src, alt: String(n.attrs.alt ?? ''), fit: 'cover' };
    const inner = richPicture(n.content); if (inner) return inner;
  }
  return undefined;
}
function Picture({ item }: { item: ActivityItem }) {
  const src = useImageSrc(useContext(MediaClass), item.picture?.src ?? '');
  return src ? <img className="ca-pic" src={src} alt={item.picture?.alt} style={{ objectFit: item.picture?.fit ?? 'cover', objectPosition: item.picture?.position ?? '50% 50%' }} /> : null;
}
function SpotPicture({ picture }: { picture: ActivityPicture }) { const url = useImageSrc(useContext(MediaClass), picture.src); return url ? <img className="pic" src={url} alt={picture.alt} style={{width:'100%',height:'100%',maxWidth:'none',maxHeight:'none',margin:0,objectFit:picture.fit ?? 'cover',objectPosition:picture.position ?? '50% 50%'}} /> : <p role="status">Loading your picture…</p>; }
function Useful({ text }: { text?: string }) {
  return text?.trim() ? <div className="ca-useful"><span>Useful language</span><ul>{text.split('\n').filter(Boolean).map((line, n) => <li key={n}>{line}</li>)}</ul></div> : null;
}
function Private({ children, label }: { children: ReactNode; label: string }) {
  return <div className="ca-private"><div className="ca-private-band"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></svg>{label}</div>{children}</div>;
}
function Wait({ title, children }: { title: string; children: ReactNode }) { return <div className="ca-wait"><b>{title}</b><span>{children}</span></div>; }

// Speaking timer, 2026-11 feedback: just a timer. The teacher chooses whether it counts up or down and who
// it is for; anyone with it on their screen can start it. Each screen keeps its own time, so a learner's
// or a group's timer never waits for the network.
function fmt(total: number) { const t = Math.max(0, Math.round(total)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
export function SimpleTimer({ config: c, teacher }: { config: ActivityConfig; teacher: boolean }) {
  const down = c.settings.timerDirection !== 'up', total = c.settings.seconds ?? 60;
  const scope = c.settings.timerFor ?? (c.settings.mode === 'individual' ? 'individual' : c.settings.mode === 'groups' ? 'group' : 'class');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const [now, setNow] = useState(Date.now());
  const audio = useRef<AudioContext | null>(null), rang = useRef(false);
  const elapsed = banked + (startedAt === null ? 0 : (now - startedAt) / 1000);
  const shown = down ? Math.max(0, total - elapsed) : elapsed;
  const finished = down && shown <= 0;
  useEffect(() => { if (startedAt === null) return; const tick = window.setInterval(() => setNow(Date.now()), 200); return () => window.clearInterval(tick); }, [startedAt]);
  useEffect(() => {
    if (!finished || rang.current) return;
    rang.current = true; setBanked(total); setStartedAt(null);
    const context = audio.current; if (!context || context.state !== 'running') return;
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = 'sine'; tone.frequency.value = 523.25;
    gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.03); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.65);
    tone.connect(gain); gain.connect(context.destination); tone.start(); tone.stop(context.currentTime + 0.7);
  }, [finished, total]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const start = () => { try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* no sound on this device */ } if (finished) { setBanked(0); rang.current = false; } setNow(Date.now()); setStartedAt(Date.now()); };
  const pause = () => { setBanked(elapsed); setStartedAt(null); };
  const reset = () => { setBanked(0); setStartedAt(null); rang.current = false; };
  const who = scope === 'class' ? 'Whole-class timer' : scope === 'group' ? (teacher ? 'Group timer · each group starts its own' : 'Your group’s timer') : (teacher ? 'Learner timer · each learner starts their own' : 'Your timer');
  const progress = down ? 100 * shown / Math.max(1, total) : 100 * ((elapsed % 60) / 60);
  const ending = down && shown <= 10 && !finished && startedAt !== null;
  // One line: sits in the flow of a lesson like a sentence. The teacher chooses it in the timer settings.
  if (c.settings.timerSize === 'inline') return <div className={`ca-timer-line ${finished ? 'done' : ''} ${ending ? 'soon' : ''} ${startedAt !== null ? 'live' : ''}`}>
    <span className="ca-tl-who">{who}</span>
    <b className="ca-tl-time" role="timer" aria-live="off">{fmt(shown)}</b>
    <span className="ca-tl-track" aria-hidden="true"><span style={vars({ '--p': `${progress}%` })} /></span>
    {finished ? <span role="status" className="ca-tl-end">Time’s up</span> : <small className="ca-tl-from">{down ? `from ${fmt(total)}` : 'counting up'}</small>}
    <span className="ca-tl-actions">{startedAt === null ? <button type="button" className="ca-tl-btn primary" onClick={start} aria-label={finished ? 'Start again' : elapsed > 0 ? 'Carry on' : 'Start'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg></button> : <button type="button" className="ca-tl-btn primary" onClick={pause} aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg></button>}<button type="button" className="ca-tl-btn" disabled={elapsed === 0} onClick={reset} aria-label="Back to the start" data-tip="Back to the start"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M18 6.5v11L10 12z" /></svg></button></span>
  </div>;
  return <div className={`ca-timer ${finished ? 'done' : ''} ${ending ? 'soon' : ''}`}>
    <span className="eyebrow">{who}</span>
    <div className="ca-ring-timer ca-timer-face" style={vars({ '--p': progress })}><svg viewBox="0 0 36 36" aria-hidden="true"><circle className="t" cx="18" cy="18" r="15.9155" /><circle className="f" cx="18" cy="18" r="15.9155" /></svg><b role="timer" aria-live="off">{fmt(shown)}</b><small>{down ? `from ${fmt(total)}` : 'counting up'}</small></div>
    {finished && <p role="status" className="ca-timer-end">Time’s up.</p>}
    <div className="ca-timer-actions">{startedAt === null ? <button type="button" className="btn primary" onClick={start}>{finished ? 'Start again' : elapsed > 0 ? 'Carry on' : 'Start'}</button> : <button type="button" className="btn primary" onClick={pause}>Pause</button>}<button type="button" className="btn" disabled={elapsed === 0} onClick={reset}>Reset</button></div>
  </div>;
}

export function ActivityStage({ config: c, state: s, selfId, teacher = false, send, busy = false, error, renderItem, classId = '' }: ActivityStageProps) {
  const [now, setNow] = useState(Date.now());
  const [reason, setReason] = useState(s.opinions[selfId]?.reason ?? '');
  const [position, setPosition] = useState(s.opinions[selfId]?.value ?? 50);
  const [dropped, setDropped] = useState(false);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [pictureTab, setPictureTab] = useState(0);
  const [inspected, setInspected] = useState('');
  const [positions, setPositions] = useState(s.positions);
  const displayedPositions = useRef(s.positions);
  const [rolling, setRolling] = useState(false);
  const [tumble, setTumble] = useState(1);
  const [dragging, setDragging] = useState('');
  const [dropAt, setDropAt] = useState(-1);
  useEffect(() => {
    if (s.endsAt === null || s.phase !== 'running') return;
    const tick = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(tick);
  }, [s.endsAt, s.phase]);
  useEffect(() => { setChosenName(null); setInspected(''); }, [c.id]);
  useEffect(() => {
    if (c.kind !== 'board') return;
    const target=s.positions;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || s.phase === 'ready') {displayedPositions.current=target;setPositions(target);return;}
    if (JSON.stringify(displayedPositions.current) === JSON.stringify(target)) return;
    const tick=window.setInterval(()=>{
      const next=Object.fromEntries(Object.entries(target).map(([id,end])=>{const start=displayedPositions.current[id]??0;return [id,start===end?end:start+Math.sign(end-start)];}));
      displayedPositions.current=next;setPositions(next);
      if (Object.entries(target).every(([id,end])=>next[id]===end)) window.clearInterval(tick);
    },90);
    return ()=>window.clearInterval(tick);
  }, [c.kind,s.positions,s.phase]);
  useEffect(()=>{
    if(c.kind!=='board'||s.die===null||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    setRolling(true);const spin=window.setInterval(()=>setTumble(1+Math.floor(Math.random()*6)),85);const timer=window.setTimeout(()=>{window.clearInterval(spin);setRolling(false);},900);return ()=>{window.clearInterval(spin);window.clearTimeout(timer);};
  },[c.kind,s.die]);
  const active = currentPerson(s), myTurn = teacher || active?.id === selfId;
  const running = s.phase === 'running', canAct = running && !busy;
  const remaining = s.endsAt === null ? null : Math.max(0, Math.ceil((s.endsAt - now) / 1000));
  const respondent = teacher ? (s.people.find(p => p.id === inspected) ?? s.people[0])?.id ?? '' : selfId;
  const itemById = (id: string) => c.items.find(i => i.id === id);
  const body = (item: ActivityItem) => <><Picture item={!item.picture?.src && !renderItem ? { ...item, picture: richPicture(item.content) } : item} />{item.title && (!renderItem || item.title !== plainText(item.content)) && <span>{item.title}</span>}{renderItem ? renderItem(item) : plainText(item.content) && plainText(item.content)!==item.title ? <span>{plainText(item.content)}</span> : null}</>;
  const move = (from: number, to: number) => {
    if (!canAct || from < 0 || to < 0 || to >= s.order.length || from === to) return;
    const ids = [...s.order]; const [id] = ids.splice(from, 1); ids.splice(to, 0, id); send({ type: 'order', ids });
  };
  const orderControls = (index: number, label: string) => <span className="ca-move-tools"><button type="button" aria-label={`Move ${label} up`} disabled={!canAct || index === 0} onClick={() => move(index, index - 1)}>↑</button><button type="button" aria-label={`Move ${label} down`} disabled={!canAct || index === s.order.length - 1} onClick={() => move(index, index + 1)}>↓</button></span>;
  const ranked = () => <div className={c.settings.layout === 'diamond' ? 'ca-diamond ca-diamond-live' : 'ca-rank'}>{s.order.map((id, n) => {
    const item = itemById(id); if (!item) return null;
    return <div key={id} className="ca-rank-item" draggable={canAct} onDragStart={e => e.dataTransfer.setData('text/plain', id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); move(s.order.indexOf(e.dataTransfer.getData('text/plain')), n); }}><span className="ca-rank-n">{n + 1}</span><span>{body(item)}</span>{orderControls(n, item.title || `item ${n + 1}`)}</div>;
  })}</div>;
  const turn = ['board', 'memory', 'taboo'].includes(c.kind) && active ? <div className={`ca-turn ${active.id === selfId ? 'mine' : 'theirs'}`} style={vars({ '--c': colour(s.turn) })}><span className="avatar c" aria-hidden="true">{initials(active.name)}</span><span className="ca-turn-who">{active.id === selfId ? 'Your turn' : `${active.name}’s turn`}</span>{remaining !== null && <span className="timer-chip" role="timer" aria-label={`${remaining} seconds remaining`}>{remaining}s</span>}</div> : null;

  let inner: ReactNode;
  switch (c.kind) {
    case 'board': {
      const style = boardStyleOf(c.settings.boardStyle);
      const { cols, rows, cells } = boardLayout(c.items.length, style);
      const layout = (n: number): CSSProperties => ({ gridRow: cells[n].row, gridColumn: cells[n].col });
      const art = boardArt(c.items.length, style);
      const square = c.items[s.positions[active?.id ?? ''] ?? 0];
      const roller = nextRoller(c, s), canRoll = (teacher || roller === selfId) && running && !busy && !rolling;
      const roll = () => { if (canRoll) send({ type: 'roll', die: 0 }); };
      // The die is the button: click it (or the button beside it) to roll. It tumbles, then lands.
      const die = <button type="button" className={`ca-die ${rolling ? 'rolling' : ''} ${canRoll ? 'ready' : ''}`} data-face={rolling ? tumble : s.die ?? 1} disabled={!canRoll} onClick={roll} aria-label={s.die === null ? (canRoll ? 'Roll the die' : 'Die') : `Die: ${s.die}`}>{Array.from({length:9},(_,n)=><i key={n}/>)}</button>;
      inner = <><div className="ca-board-wrap"><div className="ca-board-stage" style={vars({ '--cols': cols, '--rows': rows })}><div className={`ca-board ca-board-${style}`} style={vars({ '--cols': cols, '--rows': rows })}>{style === 'spiral' && art && <div className="ca-board-art" dangerouslySetInnerHTML={{ __html: art }} />}{c.items.map((item, n) => <div key={item.id} className={`ca-sq ${item.special ?? ''} ${Object.values(positions).includes(n) ? 'here' : ''}`} style={layout(n)}><span className="ca-sq-n">{n + 1}</span><Picture item={item} /><span className="ca-sq-text">{item.special === 'start' ? 'Start' : item.special === 'finish' ? 'Finish' : item.title}</span><span className="ca-pins">{s.people.filter(p => positions[p.id] === n).map(p => <span key={p.id} className="ca-pinname" title={p.name}><span className="ca-pin" style={vars({ '--c': colour(s.people.indexOf(p)) })}><span>{initials(p.name)}</span></span><span className="sr-only">{p.name}</span></span>)}</span></div>)}{style === 'ladders' && art && <div className="ca-board-art" dangerouslySetInnerHTML={{ __html: art }} />}</div></div>
        <aside className="ca-board-side"><div className="ca-dice-row">{die}{canRoll ? <button type="button" className="btn primary ca-roll" onClick={roll}>Roll</button> : null}</div>{s.die !== null && square && !rolling && <div className="ca-prompt ca-paper"><span className="eyebrow">Square {(s.positions[active?.id ?? ''] ?? 0) + 1}</span><div className="ca-prompt-text">{body(square)}</div></div>}{!myTurn && running && (roller === selfId ? <p className="ca-next-roll" role="status">You roll next. Listen to {active?.name.split(/\s+/)[0] ?? 'your partner'} first, then roll the die.</p> : <Wait title={`${active?.name ?? 'Your partner'} is playing`}>Watch their token, then listen to their answer.</Wait>)}<div className="ca-players">{s.people.map((p, n) => <span key={p.id} className={`ca-player ${active?.id === p.id ? 'now' : ''}`} style={vars({ '--c': colour(n) })}><span className="ca-pin"><span>{initials(p.name)}</span></span>{p.name.split(/\s+/)[0]}<small>{(positions[p.id] ?? 0) + 1}</small></span>)}</div></aside></div></>;
      break;
    }
    case 'bingo': {
      const size = c.settings.gridSize ?? 4;
      const card = s.cards[selfId];
      const currentCall = itemById(s.currentCall ?? '');
      const callVisibility = learnerCallVisibility(c);
      const callBody = (item: ActivityItem) => <span className="ca-callbody"><span className="ca-call-word">{body(item)}</span>{item.call?.trim() && item.call !== item.title && <small className="ca-call-text">{item.call}</small>}</span>;
      // Learners hear or read the call, never the word itself: finding the word is the game.
      const learnerCall = (item: ActivityItem) => <span className="ca-call-text">{item.call?.trim() || 'Listen to your teacher'}</span>;
      inner = <>{teacher && <><div className="ca-call"><span className="eyebrow">Current call</span><div className="ca-call-now">{currentCall ? callBody(currentCall) : 'Start the first call'}</div><button type="button" className="btn primary" disabled={!canAct || s.called.length === c.items.length} onClick={() => { const available = c.items.filter(i => !s.called.includes(i.id)); if (available.length) send({ type: 'call', itemId: '' }); }}>Draw a call</button></div><div className="ca-calls">{c.items.map((item, n) => <button type="button" key={item.id} aria-label={item.call || item.title || plainText(item.content) || `Call ${n + 1}`} className={s.called.includes(item.id) ? 'on' : ''} disabled={!canAct || s.called.includes(item.id)} onClick={() => send({ type: 'call', itemId: item.id })}>{callBody(item)}</button>)}</div><details className="ca-bingo-review" open={Object.keys(s.claims).length>0}><summary>Check a learner’s card</summary><label className="ca-setting">Learner<NSelect value={respondent} onChange={e=>setInspected(e.target.value)}>{s.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</NSelect></label><div className="ca-bingo" style={vars({'--size':size})}>{(s.cards[respondent]??[]).map((id,n)=>{const marked=id==='__free__'||s.marked[respondent]?.includes(id),called=id==='__free__'||s.called.includes(id);return <div key={n} className={`ca-cell ${marked?'on':''} ${marked&&!called?'uncalled':''}`}>{id==='__free__'?'Free':itemById(id)?body(itemById(id)!):''}<small>{marked?(called?'Marked · called':'Marked · not called'):called?'Called':'Not called'}</small></div>;})}</div></details><div className="ca-claims">{Object.entries(s.claims).map(([id, claim]) => <p key={id}><b>{s.people.find(p => p.id === id)?.name}</b>: {claim.valid ? 'Bingo checked' : 'Not yet — check the marked squares'}</p>)}</div></>}{!teacher && card && <><div className="ca-bingo" style={vars({ '--size': size })}>{card.map((id, n) => <button key={n} type="button" className={`ca-cell ${(s.marked[selfId] ?? []).includes(id) || id === '__free__' ? 'on' : ''}`} disabled={!canAct || id === '__free__'} aria-label={id === '__free__' ? 'Free square' : itemById(id)?.title || plainText(itemById(id)?.content) || `Square ${n + 1}`} aria-pressed={(s.marked[selfId] ?? []).includes(id) || id === '__free__'} onClick={() => send({ type: 'mark', itemId: id })}>{id === '__free__' ? 'Free' : itemById(id) ? body(itemById(id)!) : ''}</button>)}</div>{callVisibility === 'current' && s.currentCall && <div className="ca-say ca-learner-call"><span className="eyebrow">Listen</span>{currentCall && learnerCall(currentCall)}</div>}<button type="button" className="btn primary ca-go" disabled={!canAct} onClick={() => send({ type: 'claim' })}>Bingo</button>{s.claims[selfId] && <p role="status">{s.claims[selfId].valid ? 'Your card has a winning pattern. Your teacher can check it now.' : 'Not yet. Listen to the calls and check your marked squares.'}</p>}</>}{!teacher && callVisibility === 'list' && s.called.length > 0 && <div className="ca-calls" aria-label="Calls so far">{s.called.map(id => itemById(id)).filter((item): item is ActivityItem => !!item).map(item=><span key={item.id}>{learnerCall(item)}</span>)}</div>}{!teacher && !card && <Wait title="Your card is not ready">Your teacher will add you to this game.</Wait>}</>;
      break;
    }
    case 'strips':
      // Torn paper strips you drag into order. Keyboard: focus a strip and use the up and down arrows.
      inner = <><ol className={`ca-strips ca-torn ${dragging ? 'is-dragging' : ''}`} aria-label="Story strips">{s.order.map((id, n) => {
        const item = itemById(id); if (!item) return null;
        return <li key={id} className={`ca-strip ${dragging === id ? 'lift' : ''} ${dropAt === n && dragging !== id ? 'drop' : ''} ${s.checked && s.correct ? 'ok' : ''}`} tabIndex={canAct ? 0 : -1} draggable={canAct} aria-label={`Strip ${n + 1}: ${item.title || plainText(item.content)}. Use the arrow keys to move it.`} onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); move(n, n - 1); } if (e.key === 'ArrowDown') { e.preventDefault(); move(n, n + 1); } }} onDragStart={e => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setDragging(id); }} onDragEnd={() => { setDragging(''); setDropAt(-1); }} onDragOver={e => { e.preventDefault(); if (dropAt !== n) setDropAt(n); }} onDrop={e => { e.preventDefault(); move(s.order.indexOf(e.dataTransfer.getData('text/plain')), n); setDragging(''); setDropAt(-1); }}><span className="ca-strip-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span><span className="ca-strip-text">{body(item)}</span></li>;
      })}</ol><button type="button" className="btn primary ca-go" disabled={!canAct} onClick={() => send({ type: 'check' })}>Check the order</button>{s.checked && <p role="status">{s.correct ? 'The order is correct.' : 'Not quite. Move the strips and try again.'}</p>}</>;
      break;
    case 'dominoes':
      inner = <><div className={c.kind === 'dominoes' ? 'ca-chain' : 'ca-strips'}>{s.order.map((id, n) => {
        const item = itemById(id); if (!item) return null;
        const tile = item.dominoRight ? {left:item.title,leftPicture:item.picture,right:item.dominoRight.text,rightPicture:item.dominoRight.picture} : dominoTiles(c.items).find(t => t.id === id)!;
        return <div className={c.kind === 'dominoes' ? 'ca-domino' : 'ca-strip'} key={id} draggable={canAct} onDragStart={e => e.dataTransfer.setData('text/plain', id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); move(s.order.indexOf(e.dataTransfer.getData('text/plain')), n); }}><span className="n">{n + 1}</span>{c.kind === 'dominoes' ? <><span><Picture item={{...item,picture:tile.leftPicture}}/>{tile.left}</span><span><Picture item={{...item,picture:tile.rightPicture}}/>{tile.right}</span></> : <span>{body(item)}</span>}{orderControls(n, item.title || `strip ${n + 1}`)}</div>;
      })}</div><button type="button" className="btn primary ca-go" disabled={!canAct} onClick={() => send({ type: 'check' })}>Check the order</button>{s.checked && <p role="status">{s.correct ? 'The order is correct.' : 'Check the order and try again.'}</p>}</>;
      break;
    case 'memory':
      inner = <><div className="ca-memory">{s.deck.map((id, n) => { const face=s.deckMap?.[id]??{itemId:id.slice(0,-2),side:id.endsWith(':b')?'b':'a'}; const item = itemById(face.itemId); const won = s.won[face.itemId]; const up = !!won || s.faceUp.includes(id); return <button type="button" key={id} className={`ca-mcard ${up ? 'up' : ''} ${won ? 'won' : ''}`} disabled={!canAct || !myTurn || up || s.faceUp.length === 2} aria-label={up ? `${item?.title ?? ''}: ${face.side==='b' ? item?.match ?? '' : 'first half'}` : `Turn over card ${n + 1}`} onClick={() => send({ type: 'flip', cardId: id })}>{up ? <span className="face">{face.side==='b' ? <>{item&&<Picture item={{...item,picture:item.matchPicture}}/>}{item?.match}</> : item ? body(item) : ''}{won && <small>Matched by {s.people.find(p => p.id === won)?.name}</small>}</span> : <span className="pk-back" aria-hidden="true">{n + 1}</span>}</button>; })}</div>{s.faceUp.length === 2 && myTurn && <button type="button" className="btn primary ca-go" disabled={busy} onClick={() => send({ type: 'settle' })}>Turn back and change turns</button>}</>;
      break;
    case 'cue':
      inner = c.items.length ? <>{teacher && <div className="ca-assignments"><label className="ca-setting">{c.settings.mode==='groups'?'Card for this group':'Give everyone the same card'}<NSelect value="" disabled={busy} onChange={e=>{if(e.target.value)send({type:'assign',assignments:Object.fromEntries(s.people.map(p=>[p.id,[e.target.value]]))});}}><option value="">Choose a card</option>{c.items.map((item,n)=><option key={item.id} value={item.id}>{item.title||item.picture?.alt||`Card ${n+1}`}</option>)}</NSelect></label>{s.people.map(p => <label className="ca-setting" key={p.id}>Card for {p.name}<NSelect value={s.assignments[p.id]?.[0] ?? ''} disabled={busy} onChange={e => send({type:'assign',assignments:{...s.assignments,[p.id]:[e.target.value]}})}><option value="">Choose a card</option>{c.items.map((item,n) => <option key={item.id} value={item.id}>{item.title||item.picture?.alt||`Card ${n+1}`}</option>)}</NSelect></label>)}</div>}<div className="ca-cues">{c.items.map(item => <Private key={item.id} label={teacher ? `${s.people.filter(p => s.assignments[p.id]?.includes(item.id)).map(p => p.name).join(', ') || 'Not assigned'} · ${item.cardType ?? 'character'}` : 'Only you can see this'}><div className="ca-cue"><span className="eyebrow accent">{item.cardType === 'secret' ? 'Secret objective' : item.cardType ?? 'Character'}</span><div className="ca-cue-title">{item.title}</div><div className="ca-cue-text"><Picture item={item}/>{renderItem ? renderItem(item) : <p>{plainText(item.content)}</p>}</div><Useful text={item.useful || c.settings.useful} /></div></Private>)}</div></> : <Wait title="Your card is on its way">Your teacher will give you a role.</Wait>;
      break;
    case 'ranking':
      inner = <>{ranked()}<Useful text={c.settings.useful} /><div className="ca-agree">{s.people.map(p => <span key={p.id} className={`avatar ${s.agreed.includes(p.id) ? 'yes' : 'wait'}`} title={`${p.name}: ${s.agreed.includes(p.id) ? 'agrees' : 'not agreed yet'}`}>{initials(p.name)}</span>)}</div>{!teacher && <button type="button" className="btn primary ca-go" disabled={!canAct || s.agreed.includes(selfId)} onClick={() => send({ type: 'agree' })}>{s.agreed.includes(selfId) ? 'Waiting for your group' : 'We agree'}</button>}{s.submitted && <p role="status">Everyone has agreed. Your ranking is ready to compare.</p>}</>;
      break;
    case 'opinion':
      {
        // Learners drop a pin: tap or click the line where you stand. Keyboard: focus the line, use the arrow keys.
        const nameOf = (id: string) => c.settings.showNames === false ? 'A learner' : s.people.find(p => p.id === id)?.name ?? '';
        const saved = s.opinions[selfId];
        const drop = (e: ReactMouseEvent<HTMLDivElement>) => { if (teacher || !canAct || locked) return; const r = e.currentTarget.getBoundingClientRect(); setPosition(Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)))); setDropped(true); };
        const nudge = (e: ReactKeyboardEvent<HTMLDivElement>) => { if (teacher || !canAct || locked) return; const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : 0; if (step) { e.preventDefault(); setPosition(v => Math.max(0, Math.min(100, v + step))); setDropped(true); } };
        const locked = !teacher && !!saved && c.settings.pinMove === false;
        const others = Object.entries(s.opinions).filter(([id]) => teacher || (id !== selfId && opinionsShown(c, s, selfId)));
        const mine = !teacher && (dropped || saved);
        inner = <><div className="ca-statement">{c.items[0] ? body(c.items[0]) : null}</div>
          {!teacher && <p className="ca-drop-hint">{locked ? 'Your pin is saved.' : saved && !dropped ? 'This is your pin. Tap the line to move it.' : 'Tap the line to drop your pin where you stand.'}{!opinionsShown(c, s, selfId) ? ' Other pins appear later.' : ''}</p>}
          <div className={`ca-line-wrap ${!teacher && canAct && !locked ? 'can-drop' : ''}`} onClick={drop} onKeyDown={nudge} {...(!teacher ? { role: 'slider', tabIndex: canAct ? 0 : -1, 'aria-label': 'Your pin on the line', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': position, 'aria-valuetext': `${position}% towards ${c.settings.highLabel || 'Strongly agree'}` } : {})}>
            <div className="ca-line">{others.map(([id, value], n) => <span key={id} className="ca-mark" style={vars({ '--x': `${value.value}%` })}><span className="ca-pin" style={vars({ '--c': colour(s.people.some(p => p.id === id) ? s.people.findIndex(p => p.id === id) : n) })} title={nameOf(id)}>{c.settings.showNames === false ? '•' : initials(nameOf(id))}</span><span className="sr-only">{nameOf(id)}: {value.value}%. {value.reason}</span></span>)}
              {mine && <span key={position} className={`ca-mark me ${dropped ? 'dropped' : ''}`} style={vars({ '--x': `${position}%` })}><span className="ca-pin" style={vars({ '--c': colour(s.people.findIndex(p => p.id === selfId)) })}>{initials(nameOf(selfId) || 'Me')}</span></span>}</div>
            <div className="ca-ends"><span>{c.settings.lowLabel || 'Strongly disagree'}</span><span>{c.settings.highLabel || 'Strongly agree'}</span></div></div>
          {teacher && Object.keys(s.opinions).length > 0 && <ol className="ca-opinion-list">{Object.entries(s.opinions).sort((a, b) => a[1].value - b[1].value).map(([id, o]) => <li key={id} style={vars({ '--c': colour(Math.max(0, s.people.findIndex(p => p.id === id))) })}><span className="ca-pin"><span>{initials(nameOf(id))}</span></span><b>{nameOf(id)}</b><span className="ca-opinion-where">{o.value <= 20 ? c.settings.lowLabel || 'Strongly disagree' : o.value >= 80 ? c.settings.highLabel || 'Strongly agree' : o.value < 45 ? `Leans towards ${(c.settings.lowLabel || 'Strongly disagree').toLowerCase()}` : o.value > 55 ? `Leans towards ${(c.settings.highLabel || 'Strongly agree').toLowerCase()}` : 'In the middle'}</span>{o.reason && <q>{o.reason}</q>}</li>)}</ol>}
          {!teacher && <>{c.settings.askReason && <input className="ca-reason" aria-label="Your reason (optional)" placeholder="Give a reason (optional)" value={reason} disabled={!canAct} onChange={e => setReason(e.target.value)} />}{!locked && <button type="button" className="btn primary ca-go" disabled={!canAct || !mine} onClick={() => { send({ type: 'opinion', value: position, reason }); setDropped(false); }}>Save my position</button>}</>}</>;
      }
      break;
    case 'survey':
      inner = <div>{c.items.map(item => { const counts = surveyCounts(s, item.id); return <section key={item.id}><h4 className="ca-say">{body(item)}</h4>{!teacher && <div className="ca-opts">{item.options?.map(option => <button key={option} type="button" className={`ca-opt ca-radio ${s.answers[selfId]?.[item.id] === option ? 'on' : ''}`} role="radio" aria-checked={s.answers[selfId]?.[item.id] === option} disabled={!canAct} onClick={() => send({ type: 'answer', itemId: item.id, value: option })}><i aria-hidden="true" />{option}</button>)}</div>}{(teacher || s.answers[selfId]?.[item.id]) ? <div className="ca-bars">{item.options?.map(option => <div className="ca-bar" key={option}><span>{option}</span><span className="tq-bar"><span style={vars({ '--v': `${100 * (counts[option] ?? 0) / Math.max(1, s.people.length)}%` })} /></span><b>{counts[option] ?? 0}</b></div>)}</div> : <p className="hint">Choose your answer to see the class results.</p>}</section>; })}<p className="hint">Write two sentences about the most common answers.</p>{!teacher ? <label className="ca-setting">Your summary<textarea key={selfId} rows={3} defaultValue={s.summaries?.[selfId] ?? ''} disabled={!canAct} onBlur={e => send({type:'summary',text:e.target.value})} /></label> : <section aria-label="Learner summaries">{s.people.map(p => <p key={p.id}><b>{p.name}:</b> {s.summaries?.[p.id] || 'No summary yet'}</p>)}</section>}</div>;
      break;
    case 'findSomeone':
      inner = <>{teacher && <label className="ca-setting">View a learner’s grid<NSelect value={respondent} onChange={e => setInspected(e.target.value)}>{s.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</NSelect></label>}<div className={`ca-fsw ${c.settings.layout==='grid'?'ca-fsw-grid':''}`}>{c.items.map(item => <div key={item.id} className={`ca-fsw-row ${s.answers[respondent]?.[item.id] ? 'done' : ''}`}><span className="ca-fsw-q">{body(item)}{item.question && <small>{item.question}</small>}</span><button className="ca-fsw-name" type="button" disabled={!canAct || teacher} onClick={() => setChosenName(item.id)}>{s.people.find(p => p.id === s.answers[respondent]?.[item.id])?.name || 'Add a name'}</button>{c.settings.showFollowUp && <label className="ca-fsw-detail">{item.followUp || 'One extra detail'}<input aria-label={`Extra detail for ${item.title}`} key={respondent} maxLength={500} defaultValue={s.details[respondent]?.[item.id] ?? ''} disabled={teacher || !canAct || !s.answers[respondent]?.[item.id]} onBlur={e => send({ type: 'answer', itemId: item.id, value: s.answers[respondent][item.id], detail: e.target.value })} /></label>}</div>)}</div>{chosenName && <div className="ca-sheet" role="dialog" aria-label="Choose a classmate"><button type="button" className="btn" onClick={() => setChosenName(null)}>Close names</button><div className="ca-namegrid">{s.people.filter(p => p.id !== selfId).map(p => { const used = c.settings.nameOnce && Object.entries(s.answers[respondent] ?? {}).some(([id, value]) => id !== chosenName && value === p.id); return <button key={p.id} type="button" className={used ? 'used' : ''} disabled={!!used || busy} onClick={() => { send({ type: 'answer', itemId: chosenName, value: p.id }); setChosenName(null); }}>{p.name}{used && <span className="sr-only"> already used</span>}</button>; })}</div></div>}{teacher && <section className="ca-class-summary"><h4>Class summary</h4>{c.items.map((item,n) => { const ids = [...new Set(Object.values(s.answers).map(answers => answers[item.id]).filter(Boolean))]; return <p key={item.id}><b>{(item.title||item.picture?.alt||`Prompt ${n+1}`).replace(/[.?!]+$/,'')}</b> · {ids.length ? ids.map(id => s.people.find(p => p.id === id)?.name ?? 'Classmate').join(', ') : <span className="hint">No names yet</span>}</p>; })}</section>}</>;
      break;
    case 'spot': {
      const versions = c.settings.versions ?? [], version = versions[pictureTab] ?? versions[0];
      const comparing = s.phase === 'revealed';
      const showPicture = (v: NonNullable<typeof version>, n: number) => <Private key={n} label={teacher || comparing ? v.name : 'Only you can see this'}><div className="ca-spot" onClick={e => { if (!canAct || teacher) return; const r = e.currentTarget.getBoundingClientRect(); send({ type: 'found', x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }); }}><SpotPicture picture={v.picture} />{comparing ? c.settings.differences?.map(d => <span key={d.id} className="ca-ring answer" style={vars({ '--x': `${d.x}%`, '--y': `${d.y}%` })}><span className="sr-only">{d.label}</span></span>) : Object.entries(s.foundPoints?.[selfId] ?? {}).map(([id, point]) => <span key={id} className="ca-ring" style={vars({'--x': `${point.x}%`, '--y': `${point.y}%`})}><span className="sr-only">Your marked difference</span></span>)}</div></Private>;
      inner = <>{!comparing && versions.length > 1 && <div className="seg" aria-label="Picture version">{versions.map((v, n) => <button type="button" key={n} className={pictureTab === n ? 'on' : ''} onClick={() => setPictureTab(n)}>{v.name}</button>)}</div>}{comparing ? <div className="ca-picture-comparison">{versions.map(showPicture)}</div> : version ? showPicture(version, pictureTab) : <Wait title="Your picture is on its way">Your teacher will give you a version.</Wait>}<p className="ca-found" role="status">{s.found[selfId]?.length ?? 0} {(s.found[selfId]?.length ?? 0) === 1 ? 'difference' : 'differences'} found</p>{version && running && !teacher && <div className="ca-coordinate"><label>Across (%)<input type="number" min="0" max="100" defaultValue="50" id={`${c.id}-x`} /></label><label>Down (%)<input type="number" min="0" max="100" defaultValue="50" id={`${c.id}-y`} /></label><button type="button" className="btn" disabled={!canAct} onClick={() => { const x = Number((document.getElementById(`${c.id}-x`) as HTMLInputElement).value); const y = Number((document.getElementById(`${c.id}-y`) as HTMLInputElement).value); send({ type: 'found', x, y }); }}>Mark this point</button></div>}</>;
      break;
    }
    case 'taboo': {
      const item = teacher ? c.items[s.cardIndex] : c.items[0];
      inner = myTurn && item ? <Private label={teacher ? `${active?.name ?? 'Describer'}’s card` : 'Only you can see this'}><div className="ca-taboo"><div className="ca-taboo-word"><small>Describe this word</small>{item.title}</div><Picture item={item} /><ul>{item.taboo?.map(word => <li key={word}>{word}</li>)}</ul><div className="ca-taboo-actions"><button type="button" className="btn primary" disabled={!canAct || remaining === 0} onClick={() => send({ type: 'gotIt' })}>Got it</button><button type="button" className="btn" disabled={!canAct || remaining === 0} onClick={() => send({ type: 'skip' })}>Skip</button></div></div></Private> : <Wait title={`Listen to ${active?.name ?? 'the describer'}`}>Guess the word. The describer keeps the card hidden.</Wait>;
      if (!teacher && running && remaining === 0) inner = <>{inner}<div className="ca-pass"><p role="status">Time’s up.</p><button type="button" className="btn primary" disabled={busy} onClick={() => send({ type: 'swap' })}>Next describer</button></div></>;
      break;
    }
    case 'speaking':
      inner = <SimpleTimer config={c} teacher={teacher} />;
      break;
  }
  // A one-line timer is just the timer: no frame, no header, no waiting for the teacher to press Start.
  if (c.kind === 'speaking' && c.settings.timerSize === 'inline') return <section className={`ca ca-kind-speaking ca-inline ca-pal-${c.settings.colours ?? 'class'}`} aria-label={ACTIVITY_LABELS[c.kind]}><SimpleTimer config={c} teacher={teacher} /></section>;
  return <MediaClass.Provider value={classId}><section className={`ca ca-kind-${c.kind} ca-pal-${c.settings.colours ?? 'class'}`} aria-label={ACTIVITY_LABELS[c.kind]}>
    {teacher && <div className="ca-run"><span className={`ca-state ${running ? 'live' : ''}`}><i aria-hidden="true" />{s.phase === 'ready' ? 'Ready' : running ? 'Running' : s.phase === 'revealed' ? 'Comparing' : 'Ended'}</span><button type="button" className="btn small-btn" disabled={busy} onClick={() => send({ type: 'reset' })}>Reset</button>{running && <button type="button" className="btn small-btn" disabled={busy} onClick={() => send({ type: 'end' })}>End</button>}{(!running||['cue','spot','opinion','strips','dominoes','memory','bingo','ranking'].includes(c.kind))&&<button type="button" className="btn primary ca-next" disabled={busy} onClick={() => send({ type: s.phase === 'ready' ? 'start' : running ? 'reveal' : 'reset' })}>{s.phase === 'ready' ? 'Start' : running ? (['cue','spot'].includes(c.kind)?'Compare versions':c.kind==='opinion'?'Reveal positions':['strips','dominoes'].includes(c.kind)?'Show correct order':c.kind==='memory'?'Reveal cards':c.kind==='bingo'?'Reveal calls':c.kind==='ranking'?'Compare rankings':'Show results') : 'Play again'}</button>}{c.kind === 'taboo' && s.phase !== 'ready' && <button type="button" className="btn" disabled={busy} onClick={() => send({ type: 'swap' })}>Swap roles</button>}</div>}
    <div className="ca-head ca-head-row"><span className="eyebrow accent">{ACTIVITY_LABELS[c.kind]}</span><span className="ca-you">{teacher ? 'Teacher view' : <>With {s.people.filter(p => p.id !== selfId).map(p => p.name).join(', ') || 'your class'}</>}</span>{c.settings.noCorrectAnswer && <span className="ca-nca">No correct answer</span>}</div>
        {error && <p role="alert" className="ca-error">{error}</p>}
    {turn}
    {!teacher && s.phase === 'ready' ? <Wait title="Your teacher will start">Keep this activity open. It will update here.</Wait> : inner}
    {s.phase === 'ended' && <p role="status">This activity has ended.</p>}
    {Object.keys(s.scores).length > 0 && c.settings.scoring !== false && <div className="tq-board" aria-label="Scores">{Object.entries(s.scores).map(([id, score]) => <p key={id}>{s.people.find(p => p.id === id)?.name ?? c.settings.teamNames?.[id] ?? id}: <b>{score}</b></p>)}</div>}
    <span className="sr-only" aria-live="polite">{s.phase}. {active ? `${active.name}’s turn.` : ''}{s.submitted ? 'Everyone has agreed.' : ''}</span>

  </section></MediaClass.Provider>;
}

export function RoomOverview({ rooms, onShow }: { rooms: { id: string; name: string; people: Participant[]; done: boolean; progress: number; shareable?: boolean; help?: boolean }[]; onShow: (id: string) => void }) {
  return <div className="ca-rooms">{rooms.map(room => <div key={room.id} className={`ca-room ${room.done ? 'done' : ''} ${room.help ? 'help' : ''}`}><div className="ca-room-top"><b>{room.name}</b><button type="button" className="btn small-btn" onClick={() => onShow(room.id)}>{room.shareable?'Show to class':'View room'}</button></div><div className="ca-faces">{room.people.map((p, n) => <span key={p.id} className="avatar c" style={vars({ '--c': colour(n) })} title={p.name}>{initials(p.name)}</span>)}</div><span>{room.help ? 'A learner needs help' : room.done ? 'Finished' : 'Working together'}</span><div className="ca-meter" role="progressbar" aria-valuenow={room.progress} aria-valuemin={0} aria-valuemax={100}><span style={vars({ '--v': `${room.progress}%` })} /></div></div>)}</div>;
}
