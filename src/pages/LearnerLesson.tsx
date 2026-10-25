import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
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
import { drawShared, useSharedPicks } from '../lib/picks';
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
      setCurrent((cur) => (cur && list.some((t) => t.id === cur && !t.locked && t.kind !== 'section') ? cur : list.find((t) => !t.locked && t.kind !== 'section')?.id ?? ''));
    });
    return () => (u1(), u2(), u3());
  }, [classId, itemId]);

  useEffect(() => {
    if (!classId) return;
    return onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {});
  }, [classId]);
  usePresenceBeat(classId, user?.uid, { name: profile?.role === 'learner' ? profile.displayName : '', learnerId, itemId, taskId: current });
  const teacherAt = isLive(live) && live?.itemId === itemId && live?.showMarker !== false ? live.taskId : '';

  // Load this learner's saved answers for the current task.
  useEffect(() => {
    if (!classId || !current || !user) return;
    setKey(null);
    setChecked(false);
    setResponses({});
    setFlags([]);
    dirty.current = false;
    return onSnapshot(answerRef(classId, current, user.uid), async (s) => {
      const d = s.data() as (AnswerDoc & { flags?: string[] }) | undefined;
      setFlags(d?.flags ?? []);
      if (dirty.current) return;
      setResponses(d?.responses ?? {});
      setChecked(!!d?.checked);
      if (d?.checked) setKey(await loadKey(classId, itemId, current).catch(() => null));
    });
  }, [classId, itemId, current, user]);

  const task = tasks.find((t) => t.id === current);
  const index = tasks.findIndex((t) => t.id === current);
  const shared = useSharedPicks(classId, current);
  const withShared = useMemo(() => ({ ...responses, ...Object.fromEntries(Object.values(shared).map((p) => [p.pickId, { h: p.h, b: p.b }])) }), [responses, shared]);
  const qs = useMemo(() => questionIds(task?.content ?? null, withShared), [task, withShared]);
  const answered = qs.filter((q) => isAnswered(responses[q.id])).length;
  const base = user && task ? { learnerUid: user.uid, learnerId, itemId, taskId: task.id } : null;

  const [flags, setFlags] = useState<string[]>([]);
  function toggleFlag(id: string) {
    if (!base) return;
    const next = flags.includes(id) ? flags.filter((f) => f !== id) : [...flags, id];
    setFlags(next);
    setDoc(answerRef(classId, base.taskId, base.learnerUid), { ...base, flags: next }, { merge: true }).catch((e) => console.error(e));
  }

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
  const prevOpen = [...tasks.slice(0, Math.max(0, index))].reverse().find((t) => !t.locked && t.kind !== 'section');
  const nextOpen = tasks.slice(index + 1).find((t) => !t.locked && t.kind !== 'section');
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
          {tasks.map((t) =>
            t.kind === 'section' ? (
              <span key={t.id} className="section-label">
                {t.title}
              </span>
            ) : (
            <div key={t.id} className={'task-row' + (t.id === current ? ' on' : '')}>
              <button type="button" className={'task-pick' + (t.locked ? ' is-locked' : '')} disabled={t.locked} title={t.locked ? 'Your teacher will open this task soon' : undefined} onClick={() => setCurrent(t.id)}>
                <span>{t.title}</span>
                {t.locked && (
                  <svg className="lock-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="locked">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
                {teacherAt === t.id && (
                  <span className="teacher-here" title={`${live?.teacherName ?? 'Your teacher'} is on this task`}>
                    <span className="live-dot" aria-hidden="true" />
                    {live?.teacherName ?? 'Teacher'}
                  </span>
                )}
              </button>
            </div>
            ),
          )}
          {tasks.length === 0 && <span className="hint" style={{ padding: '0 10px' }}>No tasks yet.</span>}
        </nav>

        <main className="task-frame">
          {task ? (
            <div className="frame-inner">
              <div className="frame-head">
                <h1 className="task-title">{task.title}</h1>
                {task.instructions && <p className="task-instr">{task.instructions}</p>}

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
                  flags={flags}
                  shared={shared}
                  onOpenTask={(id) => {
                    const t = tasks.find((x) => x.id === id);
                    if (t && !t.locked) setCurrent(id);
                  }}
                  taskState={(id) => {
                    const t = tasks.find((x) => x.id === id);
                    return !t ? 'missing' : t.locked ? 'locked' : 'open';
                  }}
                  onSharedDraw={(pickId, next, seq) => drawShared(classId, current, pickId, next.h, next.b, seq, (profile?.role === 'learner' ? profile.displayName : '').split(' ')[0] || 'A learner').catch((e) => console.error(e))}
                  onToggleFlag={task.locked ? undefined : toggleFlag}
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
                    {flags.filter((f) => qs.some((q) => q.id === f)).length > 0 && ` · ${flags.filter((f) => qs.some((q) => q.id === f)).length} flagged`}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn" disabled={!prevOpen} onClick={() => prevOpen && setCurrent(prevOpen.id)}>
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
                  <button className={'btn' + (checked || qs.length === 0 ? ' primary' : '')} disabled={!nextOpen} onClick={() => nextOpen && setCurrent(nextOpen.id)}>
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
