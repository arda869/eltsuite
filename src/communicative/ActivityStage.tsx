import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useImageSrc } from '../editor/PackNode';
import { ACTIVITY_LABELS, boardLayout, dominoTiles, plainText, type ActivityConfig, type ActivityItem, type Participant } from './model';
import { currentPerson, surveyCounts, type ActivityAction, type ActivityState } from './state';

export type ActivityStageProps = {
  config: ActivityConfig; state: ActivityState; selfId: string; teacher?: boolean;
  send: (action: ActivityAction) => void; busy?: boolean; error?: string;
  renderItem?: (item: ActivityItem) => ReactNode; classId?: string;
};
const MediaClass = createContext('');
const vars = (v: Record<string, string | number>) => v as CSSProperties;
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const colour = (n: number) => `var(--team-${n % 6 + 1})`;

function Picture({ item }: { item: ActivityItem }) {
  const src = useImageSrc(useContext(MediaClass), item.picture?.src ?? '');
  return src ? <img className="ca-pic" src={src} alt={item.picture?.alt} style={{ objectFit: item.picture?.fit ?? 'cover', objectPosition: item.picture?.position ?? '50% 50%' }} /> : null;
}
function SpotPicture({ src, alt }: { src: string; alt: string }) { const url = useImageSrc(useContext(MediaClass), src); return url ? <img className="pic" src={url} alt={alt} /> : <p role="status">Loading your picture…</p>; }
function Useful({ text }: { text?: string }) {
  return text?.trim() ? <div className="ca-useful"><span>Useful language</span><ul>{text.split('\n').filter(Boolean).map((line, n) => <li key={n}>{line}</li>)}</ul></div> : null;
}
function Private({ children, label }: { children: ReactNode; label: string }) {
  return <div className="ca-private"><div className="ca-private-band"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></svg>{label}</div>{children}</div>;
}
function Wait({ title, children }: { title: string; children: ReactNode }) { return <div className="ca-wait"><b>{title}</b><span>{children}</span></div>; }

export function ActivityStage({ config: c, state: s, selfId, teacher = false, send, busy = false, error, renderItem, classId = '' }: ActivityStageProps) {
  const [now, setNow] = useState(Date.now());
  const [reason, setReason] = useState(s.opinions[selfId]?.reason ?? '');
  const [position, setPosition] = useState(s.opinions[selfId]?.value ?? 50);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [pictureTab, setPictureTab] = useState(0);
  const [inspected, setInspected] = useState('');
  const [positions, setPositions] = useState(s.positions);
  const displayedPositions = useRef(s.positions);
  const [rolling, setRolling] = useState(false);
  const sendNow=useRef(send);sendNow.current=send;
  const sounded = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
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
    setRolling(true);const timer=window.setTimeout(()=>setRolling(false),600);return ()=>window.clearTimeout(timer);
  },[c.kind,s.die]);
  const active = currentPerson(s), myTurn = teacher || active?.id === selfId;
  const running = s.phase === 'running', canAct = running && !busy;
  const remaining = s.endsAt === null ? null : Math.max(0, Math.ceil((s.endsAt - now) / 1000));
  useEffect(() => {
    if (c.kind !== 'speaking' || s.phase !== 'running' || remaining !== 0 || !s.endsAt || sounded.current === s.endsAt) return;
    sounded.current = s.endsAt;
    const context = audio.current;
    if (!context || context.state !== 'running') return;
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = 'sine'; tone.frequency.value = 523.25;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.65);
    tone.connect(gain); gain.connect(context.destination); tone.start(); tone.stop(context.currentTime + 0.7);
  }, [c.kind, s.phase, s.endsAt, remaining]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const enableSound = async () => { audio.current ??= new AudioContext(); await audio.current.resume(); };
  const respondent = teacher ? (s.people.find(p => p.id === inspected) ?? s.people[0])?.id ?? '' : selfId;
  useEffect(()=>{
    if(c.kind!=='speaking'||c.settings.mode!=='groups'||s.people.length!==2||s.phase!=='running'||remaining!==0||busy)return;
    const timer=window.setTimeout(()=>sendNow.current({type:'timerElapsed'}),700);return ()=>window.clearTimeout(timer);
  },[c.kind,c.settings.mode,s.people.length,s.phase,s.endsAt,remaining,busy]);
  const itemById = (id: string) => c.items.find(i => i.id === id);
  const body = (item: ActivityItem) => <><Picture item={item} />{item.title && (!renderItem || item.title !== plainText(item.content)) && <span>{item.title}</span>}{renderItem ? renderItem(item) : plainText(item.content) && plainText(item.content)!==item.title ? <span>{plainText(item.content)}</span> : null}</>;
  const move = (from: number, to: number) => {
    if (!canAct || from < 0 || to < 0 || to >= s.order.length || from === to) return;
    const ids = [...s.order]; const [id] = ids.splice(from, 1); ids.splice(to, 0, id); send({ type: 'order', ids });
  };
  const orderControls = (index: number, label: string) => <span className="ca-move-tools"><button type="button" aria-label={`Move ${label} up`} disabled={!canAct || index === 0} onClick={() => move(index, index - 1)}>↑</button><button type="button" aria-label={`Move ${label} down`} disabled={!canAct || index === s.order.length - 1} onClick={() => move(index, index + 1)}>↓</button></span>;
  const ranked = () => <div className={c.settings.layout === 'diamond' ? 'ca-diamond ca-diamond-live' : 'ca-rank'}>{s.order.map((id, n) => {
    const item = itemById(id); if (!item) return null;
    return <div key={id} className="ca-rank-item" draggable={canAct} onDragStart={e => e.dataTransfer.setData('text/plain', id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); move(s.order.indexOf(e.dataTransfer.getData('text/plain')), n); }}><span className="ca-rank-n">{n + 1}</span><span>{body(item)}</span>{orderControls(n, item.title || `item ${n + 1}`)}</div>;
  })}</div>;
  const turn = ['board', 'memory', 'taboo', 'speaking'].includes(c.kind) && active ? <div className={`ca-turn ${active.id === selfId ? 'mine' : 'theirs'}`} style={vars({ '--c': colour(s.turn) })}><span className="avatar c" aria-hidden="true">{initials(active.name)}</span><span className="ca-turn-who">{active.id === selfId ? 'Your turn' : `${active.name}’s turn`}</span>{remaining !== null && <span className="timer-chip" role="timer" aria-label={`${remaining} seconds remaining`}>{remaining}s</span>}</div> : null;

  let inner: ReactNode;
  switch (c.kind) {
    case 'board': {
      const { cols, cells } = boardLayout(c.items.length, c.settings.boardStyle);
      const layout = (n: number) => ({ gridRow: cells[n].row, gridColumn: cells[n].col });
      const square = c.items[s.positions[active?.id ?? ''] ?? 0];
      inner = <><div className={`ca-die ${rolling ? 'rolling' : ''}`} data-face={s.die ?? 1} role="img" aria-label={s.die === null ? 'Ready to roll the die' : `Die: ${s.die}`}>{Array.from({length:9},(_,n)=><i key={n}/>)}</div><div className={`ca-board ca-board-${c.settings.boardStyle ?? 'snake'}`} style={vars({ '--cols': cols })}>{c.items.map((item, n) => <div key={item.id} className={`ca-sq ${item.special ?? ''} ${Object.values(positions).includes(n) ? 'here' : ''}`} style={layout(n)}><span className="ca-sq-n">{n + 1}</span><Picture item={item} /><span>{item.special === 'start' ? 'Start' : item.special === 'finish' ? 'Finish' : item.title}</span><span className="ca-pins">{s.people.filter(p => positions[p.id] === n).map(p => <span key={p.id} className="ca-pinname" title={p.name}><span className="ca-pin" style={vars({ '--c': colour(s.people.indexOf(p)) })}><span>{initials(p.name)}</span></span><span className="ca-token-name">{p.name.split(/\s+/)[0]}</span><span className="sr-only">{p.name}</span></span>)}</span></div>)}</div>{s.die !== null && square && <div className="ca-prompt ca-paper"><span className="eyebrow">Square {(s.positions[active?.id ?? ''] ?? 0) + 1}</span><div className="ca-prompt-text">{body(square)}</div></div>}{myTurn && running ? <button type="button" className="btn primary ca-go" disabled={busy || rolling} onClick={() => s.die === null ? send({ type: 'roll', die: 0 }) : send({ type: 'nextTurn' })}>{s.die === null ? 'Roll the die' : 'Finish turn'}{s.die !== null && ` · ${s.die}`}</button> : running && <Wait title={`${active?.name ?? 'Your partner'} is playing`}>Watch their token, then listen to their answer.</Wait>}</>;
      break;
    }
    case 'bingo': {
      const size = c.settings.gridSize ?? 4;
      const card = s.cards[selfId];
      inner = <>{teacher && <><div className="ca-call"><span className="eyebrow">Current call</span><div className="ca-call-now">{c.items.find(i => i.id === s.currentCall)?.call || c.items.find(i => i.id === s.currentCall)?.title || 'Start the first call'}</div><button type="button" className="btn primary" disabled={!canAct || s.called.length === c.items.length} onClick={() => { const available = c.items.filter(i => !s.called.includes(i.id)); if (available.length) send({ type: 'call', itemId: '' }); }}>Draw a call</button></div><div className="ca-calls">{c.items.map(item => <button type="button" key={item.id} className={s.called.includes(item.id) ? 'on' : ''} disabled={!canAct || s.called.includes(item.id)} onClick={() => send({ type: 'call', itemId: item.id })}>{item.call || item.title}</button>)}</div><details className="ca-bingo-review" open={Object.keys(s.claims).length>0}><summary>Check a learner’s card</summary><label className="ca-setting">Learner<select value={respondent} onChange={e=>setInspected(e.target.value)}>{s.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="ca-bingo" style={vars({'--size':size})}>{(s.cards[respondent]??[]).map((id,n)=>{const marked=id==='__free__'||s.marked[respondent]?.includes(id),called=id==='__free__'||s.called.includes(id);return <div key={n} className={`ca-cell ${marked?'on':''} ${marked&&!called?'uncalled':''}`}>{id==='__free__'?'Free':itemById(id)?body(itemById(id)!):''}<small>{marked?(called?'Marked · called':'Marked · not called'):called?'Called':'Not called'}</small></div>;})}</div></details><div className="ca-claims">{Object.entries(s.claims).map(([id, claim]) => <p key={id}><b>{s.people.find(p => p.id === id)?.name}</b>: {claim.valid ? 'Bingo checked' : 'Not yet — check the marked squares'}</p>)}</div></>}{!teacher && card && <><div className="ca-bingo" style={vars({ '--size': size })}>{card.map((id, n) => <button key={n} type="button" className={`ca-cell ${(s.marked[selfId] ?? []).includes(id) || id === '__free__' ? 'on' : ''}`} disabled={!canAct || id === '__free__'} aria-pressed={(s.marked[selfId] ?? []).includes(id) || id === '__free__'} onClick={() => send({ type: 'mark', itemId: id })}>{id === '__free__' ? 'Free' : itemById(id) ? body(itemById(id)!) : ''}</button>)}</div>{(c.settings.showCalls || s.phase==='revealed') && s.currentCall && <p className="ca-say">{itemById(s.currentCall)?.call || itemById(s.currentCall)?.title}</p>}<button type="button" className="btn primary ca-go" disabled={!canAct} onClick={() => send({ type: 'claim' })}>Bingo</button>{s.claims[selfId] && <p role="status">{s.claims[selfId].valid ? 'Your card has a winning pattern. Your teacher can check it now.' : 'Not yet. Listen to the calls and check your marked squares.'}</p>}</>}{!teacher && s.phase==='revealed'&&<div className="ca-calls" aria-label="Called items">{c.items.filter(item=>s.called.includes(item.id)).map(item=><span key={item.id}>{item.call||item.title}</span>)}</div>}{!teacher && !card && <Wait title="Your card is not ready">Your teacher will add you to this game.</Wait>}</>;
      break;
    }
    case 'dominoes': case 'strips':
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
      inner = c.items.length ? <>{teacher && <div className="ca-assignments"><label className="ca-setting">{c.settings.mode==='groups'?'Card for this group':'Give everyone the same card'}<select value="" disabled={busy} onChange={e=>{if(e.target.value)send({type:'assign',assignments:Object.fromEntries(s.people.map(p=>[p.id,[e.target.value]]))});}}><option value="">Choose a card</option>{c.items.map((item,n)=><option key={item.id} value={item.id}>{item.title||`Card ${n+1}`}</option>)}</select></label>{s.people.map(p => <label className="ca-setting" key={p.id}>Card for {p.name}<select value={s.assignments[p.id]?.[0] ?? ''} disabled={busy} onChange={e => send({type:'assign',assignments:{...s.assignments,[p.id]:[e.target.value]}})}><option value="">Choose a card</option>{c.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>)}</div>}<div className="ca-cues">{c.items.map(item => <Private key={item.id} label={teacher ? `${s.people.filter(p => s.assignments[p.id]?.includes(item.id)).map(p => p.name).join(', ') || 'Not assigned'} · ${item.cardType ?? 'character'}` : 'Only you can see this'}><div className="ca-cue"><span className="eyebrow accent">{item.cardType === 'secret' ? 'Secret objective' : item.cardType ?? 'Character'}</span><div className="ca-cue-title">{item.title}</div><div className="ca-cue-text"><Picture item={item}/>{renderItem ? renderItem(item) : <p>{plainText(item.content)}</p>}</div><Useful text={item.useful || c.settings.useful} /></div></Private>)}</div></> : <Wait title="Your card is on its way">Your teacher will give you a role.</Wait>;
      break;
    case 'ranking':
      inner = <>{ranked()}<Useful text={c.settings.useful} /><div className="ca-agree">{s.people.map(p => <span key={p.id} className={`avatar ${s.agreed.includes(p.id) ? 'yes' : 'wait'}`} title={`${p.name}: ${s.agreed.includes(p.id) ? 'agrees' : 'not agreed yet'}`}>{initials(p.name)}</span>)}</div>{!teacher && <button type="button" className="btn primary ca-go" disabled={!canAct || s.agreed.includes(selfId)} onClick={() => send({ type: 'agree' })}>{s.agreed.includes(selfId) ? 'Waiting for your group' : 'We agree'}</button>}{s.submitted && <p role="status">Everyone has agreed. Your ranking is ready to compare.</p>}</>;
      break;
    case 'opinion':
      inner = <><div className="ca-statement">{c.items[0] ? body(c.items[0]) : null}</div><div className="ca-line-wrap"><div className="ca-line">{Object.entries(s.opinions).map(([id, value], n) => <span key={id} className={`ca-mark ${id === selfId ? 'me' : ''}`} style={vars({ '--x': `${value.value}%` })}><span className="ca-pin" style={vars({ '--c': colour(n) })} title={c.settings.showNames === false ? 'A learner' : s.people.find(p => p.id === id)?.name}>{c.settings.showNames === false ? '•' : initials(s.people.find(p => p.id === id)?.name ?? '')}</span><span className="sr-only">{c.settings.showNames === false ? 'A learner' : s.people.find(p => p.id === id)?.name}: {value.value}%. {value.reason}</span></span>)}</div><div className="ca-ends"><span>{c.settings.lowLabel || 'Strongly disagree'}</span><span>{c.settings.highLabel || 'Strongly agree'}</span></div></div>{!teacher && <><label className="ca-slider-label">Choose your position<input type="range" min="0" max="100" step="1" value={position} disabled={!canAct} onChange={e => setPosition(Number(e.target.value))} /></label>{c.settings.askReason && <input className="ca-reason" aria-label="Your reason (optional)" placeholder="Give a reason (optional)" value={reason} disabled={!canAct} onChange={e => setReason(e.target.value)} />}<button type="button" className="btn primary ca-go" disabled={!canAct} onClick={() => send({ type: 'opinion', value: position, reason })}>Save my position</button></>}</>;
      break;
    case 'survey':
      inner = <div>{c.items.map(item => { const counts = surveyCounts(s, item.id); return <section key={item.id}><h4 className="ca-say">{body(item)}</h4>{!teacher && <div className="ca-opts">{item.options?.map(option => <button key={option} type="button" className={`ca-opt ${s.answers[selfId]?.[item.id] === option ? 'on' : ''}`} aria-pressed={s.answers[selfId]?.[item.id] === option} disabled={!canAct} onClick={() => send({ type: 'answer', itemId: item.id, value: option })}><i aria-hidden="true" />{option}</button>)}</div>}<div className="ca-bars">{item.options?.map(option => <div className="ca-bar" key={option}><span>{option}</span><span className="tq-bar"><span style={vars({ '--v': `${100 * (counts[option] ?? 0) / Math.max(1, s.people.length)}%` })} /></span><b>{counts[option] ?? 0}</b></div>)}</div></section>; })}<p className="hint">Write two sentences about the most common answers.</p>{!teacher ? <label className="ca-setting">Your summary<textarea key={selfId} rows={3} defaultValue={s.summaries?.[selfId] ?? ''} disabled={!canAct} onBlur={e => send({type:'summary',text:e.target.value})} /></label> : <section aria-label="Learner summaries">{s.people.map(p => <p key={p.id}><b>{p.name}:</b> {s.summaries?.[p.id] || 'No summary yet'}</p>)}</section>}</div>;
      break;
    case 'findSomeone':
      inner = <>{teacher && <label className="ca-setting">View a learner’s grid<select value={respondent} onChange={e => setInspected(e.target.value)}>{s.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<div className={`ca-fsw ${c.settings.layout==='grid'?'ca-fsw-grid':''}`}>{c.items.map(item => <div key={item.id} className={`ca-fsw-row ${s.answers[respondent]?.[item.id] ? 'done' : ''}`}><span className="ca-fsw-q">{body(item)}{item.question && <small>{item.question}</small>}</span><button className="ca-fsw-name" type="button" disabled={!canAct || teacher} onClick={() => setChosenName(item.id)}>{s.people.find(p => p.id === s.answers[respondent]?.[item.id])?.name || 'Add a name'}</button>{c.settings.showFollowUp && <label className="ca-fsw-detail">{item.followUp || 'One extra detail'}<input aria-label={`Extra detail for ${item.title}`} key={respondent} maxLength={500} defaultValue={s.details[respondent]?.[item.id] ?? ''} disabled={teacher || !canAct || !s.answers[respondent]?.[item.id]} onBlur={e => send({ type: 'answer', itemId: item.id, value: s.answers[respondent][item.id], detail: e.target.value })} /></label>}</div>)}</div>{chosenName && <div className="ca-sheet" role="dialog" aria-label="Choose a classmate"><button type="button" className="btn" onClick={() => setChosenName(null)}>Close names</button><div className="ca-namegrid">{s.people.filter(p => p.id !== selfId).map(p => { const used = c.settings.nameOnce && Object.entries(s.answers[respondent] ?? {}).some(([id, value]) => id !== chosenName && value === p.id); return <button key={p.id} type="button" className={used ? 'used' : ''} disabled={!!used || busy} onClick={() => { send({ type: 'answer', itemId: chosenName, value: p.id }); setChosenName(null); }}>{p.name}{used && <span className="sr-only"> already used</span>}</button>; })}</div></div>}{teacher && <section className="ca-class-summary"><h4>Class summary</h4>{c.items.map(item => { const ids = [...new Set(Object.values(s.answers).map(answers => answers[item.id]).filter(Boolean))]; return <p key={item.id}><b>{item.title}</b>: {ids.length} {ids.length===1?'learner':'learners'}{ids.length ? ' · ' : ''}{ids.length ? ids.map(id => s.people.find(p => p.id === id)?.name ?? 'Classmate').join(', ') : 'No names yet'}</p>; })}</section>}</>;
      break;
    case 'spot': {
      const versions = c.settings.versions ?? [], version = versions[pictureTab] ?? versions[0];
      const comparing = s.phase === 'revealed';
      const showPicture = (v: NonNullable<typeof version>, n: number) => <Private key={n} label={teacher || comparing ? v.name : 'Only you can see this'}><div className="ca-spot" onClick={e => { if (!canAct || teacher) return; const r = e.currentTarget.getBoundingClientRect(); send({ type: 'found', x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }); }}><SpotPicture src={v.picture.src} alt={v.picture.alt} />{comparing ? c.settings.differences?.map(d => <span key={d.id} className="ca-ring answer" style={vars({ '--x': `${d.x}%`, '--y': `${d.y}%` })}><span className="sr-only">{d.label}</span></span>) : Object.entries(s.foundPoints?.[selfId] ?? {}).map(([id, point]) => <span key={id} className="ca-ring" style={vars({'--x': `${point.x}%`, '--y': `${point.y}%`})}><span className="sr-only">Your marked difference</span></span>)}</div></Private>;
      inner = <>{!comparing && versions.length > 1 && <div className="seg" aria-label="Picture version">{versions.map((v, n) => <button type="button" key={n} className={pictureTab === n ? 'on' : ''} onClick={() => setPictureTab(n)}>{v.name}</button>)}</div>}{comparing ? <div className="ca-picture-comparison">{versions.map(showPicture)}</div> : version ? showPicture(version, pictureTab) : <Wait title="Your picture is on its way">Your teacher will give you a version.</Wait>}<p className="ca-found" role="status">{s.found[selfId]?.length ?? 0} differences found</p>{version && running && !teacher && <div className="ca-coordinate"><label>Across (%)<input type="number" min="0" max="100" defaultValue="50" id={`${c.id}-x`} /></label><label>Down (%)<input type="number" min="0" max="100" defaultValue="50" id={`${c.id}-y`} /></label><button type="button" className="btn" disabled={!canAct} onClick={() => { const x = Number((document.getElementById(`${c.id}-x`) as HTMLInputElement).value); const y = Number((document.getElementById(`${c.id}-y`) as HTMLInputElement).value); send({ type: 'found', x, y }); }}>Mark this point</button></div>}</>;
      break;
    }
    case 'taboo': {
      const item = teacher ? c.items[s.cardIndex] : c.items[0];
      inner = myTurn && item ? <Private label={teacher ? `${active?.name ?? 'Describer'}’s card` : 'Only you can see this'}><div className="ca-taboo"><div className="ca-taboo-word"><small>Describe this word</small>{item.title}</div><Picture item={item} /><ul>{item.taboo?.map(word => <li key={word}>{word}</li>)}</ul><div className="ca-taboo-actions"><button type="button" className="btn primary" disabled={!canAct || remaining === 0} onClick={() => send({ type: 'gotIt' })}>Got it</button><button type="button" className="btn" disabled={!canAct || remaining === 0} onClick={() => send({ type: 'skip' })}>Skip</button></div></div></Private> : <Wait title={`Listen to ${active?.name ?? 'the describer'}`}>Guess the word. The describer keeps the card hidden.</Wait>;
      break;
    }
    case 'speaking': {
      const item = itemById(s.order[s.round % Math.max(1,s.order.length)]);
      inner = <div className="ca-speak"><button type="button" className="btn small-btn" onClick={() => void enableSound()}>Enable end sound</button><div className={`ca-ring-timer ${remaining !== null && remaining <= 10 ? 'soon' : ''}`} style={vars({ '--p': remaining === null ? 100 : 100 * remaining / (c.settings.seconds ?? 60) })}><svg viewBox="0 0 36 36" aria-hidden="true"><circle className="t" cx="18" cy="18" r="15.9155" /><circle className="f" cx="18" cy="18" r="15.9155" /></svg><b>{remaining ?? c.settings.seconds ?? 60}</b></div><div><div className="ca-speak-prompt">{item ? body(item) : null}</div><div className="ca-roles"><span className="now">Speaker: {active?.name}</span><span>Listen: {s.people.filter(p => p.id !== active?.id).map(p => p.name).join(', ')}</span></div><Useful text={c.settings.useful} /><p>{c.settings.listenerTask || 'Ask one follow-up question.'}</p>{remaining === 0 && <p role="status">The speaking turn has finished.</p>}</div></div>;
      break;
    }
  }
  return <MediaClass.Provider value={classId}><section className={`ca ca-kind-${c.kind}`} aria-label={ACTIVITY_LABELS[c.kind]}>
    {teacher && <div className="ca-run"><span className={`ca-state ${running ? 'live' : ''}`}><i aria-hidden="true" />{s.phase === 'ready' ? 'Ready' : running ? 'Running' : s.phase === 'revealed' ? 'Comparing' : 'Ended'}</span><button type="button" className="btn small-btn" disabled={busy} onClick={() => send({ type: 'reset' })}>Reset</button>{running && <button type="button" className="btn small-btn" disabled={busy} onClick={() => send({ type: 'end' })}>End</button>}{(!running||['cue','spot','opinion','strips','dominoes','memory','bingo','ranking'].includes(c.kind))&&<button type="button" className="btn primary ca-next" disabled={busy} onClick={() => send({ type: s.phase === 'ready' ? 'start' : running ? 'reveal' : 'reset' })}>{s.phase === 'ready' ? 'Start' : running ? (['cue','spot'].includes(c.kind)?'Compare versions':c.kind==='opinion'?'Reveal positions':['strips','dominoes'].includes(c.kind)?'Show correct order':c.kind==='memory'?'Reveal cards':c.kind==='bingo'?'Reveal calls':c.kind==='ranking'?'Compare rankings':'Show results') : 'Play again'}</button>}{['speaking', 'taboo'].includes(c.kind) && s.phase !== 'ready' && <button type="button" className="btn" disabled={busy} onClick={() => send({ type: 'swap' })}>Swap roles</button>}</div>}
    <div className="ca-you">{teacher ? 'Teacher view' : <>With {s.people.filter(p => p.id !== selfId).map(p => p.name).join(', ') || 'your class'}</>}{c.settings.noCorrectAnswer && <span className="ca-nca">No correct answer</span>}</div>
    <div className="ca-head"><span className="eyebrow accent">{ACTIVITY_LABELS[c.kind]}</span><div className="ca-say">{c.instruction}</div></div>
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
