import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { allTeacherClasses } from '../lib/coteach';
import { addTask, saveNotes, tasksCol } from '../lib/tasks';
import { updateItem, type ClassDoc, type Item } from '../lib/classes';
import { createLessonFromImport } from '../lib/transfer';
import { Select } from '../components/Select';
import type { HubActivity } from './catalog';
import { copyParts, publishedTasks, resourceTasks } from './resourceTasks';

type ClassLesson = Pick<Item, 'id' | 'title' | 'type' | 'hidden' | 'taskCount'>;

export function ResourceCopy({ activity, onClose, preferredClassId }: { activity: HubActivity; onClose: () => void; preferredClassId?: string }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [classId, setClassId] = useState('');
  const [showClassPicker, setShowClassPicker] = useState(!preferredClassId);
  const [lessons, setLessons] = useState<ClassLesson[] | null>(null);
  const [destination, setDestination] = useState('new');
  const [newTitle, setNewTitle] = useState(activity.title);
  const availableParts = activity.editorSections?.length ? activity.editorSections.filter(section => section.audience === 'learner').map(section => ({ id: section.id, title: section.title, detail: section.instructions || 'Editable learner section' })) : [...copyParts];
  const [parts, setParts] = useState<Set<string>>(() => new Set(availableParts.map(part => part.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ classId: string; itemId: string; title: string } | null>(null);
  const selectedClass = classes?.find(c => c.id === classId);
  const compactClass = !!preferredClassId && !!selectedClass && !showClassPicker;

  useEffect(() => {
    if (!user) return;
    let active = true;
    allTeacherClasses(user.uid)
      .then(rows => { if (active) { const available = rows.filter(c => c.status === 'active'); setClasses(available); if (preferredClassId && available.some(c => c.id === preferredClassId)) setClassId(current => current || preferredClassId); else setShowClassPicker(true); } })
      .catch(() => { if (active) { setClasses([]); setError('We couldn’t load your classes. Check your connection and try again.'); } });
    return () => { active = false; };
  }, [user, preferredClassId]);

  useEffect(() => {
    if (!classId) { setLessons([]); return; }
    let active = true;
    setLessons(null);
    getDocs(collection(db, 'classes', classId, 'items'))
      .then(snapshot => { if (active) setLessons(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClassLesson)).filter(item => item.type === 'lesson')); })
      .catch(() => { if (active) { setLessons([]); setError('We couldn’t load this class’s lessons. Try again.'); } });
    return () => { active = false; };
  }, [classId]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);

  const selectedCount = parts.size;
  const destinationOptions = useMemo(() => [
    { v: 'new', label: 'Create a new lesson', hint: 'A separate editable copy in this class' },
    ...(lessons ?? []).map(lesson => ({ v: lesson.id, label: lesson.title, hint: 'Add tasks to this existing lesson' })),
  ], [lessons]);

  const copy = async () => {
    if (!selectedClass || !selectedCount || busy) return;
    if (destination === 'new' && !newTitle.trim()) { setError('Enter a name for the new lesson.'); return; }
    setBusy(true); setError('');
    try {
      const chosen = activity.editorSections?.length ? publishedTasks(activity, parts) : resourceTasks(parts);
      let itemId = destination;
      let title = lessons?.find(lesson => lesson.id === destination)?.title ?? newTitle.trim();
      if (destination === 'new') {
        itemId = await createLessonFromImport(selectedClass.id, null, title, chosen);
        await updateItem(selectedClass.id, itemId, { hidden: false });
      } else {
        const existing = await getDocs(tasksCol(selectedClass.id, itemId));
        let order = existing.docs.reduce((max, task) => Math.max(max, Number(task.data().order) || 0), -1) + 1;
        for (const task of chosen) {
          const taskId = await addTask(selectedClass.id, itemId, order++, 'task', {
            title: task.title, instructions: task.instructions ?? '', content: task.content,
          });
          if (task.notes) await saveNotes(selectedClass.id, itemId, taskId, task.notes);
        }
        const existingVisible = existing.docs.filter(task => task.data().kind !== 'section' && !task.data().hidden).length;
        await updateItem(selectedClass.id, itemId, { taskCount: existingVisible + chosen.length });
      }
      setResult({ classId: selectedClass.id, itemId, title });
    } catch (cause) {
      console.error('Resource Hub class copy failed', cause);
      setError('We couldn’t finish copying the activity. Please check the class before trying again.');
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="rh-overlay" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
      <section className="rh-dialog rh-copy" role="dialog" aria-modal="true" aria-labelledby="rh-copy-title">
        <header className="rh-dialog-head">
          <div><span className="rh-eyebrow">Make it yours</span><h2 id="rh-copy-title">{compactClass ? `Copy to ${selectedClass.name}` : 'Copy to a Class'}</h2><p>Choose where to put independent, editable tasks. Your source activity stays unchanged.</p></div>
          <button type="button" className="rh-icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </header>
        {result ? <div className="rh-copy-success">
          <div className="rh-success-mark" aria-hidden="true">✓</div>
          <h3>Ready to edit in {selectedClass?.name}</h3>
          <p>{selectedCount} task{selectedCount === 1 ? '' : 's'} copied to “{result.title}”. The answer key and teaching notes are stored in the lesson’s private teacher area.</p>
          <div className="rh-dialog-actions"><button type="button" className="rh-secondary" onClick={onClose}>Done</button><a className="rh-primary" href={`/class/${result.classId}/lesson/${result.itemId}`}>Open editable lesson ↗</a></div>
        </div> : <>
          <div className="rh-copy-body">
            <div className="rh-copy-main">
              {compactClass ? <div className="rh-copy-class-summary"><span className="rh-class-avatar">{selectedClass.name.slice(0, 1).toUpperCase()}</span><span><b>{selectedClass.name}</b><small>{selectedClass.level || 'Class'} · {selectedClass.learnerCount ?? 0} learners</small></span><button type="button" className="rh-secondary" onClick={() => setShowClassPicker(true)}>Change</button></div> : <h3>1. Choose a Class</h3>}
              {!compactClass && (classes === null ? <p className="rh-muted">Loading your classes…</p> : classes.length === 0 ? <p className="rh-empty">No active classes found. Create a Class first, then return to copy this activity.</p> : <div className="rh-class-list" role="group" aria-label="Choose a Class">
                {classes.map(c => <button type="button" key={c.id} className={`rh-class-card ${classId === c.id ? 'selected' : ''}`} onClick={() => { setClassId(c.id); setDestination('new'); setError(''); setShowClassPicker(false); }} aria-pressed={classId === c.id}>
                  <span className="rh-class-avatar">{c.name.slice(0, 1).toUpperCase()}</span><span><b>{c.name}</b><small>{c.level || 'Class'} · {c.learnerCount ?? 0} learners</small></span><span className="rh-radio" aria-hidden="true" />
                </button>)}
              </div>)}
              <h3>{compactClass ? '1.' : '2.'} Choose a lesson</h3>
              <div className="rh-field"><label htmlFor="rh-new-lesson-title">Destination</label>
                <Select value={destination} options={destinationOptions} onChange={setDestination} label="Destination lesson" disabled={!classId || lessons === null} />
              </div>
              {destination === 'new' && <div className="rh-field"><label htmlFor="rh-new-lesson-title">New lesson name</label><input id="rh-new-lesson-title" value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={120} /></div>}
              <p className="rh-muted">A new lesson appears in the selected Class. Existing lessons receive the selected tasks at the end.</p>
            </div>
            <div className="rh-copy-parts">
              <h3>{compactClass ? '2.' : '3.'} Include tasks</h3>
              <p className="rh-muted">Every part is editable after copying. Teaching notes and answers stay private.</p>
              {availableParts.map(part => <label key={part.id} className="rh-part-row"><input type="checkbox" checked={parts.has(part.id)} onChange={() => setParts(current => { const next = new Set(current); next.has(part.id) ? next.delete(part.id) : next.add(part.id); return next; })} /><span className="rh-part-tick" aria-hidden="true">✓</span><span><b>{part.title}</b><small>{part.detail}</small></span></label>)}
              <div className="rh-private-note">Teacher notes and answer keys are never added to learner-visible content.</div>
            </div>
          </div>
          <footer className="rh-dialog-foot">
            <span className="rh-form-error" role="alert">{error || (!classId ? 'Choose a Class to continue.' : !selectedCount ? 'Choose at least one task.' : '')}</span>
            <div className="rh-dialog-actions"><button type="button" className="rh-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="rh-primary" disabled={!classId || !selectedCount || busy || lessons === null} onClick={() => void copy()}>{busy ? 'Copying…' : `Copy ${selectedCount} task${selectedCount === 1 ? '' : 's'}`}</button></div>
          </footer>
        </>}
      </section>
    </div>, document.body,
  );
}
