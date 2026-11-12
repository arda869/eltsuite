import {useEffect,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {IconBtn,UiIcon} from '../components/UiIcon';
import {TaskRenderer} from '../components/TaskRenderer';
import {InstrView} from '../editor/InstrEditor';
import {YoungInstr} from '../lessons/young';
import {questionIds,splitKey,type AnswerKey} from '../lib/questions';
import {theme} from '../lib/themes';
import {OfflineTaskActive} from './OfflineMedia';
import type {ExportTask} from '../lib/textformat';
import type {LessonStyle} from '../lib/lessonStyle';
import '../styles.css';
import '../friday-ui.css';
import '../cohesion.css';
import '../lessons/youngLesson.css';
import '../lessons/examLesson.css';
import './player.css';

export type OfflinePackage={title:string;tasks?:ExportTask[];warnings?:string[];lessonStyle?:LessonStyle;themeColor?:string;textScale?:number;displayTheme?:'light'|'dark';reading?:{font?:string;contrast?:boolean;focus?:boolean;letter?:number;line?:number}};

function Task({task,style,index,reveal,individual,onToggle}:{task:ExportTask;style:LessonStyle;index:number;reveal:number;individual:string[];onToggle:(id:string)=>void}){
 const young=style==='young';
 const {content,key}=splitKey(task.content);
 const refs=questionIds(content);
 const shown:AnswerKey=Object.fromEntries(refs.filter((q,i)=>(reveal<0||i<reveal||individual.includes(q.id))&&key[q.id]).map(q=>[q.id,key[q.id]]));
 const instruction=<InstrView doc={task.instrDoc} text={task.instructions||''}/>;
 return <section className="task-frame" data-lesson-style={style} data-activity-number={index+1}><div className="frame-inner"><div className="frame-head"><h1 className="task-title">{young&&<span className="yl-activity-number" aria-hidden="true">{index+1}</span>}{task.title}</h1>{young&&(task.instrDoc||task.instructions)?<YoungInstr content={content} icon={task.ylIcon}>{instruction}</YoungInstr>:instruction}</div><div className="frame-body teach-view" onClickCapture={event=>{const q=(event.target as HTMLElement).closest('[data-qid]') as HTMLElement|null;if(q?.dataset.qid)onToggle(q.dataset.qid)}}><TaskRenderer layout={(task.layout||'single') as 'single'|'two'|'two-wide'|'media'} content={content} responses={{}} disabled teacher revealed={shown}/></div></div></section>;
}

function Player({data}:{data:OfflinePackage}){
 useEffect(()=>{const r=data.reading||{},h=document.documentElement;h.classList.toggle('rd-clear',r.font==='clear');h.classList.toggle('rd-contrast',!!r.contrast);h.classList.toggle('rd-focus',!!r.focus);h.style.setProperty('--rd-letter',['0','0.04em','0.09em'][r.letter||0]||'0');h.style.setProperty('--rd-line',['1','1.25','1.5'][r.line||0]||'1');},[data.reading]);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;void document.fonts.ready.then(()=>{timer=setTimeout(()=>{if(stopped)return;const root=document.getElementById('root')!;root.style.visibility='visible';root.removeAttribute('inert');document.getElementById('offline-loading')?.remove();},300)});return()=>{stopped=true;clearTimeout(timer)}},[]);
 const tasks=(data.tasks||[]).filter(t=>t.kind!=='section');
 const [selected,setSelected]=useState(0),[reveal,setReveal]=useState<Record<number,number>>({}),[individual,setIndividual]=useState<Record<number,string[]>>({}),[info,setInfo]=useState(false),[activities,setActivities]=useState(false),[taskListOpen,setTaskListOpen]=useState(false),[full,setFull]=useState(false),[seconds,setSeconds]=useState(0),[timerOn,setTimerOn]=useState(false);
 useEffect(()=>{if(!timerOn)return;const interval=window.setInterval(()=>setSeconds(n=>n+1),1000);return()=>window.clearInterval(interval)},[timerOn]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setFull(false);if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(event.key==='ArrowLeft')setSelected(n=>Math.max(0,n-1));if(event.key==='ArrowRight')setSelected(n=>Math.min(tasks.length-1,n+1))};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[tasks.length]);
 const colours=theme(data.themeColor),current=tasks[selected],count=current?questionIds(splitKey(current.content).content).length:0,shown=reveal[selected]||0;
 const select=(index:number)=>{setSelected(index);setTaskListOpen(false)};
 const showNext=()=>setReveal(old=>({...old,[selected]:Math.min(count,(old[selected]||0)+1)}));
 const showAll=()=>setReveal(old=>({...old,[selected]:-1}));
 const hideAll=()=>{setReveal(old=>({...old,[selected]:0}));setIndividual(old=>({...old,[selected]:[]}))};
 const toggleOne=(id:string)=>setIndividual(old=>{const list=old[selected]||[];return{...old,[selected]:list.includes(id)?list.filter(x=>x!==id):[...list,id]}});
 return <MemoryRouter><div className={'shell wide classes-shell offline-shell'+(full?' is-full':'')} style={{'--accent':colours.accent,'--accent-text':colours.text,'--ts':data.textScale||1} as CSSProperties}>
  <header className="offline-topbar"><span className="offline-brand" aria-hidden="true">E</span><span className="offline-suite"><small>ELT Suite</small><strong>Classes</strong></span><span className="offline-breadcrumb">/ &nbsp;{data.title}</span><span className="offline-top-actions"><span className="offline-status">Offline copy</span><button type="button" className="btn small-btn" onClick={()=>setInfo(!info)} aria-expanded={info}>About this file</button></span></header>
  {info&&<aside className="offline-note"><p>This copy works without internet. Live class activities, messages and shared answers need the online lesson. This teacher copy may include answer keys.</p>{!!data.warnings?.length&&<ul>{data.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}</aside>}
  <div className="lesson-layout offline-layout">
   <button type="button" className="offline-mobile-tasks btn" aria-expanded={taskListOpen} onClick={()=>setTaskListOpen(!taskListOpen)}>Tasks · {selected+1} of {tasks.length} <span aria-hidden="true">▾</span></button>
   <nav className={'task-list offline-task-list'+(taskListOpen?' mobile-open':'')} aria-label="Tasks"><h2 className="offline-lesson-title">{data.title}</h2>{tasks.map((t,i)=><button type="button" key={i} className={'task-row offline-task-row'+(selected===i?' on':'')} aria-current={selected===i?'page':undefined} onClick={()=>select(i)}><span className="n">{i+1}</span><span>{t.title||'New task'}</span></button>)}</nav>
   <div className="center-col"><div className="session-strip teach-bar offline-teach-bar" aria-label="Teaching tools"><span className="tb-group"><button type="button" className="tb-sync" disabled title="Class syncing needs the online lesson"><UiIcon name="sync"/> Sync class</button></span><span className="tb-group"><button type="button" className={'icon-btn'+(timerOn?' on':'')} aria-label={timerOn?'Pause timer':'Start timer'} onClick={()=>setTimerOn(!timerOn)}><UiIcon name="timer"/></button>{seconds>0&&<button type="button" className="offline-timer" title="Reset timer" onClick={()=>{setSeconds(0);setTimerOn(false)}}>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</button>}</span><span className="tb-group offline-menu-anchor"><button type="button" className="tb-more" aria-expanded={activities} onClick={()=>setActivities(!activities)}>Activities <span aria-hidden="true">▾</span></button>{activities&&<div className="menu tb-menu"><p>Live class activities need the online lesson.</p><button type="button" onClick={()=>{setActivities(false);setInfo(true)}}>About this file</button></div>}</span><span className="tb-group"><IconBtn icon={full?'fullscreenOff':'fullscreen'} label={full?'Leave full screen':'Full screen'} onClick={()=>setFull(!full)}/></span></div>
    {current?<div className="offline-slide" key={selected}><OfflineTaskActive.Provider value={true}><Task task={current} style={data.lessonStyle??'adult'} index={selected} reveal={shown} individual={individual[selected]||[]} onToggle={toggleOne}/></OfflineTaskActive.Provider></div>:<p className="offline-empty">This lesson has no visible tasks.</p>}
    {current&&<div className="frame-foot offline-foot"><span className="hint">Offline teaching copy · click a question to show its answer</span><span className="foot-acts"><span className="reveal-ctl foot-reveal" aria-label="Answers"><IconBtn icon="revealOne" label="Show the next answer" disabled={shown<0||shown>=count} onClick={showNext}/><IconBtn icon="revealAll" label="Show all answers" disabled={shown<0||count===0} onClick={showAll}/><IconBtn icon="hideAnswers" label="Hide answers" disabled={shown===0&&!(individual[selected]||[]).length} onClick={hideAll}/></span><IconBtn icon="prev" label="Previous task" className="nav-arrow" disabled={selected===0} onClick={()=>select(selected-1)}/><IconBtn icon="next" label="Next task" className="nav-arrow" disabled={selected>=tasks.length-1} onClick={()=>select(selected+1)}/></span></div>}
   </div>
  </div>
 </div></MemoryRouter>;
}
const data=JSON.parse(document.getElementById('offline-data')!.textContent!) as OfflinePackage;
createRoot(document.getElementById('root')!).render(<Player data={data}/>);
