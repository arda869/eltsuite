import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newId, tasksCol, taskRef } from '../lib/tasks';
import { addTask } from '../lib/tasks';
import { addItem, type ClassDoc, type Item } from '../lib/classes';
import { Select } from '../components/Select';
import { allTeacherClasses } from '../lib/coteach';
import { lessonTaskBody } from '../lib/libtasks';
import { newSharedDoc, type SharedDoc } from '../lib/sharedDocs';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor } from '../editor/InstrEditor';
import { useAuth } from '../lib/auth';
import { ask, tell } from '../lib/ask';
import { theme } from '../lib/themes';

// A whole lesson kept in Files: sections and tasks, written here, then added to any class as a
// new lesson. Answers stay with the tasks.

export const LESSON_TYPES: { v: Item['type']; label: string; hint: string }[] = [
  { v: 'lesson', label: 'Lesson', hint: 'Taught in class' },
  { v: 'practice', label: 'Practice', hint: 'Learners work through it on their own' },
  { v: 'homework', label: 'Homework', hint: 'With a due date' },
  { v: 'exam', label: 'Exam', hint: 'Timed, with results released later' },
];
export type LessonRow = { id: string; order: number; kind: 'task' | 'section'; title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent };
const rowsCol = (id: string) => collection(db, 'sharedDocs', id, 'tasks');
const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export function useRows(id?: string) {
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      query(rowsCol(id), orderBy('order')),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LessonRow, 'id'>) }))),
      () => setRows([]),
    );
  }, [id]);
  return rows;
}

// A class lesson, copied into Files.
export async function saveLessonToFiles(owner: { uid: string; name: string }, classId: string, itemId: string, title: string) {
  const id = await newSharedDoc(owner, 'lesson', title);
  const s = await getDocs(query(tasksCol(classId, itemId), orderBy('order')));
  const b = writeBatch(db);
  let i = 0;
  for (const t of s.docs) {
    const d = t.data();
    const body = d.kind === 'section' ? null : await lessonTaskBody({ classId, itemId, taskId: t.id });
    b.set(doc(rowsCol(id), newId()), JSON.parse(JSON.stringify({ order: i++, kind: d.kind === 'section' ? 'section' : 'task', title: String(d.title ?? ''), instructions: String(d.instructions ?? ''), instrDoc: d.instrDoc ?? null, content: body?.content ?? EMPTY })));
  }
  await b.commit();
  return id;
}

async function addToClass(rows: LessonRow[], c: ClassDoc, title: string, type: Item['type'] = 'lesson') {
  const itemId = await addItem(c.id, null, title, Date.now(), type);
  let i = 0;
  for (const r of rows) {
    const taskId = await addTask(c.id, itemId, i++, r.kind, { title: r.title, instructions: r.instructions, content: r.content ?? EMPTY });
    if (r.instrDoc) await updateDoc(taskRef(c.id, itemId, taskId), { instrDoc: r.instrDoc });
  }
  return itemId;
}

// From anywhere a lesson file is listed (the company library, say): its tasks, then the class.
export function CopyToClass({ docId, title, type, onClose }: { docId: string; title: string; type?: Item['type']; onClose: () => void }) {
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  useEffect(() => void getDocs(query(rowsCol(docId), orderBy('order'))).then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LessonRow, 'id'>) })))).catch(() => setRows([])), [docId]);
  return rows ? <AddToClass rows={rows} title={title} type={type} onClose={onClose} /> : null;
}

function AddToClass({ rows, title, type, onClose }: { rows: LessonRow[]; title: string; type?: Item['type']; onClose: () => void }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => void (user && allTeacherClasses(user.uid).then((l) => setClasses(l.filter((c) => c.status === 'active')))), [user]);
  const go = async (c: ClassDoc) => {
    setBusy(c.id);
    try {
      const itemId = await addToClass(rows, c, title, type);
      window.open(`/class/${c.id}/lesson/${itemId}`, '_blank');
      onClose();
    } catch (e) {
      console.error(e);
      void tell('The lesson could not be added. Try again.');
      setBusy('');
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add to a class">
        <h2>Add “{title}” to a class</h2>
        <span className="hint">It becomes a new lesson at the end of the class, with all its tasks and answers. Changes there do not come back here.</span>
        <div className="lf-classes">
          {classes === null ? (
            <span className="hint">Opening your classes…</span>
          ) : classes.length ? (
            classes.map((c) => (
              <button key={c.id} type="button" className="lf-class" style={{ ['--cc' as string]: theme(c.themeColor).accent }} disabled={!!busy} onClick={() => void go(c)}>
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

export function LessonFile({ d, canEdit }: { d: SharedDoc; canEdit: boolean }) {
  const rows = useRows(d.id);
  const [sel, setSel] = useState('');
  const [adding, setAdding] = useState(false);
  const saveT = useRef<Record<string, number>>({});
  useEffect(() => {
    if (rows && !rows.some((r) => r.id === sel)) setSel(rows.find((r) => r.kind === 'task')?.id ?? rows[0]?.id ?? '');
  }, [rows, sel]);
  if (!rows) return <div className="dp-msg">Opening the lesson…</div>;
  const cur = rows.find((r) => r.id === sel);
  const patch = (id: string, p: Partial<LessonRow>, wait = 600) => {
    window.clearTimeout(saveT.current[id]);
    saveT.current[id] = window.setTimeout(() => void updateDoc(doc(rowsCol(d.id), id), JSON.parse(JSON.stringify(p))), wait);
  };
  const add = async (kind: 'task' | 'section') => {
    const id = newId();
    const at = cur ? cur.order + 0.5 : rows.length;
    await setDoc(doc(rowsCol(d.id), id), { order: at, kind, title: kind === 'section' ? 'New section' : 'New task', instructions: '', content: EMPTY });
    const b = writeBatch(db);
    [...rows, { id, order: at } as LessonRow].sort((a, b2) => a.order - b2.order).forEach((r, i) => b.update(doc(rowsCol(d.id), r.id), { order: i }));
    await b.commit();
    setSel(id);
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
  let n = 0;
  return (
    <div className="lf">
      <aside className="lf-side">
        <span className="pd-k">The lesson</span>
        <nav className="lf-list" aria-label="Tasks">
          {rows.map((r) => (
            <button key={r.id} type="button" className={'lf-row k-' + r.kind + (r.id === sel ? ' on' : '')} onClick={() => setSel(r.id)}>
              {r.kind === 'task' && <span className="lf-n">{++n}</span>}
              <span className="lf-t">{r.title || (r.kind === 'section' ? 'Section' : 'Task')}</span>
            </button>
          ))}
          {!rows.length && <span className="hint">No tasks yet.</span>}
        </nav>
        {canEdit && (
          <span className="lf-adds">
            <button type="button" className="btn small-btn" onClick={() => void add('task')}>
              + Task
            </button>
            <button type="button" className="btn small-btn" onClick={() => void add('section')}>
              + Section
            </button>
          </span>
        )}
        {canEdit ? (
          <Select value={d.ltype ?? 'lesson'} options={LESSON_TYPES} onChange={(v) => void updateDoc(doc(db, 'sharedDocs', d.id), { ltype: v })} label="What it becomes in a class" />
        ) : (
          <span className="hint">{LESSON_TYPES.find((t) => t.v === (d.ltype ?? 'lesson'))?.label}</span>
        )}
        <button type="button" className="btn primary" disabled={!rows.length} onClick={() => setAdding(true)}>
          Add to a class…
        </button>
      </aside>
      <main className="lf-main">
        {cur ? (
          <div className="lf-task" key={cur.id}>
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
                {canEdit ? <InstrEditor doc={cur.instrDoc ?? null} text={cur.instructions} onChange={(docJ, text) => patch(cur.id, { instrDoc: docJ, instructions: text })} /> : <p className="task-instr">{cur.instructions}</p>}
                <div className="lf-body">
                  <TaskEditor content={cur.content ?? EMPTY} onChange={(c) => patch(cur.id, { content: c }, 900)} classId={'user:' + d.owner} />
                </div>
              </>
            )}
            {cur.kind === 'section' && <span className="hint">A section groups the tasks under it, as in a class lesson.</span>}
          </div>
        ) : (
          <div className="ma-empty">
            <strong>Start the lesson</strong>
            <span className="hint">Add tasks and sections. Everything you can put in a class lesson works here.</span>
          </div>
        )}
      </main>
      {adding && <AddToClass rows={rows} title={d.title} type={d.ltype} onClose={() => setAdding(false)} />}
    </div>
  );
}
