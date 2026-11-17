import {createContext,useState} from 'react';
import type {JSONContent} from '@tiptap/react';
import {ActivityStage} from './ActivityStage';
import {configFromNode, type ActivityItem} from './model';
import {configForLearner,initialActivity,stateForLearner,transition,type ActivityAction} from './state';
declare const __BUILD__: string;
export const LocalActivityMode=createContext(false);
export function LocalActivity({node,renderItem,classId=''}:{node:JSONContent;classId?:string;renderItem?:(item:ActivityItem)=>React.ReactNode}) {
 const config=configFromNode(node),[names,setNames]=useState('Learner A\nLearner B'),[role,setRole]=useState('teacher'),[covered,setCovered]=useState(false),[error,setError]=useState('');
 const [state,setState]=useState(()=>initialActivity(config,[{id:'offline-0',name:'Learner A'},{id:'offline-1',name:'Learner B'}]));
 const send=(command:ActivityAction)=>{try{const action=command.type==='roll'?{...command,die:Math.floor(Math.random()*6)+1}:command.type==='call'&&!command.itemId?{...command,itemId:config.items.find(i=>!state.called.includes(i.id))?.id??''}:command;setState(transition(config,state,action,{id:role,teacher:role==='teacher'},Date.now()));setError('');}catch(e){setError((e as Error).message);}};
 const teacher=role==='teacher';
 return <div className="ca-local"><p className="hint">{__BUILD__ === 'offline' ? 'Offline teaching copy · one shared device.' : 'Activity preview · changes here do not affect your live class.'} This screen contains the full set of cards. Pass the device before opening a learner’s card.</p>{state.phase==='ready'&&<label className="ca-setting">Players (one name per line)<textarea value={names} rows={3} onChange={e=>{const next=e.target.value;setNames(next);setState(initialActivity(config,next.split('\n').map(x=>x.trim()).filter(Boolean).map((name,n)=>({id:'offline-'+n,name}))));}}/></label>}<label className="ca-setting">Screen for<select value={role} onChange={e=>{setRole(e.target.value);setCovered(e.target.value!=='teacher');}}><option value="teacher">Teacher</option>{state.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{covered?<div className="ca-wait"><b>Pass the device to {state.people.find(p=>p.id===role)?.name}</b><button type="button" className="btn primary" onClick={()=>setCovered(false)}>Open my activity</button></div>:<ActivityStage classId={classId} config={teacher?config:configForLearner(config,state,role)} state={teacher?state:stateForLearner(config,state,role)} selfId={role} teacher={teacher} send={send} error={error} renderItem={renderItem}/>}</div>;
}
