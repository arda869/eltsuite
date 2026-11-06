import {useEffect,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {GamePlayer} from '../games/GamePlayer';
import {TaskRenderer} from '../components/TaskRenderer';
import {InstrView} from '../editor/InstrEditor';
import {YoungInstr} from '../lessons/young';
import {splitKey,type Responses} from '../lib/questions';
import {theme} from '../lib/themes';
import {OfflineTaskActive} from './OfflineMedia';
import type {GameConfig} from '../games/model';
import type {ExportTask} from '../lib/textformat';
import type {LessonStyle} from '../lib/lessonStyle';
import '../styles.css';
import '../friday-ui.css';
import '../cohesion.css';
import '../lessons/youngLesson.css';
import './player.css';
export type OfflinePackage={title:string;game?:GameConfig;tasks?:ExportTask[];warnings?:string[];lessonStyle?:LessonStyle;themeColor?:string;textScale?:number;reading?:{font?:string;contrast?:boolean;focus?:boolean;letter?:number;line?:number}};
function Task({task,young,index}:{task:ExportTask;young:boolean;index:number}){
 const [responses,setResponses]=useState<Responses>({}),[checked,setChecked]=useState(false);
 const {content,key}=splitKey(task.content);
 const instruction=<InstrView doc={task.instrDoc} text={task.instructions||''}/>;
 return <section className="task-frame" data-lesson-style={young?'young':'adult'} data-activity-number={index+1}><div className="frame-inner"><div className="frame-head"><h1 className="task-title">{young&&<span className="yl-activity-number" aria-hidden="true">{index+1}</span>}{task.title}</h1>{young&&(task.instrDoc||task.instructions)?<YoungInstr content={content}>{instruction}</YoungInstr>:instruction}</div><div className="frame-body teach-view"><TaskRenderer layout={(task.layout||'single') as 'single'|'two'|'two-wide'|'media'} content={content} responses={responses} results={checked?key:null} onChange={(id,value)=>setResponses(v=>({...v,[id]:value}))}/></div><div className="frame-foot"><span className="hint">Offline · responses stay in this open file</span>{Object.keys(key).length>0&&<button className="btn" onClick={()=>setChecked(v=>!v)}>{checked?'Hide answers':'Check answers'}</button>}</div></div></section>;
}
function Player({data}:{data:OfflinePackage}){
 useEffect(()=>{const r=data.reading||{},h=document.documentElement;h.classList.toggle('rd-clear',r.font==='clear');h.classList.toggle('rd-contrast',!!r.contrast);h.classList.toggle('rd-focus',!!r.focus);h.style.setProperty('--rd-letter',['0','0.04em','0.09em'][r.letter||0]||'0');h.style.setProperty('--rd-line',['1','1.25','1.5'][r.line||0]||'1');},[data.reading]);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;
  void document.fonts.ready.then(()=>{timer=setTimeout(()=>{if(stopped)return;const root=document.getElementById('root')!;root.style.visibility='visible';root.removeAttribute('inert');document.getElementById('offline-loading')?.remove();},3000);});
  return()=>{stopped=true;clearTimeout(timer);};
 },[]);
 const [restart,setRestart]=useState(0),[selected,setSelected]=useState(0),[info,setInfo]=useState(false);
 const tasks=(data.tasks||[]).filter(t=>t.kind!=='section'),colours=theme(data.themeColor);
 return <MemoryRouter><div className="shell wide classes-shell offline-shell" style={{'--accent':colours.accent,'--accent-text':colours.text,'--ts':data.textScale||1} as CSSProperties}><header className="offline-toolbar"><strong><span className="offline-suite-name">ELT Suite</span> {data.title}</strong>{tasks.length>0&&<nav aria-label="Lesson tasks"><button className="btn" disabled={selected===0} onClick={()=>setSelected(n=>n-1)}>Previous</button><label><select aria-label="Task" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{tasks.map((t,i)=><option key={i} value={i}>{i+1}. {t.title||'Task'}</option>)}</select></label><button className="btn" disabled={selected>=tasks.length-1} onClick={()=>setSelected(n=>n+1)}>Next</button></nav>}<button className="btn" aria-expanded={info} onClick={()=>setInfo(!info)}>About this download{data.warnings?.length?' · online content':''}</button></header>{info&&<aside className="offline-note"><p>Teach on this device without internet. Responses stay in this open file. Live calls, messages and shared leaderboards require the original lesson online. This teacher copy may include answer keys.</p>{!!data.warnings?.length&&<ul>{data.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}<button className="btn" onClick={()=>{if(window.confirm('Clear answers and restart this offline file?'))setRestart(v=>v+1);}}>Restart</button></aside>}<main className="lesson-layout present" key={restart}><div className="center-col">{data.game?<GamePlayer game={data.game} title={data.title}/>:tasks.length?tasks.map((task,i)=><div className="offline-slide" hidden={selected!==i} key={i}><OfflineTaskActive.Provider value={selected===i}><Task task={task} young={data.lessonStyle==='young'} index={i}/></OfflineTaskActive.Provider></div>):<p>This lesson has no visible tasks.</p>}</div></main></div></MemoryRouter>;
}
const data=JSON.parse(document.getElementById('offline-data')!.textContent!) as OfflinePackage;
createRoot(document.getElementById('root')!).render(<Player data={data}/>);
