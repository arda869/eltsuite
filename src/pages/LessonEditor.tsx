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
  tasksCol,
  type AnswerKey,
  type Responses,
  type Task,
} from '../lib/tasks';
import { theme } from '../lib/themes';
import { isLive, liveRef, setLive, type LiveState } from '../lib/live';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { TaskEditor } from '../editor/TaskEditor';
import { TaskRenderer } from '../components/TaskRenderer';

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
        setSelected((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? ''));
      }),
    [classId, itemId],
  );

  const task = tasks.find((t) => t.id === selected);

  useEffect(() => onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {}), [classId]);
  const teachingHere = isLive(live) && live?.itemId === itemId;

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

  async function move(t: Task, dir: -1 | 1) {
    const i = tasks.findIndex((x) => x.id === t.id);
    const other = tasks[i + dir];
    if (!other) return;
    await Promise.all([setTaskFlags(classId, itemId, t.id, { order: other.order }), setTaskFlags(classId, itemId, other.id, { order: t.order })]);
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
              <div key={t.id} className={'task-row' + (t.id === selected ? ' on' : '')}>
                <button type="button" className="task-pick" onClick={() => select(t.id)}>
                  <span className="n">{i + 1}</span>
                  <span className={t.hidden ? 'hidden-title' : ''}>{t.id === selected && draft ? draft.title || 'Untitled task' : t.title || 'Untitled task'}</span>
                </button>
                {t.id === selected && (
                  <span className="task-move">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(t, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === tasks.length - 1} onClick={() => move(t, 1)}>
                      ↓
                    </button>
                  </span>
                )}
              </div>
            ))}
            <button type="button" className="btn dashed" onClick={newTask}>
              + New task
            </button>
          </nav>

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
            ) : preview ? (
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
                    results={previewChecked ? previewKey?.key : null}
                    hideAnswers={task.afterCheck === 'retry'}
                  />
                </div>
                <div className="frame-foot">
                  <span className="hint">Preview · answers here are not saved</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {previewChecked ? (
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
                  <TaskEditor key={editorKey} content={draft.content} onChange={(content) => change({ content })} />
                </div>
              </div>
            )}
          </main>

          {task && draft && (
            <aside className="task-side" aria-label="Task settings">
              <button className={'btn block' + (preview ? ' primary' : '')} onClick={() => (flush(), setPreview((p) => !p))}>
                {preview ? 'Back to editing' : 'Preview as learner'}
              </button>
              <h2>What learners see</h2>
              <label className="switch-row">
                <span>
                  Hidden
                  <span className="hint">Learners can’t see this task</span>
                </span>
                <input type="checkbox" checked={task.hidden} onChange={() => setTaskFlags(classId, itemId, task.id, { hidden: !task.hidden })} />
              </label>
              <label className="switch-row">
                <span>
                  Locked
                  <span className="hint">Learners see it but can’t answer</span>
                </span>
                <input type="checkbox" checked={task.locked} onChange={() => setTaskFlags(classId, itemId, task.id, { locked: !task.locked })} />
              </label>
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
              <button className="btn link small" style={{ alignSelf: 'flex-start', marginTop: 'auto' }} onClick={() => remove(task)}>
                Delete task
              </button>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
