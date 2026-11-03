import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

const announce=()=>{document.body.classList.toggle('game-view-active',!!document.querySelector('.game-expanded'));window.dispatchEvent(new Event('elt-game-view'));};
// Keep one portal host for the whole lifetime: moving it must not restart a game,
// lose an entered answer, or reset a running timer. Calls/chat use higher layers.
export function GameFrame({title,children}:{title:string;children:ReactNode}){
 const [host]=useState(()=>document.createElement('div')),[expanded,setExpanded]=useState(false),[layout,setLayout]=useState('auto');
 const anchor=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null),mounted=useRef(false);
 useLayoutEffect(()=>{const parent=expanded?document.body:anchor.current;if(!parent)return;parent.appendChild(host);host.className=expanded?'game-frame game-expanded':'game-frame';announce();if(expanded){const old=document.body.style.overflow;document.body.style.overflow='hidden';toggle.current?.focus({preventScroll:true});return()=>{document.body.style.overflow=old;};}if(mounted.current)toggle.current?.focus({preventScroll:true});mounted.current=true;},[expanded,host]);
 useLayoutEffect(()=>()=>{host.remove();announce();},[host]);
 return <><div ref={anchor} className="game-frame-anchor"/>{createPortal(<div className={"game-frame-content game-layout-"+layout} role="region" aria-label={title+' player'} onKeyDown={e=>{if(expanded&&e.key==='Escape'){e.stopPropagation();setExpanded(false);}}}><div className="game-frame-bar"><label className="game-layout-control">Layout<select aria-label="Game layout" value={layout} onChange={e=>setLayout(e.target.value)}><option value="auto">Auto · fit screen</option><option value="portrait">Portrait · phone</option><option value="landscape">Landscape · wide</option></select></label><button ref={toggle} type="button" className="btn" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Return to inline game':'Expand game'}</button></div>{children}</div>,host)}</>;
}
