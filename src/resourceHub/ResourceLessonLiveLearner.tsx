import { IdentityMark } from '../components/Identity';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TaskRenderer } from '../components/TaskRenderer';
import { InstrView } from '../editor/InstrEditor';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey, type Responses } from '../lib/questions';
import { Wordmark } from '../components/Wordmark';
import { Avatar } from '../components/avatars';
import { PanelToggle, usePanels } from '../components/PanelToggles';
import { IconBtn } from '../components/UiIcon';
import { Icon } from '../editor/Icons';
import { REACTIONS } from '../components/LiveExtras';
import { lessonLiveApi, loadLessonSeat, saveLessonSeat, type LessonLearnerState, type LessonSeat } from './lessonLiveApi';
import './resourceLessonLive.css';

export function ResourceLessonLiveLearner() {
  const { code: routeCode = '' } = useParams();
  const [code, setCode] = useState(routeCode.replace(/\D/g, '').slice(0, 6));
  const [name, setName] = useState('');
  const [seat, setSeat] = useState<LessonSeat | null>(() => { const saved = loadLessonSeat(); return routeCode && saved?.code !== routeCode ? null : saved; });
  const [state, setState] = useState<LessonLearnerState | null>(null);
  const [responses, setResponses] = useState<Responses>({});
  const [submittedTask, setSubmittedTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taskListOpen, setTaskListOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const panels = usePanels('rll.learnerPanels');
  const refresh = useCallback(async () => {
    if (!seat) return;
    try { const result = await lessonLiveApi<LessonLearnerState>('learnerState', { runId: seat.runId, pid: seat.pid, token: seat.token }); setState(result); setError(''); }
    catch (cause) { setError((cause as Error).message); }
  }, [seat]);
  useEffect(() => { if (!seat) return; void refresh(); const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer); }, [seat, refresh]);
  const task = state?.currentTask;
  useEffect(() => { setResponses(state?.responses || {}); setSubmittedTask(state?.responses && Object.keys(state.responses).length ? task?.id || '' : ''); }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const join = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code shown by your teacher.'); return; }
    if (!name.trim()) { setError('Add your name to join.'); return; }
    setBusy(true); setError('');
    try {
      const result = await lessonLiveApi<LessonSeat>('join', { code, name: name.trim() });
      const next = { runId: result.runId, pid: result.pid, token: result.token, name: result.name, code };
      saveLessonSeat(next); setSeat(next);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!seat || !task || busy) return;
    setBusy(true); setError('');
    try { await lessonLiveApi('submit', { runId: seat.runId, pid: seat.pid, token: seat.token, taskId: task.id, responses }); setSubmittedTask(task.id); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const leave = () => { saveLessonSeat(null); setSeat(null); setState(null); setSubmittedTask(''); setResponses({}); };
  const signal = async (kind: 'hand' | 'stuck' | 'reaction', value: boolean | string) => {
    if (!seat) return;
    try {
      const result = await lessonLiveApi<{ signal: LessonLearnerState['signal'] }>('signal', { runId: seat.runId, pid: seat.pid, token: seat.token, kind, value });
      setState(previous => previous ? { ...previous, signal: result.signal } : previous);
      setError('');
    } catch (cause) { setError((cause as Error).message); }
  };
  if (!seat) return <div className="rll-learner-shell"><main className="rll-learner-wrap"><div className="rll-learner-brand"><span className="rll-brand-mark">E</span><span>ELT Suite <b>Live lesson</b></span></div><section className="rll-join-card"><span className="rll-kicker">JOIN YOUR TEACHER</span><h1>Ready to learn together?</h1><p>Enter the code on your teacher’s screen and the name you want them to see.</p><form onSubmit={event => { event.preventDefault(); void join(); }}><label htmlFor="rll-code">Lesson code</label><input id="rll-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" maxLength={6} /><label htmlFor="rll-name">Your name</label><input id="rll-name" autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} placeholder="Your first name or nickname" maxLength={30} />{error && <p role="alert" className="rll-error">{error}</p>}<button type="submit" className="rll-primary" disabled={busy}>{busy ? 'Joining…' : 'Join lesson →'}</button></form></section></main></div>;
  const finished = state?.run.status === 'ended' || state?.run.expired;
  return <div className="shell wide lesson-shell rll-session" data-lesson-style="adult">
    <header className="topbar"><span className="rll-session-wordmark"><Wordmark /></span><nav className="crumbs" aria-label="Breadcrumb"><span>Live lesson</span><span aria-hidden="true">/</span><span className="here">{state?.run.title || 'Your lesson'}</span></nav><span className="right-push rll-session-user">{seat.name}<button type="button" className="btn small-btn" onClick={leave}>Leave lesson</button></span></header>
    {!finished && <div className="live-float rll-live-float"><div className="signal-bar" role="group" aria-label="Tell your teacher">
      <IconBtn icon="hand" label={state?.signal?.hand ? 'Lower your hand' : 'Raise your hand'} active={!!state?.signal?.hand} onClick={() => void signal('hand', !state?.signal?.hand)} />
      <IconBtn icon="stuck" label={state?.signal?.stuck ? 'I am OK now' : 'I’m stuck: tell your teacher'} active={!!state?.signal?.stuck} onClick={() => void signal('stuck', !state?.signal?.stuck)} />
      <span className="sig-react"><IconBtn icon="react" label="Send a reaction" active={reactionsOpen} aria-expanded={reactionsOpen} onClick={() => setReactionsOpen(open => !open)} />
        {reactionsOpen && <span className="sig-pop">{REACTIONS.map(reaction => <button key={reaction.key} type="button" aria-label={reaction.label} title={reaction.label} onClick={() => { void signal('reaction', reaction.key); setReactionsOpen(false); }}><Icon name={reaction.icon} size="22" tone="accent" /></button>)}</span>}
      </span>
    </div></div>}
    <div className={'lesson-layout learner rll-session-layout' + panels.cls}>
      <button type="button" className="mobile-task-toggle" aria-expanded={taskListOpen} aria-controls="rll-task-list" onClick={() => setTaskListOpen(open => !open)}><span><strong>Tasks</strong><span>{task?.title || 'Waiting for your teacher'}</span></span><span aria-hidden="true">{taskListOpen ? '⌃' : '⌄'}</span></button>
      <nav id="rll-task-list" className={'task-list' + (taskListOpen ? ' mobile-open' : '')} aria-label="Tasks"><span className="eyebrow rll-session-list-title">{state?.run.title || 'Your lesson'}</span>{state?.tasks.map(item => <div key={item.id} className={'task-row' + (item.id === task?.id ? ' on' : '')}><button type="button" className="task-pick" disabled={item.id !== task?.id || finished} title={item.id !== task?.id ? 'Your teacher will open this task' : undefined}><span>{item.title}</span>{item.id === task?.id && <span className="teacher-here"><span className="live-dot" aria-hidden="true" />Live now</span>}</button></div>)}</nav>
      <div className="center-col"><div className="live-who rll-session-presence" role="status"><span className="live-who-top"><span className="live-dot" aria-hidden="true" /><b>Live</b><span className="hint">Your teacher is teaching</span></span><span className="live-who-people"><span className="live-who-faces"><Avatar name={seat.name} size={26} /></span><span className="hint">You’re in the lesson as {seat.name}</span></span></div>{error && <p role="alert" className="rll-error">{error}</p>}
        <div className="panel-toggles"><PanelToggle side="left" open={panels.left} onClick={panels.toggleLeft} label="the task list" /></div>
        <main className="task-frame" data-activity-number={task ? (state?.tasks.findIndex(item => item.id === task.id) ?? -1) + 1 : undefined}>
          {!state ? <div className="frame-inner" role="status"><h1 className="task-title">Loading your lesson…</h1></div> : finished ? <div className="frame-inner rll-session-message"><h1 className="task-title">Lesson complete</h1><p>Thanks for taking part, {seat.name}.</p></div> : !task ? <div className="frame-inner rll-session-message" role="status"><h1 className="task-title">You’re in!</h1><p>Waiting for your teacher to start the next task.</p></div> : <div className="frame-inner"><div className="frame-head">{task.identity && <div className="aid-row"><IdentityMark identity={task.identity} /></div>}<h1 className="task-title">{task.title}</h1><InstrView doc={task.instrDoc} text={task.instructions} /></div><div className="frame-body"><LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey(task.content, true).content} responses={responses} onChange={(id, value) => { setResponses(old => ({ ...old, [id]: value })); setSubmittedTask(''); }} disabled={busy} hideAnswers /></LocalActivityMode.Provider></div><div className="frame-foot"><span className="hint foot-status">{submittedTask === task.id ? 'Answer sent. You can edit and send it again.' : 'Your teacher will see your answer when you send it.'}</span><span className="foot-acts"><button type="button" className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : submittedTask === task.id ? 'Send updated answer' : 'Send answer'}</button></span></div></div>}
        </main>
      </div>
    </div>
  </div>;
}
