import { AiButton } from '../components/AiMark';
import { AI_ALLOWANCE, AiActions, AiDraft, AiField, AiHeader, AiMore, AiNotice, AiUses, AiWorking } from '../ai/kit';
import { useAiActivity } from '../components/AiActivity';
import {useEffect,useRef,useState} from 'react';
import {doc,getDoc,setDoc,serverTimestamp} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {app,db} from '../lib/firebase';
import {useAuth} from '../lib/auth';
import {isProxyTab} from '../lib/proxy';
import {useEditorClass} from './context';
import {mediaDoc} from '../lib/media';
import type {DefData} from './Definition';
const levels=['Pre-A1','A1','A2','B1','B2','C1','C2'];
type Draft={data:DefData;translations:{language:string;text:string}[];needsContext:boolean;note:string;level:string;ageGroup:string;requestId:string;illustration?:{useful:boolean;prompt:string;alt:string;reason:string};picture?:{status:string;style:string;data?:string;error?:string}};
const call=httpsCallable<Record<string,unknown>,Draft>(getFunctions(app,'us-central1'),'teachingDefinition',{timeout:510000});
export function DefinitionAI({word,context,existingImage='',onUse,onBusyChange}:{word:string;context:string;existingImage?:string;onUse:(update:(d:DefData)=>DefData)=>void;onBusyChange?:(busy:boolean)=>void}) {
 const {classId:editorClassId,lessonId:editorLessonId,taskContext,taskTitle}=useEditorClass();
 const classId=/^[\w-]{1,100}$/.test(editorClassId)?editorClassId:'';
 const lessonId=classId?editorLessonId:undefined;
 const {profile,user}=useAuth();
 const [level,setLevel]=useState('A2'),[classLevel,setClassLevel]=useState(''),[focus,setFocus]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[replace,setReplace]=useState(false),[usePicture,setUsePicture]=useState(true);
 useAiActivity({active:busy,title:'Teaching definition',detail:'Preparing the definition and illustration…',error});
 const request=useRef<Record<string,unknown>|null>(null);
 const alive=useRef(true),lock=useRef(false),run=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{run.current++;setDraft(null);setError('');},[word,context,classId,lessonId]);
 useEffect(()=>{let active=true;setClassLevel('');if(classId)void getDoc(doc(db,'classes',classId)).then(s=>{const v=s.get('level');if(active&&levels.includes(v))setClassLevel(v);}).catch(()=>{});return()=>{active=false;};},[classId]);
 async function suggest(retryPicture=false){
  if(lock.current||!word.trim())return;lock.current=true;setBusy(true);onBusyChange?.(true);setError('');if(!retryPicture)setDraft(null);const ticket=++run.current;
  try{
   const input=retryPicture&&request.current?{...request.current,action:'picture'}:{requestId:crypto.randomUUID(),word:word.trim(),classId,lessonId:lessonId||'',level:classLevel||level,context:[taskTitle,taskContext,context].filter(Boolean).join('\n').slice(0,4000),focus,hasImage:!!existingImage};
   if(!retryPicture){request.current=input;setUsePicture(true);}
   const result=(await call(input)).data;
   if(alive.current&&run.current===ticket)setDraft(result);
  }catch(e){if(alive.current&&run.current===ticket)setError((e as Error).message||'The definition could not be drafted. Your fields are kept.');}
  finally{lock.current=false;if(alive.current){setBusy(false);onBusyChange?.(false);}}
 }
 async function apply(){
  if(!draft||draft.needsContext||lock.current)return;
  let image='';
  try{
   if(usePicture&&draft.picture?.status==='ready'&&draft.picture.data&&user){
    lock.current=true;setBusy(true);onBusyChange?.(true);
    const id='definition_'+draft.requestId;
    await setDoc(mediaDoc(editorClassId||'user:'+user.uid,id),{data:draft.picture.data,type:'image/jpeg',size:Math.floor(draft.picture.data.length*3/4),aiGenerated:true,visualStyle:draft.picture.style,createdAt:serverTimestamp()});image='media:'+id;
   }
  }catch{setError('The picture could not be saved. Your draft is kept. Try again, or untick Use this picture to save the text.');return;}
  finally{lock.current=false;setBusy(false);onBusyChange?.(false);}
  if(!alive.current)return;
  onUse(old=>{
   const next={...old};for(const [k,v]of Object.entries(draft.data))if(typeof v==='string'&&v.trim()&&(replace||!String(old[k as keyof DefData]??'').trim()))(next as Record<string,unknown>)[k]=v;
   const trans={...old.trans};for(const t of draft.translations)if(replace||!trans[t.language]?.trim())trans[t.language]=t.text;
   if(Object.keys(trans).length)next.trans=trans;
   if(image&&(replace||!old.image)){next.image=image;next.imageAlt=draft.illustration?.alt||word;}return next;
  });setDraft(null);
 }
 if(profile?.role!=='teacher'||isProxyTab())return null;
 const picture=draft?.picture;
 const fieldNames:Record<string,string>={pos:'Part of speech',family:'Word family',forms:'Irregular forms',countable:'Countability',patterns:'Common patterns',ipa:'IPA',stress:'Stressed syllable',mistakes:'Common mistakes'};
 return <section className="definition-ai" aria-label="Teaching definition with AI">
  <AiHeader level={3} title="Suggest a definition" lede="Review the meaning, an example and language notes for this word. Include a picture when it helps.">
   <AiUses items={[word.trim()?`“${word.trim()}”`:false,classLevel?`Class level ${classLevel}`:`Level ${level}`,'This task’s text',lessonId?'The lesson’s learner-facing content':false]}/>
  </AiHeader>
  {!draft&&<>
   {!classLevel&&<AiField label="Learner level"><select aria-label="Definition learner level" value={level} disabled={busy} onChange={e=>{setLevel(e.target.value);setDraft(null);}}>{levels.map(v=><option key={v}>{v}</option>)}</select></AiField>}
   <AiMore summary={focus.trim()?'Sense to clarify: '+focus.trim().slice(0,40):'Clarify the sense'}>
    <AiField label="Which meaning?" optional hint="Useful when the word has several meanings.">
     <textarea aria-label="Definition extra context (optional)" rows={2} maxLength={1000} value={focus} disabled={busy} onChange={e=>{setFocus(e.target.value);setDraft(null);}} placeholder="For example: bank means the side of a river here."/>
    </AiField>
   </AiMore>
   {!word.trim()&&<AiNotice kind="info">Enter or select a word or phrase first.</AiNotice>}
   {busy
    ?<AiWorking title="Drafting the definition…" detail="The text comes first; a picture, when useful, can take a little longer. Your current fields are kept." steps={['Reading the context','Writing the explanation','Drawing a picture if it helps']} step={1}/>
    :<AiActions note={<>{AI_ALLOWANCE} Pictures use your Designer image allowance.</>}><AiButton type="button" className="btn primary small-btn" disabled={!word.trim()} onClick={()=>void suggest()}>Suggest definition</AiButton></AiActions>}
  </>}
  {error&&<AiNotice kind="error" action={()=>void suggest()} actionDisabled={busy||!word.trim()}>{error}</AiNotice>}
  {draft&&<AiDraft title={word.trim()} meta={<>For {draft.level}{draft.ageGroup&&draft.ageGroup!=='Not specified'?' · '+draft.ageGroup:''}</>} note={draft.needsContext?undefined:'By default only empty fields are filled. You can edit everything before saving.'} actions={draft.needsContext?<button type="button" className="btn small-btn" onClick={()=>setDraft(null)}>Add context</button>:<>
    <button type="button" className="btn small-btn primary" disabled={busy} onClick={()=>void apply()}>Use this definition</button>
    <AiButton type="button" className="btn small-btn" disabled={busy} onClick={()=>void suggest()}>Suggest another</AiButton>
    <button type="button" className="btn small-btn link" disabled={busy} onClick={()=>setDraft(null)}>Discard</button>
    <label className="definition-ai-replace"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Replace fields I’ve already filled</label>
   </>}>
   {draft.note&&<p className="definition-ai-note">{draft.note}</p>}
   {draft.needsContext&&<AiNotice kind="info">This word has more than one likely meaning here. Say which one you mean under “Clarify the sense”, then suggest again.</AiNotice>}
   <div className="definition-ai-grid">
    <div>
     {draft.data.meaning&&<p><b>Meaning</b><br/>{draft.data.meaning}</p>}
     {draft.data.example&&<p><b>Example</b><br/><i>{draft.data.example}</i></p>}
    </div>
    {draft.illustration&&<div className="definition-ai-picture">
     {picture?.status==='ready'&&picture.data&&<><img src={picture.data} alt={draft.illustration.alt}/><label><input type="checkbox" checked={usePicture} onChange={e=>setUsePicture(e.target.checked)}/>Use this picture</label><small>{picture.style==='bright'?'Bright & bold':'Editorial'} · {draft.illustration.reason}</small></>}
     {picture?.status==='existing'&&<small>Your existing picture is kept. Clear it first if you want an AI picture.</small>}
     {picture?.status==='failed'&&<AiNotice kind="error" action={()=>void suggest(true)} actionLabel="Retry picture" actionDisabled={busy}>{picture.error||'The picture didn’t finish.'} The text is ready to use.</AiNotice>}
     {['running','pending'].includes(picture?.status||'')&&<AiNotice kind="info" action={()=>void suggest(true)} actionLabel="Check picture" actionDisabled={busy}>The picture is still being prepared. You can use the text now and check again later.</AiNotice>}
    </div>}
   </div>
   <AiMore summary="All suggested fields"><dl>{Object.entries(draft.data).filter(([k,v])=>v&&k!=='meaning'&&k!=='example').map(([k,v])=><div key={k}><dt>{fieldNames[k]||k}</dt><dd>{String(v)}</dd></div>)}{draft.translations.map(t=><div key={t.language}><dt>{t.language}</dt><dd>{t.text}</dd></div>)}</dl></AiMore>
  </AiDraft>}
 </section>;
}
