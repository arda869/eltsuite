import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { updateItem, type ClassDoc, type Item } from '../lib/classes';
import {
  addTask,
  deleteTask,
  loadKey,
  mergeKey,
  saveTask,
  setTaskFlags,
  splitKey,
  questionIds,
  tasksCol,
  type AnswerKey,
  type Responses,
  type Task,
} from '../lib/tasks';
import { theme } from '../lib/themes';
import { isLive, liveRef, setLive, type LiveState } from '../lib/live';
import { useAuth } from '../lib/auth';
import { isOnline, usePresence } from '../lib/presence';
import { initials } from '../components/TopBar';
import { TopBar } from '../components/TopBar';
import { TaskEditor } from '../editor/TaskEditor';
import { DOTS } from '../editor/nodes';
import { TaskRenderer } from '../components/TaskRenderer';
import { LivePanel } from '../components/LivePanel';
import { drawShared, useSharedPicks } from '../lib/picks';
import { useClassmates } from '../lib/learners';

const svg = (d: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const EYE = svg(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
const EYE_OFF = svg(<><path d="M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M3 3l18 18" /></>);
const LOCK = svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
const UNLOCK = svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>);
const TRASH = svg(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>);

type Draft = { title: string; instructions: string; content: JSONContent };

export function LessonEditor() {
  const { classId = '', itemId = '' } = useParams();
  const [c, setC] = useState<ClassDoc | null>(null);
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [preview, setPreview] = useState(false);
  const [previewResponses, setPreviewResponses] = useState<Responses>({});
  const [previewChecked, setPreviewChecked] = useState(false);
  const [editWhileTeaching, setEditWhileTeaching] = useState(false);
  const { user } = useAuth();
  const [live, setLiveState] = useState<LiveState | null>(null);
  const timer = useRef<number>();
  const pending = useRef<{ taskId: string; patch: Partial<Draft> } | null>(null);

  useEffect(() => onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) })), [classId]);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'classes', classId, 'items', itemId),
        (s) => setItem(s.exists() ? ({ id: s.id, ...(s.data() as Omit<Item, 'id'>) }) : null),
        () => setItem(null),
      ),
    [classId, itemId],
  );
  useEffect(
    () =>
      onSnapshot(query(tasksCol(classId, itemId), orderBy('order')), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }));
        setTasks(list);
        setSelected((cur) => (cur && list.some((t) => t.id === cur && t.kind !== 'section') ? cur : list.find((t) => t.kind !== 'section')?.id ?? ''));
      }),
    [classId, itemId],
  );

  const task = tasks.find((t) => t.id === selected);
  const sharedPicks = useSharedPicks(classId, selected);
  const classmates = useClassmates(c?.classCode);

  useEffect(() => onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {}), [classId]);
  const teachingHere = isLive(live) && live?.itemId === itemId;
  const presence = usePresence(classId, teachingHere);
  const online = presence.filter(isOnline).sort((a, b) => a.name.localeCompare(b.name));
  const inLesson = online.filter((p) => p.itemId === itemId);
  const onTask = (taskId: string) => inLesson.filter((p) => p.taskId === taskId).length;
  const [seeLearners, setSeeLearnersState] = useState(() => {
    try {
      return localStorage.getItem('ll.seeLearners') !== '0';
    } catch {
      return true;
    }
  });
  const setSeeLearners = (v: boolean) => {
    setSeeLearnersState(v);
    try {
      localStorage.setItem('ll.seeLearners', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // While teaching, tell learners which task the teacher is on.
  useEffect(() => {
    if (teachingHere && selected && live?.taskId !== selected) setLive(classId, { taskId: selected }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingHere, selected]);

  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('teach') === '1' && selected && live !== undefined) {
      setParams({}, { replace: true });
      if (!teachingHere) toggleTeaching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function toggleTeaching() {
    if (teachingHere) await setLive(classId, { teaching: false });
    else
      await setLive(classId, {
        teaching: true,
        itemId,
        taskId: selected,
        teacherName: (user?.displayName || user?.email?.split('@')[0] || 'Your teacher').split(' ')[0],
      });
  }

  // Load the selected task (with its answer key) into the editor once per selection.
  useEffect(() => {
    if (!task) {
      setDraft(null);
      return;
    }
    let cancelled = false;
    loadKey(classId, itemId, task.id).then((key: AnswerKey) => {
      if (cancelled) return;
      const content = mergeKey(task.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }, key);
      setDraft({ title: task.title, instructions: task.instructions ?? '', content });
      setEditorKey(task.id + ':' + Date.now());
      setPreview(false);
      setPreviewResponses({});
      setPreviewChecked(false);
    });
    return () => {
      cancelled = true;
    };
    // Only when the selection changes, not on every remote update of the same task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, !!task]);

  async function flush() {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus('saving');
    try {
      await saveTask(classId, itemId, p.taskId, p.patch);
      setStatus(pending.current ? 'saving' : 'saved');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  function change(patch: Partial<Draft>) {
    if (!task || !draft) return;
    setDraft({ ...draft, ...patch });
    pending.current = { taskId: task.id, patch: { ...(pending.current?.taskId === task.id ? pending.current.patch : {}), ...patch } };
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  }

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  });

  async function select(id: string) {
    await flush();
    setSelected(id);
  }

  async function newTask() {
    await flush();
    const id = await addTask(classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0);
    setSelected(id);
  }

  async function newSection() {
    await addTask(classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0, 'section');
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // Drop a task at a new position and renumber the order of every task.
  async function reorder(fromId: string, to: number) {
    const list = [...tasks];
    const from = list.findIndex((t) => t.id === fromId);
    if (from < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to > from ? to - 1 : to, 0, moved);
    setTasks(list);
    await Promise.all(list.map((t, i) => (t.order !== i ? setTaskFlags(classId, itemId, t.id, { order: i }) : null)));
  }

  async function remove(t: Task) {
    if (!window.confirm(`Delete the task “${t.title}”?`)) return;
    pending.current = null;
    await deleteTask(classId, itemId, t.id);
  }

  const previewKey = useMemo(() => (draft ? splitKey(draft.content) : null), [draft, previewChecked]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = theme(c?.themeColor);

  return (
    <div className="shell wide" style={{ ['--accent' as string]: th.accent, ['--accent-text' as string]: th.text }}>
      <TopBar>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">Classes</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/class/${classId}`}>{c?.name ?? 'Class'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{item?.title ?? '…'}</span>
        </nav>
        <button type="button" className={'btn small-btn teach-btn' + (teachingHere ? ' on' : '')} onClick={toggleTeaching} title="Shows learners which task you are on">
          {teachingHere && <span className="live-dot" aria-hidden="true" />}
          {teachingHere ? 'Teaching · stop' : 'Start teaching'}
        </button>
        <span className={'save-state ' + status}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved. Check your connection.' : 'Saved'}</span>
      </TopBar>

      {item === null && <p className="placeholder">This lesson could not be found.</p>}

      {item && (
        <div className="lesson-layout">
          <nav className="task-list" aria-label="Tasks">
            <input
              className="lesson-title"
              defaultValue={item.title}
              aria-label="Lesson title"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.title && updateItem(classId, itemId, { title: e.target.value.trim() })}
            />
            {tasks.map((t, i) => (
              <div
                key={t.id}
                className={'task-row' + (t.id === selected ? ' on' : '') + (dragId === t.id ? ' dragging' : '') + (dropAt === i ? ' drop-before' : '') + (dropAt === tasks.length && i === tasks.length - 1 ? ' drop-after' : '')}
                draggable
                onDragStart={(e) => {
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', t.id);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dropAt !== null) reorder(dragId, dropAt);
                  setDragId(null);
                  setDropAt(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropAt(null);
                }}
              >
                <span className="drag-handle" aria-hidden="true" title="Drag to reorder">
                  {DOTS}
                </span>
                {t.kind === 'section' ? (
                  <span className="section-row">
                    <input
                      className="section-input"
                      defaultValue={t.title}
                      aria-label="Section name"
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.title && setTaskFlags(classId, itemId, t.id, { title: e.target.value.trim() })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <button type="button" className="icon-btn" aria-label="Delete section" onClick={() => deleteTask(classId, itemId, t.id)}>
                      ×
                    </button>
                  </span>
                ) : (
                <button type="button" className="task-pick" onClick={() => select(t.id)}>
                  <span className="n">{tasks.filter((x) => x.kind !== 'section').findIndex((x) => x.id === t.id) + 1}</span>
                  <span className={t.hidden ? 'hidden-title' : ''}>{t.id === selected && draft ? draft.title || 'Untitled task' : t.title || 'Untitled task'}</span>
                  {t.hidden && <span className="state-mark" title="Hidden from learners">{EYE_OFF}</span>}
                  {t.locked && <span className="state-mark" title="Locked">{LOCK}</span>}
                  {teachingHere && seeLearners && onTask(t.id) > 0 && (
                    <span className="on-task" title={`${onTask(t.id)} on this task`}>
                      {onTask(t.id)}
                    </span>
                  )}
                </button>
                )}
                {t.kind !== 'section' && (
                  <span className="row-actions">
                    <button type="button" className={'row-act' + (t.hidden ? ' on' : '')} title={t.hidden ? 'Show to learners' : 'Hide from learners'} aria-label={t.hidden ? 'Show to learners' : 'Hide from learners'} onClick={() => setTaskFlags(classId, itemId, t.id, { hidden: !t.hidden })}>
                      {t.hidden ? EYE_OFF : EYE}
                    </button>
                    <button type="button" className={'row-act' + (t.locked ? ' on' : '')} title={t.locked ? 'Unlock' : 'Lock · learners see it but can’t open it'} aria-label={t.locked ? 'Unlock' : 'Lock'} onClick={() => setTaskFlags(classId, itemId, t.id, { locked: !t.locked })}>
                      {t.locked ? LOCK : UNLOCK}
                    </button>
                    <button type="button" className="row-act" title="Delete task" aria-label="Delete task" onClick={() => remove(t)}>
                      {TRASH}
                    </button>
                  </span>
                )}
              </div>
            ))}
            <div className="list-adds">
              <button type="button" className="btn dashed" onClick={newTask}>
                + New task
              </button>
              <button type="button" className="btn dashed" onClick={newSection}>
                + Section
              </button>
            </div>
          </nav>

          <div className="center-col">
          {teachingHere && (
            <div className="session-strip" aria-label="Learners in this session">
              <span className="session-count">
                <span className="live-dot" aria-hidden="true" />
                {inLesson.length} of {c?.learnerCount ?? 0} in this lesson
              </span>
              <span className="session-people">
                {online.length === 0 && <span className="hint">No learners online yet. Share the class code {c?.classCode}.</span>}
                {online.map((p) => (
                  <span key={p.id} className={'person' + (p.itemId === itemId ? '' : ' elsewhere')} title={p.itemId === itemId ? !seeLearners ? `${p.name} · in this lesson` : `${p.name} · ${tasks.find((t) => t.id === p.taskId)?.title ?? 'in this lesson'}` : `${p.name} · online, not in this lesson`}>
                    <span className="avatar small">{initials(p.name)}</span>
                    <span className="pname">{p.name.split(' ')[0]}</span>
                    {seeLearners && p.itemId === itemId && p.taskId !== selected && <span className="ptask">{tasks.findIndex((t) => t.id === p.taskId) + 1 || ''}</span>}
                  </span>
                ))}
              </span>
            </div>
          )}
          <main className="task-frame">
            {!task || !draft ? (
              <div className="empty" style={{ padding: 28 }}>
                <h2>{tasks.length ? 'Loading…' : 'Add the first task'}</h2>
                {!tasks.length && <p>A lesson is a set of tasks. Each task is like a page: a short title, a bold instruction, then the text and questions.</p>}
                {!tasks.length && (
                  <button className="btn primary" onClick={newTask}>
                    + New task
                  </button>
                )}
              </div>
            ) : preview || (teachingHere && !editWhileTeaching) ? (
              <div className="frame-inner">
                <div className="frame-head">
                  <h1 className="task-title">{draft.title}</h1>
                  {draft.instructions && <p className="task-instr">{draft.instructions}</p>}
                </div>
                <div className="frame-body">
                  <TaskRenderer
                    content={previewKey?.content ?? null}
                    responses={previewResponses}
                    onChange={(id, v) => setPreviewResponses((r) => ({ ...r, [id]: v }))}
                    results={preview && previewChecked ? previewKey?.key : null}
                    hideAnswers={task.afterCheck === 'retry'}
                    disabled={!preview}
                    layout={task.layout ?? 'single'}
                    colScroll={task.colScroll ?? 'separate'}
                    teacher
                    classmates={classmates}
                    classId={classId}
                    boardMe={!preview && user ? { classId, taskId: task.id, uid: user.uid, name: (user.displayName || user.email?.split('@')[0] || 'Teacher').split(' ')[0], teacher: true } : undefined}
                    onOpenTask={(id) => select(id)}
                    shared={preview ? undefined : sharedPicks}
                    onSharedDraw={(pickId, next, seq) => drawShared(classId, task.id, pickId, next.h, next.b, seq, live?.teacherName || 'Teacher').catch((e) => console.error(e))}
                    onSharedReset={(pickId) => drawShared(classId, task.id, pickId, [], [], (sharedPicks[pickId]?.seq ?? 0) + 1, '').catch((e) => console.error(e))}
                  />
                </div>
                <div className="frame-foot">
                  <span className="hint">{preview ? 'Preview · answers here are not saved' : 'Teaching · the task is read-only so you don’t change it by accident'}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {!preview ? (
                      <button className="btn" onClick={() => setEditWhileTeaching(true)}>
                        Edit task
                      </button>
                    ) : questionIds(previewKey?.content ?? null).every((q) => q.type === 'reflect') ? null : previewChecked ? (
                      <button className="btn" onClick={() => setPreviewChecked(false)}>
                        Try again
                      </button>
                    ) : (
                      <button className="btn primary" onClick={() => setPreviewChecked(true)}>
                        Check answers
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="frame-inner">
                <div className="frame-head">
                  {teachingHere && (
                    <button type="button" className="btn small-btn done-edit" onClick={() => (flush(), setEditWhileTeaching(false))}>
                      Done editing
                    </button>
                  )}
                  <input className="task-title input" value={draft.title} placeholder="Task title" aria-label="Task title" onChange={(e) => change({ title: e.target.value })} />
                  <input
                    className="task-instr input"
                    value={draft.instructions}
                    placeholder="Instruction, for example: Complete the sentences."
                    aria-label="Instruction"
                    onChange={(e) => change({ instructions: e.target.value })}
                  />
                </div>
                <div className="frame-body">
                  <TaskEditor
                    key={editorKey}
                    content={draft.content}
                    onChange={(content) => change({ content })}
                    classmates={classmates}
                    classId={classId}
                    places={tasks.filter((t) => t.kind !== 'section' && t.id !== task.id).map((t) => ({ id: t.id, title: t.title, n: tasks.filter((x) => x.kind !== 'section').findIndex((x) => x.id === t.id) + 1 }))}
                  />
                </div>
              </div>
            )}
          </main>
          </div>

          {task && draft && teachingHere && !editWhileTeaching && !preview && previewKey && (
            <LivePanel
              classId={classId}
              taskId={task.id}
              content={previewKey.content}
              answerKey={previewKey.key}
              presence={inLesson}
              showMarker={live?.showMarker !== false}
              onShowMarker={(v) => setLive(classId, { showMarker: v })}
              seeLearners={seeLearners}
              onSeeLearners={setSeeLearners}
            />
          )}
          {task && draft && !(teachingHere && !editWhileTeaching && !preview) && (
            <aside className="task-side" aria-label="Task settings">
              <button className={'btn block' + (preview ? ' primary' : '')} onClick={() => (flush(), setPreview((p) => !p))}>
                {preview ? 'Back to editing' : 'Preview as learner'}
              </button>
              {(() => {
                const hasCols = JSON.stringify(draft.content).includes('"columnBreak"');
                return (
                  <div className="field" style={{ gap: 6 }}>
                    <span>Columns</span>
                    {!hasCols ? (
                      <>
                        <button
                          type="button"
                          className="btn small-btn"
                          style={{ alignSelf: 'flex-start' }}
                          onClick={() => {
                            const c = draft.content;
                            const n = Math.max(1, Math.floor((c.content?.length ?? 1) / 2));
                            const next = { ...c, content: [...(c.content ?? []).slice(0, n), { type: 'columnBreak' }, ...(c.content ?? []).slice(n)] };
                            change({ content: next });
                            setEditorKey(task.id + ':' + Date.now());
                          }}
                        >
                          Split into two columns
                        </button>
                        <span className="hint">Or type / and choose “Next column” where the second column should start.</span>
                      </>
                    ) : (
                      <>
                        <span className="seg" role="radiogroup" aria-label="Column widths">
                          {([
                            ['two', 'Equal'],
                            ['two-wide', 'Wide left'],
                          ] as const).map(([k, label]) => (
                            <button key={k} type="button" role="radio" aria-checked={(task.layout === 'two-wide' ? 'two-wide' : 'two') === k} className={(task.layout === 'two-wide' ? 'two-wide' : 'two') === k ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { layout: k })}>
                              {label}
                            </button>
                          ))}
                        </span>
                        <span className="seg" role="radiogroup" aria-label="Scrolling">
                          {([
                            ['separate', 'Scroll separately'],
                            ['together', 'Scroll together'],
                          ] as const).map(([k, label]) => (
                            <button key={k} type="button" role="radio" aria-checked={(task.colScroll ?? 'separate') === k} className={(task.colScroll ?? 'separate') === k ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { colScroll: k })}>
                              {label}
                            </button>
                          ))}
                        </span>
                        <span className="hint">Remove the “Next column” line in the text to go back to one column.</span>
                      </>
                    )}
                  </div>
                );
              })()}
              <div className="field" style={{ gap: 6 }}>
                <span>After checking</span>
                <span className="seg" role="radiogroup" aria-label="After checking">
                  <button type="button" role="radio" aria-checked={task.afterCheck !== 'retry'} className={task.afterCheck !== 'retry' ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { afterCheck: 'reveal' })}>
                    Show answers
                  </button>
                  <button type="button" role="radio" aria-checked={task.afterCheck === 'retry'} className={task.afterCheck === 'retry' ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { afterCheck: 'retry' })}>
                    Try again
                  </button>
                </span>
                <span className="hint">
                  {task.afterCheck === 'retry' ? 'Learners only see which answers are right or wrong, then try the wrong ones again.' : 'Learners see the correct answers after they check.'}
                </span>
              </div>
              <h2>Tips</h2>
              <p className="hint" style={{ margin: 0 }}>
                Type <strong>/</strong> in the text for a gap or a multiple-choice question. In a gap, separate other accepted answers with |, for example
                “have been | ’ve been”. Capitals, curly apostrophes and a final full stop are ignored when checking.
              </p>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
