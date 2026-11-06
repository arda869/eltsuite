import {useEffect, useRef} from 'react';
import {UiIcon} from './UiIcon';

type InsertKind = 'blank'|'import'|'ai'|'section'|'lesson';

export function TaskInsert({label,onChoose,ai=true,open,onOpenChange}:{label:string;onChoose:(kind:InsertKind)=>void;ai?:boolean;open:boolean;onOpenChange:(open:boolean)=>void}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!(e.target as Element).closest?.('.task-insert'))onOpenChange(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){onOpenChange(false);ref.current?.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,onOpenChange]);
 return <details ref={ref} className="task-insert" open={open}><summary aria-label={label} title={label} onClick={e=>{e.preventDefault();onOpenChange(!open);}}><span aria-hidden="true">+</span></summary><div className="task-insert-menu" role="group" aria-label={label}>{([['blank','New task','plus'],['import','Import material','upload'],['ai','Create with AI','videoSparkles'],['section','Section','textSize'],['lesson','From another lesson','copyall']] as const).map(([kind,text,icon])=><button type="button" className="btn small-btn" aria-label={text} data-tip={text} key={kind} disabled={!ai&&(kind==='import'||kind==='ai')} onClick={()=>{onOpenChange(false);onChoose(kind);}}><UiIcon name={icon}/><span className="task-insert-label">{text}</span></button>)}{!ai&&<small>AI creation and import are not enabled for this account.</small>}</div></details>;
}
