import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { JSONContent } from '@tiptap/react';
import { AiButton, AiMark } from '../components/AiMark';
import { useAiPilot } from '../ai/pilot';
import { TaskRenderer } from '../components/TaskRenderer';
import type { AnswerKey } from '../lib/questions';
import { dockOpen } from '../components/ChatDock';
import { Select } from '../components/Select';

type Mode = 'next' | 'edit' | 'differentiate' | 'answers';
type Draft = { title?: string; instructions?: string; content?: JSONContent; key?: AnswerKey; notes?: string; summary?: string; entries?: { taskId: string; questionId: string; key: unknown; reason: string }[]; issues?: string[] };
type Reply = { status?: string; error?: string; requestId?: string; result?: Draft; applied?: boolean; taskId?: string };
const call = httpsCallable<Record<string, unknown>, Reply>(getFunctions(undefined, 'us-central1'), 'lessonAssistant', { timeout: 420000 });
const labels: Record<Mode, string> = { next: 'Create a task with AI', edit: 'Edit task with AI', differentiate: 'Differentiate task', answers: 'Fill missing answers' };

export function FileLessonAi({ fileId, selectedTaskId, beforeOpen, onApplied }: { fileId: string; selectedTaskId?: string; beforeOpen: () => Promise<void>; onApplied: (taskId: string) => void }) {
  const enabled = useAiPilot();
  const [mode, setMode] = useState<Mode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [direction, setDirection] = useState('');
  const [variantLabel, setVariantLabel] = useState<'Supported' | 'Stretch'>('Supported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Draft | null>(null);
  const [requestId, setRequestId] = useState('');
  const storageKey = `file-lesson-ai:${fileId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.requestId && saved?.mode) { setMode(saved.mode); setRequestId(saved.requestId); }
    } catch { /* An invalid local draft reference is ignored. */ }
  }, [storageKey]);
  useEffect(() => {
    if (!mode || !requestId || result || busy) return;
    const poll = async () => {
      try {
        const reply = (await call({ action: 'fileTaskAiStatus', fileId, requestId })).data;
        if (reply.status === 'completed' && reply.result) { setResult(reply.result); setError(''); }
        else if (reply.status === 'failed') setError(reply.error || 'This draft did not finish. Your lesson is unchanged.');
      } catch (cause) { setError((cause as Error).message); }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 4000);
    return () => window.clearInterval(timer);
  }, [busy, fileId, mode, requestId, result]);
  const close = () => setDialogOpen(false);
  const open = (next: Mode) => {
    if (!enabled || busy) return;
    setMode(next); setDialogOpen(true); setDirection(''); setResult(null); setError(''); setRequestId('');
    try { localStorage.removeItem(storageKey); } catch { /* fine */ }
  };
  const draft = async () => {
    if (!mode || busy) return;
    if (mode === 'edit' && !direction.trim()) { setError('Describe the changes you want above Generate draft.'); return; }
    setBusy(true); setError('');
    const id = crypto.randomUUID();
    try {
      await beforeOpen();
      setRequestId(id);
      localStorage.setItem(storageKey, JSON.stringify({ requestId: id, mode }));
      const reply = (await call({ action: 'fileTaskAiDraft', fileId, requestId: id, mode, taskId: mode === 'next' ? '' : selectedTaskId ?? '', direction, minutes: 10, variantLabel })).data;
      if (reply.status === 'completed' && reply.result) setResult(reply.result);
      else setError(reply.error || 'The draft is still being prepared. Check progress shortly.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!requestId || busy) return;
    setBusy(true); setError('');
    try {
      const reply = (await call({ action: 'fileTaskAiApply', fileId, requestId })).data;
      if (!reply.applied) throw Error('The draft could not be applied.');
      localStorage.removeItem(storageKey);
      onApplied(reply.taskId ?? ''); setMode(null); setDialogOpen(false); setResult(null); setRequestId('');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <>
    <details className="lesson-support-tools lf-ai-tools"><summary><AiMark /> AI tools</summary>
      <div className="lesson-support-actions" onClick={event => { if ((event.target as Element).closest('button')) event.currentTarget.closest('details')?.removeAttribute('open'); }}>
        {(Object.keys(labels) as Mode[]).map(key => <AiButton key={key} type="button" className="btn small-btn" disabled={!enabled || busy || key !== 'next' && !selectedTaskId} onClick={() => open(key)}>{labels[key]}</AiButton>)}
        {mode && requestId && !dialogOpen && <button type="button" className="btn small-btn" onClick={() => setDialogOpen(true)}>Resume AI draft</button>}
        <AiButton type="button" className="btn small-btn" onClick={() => dockOpen('teaching-coach')}>Discuss with Teacher’s Companion</AiButton>
        {!selectedTaskId && <span className="hint">Select a task to edit, differentiate or fill its answers.</span>}
        {!enabled && <span className="hint">AI tools need access enabled for your account.</span>}
        <span className="hint">Learner insights appear in Classes, where learner responses are available.</span>
      </div>
    </details>
    {mode && dialogOpen && <div className="scrim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="dialog lf-ai-dialog" role="dialog" aria-modal="true" aria-label={labels[mode]}>
        <div className="row-between"><h2>{labels[mode]}</h2><button type="button" className="icon-btn" aria-label="Close AI tool" onClick={close}>×</button></div>
        {!result && <>
          <label className="lf-ai-direction">What would you like? <span className="hint">{mode === 'edit' ? 'Required for editing' : 'Optional'}</span>
            <textarea value={direction} onChange={event => setDirection(event.target.value)} maxLength={2500} disabled={busy || !!requestId} placeholder={mode === 'edit' ? 'Make the instructions shorter and clearer.' : mode === 'next' ? 'A pair task using today’s vocabulary.' : mode === 'differentiate' ? 'Add a word bank and an example.' : 'Accept both British and American spelling.'} />
          </label>
          {mode === 'differentiate' && <Select label="Version" value={variantLabel} options={[{v:'Supported',label:'Supported'},{v:'Stretch',label:'Stretch'}]} onChange={value => setVariantLabel(value as 'Supported' | 'Stretch')} />}
          <p className="hint">You will review the draft before it changes your lesson.</p>
          {!requestId && <button type="button" className="btn primary" disabled={busy || mode === 'edit' && !direction.trim()} onClick={() => void draft()}>{busy ? 'Preparing…' : 'Generate draft'}</button>}
          {requestId && !result && <p role="status">Your draft is being prepared. You can close this window and return to it.</p>}
          {requestId && !result && !busy && <button type="button" className="btn" onClick={() => { setRequestId(''); setError(''); localStorage.removeItem(storageKey); }}>Start a new draft</button>}
        </>}
        {result && <section className="lf-ai-review" aria-label="Review AI draft">
          <strong>Review before applying</strong>
          {result.title && <h3>{result.title}</h3>}
          {result.instructions && <p>{result.instructions}</p>}
          {result.summary && <p>{result.summary}</p>}
          {result.content && <TaskRenderer content={result.content} responses={{}} disabled teacher revealed={result.key} classId={'user:' + fileId} />}
          {result.entries && <ul>{result.entries.map((entry, index) => <li key={index}>Task {entry.taskId}, question {entry.questionId}: {JSON.stringify(entry.key)}{entry.reason && ` — ${entry.reason}`}</li>)}</ul>}
          {result.issues?.map((issue, index) => <p className="hint" key={index}>{issue}</p>)}
          {result.notes && <details><summary>Teacher notes</summary><p style={{ whiteSpace: 'pre-wrap' }}>{result.notes}</p></details>}
          <button type="button" className="btn primary" disabled={busy || mode === 'answers' && !result.entries?.length} onClick={() => void apply()}>{busy ? 'Saving…' : mode === 'answers' ? 'Apply answer key' : mode === 'edit' ? 'Apply changes' : 'Add task to lesson'}</button>
        </section>}
        {error && <p role="alert" className="lf-copy-error">{error}</p>}
      </div>
    </div>}
  </>;
}
