import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TaskRenderer } from '../components/TaskRenderer';
import { InstrView } from '../editor/InstrEditor';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey, type Responses } from '../lib/questions';
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
  return <div className="rll-learner-shell"><main className="rll-learner-wrap"><div className="rll-learner-brand"><span className="rll-brand-mark">E</span><span>ELT Suite <b>Live lesson</b></span></div>
    {!seat ? <section className="rll-join-card"><span className="rll-kicker">JOIN YOUR TEACHER</span><h1>Ready to learn together?</h1><p>Enter the code on your teacher’s screen and the name you want them to see.</p><form onSubmit={event => { event.preventDefault(); void join(); }}><label htmlFor="rll-code">Lesson code</label><input id="rll-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" maxLength={6} /><label htmlFor="rll-name">Your name</label><input id="rll-name" autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} placeholder="Your first name or nickname" maxLength={30} />{error && <p role="alert" className="rll-error">{error}</p>}<button type="submit" className="rll-primary" disabled={busy}>{busy ? 'Joining…' : 'Join lesson →'}</button></form></section> : <><div className="rll-learner-top"><div><span className="rll-kicker">WELCOME, {seat.name.toUpperCase()}</span><h1>{state?.run.title || 'Your live lesson'}</h1></div><button type="button" className="rll-text-button" onClick={leave}>Leave</button></div>{error && <p role="alert" className="rll-error">{error}</p>}{!state ? <section className="rll-join-card" role="status">Loading your lesson…</section> : state.run.status === 'ended' || state.run.expired ? <section className="rll-join-card rll-waiting"><span aria-hidden="true">✓</span><h2>Lesson complete</h2><p>Thanks for taking part, {seat.name}.</p></section> : !task ? <section className="rll-join-card rll-waiting"><div className="rll-wait-dots" aria-hidden="true"><i /><i /><i /></div><h2>You’re in!</h2><p>Waiting for your teacher to start the next task.</p><span className="rll-joined-name">Joined as {seat.name}</span></section> : <section className="rll-learner-task"><div className="rll-task-progress">{state.tasks.map((item, index) => <span key={item.id} className={item.id === task.id ? 'active' : ''} title={item.title}>{index + 1}</span>)}</div><div className="rll-task-paper"><span className="rll-kicker">YOUR TASK</span><h2>{task.title}</h2><InstrView doc={task.instrDoc} text={task.instructions} /><div className="rll-task-content"><LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey(task.content, true).content} responses={responses} onChange={(id, value) => { setResponses(old => ({ ...old, [id]: value })); setSubmittedTask(''); }} disabled={busy} hideAnswers /></LocalActivityMode.Provider></div></div><div className="rll-submit-bar"><span>{submittedTask === task.id ? 'Answer sent. You can edit and send it again.' : 'Your teacher will see your answer when you send it.'}</span><button type="button" className="rll-primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : submittedTask === task.id ? 'Send updated answer' : 'Send answer'}</button></div></section>}</>}
  </main></div>;
}
