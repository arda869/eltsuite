import {useEffect,useRef,useState} from 'react';
import {landing,piece,settle} from './blockModel';
import {norm,type GameType} from './model';
export const ADVENTURES=['shark','taxi','drive','blocks'];
export function AdventureBoard({type,round,seconds,options,answer,remote,onState,onCorrect,onLose,disabled}:{type:GameType;round:number;seconds:number;options:string[];answer:string;remote:Record<string,any>;onState:(s:Record<string,any>)=>void;onCorrect:(s:string)=>void;onLose:()=>void;disabled:boolean}){
 const root=useRef<HTMLDivElement>(null);
 const [now,setNow]=useState(Date.now),latest=useRef(remote),lost=useRef(false);latest.current=remote;
 const phase=remote.phase||'ready',deadline=remote.deadline||0,running=phase==='running';
 const change=(p:Record<string,any>)=>onState({...latest.current,...p});
 const lose=(reason='time')=>{if(lost.current||disabled)return;lost.current=true;change({phase:'lost',loss:reason});onLose();};
 const loseRef=useRef(lose);loseRef.current=lose;
 useEffect(()=>{if(!running)return;lost.current=false;const timer=window.setInterval(()=>{const t=Date.now();setNow(t);if(t>=deadline&&!disabled)loseRef.current();},100);return()=>clearInterval(timer);},[running,deadline,disabled]);
 const remaining=Math.max(0,Math.ceil((deadline-now)/1000)),progress=running?Math.min(1,Math.max(0,1-(deadline-now)/(seconds*1000))):phase==='cleared'?0:0;
 const lane=remote.lane??4,rotation=remote.rotation||0,stack:number[]=remote.stack||[],drop=landing(stack,round,rotation,lane),shape=piece(round,rotation),left=Math.max(0,Math.min(10-Math.max(...shape.map(c=>c[0]))-1,lane)),top=Math.floor(progress*drop.y);
 const current=shape.map(([x,y])=>(top+y)*10+left+x);
 const driving=type==='taxi'||type==='drive',roadLane=remote.roadLane??1;
 const choose=(v:string)=>{if(disabled||!running)return;if(Date.now()>=deadline){lose();return;}if(norm(v)!==norm(answer)){change({hint:'Not yet. Try another answer.'});return;}
  if(driving&&roadLane===round%3){change({hint:'Steer around the cone first.'});return;}
  if(type==='blocks'&&drop.blocked){lose('stack');return;}
  change({phase:'cleared',hint:'',stack:type==='blocks'?settle(stack,drop.cells):stack});onCorrect(v);
 };
 return <div ref={root} tabIndex={0} role="group" aria-label="Arcade controls" onKeyDown={e=>{if(disabled||!running)return;if(['ArrowLeft','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();if(type==='blocks'){if(e.key==='ArrowUp')change({rotation:(rotation+1)%4});else change({lane:Math.max(0,Math.min(9,lane+(e.key==='ArrowLeft'?-1:1)))});}else if(driving&&e.key!=='ArrowUp')change({roadLane:Math.max(0,Math.min(2,roadLane+(e.key==='ArrowLeft'?-1:1)))});}}} className={'game-adventure adventure-'+type+(running?' running':'')}>
 <p>{type==='blocks'?'Answer correctly before the block reaches the bottom. Move or rotate it to fill a row.':type==='shark'?'Answer correctly to escape the shark and reach the next island.':type==='taxi'?'Steer around the cone. Answer correctly to deliver your passenger before time runs out.':'Steer around the cone. Answer correctly to reach the checkpoint before time runs out.'} Wrong answers let you try again.</p>
 <div className="adventure-hud"><strong>{running?`${remaining}s left`:phase==='cleared'?'Checkpoint reached':'Ready when you are'}</strong><span>{seconds} seconds per question</span></div>
 {type==='blocks'?<div className="blocks-layout"><div className="blocks-well" role="img" aria-label={`Falling blocks board. ${stack.length} settled squares.`}>{Array.from({length:180},(_,i)=><span key={i} className={stack.includes(i)?'settled':running&&current.includes(i)?'falling':drop.cells.includes(i)?'ghost':''}/>)}</div><div className="blocks-controls"><p>Fill a row to clear it.</p><button type="button" disabled={disabled||!running} onClick={()=>change({lane:Math.max(0,lane-1)})}>Move left</button><button type="button" disabled={disabled||!running} onClick={()=>change({rotation:(rotation+1)%4})}>Rotate block</button><button type="button" disabled={disabled||!running} onClick={()=>change({lane:Math.min(9,lane+1)})}>Move right</button></div></div>:<div className="adventure-world" aria-hidden="true"><div className="adventure-sky"/><div className="voxel-town">{Array.from({length:7},(_,i)=><i key={i} style={{height:40+(i*29)%80,left:`${i*15}%`}}/>)}</div>{type==='shark'?<><div className="adventure-water"/><div className="voxel-island">🏝</div><div className="voxel-boat">⛵</div><div className="voxel-shark" style={{left:`${5+progress*50}%`}}>🦈</div></>:<><div className="adventure-road"/><div className="road-cone" style={{left:`${25+(round%3)*25}%`}}>▲</div><div className={'voxel-car '+(type==='taxi'?'taxi':'')} style={{left:`calc(${25+roadLane*25}% - 34px)`}}><span>{type==='taxi'?'TAXI':'01'}</span><i/><b/></div><div className="adventure-finish">{type==='taxi'?'DESTINATION':'CHECKPOINT'}</div></>}</div>}
 <div className="game-direction">{driving&&<><button type="button" disabled={disabled||!running||roadLane===0} onClick={()=>change({roadLane:roadLane-1})}>Steer left</button><button type="button" disabled={disabled||!running||roadLane===2} onClick={()=>change({roadLane:roadLane+1})}>Steer right</button><span>{type==='taxi'?'Passengers delivered':'Checkpoints reached'}: {round}</span></>}</div>
 <progress aria-label="Time remaining" max={seconds} value={running?remaining:phase==='ready'?seconds:0}/>
 {phase==='ready'&&<button type="button" disabled={disabled} onClick={()=>{const t=Date.now();setNow(t);lost.current=false;change({phase:'running',deadline:t+seconds*1000,hint:'',loss:''});root.current?.focus();}}>Start round</button>}
 {remote.hint&&running&&<p role="status">{remote.hint}</p>}
 <div className="game-options">{options.map(v=><button key={v} type="button" disabled={disabled||!running} onClick={()=>choose(v)}>{v}</button>)}</div>
 </div>;
}
