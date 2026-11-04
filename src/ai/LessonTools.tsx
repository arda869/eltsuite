import { AiButton } from '../components/AiMark';
import { AI_ALLOWANCE, AiActions, AiDraft, AiExamples, AiField, AiHeader, AiMore, AiNotice, AiUses, AiWorking } from './kit';
import { useAiActivity } from '../components/AiActivity';
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
type Reply={status?:string;result?:Result;media?:Media[];error?:string;applied?:boolean;taskId?:string;requestId?:string};
type Pending={id:string;mode:Mode;step:'ideas'|'generate';scope:string};
const call=httpsCallable<Record<string,unknown>,Reply>(getFunctions(undefined,'us-central1'),'lessonAssistant',{timeout:420000});
const labels:Record<Mode,string>={answers:'Generate answer key',differentiate:'Differentiate activity',next:'Suggest next activity'};
export function LessonTools({classId,itemId,taskId,contextKey='',enabled=true,beforeOpen,onApplied}:{classId:string;itemId:string;taskId?:string;contextKey?:string;enabled?:boolean;beforeOpen:()=>Promise<void>;onApplied:(id:string)=>void}) {
 const [open,setOpen]=useState<Mode|null>(null);
 const lastWarm=useRef(0);
 useEffect(()=>{
  if(!enabled)return;
  const timer=window.setTimeout(()=>{if(document.hidden)return;lastWarm.current=Date.now();void call({action:'taskToolsIdeas',classId,itemId,direction:'',minutes:10,background:true}).catch(()=>{});},Math.max(8000,60000-(Date.now()-lastWarm.current)));
  return()=>window.clearTimeout(timer);
 },[classId,itemId,contextKey,enabled]);
 return <><div className="lesson-tool-toolbar" aria-label="AI lesson tools">{(Object.keys(labels) as Mode[]).map(mode=><AiButton key={mode} className="btn small" onClick={()=>void beforeOpen().then(()=>setOpen(mode)).catch(()=>{})}>{labels[mode]}</AiButton>)}</div>{open&&<LessonToolDialog classId={classId} itemId={itemId} taskId={taskId} mode={open} onClose={()=>setOpen(null)} onApplied={onApplied}/>}</>;
}
export function LessonToolDialog({classId,itemId,taskId,mode,onClose,onApplied,onBlank,onImport}:{classId:string;itemId:string;taskId?:string;mode:Mode;onClose:()=>void;onApplied:(id:string)=>void;onBlank?:()=>void;onImport?:()=>void}) {
 const storageKey=`lesson-tool:${classId}:${itemId}:${mode}`;
 const [pending,setPending]=useState<Pending|null>(()=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null');}catch{return null;}});
 const [direction,setDirection]=useState(''),[scope,setScope]=useState(mode==='answers'?'lesson':'activity'),[minutes,setMinutes]=useState(10);
 const [result,setResult]=useState<Result|null>(null),[media,setMedia]=useState<Media[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [selected,setSelected]=useState<Idea|null>(null);
 const remember=(p:Pending|null)=>{setPending(p);if(p)localStorage.setItem(storageKey,JSON.stringify(p));else localStorage.removeItem(storageKey);};
 const accept=(r:Reply)=>{if(r.status==='failed'){setError(r.error||'This request did not finish. Your lesson is unchanged.');remember(null);}else if(r.result){setResult(r.result);setMedia(r.media??[]);if(r.result.ideas)remember(null);}};
 const recover=async()=>{if(!pending)return;setBusy(true);setError('');try{accept((await call({action:'taskToolsStatus',classId,itemId,requestId:pending.id})).data);}catch(e){setError(e instanceof Error?e.message:'Could not recover the draft.');}finally{setBusy(false);}};
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const mediaPending=media.some(a=>a.status==='queued'||a.status==='running');
 const ideasPending=!!pending&&pending.step==='ideas'&&!result;
 const activity=useAiActivity({active:busy||mediaPending||ideasPending,title:labels[mode],detail:mediaPending?'Preparing activity media…':'Preparing your draft…',error,autoMinimise:true});
 useEffect(()=>{if(!pending||busy||!mediaPending&&!ideasPending)return;const timer=window.setInterval(()=>{void call({action:'taskToolsStatus',classId,itemId,requestId:pending.id}).then(r=>accept(r.data)).catch(()=>setError('Could not refresh preparation progress. Use Recover draft.'));},4000);return()=>window.clearInterval(timer);},[mediaPending,pending?.id,busy,ideasPending]); // eslint-disable-line react-hooks/exhaustive-deps
 const start=async(step:'ideas'|'generate')=>{
  if(mode==='differentiate'&&!taskId){setError('Select an activity first.');return;}
  if(step==='generate'&&mode!=='answers'&&!selected&&!direction.trim()){setError('Choose an idea or describe the activity you want.');return;}
  setBusy(true);setError('');setResult(null);setMedia([]);
  if(mode==='next'&&step==='ideas'){
   try{const r=(await call({action:'taskToolsIdeas',classId,itemId,minutes,direction})).data;if(r.status==='running'&&r.requestId)remember({id:r.requestId,mode,step,scope});accept(r);}
   catch(e){setError(e instanceof Error?e.message:'Could not prepare ideas. Please try again.');}
   finally{setBusy(false);}return;
  }
  const p:Pending={id:crypto.randomUUID(),mode,step,scope};remember(p);
  try{accept((await call({action:'taskTools',classId,itemId,taskId:taskId??'',requestId:p.id,mode,step,scope,minutes,direction:[selected?.direction,direction].filter(Boolean).join('\n').slice(0,2500),variantLabel:selected?.kind==='challenge'?'Challenge':'Supported'})).data);}catch(e){try{const saved=(await call({action:'taskToolsStatus',classId,itemId,requestId:p.id})).data;accept(saved);if(saved.status==='running')setError('The request is still running. Use Recover draft to check again.');}catch{setError('We could not confirm whether the draft finished. Your lesson is unchanged. Use Recover draft to check before starting again.');}}finally{setBusy(false);}
 };
 const started=useRef(false);
 // When opening from “New task”, show the blank/import choices before any AI
 // request starts. An automatic request minimises this dialog and hides them.
 useEffect(()=>{if(!started.current){started.current=true;if(mode!=='answers'&&!pending&&!onBlank)void start('ideas');}},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const apply=async()=>{if(!pending)return;setBusy(true);setError('');try{const r=(await call({action:'taskToolsApply',classId,itemId,requestId:pending.id})).data;if(r.applied){remember(null);onApplied(r.taskId??taskId??'');onClose();}}catch(e){setError(e instanceof Error?e.message:'Could not apply the draft.');}finally{setBusy(false);}};
 const applyReady=!!pending&&!busy&&!media.some(a=>a.status!=='ready')&&!!(result?.native||result?.entries?.length);
 const ready=!!(result?.native||result?.entries);
 const lede=mode==='answers'?'Fills in missing inline answers and suggested responses. Answers you’ve written stay as they are.':mode==='differentiate'?'A version of this activity with more support or more challenge, keeping the same learning aim. It’s added as a separate version.':'A purposeful next step that follows what the lesson has done so far. It’s added at the end.';
 const examples=mode==='differentiate'?['Add a word bank and one worked example','Remove the scaffolding and ask for full sentences','Shorter text, same questions']:mode==='next'?['A pair task where learners use the language to make a decision','A short writing task that reuses today’s vocabulary','A quick game to review the key language']:['Accept both British and American spelling','Keep model answers under 20 words'];
 const retry=()=>{setError('');if(pending&&!result)void recover();else void start(mode==='next'&&!selected&&!direction.trim()?'ideas':'generate');};
 return <VideoDialog portal minimised={activity.minimised} onMinimise={activity.minimise} name={labels[mode]} onClose={()=>{if(!busy)onClose();}}><div className="lesson-tool-dialog">
 <AiHeader title={onBlank?'Create an activity':labels[mode]} lede={onBlank?'Start from a blank activity, bring in existing material, or let AI suggest the next step.':lede} onClose={onClose} closeDisabled={busy}>
  <AiUses items={['This lesson',taskId?'The selected activity':false,'Your class profile']}/>
 </AiHeader>
 {onBlank&&<AiActions><button className="btn" disabled={busy} onClick={onBlank}>Start blank</button>{onImport&&<button className="btn" disabled={busy} onClick={onImport}>Upload existing material</button>}</AiActions>}
 {result?.ideas&&!ready&&<div className="lesson-tool-ideas" role="group" aria-label="Suggested options">{result.ideas.map((idea,i)=><button key={i} type="button" aria-pressed={selected===idea} className={'lesson-tool-idea '+(selected===idea?'selected':'')} disabled={busy} onClick={()=>setSelected(idea)}><small>{idea.kind==='support'?'More support':idea.kind==='challenge'?'More challenge':'Option '+(i+1)}</small><strong>{idea.title}</strong><span>{idea.reason}</span><span className="lesson-tool-idea-direction">{idea.direction}</span></button>)}</div>}
 {!ready&&<>
  <AiField label={mode==='answers'?'Anything the AI should know':'What would you like?'} optional hint={mode==='answers'?'Rules for marking, spellings to accept, how long model answers should be.':result?.ideas?'Pick an option above, or describe your own.':'Describe the activity in a sentence, or ask for options.'}>
   <textarea rows={2} maxLength={2000} value={direction} disabled={busy||!!pending} onChange={e=>setDirection(e.target.value)} placeholder={examples[0]}/>
  </AiField>
  <AiExamples examples={examples} disabled={busy||!!pending} onPick={setDirection}/>
  <AiMore summary="Options">
   {mode==='answers'&&<AiField label="Answer-key scope"><select value={scope} disabled={busy||!!pending} onChange={e=>setScope(e.target.value)}><option value="lesson">Whole lesson</option><option value="activity">Selected activity</option></select></AiField>}
   {mode!=='answers'&&<AiField label="Activity length (minutes)"><input type="number" min={1} max={60} value={minutes} disabled={busy||!!pending} onChange={e=>setMinutes(Math.max(1,Math.min(60,Number(e.target.value)||10)))}/></AiField>}
  </AiMore>
  {!pending&&!busy&&<AiActions note={AI_ALLOWANCE}>
   <AiButton className="btn primary" onClick={()=>void start('generate')}>{mode==='answers'?'Fill in missing answers':mode==='differentiate'?'Make the version':'Make the activity'}</AiButton>
   {mode!=='answers'&&<AiButton className="btn" onClick={()=>void start('ideas')}>{result?.ideas?'Suggest two more':'Suggest two options'}</AiButton>}
  </AiActions>}
 </>}
 {busy&&<AiWorking title={result&&ready?'Saving your reviewed changes…':pending?.step==='ideas'||(!pending&&mode!=='answers'&&!selected&&!direction.trim())?'Thinking of options…':'Preparing your draft…'} detail="Your lesson stays unchanged until you apply the result. You can close this and come back; the draft is kept." steps={mode==='answers'?['Reading the lesson','Solving each question','Checking the answers']:['Reading the lesson','Writing the activity','Checking it and solving the key']} step={1}/>}
 {pending&&!busy&&!result&&<AiNotice kind="info" action={()=>void recover()} actionLabel="Check progress">{pending.step==='ideas'?'Options are still being prepared in the background. This panel updates when they’re ready.':'Your draft is saved and still being prepared.'}</AiNotice>}
 {error&&<AiNotice kind="error" action={retry} actionDisabled={busy}>{error}</AiNotice>}
 {result?.issues?.map((issue,i)=><AiNotice kind="info" key={i}>{issue}</AiNotice>)}
 {result?.entries&&<AiDraft title={`${result.entries.length} missing ${result.entries.length===1?'answer':'answers'} prepared`} actions={applyReady&&<button className="btn primary" onClick={()=>void apply()}>Apply answer key</button>} note="Only empty answers are filled. You can edit any of them in the lesson afterwards.">
  <ol className="aik-items">{result.entries.map(e=><li key={e.taskId+e.questionId}><span><span className="aik-item-answer">{String(e.key.model??e.key.answer??(Array.isArray(e.key.answers)?e.key.answers.join(' / '):e.reason))}</span>{e.reason&&<p className="aik-item-sub">{e.reason}</p>}</span></li>)}</ol>
 </AiDraft>}
 {result?.native&&<AiDraft title={result.activity?.title} meta={mode==='differentiate'?(selected?.kind==='challenge'?'More challenge':'More support'):`${minutes} minutes`} actions={applyReady&&<button className="btn primary" onClick={()=>void apply()}>{mode==='differentiate'?'Add differentiated version':'Add activity to lesson'}</button>}>
  <p className="lesson-tool-instructions">{result.activity?.instructions}</p>
  <div className="lesson-tool-preview"><TaskRenderer classId={classId} content={result.native.content} responses={{}} disabled teacher revealed={result.native.key}/></div>
  {result.native.notes&&<AiMore summary="Teacher notes"><p style={{whiteSpace:'pre-wrap',margin:0}}>{result.native.notes}</p></AiMore>}
 </AiDraft>}
 {!!media.length&&<ul className="lesson-tool-media" aria-label="Activity media">{media.map(a=><li key={a.id}><span className={'lesson-tool-media-dot '+a.status} aria-hidden="true"/>{a.title}<small>{a.status==='ready'?'Ready':a.status==='failed'?'Didn’t finish':'Preparing…'}</small>{a.status==='failed'&&<button className="btn small-btn" onClick={()=>{if(pending)void call({action:'taskToolsRetryMedia',classId,itemId,requestId:pending.id,assetId:a.id}).then(()=>recover()).catch(()=>setError('We couldn’t retry this media. Please try again.'));}}>Retry</button>}</li>)}</ul>}
 {pending&&!busy&&<AiActions><button className="btn link" onClick={()=>{remember(null);setResult(null);setMedia([]);setError('');setSelected(null);}}>Start a new draft</button></AiActions>}
 </div></VideoDialog>;
}
