import { NSelect } from './Select';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { allTeacherClasses } from '../lib/coteach';
import { copyTask, hasCollab, type CollabCopy } from '../lib/copy';
import { tasksCol } from '../lib/tasks';
import { theme } from '../lib/themes';
import type { ClassDoc } from '../lib/classes';
import { CollabChoice } from './CollabChoice';

type T = { id: string; title: string; instructions: string; kind?: string; content?: unknown; hidden?: boolean };
const TYPE: Record<string, string> = { lesson: 'Lesson', homework: 'Homework', exam: 'Exam', practice: 'Practice' };

// "+ From another lesson": copy tasks in from any lesson in any of your classes.
export function ImportTasksDialog({ classId, itemId, onClose, onDone }: { classId: string; itemId: string; onClose: () => void; onDone: (msg: string, firstId?: string) => void }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [fromClass, setFromClass] = useState(classId);
  const [lessons, setLessons] = useState<{ id: string; title: string; type: string }[]>([]);
  const [fromItem, setFromItem] = useState('');
  const [tasks, setTasks] = useState<T[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [collab, setCollab] = useState<CollabCopy>('copy');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user) return;
    allTeacherClasses(user.uid).then((all) => setClasses(all.filter((c) => c.status !== 'deleted').sort((a, b) => (a.id === classId ? -1 : b.id === classId ? 1 : a.name.localeCompare(b.name)))));
  }, [user, classId]);
  useEffect(() => {
    setLessons([]);
    setFromItem('');
    getDocs(collection(db, 'classes', fromClass, 'items'))
      .then((s) => {
        const list = s.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? 'Untitled'), type: String(d.data().type ?? 'lesson'), order: Number(d.data().order ?? 0) })).sort((a, b) => a.order - b.order);
        setLessons(list);
        setFromItem(list.find((l) => l.id !== itemId)?.id ?? list[0]?.id ?? '');
      })
      .catch(() => setErr('The lessons in that class could not be read.'));
  }, [fromClass, itemId]);
  useEffect(() => {
    setTasks(null);
    setPicked([]);
    if (!fromItem) return;
    getDocs(query(tasksCol(fromClass, fromItem), orderBy('order')))
      .then((s) => setTasks(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) })).filter((t) => t.kind !== 'section')))
      .catch(() => setTasks([]));
  }, [fromClass, fromItem]);

  const chosen = useMemo(() => (tasks ?? []).filter((t) => picked.includes(t.id)), [tasks, picked]);
  const withCollab = chosen.some((t) => hasCollab(t.content));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function go() {
    setErr('');
    let first = '';
    try {
      for (let i = 0; i < chosen.length; i++) {
        setBusy(`Copying ${i + 1} of ${chosen.length}…`);
        const id = await copyTask(fromClass, fromItem, chosen[i].id, classId, itemId, fromClass === classId && fromItem === itemId ? ' (copy)' : '', collab);
        first ||= id;
      }
      onDone(chosen.length === 1 ? `Copied “${chosen[0].title || 'Untitled task'}” in.` : `Copied ${chosen.length} tasks in.`, first);
      onClose();
    } catch (e) {
      console.error(e);
      setErr('The copy didn’t work. Please try again.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog it-dialog" role="dialog" aria-label="Copy tasks in" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Copy tasks in</h2>
        <span className="hint">From any lesson, homework or exam in your classes. Pictures, sounds and answer keys come with them.</span>
        <div className="it-pick">
          <label className="field">
            Class
            <NSelect value={fromClass} onChange={(e) => setFromClass(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.id === classId ? ' (this class)' : ''}
                </option>
              ))}
            </NSelect>
          </label>
          <label className="field">
            Lesson
            <NSelect value={fromItem} onChange={(e) => setFromItem(e.target.value)} disabled={!lessons.length}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {TYPE[l.type] ?? 'Lesson'} · {l.title}
                  {l.id === itemId && fromClass === classId ? ' (this lesson)' : ''}
                </option>
              ))}
            </NSelect>
          </label>
        </div>
        <div className="it-list" style={{ ['--accent' as string]: theme(classes.find((c) => c.id === fromClass)?.themeColor).accent }}>
          {tasks === null ? (
            <span className="hint">{lessons.length || !fromItem ? 'Reading the tasks…' : 'No lessons in this class.'}</span>
          ) : tasks.length === 0 ? (
            <span className="hint">This lesson has no tasks yet.</span>
          ) : (
            <>
              <label className="it-row it-all">
                <input type="checkbox" checked={picked.length === tasks.length} onChange={(e) => setPicked(e.target.checked ? tasks.map((t) => t.id) : [])} />
                <span>All {tasks.length} tasks</span>
              </label>
              {tasks.map((t, i) => (
                <label key={t.id} className={'it-row' + (picked.includes(t.id) ? ' on' : '')}>
                  <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                  <span className="it-n">{i + 1}</span>
                  <span className="it-t">
                    <b>{t.title || 'Untitled task'}</b>
                    {t.instructions && <span className="hint">{t.instructions}</span>}
                  </span>
                  {hasCollab(t.content) && <span className="ld-tag">Shared document</span>}
                  {t.hidden && <span className="ld-tag">Hidden</span>}
                </label>
              ))}
            </>
          )}
        </div>
        {withCollab && <CollabChoice value={collab} onChange={setCollab} />}
        {err && <span className="error">{err}</span>}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {busy && <span className="hint">{busy}</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!busy || !chosen.length} onClick={go}>
            {chosen.length > 1 ? `Copy ${chosen.length} tasks in` : 'Copy in'}
          </button>
        </span>
      </div>
    </div>
  );
}
