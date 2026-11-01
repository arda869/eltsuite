import {collection,doc,getDoc,getDocs,setDoc,updateDoc} from './firestore';
import {db} from '../../src/lib/firebase';
const jobs=()=>JSON.parse(localStorage.getItem('mockLessonToolJobs')||'{}');
export async function mockLessonTools(d:any) {
 const all=jobs(),path=['classes',d.classId,'items',d.itemId,'tasks'];
 if(d.action==='taskToolsStatus')return {data:all[d.requestId]};
 if(d.action==='taskToolsApply') {
  const job=all[d.requestId];if(!job)throw Error('No draft');
  if(job.mode==='answers'){for(const e of job.result.entries){const ref=doc(db,...path,e.taskId,'private','key');const old=(await getDoc(ref)).data()??{};await setDoc(ref,{...old,[e.questionId]:e.key});}return {data:{applied:true,taskId:job.taskId}};}
  const source=(await getDoc(doc(db,...path,job.taskId))).data()??{},id='tool_'+d.requestId;
  const native=job.result.native;
  const tasks=(await getDocs(collection(db,...path))).docs.map(x=>({id:x.id,...x.data()}));
  const order=Math.max(-1,...tasks.map((t:any)=>t.order??0))+1;
  await setDoc(doc(db,...path,id),{kind:'task',title:job.result.activity.title,instructions:job.result.activity.instructions,content:job.mode==='differentiate'?null:native.content,order:job.mode==='differentiate'?source.order:order,hidden:false,locked:false,...(job.mode==='differentiate'?{family:job.taskId,variant:'Supported',restricted:true,allowed:[]}: {})});
  if(job.mode==='differentiate'){await setDoc(doc(db,...path,id,'private','body'),{content:native.content});await updateDoc(doc(db,...path,job.taskId),{family:job.taskId,variant:'Standard',variants:[...(source.variants??[]),id]});}
  await setDoc(doc(db,...path,id,'private','key'),native.key);return {data:{applied:true,taskId:id}};
 }
 let result:any;
 if(d.step==='ideas')result={ideas:d.mode==='differentiate'?[{title:'Add choices',reason:'Recognise the form before recalling it.',direction:'Turn each gap into a choice.',kind:'support'},{title:'Recall independently',reason:'Remove the word bank.',direction:'Keep open gaps without a word bank.',kind:'challenge'}]:[{title:'Plan a weekend',reason:'Use the language to agree on a plan.',direction:'Create a decision task.',kind:'next'},{title:'Compare two plans',reason:'Read for a purpose.',direction:'Create a short reading comparison.',kind:'next'}]};
 else if(d.mode==='answers') {
  const tasks=(await getDocs(collection(db,...path))).docs.filter(t=>d.scope==='lesson'||t.id===d.taskId);
  const entries=[];
  for(const t of tasks){const k=(await getDoc(doc(db,...path,t.id,'private','key'))).data()??{};for(const [qid,key]of Object.entries(k))if((key as any).kind==='gap'&&!(key as any).answers?.length)entries.push({taskId:t.id,questionId:qid,key:{kind:'gap',answers:['went']},reason:'The sentence refers to yesterday.'});}
  result={entries,issues:[]};
 }else result={activity:{title:d.mode==='differentiate'?'Supported past tense':'Our next plan',instructions:'Choose the correct word.'},native:{content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Yesterday I '},{type:'choice',attrs:{id:'new-choice',options:['went','go'],correct:-1}},{type:'text',text:' to the park.'}]}]},key:{'new-choice':{kind:'mcq',correct:0}},notes:'Keep the same aim.'}};
 const reply={status:'completed',result,media:[],mode:d.mode,taskId:d.taskId};all[d.requestId]=reply;localStorage.setItem('mockLessonToolJobs',JSON.stringify(all));return {data:reply};
}
