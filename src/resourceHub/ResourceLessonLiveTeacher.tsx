import { IdentityMark } from '../components/Identity';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { JSONContent } from '@tiptap/react';
import QRCode from 'qrcode';
import { TopBar } from '../components/TopBar';
import { InstrView } from '../editor/InstrEditor';
import { TaskRenderer } from '../components/TaskRenderer';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { isQuestion, splitKey } from '../lib/questions';
import { lessonLiveApi, type LessonLiveAnswer, type LessonLiveParticipant, type LessonLiveRun, type LessonResult, type LessonTeacherState } from './lessonLiveApi';
import './resourceLessonLive.css';

const joinLink = (code: string) => `${location.origin}/lesson-join/${encodeURIComponent(code)}`;
const sourceLink = (run: LessonLiveRun) => run.sourceKind === 'file' && run.fileId ? `/doc/${encodeURIComponent(run.fileId)}` : `/resource-hub?activity=lesson-${encodeURIComponent(run.resourceId || '')}`;
const historyLink = (run: LessonLiveRun) => run.sourceKind === 'file' && run.fileId ? `/lesson-file/${encodeURIComponent(run.fileId)}/history` : `/resource-hub/lesson/${encodeURIComponent(run.resourceId || '')}/history`;
const dateLabel = (at?: number | null) => at ? new Date(at).toLocaleString() : 'In progress';
const scoreLabel = (got: number, max: number, answered: number) => !answered ? 'No answer' : !max ? 'Needs review' : `${got} / ${max}`;
const nodeText = (node: JSONContent): string => [node.text || '', ...(node.content || []).map(nodeText)].join(' ').replace(/\s+/g, ' ').trim();
function questionLabels(content?: JSONContent | null): Record<string, string> {
  if (!content) return {};
  const labels: Record<string, string> = {};
  let number = 0;
  const walk = (node: JSONContent, parent?: JSONContent) => {
    if (isQuestion(node)) {
      number += 1;
      const id = String(node.attrs?.id);
      const hint = String(node.attrs?.prompt || node.attrs?.label || nodeText(node) || (parent ? nodeText(parent) : '') || '').trim().slice(0, 95);
      labels[id] = hint ? `Question ${number} · ${hint}` : `Question ${number}`;
    }
    node.content?.forEach(child => walk(child, node));
  };
  walk(content);
  return labels;
}

function AnswerRows({ answers, participants }: { answers: LessonLiveAnswer[]; participants: LessonLiveParticipant[] }) {
  return <div className="rll-answer-list">{participants.map(person => {
    const answer = answers.find(item => item.pid === person.pid);
    return <article key={person.pid} className="rll-answer-row"><div className="rll-person"><span className="rll-avatar">{person.name.charAt(0).toUpperCase()}</span><strong>{person.name}</strong></div><span className={`rll-score ${answer?.answered && !answer.max ? 'rll-review' : ''}`}>{answer ? scoreLabel(answer.got, answer.max, answer.answered) : 'Working'}</span>{answer?.grading && <div className="rll-question-status">{Object.entries(answer.grading).map(([qid, grade]) => <span key={qid} className={`rll-grade ${grade.status}`} title={`Question ${qid}: ${grade.status}`}>{grade.status === 'correct' ? '✓' : grade.status === 'incorrect' ? '×' : grade.status === 'partial' ? '◐' : '–'} <small>{qid.slice(0, 6)}</small></span>)}</div>}</article>;
  })}{!participants.length && <p className="rll-empty">Names appear here as learners join.</p>}</div>;
}

export function ResourceLessonLiveTeacher() {
  const { runId = '' } = useParams();
  const [state, setState] = useState<LessonTeacherState | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const refresh = useCallback(async () => {
    try { setState(await lessonLiveApi<LessonTeacherState>('teacherState', { runId })); setError(''); }
    catch (cause) { setError((cause as Error).message); }
  }, [runId]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer); }, [refresh]);
  const code = state?.code || '';
  useEffect(() => { if (!code) return; void QRCode.toDataURL(joinLink(code), { width: 300, margin: 1, color: { dark: '#283b32', light: '#ffffff' } }).then(setQr); }, [code]);
  const change = async (action: 'advance' | 'end', taskId?: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await lessonLiveApi(action, { runId, ...(taskId ? { taskId } : {}) }); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const run = state?.run;
  const finished = !!run && (run.status === 'ended' || run.expired);
  const task = state?.currentTask;
  const current = run?.currentTaskId ? run.taskIds.indexOf(run.currentTaskId) : -1;
  const nextId = run?.taskIds[current + 1];
  const activityLink = run ? sourceLink(run) : '/resource-hub';
  return <div className="shell rll-shell"><TopBar /><main className="rll-wrap"><div className="rll-topline"><Link to={activityLink}>← Back to lesson</Link>{run && <Link to={historyLink(run)}>Teaching history</Link>}</div>
    <header className="rll-head"><div><span className="rll-kicker">RESOURCE HUB · LIVE LESSON</span><h1>{run?.title || 'Live lesson'}</h1><p>{finished ? run?.expired ? 'This live lesson has expired. Results are saved in teaching history.' : 'This lesson has ended. Results are saved in teaching history.' : run?.status === 'running' ? `Task ${current + 1} of ${run.taskIds.length} · ${run.taskTitles[run.currentTaskId || ''] || 'Live now'}` : code ? 'Invite learners with the code or QR. Start when they are ready.' : 'The join code has expired. Start a new live lesson to invite learners.'}</p></div><span className={`rll-phase ${finished ? 'ended' : run?.status || 'loading'}`}>{finished ? run?.expired ? 'Expired' : 'Ended' : run?.status === 'running' ? 'Teaching live' : 'Lobby'}</span></header>
    {error && <p role="alert" className="rll-error">{error}</p>}
    {!run ? <div role="status" className="rll-card">Loading live lesson…</div> : <div className="rll-teacher-grid"><section className="rll-card rll-teacher-main">
      {!finished && run.status === 'lobby' && <><div className="rll-card-heading"><div><span className="rll-kicker">LET THEM IN</span><h2>Join this lesson</h2></div><span className="rll-count">{state?.participants.length || 0} joined</span></div>{code ? <div className="rll-lobby"><div className="rll-code"><small>Lesson code</small><strong>{code}</strong><button type="button" className="rll-secondary" onClick={() => void navigator.clipboard.writeText(joinLink(code))}>Copy join link</button></div>{qr && <img src={qr} alt={`QR code to join lesson ${code}`} />}</div> : <p className="rll-error">This join code has expired. Start a new live lesson from the resource page.</p>}<div className="rll-actions"><button type="button" className="rll-primary" disabled={busy || !run.taskIds.length || !code} onClick={() => void change('advance', run.taskIds[0])}>Start first task →</button>{!run.taskIds.length && <p className="rll-hint">Publish a learner task before starting.</p>}</div></>}
      {!finished && run.status === 'running' && <><div className="rll-card-heading"><div><span className="rll-kicker">TASK {current + 1} OF {run.taskIds.length}</span>{task?.identity && <div className="aid-row"><IdentityMark identity={task.identity} /></div>}<h2>{task?.title || run.taskTitles[run.currentTaskId || '']}</h2></div><span className="rll-count">{state?.answers.length || 0} submitted</span></div>{task && <div className="rll-task-display"><InstrView doc={task.instrDoc} text={task.instructions} /><LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey(task.content, true).content} responses={{}} disabled /></LocalActivityMode.Provider></div>}<div className="rll-actions">{nextId && <button type="button" className="rll-primary" disabled={busy} onClick={() => void change('advance', nextId)}>Next task →</button>}<button type="button" className="rll-secondary" disabled={busy} onClick={() => setConfirmEnd(true)}>End lesson</button></div></>}
      {finished && <div className="rll-ended"><span aria-hidden="true">✓</span><h2>{run.expired ? 'Session expired' : 'Lesson finished'}</h2><p>Joined learners and their submitted answers are saved.</p><Link className="rll-primary" to={`${historyLink(run)}?run=${encodeURIComponent(run.runId)}`}>View results</Link></div>}
    </section><aside className="rll-card rll-people"><div className="rll-card-heading"><div><span className="rll-kicker">IN THE ROOM</span><h2>Learners & answers</h2></div><span className="rll-count">{state?.participants.length || 0}</span></div><AnswerRows participants={state?.participants || []} answers={state?.answers || []} />{!finished && run.status === 'running' && code && <div className="rll-share-compact"><strong>Join code {code}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(joinLink(code))}>Copy link</button></div>}</aside></div>}
    {confirmEnd && <div className="rll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmEnd(false); }}><section role="dialog" aria-modal="true" aria-labelledby="rll-end-title" className="rll-dialog"><span className="rll-kicker">END LIVE LESSON</span><h2 id="rll-end-title">Finish this session?</h2><p>Learners will leave the live task. Their names and submitted answers will stay in Teaching history.</p><div className="rll-actions"><button type="button" className="rll-secondary" onClick={() => setConfirmEnd(false)}>Keep teaching</button><button type="button" className="rll-primary" disabled={busy} onClick={() => { setConfirmEnd(false); void change('end'); }}>End and save results</button></div></section></div>}
  </main></div>;
}

export function ResourceLessonHistory() {
  const { resourceId = '' } = useParams();
  const { fileId = '' } = useParams();
  const [params] = useSearchParams();
  const [runs, setRuns] = useState<LessonLiveRun[]>([]);
  const [selected, setSelected] = useState<LessonResult | null>(null);
  const [taskId, setTaskId] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void lessonLiveApi<{ runs: LessonLiveRun[] }>('history', fileId ? { fileId } : { resourceId }).then(result => setRuns(result.runs), cause => setError((cause as Error).message)); }, [resourceId, fileId]);
  useEffect(() => { const requested = params.get('run'); if (requested && runs.some(run => run.runId === requested) && selected?.run.runId !== requested) void show(requested); }, [runs, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = async (runId: string, nextTaskId = '') => {
    setBusy(true); setError('');
    try { setSelected(await lessonLiveApi<LessonResult>('result', { runId, ...(nextTaskId ? { taskId: nextTaskId } : {}) })); setTaskId(nextTaskId); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="shell rll-shell"><TopBar /><main className="rll-wrap"><div className="rll-topline"><Link to={fileId ? `/doc/${encodeURIComponent(fileId)}` : `/resource-hub?activity=lesson-${encodeURIComponent(resourceId)}`}>← Back to lesson</Link></div><header className="rll-head"><div><span className="rll-kicker">LIVE LESSON · TEACHING HISTORY</span><h1>Previous live lessons</h1><p>See who joined and how they answered each task.</p></div></header>{error && <p role="alert" className="rll-error">{error}</p>}
    <div className="rll-history-layout"><section className="rll-card"><h2>Sessions</h2>{runs.map(run => <button type="button" key={run.runId} className={`rll-history-run ${selected?.run.runId === run.runId ? 'active' : ''}`} onClick={() => void show(run.runId)}><strong>{run.title}</strong><span>{dateLabel(run.startedAt)} · {run.participantCount} learners · {run.status}</span></button>)}{!runs.length && <p className="rll-empty">No live sessions yet.</p>}</section><section className="rll-card rll-history-detail">{busy && <p role="status">Loading results…</p>}{selected ? <><div className="rll-card-heading"><div><span className="rll-kicker">{dateLabel(selected.run.startedAt)}</span><h2>{selected.run.title}</h2></div><span className="rll-count">{selected.participants.length} joined</span></div><div className="rll-task-tabs" aria-label="Tasks">{selected.run.taskIds.map((id, index) => <button type="button" key={id} className={id === taskId ? 'active' : ''} onClick={() => void show(selected.run.runId, id)}>{index + 1}. {selected.run.taskTitles[id]}</button>)}</div>{!taskId && <p className="rll-hint">Choose a task to see every learner’s answer and question result.</p>}<div className="rll-answer-list">{selected.participants.map(person => { const summary = person.summaries?.[taskId]; const answer = selected.answers.find(item => item.pid === person.pid && item.taskId === taskId); const labels = questionLabels(selected.task?.content); return <article key={person.pid} className="rll-result-person"><div className="rll-person"><span className="rll-avatar">{person.name.charAt(0).toUpperCase()}</span><strong>{person.name}</strong></div>{taskId && <span className="rll-score">{summary ? scoreLabel(summary.got, summary.max, summary.answered) : 'No answer'}</span>}{answer?.grading && <div className="rll-result-questions">{Object.entries(answer.grading).map(([qid, grade], index) => <div key={qid}><span className={`rll-grade ${grade.status}`}>{grade.status}</span><small>{labels[qid] || `Question ${index + 1}`}</small><strong>{grade.max ? `${grade.got}/${grade.max}` : '—'}</strong></div>)}</div>}{answer?.responses && <details><summary>Submitted responses</summary><ul>{Object.entries(answer.responses).map(([qid, value], index) => <li key={qid}><strong>{labels[qid] || `Question ${index + 1}`}</strong> {typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}</li>)}</ul></details>}</article>; })}</div></> : <div className="rll-empty">Select a session to review its learners and results.</div>}</section></div>
  </main></div>;
}
