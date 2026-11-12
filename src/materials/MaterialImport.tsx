import { teacherPanel } from '../ai/teacherPanel';
import { AiNotice } from '../ai/kit';
import { AiButton, AiProgress } from '../components/AiMark';
import { useAiActivity } from '../components/AiActivity';
import {importPicturePlans} from '../../functions/ai/import-pictures.js';
import {ImportPictures,type PreparedPicture} from './ImportPictures';
import {useTrainingClass} from '../training/Training';
import {ImportTaskPreview} from './ImportTaskPreview';
import {ImportElementEditor} from './ImportElementEditor';
import {IMPORT_TYPE_BY_KIND,newImportElement,type ImportElement} from '../../functions/ai/import-types.js';
import { useEffect,useRef,useState } from 'react';
import { getFunctions,httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { UiIcon } from '../components/UiIcon';
import { ACCEPT,readMaterialSafely,type MaterialSource } from './readSource';
import { ScreenGrabButton } from './ScreenGrab';
import './materials.css';
type Value=string|number|boolean|null|Value[]|{[key:string]:Value};
export type Rebuilt={title:string;rationale:string;differentiation:string;recycling:string;warnings:string[];tasks:{title:string;[key:string]:Value}[]};
type SourceCheck={stageId:string;status:'passed'|'repaired'|'needsReview';summary:string;issues:{problem:string;sourceEvidence:string;improvement:string}[]};
const VERSION='materials-2026-11-01';
const PICTURES='Screenshots and pictures';
export function ImportMaterialsButton({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){return <button type="button" className="btn" disabled={disabled} onClick={onClick}><UiIcon name="task" size={17}/> Import a task</button>;}
function Editable({value,name,onChange,training=false}:{value:Value;name:string;onChange:(value:Value)=>void;training?:boolean}){
 if(typeof value==='boolean')return <label className="mi-check"><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{name}</label>;
 if(value===null)return null;
 if(typeof value==='string')return <label className="mi-field">{name}<textarea aria-label={name} rows={value.length>150?4:2} value={value} onChange={e=>onChange(e.target.value)}/></label>;
 if(typeof value==='number')return <label className="mi-field">{name}<input aria-label={name} type="number" value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
 if(Array.isArray(value)&&name.endsWith('Inline Elements'))return <section className="mi-elements" aria-label={name}><h4>Native inline tasks</h4>{value.map((v,i)=><div className="mi-element-wrap" key={i}><ImportElementEditor element={v as unknown as ImportElement} training={training} name={`${name} ${i+1}`} onChange={e=>onChange(value.map((x,j)=>j===i?e as unknown as Value:x))}/><button type="button" className="btn small-btn" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>Remove inline task {i+1}</button></div>)}<button type="button" className="btn" onClick={()=>onChange([...value,newImportElement('shortAnswer') as unknown as Value])}>Add inline task</button></section>;
 if(Array.isArray(value))return value.length?<fieldset><legend>{name}</legend>{value.map((v,i)=><Editable training={training} key={i} name={`${name} ${i+1}`} value={v} onChange={n=>onChange(value.map((x,j)=>j===i?n:x))}/>)}</fieldset>:null;
 return <>{Object.entries(value).filter(([k])=>!['stageId','format','kind','layout','imageLayout','mediaPlan','roles','versions'].includes(k)).map(([k,v])=><Editable training={training} key={k} name={`${name} · ${k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}`} value={v} onChange={n=>onChange({...value,[k]:n})}/>)}</>;
}
function typeSummary(task:Rebuilt['tasks'][number]):string {
 const counts=new Map<string,number>();const visit=(value:Value)=>{if(!value||typeof value!=='object'||Array.isArray(value))return;const elements=Array.isArray(value.inlineElements)?value.inlineElements:[];for(const el of elements){if(el&&typeof el==='object'&&!Array.isArray(el)&&typeof el.kind==='string'){const name=IMPORT_TYPE_BY_KIND.get(el.kind)?.label||el.kind;counts.set(name,(counts.get(name)??0)+1);}}if(Array.isArray(value.subTasks))value.subTasks.forEach(visit);};visit(task);
 return [...counts].map(([name,n])=>name+(n>1?' × '+n:'')).join(' · ');
}
function normalizeReview(value:Rebuilt):Rebuilt{return {...value,tasks:value.tasks.map(t=>({...t,inlineElements:t.inlineElements??[],subTasks:Array.isArray(t.subTasks)?t.subTasks.map(st=>typeof st==='object'&&st!==null&&!Array.isArray(st)?{...st,inlineElements:st.inlineElements??[]}:st):[]}))};}
function MaterialImportPanel({classId,itemId,creationType='lesson',onClose,onDone}:{classId:string;itemId?:string;creationType?:string;onClose:()=>void;onDone:(itemId:string,taskId:string)=>void}){
 const training=useTrainingClass(classId);
 const [sourcePreviews,setSourcePreviews]=useState<string[]>([]),[prepared,setPrepared]=useState<Record<string,PreparedPicture>>({});
 const [checks,setChecks]=useState<SourceCheck[]>([]),[editedTasks,setEditedTasks]=useState<Set<string>>(new Set());
 const [type]=useState(creationType),[source,setSource]=useState<MaterialSource|null>(null),[paste,setPaste]=useState(''),[pages,setPages]=useState(''),[instructions,setInstructions]=useState(''),[rights,setRights]=useState(false),[reviewed,setReviewed]=useState(false),[sourceCheckUpdated,setSourceCheckUpdated]=useState(false),[rebuilt,setRebuilt]=useState<Rebuilt|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[requestId,setRequestId]=useState(''),[recover,setRecover]=useState(false),[seconds,setSeconds]=useState(0);
 const [over,setOver]=useState(false);
 const root=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null),mounted=useRef(true),reading=useRef<AbortController|null>(null);
 const activity=useAiActivity({active:!!busy&&busy!=='Reading your file locally',title:'Import materials',detail:busy,error});
 const storageKey=`material-import:${classId}:${itemId||'new'}`;
 useEffect(()=>{mounted.current=true;const previous=document.activeElement as HTMLElement;root.current?.focus();try{const id=sessionStorage.getItem(storageKey);if(id){setRequestId(id);setRecover(true);}}catch{}return()=>{mounted.current=false;reading.current?.abort();reading.current=null;previous?.focus();};},[storageKey]);
 useEffect(()=>{if(!source&&!paste&&!rebuilt&&!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[source,paste,rebuilt,busy]);
 useEffect(()=>{if(!busy)return;setSeconds(0);const id=setInterval(()=>setSeconds(n=>n+1),1000);return()=>clearInterval(id);},[busy]);
 const call=async(data:Record<string,unknown>)=>(await httpsCallable<Record<string,unknown>,{sourcePreviews?:string[];rebuilt?:Rebuilt;checks?:SourceCheck[];pictureId?:string;preview?:string;qualityPassed?:boolean;summary?:string;issues?:string[];needsReview?:boolean;status?:string;phase?:string;createdItemId?:string;taskId?:string}>(getFunctions(app,'us-central1'),'lessonAssistant',{timeout:420000})({classId,...data})).data;
 async function preparePictures(value:Rebuilt,images:string[],id:string):Promise<Rebuilt>{
  let next=structuredClone(value);const plans=importPicturePlans(next);
  // Illustrations are recreated three at a time rather than one after another: each takes
  // a minute or more, and they don't depend on each other.
  const todo=plans.filter(plan=>images[plan.sourceImage-1]);let done=0;
  const one=async(plan:typeof plans[number])=>{
   try{
    let r=await call({action:'rebuildPicture',requestId:id,picture:plan});
    for(let attempts=0;r.status==='running'&&attempts<170;attempts++){await new Promise(resolve=>setTimeout(resolve,2000));r=await call({action:'rebuildPictureStatus',requestId:id,picture:plan});}
    if(r.pictureId){setPrepared(old=>({...old,[r.pictureId!]:r as PreparedPicture}));if(r.status==='ready'&&r.preview)plan.asset=r.pictureId;else setError(r.summary||'The source illustration is not ready. Check its status or adjust its crop before retrying.');}
   }catch(e){setError((e as Error).message||'The illustration could not be recreated. It will stay hidden for setup.');}
   finally{done++;if(mounted.current&&todo.length)setBusy(`Recreating source illustrations: ${done} of ${todo.length} ready`);}
  };
  if(todo.length)setBusy(`Recreating source illustrations: 0 of ${todo.length} ready`);
  const queue=[...todo];
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(queue.length)await one(queue.shift()!);}));
  const readyRefs=new Set(importPicturePlans(next).filter(p=>p.asset).map(p=>p.ref));
  for(const t of next.tasks)for(const b of [t,...(Array.isArray(t.subTasks)?t.subTasks:[])]){const body=b as Record<string,Value>;for(const item of Array.isArray(body.inlineElements)?body.inlineElements:[]){const el=item as unknown as ImportElement,images=el.kind==='pq-label'?[String(el.data.image)]:el.kind==='pq-speaking'?el.data.images as string[]:[];if(el.kind==='picture'&&el.data.asset||images.length&&images.every(image=>image.startsWith('picture:')&&readyRefs.has(image.slice(8))))el.needs=(el.needs??[]).filter(n=>n!=='picture');}}
  return next;
 }
 async function prepareAgain(){if(!rebuilt)return;setError('');try{setRebuilt(await preparePictures(rebuilt,sourcePreviews,requestId));setReviewed(false);setEditedTasks(new Set(rebuilt.tasks.map(t=>String(t.stageId))));}finally{setBusy('');}}
 const close=()=>{if(busy)return;if((rebuilt||paste||source)&&!window.confirm('Close this import? Unsaved review edits will be lost. Your original and existing work stay unchanged.'))return;onClose();};
 const reset=()=>{setRebuilt(null);setReviewed(false);setSourceCheckUpdated(false);setError('');setPrepared({});setSourcePreviews([]);setRequestId('');setRecover(false);try{sessionStorage.removeItem(storageKey);}catch{}};
 async function upload(f:File){if(reading.current)return;const controller=new AbortController();reading.current=controller;setBusy('Reading your file locally');setError('');try{const s=await readMaterialSafely(f,pages,controller.signal);if(mounted.current&&reading.current===controller){reset();setRights(false);setSource(s);setSourcePreviews(s.images);setPaste('');}}catch(e){if(mounted.current&&reading.current===controller)setError((e as Error).message);}finally{if(reading.current===controller){reading.current=null;if(mounted.current)setBusy('');if(file.current)file.current.value='';}}}

 // Screenshots and pictures: pasted, dropped or chosen, up to six, read together as one source.
 // Anything else (a PDF, a Word file…) is read on its own, as before.
 async function addFiles(list:File[]){
  if(!list.length||reading.current)return;
  const pics=list.filter(f=>f.type.startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(f.name));
  if(!pics.length||pics.length<list.length){await upload(list.find(f=>!pics.includes(f))??list[0]);return;}
  const keep=source&&!source.text.trim()&&source.name===PICTURES?source:null;
  if((keep?.images.length??0)+pics.length>6){setError('You can add up to six screenshots or pictures at a time. Remove one, or import the rest separately.');return;}
  const controller=new AbortController();reading.current=controller;setBusy('Reading your file locally');setError('');
  try{
   const out:MaterialSource={name:PICTURES,text:'',images:[...(keep?.images??[])],imageLabels:[...(keep?.imageLabels??[])],warnings:[]};
   for(const f of pics){const one=await readMaterialSafely(new File([f],f.name||'Screenshot.png',{type:f.type||'image/png'}),'',controller.signal);out.images.push(...one.images);out.imageLabels!.push(`Screenshot or picture ${out.images.length}`);if(!out.warnings.length)out.warnings.push(...one.warnings);}
   if(mounted.current&&reading.current===controller){reset();setRights(false);setSource(out);setSourcePreviews(out.images);setPaste('');}
  }catch(e){if(mounted.current&&reading.current===controller)setError((e as Error).message);}
  finally{if(reading.current===controller){reading.current=null;if(mounted.current)setBusy('');if(file.current)file.current.value='';}}
 }
 function removePicture(i:number){if(!source)return;const images=source.images.filter((_,k)=>k!==i);reset();if(!images.length){setSource(null);return;}const next={...source,images,imageLabels:(source.imageLabels??[]).filter((_,k)=>k!==i)};setSource(next);setSourcePreviews(images);}
 // A screenshot pasted anywhere in the dialog. Text pasted into a text box stays text.
 function onPaste(e:React.ClipboardEvent){
  if(rebuilt||busy)return;
  const files=Array.from(e.clipboardData.files).filter(f=>f.type.startsWith('image/'));
  if(!files.length)return;
  const inText=(e.target as HTMLElement).closest('textarea,input');
  if(inText&&e.clipboardData.getData('text/plain').trim())return;
  e.preventDefault();
  void addFiles(files.map((f,i)=>new File([f],f.name&&f.name!=='image.png'?f.name:`Screenshot ${i+1}.png`,{type:f.type})));
 }
 async function rebuild(){setError('');const s=source||{name:'Pasted materials',text:paste,images:[],warnings:[]};if(!rights||!s.text.trim()&&!s.images.length){setError(!rights?'Confirm upload and adaptation permission below.':'Add a file or a screenshot.');return;}const id=crypto.randomUUID();setRequestId(id);setRecover(true);try{sessionStorage.setItem(storageKey,id);}catch{}setBusy('Reading your source and writing the task');const STEPS:Record<string,string>={generation:'Reading your source and writing the task',structure:'Checking the task’s questions and answers','source-review':'Checking the task against your source',storage:'Saving the task for you to review'};const watch=setInterval(()=>{void call({action:'rebuildStatus',requestId:id,light:true}).then(x=>{const step=STEPS[String(x.phase)];if(step&&mounted.current&&x.status==='running')setBusy(step);}).catch(()=>{});},4000);try{const r=await call({action:'rebuild',requestId:id,scope:itemId?'task':'item',creationType:type,source:s,instructions,rightsAccepted:true,rightsVersion:VERSION}).finally(()=>clearInterval(watch));if(r.rebuilt&&mounted.current){setSourcePreviews(s.images);setRebuilt(await preparePictures(normalizeReview(r.rebuilt),s.images,id));setChecks(r.checks??[]);setEditedTasks(new Set());setRecover(false);setReviewed(false);}}catch(e){setError((e as Error).message||'We couldn’t rebuild this. Your original is unchanged.');}finally{clearInterval(watch);setBusy('');}}
 async function check(){setBusy('Checking your saved import');setError('');try{const r=await call({action:'rebuildStatus',requestId});if(r.createdItemId){try{sessionStorage.removeItem(storageKey);}catch{}onDone(r.createdItemId,r.taskId||'');return;}if(r.rebuilt){setSourcePreviews(r.sourcePreviews??[]);setRebuilt(await preparePictures(normalizeReview(r.rebuilt),r.sourcePreviews??[],requestId));setChecks(r.checks??[]);setEditedTasks(new Set());setRecover(false);}else setError(r.status==='running'?'The import is still running. Check again shortly.':'The import did not finish. Choose Start again to retry.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function save(){if(!rebuilt||!reviewed)return;setBusy('Checking your edits against the source and adding reviewed materials');setError('');try{const r=await call({action:'importCreate',requestId,scope:itemId?'task':'item',itemId,reviewed:true,rebuilt});if(r.needsReview&&r.rebuilt){setRebuilt(normalizeReview(r.rebuilt));setChecks(r.checks??[]);setEditedTasks(new Set());setReviewed(false);setSourceCheckUpdated(true);return;}if(!r.createdItemId)throw Error('The import did not return a saved destination. Check the saved import before retrying.');try{sessionStorage.removeItem(storageKey);}catch{}onDone(r.createdItemId,r.taskId||'');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 const requirement=!rights?'Confirm that you have permission to upload and adapt the materials.':!source&&!paste.trim()?'Add a file or a screenshot.':'';
 return <div className={"scrim mi-scrim"+(activity.minimised?" ai-panel-minimised":"")} onClick={close}><div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mi-title" className="dialog mi-dialog" onPaste={onPaste} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=Array.from(root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[href]')).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){e.preventDefault();first?.focus();}}}}>
 <header className="mi-header"><div><h2 id="mi-title">Import a task</h2><p>Turn a worksheet, a screenshot or a page into a task you can edit. AI picks the question types, and you check them before adding the task.</p></div><button type="button" className="btn ai-minimise" onClick={activity.minimise} aria-label="Minimise" title="Minimise: keep it running in the corner while you work"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12"/></svg></button><button type="button" className="btn" disabled={!!busy} aria-label="Close import" onClick={close}><UiIcon name="videoClose"/></button></header>
 {busy&&<AiProgress label={busy+'…'} detail={`Elapsed ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}. Your existing materials are unchanged.`}/>}{busy==='Reading your file locally'&&<button type="button" className="btn" onClick={()=>reading.current?.abort()}>Cancel reading</button>}
 {error&&<AiNotice kind="error">{error}</AiNotice>}
 {sourceCheckUpdated&&rebuilt&&<AiNotice kind="info">The source check updated your tasks. Review the changes and check notes below, then confirm again to add them. Nothing has been added to the class yet.</AiNotice>}
 {!rebuilt?<fieldset disabled={!!busy} className="mi-main"><legend>1. Choose your source</legend>
 
 <div className={'mi-drop'+(over?' over':'')+(source?' has-source':'')} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOver(false);}} onDrop={e=>{e.preventDefault();setOver(false);void addFiles(Array.from(e.dataTransfer.files));}}>
  <span className="mi-drop-icon" aria-hidden="true"><UiIcon name="upload" size={22}/></span>
  <span className="mi-drop-text"><strong>{source?.name===PICTURES?'Add another screenshot or picture':'Drop a file or a screenshot here'}</strong><span>Or paste a screenshot with {/Mac|iPhone|iPad/.test(navigator.platform)?'⌘V':'Ctrl+V'}. You can add up to six.</span></span>
  <span className="mi-drop-acts"><button type="button" className="btn" onClick={()=>file.current?.click()}>Choose a file</button><ScreenGrabButton disabled={!!busy} onGrab={f=>void addFiles([f])}/></span>
  <input ref={file} hidden multiple aria-label="Upload existing materials" type="file" accept={ACCEPT} onChange={e=>void addFiles(Array.from(e.target.files??[]))}/>
  <span className="mi-drop-hint">PDF (including scans), Word, PowerPoint, Excel, text and pictures (JPG, PNG, WebP). Up to 20 MB. For audio or video, paste a transcript.</span>
 </div>
 {source?.name===PICTURES&&<div className="mi-shots" aria-label="Screenshots and pictures to import">{source.images.map((src,i)=><figure key={i} className="mi-shot"><img src={src} alt={`Screenshot or picture ${i+1}`}/><button type="button" className="mi-shot-x" aria-label={`Remove screenshot or picture ${i+1}`} onClick={()=>removePicture(i)}>×</button></figure>)}</div>}
 <details className="mi-pages-pick" open={!!pages}><summary>Only some pages of a PDF or slides of a PowerPoint?</summary><label className="mi-field">Pages or slides<input placeholder="All, up to six · e.g. 1-3 or 2, 4" value={pages} onChange={e=>setPages(e.target.value)}/></label><p className="hint">Set the range before choosing the file. Up to six pages or pictures and 30,000 characters per import.</p></details>
 {source&&source.name!==PICTURES&&<section aria-label="Selected source" className="mi-selected"><strong>{source.name}</strong><p>{source.text.length.toLocaleString()} characters · {source.images.length} page or picture previews</p><ul>{source.warnings.map((x,i)=><li key={i}>{x}</li>)}</ul><details><summary>Review extracted text and page previews</summary><pre className="mi-source">{source.text||'Text will be read from the page images.'}</pre><div className="mi-pages">{source.images.map((src,i)=><img src={src} key={i} alt={`Source preview ${i+1}`}/>)}</div></details><button type="button" className="btn" onClick={()=>{reset();setSource(null);}}>Remove source</button></section>}


 <label className="mi-field">Changes or focus (optional)<textarea rows={2} maxLength={2000} value={instructions} onChange={e=>{reset();setInstructions(e.target.value);}} placeholder="Leave blank to keep the content and task sequence. For example: rebuild only task 3, or adapt the instructions for A2."/></label>
 <aside className="mi-rights"><strong>Your materials</strong><p>Only import materials you own or have permission to adapt. Take out personal or confidential details first.</p><details><summary>How we handle them</summary><p>We don’t claim ownership of your materials. Other people’s rights in them still apply, and AI-made content may not be protected by copyright everywhere.</p><p>When you make the task, the text and page pictures go to our AI service. The file isn’t added to your class. A private copy is kept for 24 hours so the AI can check its work against it, then it’s deleted. The task you add follows your lesson’s sharing settings.</p></details><label><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/> I have permission to use and adapt these materials.</label></aside>
 {recover&&<aside><p>A previous import may already be saved. Check it before starting another.</p><button className="btn" type="button" onClick={()=>void check()}>Check saved import</button> <button className="btn" type="button" onClick={reset}>Start again</button></aside>}
 <div className="mi-actions">{requirement&&<p id="mi-requirement" className="hint">{requirement}</p>}<AiButton className="btn primary" type="button" aria-describedby={requirement?'mi-requirement':undefined} disabled={!!requirement||recover} onClick={()=>void rebuild()}><UiIcon name="videoSparkles"/> Make the task</AiButton></div></fieldset>:
 <fieldset disabled={!!busy} className="mi-main"><legend>2. Review your rebuilt materials</legend><p>{rebuilt.rationale}</p><aside className="mi-rights"><strong>Check before teaching</strong><p>Compare with your source. Check every question, answer, table and instruction. Missing answer keys may have AI-suggested answers. Source illustrations shown below are recreated from their page references. Missing pictures and original recordings still need attaching separately. AI sense-checks every task against the source and attempts a repair where needed. Tasks with unresolved checks or missing resources stay hidden until you finish reviewing them in the editor. Your edits are checked again before saving.</p>{!!source?.warnings.length&&<ul>{source.warnings.map((x,i)=><li key={i}>{x}</li>)}</ul>}{rebuilt.warnings.length>0&&<ul>{rebuilt.warnings.map((x,i)=><li key={i}>{x}</li>)}</ul>}</aside>
 <ImportPictures plans={importPicturePlans(rebuilt)} sourceImages={sourcePreviews} prepared={prepared} onPrepare={()=>void prepareAgain()} busy={!!busy}/>
 <label className="mi-field">Item title<input value={rebuilt.title} onChange={e=>{setRebuilt({...rebuilt,title:e.target.value});setReviewed(false);}}/></label>
 {rebuilt.tasks.map((task,i)=><details key={i} open={rebuilt.tasks.length===1} className="mi-task"><summary>{i+1}. {task.title}</summary><p className="mi-type-summary">{typeSummary(task)&&'Inline tasks: '+typeSummary(task)}</p><aside className="mi-source-check" role="status"><strong>{editedTasks.has(String(task.stageId))?'Source check needed after your edits':checks.find(c=>c.stageId===task.stageId)?.status==='repaired'?'Repaired and checked against source':checks.find(c=>c.stageId===task.stageId)?.status==='passed'?'Source check completed':'Needs your review · saved hidden'}</strong><p>{checks.find(c=>c.stageId===task.stageId)?.summary||'No automatic source check is available for this task.'}</p>{checks.find(c=>c.stageId===task.stageId)?.issues.map((issue,j)=><div key={j}><p>{issue.problem} {issue.improvement}</p>{issue.sourceEvidence&&<blockquote>{issue.sourceEvidence}</blockquote>}</div>)}</aside><ImportTaskPreview task={task} index={i} classId={classId} pictures={importPicturePlans(rebuilt)} assetUrls={Object.fromEntries(Object.entries(prepared).map(([id,p])=>[id,p.preview]))}/><Editable training={training} name={`Task ${i+1}`} value={task} onChange={v=>{setEditedTasks(old=>new Set([...old,String(task.stageId)]));setRebuilt({...rebuilt,tasks:rebuilt.tasks.map((x,j)=>j===i?v as Rebuilt['tasks'][number]:x)});setReviewed(false);}}/></details>)}
 <label className="mi-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I’ve checked the content, answer keys and import notes.</label><div className="mi-actions"><button type="button" className="btn" onClick={()=>{setRebuilt(null);setReviewed(false);setSourceCheckUpdated(false);setRecover(true);}}>Back to source</button>{!reviewed&&<p className="hint" id="mi-review-requirement">{sourceCheckUpdated?'Review the source-check changes, then confirm the check above to add them.':'Review the materials and confirm the check above to add them.'}</p>}<button type="button" className="btn primary" disabled={!reviewed} aria-describedby={!reviewed?'mi-review-requirement':undefined} onClick={()=>void save()}><UiIcon name="plus"/> {sourceCheckUpdated?'Confirm checked changes and add':itemId?'Add reviewed task':`Add reviewed ${type}`}</button></div><p className="hint">{itemId?'Adds a new task hidden from learners. Review it in the editor, then show it when ready.':'Saved hidden from learners. You can continue editing before sharing.'}</p></fieldset>}
 </div></div>;
}
export function TaskStartChoice({onBlank,onImport,onClose}:{onBlank:()=>void;onImport:()=>void;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);useEffect(()=>{const old=document.activeElement as HTMLElement;ref.current?.querySelector('button')?.focus();return()=>old?.focus();},[]);
 return <div className="scrim mi-scrim" onClick={onClose}><div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby="mi-new-task" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const a=Array.from(ref.current!.querySelectorAll('button'));if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===a.at(-1)){e.preventDefault();a[0]?.focus();}}}}><h2 id="mi-new-task">Add a task</h2><p>Start with a blank task, or rebuild a task you already have.</p><div className="mi-actions"><button className="btn primary" onClick={onBlank}><UiIcon name="plus"/> Start blank</button><ImportMaterialsButton onClick={onImport}/><button className="btn" onClick={onClose}>Cancel</button></div></div></div>;
}

export const MaterialImport = teacherPanel(MaterialImportPanel);
