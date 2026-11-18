import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { allTeacherClasses } from '../lib/coteach';
import { updateItem, type ClassDoc } from '../lib/classes';
import { createLessonFromImport } from '../lib/transfer';
import type { HubActivity } from './catalog';
import { adaptedResourceTasks, type AdaptedResource } from './resourceTasks';
import './resourceAdapt.css';

const quickChanges = [
  { id: 'easier', label: 'Make it easier', detail: 'Shorter, more concrete questions' },
  { id: 'challenge', label: 'Add challenge', detail: 'Richer follow-up questions' },
  { id: 'online', label: 'Teach it online', detail: 'Adjust the live mingle' },
  { id: 'context', label: 'Refresh the context', detail: 'New, relevant experiences' },
];

const call = httpsCallable<Record<string, unknown>, { status: string; adaptation: AdaptedResource }>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 240000 });

export function ResourceAdapt({ activity, onClose, preferredClassId }: { activity: HubActivity; onClose: () => void; preferredClassId?: string }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [classId, setClassId] = useState('');
  const [changes, setChanges] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [adapted, setAdapted] = useState<AdaptedResource | null>(null);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ itemId: string; classId: string; title: string } | null>(null);
  const [draftItemId, setDraftItemId] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    allTeacherClasses(user.uid).then(rows => { if (active) { const available = rows.filter(row => row.status === 'active'); setClasses(available); if (preferredClassId && available.some(row => row.id === preferredClassId)) setClassId(current => current || preferredClassId); } })
      .catch(() => { if (active) { setClasses([]); setError('We couldn’t load your Classes. Check your connection and try again.'); } });
    return () => { active = false; };
  }, [user, preferredClassId]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);

  const selectedClass = classes?.find(row => row.id === classId);
  const changeRequest = (next: string[], custom: string, classChoice = classId) => {
    if (draftItemId) { setError('Finish adding the saved draft to its Class before changing this request.'); return; }
    setChanges(next); setInstruction(custom); setClassId(classChoice); setAdapted(null); setRequestId(''); setError('');
  };

  const suggest = async () => {
    if (!classId || !selectedClass) { setError('Choose a Class for this adaptation.'); return; }
    if (!changes.length && !instruction.trim()) { setError('Choose a quick change or describe what you want to change.'); return; }
    if (busy) return;
    const id = requestId || crypto.randomUUID();
    setRequestId(id); setBusy(true); setError('');
    try {
      const result = (await call({ action: 'resourceAdapt', classId, resourceId: activity.id, quickChanges: changes, instruction: instruction.trim(), requestId: id })).data;
      if (result.status !== 'completed' || !result.adaptation) throw new Error('The adaptation is not ready. Try again shortly.');
      adaptedResourceTasks(result.adaptation); // Validate before showing the review.
      setAdapted(result.adaptation);
    } catch (cause) {
      const failure = cause as { message?: string; code?: string };
      setError(failure.message || 'We couldn’t prepare the adaptation. Your original activity is unchanged.');
      // A completed request may have lost its response; reuse the same ID on retry.
      const recoverable = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal'].includes(failure.code ?? '') || failure.message?.includes('still being prepared');
      if (!recoverable) setRequestId('');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!adapted || !selectedClass || busy) return;
    setBusy(true); setError('');
    try {
      const tasks = adaptedResourceTasks(adapted);
      const title = adapted.title.trim();
      const itemId = draftItemId || await createLessonFromImport(selectedClass.id, null, title, tasks);
      setDraftItemId(itemId);
      await updateItem(selectedClass.id, itemId, { hidden: false });
      setSaved({ itemId, classId: selectedClass.id, title });
    } catch (cause) {
      console.error('Resource Hub adaptation copy failed', cause);
      setError('We couldn’t confirm that the adapted lesson was added. Check your Class before trying again to avoid a duplicate.');
    } finally { setBusy(false); }
  };

  return createPortal(<div className="rh-overlay" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section className="rh-dialog rh-adapt" role="dialog" aria-modal="true" aria-labelledby="rh-adapt-title">
      <header className="rh-dialog-head"><div><span className="rh-eyebrow">Make it yours</span><h2 id="rh-adapt-title">Adapt with AI</h2><p>Shape this complete kit for your learners. Review the suggested version before you add it to a Class.</p></div><button type="button" className="rh-icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></header>
      {saved ? <div className="rh-copy-success"><div className="rh-success-mark" aria-hidden="true">✓</div><h3>Adapted lesson added</h3><p>“{saved.title}” is ready to edit in {selectedClass?.name}. The original activity is unchanged. Answer keys and teaching notes are in the private teacher area.</p><div className="rh-dialog-actions"><button type="button" className="rh-secondary" onClick={onClose}>Done</button><a className="rh-primary" href={`/class/${saved.classId}/lesson/${saved.itemId}`}>Open editable lesson ↗</a></div></div> : <>
        <div className="rh-adapt-body">
          <div className="rh-adapt-setup">
            <h3>1. Choose a Class</h3>
            {classes === null ? <p className="rh-muted">Loading your Classes…</p> : classes.length === 0 ? <p className="rh-empty">No active Classes found. Create a Class first, then return to adapt this activity.</p> : <div className="rh-adapt-classes" role="group" aria-label="Choose a Class">{classes.map(row => <button type="button" key={row.id} aria-pressed={classId === row.id} className={`rh-class-card ${classId === row.id ? 'selected' : ''}`} onClick={() => changeRequest(changes, instruction, row.id)} disabled={busy}><span className="rh-class-avatar">{row.name.slice(0, 1).toUpperCase()}</span><span><b>{row.name}</b><small>{row.level || 'Class'} · {row.learnerCount ?? 0} learners</small></span><span className="rh-radio" aria-hidden="true" /></button>)}</div>}
            <h3>2. Choose changes</h3>
            <div className="rh-adapt-chips" role="group" aria-label="Quick changes">{quickChanges.map(choice => <button type="button" key={choice.id} aria-pressed={changes.includes(choice.id)} onClick={() => changeRequest(changes.includes(choice.id) ? changes.filter(id => id !== choice.id) : [...changes, choice.id], instruction)} disabled={busy}><b>{choice.label}</b><small>{choice.detail}</small></button>)}</div>
            <label className="rh-field">Your instructions (optional)<textarea maxLength={1000} rows={3} value={instruction} onChange={event => changeRequest(changes, event.target.value)} placeholder="For example: use travel and food experiences, but keep the ten matching questions." disabled={busy} /></label>
            <p className="rh-muted">The source kit stays unchanged. The suggestion is held here until you approve the Class copy.</p>
          </div>
          {adapted ? <div className="rh-adapt-review">
            <div className="rh-adapt-review-head"><span className="rh-eyebrow">Before and after</span><h3>Review the suggested version</h3><p>{adapted.changeSummary}</p></div>
            <div className="rh-adapt-compare"><div><h4>Original kit</h4><p>Have You Ever…? · present perfect life experiences and past-simple follow-ups</p><img src="/resource-hub/otp-002-p2.png" alt="Original learner Practice A and B page" /><img src="/resource-hub/otp-002-p3.png" alt="Original learner Practice C and Find Someone Who page" /></div>
              <div><h4>{adapted.title}</h4><h5>Lead-in</h5><p>{adapted.leadIn}</p>
                <h5>Practice A · Complete the questions</h5><ol>{adapted.practiceA.map((item, index) => <li key={index}>{item.question}</li>)}</ol>
                <h5>Practice B · Match the follow-ups</h5><ol type="a">{adapted.practiceB.map((item, index) => <li key={index}>{item.question}</li>)}</ol>
                <h5>Practice C · Write your questions</h5><p>{adapted.practiceC.instructions}</p><p><b>Model:</b> {adapted.practiceC.firstModel} · <b>Starter:</b> {adapted.practiceC.secondStarter}…</p><ul>{adapted.practiceC.experiences.map((item, index) => <li key={index}>{item}</li>)}</ul>
                <h5>Produce · Mingle and report</h5><p>{adapted.produce.instructions}</p><p>{adapted.produce.followUpExamples.join(' · ')}</p><p>{adapted.produce.reportInstruction}</p>
                <details><summary>Teacher-only answers and notes · hidden until opened</summary><p><b>Practice A:</b> {adapted.practiceA.map((item, index) => `${index + 1} ${item.answer}`).join(' · ')}</p><p><b>Practice B:</b> {adapted.practiceB.map((item, index) => `${item.targetNumber} ${String.fromCharCode(97 + index)}`).join(' · ')}</p><p>{adapted.teacherNotes}</p></details>
              </div></div>
          </div> : <div className="rh-adapt-placeholder"><span aria-hidden="true">✦</span><h3>Your original stays safe</h3><p>Choose a Class and a change. AI will suggest an editable variation for your review; nothing is saved to the Class yet.</p><img src="/resource-hub/otp-002-p2.png" alt="Preview of the original learner worksheet" /></div>}
        </div>
          <footer className="rh-dialog-foot"><span className="rh-form-error" role="alert">{error || (!classId ? 'Choose a Class to continue.' : !changes.length && !instruction.trim() ? 'Choose a change or add an instruction.' : '')}</span><div className="rh-dialog-actions"><button type="button" className="rh-secondary" onClick={onClose} disabled={busy}>Cancel</button>{adapted ? <><button type="button" className="rh-secondary" onClick={() => { setAdapted(null); setRequestId(''); }} disabled={busy || !!draftItemId}>Try another version</button><button type="button" className="rh-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Adding…' : draftItemId ? 'Finish adding copy to Class' : 'Add reviewed copy to Class'}</button></> : <button type="button" className="rh-primary" onClick={() => void suggest()} disabled={busy || !classId || (!changes.length && !instruction.trim())}>{busy ? 'Preparing…' : 'Suggest adaptation'}</button>}</div></footer>
      </>}
    </section>
  </div>, document.body);
}
