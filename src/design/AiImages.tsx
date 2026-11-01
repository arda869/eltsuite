import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import { saveMeta, metaRef } from './model';
import type { Ctx } from './Editor';
const call=httpsCallable<Record<string,unknown>,{ready?:boolean;message?:string;status?:string;resultId?:string}>(getFunctions(undefined,'us-central1'),'designerImage',{timeout:300000});
type Pending={id:string;target?:string};
export function AiImages({cx}:{cx:Ctx}) {
 const styles=[['photo','Photo','Natural photography · all ages'],['bright','Bright & bold','Colourful, clear shapes · young learners'],['storybook','Soft storybook','Warm, gentle illustrations · young learners'],['editorial','Editorial','Restrained colour · teens and adults'],['ink','Black & white','Clean outlines · print-friendly adults']];
 const [style,setStyle]=useState('photo'),[referenceId,setReferenceId]=useState('');
 useEffect(()=>{void getDoc(metaRef(cx.d.id)).then(s=>{const m=s.data();if(m?.aiStyle)setStyle(m.aiStyle);if(m?.aiReference)setReferenceId(m.aiReference);});},[cx.d.id]);
 const storageKey='designer-ai:'+cx.d.id;
 const [mode,setMode]=useState<'create'|'edit'|'erase'|'restyle'>('create'),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[preview,setPreview]=useState('');
 const [pending,setPending]=useState<Pending|null>(()=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null');}catch{return null;}});
 const result=useRef<Blob|null>(null),target=useRef<string|undefined>(pending?.target);
 const image=cx.sel.length===1&&cx.sel[0].t==='image'?cx.sel[0]:undefined;
 const remember=(p:Pending|null)=>{setPending(p);if(p)localStorage.setItem(storageKey,JSON.stringify(p));else localStorage.removeItem(storageKey);};
 useEffect(()=>{let active=true;void call({action:'connection',fileId:cx.d.id}).then(r=>{if(active){setReady(!!r.data.ready);if(!r.data.ready)setError(r.data.message??'Image connection unavailable.');}}).catch(()=>{if(active)setError('Could not check the image connection. Close and reopen this panel to retry.');});return()=>{active=false;};},[cx.d.id]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const missing=!prompt.trim()&&mode!=='restyle'?'Add a description below.':mode!=='create'&&!image?.img?'Select one image on the canvas.':!ready?'Checking the image connection…':'';
 const loadResult=async(id:string)=>{
  const meta=(await getDoc(doc(db,'sharedDocs',cx.d.id,'designerResults',id))).data();
  if(!meta?.ready||!Number.isInteger(meta.parts)||meta.parts<1||meta.parts>64)throw Error('The image is not ready to open.');
  const parts=await Promise.all(Array.from({length:meta.parts},(_,i)=>getDoc(doc(db,'sharedDocs',cx.d.id,'designerResults',`${id}_${i}`))));
  if(parts.some(p=>typeof p.data()?.data!=='string'))throw Error('The image could not be downloaded. Try recovering the preview again.');
  result.current=new Blob(parts.map(p=>Uint8Array.from(atob(p.data()!.data),c=>c.charCodeAt(0))),{type:'image/png'});setPreview(URL.createObjectURL(result.current));
 };
 const recover=async()=>{
  if(!pending)return;setBusy(true);setError('');target.current=pending.target;
  try{const r=await call({action:'status',fileId:cx.d.id,requestId:pending.id});if(r.data.status==='completed'&&r.data.resultId)await loadResult(r.data.resultId);else if(r.data.status==='failed'||r.data.status==='missing'){remember(null);setError('That request did not finish. Your canvas is unchanged; you can generate a new preview.');}else setError('This request is still running. Recover the preview again shortly; this does not generate another image.');}catch{setError('Could not recover the preview. Check your connection and try again.');}finally{setBusy(false);}
 };
 const run=async()=>{
  if(missing){setError(missing);return;}setBusy(true);setError('');target.current=mode==='create'?undefined:image?.id;
  const request={id:crypto.randomUUID(),target:target.current};remember(request);
  try {
   await saveMeta(cx.d.id,{aiStyle:style,aiReference:referenceId});
   const r=await call({action:mode,fileId:cx.d.id,requestId:request.id,prompt,imageId:image?.img??null,style,referenceId:mode==='create'||mode==='restyle'?referenceId:null});
   if(r.data.status!=='completed'||!r.data.resultId)throw Error('The image is still being prepared. Use Recover preview shortly.');
   await loadResult(r.data.resultId);
  }catch(e){setError(e instanceof Error?e.message:'Could not create the image. Your original is unchanged.');}finally{setBusy(false);}
 };
 return <section className="dz-ai"><p className="dz-dr-note">Create an image, change a detail, or remove an unwanted object. Review the result before applying it.</p><label>What would you like to do?<select value={mode} disabled={busy||!!pending} onChange={e=>{setMode(e.target.value as typeof mode);setError('');}}><option value="create">Create an image</option><option value="restyle">Restyle an image</option><option value="edit">Change an image</option><option value="erase">Magic eraser · remove an object</option></select></label>{(mode==='create'||mode==='restyle')&&<><fieldset className="dz-style-picker" disabled={busy||!!pending}><legend>Visual style</legend>{styles.map(([id,label,about])=><button type="button" key={id} aria-pressed={style===id} className={'dz-style-card '+(style===id?'chosen':'')} onClick={()=>setStyle(id)}><span className={'dz-style-swatch '+id} aria-hidden="true">◒</span><span><strong>{label}</strong><small>{about}</small></span></button>)}</fieldset><label>Match an existing illustration<select value={referenceId} disabled={busy||!!pending} onChange={e=>setReferenceId(e.target.value)}><option value="">Style guide only</option>{cx.els.filter(e=>e.t==='image'&&e.img).map(e=><option key={e.id} value={e.img}>{e.name||'Image'} · {e.id.slice(0,4)}</option>)}</select></label><p className="hint">For a matching set, keep the same style and choose the first illustration as your reference. Upload a previous illustration to match it in a new file. AI results may still vary.</p></>}<label>{mode==='restyle'?'Extra changes (optional)':mode==='create'?'Describe your image':mode==='erase'?'What should be removed?':'What should change?'}<textarea rows={3} maxLength={3000} value={prompt} disabled={busy||!!pending} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='erase'?'For example, remove the red bag on the chair':'Describe what you have in mind…'}/></label>{missing&&!busy&&!pending&&<p className="hint">{missing}</p>}{!pending&&<button className="btn primary" disabled={busy||!ready} onClick={()=>void run()}>Generate preview</button>}{pending&&!preview&&!busy&&<button className="btn primary" onClick={()=>void recover()}>Recover preview</button>}{busy&&<div className="dz-ai-progress" role="status"><span className="dz-ai-orbit" aria-hidden="true"/><strong>Working on your image</strong><p>Your canvas is unchanged. A preview will appear here when it’s ready.</p></div>}{error&&<p role="alert">{error}</p>}{preview&&<div><img src={preview} alt="Generated preview" style={{width:'100%',borderRadius:12}}/><button className="btn primary" disabled={busy} onClick={()=>{if(!result.current)return;setBusy(true);void cx.addPicture(result.current,{into:target.current,name:'AI image',throwOnError:true}).then(()=>{setPreview('');result.current=null;remember(null);}).catch(()=>setError('Could not apply the image. Your preview is kept; please try again.')).finally(()=>setBusy(false));}}>Apply to canvas</button><button className="btn" disabled={busy} onClick={()=>{setPreview('');result.current=null;remember(null);}}>Discard preview</button></div>}</section>;
}
