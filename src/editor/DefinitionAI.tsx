import {useEffect,useRef,useState} from 'react';
import {doc,getDoc} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {app,db} from '../lib/firebase';
import {useAuth} from '../lib/auth';
import {isProxyTab} from '../lib/proxy';
import {useEditorClass} from './context';
import type {DefData} from './Definition';
const levels=['Pre-A1','A1','A2','B1','B2','C1','C2'];
type Draft={data:DefData;translations:{language:string;text:string}[];needsContext:boolean;note:string;level:string;ageGroup:string};
const call=httpsCallable<Record<string,unknown>,Draft>(getFunctions(app,'us-central1'),'teachingDefinition',{timeout:210000});
export function DefinitionAI({word,context,onUse,onBusyChange}:{word:string;context:string;onUse:(update:(d:DefData)=>DefData)=>void;onBusyChange?:(busy:boolean)=>void}) {
 const {classId:editorClassId,lessonId:editorLessonId,taskContext,taskTitle}=useEditorClass();
 const classId=/^[\w-]{1,100}$/.test(editorClassId)?editorClassId:'';
 const lessonId=classId?editorLessonId:undefined;
 const {profile}=useAuth();
 const [level,setLevel]=useState('A2'),[classLevel,setClassLevel]=useState(''),[focus,setFocus]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[replace,setReplace]=useState(false);
 const alive=useRef(true),lock=useRef(false),run=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{run.current++;setDraft(null);setError('');},[word,context,classId,lessonId]);
 useEffect(()=>{let active=true;setClassLevel('');if(classId)void getDoc(doc(db,'classes',classId)).then(s=>{const v=s.get('level');if(active&&levels.includes(v))setClassLevel(v);}).catch(()=>{});return()=>{active=false;};},[classId]);
 async function suggest(){
  if(lock.current||!word.trim())return;lock.current=true;setBusy(true);onBusyChange?.(true);setError('');setDraft(null);const ticket=++run.current;
  try{
   const result=(await call({requestId:crypto.randomUUID(),word:word.trim(),classId,lessonId:lessonId||'',level:classLevel||level,context:[taskTitle,taskContext,context].filter(Boolean).join('\n').slice(0,4000),focus})).data;
   if(alive.current&&run.current===ticket)setDraft(result);
  }catch(e){if(alive.current&&run.current===ticket)setError((e as Error).message||'The definition could not be drafted. Your fields are kept.');}
  finally{lock.current=false;if(alive.current){setBusy(false);onBusyChange?.(false);}}
 }
 function apply(){
  if(!draft||draft.needsContext)return;
  onUse(old=>{
   const next={...old};for(const [k,v]of Object.entries(draft.data))if(typeof v==='string'&&v.trim()&&(replace||!String(old[k as keyof DefData]??'').trim()))(next as Record<string,unknown>)[k]=v;
   const trans={...old.trans};for(const t of draft.translations)if(replace||!trans[t.language]?.trim())trans[t.language]=t.text;
   if(Object.keys(trans).length)next.trans=trans;return next;
  });setDraft(null);
 }
 if(profile?.role!=='teacher'||isProxyTab())return null;
 return <section className="definition-ai" aria-label="Teaching definition with AI">
  <strong>A teaching explanation, in context</strong>
  <p>Draft a meaning for this use of the word or phrase, with examples and useful form, pronunciation and learner help. Review it before saving.</p>
  {classLevel?<p>Using class level: <b>{classLevel}</b>. The AI also reads this task and the lesson’s learner-facing content.</p>:<label>Learner level<select aria-label="Definition learner level" value={level} disabled={busy} onChange={e=>{setLevel(e.target.value);setDraft(null);}}>{levels.map(v=><option key={v}>{v}</option>)}</select></label>}
  <details><summary>Context or sense to clarify (optional)</summary><label>Extra context<textarea aria-label="Definition extra context (optional)" rows={2} maxLength={1000} value={focus} disabled={busy} onChange={e=>{setFocus(e.target.value);setDraft(null);}} placeholder="For example: bank means the side of a river here." /></label></details>
  {!word.trim()&&<p>Enter or select a word or phrase first.</p>}
  <button type="button" className="btn small-btn" disabled={busy||!word.trim()} onClick={()=>void suggest()}>{busy?'Drafting a teaching definition…':'Suggest definition with AI'}</button>
  {busy&&<p role="status">Reading the context and choosing useful learner-level details. Your current fields are kept.</p>}
  {error&&<p role="alert">{error}</p>}
  {draft&&<div className="definition-ai-draft" aria-label="Suggested teaching definition"><p><b>Draft for {draft.level}</b>{draft.ageGroup&&draft.ageGroup!=='Not specified'?' · '+draft.ageGroup:''}</p><p>{draft.note}</p>
    {draft.data.meaning&&<p><b>Meaning: </b>{draft.data.meaning}</p>}{draft.data.example&&<p><b>Example: </b>{draft.data.example}</p>}
    <details><summary>All suggested fields</summary><dl>{Object.entries(draft.data).filter(([k,v])=>v&&k!=='meaning'&&k!=='example').map(([k,v])=><div key={k}><dt>{({pos:'Part of speech',family:'Word family',forms:'Irregular forms',countable:'Countability',patterns:'Common patterns',ipa:'IPA',stress:'Stressed syllable',mistakes:'Common mistakes'} as Record<string,string>)[k]||k}</dt><dd>{String(v)}</dd></div>)}{draft.translations.map(t=><div key={t.language}><dt>{t.language}</dt><dd>{t.text}</dd></div>)}</dl></details>
    {draft.needsContext?<p>Add a sentence or clarify the intended meaning above, then suggest again.</p>:<><label className="definition-ai-replace"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Replace fields I’ve already filled</label><button type="button" className="btn small-btn primary" onClick={apply}>Use suggested definition</button><p>By default, only empty fields are filled. You can edit everything before saving.</p></>}
  </div>}
 </section>;
}
