import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { TopBar } from '../components/TopBar';
import './assistant.css';
import { useAiPilot } from './pilot';

type Value = string | number | Value[] | { [key: string]: Value };
type RecordValue = { [key: string]: Value };
type Brief = { topic: string; objectives: string; context: string; level: string; methodology: string; duration: number };
type Review = { checks: { criterion: string; score: number; evidence: string }[]; criticalErrors: string[]; suggestions: string[] };
type Result = { outline?: RecordValue; plan?: RecordValue; review?: Review; version?: number; drafts?: { id: string; title: string; version: number }[]; draft?: { brief: Brief; plan: RecordValue; version: number } };
const call = httpsCallable<Record<string, unknown>, Result>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 300000 });
const initial: Brief = { topic: '', objectives: '', context: '', level: 'B1', methodology: 'Recommend', duration: 60 };
const labels: Record<string, string> = { id: 'Reference', mainAim: 'Main aim', subsidiaryAims: 'Subsidiary aims', assumedKnowledge: 'Assumed knowledge', languageAnalysis: 'Meaning, form, pronunciation and appropriacy', instructionChecks: 'Instruction checks', anticipatedProblems: 'Anticipated problems', materialIds: 'Material references', learnerMaterials: 'Learner materials', answerKey: 'Answer key or response criteria', accessibleAlternative: 'Accessible alternative' };
const label = (key: string) => labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Every content field stays editable; React renders model text without HTML interpretation.
function Fields({ value, onChange, name }: { value: Value; onChange: (v: Value) => void; name: string }) {
  if (typeof value === 'string' || typeof value === 'number') return <label className="ai-field"><span>{name}</span>{typeof value === 'number'
    ? <input type="number" min={1} max={180} value={value} onChange={e => onChange(Number(e.target.value))} />
    : <textarea rows={value.length > 180 ? 5 : 2} value={value} onChange={e => onChange(e.target.value)} />}</label>;
  if (Array.isArray(value)) return <fieldset><legend>{name}</legend>{value.length === 0 && <p>None needed for this plan.</p>}{value.map((v, i) => <Fields key={i} value={v} name={`${name} ${i + 1}`} onChange={next => onChange(value.map((old, j) => j === i ? next : old))} />)}</fieldset>;
  return <fieldset><legend>{name}</legend>{Object.entries(value).map(([key, v]) => <Fields key={key} value={v} name={label(key)} onChange={next => onChange({ ...value, [key]: next })} />)}</fieldset>;
}

export function LessonAssistant() {
  const { classId = '' } = useParams();
  const [brief, setBrief] = useState<Brief>(initial);
  const [outline, setOutline] = useState<RecordValue | null>(null);
  const [plan, setPlan] = useState<RecordValue | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('teacher');
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [drafts, setDrafts] = useState<NonNullable<Result['drafts']>>([]);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const locked = !!busy;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setError(''); setNotice('');
    try {
      const payload = { classId, brief, action, ...extra };
      if (action === 'outline' || action === 'plan') {
        const fingerprint = JSON.stringify(payload);
        if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
        Object.assign(payload, { requestId: pending.current.requestId });
      }
      const result = (await call(payload)).data;
      pending.current = null;
      if (result.outline) { setOutline(result.outline); setDirty(true); }
      if (result.plan) { setPlan(result.plan); setReview(result.review ?? null); setDirty(true); }
      if (result.version) { setVersion(result.version); setDirty(false); setNotice('Saved privately. Your learners cannot see this plan.'); }
      if (result.drafts) setDrafts(result.drafts);
      if (result.draft) { setBrief(result.draft.brief); setPlan(result.draft.plan); setOutline(null); setReview(null); setVersion(result.draft.version); setDraftId(String(extra.draftId)); setDirty(false); }
      if (action === 'delete') { setDrafts(drafts.filter(d => d.id !== extra.draftId)); setNotice('Saved plan deleted.'); }
    } catch (e) {
      const failure = e as { message?: string; code?: string };
      setError(failure.message || 'We couldn’t finish that. Your work is still here.');
      // A timeout can hide a completed request: keep its ID for a safe retry.
      if (!['functions/deadline-exceeded', 'functions/internal', 'functions/unavailable'].includes(failure.code ?? '') && !failure.message?.includes('still running')) pending.current = null;
      if (failure.message?.includes('Start a new generation')) pending.current = null;
    } finally { setBusy(''); }
  }
  const discard = () => !dirty || window.confirm('Leave this unsaved draft? Save it first if you want to keep your edits.');
  const changePlan = (next: RecordValue) => { setPlan(next); setDirty(true); setReview(null); setNotice('Your edits need a fresh teacher review.'); };
  const enabled = useAiPilot();
  if (!enabled) return <><TopBar /><main className="ai-assistant"><h1>Lesson assistant</h1><p>The pilot is not enabled yet.</p><Link to={`/class/${classId}`}>Back to class</Link></main></>;
  return <><TopBar /><main className="ai-assistant">
    <Link to={`/class/${classId}`} onClick={e => { if (!discard()) e.preventDefault(); }}>Back to class</Link>
    <h1>Plan a lesson</h1><p>Start with what your learners need to do. Review the outline before making the full plan.</p>
    <p className="hint">Pilot · AI suggestions need your judgement. Use general class context; leave out names and personal learner details.</p>
    {error && <p role="alert" className="ai-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="ai-actions"><button className="btn" disabled={locked} onClick={() => void run('list')}>Open saved plans</button>
      <button className="btn" disabled={locked} onClick={() => { if (discard()) { setBrief(initial); setOutline(null); setPlan(null); setReview(null); setDraftId(crypto.randomUUID()); setVersion(0); setDirty(false); pending.current = null; } }}>Start a new plan</button></div>
    {drafts.length > 0 && <ul>{drafts.map(d => <li key={d.id}><button className="btn" disabled={locked} onClick={() => { if (discard()) void run('load', { draftId: d.id }); }}>{d.title}</button> <button className="btn" disabled={locked || d.id === draftId} onClick={() => { if (window.confirm(`Delete “${d.title}”? You can’t undo this.`)) void run('delete', { draftId: d.id }); }}>Delete</button></li>)}</ul>}
    {!outline && !plan && <form onSubmit={e => { e.preventDefault(); void run('outline'); }}><fieldset disabled={locked}><legend>1. Lesson brief</legend>
      {(['topic', 'objectives', 'context'] as const).map(k => <label className="ai-field" key={k}><span>{label(k)}</span><textarea required maxLength={2000} rows={3} value={brief[k]} onChange={e => { setBrief({ ...brief, [k]: e.target.value }); setDirty(true); }} /></label>)}
      <label className="ai-field">Level estimate<select value={brief.level} onChange={e => setBrief({ ...brief, level: e.target.value })}>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className="ai-field">Minutes<input required type="number" min={15} max={180} value={brief.duration} onChange={e => setBrief({ ...brief, duration: Number(e.target.value) })} /></label>
      <label className="ai-field">Approach<select value={brief.methodology} onChange={e => setBrief({ ...brief, methodology: e.target.value })}>{['Recommend', 'PPP', 'TTT', 'Task-based', 'Guided discovery', 'Text-based', 'Skills'].map(v => <option key={v}>{v}</option>)}</select></label>
      <button className="btn primary" type="submit">Suggest an outline</button></fieldset></form>}
    {outline && !plan && <section><h2>2. Review the outline</h2><p>Edit the outcomes, approach and stages. Stage timings must total {brief.duration} minutes.</p><fieldset disabled={locked}><Fields name="Outline" value={outline} onChange={v => { setOutline(v as RecordValue); setDirty(true); }} /><button className="btn primary" onClick={() => void run('plan', { outline, approved: true })}>Approve outline and make the plan</button></fieldset></section>}
    {plan && <section><h2>3. Review and edit</h2><p>This is your private draft. Check the language, tasks and answer keys before teaching.</p>
      <div className="ai-actions"><button className="btn" aria-pressed={tab === 'teacher'} onClick={() => setTab('teacher')}>Teacher plan</button><button className="btn" aria-pressed={tab === 'learner'} onClick={() => setTab('learner')}>Learner materials</button></div>
      <fieldset disabled={locked}>{tab === 'teacher' ? <Fields name="Teacher plan" value={Object.fromEntries(Object.entries(plan).filter(([k]) => k !== 'learnerMaterials'))} onChange={v => changePlan({ ...(v as RecordValue), learnerMaterials: plan.learnerMaterials })} /> : <Fields name="Learner materials" value={plan.learnerMaterials} onChange={v => changePlan({ ...plan, learnerMaterials: v })} />}</fieldset>
      {review ? <aside><h3>AI review · check these yourself</h3>{review.criticalErrors.length > 0 && <div className="ai-error"><strong>Revise before teaching</strong><ul>{review.criticalErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}<ul>{review.checks.map((c, i) => <li key={i}><strong>{c.criterion}: {c.score}/5.</strong> {c.evidence}</li>)}</ul><ul>{review.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></aside> : <p>Teacher review needed. An earlier AI review does not cover these edits.</p>}
      <button className="btn primary" disabled={locked} onClick={() => void run('save', { plan, draftId, version })}>Save private draft</button>
    </section>}
    {busy && <p role="status">{busy === 'plan' ? 'Making the plan and checking it… This may take a few minutes.' : 'One moment…'}</p>}
  </main></>;
}
