import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import type {JSONContent} from '@tiptap/react';
import {app,db} from '../lib/firebase';
import {useAuth} from '../lib/auth';
import {useGroupSets} from '../lib/groups';
import {TaskRenderer} from '../components/TaskRenderer';
type ComparedVersion={id:string;label:string;title:string;instructions:string;content:JSONContent};
const call=httpsCallable<Record<string,unknown>,{versions?:ComparedVersion[];shared?:number}>(getFunctions(app,'us-central1'),'communicativeActivity');
function changedText(version:ComparedVersion,all:ComparedVersion[]):JSONContent {
 const walk=(node:JSONContent,path:number[]):JSONContent=>{
  const peers=all.map(v=>path.reduce<JSONContent|undefined>((n,i)=>n?.content?.[i],v.content));
  return {...node,...(node.type==='text'&&peers.some(p=>p?.text!==node.text)?{marks:[...(node.marks??[]),{type:'highlight',attrs:{color:'#fff0ad'}}]}:{}),...(node.content?{content:node.content.map((child,n)=>walk(child,[...path,n]))}:{})};
 };return walk(version.content,[]);
}
function ComparedPanels({versions,classId}:{versions:ComparedVersion[];classId:string}) {
 const [highlight,setHighlight]=useState(true);
 return <><label className="ca-switch"><input type="checkbox" checked={highlight} onChange={e=>setHighlight(e.target.checked)}/>Highlight changed text blocks</label><div className="ca-version-panels">{versions.map(v=><section key={v.id} className="ca-paper"><h3>Version {v.label}</h3>{v.instructions&&<p>{v.instructions}</p>}<TaskRenderer content={highlight?changedText(v,versions):v.content} responses={{}} disabled classId={classId}/></section>)}</div></>;
}
export function TeacherVersionComparison({classId,itemId,taskId}:{classId:string;itemId:string;taskId:string}) {
 const sets=useGroupSets(classId),[versions,setVersions]=useState<ComparedVersion[]|null>(null),[scope,setScope]=useState('class'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=async(op:string)=>{setBusy(true);setMessage('');try{const [groupSetId,groupId]=scope==='class'?[]:scope.split('/');const result=await call({classId,itemId,taskId,activityId:'version-comparison',op,...(groupId?{groupSetId,groupId}:{})});if(result.data.versions)setVersions(result.data.versions);if(result.data.shared!==undefined)setMessage(op==='hideVersions'?'Comparison hidden.':`Shared with ${result.data.shared} learners.`);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
 return <><button type="button" className="btn small-btn" disabled={busy} onClick={()=>void request('previewVersions')}>Compare task versions</button>{versions&&<div className="scrim" onClick={()=>setVersions(null)}><div role="dialog" aria-label="Compare task versions" className="dialog ca-compare-dialog" onClick={e=>e.stopPropagation()}><header><h2>Compare task versions</h2><button type="button" className="icon-btn" aria-label="Close comparison" onClick={()=>setVersions(null)}>×</button></header><p>All versions are visible to you. Share them when learners are ready to compare.</p><ComparedPanels versions={versions} classId={classId}/><footer><label>Share with<select value={scope} onChange={e=>setScope(e.target.value)}><option value="class">Whole class</option>{sets.flatMap(set=>set.groups.map(group=><option key={set.id+'/'+group.id} value={set.id+'/'+group.id}>{set.name} · {group.name}</option>))}</select></label><button className="btn" type="button" disabled={busy} onClick={()=>void request('hideVersions')}>Hide comparison</button><button className="btn primary" type="button" disabled={busy} onClick={()=>void request('compareVersions')}>Reveal versions</button></footer>{message&&<p role="status">{message}</p>}</div></div>}{message&&!versions&&<p role="status">{message}</p>}</>;
}
export function LearnerVersionComparison({classId,itemId,taskId}:{classId:string;itemId:string;taskId:string}) {
 const {user}=useAuth(),[versions,setVersions]=useState<ComparedVersion[]|null>(null);
 useEffect(()=>{setVersions(null);if(!user?.uid)return;return onSnapshot(doc(db,'classes',classId,'comparisons',`${itemId}_${taskId}`,'views',user.uid),s=>setVersions(s.data()?.versions??null),()=>setVersions(null));},[classId,itemId,taskId,user?.uid]);
 return versions?<section className="ca ca-shared-comparison" aria-label="Compare task versions"><h2>Compare versions</h2><p>Your teacher has shared these versions for comparison.</p><ComparedPanels versions={versions} classId={classId}/></section>:null;
}
