import { TrainingProfileFields, profileFromClass, defaultTrainingProfile, type TrainingProfile } from '../training/TrainingProfileFields';
import { StudioMark } from "./StudioMark";
import { AutoTextarea } from './AutoTextarea';
import { ClassProfileFields, defaultProfile, type LearningProfile } from './ClassProfileFields';
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
type ActivityVisual = {title:string;headers:string[];rows:string[][]};
type ActivityVersion = {label:string;reason:string;instructions:string;input:string;visuals:ActivityVisual[];questions:{prompt:string;options:string[];answer:string;explanation:string}[]};
function Visuals({items=[]}:{items?:ActivityVisual[]}) {return <>{items.map((v,i)=><div className="ai-visual" key={i}><table><caption>{v.title}</caption><thead><tr>{v.headers.map((h,j)=><th key={j} scope="col">{h}</th>)}</tr></thead><tbody>{v.rows.map((r,j)=><tr key={j}>{r.map((c,k)=><td key={k}>{c}</td>)}</tr>)}</tbody></table></div>)}</>;}
type Activities = {title:string;rationale:string;differentiation:string;recycling:string;tasks:{visuals?:ActivityVisual[];versions?:ActivityVersion[];title:string;format:string;minutes:number;instructions:string;input:string;support:string;challenge:string;teacherOnlyInput:string;trainingTool?:string;roles:{label:string;input:string}[];questions:{prompt:string;answer:string;explanation:string;options:string[]}[]}[]};
type Evidence = {recent:{title:string;type:string;tasks:string[];result:{attempts:number;score:number;total:number}|null}[];skillLevels:Record<string,number>;counts:{items:number;submittedTasks:number;portfolioRecords:number};limitations:string};
type Result = { activities?:Activities;createdItemId?:string;profileSaved?:boolean;classContext?:{name:string;level:string;kind:string;trainingProfile?:TrainingProfile|null;profile:LearningProfile|null};evidence?:Evidence; outline?: RecordValue; plan?: RecordValue; review?: Review; version?: number; drafts?: { id: string; title: string; version: number }[]; draft?: { creationType?:string; brief: Brief; plan: RecordValue; version: number } };
const call = httpsCallable<Record<string, unknown>, Result>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 450000 });
const initial: Brief = { topic: '', objectives: '', context: '', level: 'B1', methodology: 'Recommend', duration: 60 };
const labels: Record<string, string> = { id: 'Reference', mainAim: 'Main aim', subsidiaryAims: 'Subsidiary aims', assumedKnowledge: 'Assumed knowledge', languageAnalysis: 'Meaning, form, pronunciation and appropriacy', instructionChecks: 'Instruction checks', anticipatedProblems: 'Anticipated problems', materialIds: 'Material references', learnerMaterials: 'Learner materials', answerKey: 'Answer key or response criteria', accessibleAlternative: 'Accessible alternative' };
const label = (key: string) => labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Every content field stays editable; React renders model text without HTML interpretation.
function Fields({ value, onChange, name }: { value: Value; onChange: (v: Value) => void; name: string }) {
  if (typeof value === 'string' || typeof value === 'number') return <label className="ai-field"><span>{name}</span>{typeof value === 'number'
    ? <input type="number" min={1} max={180} value={value} onChange={e => onChange(Number(e.target.value))} />
    : <AutoTextarea aria-label={name} value={value} onChange={e => onChange(e.target.value)} />}</label>;
  if (Array.isArray(value)) return <fieldset><legend>{name}</legend>{value.length === 0 && <p>None needed for this plan.</p>}{value.map((v, i) => typeof v === 'object' && !Array.isArray(v) ? <details className="ai-edit-card" key={i} open={i===0}><summary>{String(v.title ?? `${name} ${i+1}`)}{v.minutes ? ` · ${v.minutes} min` : ''}</summary><Fields value={v} name={`${name} ${i+1}`} onChange={next=>onChange(value.map((old,j)=>j===i?next:old))}/></details> : <Fields key={i} value={v} name={`${name} ${i + 1}`} onChange={next => onChange(value.map((old, j) => j === i ? next : old))} />)}</fieldset>;
  return <fieldset><legend>{name}</legend>{Object.entries(value).map(([key, v]) => <Fields key={key} value={v} name={label(key)} onChange={next => onChange({ ...value, [key]: next })} />)}</fieldset>;
}

export function LessonAssistant() {
  const { classId = '' } = useParams();
  const enabled = useAiPilot();
  const [classKind,setClassKind]=useState('language');
  const isTraining=classKind==='training';
  const [trainingProfile,setTrainingProfile]=useState<TrainingProfile>(defaultTrainingProfile);
  const [step,setStep]=useState(0);
  const [creationType,setCreationType]=useState('lesson');
  const [profile,setProfile]=useState<LearningProfile>(defaultProfile);
  const [profileDirty,setProfileDirty]=useState(false);
  const [className,setClassName]=useState('Your class');
  const [evidence,setEvidence]=useState<Evidence|null>(null);
  const [useEvidence,setUseEvidence]=useState(true);
  const [activities,setActivities]=useState<Activities|null>(null);
  const [sourceRequestId,setSourceRequestId]=useState('');
  const [createVariants,setCreateVariants]=useState(true);
  const [createdItemId,setCreatedItemId]=useState('');
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
  useEffect(()=>{window.scrollTo({top:0});},[step]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(()=>{if(enabled) void run('context');},[classId,enabled]);
  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setError(''); setNotice('');
    try {
      const payload = { classId, brief, action, creationType, useEvidence, ...extra };
      if (action === 'outline' || action === 'plan' || action === 'activities') {
        const fingerprint = JSON.stringify(payload);
        if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
        Object.assign(payload, { requestId: pending.current.requestId });
      }
      const result = (await call(payload)).data;
      if(result.activities) {setStep(3);setActivities(result.activities);setSourceRequestId(pending.current?.requestId ?? '');setCreatedItemId('');}
      if(result.createdItemId) {setCreatedItemId(result.createdItemId);setDirty(false);setNotice('Created in Classes, hidden from learners. Review the activities before making it visible.');}
      if(result.classContext) {setClassKind(result.classContext.kind);setTrainingProfile(profileFromClass(result.classContext.trainingProfile,result.classContext.level));setClassName(result.classContext.name);setProfile(result.classContext.profile ?? defaultProfile);setBrief(b=>({...b,objectives:b.objectives || result.classContext!.trainingProfile?.goals || result.classContext!.profile?.goals || '',context:b.context || result.classContext!.trainingProfile?.context || result.classContext!.profile?.needs || '',level:result.classContext!.kind==='training'?(result.classContext!.trainingProfile?.experience==='Mixed experience'?'Mixed experience':['Two to five years','Over five years'].includes(result.classContext!.trainingProfile?.experience ?? '')?'Experienced':result.classContext!.trainingProfile?.experience==='Under two years'?'Developing':'Foundation'):['A1','A2','B1','B2','C1','C2'].includes(result.classContext!.level)?result.classContext!.level:b.level}));}
      if(result.evidence) setEvidence(result.evidence);
      if(result.profileSaved) {setProfileDirty(false);setNotice('Class settings updated. Future briefs will use these details.');}
      pending.current = null;
      if (result.outline) { setStep(1);setOutline(result.outline); setDirty(true); }
      if (result.plan) { setStep(2);setPlan(result.plan); setReview(result.review ?? null); setDirty(true); }
      if (result.version) { setVersion(result.version); setDirty(false); setNotice('Saved privately. Your learners cannot see this plan.'); }
      if (result.drafts) setDrafts(result.drafts);
      if (result.draft) { setStep(2);setActivities(null);setCreatedItemId(''); setCreationType(result.draft.creationType ?? 'lesson');setBrief(result.draft.brief); setPlan(result.draft.plan); setOutline(null); setReview(null); setVersion(result.draft.version); setDraftId(String(extra.draftId)); setDirty(false); }
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
  const changeBrief=(next:Brief)=>{setBrief(next);setOutline(null);setPlan(null);setActivities(null);setCreatedItemId('');setReview(null);setDirty(true);};
  const changePlan = (next: RecordValue) => { setPlan(next); setActivities(null);setCreatedItemId(''); setDirty(true); setReview(null); setNotice('Your edits need a fresh teacher review.'); };
  if (!enabled) return <><TopBar /><main className="ai-assistant"><h1>Lesson assistant</h1><p>The pilot is not enabled yet.</p><Link to={`/class/${classId}`}>Back to class</Link></main></>;
  return <><TopBar /><main className="ai-assistant">
    <Link to={`/class/${classId}`} onClick={e => { if (!discard()) e.preventDefault(); }}>Back to class</Link>
    <header className="ai-hero"><div><span className="ai-eyebrow">{isTraining?'TRAINER STUDIO':'CREATION STUDIO'} · {className}</span><h1>{isTraining?'Develop teachers.':'Great teaching.'}<br/><em>{isTraining?'Shape their practice.':'Your starting point.'}</em></h1><p>{isTraining?'Purposeful input, rehearsal and reflection, tailored to your trainees.':'Shape an idea into thoughtful, ready-to-teach activities.'}<br/>{isTraining?'Grounded in their course. Led by your judgement.':'Built around your class. Refined by you.'}</p></div><div className="ai-orbit" aria-hidden="true"><span>Discover</span><StudioMark/><div className="ai-orbit-labels"><span>Practise</span><span>Connect</span><span>Grow</span></div></div></header>
    <ol className="ai-progress" aria-label="Creation progress">{['Your brief','Learning sequence',isTraining?'Trainer plan':'Teaching plan',isTraining?'Training activities':'Class activities'].map((x,i)=><li key={x} aria-current={i===step?'step':undefined}><button type="button" disabled={locked || (i===1&&!outline) || (i===2&&!plan) || (i===3&&!activities)} aria-current={i===step?'step':undefined} onClick={()=>setStep(i)}><span>0{i+1}</span>{x}</button></li>)}</ol>
    {error && <p role="alert" className="ai-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="ai-actions"><button className="btn" disabled={locked} onClick={() => void run('list')}>Open saved plans</button>
      <button className="btn" disabled={locked} onClick={() => { if (discard()) { setStep(0);setBrief({...initial,level:brief.level}); setActivities(null);setCreatedItemId(''); setOutline(null); setPlan(null); setReview(null); setDraftId(crypto.randomUUID()); setVersion(0); setDirty(false); pending.current = null; } }}>Start a new plan</button></div>
    {drafts.length > 0 && <ul>{drafts.map(d => <li key={d.id}><button className="btn" disabled={locked} onClick={() => { if (discard()) void run('load', { draftId: d.id }); }}>{d.title}</button> <button className="btn" disabled={locked || d.id === draftId} onClick={() => { if (window.confirm(`Delete “${d.title}”? You can’t undo this.`)) void run('delete', { draftId: d.id }); }}>Delete</button></li>)}</ul>}
    {step===0 && <form onSubmit={e => { e.preventDefault(); if(profileDirty) {setError('Save the class profile changes before generating.');return;} void run('outline'); }}><fieldset disabled={locked}><legend>1. Your brief</legend>
      <div className="ai-type-grid" role="group" aria-label="What would you like to create?">{[['lesson',isTraining?'Training session':'Lesson',isTraining?'Experience, analyse and rehearse':'Explore, practise and communicate'],['exam',isTraining?'Practice exam':'Exam','Assess clearly and fairly'],['homework','Homework','Extend learning beyond class'],['practice','Practice','Retrieve, repeat and improve']].map(([id,title,desc])=><button type="button" key={id} aria-pressed={creationType===id} onClick={()=>{if(id!==creationType){setCreationType(id);changeBrief(brief);}}}><strong>{title}</strong><span>{desc}</span></button>)}</div>
      <details className="ai-context"><summary>{isTraining?`Training profile · ${trainingProfile.programme} · ${trainingProfile.experience}`:`Your class · ${brief.level} · ${profile.courseType} · ${profile.ageGroup}`}</summary><p>These shared details come from Class settings. Save changes here to update future briefs too.</p>{isTraining?<TrainingProfileFields value={trainingProfile} onChange={v=>{setTrainingProfile(v);setProfileDirty(true);changeBrief({...brief,level:v.experience==='Mixed experience'?'Mixed experience':['Two to five years','Over five years'].includes(v.experience)?'Experienced':v.experience==='Under two years'?'Developing':'Foundation'});}}/>:<ClassProfileFields value={profile} onChange={v=>{setProfile(v);setProfileDirty(true);changeBrief(brief);}}/>}<button type="button" className="btn" disabled={!profileDirty} onClick={()=>void run('profile',{profile,trainingProfile,level:brief.level})}>Save to class settings</button></details>
      <details className="ai-context"><summary>Build on what came before {evidence?`· ${evidence.counts.items} recent items`:''}</summary><label><input type="checkbox" checked={useEvidence} onChange={e=>{setUseEvidence(e.target.checked);changeBrief(brief);}}/> Use class history and recorded learning evidence</label><p>{evidence?.limitations ?? 'Loading the available class evidence…'}</p>{evidence && <><p>{evidence.counts.submittedTasks} submitted task records · {evidence.counts.portfolioRecords} portfolio records</p><ul>{evidence.recent.map((x,i)=><li key={i}>{x.title}{x.result?` · ${Math.round(100*x.result.score/x.result.total)}% across ${x.result.attempts} task submissions`: ' · No scored submissions in this sample'}</li>)}</ul></>}</details>
      {(['topic', 'objectives', 'context'] as const).map(k => <label className="ai-field" key={k}><span>{label(k)}</span><AutoTextarea aria-label={label(k)} required maxLength={2000}  value={brief[k]} onChange={e => { changeBrief({ ...brief, [k]: e.target.value }); }} /></label>)}
      {!isTraining&&<label className="ai-field">Level estimate<select value={brief.level} onChange={e => {changeBrief({ ...brief, level: e.target.value });setProfileDirty(true);}}>{(isTraining?['Foundation','Developing','Experienced','Mixed experience']:['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).map(v => <option key={v}>{v}</option>)}</select></label>}
      <label className="ai-field">Minutes<input required type="number" min={15} max={180} value={brief.duration} onChange={e => changeBrief({ ...brief, duration: Number(e.target.value) })} /></label>
      <label className="ai-field">Approach<select value={brief.methodology} onChange={e => changeBrief({ ...brief, methodology: e.target.value })}>{(isTraining?['Recommend','Experiential input','Exam preparation','Reflective practice','Workshop']:['Recommend', 'PPP', 'TTT', 'Task-based', 'Guided discovery', 'Text-based', 'Skills']).map(v => <option key={v}>{v}</option>)}</select></label>
      <button className="btn primary" type="submit">Suggest an outline</button></fieldset></form>}
    {step===1 && outline && <section><h2>2. Review the outline</h2><p>Edit the outcomes, approach and stages. Stage timings must total {brief.duration} minutes.</p><fieldset disabled={locked}><Fields name="Outline" value={outline} onChange={v => { setOutline(v as RecordValue);setPlan(null);setActivities(null);setCreatedItemId(''); setDirty(true); }} /><button className="btn primary" onClick={() => void run('plan', { outline, approved: true })}>Approve outline and make the plan</button></fieldset></section>}
    {step===2 && plan && <section><h2>3. Review and edit</h2><p>This is your private draft. Check the language, tasks and answer keys before teaching.</p>
      <div className="ai-actions"><button className="btn" aria-pressed={tab === 'teacher'} onClick={() => setTab('teacher')}>{isTraining?'Trainer plan':'Teacher plan'}</button><button className="btn" aria-pressed={tab === 'learner'} onClick={() => setTab('learner')}>{isTraining?'Trainee materials':'Learner materials'}</button></div>
      <fieldset disabled={locked}>{tab === 'teacher' ? <Fields name={isTraining?'Trainer plan':'Teacher plan'} value={Object.fromEntries(Object.entries(plan).filter(([k]) => k !== 'learnerMaterials'))} onChange={v => changePlan({ ...(v as RecordValue), learnerMaterials: plan.learnerMaterials })} /> : <Fields name={isTraining?'Trainee materials':'Learner materials'} value={plan.learnerMaterials} onChange={v => changePlan({ ...plan, learnerMaterials: v })} />}</fieldset>
      {review ? <aside><h3>AI review · check these yourself</h3>{review.criticalErrors.length > 0 && <div className="ai-error"><strong>Revise before teaching</strong><ul>{review.criticalErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}<ul>{review.checks.map((c, i) => <li key={i}><strong>{c.criterion}: {c.score}/5.</strong> {c.evidence}</li>)}</ul><ul>{review.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></aside> : <p>Teacher review needed. An earlier AI review does not cover these edits.</p>}
      <div className="ai-actions"><button className="btn" disabled={locked} onClick={() => void run('save', { plan, draftId, version })}>Save private draft</button><button className="btn primary" disabled={locked} onClick={()=>void run('activities',{plan})}>{activities?'Rebuild activities':isTraining?'Prepare training activities':'Prepare class activities'} →</button></div>
    </section>}
    {step===3 && activities && <section className="ai-ready"><span className="ai-eyebrow">04 · READY FOR YOUR REVIEW</span><button className="btn" disabled={locked} onClick={()=>setStep(2)}>← Back to {isTraining?'trainer':'teaching'} plan</button><h2>{activities.title}</h2><p>{activities.rationale}</p><div className="ai-decisions"><article><h3>Support & stretch</h3><p>{activities.differentiation}</p></article><article><h3>Reconnect & recycle</h3><p>{activities.recycling}</p></article></div><div className="ai-task-cards">{activities.tasks.map((t,i)=><details key={i}><summary><span className="ai-task-number">{String(i+1).padStart(2,'0')}</span><strong>{t.title}</strong><span>{t.format} · {t.minutes} min</span></summary><p>{t.instructions}</p>{t.trainingTool&&<p><strong>Trainee completion form:</strong> {t.trainingTool}</p>}<p className="ai-preserve">{t.input}</p><Visuals items={t.visuals}/>{t.versions?.map(v=><details key={v.label}><summary>{v.label} · alternative task</summary><p>{v.reason}</p><p>{v.instructions}</p><p className="ai-preserve">{v.input}</p><Visuals items={v.visuals}/>{v.questions.map((q,j)=><div key={j}><p>{q.prompt}</p>{q.options.length>0&&<ul>{q.options.map(o=><li key={o}>{o}</li>)}</ul>}<details><summary>Answer &amp; rationale</summary><p>{q.answer}</p><p>{q.explanation}</p></details></div>)}</details>)}{t.roles?.map(r=><details key={r.label}><summary>Role {r.label} · separate version</summary><p className="ai-preserve">{r.input}</p></details>)}{t.teacherOnlyInput&&<details><summary>Teacher-only reference & reveal prompts</summary><p className="ai-preserve">{t.teacherOnlyInput}</p></details>}{t.questions.map((q,j)=><div key={j}><p>{q.prompt}</p>{q.options.length>0&&<ul>{q.options.map(o=><li key={o}>{o}</li>)}</ul>}<details><summary>Answer & rationale</summary><p>{q.answer}</p><p>{q.explanation}</p></details></div>)}{t.support&&<p><strong>Optional support:</strong> {t.support}</p>}{t.challenge&&<p><strong>Optional challenge:</strong> {t.challenge}</p>}</details>)}</div>{creationType!=='exam'&&!createdItemId&&<label><input type="checkbox" checked={createVariants} onChange={e=>setCreateVariants(e.target.checked)}/> Create the suggested alternative tasks, where useful. Everyone starts on Standard; you decide who receives another version in Classes.</label>}<div className="ai-create-bar"><p>All activities remain editable. Created content starts hidden from learners.</p>{createdItemId?<Link className="btn primary" to={`/class/${classId}/lesson/${createdItemId}`}>Open in Classes →</Link>:<button className="btn primary" disabled={locked} onClick={()=>void run('create',{sourceRequestId,createVariants})}>Create {isTraining&&creationType==='lesson'?'session':creationType} in Classes →</button>}</div></section>}
    {busy && <p role="status">{busy === 'activities' ? 'Building your interactive activities… This can take up to three minutes.' : busy === 'plan' ? 'Making the plan and checking it… Allow up to six minutes. Keep this page open.' : busy === 'outline' ? 'Suggesting an outline… Allow up to three minutes. Keep this page open.' : 'Loading or saving your private plans…'}</p>}
  </main></>;
}
