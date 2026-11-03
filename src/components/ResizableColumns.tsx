import {useEffect,useRef,useState,type CSSProperties,type RefObject} from 'react';
const names=['Name','Kind','Size','Folder','Added'];
const clamp=(n:number,i:number)=>Math.round(Math.max(i===0?160:70,Math.min(5000,n)));
export function useResourceColumns(uid:string,host:RefObject<HTMLElement>){
 const [widths,setWidths]=useState<number[]|null>(null),current=useRef(widths);current.current=widths;
 const key='elt.resources.columns.'+uid;
 useEffect(()=>{try{const w=JSON.parse(localStorage.getItem(key)||'null');setWidths(Array.isArray(w)&&w.length===5&&w.every(Number.isFinite)?w.map(clamp):null);}catch{setWidths(null);}},[key]);
 const save=(w:number[]|null)=>{setWidths(w);try{if(w)localStorage.setItem(key,JSON.stringify(w));else localStorage.removeItem(key);}catch{}};
 const measured=()=>current.current||[...host.current?.querySelectorAll<HTMLElement>('.ma-lhead > span')||[]].map(el=>el.getBoundingClientRect().width);
 const cancel=useRef<(()=>void)|null>(null);useEffect(()=>()=>cancel.current?.(),[]);
 const handle=(i:number)=><span key={i} className="resource-column-resize" role="separator" tabIndex={0} aria-label={'Resize '+names[i]+' column'} aria-orientation="vertical" aria-valuemin={i===0?160:70} aria-valuemax={5000} aria-valuenow={widths?.[i]||[400,110,90,120,70][i]} onPointerDown={e=>{e.preventDefault();e.stopPropagation();const start=measured();if(start.length!==5)return;const x=e.clientX;let next=start;const move=(ev:PointerEvent)=>{next=start.map((w,j)=>j===i?clamp(w+ev.clientX-x,i):w);setWidths(next);};const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',abandon);cancel.current=null;};const up=()=>{stop();save(next);};const abandon=()=>{stop();setWidths(widths);};cancel.current=abandon;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',abandon);}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const w=measured();if(w.length===5)save(w.map((n,j)=>j===i?clamp(n+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?40:10),i):n));}else if(e.key==='Home'){e.preventDefault();save(null);}}} onDoubleClick={()=>save(null)}/>;
 const style=widths?{'--resource-columns':widths.map(n=>n+'px').join(' '),'--resource-row-width':widths.reduce((a,b)=>a+b,76)+'px'} as CSSProperties:undefined;
 return {style,handle,reset:()=>save(null)};
}
