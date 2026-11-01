import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { JSONContent } from '@tiptap/react';
import type { AnswerKey } from '../lib/questions';
import { TaskRenderer } from '../components/TaskRenderer';
import { VideoDialog } from '../video/VideoDialog';
import '../video/video.css';
import './LessonTools.css';
type Mode='answers'|'differentiate'|'next';
type Idea={title:string;reason:string;direction:string;kind:'support'|'challenge'|'next'};
type Result={ideas?:Idea[];entries?:{taskId:string;questionId:string;reason:string;key:Record<string,unknown>}[];issues?:string[];activity?:{title:string;instructions:string};native?:{content:JSONContent;key:AnswerKey;notes:string}};
type Media={id:string;title:string;status:string;error?:string};
type Reply={status?:string;result?:Result;media?:Media[];error?:string;applied?:boolean;taskId?:string};
type Pending={id:string;mode:Mode;step:'ideas'|'generate';scope:string};
const call=httpsCallable<Record<string,unknown>,Reply>(getFunctions(undefined,'us-central1'),'lessonAssistant',{timeout:420000});
const labels:Record<Mode,string>={answers:'Generate answer key',differentiate:'Differentiate activity',next:'Suggest next activity'};
export function LessonTools({classId,itemId,taskId,beforeOpen,onApplied}:{classId:string;itemId:string;taskId?:string;beforeOpen:()=>Promise<void>;onApplied:(id:string)=>void}) {
 const [open,setOpen]=useState<Mode|null>(null);
 return <><div className="lesson-tool-toolbar" aria-label="AI lesson tools">{(Object.keys(labels) as Mode[]).map(mode=><button key={mode} className="btn small" onClick={()=>void beforeOpen().then(()=>setOpen(mode)).catch(()=>{})}>{labels[mode]}</button>)}</div>{open&&<LessonToolDialog classId={classId} itemId={itemId} taskId={taskId} mode={open} onClose={()=>setOpen(null)} onApplied={onApplied}/>}</>;
}
export function LessonToolDialog({classId,itemId,taskId,mode,onClose,onApplied,initialDirection='',initialMinutes=10}:{classId:string;itemId:string;taskId?:string;mode:Mode;onClose:()=>void;onApplied:(id:string)=>void;initialDirection?:string;initialMinutes?:number}) {
 const storageKey=`lesson-tool:${classId}:${itemId}:${mode}`;
 const [pending,setPending]=useState<Pending|null>(()=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null');}catch{return null;}});
 const [direction,setDirection]=useState(initialDirection),[scope,setScope]=useState(mode==='answers'?'lesson':'activity'),[minutes,setMinutes]=useState(initialMinutes);
 const [result,setResult]=useState<Result|null>(null),[media,setMedia]=useState<Media[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [selected,setSelected]=useState<Idea|null>(null);
 const remember=(p:Pending|null)=>{setPending(p);if(p)localStorage.setItem(storageKey,JSON.stringify(p));else localStorage.removeItem(storageKey);};
 const accept=(r:Reply)=>{if(r.status==='failed'){setError(r.error||'This request did not finish. Your lesson is unchanged.');remember(null);}else if(r.result){setResult(r.result);setMedia(r.media??[]);if(r.result.ideas)remember(null);}};
 const recover=async()=>{if(!pending)return;setBusy(true);setError('');try{accept((await call({action:'taskToolsStatus',classId,itemId,requestId:pending.id})).data);}catch(e){setError(e instanceof Error?e.message:'Could not recover the draft.');}finally{setBusy(false);}};
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const mediaPending=media.some(a=>a.status==='queued'||a.status==='running');
 useEffect(()=>{if(!mediaPending||!pending)return;const timer=window.setInterval(()=>{void call({action:'taskToolsStatus',classId,itemId,requestId:pending.id}).then(r=>accept(r.data)).catch(()=>setError('Could not refresh media progress. Use Recover draft.'));},4000);return()=>window.clearInterval(timer);},[mediaPending,pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 const start=async(step:'ideas'|'generate')=>{
  if(mode==='differentiate'&&!taskId){setError('Select an activity first.');return;}
  if(step==='generate'&&mode!=='answers'&&!selected&&!direction.trim()){setError('Choose an idea or describe the activity you want.');return;}
  setBusy(true);setError('');setResult(null);setMedia([]);
  const p:Pending={id:crypto.randomUUID(),mode,step,scope};remember(p);
  try{accept((await call({action:'taskTools',classId,itemId,taskId:taskId??'',requestId:p.id,mode,step,scope,minutes,direction:[selected?.direction,direction].filter(Boolean).join('\n').slice(0,2500),variantLabel:selected?.kind==='challenge'?'Challenge':'Supported'})).data);}catch(e){try{const saved=(await call({action:'taskToolsStatus',classId,itemId,requestId:p.id})).data;accept(saved);if(saved.status==='running')setError('The request is still running. Use Recover draft to check again.');}catch{setError('We could not confirm whether the draft finished. Your lesson is unchanged. Use Recover draft to check before starting again.');}}finally{setBusy(false);}
 };
 const started=useRef(false);
 useEffect(()=>{if(!started.current){started.current=true;if(mode!=='answers'&&!pending&&!initialDirection)void start('ideas');}},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const apply=async()=>{if(!pending)return;setBusy(true);setError('');try{const r=(await call({action:'taskToolsApply',classId,itemId,requestId:pending.id})).data;if(r.applied){remember(null);onApplied(r.taskId??taskId??'');onClose();}}catch(e){setError(e instanceof Error?e.message:'Could not apply the draft.');}finally{setBusy(false);}};
 const applyReady=!!pending&&!busy&&!media.some(a=>a.status!=='ready')&&!!(result?.native||result?.entries?.length);
 return <VideoDialog name={labels[mode]} onClose={()=>{if(!busy)onClose();}}><div className="lesson-tool-dialog"><header><div><small>TEACHER WORKSPACE</small><h2>{labels[mode]}</h2></div><button className="btn" disabled={busy} onClick={onClose}>Close</button></header>
 <p>{mode==='answers'?'Fill missing inline answers and suggested responses. Your existing answers stay as they are.':mode==='differentiate'?'Change the support or challenge while keeping the learning aim. The result becomes a separate version of this activity.':'Choose a purposeful next step based on the lesson so far. The new activity will be added at the end.'}</p>
 {mode==='answers'&&<label>Answer-key scope<select value={scope} disabled={busy||!!pending} onChange={e=>setScope(e.target.value)}><option value="lesson">Whole lesson</option><option value="activity">Selected activity</option></select></label>}
 {mode!=='answers'&&<label>Activity length (minutes)<input type="number" min={1} max={60} value={minutes} disabled={busy||!!pending} onChange={e=>setMinutes(Math.max(1,Math.min(60,Number(e.target.value)||10)))}/></label>}
 {result?.ideas&&<div className="lesson-tool-ideas">{result.ideas.map((idea,i)=><button key={i} type="button" aria-pressed={selected===idea} className={'lesson-tool-idea '+(selected===idea?'selected':'')} onClick={()=>setSelected(idea)}><small>{idea.kind==='support'?'More support':idea.kind==='challenge'?'More challenge':'Option '+(i+1)}</small><strong>{idea.title}</strong><span>{idea.reason}</span><span>{idea.direction}</span></button>)}</div>}
 {!result?.native&&!result?.entries&&<><label>{mode==='answers'?'Extra guidance (optional)':'Your direction (optional)'}<textarea rows={2} maxLength={2000} value={direction} disabled={busy||!!pending} onChange={e=>setDirection(e.target.value)} placeholder={mode==='differentiate'?'For example, add a word bank and one worked example.':mode==='next'?'For example, a pair task where learners use the language to make a decision.':'For example, accept both British and American spelling.'}/></label>
 {!pending&&<div className="lesson-tool-actions">{mode!=='answers'&&<button className="btn" disabled={busy} onClick={()=>void start('ideas')}>Suggest two options</button>}<button className="btn primary" disabled={busy} onClick={()=>void start('generate')}>{mode==='answers'?'Generate missing answers':mode==='differentiate'?'Create differentiated version':'Create next activity'}</button></div>}</>}
 {busy&&<div role="status" className="lesson-tool-progress"><span className="lesson-tool-spinner" aria-hidden="true"/><strong>{result?'Saving your reviewed changes…':'Reading the lesson and preparing your draft…'}</strong><p>Your existing lesson stays unchanged until you apply the result.</p></div>}
 {pending&&!busy&&!result&&<button className="btn" onClick={()=>void recover()}>Recover draft</button>}
 {error&&<p role="alert">{error}</p>}
 {result?.issues?.map((issue,i)=><p className="hint" key={i}>{issue}</p>)}
 {result?.entries&&<div className="lesson-tool-keys"><h3>{result.entries.length} missing answers prepared</h3>{result.entries.map((e,i)=><article key={e.taskId+e.questionId}><strong>{i+1}. {String(e.key.model??e.key.answer??(Array.isArray(e.key.answers)?e.key.answers.join(' / '):e.reason))}</strong>{e.reason&&<p>{e.reason}</p>}</article>)}</div>}
 {result?.native&&<section className="lesson-tool-preview"><h3>{result.activity?.title}</h3><p><strong>{result.activity?.instructions}</strong></p><TaskRenderer classId={classId} content={result.native.content} responses={{}} disabled teacher revealed={result.native.key}/><details><summary>Teacher notes</summary><p style={{whiteSpace:'pre-wrap'}}>{result.native.notes}</p></details></section>}
 {!!media.length&&<ul aria-label="Activity media">{media.map(a=><li key={a.id}>{a.title} — {a.status==='ready'?'Ready':a.status==='failed'?'Preparation failed': 'Preparing…'}{a.status==='failed'&&<button className="btn small" onClick={()=>{if(pending)void call({action:'taskToolsRetryMedia',classId,itemId,requestId:pending.id,assetId:a.id}).then(()=>recover()).catch(()=>setError('Could not retry this media. Please try again.'));}}>Retry media</button>}</li>)}</ul>}
 {applyReady&&<button className="btn primary" onClick={()=>void apply()}>{mode==='answers'?'Apply answer key':mode==='differentiate'?'Add differentiated version':'Add activity to lesson'}</button>}
 {pending&&!busy&&<button className="btn" onClick={()=>{remember(null);setResult(null);setMedia([]);setError('');}}>Start a new draft</button>}
 </div></VideoDialog>;
}
