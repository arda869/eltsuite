import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {GamePlayer} from '../games/GamePlayer';
import {TaskRenderer} from '../components/TaskRenderer';
import {splitKey,type Responses} from '../lib/questions';
import type {GameConfig} from '../games/model';
import type {ExportTask} from '../lib/textformat';
import '../styles.css';
import './player.css';
export type OfflinePackage={title:string;game?:GameConfig;tasks?:ExportTask[];warnings?:string[]};
function Task({task}:{task:ExportTask}){
 const [responses,setResponses]=useState<Responses>({}),[checked,setChecked]=useState(false);
 const {content,key}=splitKey(task.content);
 return <section className="offline-task"><h2>{task.title}</h2>{task.instrDoc?<TaskRenderer content={task.instrDoc} responses={{}}/>:<p>{task.instructions}</p>}<TaskRenderer layout={(task.layout||'single') as 'single'|'two'|'two-wide'|'media'} content={content} responses={responses} results={checked?key:null} onChange={(id,value)=>setResponses(v=>({...v,[id]:value}))}/>{Object.keys(key).length>0&&<button className="btn" onClick={()=>setChecked(v=>!v)}>{checked?'Hide answers':'Check answers'}</button>}</section>;
}
function Player({data}:{data:OfflinePackage}){
 const [restart,setRestart]=useState(0);
 return <MemoryRouter><header className="offline-brand"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#d98f63"/><rect x="14" y="12" width="5.5" height="24" rx="2.75" fill="#fff"/><rect x="14" y="12" width="21" height="5.5" rx="2.75" fill="#fff"/><rect x="14" y="21.25" width="15" height="5.5" rx="2.75" fill="#fff"/><rect x="14" y="30.5" width="21" height="5.5" rx="2.75" fill="#fff"/></svg><div><strong>ELT Suite</strong><span>Offline classroom</span></div></header><main className="offline-main"><h1>{data.title}</h1><p className="offline-note">Teach on this device without internet. Responses stay in this open file; they are not sent to your class. Live calls, messages and shared leaderboards are online features.</p>{!!data.warnings?.length&&<details><summary>Online-only content ({data.warnings.length})</summary><ul>{data.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}<div key={restart}>{data.game?<GamePlayer game={data.game}/>:data.tasks?.map((task,i)=>task.kind==='section'?<h2 key={i}>{task.title}</h2>:<Task key={i} task={task}/>)}</div><button className="btn" onClick={()=>{if(window.confirm('Clear answers and restart this offline file?'))setRestart(v=>v+1);}}>Restart</button></main><footer className="offline-footer">Created with ELT Suite · eltsuite.com · Teacher copy — may include answer keys</footer></MemoryRouter>;
}
const data=JSON.parse(document.getElementById('offline-data')!.textContent!) as OfflinePackage;
createRoot(document.getElementById('root')!).render(<Player data={data}/>);
