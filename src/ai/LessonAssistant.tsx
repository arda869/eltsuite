import { TrainingProfileFields, profileFromClass, defaultTrainingProfile, type TrainingProfile } from '../training/TrainingProfileFields';
import { StudioMark } from "./StudioMark";
import { AutoTextarea } from './AutoTextarea';
import { ClassProfileFields, defaultProfile, type LearningProfile } from './ClassProfileFields';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { TopBar } from '../components/TopBar';
import './assistant.css';
import { GenerationProgress } from './GenerationProgress';
import { useAiPilot } from './pilot';

type Value = string | number | Value[] | { [key: string]: Value };
type RecordValue = { [key: string]: Value };
type Brief = { additionalObjectives?:string[]; topic: string; objectives: string; context: string; level: string; methodology: string; duration: number };
type Review = { checks: { criterion: string; score: number; evidence: string }[]; criticalErrors: string[]; suggestions: string[] };
type ActivityVisual = {title:string;headers:string[];rows:string[][]};
type ActivityBlock = {kind:string;title:string;text:string;items:string[]};
type ActivityPart = {instructions:string;input:string;blocks?:ActivityBlock[];visuals?:ActivityVisual[];questions:{prompt:string;options:string[];answer:string;explanation:string}[]};
function InputBlocks({body}:{body:{input:string;blocks?:ActivityBlock[]}}) {return <>{body.blocks?.length?body.blocks.map((b,i)=>b.kind==='numberedList'?<ol key={i}>{b.items.map((x,j)=><li key={j}>{x}</li>)}</ol>:b.kind==='bulletList'?<ul key={i}>{b.items.map((x,j)=><li key={j}>{x}</li>)}</ul>:<div key={i}>{b.title&&<strong>{b.title}</strong>}<p className="ai-preserve">{b.text}</p></div>):<p className="ai-preserve">{body.input}</p>}</>;}
function SubtaskPreview({parts=[]}:{parts?:ActivityPart[]}) {return <>{parts.map((part,i)=><section key={i} aria-label={`Subtask ${i+1}`}><h4>{String.fromCharCode(97+i)}. {part.instructions}</h4><InputBlocks body={part}/><Visuals items={part.visuals}/><ol>{part.questions.map((q,j)=><li key={j}>{q.prompt}{q.options.length>0&&<ul>{q.options.map(o=><li key={o}>{o}</li>)}</ul>}<details><summary>Answer & rationale</summary><p>{q.answer}</p><p>{q.explanation}</p></details></li>)}</ol></section>)}</>;}
type ActivityVersion = {blocks?:ActivityBlock[];subTasks?:ActivityPart[];label:string;reason:string;instructions:string;input:string;visuals:ActivityVisual[];questions:{prompt:string;options:string[];answer:string;explanation:string}[]};
function Visuals({items=[]}:{items?:ActivityVisual[]}) {return <>{items.map((v,i)=><div className="ai-visual" key={i}><table><caption>{v.title}</caption><thead><tr>{v.headers.map((h,j)=><th key={j} scope="col">{h}</th>)}</tr></thead><tbody>{v.rows.map((r,j)=><tr key={j}>{r.map((c,k)=><td key={k}>{c}</td>)}</tr>)}</tbody></table></div>)}</>;}
type Activities = {title:string;rationale:string;differentiation:string;recycling:string;tasks:{blocks?:ActivityBlock[];subTasks?:ActivityPart[];visuals?:ActivityVisual[];versions?:ActivityVersion[];title:string;format:string;minutes:number;instructions:string;input:string;support:string;challenge:string;teacherOnlyInput:string;trainingTool?:string;roles:{label:string;input:string}[];questions:{prompt:string;answer:string;explanation:string;options:string[]}[]}[]};
type Evidence = {recent:{title:string;type:string;tasks:string[];result:{attempts:number;score:number;total:number}|null}[];skillLevels:Record<string,number>;counts:{items:number;submittedTasks:number;portfolioRecords:number};limitations:string};
type Memory = {id:string;name:string;text:string;item:string;task:string};
type MediaStatus={id:string;kind:string;title:string;status:string;completedLines:number;totalLines:number;error:string;mediaId:string};
type Result = { brief?:Brief|null; media?:MediaStatus[]; memories?:Memory[]; activities?:Activities;createdItemId?:string;profileSaved?:boolean;classContext?:{name:string;level:string;kind:string;trainingProfile?:TrainingProfile|null;profile:LearningProfile|null};evidence?:Evidence; outline?: RecordValue; plan?: RecordValue; review?: Review; version?: number; drafts?: { id: string; title: string; version: number }[]; draft?: { creationType?:string; brief: Brief; plan: RecordValue; version: number } };
const call = httpsCallable<Record<string, unknown>, Result>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 450000 });
const initial: Brief = { topic: '', objectives: '', context: '', level: 'B1', methodology: 'Recommend', duration: 60 };
const labels: Record<string, string> = { id: 'Reference', mainAim: 'Main aim', subsidiaryAims: 'Subsidiary aims', assumedKnowledge: 'Assumed knowledge', languageAnalysis: 'Meaning, form, pronunciation and appropriacy', instructionChecks: 'Instruction checks', anticipatedProblems: 'Anticipated problems', materialIds: 'Material references', learnerMaterials: 'Learner materials', answerKey: 'Answer key or response criteria', accessibleAlternative: 'Accessible alternative' };
const briefFields:Record<string,{topic:string;objectives:string;context:string;topicHint:string;objectivesHint:string;contextHint:string}> = {
 lesson:{topic:'Topic',objectives:'Learning objective',context:'Context',topicHint:'What will learners explore?',objectivesHint:'What should learners be able to do by the end?',contextHint:'Grouping, available resources and anything specific to this lesson'},
 exam:{topic:'Exam coverage',objectives:'Assessment objectives',context:'Exam conditions',topicHint:'Units, language and skills to assess',objectivesHint:'What evidence of learning should the exam measure?',contextHint:'Question types, marks, permitted resources and access arrangements'},
 homework:{topic:'Homework focus',objectives:'Learning goals',context:'Independent-work instructions',topicHint:'What should learners build on from class?',objectivesHint:'What should they practise, produce or prepare?',contextHint:'Available resources, how to submit and any help they may use'},
 practice:{topic:'Practice target',objectives:'Success criteria',context:'Practice setup',topicHint:'Which language or skill needs retrieval and practice?',objectivesHint:'What would successful practice look like?',contextHint:'Individual or paired, available support, repetition and feedback'}
};
function CreationIcon({type}:{type:string}) {return <svg className="ai-choice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{type==='lesson'?<><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2Z"/></>:type==='exam'?<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10l2 2 4-4M8 16h8"/></>:type==='homework'?<><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/></>:<><path d="M20 7a9 9 0 0 0-15-1L2 9m0-6v6h6M4 17a9 9 0 0 0 15 1l3-3m0 6v-6h-6"/><path d="m9 12 2 2 4-4"/></>}</svg>;}
const label = (key: string) => labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const MaterialNames=createContext<Record<string,string>>({});
const stageColumns = [ 'title', 'aim', 'minutes', 'interaction'] as const;
function StageTable({ stages, onChange }: { stages: RecordValue[]; onChange: (v: Value[]) => void }) {
  const hasProcedures = stages.some(stage => 'procedures' in stage);
  const columns: string[] = [...stageColumns, ...(hasProcedures ? ['procedures'] : [])];
  const edit = (index: number, key: string, value: Value) => onChange(stages.map((stage, i) => i === index ? { ...stage, [key]: value } : stage));
  return <fieldset className="ai-stage-editor"><legend>Stages</legend>
    <p className="hint ai-stage-hint">Edit each stage in its row. On a smaller screen, scroll across to see every column.</p>
    <div className="ai-stage-scroll" role="region" aria-label="Editable lesson stages" tabIndex={0}>
      <table className={'ai-stage-table' + (hasProcedures ? ' with-procedures' : '')}>
        <caption className="sr-only">Lesson stages</caption>
        <thead><tr>{columns.map(key => <th key={key} scope="col" className={`ai-stage-${key}`}>{label(key)}</th>)}</tr></thead>
        {stages.map((stage, index) => {
          const notes = Object.fromEntries(Object.entries(stage).filter(([key]) => key!=='id'&&!columns.includes(key)));
          return <tbody key={index}>
            <tr>{columns.map(key => <td key={key} className={`ai-stage-${key}`}>
              {key === 'minutes'
                ? <input aria-label={`Stage ${index + 1}: ${label(key)}`} type="number" min={1} max={180} value={Number(stage[key] ?? 1)} onChange={e => edit(index, key, Number(e.target.value))} />
                : <AutoTextarea aria-label={`Stage ${index + 1}: ${label(key)}`} value={String(stage[key] ?? '')} onChange={e => edit(index, key, e.target.value)} />}
            </td>)}</tr>
            {Object.keys(notes).length > 0 && <tr className="ai-stage-notes"><td colSpan={columns.length}>
              <details><summary>Stage {index + 1} · instructions, feedback and materials</summary>
                <Fields name={`Stage ${index + 1} notes`} value={notes} onChange={value => onChange(stages.map((old, i) => i === index ? { ...old, ...(value as RecordValue) } : old))} />
              </details>
            </td></tr>}
          </tbody>;
        })}
        <tfoot><tr><th scope="row" colSpan={2}>Total time</th><td>{stages.reduce((total, stage) => total + Number(stage.minutes ?? 0), 0)} min</td><td colSpan={columns.length - 3} /></tr></tfoot>
      </table>
    </div>
  </fieldset>;
}

// Every content field stays editable; React renders model text without HTML interpretation.
function Fields({ value, onChange, name }: { value: Value; onChange: (v: Value) => void; name: string }) {
  const materialNames=useContext(MaterialNames);
  if(name==='Reference')return null;
  if(name==='Material references'&&Array.isArray(value))return <fieldset><legend>Materials used</legend>{value.map((id,i)=><label className="ai-field" key={i}>Material {i+1}<select value={String(id)} onChange={e=>onChange(value.map((old,j)=>i===j?e.target.value:old))}>{Object.entries(materialNames).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>)}</fieldset>;
  if (typeof value === 'string' || typeof value === 'number') return <label className="ai-field"><span>{name}</span>{typeof value === 'number'
    ? <input type="number" min={1} max={180} value={value} onChange={e => onChange(Number(e.target.value))} />
    : <AutoTextarea aria-label={name} value={value} onChange={e => onChange(e.target.value)} />}</label>;
  if (Array.isArray(value)) return <fieldset><legend>{name}</legend>{value.length === 0 && <p>None needed for this plan.</p>}{value.map((v, i) => typeof v === 'object' && !Array.isArray(v) ? <details className="ai-edit-card" key={i} open={i===0}><summary>{String(v.title ?? `${name} ${i+1}`)}{v.minutes ? ` · ${v.minutes} min` : ''}</summary><Fields value={v} name={`${name} ${i+1}`} onChange={next=>onChange(value.map((old,j)=>j===i?next:old))}/></details> : <Fields key={i} value={v} name={`${name} ${i + 1}`} onChange={next => onChange(value.map((old, j) => j === i ? next : old))} />)}</fieldset>;
  return <fieldset><legend>{name}</legend>{Object.entries(value).map(([key, v]) => key === 'stages' && Array.isArray(v) && v.every(stage => stage && typeof stage === 'object' && !Array.isArray(stage))
    ? <StageTable key={key} stages={v as RecordValue[]} onChange={next => onChange({ ...value, [key]: next })} />
    : <Fields key={key} value={v} name={label(key)} onChange={next => onChange({ ...value, [key]: next })} />)}</fieldset>;
}

export function LessonAssistant() {
  const { classId = '' } = useParams();
  const enabled = useAiPilot();
  const [classKind,setClassKind]=useState('language');
  const isTraining=classKind==='training';
  const [trainingProfile,setTrainingProfile]=useState<TrainingProfile>(defaultTrainingProfile);
  const [step,setStep]=useState(0);
  const [activeActivity,setActiveActivity]=useState(0);
  const [creationType,setCreationType]=useState('lesson');
  const [profile,setProfile]=useState<LearningProfile>(defaultProfile);
  const [profileDirty,setProfileDirty]=useState(false);
  const [className,setClassName]=useState('Your class');
  const [evidence,setEvidence]=useState<Evidence|null>(null);
  const [useEvidence,setUseEvidence]=useState(true);
  const [useLearnerMemories,setUseLearnerMemories]=useState(false);
  const [memories,setMemories]=useState<Memory[]>([]);
  const [memoryIds,setMemoryIds]=useState<string[]>([]);
  const [activities,setActivities]=useState<Activities|null>(null);
  const [sourceRequestId,setSourceRequestId]=useState('');
  const [media,setMedia]=useState<MediaStatus[]>([]);
  const preparingMedia=media.some(m=>m.status==='queued'||m.status==='running');
  const mediaReady=media.every(m=>m.status==='ready');
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
  const locked = !!busy || preparingMedia;
  const formFields=briefFields[creationType] ?? briefFields.lesson;
  useEffect(()=>{window.scrollTo({top:0});},[step]);
  useEffect(() => {
    if (!dirty && !locked) return;
    const message = locked
      ? 'Your lesson is still being created. Leaving now may lose the result. Leave this page anyway?'
      : 'You have unsaved lesson changes. Leave this page without saving?';
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    // Navigation API covers SPA links, app navigation and browser Back/Forward.
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const e = event as Event & { destination?: { url: string; sameDocument: boolean } };
      if (!e.cancelable || !e.destination?.sameDocument) return;
      const destination = new URL(e.destination.url);
      if (destination.pathname === location.pathname && destination.search === location.search) return;
      if (!window.confirm(message)) e.preventDefault();
    };
    // Link fallback for browsers without the Navigation API.
    const click = (e: MouseEvent) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href);
      if (destination.pathname === location.pathname && destination.search === location.search) return;
      if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    if (navigation) navigation.addEventListener('navigate', navigate);
    else document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      navigation?.removeEventListener('navigate', navigate);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, locked]);
  useEffect(()=>{setUseLearnerMemories(false);setMemoryIds([]);setMemories([]);if(enabled) void run('context');},[classId,enabled]);
  useEffect(()=>{if(!sourceRequestId||!preparingMedia)return;let cancelled=false;const timer=window.setInterval(()=>{void call({action:'mediaStatus',classId,sourceRequestId}).then(r=>{if(!cancelled)setMedia(r.data.media??[]);}).catch(()=>{if(!cancelled)setError('Could not refresh media status. Preparation continues on the server.');});},3000);return()=>{cancelled=true;window.clearInterval(timer);};},[sourceRequestId,preparingMedia,classId]);
  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setError(''); setNotice('');
    try {
      const payload = { classId, brief, action, creationType, useEvidence, useLearnerMemories, memoryIds:useLearnerMemories?memoryIds:[], ...extra };
      if (action === 'outline' || action === 'plan' || action === 'activities') {
        const fingerprint = JSON.stringify(payload);
        if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
        Object.assign(payload, { requestId: pending.current.requestId });
      }
      const result = (await call(payload)).data;
      if(result.activities) {setDirty(true);setStep(3);setActivities(result.activities);setActiveActivity(0);setMedia([]);setSourceRequestId(String(extra.sourceRequestId??pending.current?.requestId??''));try{localStorage.setItem('ai-media-job:'+classId,String(extra.sourceRequestId??pending.current?.requestId??''));}catch{}setCreatedItemId('');}
      if(result.media)setMedia(result.media);
      if(result.activities&&action!=='resumeActivities'){const status=(await call({action:'mediaStatus',classId,sourceRequestId:pending.current?.requestId})).data;setMedia(status.media??[]);}
      if(result.createdItemId) {setCreatedItemId(result.createdItemId);setDirty(false);setNotice('Created in Classes, hidden from learners. Review the activities before making it visible.');}
      if(result.classContext) {setClassKind(result.classContext.kind);setTrainingProfile(profileFromClass(result.classContext.trainingProfile,result.classContext.level));setClassName(result.classContext.name);setProfile(result.classContext.profile ?? defaultProfile);setBrief(b=>({...b,objectives:b.objectives || result.classContext!.trainingProfile?.goals || result.classContext!.profile?.goals || '',context:b.context || result.classContext!.trainingProfile?.context || result.classContext!.profile?.needs || '',level:result.classContext!.kind==='training'?(result.classContext!.trainingProfile?.experience==='Mixed experience'?'Mixed experience':['Two to five years','Over five years'].includes(result.classContext!.trainingProfile?.experience ?? '')?'Experienced':result.classContext!.trainingProfile?.experience==='Under two years'?'Developing':'Foundation'):['A1','A2','B1','B2','C1','C2'].includes(result.classContext!.level)?result.classContext!.level:b.level}));}
      if(result.evidence) setEvidence(result.evidence);
      if(action==='context'){try{const saved=localStorage.getItem('ai-media-job:'+classId);if(saved)await run('resumeActivities',{sourceRequestId:saved});}catch{}}
      if(result.memories) setMemories(result.memories);
      if(result.profileSaved) {setProfileDirty(false);setNotice('Class settings updated. Future briefs will use these details.');}
      pending.current = null;
      if (result.outline) { setStep(1);setOutline(result.outline); setDirty(true); }
      if(result.brief)setBrief(result.brief);
      if (result.plan) { setStep(action==='resumeActivities'?3:2);setPlan(result.plan); setReview(result.review ?? null); setDirty(true); }
      if (result.version) { setVersion(result.version); setDirty(false); setNotice('Saved privately. Your learners cannot see this plan.'); }
      if (result.drafts) setDrafts(result.drafts);
      if (result.draft) { setStep(2);setActivities(null);setMedia([]);setCreatedItemId(''); setCreationType(result.draft.creationType ?? 'lesson');setBrief(result.draft.brief); setPlan(result.draft.plan); setOutline(null); setReview(null); setVersion(result.draft.version); setDraftId(String(extra.draftId)); setDirty(false); }
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
  const changeBrief=(next:Brief)=>{try{localStorage.removeItem('ai-media-job:'+classId);}catch{}setBrief(next);setOutline(null);setPlan(null);setActivities(null);setMedia([]);setCreatedItemId('');setReview(null);setDirty(true);};
  const changePlan = (next: RecordValue) => { setPlan(next); setActivities(null);setMedia([]);setCreatedItemId(''); setDirty(true); setReview(null); setNotice('Your edits need a fresh teacher review.'); };
  if (!enabled) return <><TopBar /><main className="ai-assistant"><h1>Lesson assistant</h1><p>The pilot is not enabled yet.</p><Link to={`/class/${classId}`}>Back to class</Link></main></>;
  return <MaterialNames.Provider value={Object.fromEntries((Array.isArray(plan?.learnerMaterials)?plan.learnerMaterials:[]).map(m=>[String((m as RecordValue).id),String((m as RecordValue).title)]))}><TopBar /><main className="ai-assistant">
    <Link to={`/class/${classId}`}>Back to class</Link>
    <header className="ai-hero"><div><span className="ai-eyebrow">{isTraining?'TRAINER STUDIO':'CREATION STUDIO'} · {className}</span><h1>{isTraining?'Develop teachers.':'Great teaching.'}<br/><em>{isTraining?'Shape their practice.':'Your starting point.'}</em></h1><p>{isTraining?'Purposeful input, rehearsal and reflection, tailored to your trainees.':'Shape an idea into thoughtful, ready-to-teach activities.'}<br/>{isTraining?'Grounded in their course. Led by your judgement.':'Built around your class. Refined by you.'}</p></div><div className="ai-orbit" aria-hidden="true"><span>Discover</span><StudioMark/><div className="ai-orbit-labels"><span>Practise</span><span>Connect</span><span>Grow</span></div></div></header>
    <ol className="ai-progress" aria-label="Creation progress" role="tablist">{['Your brief','Learning sequence',isTraining?'Trainer plan':'Teaching plan',isTraining?'Training activities':'Class activities'].map((x,i)=><li role="presentation" key={x} className={i===step?'current':''}><button type="button" role="tab" tabIndex={i===step?0:-1} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=Array.from(e.currentTarget.closest('[role="tablist"]')!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const at=tabs.indexOf(e.currentTarget),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next]?.focus();tabs[next]?.click();}} id={`creation-tab-${i}`} aria-controls={`creation-panel-${i}`} aria-selected={i===step} disabled={locked || (i===1&&!outline) || (i===2&&!plan) || (i===3&&!activities)} aria-current={i===step?'step':undefined} onClick={()=>setStep(i)}><span>0{i+1}</span>{x}</button></li>)}</ol>
    {error && <p role="alert" className="ai-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="ai-actions"><button className="btn" disabled={locked} onClick={() => void run('list')}>Open saved plans</button>
      <button className="btn" disabled={locked} onClick={() => { if (discard()) { try{localStorage.removeItem('ai-media-job:'+classId);}catch{}setStep(0);setBrief({...initial,level:brief.level,objectives:isTraining?trainingProfile.goals:profile.goals,context:isTraining?trainingProfile.context:profile.needs}); setActivities(null);setMedia([]);setCreatedItemId(''); setOutline(null); setPlan(null); setReview(null); setDraftId(crypto.randomUUID()); setVersion(0); setDirty(false); pending.current = null; } }}>Start a new plan</button></div>
    {drafts.length > 0 && <ul>{drafts.map(d => <li key={d.id}><button className="btn" disabled={locked} onClick={() => { if (discard()) void run('load', { draftId: d.id }); }}>{d.title}</button> <button className="btn" disabled={locked || d.id === draftId} onClick={() => { if (window.confirm(`Delete “${d.title}”? You can’t undo this.`)) void run('delete', { draftId: d.id }); }}>Delete</button></li>)}</ul>}
    {step===0 && <form role="tabpanel" id="creation-panel-0" aria-labelledby="creation-tab-0" onSubmit={e => { e.preventDefault(); if(profileDirty) {setError('Save the class profile changes before generating.');return;} void run('outline'); }}><fieldset disabled={locked}><legend>1. Your brief</legend>
      <div className="ai-type-grid" role="group" aria-label="What would you like to create?">{[['lesson',isTraining?'Training session':'Lesson',isTraining?'Experience, analyse and rehearse':'Explore, practise and communicate'],['exam',isTraining?'Practice exam':'Exam','Assess clearly and fairly'],['homework','Homework','Extend learning beyond class'],['practice','Practice','Retrieve, repeat and improve']].map(([id,title,desc])=><button type="button" key={id} aria-pressed={creationType===id} onClick={()=>{if(id!==creationType){setCreationType(id);changeBrief(brief);}}}><CreationIcon type={id}/><strong>{title}</strong><span>{desc}</span></button>)}</div>
      <details className="ai-context"><summary>{isTraining?`Training profile · ${trainingProfile.programme} · ${trainingProfile.experience}`:`Your class · ${brief.level} · ${profile.courseType} · ${profile.ageGroup}`}</summary><p>These shared details come from Class settings. Save changes here to update future briefs too.</p>{isTraining?<TrainingProfileFields value={trainingProfile} onChange={v=>{setTrainingProfile(v);setProfileDirty(true);changeBrief({...brief,level:v.experience==='Mixed experience'?'Mixed experience':['Two to five years','Over five years'].includes(v.experience)?'Experienced':v.experience==='Under two years'?'Developing':'Foundation'});}}/>:<ClassProfileFields value={profile} onChange={v=>{setProfile(v);setProfileDirty(true);changeBrief({...brief,objectives:!brief.objectives || brief.objectives===profile.goals?v.goals:brief.objectives,context:!brief.context || brief.context===profile.needs?v.needs:brief.context});}}/>}<button type="button" className="btn ai-profile-save" disabled={!profileDirty} onClick={()=>void run('profile',{profile,trainingProfile,level:brief.level})}>Save to class settings</button></details>
      <details className="ai-context"><summary>Build on what came before {evidence?`· ${evidence.counts.items} recent items`:''}</summary><label><input type="checkbox" checked={useEvidence} onChange={e=>{setUseEvidence(e.target.checked);changeBrief(brief);}}/> Use class history and recorded learning evidence</label><p>{evidence?.limitations ?? 'Loading the available class evidence…'}</p>{evidence && <><p>{evidence.counts.submittedTasks} submitted task records · {evidence.counts.portfolioRecords} portfolio records</p><ul>{evidence.recent.map((x,i)=><li key={i}>{x.title}{x.result?` · ${Math.round(100*x.result.score/x.result.total)}% across ${x.result.attempts} task submissions`: ' · No scored submissions in this sample'}</li>)}</ul></>}</details>
      {!isTraining && <fieldset className="ai-context"><legend>Classroom memories</legend>
        <label><input type="checkbox" checked={useLearnerMemories} onChange={e=>{setUseLearnerMemories(e.target.checked);changeBrief(brief);}}/> Refer to learners’ previous responses</label>
        <p>Off by default. When enabled, choose up to five responses below. Selected text and learner display names are sent to the AI and may appear in new examples. Choose details your learners would be comfortable sharing.</p>
        {useLearnerMemories && <><button type="button" disabled={!!busy} onClick={()=>void run('memories')}>Read recent responses</button>
          <p>Submitted writing from this class only. Review the examples before sharing the lesson. Turning this off does not remove references already in a generated plan.</p>
          {memories.length===0?<p>No responses loaded. If none appear after loading, there may be no recent submitted writing available.</p>:memories.map(m=><label key={m.id} className="ai-field"><span><input type="checkbox" checked={memoryIds.includes(m.id)} disabled={!memoryIds.includes(m.id)&&memoryIds.length>=5} onChange={e=>{setMemoryIds(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id));changeBrief(brief);}}/> {m.name} · {m.item} · {m.task}</span><span>{m.text}</span></label>)}
        </>}
      </fieldset>}

      {(['objectives', 'context'] as const).map(k => <label className="ai-field" key={k}><span>{formFields[k]}</span><AutoTextarea aria-label={formFields[k]} placeholder={formFields[`${k}Hint`]} required maxLength={2000}  value={brief[k]} onChange={e => { changeBrief({ ...brief, [k]: e.target.value }); }} /></label>)}
      <div className="ai-objectives">{(brief.additionalObjectives??[]).map((objective,i)=><div className="ai-objective-row" key={i}><label className="ai-field"><span>Additional objective {i+1}</span><AutoTextarea aria-label={`Additional objective ${i+1}`} maxLength={2000} value={objective} onChange={e=>changeBrief({...brief,additionalObjectives:(brief.additionalObjectives??[]).map((x,j)=>j===i?e.target.value:x)})}/></label><button type="button" className="btn" aria-label={`Remove objective ${i+1}`} onClick={()=>changeBrief({...brief,additionalObjectives:(brief.additionalObjectives??[]).filter((_,j)=>j!==i)})}>Remove</button></div>)}<button type="button" className="btn" onClick={()=>changeBrief({...brief,additionalObjectives:[...(brief.additionalObjectives??[]),'']})}>+ Add another objective</button></div>
      {!isTraining&&<label className="ai-field">Level estimate<select value={brief.level} onChange={e => {changeBrief({ ...brief, level: e.target.value });setProfileDirty(true);}}>{(isTraining?['Foundation','Developing','Experienced','Mixed experience']:['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).map(v => <option key={v}>{v}</option>)}</select></label>}
      <label className="ai-field">{creationType==='exam'?'Time limit (minutes)':creationType==='homework'?'Expected time (minutes)':'Minutes'}<input required type="number" min={15} max={180} value={brief.duration} onChange={e => changeBrief({ ...brief, duration: Number(e.target.value) })} /></label>
      {creationType==='lesson'&&<label className="ai-field">Approach<select value={brief.methodology} onChange={e => changeBrief({ ...brief, methodology: e.target.value })}>{(isTraining?['Recommend','Experiential input','Exam preparation','Reflective practice','Workshop']:['Recommend', 'PPP', 'TTT', 'Task-based', 'Guided discovery', 'Text-based', 'Skills']).map(v => <option key={v}>{v}</option>)}</select></label>}
      <button className="btn primary" type="submit">Suggest an outline</button></fieldset></form>}
    {step===1 && outline && <section role="tabpanel" id="creation-panel-1" aria-labelledby="creation-tab-1"><h2>2. Review the outline</h2><p>Edit the outcomes, approach and stages. Stage timings must total {brief.duration} minutes.</p><fieldset disabled={locked}><Fields name="Outline" value={outline} onChange={v => { setOutline(v as RecordValue);setPlan(null);setActivities(null);setMedia([]);setCreatedItemId(''); setDirty(true); }} /><button className="btn primary" onClick={() => void run('plan', { outline, approved: true })}>Approve outline and make the plan</button></fieldset></section>}
    {step===2 && plan && <section role="tabpanel" id="creation-panel-2" aria-labelledby="creation-tab-2"><h2>3. Review and edit</h2><p>This is your private draft. Check the language, tasks and answer keys before teaching.</p>
      <div className="ai-actions"><button className="btn" aria-pressed={tab === 'teacher'} onClick={() => setTab('teacher')}>{isTraining?'Trainer plan':'Teacher plan'}</button><button className="btn" aria-pressed={tab === 'learner'} onClick={() => setTab('learner')}>{isTraining?'Trainee materials':'Learner materials'}</button></div>
      <fieldset disabled={locked}>{tab === 'teacher' ? <Fields name={isTraining?'Trainer plan':'Teacher plan'} value={Object.fromEntries(Object.entries(plan).filter(([k]) => k !== 'learnerMaterials'))} onChange={v => changePlan({ ...(v as RecordValue), learnerMaterials: plan.learnerMaterials })} /> : <Fields name={isTraining?'Trainee materials':'Learner materials'} value={plan.learnerMaterials} onChange={v => changePlan({ ...plan, learnerMaterials: v })} />}</fieldset>
      {review ? <aside className="ai-review"><h3>Quality check</h3>{review.criticalErrors.length > 0 ? <div className="ai-error"><strong>{review.criticalErrors.length} {review.criticalErrors.length===1?'issue needs':'issues need'} your attention</strong><ul>{review.criticalErrors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>:<p>No critical issues flagged. Review the materials before teaching.</p>}<details><summary>Review details · {review.checks.length} checks{review.suggestions.length>0?` · ${review.suggestions.length} suggestions`:''}</summary><ul>{review.checks.map((c,i)=><li key={i}><strong>{c.criterion}: {c.score}/5.</strong> {c.evidence.replace(/^Score:\s*\d\s*\/\s*5\.\s*/i,'')}</li>)}</ul>{review.suggestions.length>0&&<><h4>Suggestions</h4><ul>{review.suggestions.map((text,i)=><li key={i}>{text}</li>)}</ul></>}</details></aside> : <p>Teacher review needed. An earlier AI review does not cover these edits.</p>}
      <div className="ai-actions"><button className="btn" disabled={locked} onClick={() => void run('save', { plan, draftId, version })}>Save private draft</button><button className="btn primary" disabled={locked} onClick={()=>void run('activities',{plan})}>{activities?'Rebuild activities':isTraining?'Prepare training activities':'Prepare class activities'} →</button></div>
    </section>}
    {step===3 && activities && <section role="tabpanel" id="creation-panel-3" aria-labelledby="creation-tab-3" className="ai-ready"><span className="ai-eyebrow">04 · CLASS ACTIVITIES</span><button className="btn" disabled={locked} onClick={()=>setStep(2)}>← Back to {isTraining?'trainer':'teaching'} plan</button><h2>{activities.title}</h2><details className="ai-context"><summary>Teaching decisions</summary><p>{activities.rationale}</p><div className="ai-decisions"><article><h3>Support & stretch</h3><p>{activities.differentiation}</p></article><article><h3>Reconnect & recycle</h3><p>{activities.recycling}</p></article></div></details><div className="ai-activity-browser"><nav aria-label="Activity preview">{activities.tasks.map((t,i)=><button className="btn" key={i} aria-pressed={i===activeActivity} onClick={()=>setActiveActivity(i)}>{i+1}. {t.title}</button>)}</nav><div className="ai-task-cards">{activities.tasks.map((t,i)=>i===activeActivity&&<details key={i} open><summary><span className="ai-task-number">{String(i+1).padStart(2,'0')}</span><strong>{t.title}</strong><span>{t.format} · {t.minutes} min</span></summary><p>{t.instructions}</p>{t.trainingTool&&<p><strong>Trainee completion form:</strong> {t.trainingTool}</p>}<InputBlocks body={t}/><Visuals items={t.visuals}/><SubtaskPreview parts={t.subTasks}/>{t.versions?.map(v=><details key={v.label}><summary>{v.label} · alternative task</summary><p>{v.reason}</p><p>{v.instructions}</p><InputBlocks body={v}/><Visuals items={v.visuals}/><SubtaskPreview parts={v.subTasks}/>{v.questions.map((q,j)=><div key={j}><p>{q.prompt}</p>{q.options.length>0&&<ul>{q.options.map(o=><li key={o}>{o}</li>)}</ul>}<details><summary>Answer &amp; rationale</summary><p>{q.answer}</p><p>{q.explanation}</p></details></div>)}</details>)}{t.roles?.map(r=><details key={r.label}><summary>Role {r.label} · separate version</summary><p className="ai-preserve">{r.input}</p></details>)}{t.teacherOnlyInput&&<details><summary>Teacher-only reference & reveal prompts</summary><p className="ai-preserve">{t.teacherOnlyInput}</p></details>}{t.questions.map((q,j)=><div key={j}><p>{q.prompt}</p>{q.options.length>0&&<ul>{q.options.map(o=><li key={o}>{o}</li>)}</ul>}<details><summary>Answer & rationale</summary><p>{q.answer}</p><p>{q.explanation}</p></details></div>)}{t.support&&<p><strong>Optional support:</strong> {t.support}</p>}{t.challenge&&<p><strong>Optional challenge:</strong> {t.challenge}</p>}</details>)}</div></div>{creationType!=='exam'&&!createdItemId&&<label><input type="checkbox" checked={createVariants} onChange={e=>setCreateVariants(e.target.checked)}/> Create the suggested alternative tasks, where useful. Everyone starts on Standard; you decide who receives another version in Classes.</label>}<section className="ai-media-status" aria-label="Lesson media"><h3>Images &amp; recordings</h3>{media.length===0?<p>No generated media needed for this lesson.</p>:media.map(m=><div key={m.id}><strong>{m.title}</strong><span>{m.status==='ready'?'Saved and ready':m.status==='failed'?m.error:m.status==='running'?'Preparing…':'Queued'}</span>{m.status==='failed'&&<button className="btn" disabled={!!busy} onClick={()=>void run('retryMedia',{sourceRequestId,assetId:m.id})}>Retry {m.kind}</button>}</div>)}</section><div className="ai-create-bar"><p>All activities remain editable. Created content starts hidden from learners.</p>{createdItemId?<Link className="btn primary" to={`/class/${classId}/lesson/${createdItemId}`}>Open in Classes →</Link>:<button className="btn primary" disabled={locked||!mediaReady} onClick={()=>void run('create',{sourceRequestId,createVariants})}>Create {isTraining&&creationType==='lesson'?'session':creationType} in Classes →</button>}</div></section>}
    {(busy||preparingMedia) && <GenerationProgress backHref={`/class/${classId}`} action={busy||'media'} media={media} useEvidence={useEvidence} evidenceCount={evidence?.counts.items ?? 0}/>} 
  </main></MaterialNames.Provider>;
}
