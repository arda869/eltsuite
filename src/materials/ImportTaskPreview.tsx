import {resolveImportPictures,type PicturePlan} from '../../functions/ai/import-pictures.js';
import {useEffect,useMemo,useState} from 'react';
import type {JSONContent} from '@tiptap/react';
import {TaskRenderer} from '../components/TaskRenderer';
import type {Responses} from '../lib/questions';
import {nativeTask} from '../../functions/ai/activities.js';
const deferred=new Set(['collab','speakingPractice','survey','board','drawBoard','upload']);
const paragraph=(text:string):JSONContent=>({type:'paragraph',content:[{type:'text',text}]});
function sandbox(node:JSONContent):JSONContent {
 if(deferred.has(node.type??'')){
  const a=node.attrs??{},label=({collab:'Shared document',speakingPractice:'AI conversation',survey:'Survey',board:'Shared board',drawBoard:'Drawing board',upload:'File upload'} as Record<string,string>)[node.type!];
  const lines=[label,a.title,a.prompt,a.scenario,a.start?.content?.map((n:JSONContent)=>n.content?.map(t=>t.text??'').join('')).join('\n'),...(a.questions??[]).map((q:{prompt:string})=>q.prompt),'This classroom tool becomes available after adding the task.'].filter(Boolean);
  return {type:'blockquote',content:lines.map(x=>paragraph(String(x)))};
 }
 return {...node,...(node.content?{content:node.content.map(sandbox)}:{})};
}
export function ImportTaskPreview({task,index,classId,pictures=[],assetUrls={}}:{task:unknown;index:number;classId:string;pictures?:PicturePlan[];assetUrls?:Record<string,string>}){
 const [open,setOpen]=useState(false),[responses,setResponses]=useState<Responses>({}),[checked,setChecked]=useState(false);
 const native=useMemo(()=>{try{return {value:nativeTask(task,index,'preview'),error:''};}catch(e){return {value:null,error:e instanceof Error?e.message:'Complete the task fields to preview it.'};}},[task,index]);
 useEffect(()=>{setResponses({});setChecked(false);},[native]);
 return <details className="mi-native-preview" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Try learner preview</summary>{open&&<>
  <p className="hint">Try answering here. Preview responses are not submitted. Shared classroom tools and uploads become available after adding the task.</p>
  {native.value?<><TaskRenderer content={sandbox(resolveImportPictures(native.value.content,pictures,assetUrls))} classId={classId} responses={responses} onChange={(id,value)=>{setResponses(old=>({...old,[id]:value}));setChecked(false);}} results={checked?native.value.key:undefined} selfId="import-preview" classmates={[{id:'preview-peer',name:'Preview classmate'}]} />
   <div className="mi-actions"><button type="button" className="btn" onClick={()=>setChecked(true)}>Check preview answers</button><button type="button" className="btn" onClick={()=>{setResponses({});setChecked(false);}}>Reset preview</button></div>
  </>:<p role="alert">{native.error}</p>}
 </>}</details>;
}
