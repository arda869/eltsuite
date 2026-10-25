import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc, Item } from '../lib/classes';
import {
  answerRef,
  isCorrect,
  isAnswered,
  scoreTask,
  loadKey,
  questionIds,
  saveResponses,
  tasksCol,
  type AnswerDoc,
  type AnswerKey,
  type Responses,
  type Task,
} from '../lib/tasks';
import { theme } from '../lib/themes';
import { isLive, liveRef, type LiveState } from '../lib/live';
import { usePresenceBeat } from '../lib/presence';
import { Wordmark } from '../components/Wordmark';
import { TaskRenderer } from '../components/TaskRenderer';

export function LearnerLesson() {
  const { itemId = '' } = useParams();
  const { user, profile } = useAuth();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  const learnerId = profile?.role === 'learner' ? profile.learnerId : '';
  const [c, setC] = useState<ClassDoc | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [current, setCurrent] = useState('');
  const [responses, setResponses] = useState<Responses>({});
  const [checked, setChecked] = useState(false);
  const [key, setKey] = useState<AnswerKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLiveState] = useState<LiveState | null>(null);
  const timer = useRef<number>();
  const dirty = useRef(false);

  useEffect(() => {
    if (!classId) return;
    const u1 = onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }));
    const u2 = onSnapshot(doc(db, 'classes', classId, 'items', itemId), (s) => s.exists() && setItem({ id: s.id, ...(s.data() as Omit<Item, 'id'>) }));
    const u3 = onSnapshot(query(tasksCol(classId, itemId), orderBy('order')), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })).filter((t) => !t.hidden);
      setTasks(list);
      setCurrent((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? ''));
    });
    return () => (u1(), u2(), u3());
  }, [classId, itemId]);

  useEffect(() => {
    if (!classId) return;
    return onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {});
  }, [classId]);
  usePresenceBeat(classId, user?.uid, { name: profile?.role === 'learner' ? profile.displayName : '', learnerId, itemId, taskId: current });
  const teacherAt = isLive(live) && live?.itemId === itemId ? live.taskId : '';

  // Load this learner's saved answers for the current task.
  useEffect(() => {
    if (!classId || !current || !user) return;
    setKey(null);
    setChecked(false);
    setResponses({});
    dirty.current = false;
    return onSnapshot(answerRef(classId, current, user.uid), async (s) => {
      if (dirty.current) return;
      const d = s.data() as AnswerDoc | undefined;
      setResponses(d?.responses ?? {});
      setChecked(!!d?.checked);
      if (d?.checked) setKey(await loadKey(classId, itemId, current).catch(() => null));
    });
  }, [classId, itemId, current, user]);

  const task = tasks.find((t) => t.id === current);
  const index = tasks.findIndex((t) => t.id === current);
  const qs = useMemo(() => questionIds(task?.content ?? null), [task]);
  const answered = qs.filter((q) => isAnswered(responses[q.id])).length;
  const base = user && task ? { learnerUid: user.uid, learnerId, itemId, taskId: task.id } : null;

  function change(id: string, v: Responses[string]) {
    if (!base || checked || task?.locked) return;
    const next = { ...responses, [id]: v };
    setResponses(next);
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveResponses(classId, base, next).catch((e) => console.error(e));
      dirty.current = false;
    }, 600);
  }

  async function check() {
    if (!base) return;
    setBusy(true);
    window.clearTimeout(timer.current);
    try {
      await saveResponses(classId, base, responses, true);
      const k = await loadKey(classId, itemId, base.taskId);
      const r = scoreTask(qs, k, responses);
      await saveResponses(classId, base, responses, true, { score: r.score, total: r.total });
      setKey(k);
      setChecked(true);
    } catch (e) {
      console.error(e);
    } finally {
      dirty.current = false;
      setBusy(false);
    }
  }

  async function tryWrongAgain() {
    if (!base || !key) return;
    const kept: Responses = {};
    for (const q of qs) if (isCorrect(key[q.id], responses[q.id]) || q.type === 'writing') kept[q.id] = responses[q.id];
    setResponses(kept);
    setChecked(false);
    setKey(null);
    await saveResponses(classId, base, kept, false);
  }

  const result = key ? scoreTask(qs, key, responses) : { score: 0, total: 0, hasWriting: false };
  const score = result.score;
  const retryMode = task?.afterCheck === 'retry';
  const th = theme(c?.themeColor);
  const showScore = true;

  return (
    <div className="shell wide lesson-shell" style={{ ['--accent' as string]: th.accent, ['--accent-text' as string]: th.text }}>
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">{c?.name ?? 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{item?.title ?? '…'}</span>
        </nav>
        {c?.meeting?.url && c.meeting.visibility === 'always' && (
          <a className="btn small-btn right-push" href={c.meeting.url} target="_blank" rel="noopener noreferrer">
            Join call
          </a>
        )}
      </header>

      <div className="lesson-layout learner">
        <nav className="task-list" aria-label="Tasks">
          <span className="eyebrow" style={{ padding: '0 10px 6px', fontSize: 11 }}>
            {item?.title}
          </span>
          {tasks.map((t) => (
            <div key={t.id} className={'task-row' + (t.id === current ? ' on' : '')}>
              <button type="button" className="task-pick" onClick={() => setCurrent(t.id)}>
                <span>{t.title}</span>
                {teacherAt === t.id && (
                  <span className="teacher-here" title={`${live?.teacherName ?? 'Your teacher'} is on this task`}>
                    <span className="live-dot" aria-hidden="true" />
                    {live?.teacherName ?? 'Teacher'}
                  </span>
                )}
              </button>
            </div>
          ))}
          {tasks.length === 0 && <span className="hint" style={{ padding: '0 10px' }}>No tasks yet.</span>}
        </nav>

        <main className="task-frame">
          {task ? (
            <div className="frame-inner">
              <div className="frame-head">
                <h1 className="task-title">{task.title}</h1>
                {task.instructions && <p className="task-instr">{task.instructions}</p>}
                {task.locked && <span className="hint">Your teacher has locked this task for now.</span>}
              </div>
              <div className="frame-body">
                {teacherAt && teacherAt !== task.id && (
                  <button type="button" className="teacher-banner" onClick={() => setCurrent(teacherAt)}>
                    <span className="live-dot" aria-hidden="true" />
                    {live?.teacherName ?? 'Your teacher'} is on “{tasks.find((t) => t.id === teacherAt)?.title ?? 'another task'}”. Go there
                  </button>
                )}
                <TaskRenderer
                  content={task.content}
                  responses={responses}
                  onChange={change}
                  results={checked ? key : null}
                  disabled={task.locked}
                  hideAnswers={task.afterCheck === 'retry'}
                  layout={task.layout ?? 'single'}
                    colScroll={task.colScroll ?? 'separate'}
                />
              </div>
              <div className="frame-foot">
                {checked && key && showScore ? (
                  <span className="score">
                    {result.total > 0 ? (
                      <>
                        <span className="big">{score}</span> of {result.total} correct
                      </>
                    ) : null}
                    {result.hasWriting && <span className="hint">{result.total > 0 ? ' · ' : ''}Your writing has gone to your teacher</span>}
                  </span>
                ) : (
                  <span className="hint">
                    {qs.length > 0 ? `${answered} of ${qs.length} answered` : ''}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn" disabled={index <= 0} onClick={() => setCurrent(tasks[index - 1].id)}>
                    Previous
                  </button>
                  {qs.length > 0 &&
                    (checked ? (
                      retryMode && score < result.total && (
                        <button className="btn primary" onClick={tryWrongAgain}>
                          Try the wrong ones again
                        </button>
                      )
                    ) : (
                      <button className="btn primary" disabled={busy || task.locked || answered === 0} onClick={check}>
                        {busy ? 'One moment…' : qs.every((q) => q.type === 'writing') ? 'Hand in' : 'Check answers'}
                      </button>
                    ))}
                  <button className={'btn' + (checked || qs.length === 0 ? ' primary' : '')} disabled={index >= tasks.length - 1} onClick={() => setCurrent(tasks[index + 1].id)}>
                    Next
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <p className="placeholder" style={{ padding: 24 }}>
              {tasks.length === 0 ? 'Your teacher hasn’t added tasks to this lesson yet.' : 'Loading…'}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
