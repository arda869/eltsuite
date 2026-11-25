import { Fragment, useEffect, useRef, useState } from 'react';
import { TaskInsert } from '../components/TaskInsert';
import { PresenterNotes, usePresenterNotes } from '../components/PresenterNotes';
import { NotesEditor, NotesView } from '../editor/NotesEditor';
import { OPEN_TASK_FROM_COMMENT, setCommentTask } from '../components/FileComments';
import { createPortal } from 'react-dom';
import type { JSONContent } from '@tiptap/react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newId, tasksCol, taskRef } from '../lib/tasks';
import { addTask } from '../lib/tasks';
import { addItem, type ClassDoc, type Item } from '../lib/classes';
import { allTeacherClasses } from '../lib/coteach';
import { lessonTaskBody } from '../lib/libtasks';
import { newSharedDoc, type SharedDoc } from '../lib/sharedDocs';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor, InstrView } from '../editor/InstrEditor';
import { TaskRenderer } from '../components/TaskRenderer';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey } from '../lib/questions';
import type { Responses } from '../lib/questions';
import { PaperBar, SheetView, type Paper, type Zoom } from './SheetView';
import { useSheet } from './useSheet';
import { useAuth } from '../lib/auth';
import { ask, tell } from '../lib/ask';
import { theme } from '../lib/themes';
import { useNavigate } from 'react-router-dom';
import { lessonLiveApi } from '../resourceHub/lessonLiveApi';
import { openMenuAt } from '../components/ContextMenu';
import { FileLessonAi } from './FileLessonAi';
import { IdentityDialog, IdentityMark, RefsContext } from '../components/Identity';
import { lessonIdentities, refTargets, type ActivityIdentity } from '../lib/identity';

// A whole lesson kept in Files: sections and tasks, written here, then added to any class as a
// new lesson. Answers stay with the tasks.

// A small QR mark for "Invite learners".
export const QrGlyph = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }}><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 20.5h2M20.5 14v2" /></svg>;

export const LESSON_TYPES: { v: Item['type']; label: string; hint: string }[] = [
  { v: 'lesson', label: 'Lesson', hint: 'Taught in class' },
  { v: 'practice', label: 'Practice', hint: 'Learners work through it on their own' },
  { v: 'homework', label: 'Homework', hint: 'With a due date' },
  { v: 'exam', label: 'Exam', hint: 'Timed, with results released later' },
];
export type LessonRow = { id: string; order: number; kind: 'task' | 'section'; title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent; print?: Paper | null; teacherNotes?: string; teacherNotesDoc?: JSONContent | null; anchor?: string; identity?: ActivityIdentity | null };
const rowsCol = (id: string) => collection(db, 'sharedDocs', id, 'tasks');
const notesCol = (id: string) => collection(db, 'sharedDocs', id, 'taskNotes');
const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export function useRows(id?: string) {
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  useEffect(() => {
    if (!id) return;
    let taskRows: LessonRow[] = [], notes: Record<string, string> = {}, noteDocs: Record<string, JSONContent | null> = {};
    const publish = () => setRows(taskRows.map(row => ({ ...row, teacherNotes: notes[row.id] ?? '', teacherNotesDoc: noteDocs[row.id] ?? null })));
    const stopRows = onSnapshot(
      query(rowsCol(id), orderBy('order')),
      (s) => { taskRows = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LessonRow, 'id'>) })); publish(); },
      () => setRows([]),
    );
    const stopNotes = onSnapshot(notesCol(id), snapshot => {
      notes = Object.fromEntries(snapshot.docs.map(entry => [entry.id, String(entry.get('text') ?? '')]));
      noteDocs = Object.fromEntries(snapshot.docs.map(entry => [entry.id, (entry.get('doc') as JSONContent | undefined) ?? null]));
      publish();
    }, () => { notes = {}; publish(); });
    return () => { stopRows(); stopNotes(); };
  }, [id]);
  return rows;
}

// A class lesson, copied into Files.
export async function saveLessonToFiles(owner: { uid: string; name: string }, classId: string, itemId: string, title: string) {
  const id = await newSharedDoc(owner, 'lesson', title, '', { originClassId: classId, originItemId: itemId });
  const s = await getDocs(query(tasksCol(classId, itemId), orderBy('order')));
  const b = writeBatch(db);
  let i = 0;
  for (const t of s.docs) {
    const d = t.data();
    const body = d.kind === 'section' ? null : await lessonTaskBody({ classId, itemId, taskId: t.id });
    b.set(doc(rowsCol(id), newId()), JSON.parse(JSON.stringify({ order: i++, kind: d.kind === 'section' ? 'section' : 'task', anchor: d.anchor || t.id, ...(d.identity ? { identity: d.identity } : {}), title: String(d.title ?? ''), instructions: String(d.instructions ?? ''), instrDoc: d.instrDoc ?? null, print: d.print ?? null, content: body?.content ?? EMPTY })));
  }
  await b.commit();
  return id;
}

async function addToClass(rows: LessonRow[], c: ClassDoc, title: string, type: Item['type'] = 'lesson') {
  const itemId = await addItem(c.id, null, title, Date.now(), type);
  let i = 0;
  for (const r of rows) {
    const taskId = await addTask(c.id, itemId, i++, r.kind, { title: r.title, instructions: r.instructions, content: r.content ?? EMPTY });
    // The row's anchor goes with it, so references between its tasks still find them in the class.
    await updateDoc(taskRef(c.id, itemId, taskId), JSON.parse(JSON.stringify({ anchor: r.anchor || r.id, ...(r.identity ? { identity: r.identity } : {}), ...(r.instrDoc ? { instrDoc: r.instrDoc } : {}), ...(r.print ? { print: r.print } : {}) })));
    if (r.teacherNotes) await setDoc(doc(taskRef(c.id, itemId, taskId), 'private', 'notes'), { text: r.teacherNotes });
  }
  return itemId;
}

// From anywhere a lesson file is listed (the organisation library, say): its tasks, then the class.
export function CopyToClass({ docId, title, type, onClose }: { docId: string; title: string; type?: Item['type']; onClose: () => void }) {
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  useEffect(() => { void Promise.all([getDocs(query(rowsCol(docId), orderBy('order'))), getDocs(notesCol(docId)).catch(() => null)]).then(([tasks, notes]) => {
    const noteMap = Object.fromEntries(notes?.docs.map(entry => [entry.id, String(entry.get('text') ?? '')]) ?? []);
    setRows(tasks.docs.map(entry => ({ id: entry.id, ...(entry.data() as Omit<LessonRow, 'id'>), teacherNotes: noteMap[entry.id] ?? '' })));
  }).catch(() => setRows([])); }, [docId]);
  return rows ? <AddToClass rows={rows} title={title} type={type} onClose={onClose} /> : null;
}

function AddToClass({ rows, title, type, onClose }: { rows: LessonRow[]; title: string; type?: Item['type']; onClose: () => void }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState<string[]>(() => rows.map(row => row.id));
  const chosen = rows.filter(row => selected.includes(row.id));
  const taskCount = chosen.filter(row => row.kind === 'task').length;
  useEffect(() => void (user && allTeacherClasses(user.uid).then((l) => setClasses(l.filter((c) => c.status === 'active')))), [user]);
  const go = async (c: ClassDoc) => {
    if (!taskCount) return;
    setBusy(c.id);
    try {
      const itemId = await addToClass(chosen, c, title, type);
      window.open(`/class/${c.id}/lesson/${itemId}`, '_blank');
      onClose();
    } catch (e) {
      console.error(e);
      void tell('We couldn’t add the lesson. Try again.');
      setBusy('');
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add to a class">
        <h2>Add “{title}” to a class</h2>
        <span className="hint">Choose the tasks to copy. They become a new lesson in the class, with their answers. The original stays here.</span>
        <fieldset className="lf-copy-tasks"><legend>Tasks to copy</legend><div className="lf-copy-all"><button type="button" className="btn link small" onClick={() => setSelected(rows.map(row => row.id))}>Select all</button><button type="button" className="btn link small" onClick={() => setSelected([])}>Clear</button></div>{rows.map((row, index) => <label key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /><span>{row.kind === 'section' ? 'Section' : `Task ${rows.slice(0, index + 1).filter(item => item.kind === 'task').length}`}</span><strong>{row.title || (row.kind === 'section' ? 'Untitled section' : 'Untitled task')}</strong></label>)}</fieldset>
        {!taskCount && <p className="lf-copy-error" role="alert">Select at least one task to copy.</p>}
        <div className="lf-classes">
          {classes === null ? (
            <span className="hint">Opening your classes…</span>
          ) : classes.length ? (
            classes.map((c) => (
              <button key={c.id} type="button" className="lf-class" style={{ ['--cc' as string]: theme(c.themeColor).accent }} disabled={!!busy || !taskCount} onClick={() => void go(c)}>
                <i />
                <b>{c.name}</b>
                <span className="hint">{busy === c.id ? 'Adding…' : c.level}</span>
              </button>
            ))
          ) : (
            <span className="hint">You have no classes yet.</span>
          )}
        </div>
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function LessonFile({ d, canEdit, headerSlot }: { d: SharedDoc; canEdit: boolean; headerSlot?: HTMLElement | null }) {
  const navigate = useNavigate();
  const rows = useRows(d.id);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [idOpen, setIdOpen] = useState(false);
  const fileOrigin = d as SharedDoc & { originClassId?: string; sourceClassId?: string; classId?: string };
  const standaloneLive = canEdit && d.standaloneLesson === true && !fileOrigin.originClassId && !fileOrigin.sourceClassId && !fileOrigin.classId;
  const startLive = async () => {
    setLiveBusy(true); setLiveError('');
    try { const result = await lessonLiveApi<{ runId: string; code: string }>('start', { fileId: d.id }); navigate(`/resource-hub/lesson/live/${encodeURIComponent(result.runId)}`); }
    catch (cause) { setLiveError((cause as Error).message); setLiveBusy(false); }
  };
  const [sel, setSel] = useState('');
  // Worksheet view: the lesson as A4 pages, as in a class lesson. Remembered on this device.
  const [sheet, setSheetState] = useState(() => {
    try {
      return localStorage.getItem('ll.sheetView') === '1';
    } catch {
      return false;
    }
  });
  const sheetData = useSheet(d.title, rows ?? [], { classId: 'user:' + d.owner, accent: '#d98f63' }, sheet);
  const [zoom, setZoomState] = useState<Zoom>(() => {
    try {
      return localStorage.getItem('ll.sheetZoom') === 'page' ? 'page' : 'width';
    } catch {
      return 'width';
    }
  });
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem('ll.sheetZoom', z);
    } catch {
      /* fine */
    }
  };
  const setSheet = (on: boolean) => {
    setSheetState(on);
    try {
      localStorage.setItem('ll.sheetView', on ? '1' : '');
    } catch {
      /* fine */
    }
  };
  const [adding, setAdding] = useState(false);
  const [learnerPreview, setLearnerPreview] = useState(false);
  const [previewResponses, setPreviewResponses] = useState<Responses>({});
  const chooseView = (next: 'digital' | 'paper' | 'learner') => {
    setLearnerPreview(next === 'learner');
    if (next === 'learner') setPreviewResponses({});
    else setSheet(next === 'paper');
  };
  const saveT = useRef<Record<string, number>>({});
  const pendingChanges = useRef<Record<string, Partial<LessonRow>>>({});
  const activeWrites = useRef<Promise<unknown>[]>([]);
  const [insertAt, setInsertAt] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const notesPane = usePresenterNotes('ll.lessonFileNotesPane', 125);
  const [notesEditing, setNotesEditing] = useState(false);
  useEffect(() => setNotesEditing(false), [sel]);
  useEffect(() => {
    if (!notesEditing) return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>('.lf-notes .ProseMirror')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [notesEditing]);
  // Comments can be about the task being edited, and a comment opens its task again.
  const curRow = rows?.find((r) => r.id === sel);
  useEffect(() => { setCommentTask(curRow?.kind === 'task' ? { id: curRow.id, title: curRow.title } : null); }, [curRow?.id, curRow?.title, curRow?.kind]);
  useEffect(() => () => setCommentTask(null), []);
  useEffect(() => { const f = (e: Event) => setSel((e as CustomEvent<string>).detail); window.addEventListener(OPEN_TASK_FROM_COMMENT, f); return () => window.removeEventListener(OPEN_TASK_FROM_COMMENT, f); }, []);
  useEffect(() => {
    if (rows && !rows.some((r) => r.id === sel)) setSel(rows.find((r) => r.kind === 'task')?.id ?? rows[0]?.id ?? '');
  }, [rows, sel]);
  if (!rows) return <div className="dp-msg">Opening the lesson…</div>;
  const cur = rows.find((r) => r.id === sel);
  const savePending = (id: string) => {
    window.clearTimeout(saveT.current[id]);
    const changed = pendingChanges.current[id];
    delete pendingChanges.current[id];
    if (!changed) return Promise.resolve();
    const { teacherNotes, teacherNotesDoc, ...taskChanges } = changed;
    const writing = Promise.all([
      ...(Object.keys(taskChanges).length ? [updateDoc(doc(rowsCol(d.id), id), JSON.parse(JSON.stringify(taskChanges)))] : []),
      ...(teacherNotes !== undefined ? [setDoc(doc(notesCol(d.id), id), JSON.parse(JSON.stringify({ text: teacherNotes, ...(teacherNotesDoc ? { doc: teacherNotesDoc } : {}) })))] : []),
    ]);
    activeWrites.current.push(writing);
    void writing.finally(() => { activeWrites.current = activeWrites.current.filter(write => write !== writing); }).catch(() => {});
    return writing;
  };
  const flushPending = async () => {
    const previous = [...activeWrites.current];
    await Promise.all([...previous, ...Object.keys(pendingChanges.current).map(savePending)]);
  };
  const patch = (id: string, p: Partial<LessonRow>, wait = 600) => {
    pendingChanges.current[id] = { ...pendingChanges.current[id], ...p };
    window.clearTimeout(saveT.current[id]);
    saveT.current[id] = window.setTimeout(() => void savePending(id).catch(() => {}), wait);
  };
  const add = async (kind: 'task' | 'section', before?: LessonRow | null) => {
    const id = newId();
    const at = before === null ? rows.length : before ? before.order - 0.5 : cur ? cur.order + 0.5 : rows.length;
    await setDoc(doc(rowsCol(d.id), id), { order: at, kind, title: kind === 'section' ? 'New section' : 'New task', instructions: '', content: EMPTY });
    const b = writeBatch(db);
    [...rows, { id, order: at } as LessonRow].sort((a, b2) => a.order - b2.order).forEach((r, i) => b.update(doc(rowsCol(d.id), r.id), { order: i }));
    await b.commit();
    setSel(id);
  };
  const reorder = async (id: string, to: number) => {
    const list = rows.filter((r) => r.id !== id);
    const it = rows.find((r) => r.id === id);
    if (!it) return;
    const from = rows.findIndex((r) => r.id === id);
    list.splice(to > from ? to - 1 : to, 0, it);
    const b = writeBatch(db);
    list.forEach((r, k) => b.update(doc(rowsCol(d.id), r.id), { order: k }));
    await b.commit();
  };
  const move = async (id: string, by: number) => {
    const list = [...rows];
    const i = list.findIndex((r) => r.id === id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const b = writeBatch(db);
    list.forEach((r, k) => b.update(doc(rowsCol(d.id), r.id), { order: k }));
    await b.commit();
  };
  const taskBlock = cur ? (
          <div className="lf-task" key={cur.id}>
            {cur.kind === 'task' && (cur.identity || canEdit) && (
              <div className="aid-row">
                {cur.identity ? <IdentityMark identity={cur.identity} onClick={canEdit ? () => setIdOpen(true) : undefined} /> : <button type="button" className="aid-add" onClick={() => setIdOpen(true)}><span aria-hidden="true">+</span> Activity type</button>}
              </div>
            )}
            <div className="lf-head">
              <input className="lf-title" defaultValue={cur.title} disabled={!canEdit} onChange={(e) => patch(cur.id, { title: e.target.value })} aria-label="Title" />
              {canEdit && (
                <span className="lf-acts">
                  <button type="button" className="icon-btn" aria-label="Move up" onClick={() => void move(cur.id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" aria-label="Move down" onClick={() => void move(cur.id, 1)}>
                    ↓
                  </button>
                  <button type="button" className="btn link small" onClick={() => void ask(`Delete “${cur.title}”?`).then((ok) => ok && void deleteDoc(doc(rowsCol(d.id), cur.id)))}>
                    Delete
                  </button>
                </span>
              )}
            </div>
            {cur.kind === 'task' && (
              <>
                {canEdit ? <InstrEditor classId={'user:' + d.owner} doc={cur.instrDoc ?? null} text={cur.instructions} onChange={(docJ, text) => patch(cur.id, { instrDoc: docJ, instructions: text })} /> : <InstrView classId={'user:' + d.owner} doc={cur.instrDoc ?? null} text={cur.instructions} />}
                <div className="lf-body">
                  {canEdit ? <TaskEditor content={cur.content ?? EMPTY} onChange={(c) => patch(cur.id, { content: c }, 900)} classId={'user:' + d.owner} /> : <TaskRenderer content={splitKey(cur.content ?? EMPTY, true).content} responses={{}} disabled classId={'user:' + d.owner} />}
                </div>
              </>
            )}
            {cur.kind === 'section' && <span className="hint">A section groups the tasks under it, as in a class lesson.</span>}
          </div>
  ) : null;
  let n = 0;
  const refsValue = { targets: refTargets(rows.map(r => ({ ...r, anchor: r.anchor || r.id }))), versions: [], here: cur ? cur.anchor || cur.id : undefined, strict: canEdit };
  return (
    <>
    {headerSlot && createPortal(<div className="lf-header-controls">
      <span className="lf-header-view" role="radiogroup" aria-label="Lesson view">
        <button type="button" role="radio" aria-checked={!learnerPreview && !sheet} className={!learnerPreview && !sheet ? 'on' : ''} onClick={() => chooseView('digital')}>Digital</button>
        <button type="button" role="radio" aria-checked={!learnerPreview && sheet} className={!learnerPreview && sheet ? 'on' : ''} onClick={() => chooseView('paper')}>Paper</button>
        <button type="button" role="radio" aria-checked={learnerPreview} className={learnerPreview ? 'on' : ''} onClick={() => chooseView('learner')}>Learner <span className="lf-preview-word">preview</span></button>
      </span>
      {canEdit && <FileLessonAi fileId={d.id} selectedTaskId={cur?.kind === 'task' ? cur.id : undefined} beforeOpen={flushPending} onApplied={id => { if (id && id !== 'lesson') setSel(id); }} />}
      {/* Everything about the lesson as a whole: what it becomes in a class, adding it to one, teaching it live and its history. */}
      <button type="button" className="btn small-btn lf-lesson-menu" aria-haspopup="menu" onClick={event => openMenuAt(event.currentTarget, [
        ...(standaloneLive ? [{ label: liveBusy ? 'Starting…' : 'Invite learners', icon: 'groups', hint: 'live, with a code or QR code', disabled: liveBusy || !rows.some(row => row.kind === 'task'), onClick: () => void startLive() }, { label: 'Teaching history', icon: 'history', onClick: () => navigate(`/lesson-file/${encodeURIComponent(d.id)}/history`) }, 'sep' as const] : []),
        { label: 'Add to a class…', icon: 'classes', disabled: !rows.length, onClick: () => setAdding(true) },
        'sep' as const,
        ...LESSON_TYPES.map(t => ({ label: `${(d.ltype ?? 'lesson') === t.v ? '✓ ' : ''}In a class, it becomes ${t.label.toLowerCase()}`, icon: 'task', disabled: !canEdit, onClick: () => void updateDoc(doc(db, 'sharedDocs', d.id), { ltype: t.v }) })),
      ])}>Lesson <span aria-hidden="true">▾</span></button>
    </div>, headerSlot)}
    <RefsContext.Provider value={refsValue}>
    <div className="lf">
      <aside className="lf-side task-list">
        <span className="pd-k">The lesson</span>
        <nav className="lf-list" aria-label="Tasks">
          {/* As in a class lesson: hover between tasks to add one there, drag a task to move it. */}
          {rows.map((r, i) => (
            <Fragment key={r.id}>
              {canEdit && <TaskInsert label={'Insert before ' + (r.title || 'this task')} ai={false} open={insertAt === r.id} onOpenChange={o => setInsertAt(o ? r.id : null)} onChoose={k => { setInsertAt(null); if (k === 'section') void add('section', r); else if (k === 'blank') void add('task', r); }} />}
              <div className={'task-row lf-row k-' + r.kind + (r.id === sel ? ' on' : '') + (dragId === r.id ? ' dragging' : '') + (dropAt === i ? ' drop-before' : '') + (dropAt === rows.length && i === rows.length - 1 ? ' drop-after' : '')}
                draggable={canEdit}
                onDragStart={e => { setDragId(r.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                onDragOver={e => { if (!dragId) return; e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientY < b.top + b.height / 2 ? i : i + 1); }}
                onDrop={e => { e.preventDefault(); if (dragId && dropAt !== null) void reorder(dragId, dropAt); setDragId(null); setDropAt(null); }}
                onDragEnd={() => { setDragId(null); setDropAt(null); }}>
                {canEdit && <span className="drag-handle" aria-hidden="true" title="Drag to move">⋮⋮</span>}
                <button type="button" className="task-pick" onClick={() => setSel(r.id)}>
                  {r.kind === 'task' && <span className="n">{++n}</span>}
                  <span className={r.kind === 'section' ? 'section-row' : ''}>{r.title || (r.kind === 'section' ? 'Section' : 'Task')}</span>
                </button>
              </div>
            </Fragment>
          ))}
          {canEdit && <TaskInsert label="Add at the end" ai={false} open={insertAt === 'end'} onOpenChange={o => setInsertAt(o ? 'end' : null)} onChoose={k => { setInsertAt(null); if (k === 'section') void add('section', null); else if (k === 'blank') void add('task', null); }} />}
          {!rows.length && <span className="hint">No tasks yet. Use + to add the first one.</span>}
        </nav>
      </aside>
      <main className="lf-main">
        {liveError && <p role="alert" className="rll-error">{liveError}</p>}
        {learnerPreview ? <div className="lf-learner-preview"><header><span>LEARNER PREVIEW</span><h2>{d.title}</h2></header>{cur?.kind === 'task' ? <section key={cur.id}>{cur.identity && <div className="aid-row"><IdentityMark identity={cur.identity} /></div>}<h3>{cur.title}</h3><InstrView classId={'user:' + d.owner} doc={cur.instrDoc ?? null} text={cur.instructions} /><LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey(cur.content ?? EMPTY, true).content} responses={previewResponses} onChange={(id, value) => setPreviewResponses(current => ({ ...current, [id]: value }))} classId={'user:' + d.owner} /></LocalActivityMode.Provider></section> : cur ? <section><h3>{cur.title}</h3></section> : <p>Add a task to preview the lesson.</p>}</div> : <>
        {sheet && rows.length && sheetData ? (
          <div className="sh-split lf-split">
            <section className="sh-left" aria-label="The worksheet">
              <div className="sh-left-bar">
                <span className="sh-switch" role="radiogroup" aria-label="Size of the page">
                  <button type="button" role="radio" aria-checked={zoom === 'width'} className={zoom === 'width' ? 'on' : ''} onClick={() => setZoom('width')}>
                    Fit width
                  </button>
                  <button type="button" role="radio" aria-checked={zoom === 'page'} className={zoom === 'page' ? 'on' : ''} onClick={() => setZoom('page')}>
                    Whole page
                  </button>
                </span>
                <span className="hint">Click a task to edit it</span>
              </div>
              <SheetView
                parts={sheetData.parts}
                zoom={zoom}
                focus={sel}
                blocks={rows.map((r) => {
                  const p = sheetData.byId[r.id];
                  return { id: r.id, on: r.id === sel && r.kind === 'task', html: p?.html ?? '', heading: r.kind === 'section', onClick: r.kind === 'section' ? undefined : () => setSel(r.id), label: `Edit ${r.title}` };
                })}
                after={
                  canEdit ? (
                    <button type="button" className="sh-add" onClick={() => void add('task')}>
                      + Add a task
                    </button>
                  ) : undefined
                }
              />
            </section>
            <span className="sh-divider" aria-hidden="true" />
            <section className="sh-right lf-right" aria-label="Edit the task">
              {cur && cur.kind === 'task' && canEdit && (
                <PaperBar
                  key={cur.id}
                  look={cur.print ?? {}}
                  onChange={(print) => patch(cur.id, { print }, 0)}
                  gaps={JSON.stringify(cur.content).includes('"type":"gap"') || JSON.stringify(cur.content).includes('"type":"dropgap"')}
                  writing={JSON.stringify(cur.content).includes('"type":"writing"')}
                  online={sheetData.byId[cur.id]?.online ?? []}
                />
              )}
              {taskBlock}
            </section>
          </div>
        ) : cur ? (
          taskBlock
        ) : (
          <div className="ma-empty">
            <strong>Start the lesson</strong>
            <span className="hint">Add tasks and sections. Everything you can put in a class lesson works here.</span>
          </div>
        )}</>}
      </main>
      {cur?.kind === 'task' && !learnerPreview && (canEdit || cur.teacherNotes) && (
        <div className="lf-notes">
          <PresenterNotes pane={notesPane} hasNotes={!!cur.teacherNotes?.trim()}>
            {canEdit && notesEditing ? (
              <div className="pn-editing">
                <NotesEditor key={cur.id} className="pn-editor" doc={cur.teacherNotesDoc ?? null} text={cur.teacherNotes ?? ''} onChange={(docJ, text) => patch(cur.id, { teacherNotes: text, teacherNotesDoc: docJ }, 700)} placeholder="Click to add notes" />
                <button type="button" className="btn small-btn" onClick={() => setNotesEditing(false)}>Done</button>
              </div>
            ) : canEdit ? (
              <div className="pn-read" role="button" tabIndex={0} onClick={() => setNotesEditing(true)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setNotesEditing(true); } }} aria-label="Edit teacher notes">
                {cur.teacherNotes?.trim() ? <NotesView doc={cur.teacherNotesDoc ?? null} text={cur.teacherNotes} /> : <span className="pn-empty">Click to add notes</span>}
              </div>
            ) : <NotesView doc={cur.teacherNotesDoc ?? null} text={cur.teacherNotes ?? ''} />}
          </PresenterNotes>
        </div>
      )}
      {adding && <AddToClass rows={rows} title={d.title} type={d.ltype} onClose={() => setAdding(false)} />}
      {idOpen && cur && <IdentityDialog value={cur.identity} used={lessonIdentities(rows)} onSave={(v, scope) => { const was = cur.identity; for (const r of rows) if (r.id === cur.id || (scope === 'all' && was && v && r.identity?.id === was.id)) patch(r.id, { identity: v }, 0); setIdOpen(false); }} onClose={() => setIdOpen(false)} />}
    </div>
    </RefsContext.Provider>
    </>
  );
}
