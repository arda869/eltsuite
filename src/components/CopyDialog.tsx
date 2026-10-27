import { NSelect } from './Select';
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { allTeacherClasses, canEdit } from '../lib/coteach';
import { copyLesson, copyTask, hasCollab, type CollabCopy } from '../lib/copy';
import { tasksCol } from '../lib/tasks';
import { CollabChoice } from './CollabChoice';

type Opt = { id: string; name: string };

// "Copy to…": a lesson to a class, or a task to a lesson in any of the teacher's classes.
export function CopyDialog({ kind, fromClass, itemId, taskId, title, onClose, onDone }: { kind: 'lesson' | 'task'; fromClass: string; itemId: string; taskId?: string; title: string; onClose: () => void; onDone?: (msg: string) => void }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [toClass, setToClass] = useState(fromClass);
  const [lessons, setLessons] = useState<Opt[]>([]);
  const [toItem, setToItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [collab, setCollab] = useState<CollabCopy>('copy');
  const [hasDocs, setHasDocs] = useState(false);
  // Does it have shared documents or slides? Then ask what the copy should open.
  useEffect(() => {
    if (kind === 'task' && taskId) getDoc(doc(tasksCol(fromClass, itemId), taskId)).then((s) => setHasDocs(hasCollab(s.data()?.content)), () => {});
    else getDocs(tasksCol(fromClass, itemId)).then((s) => setHasDocs(s.docs.some((d) => hasCollab(d.data().content))), () => {});
  }, [kind, fromClass, itemId, taskId]);

  useEffect(() => {
    if (!user) return;
    allTeacherClasses(user.uid).then((all) => setClasses(all.filter((c) => c.status !== 'deleted' && canEdit(c, user.uid)).map((c) => ({ id: c.id, name: c.name }))));
  }, [user]);
  useEffect(() => {
    if (kind !== 'task' || !toClass) return;
    getDocs(collection(db, 'classes', toClass, 'items')).then((s) => {
      const list = s.docs.map((d) => ({ id: d.id, name: d.data().title as string, order: d.data().order as number })).sort((a, b) => a.order - b.order);
      setLessons(list);
      setToItem((cur) => (list.some((l) => l.id === cur) ? cur : list[0]?.id ?? ''));
    });
  }, [kind, toClass]);

  async function go() {
    setBusy(true);
    setErr('');
    try {
      if (kind === 'lesson') {
        await copyLesson(fromClass, itemId, toClass, { title: toClass === fromClass ? `${title} (copy)` : title, collab: hasDocs ? collab : 'same' });
        onDone?.(`Copied to ${classes.find((c) => c.id === toClass)?.name ?? 'the class'}. The copy is hidden until you show it.`);
      } else if (taskId && toItem) {
        await copyTask(fromClass, itemId, taskId, toClass, toItem, toClass === fromClass && toItem === itemId ? ' (copy)' : '', hasDocs ? collab : 'same');
        onDone?.(`Copied to “${lessons.find((l) => l.id === toItem)?.name ?? 'the lesson'}”.`);
      }
      onClose();
    } catch (e) {
      console.error(e);
      setErr('The copy didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Copy to" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Copy “{title}”</h2>
        <label className="field">
          To class
          <NSelect value={toClass} onChange={(e) => setToClass(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === fromClass ? ' (this class)' : ''}
              </option>
            ))}
          </NSelect>
        </label>
        {kind === 'task' && (
          <label className="field">
            To lesson
            <NSelect value={toItem} onChange={(e) => setToItem(e.target.value)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.id === itemId ? ' (this lesson)' : ''}
                </option>
              ))}
            </NSelect>
          </label>
        )}
        {hasDocs && <CollabChoice value={collab} onChange={setCollab} />}
        {err && <span className="error">{err}</span>}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || (kind === 'task' && !toItem)} onClick={go}>
            {busy ? 'Copying…' : 'Copy'}
          </button>
        </span>
      </div>
    </div>
  );
}
