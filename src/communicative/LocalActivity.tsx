import {createContext,useContext,useState,type KeyboardEvent} from 'react';
import type {JSONContent} from '@tiptap/react';
import {ActivityStage} from './ActivityStage';
import {configFromNode, type ActivityItem} from './model';
import {configForLearner,initialActivity,stateForLearner,transition,type ActivityAction} from './state';
declare const __BUILD__: string;
export const LocalActivityMode=createContext(false);
/** An editor learner preview can project one seat without exposing teacher controls. */
export const LocalLearnerPreviewMode=createContext<number|null>(null);
export function LocalActivity({node,renderItem,classId=''}:{node:JSONContent;classId?:string;renderItem?:(item:ActivityItem)=>React.ReactNode}) {
 const config=configFromNode(node),learnerSeat=useContext(LocalLearnerPreviewMode);
 const initialNames=Array.from({length:Math.max(2,(learnerSeat??0)+1)},(_,i)=>`Learner ${String.fromCharCode(65+i)}`).join('\n');
 const [names,setNames]=useState(initialNames),[role,setRole]=useState(learnerSeat===null?'teacher':`offline-${learnerSeat}`),[covered,setCovered]=useState(false),[error,setError]=useState('');
 const [state,setState]=useState(()=>{const ready=initialActivity(config,initialNames.split('\n').map((name,i)=>({id:`offline-${i}`,name})));if(learnerSeat===null)return ready;try{return transition(config,ready,{type:'start'},{id:'teacher',teacher:true},Date.now());}catch{return ready;}});
 const send=(command:ActivityAction)=>{try{const action=command.type==='roll'?{...command,die:Math.floor(Math.random()*6)+1}:command.type==='call'&&!command.itemId?{...command,itemId:config.items.find(i=>!state.called.includes(i.id))?.id??''}:command;setState(transition(config,state,action,{id:role,teacher:role==='teacher'},Date.now()));setError('');}catch(e){setError((e as Error).message);}};
 const teacher=role==='teacher';
 return <div className="ca-local">{learnerSeat===null&&<><p className="hint">{__BUILD__ === 'offline' ? 'Offline teaching copy · one shared device.' : 'Activity preview · changes here do not affect your live class.'} This screen contains the full set of cards. Pass the device before opening a learner’s card.</p>{state.phase==='ready'&&<Players names={names} onChange={next=>{setNames(next);setState(initialActivity(config,next.split('\n').map(x=>x.trim()).filter(Boolean).map((name,n)=>({id:'offline-'+n,name}))));}}/>}<div className="ca-view-as-row"><span>View</span><span className="ca-view-as" role="radiogroup" aria-label="Whose screen to show">{[{id:'teacher',name:'Teacher view'},...state.people.map(p=>({id:p.id,name:p.name}))].map(v=><button key={v.id} type="button" role="radio" aria-checked={role===v.id} className={role===v.id?'on':''} onClick={()=>{setRole(v.id);setCovered(v.id!=='teacher');}}>{v.id==='teacher'?v.name:`As ${v.name}`}</button>)}</span></div></>}{covered?<div className="ca-wait"><b>Pass the device to {state.people.find(p=>p.id===role)?.name}</b><button type="button" className="btn primary" onClick={()=>setCovered(false)}>Open my activity</button></div>:<ActivityStage classId={classId} config={teacher?config:configForLearner(config,state,role)} state={teacher?state:stateForLearner(config,state,role)} selfId={role} teacher={teacher} send={send} error={error} renderItem={renderItem}/>}</div>;
}

const PLAYER_COLOURS=6;
// Players as name tags: type a name and press Enter. Each one gets a colour, the same as their token.
function Players({names,onChange}:{names:string;onChange:(next:string)=>void}){
 const list=names.split('\n').map(x=>x.trim()).filter(Boolean),[draft,setDraft]=useState('');
 const add=()=>{const name=draft.trim();if(!name||list.length>=30)return;onChange([...list,name].join('\n'));setDraft('');};
 const key=(e:KeyboardEvent<HTMLInputElement>)=>{if(e.key==='Enter'||e.key===','){e.preventDefault();add();}else if(e.key==='Backspace'&&!draft&&list.length)onChange(list.slice(0,-1).join('\n'));};
 return <div className="ca-players-edit"><span className="ca-players-label">Players</span><div className="ca-player-tags">{list.map((name,n)=><span key={n} className="ca-player-tag" style={{['--c' as string]:`var(--team-${n%PLAYER_COLOURS+1})`}}><span className="avatar c" aria-hidden="true">{name.split(/\s+/).map(w=>w[0]).slice(0,2).join('')}</span>{name}<button type="button" aria-label={`Remove ${name}`} onClick={()=>onChange(list.filter((_,i)=>i!==n).join('\n'))}>×</button></span>)}<input value={draft} placeholder={list.length?'Add a player…':'Type a name and press Enter'} aria-label="Add a player" onChange={e=>setDraft(e.target.value)} onKeyDown={key} onBlur={add}/></div></div>;
}
