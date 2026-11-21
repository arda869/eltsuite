import { useEffect, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { JSONContent } from '@tiptap/react';
import { GroupsDialog } from '../components/GroupsDialog';
import { useGroupSets } from '../lib/groups';
import { setLive } from '../lib/live';
import { app, db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { ActivityStage, RoomOverview } from './ActivityStage';
import { ACTIVITY_LABELS, configFromNode, type ActivityConfig, type ActivityItem } from './model';
import type { ActivityAction, ActivityState } from './state';

type Room = { id: string; name: string; config: ActivityConfig; state: ActivityState };
type LearnerView = { pending?: boolean; message?: string; roomId?: string; config?: ActivityConfig; state?: ActivityState };
const call = httpsCallable<Record<string, unknown>, { seq?: number }>(getFunctions(app, 'us-central1'), 'communicativeActivity');
function progress(room: Room) {
  const s = room.state;
  if (s.phase === 'ended' || s.submitted || s.correct) return 100;
  if (room.config.kind === 'board') return Math.round(100 * Math.max(0, ...Object.values(s.positions)) / Math.max(1, room.config.items.length - 1));
  if (room.config.kind === 'memory') return Math.round(100 * Object.keys(s.won).length / Math.max(1, room.config.items.length));
  if (room.config.kind === 'bingo') return Math.round(100 * s.called.length / Math.max(1, room.config.items.length));
  if (room.config.kind === 'ranking') return Math.round(100*s.agreed.length/Math.max(1,s.people.length));
  if (room.config.kind === 'opinion') return Math.round(100*Object.keys(s.opinions).length/Math.max(1,s.people.length));
  if (room.config.kind === 'spot') return Math.round(100*Object.values(s.found).reduce((n,ids)=>n+ids.length,0)/Math.max(1,s.people.length*(room.config.settings.differences?.length??1)));
  return Math.round(100 * Object.values(s.answers).reduce((n,answers)=>n+Object.keys(answers).length,0) / Math.max(1, s.people.length*room.config.items.length));
}
export function LiveActivity({ node, classId, itemId, taskId, teacher, renderItem }: { node: JSONContent; classId?: string; itemId?: string; taskId?: string; teacher?: boolean; renderItem?: (item: ActivityItem) => ReactNode }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState<{ unassigned?: { id: string; name: string }[] } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [view, setView] = useState<LearnerView | null>(null);
  const [selected, setSelected] = useState('');
  const [screenPerson, setScreenPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [subscriptionTry, setSubscriptionTry] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [roster, setRoster] = useState<{id: string; uid: string; name: string}[]>([]);
  const sets = useGroupSets(classId ?? '');
  const activityId = String(node.attrs?.id ?? ''), base = { classId, itemId, taskId, activityId };
  const runId = `${taskId}_${activityId}`, config = configFromNode(node);
  useEffect(() => {
    setRooms([]); setView(null); setMeta(null); setError('');setConnectionFailed(false);
    if (!classId || !itemId || !taskId || !activityId || !user?.uid) return;
    const run = doc(db, 'classes', classId, 'activities', runId);
    const failed = () => {setView(null);setConnectionFailed(true);setError('We couldn’t open this activity. Check your connection and try again.');};
    if (teacher) {
      const one = onSnapshot(run, s => setMeta(s.exists() ? s.data() : null), failed);
      const two = onSnapshot(collection(run, 'rooms'), s => setRooms(s.docs.map(d => ({ id: d.id, ...d.data() } as Room))), failed);
      return () => { one(); two(); };
    }
    return onSnapshot(doc(run, 'views', user.uid), s => setView(s.exists() ? s.data() : null), failed);
  }, [classId, itemId, taskId, activityId, runId, user?.uid, teacher, subscriptionTry]);
  useEffect(() => {
    if (!teacher || !classId) return;
    const one = onSnapshot(collection(db, 'classes', classId, 'learners'), snapshot => setRoster(snapshot.docs.map(d => ({id: d.id, uid: String(d.data().authUid ?? ''), name: String(d.data().displayName ?? 'Learner')}))));
    const two = onSnapshot(doc(db, 'classes', classId, 'live', 'state'), snapshot => setActiveGroup(snapshot.data()?.groupSetId ?? null));
    return () => { one(); two(); };
  }, [teacher, classId]);
  const late = roster.filter(p => p.uid && !rooms.some(r => r.state.people.some(person => person.id === p.uid))).map(p => ({id: p.uid, name: p.name}));
  const room = rooms.find(r => r.id === selected) ?? rooms[0];
  async function request(data: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await call({ ...base, ...data }); }
    catch (e) { if ((data.command as ActivityAction | undefined)?.type==='timerElapsed' && String((e as {code?:string}).code).includes('aborted')) return; setError((e as Error).message || 'We couldn’t update the activity. Your current progress is still here. Try again.'); }
    finally { setBusy(false); }
  }
  const send = (action: ActivityAction) => {
    const state = teacher ? room?.state : view?.state, roomId = teacher ? room?.id : view?.roomId;
    if (state && roomId) {
      const personal = !teacher && ['answer','opinion','summary','found','mark','claim','agree'].includes(action.type);
      void request({ op: 'command', roomId, expectedSeq: state.seq, command: action,
        ...(personal ? {expectedStartedAt: state.startedAt, expectedActorRevision: state.actorRevisions?.[user?.uid ?? ''] ?? 0, ...(action.type==='agree' ? {expectedOrder: [...state.order]} : {})} : {}) });
    }
  };
  if (!classId || !itemId || !taskId) return <div className="ca"><span className="eyebrow">{ACTIVITY_LABELS[config.kind]}</span><p>{config.instruction}</p><p className="hint">Save this activity in a class lesson to play it live. You can try it in its editor.</p></div>;
  if (teacher) return <div className="ca-live-host">
    {error && <p role="alert" className="ca-error">{error}{connectionFailed&&<button type="button" className="btn small-btn" onClick={()=>setSubscriptionTry(n=>n+1)}>Reconnect</button>}</p>}
    {(config.settings.mode === 'groups'||config.settings.teamScoring) && <button type="button" className="btn small-btn" onClick={() => setGroupsOpen(true)}>Manage pairs and groups</button>}
    {groupsOpen && <GroupsDialog classId={classId} roster={roster} sets={sets} activeId={activeGroup} onActivate={id => void setLive(classId, {groupSetId: id})} onClose={() => setGroupsOpen(false)} />}
    {!meta || !room ? <div className="ca ca-paper"><h3>{ACTIVITY_LABELS[config.kind]}</h3><p>{config.instruction}</p><p className="hint">Uses the class roster and the pairs or groups selected in Teach live.</p><button type="button" className="btn primary" disabled={busy} onClick={() => void request({ op: 'prepare' })}>{busy ? 'Starting…' : 'Start activity'}</button></div> : <>
      <RoomOverview rooms={rooms.map(r => ({ id: r.id, name: r.name, people: r.state.people, done: r.state.phase === 'ended' || r.state.submitted, progress: progress(r), shareable:['ranking','survey','strips','dominoes'].includes(r.config.kind) }))} onShow={id => { setSelected(id); if (['ranking','survey','strips','dominoes'].includes(config.kind)) void request({op:'spotlight',roomId:id}); }} />
      {rooms.length > 1 && <div className="lp-rooms" role="tablist" aria-label="Activity rooms">{rooms.map(r => <button type="button" key={r.id} role="tab" aria-selected={r.id === room.id} className={r.id === room.id ? 'on' : ''} onClick={() => setSelected(r.id)}>{r.name}</button>)}</div>}
      {late.length > 0 && <div className="ca-room"><b>{config.settings.mode === 'individual' ? 'Start for late learners' : 'Choose a group for late learners'}</b>{late.map(p => config.settings.mode === 'individual' ? <button type="button" className="btn small-btn" key={p.id} disabled={busy} onClick={() => void request({ op: 'join', learnerUid: p.id })}>Start for {p.name}</button> : <label key={p.id}>{p.name}<select aria-label={`Group for ${p.name}`} defaultValue="" disabled={busy} onChange={e => { if (e.target.value) void request({ op: 'join', learnerUid: p.id, roomId: e.target.value }); }}><option value="">Choose a group</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>)}</div>}
      {rooms.length > 1 && <div className="ca-run" aria-label="All groups"><span>All groups</span>{(['reveal', 'end', 'reset'] as const).map(type => <button type="button" className="btn small-btn" disabled={busy} key={type} onClick={() => void request({op:'allRooms',command:{type},revisions:Object.fromEntries(rooms.map(r => [r.id,r.state.seq]))})}>{type === 'reveal' ? 'Compare all' : type === 'end' ? 'End all' : 'Reset all'}</button>)}</div>}
      {config.kind === 'opinion' && <button type="button" className="btn" disabled={busy} onClick={() => void request({op:'pairOpinions'})}>Pair opposite views</button>}
      {config.kind === 'ranking' && rooms.length > 1 && <div className="ca-ranking-comparison">{rooms.map(r => <section key={r.id}><h4>{r.name}</h4><ol>{r.state.order.map(id => <li key={id}>{r.config.items.find(i => i.id === id)?.title}</li>)}</ol><p>{r.state.agreed.length} of {r.state.people.length} agreed</p></section>)}</div>}
      <div className="ca-share-screen"><label className="ca-setting">Learner’s screen<select value={room.state.people.some(p=>p.id===screenPerson)?screenPerson:room.state.people[0]?.id??''} onChange={e=>setScreenPerson(e.target.value)}>{room.state.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="btn small-btn" disabled={busy} onClick={()=>void request({op:'spotlight',roomId:room.id,learnerUid:screenPerson||room.state.people[0]?.id,confirmPrivate:true})}>{['cue','spot','taboo'].includes(config.kind)&&room.state.phase!=='revealed'?'Share private screen with class':'Share screen with class'}</button>{['cue','spot','taboo'].includes(config.kind)&&room.state.phase!=='revealed'&&<p className="hint">This makes the selected learner’s private card or picture visible to everyone in the class.</p>}</div>
      <ActivityStage classId={classId} config={room.config} state={room.state} selfId={user?.uid ?? ''} teacher send={send} busy={busy} renderItem={renderItem} />
      <button type="button" className="btn small-btn" disabled={busy} onClick={() => void request({ op: 'prepare', replace: true })}>Restart with the current groups</button>
    </>}
  </div>;
  if (!view?.state || !view.config) return <div className="ca ca-wait"><b>{view?.pending ? 'Your group is not ready yet' : 'Your teacher will start this activity'}</b><span>{view?.message || 'Keep this page open. Your activity will appear here.'}</span>{error && <p role="alert">{error}{connectionFailed&&<button type="button" className="btn" onClick={()=>setSubscriptionTry(n=>n+1)}>Reconnect</button>}</p>}</div>;
  return <ActivityStage classId={classId} config={view.config} state={view.state} selfId={user?.uid ?? ''} send={send} busy={busy} error={error} renderItem={renderItem} />;
}
