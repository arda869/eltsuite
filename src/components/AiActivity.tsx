import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { AiMark } from './AiMark';

type Activity = { id: string; title: string; detail: string; active: boolean; error?: string; progress?: number; open: () => void };
let snapshot: Activity[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function put(value: Activity) { const at=snapshot.findIndex(a=>a.id===value.id); snapshot=at<0?[...snapshot,value]:snapshot.map((a,i)=>i===at?value:a); notify(); }
function remove(id: string) { if (!snapshot.some(a => a.id === id)) return; snapshot = snapshot.filter(a => a.id !== id); notify(); }

// The owning editor remains mounted when its panel is minimised. No second paid
// request is made when returning to it. Work is deliberately scoped to this page.
// A panel never hides itself: it stays open with its progress until the teacher presses Minimise.
export function useAiActivity({ active, title, detail = '', error = '', progress, enabled = true, retainResult = false, onOpen }: {
  active: boolean; title: string; detail?: string; error?: string; progress?: number; enabled?: boolean; retainResult?: boolean; onOpen?: () => void;
}) {
  const id = useId(), wasActive = useRef(false), callback = useRef(onOpen);
  const [minimised,setMinimised] = useState(false);
  const hiddenPanel=useRef(false);
  callback.current = onOpen;
  const restore = useCallback(() => { hiddenPanel.current=false; setMinimised(false); remove(id); callback.current?.(); },[id]);
  useEffect(() => {
    if (!enabled) { remove(id); wasActive.current=false; hiddenPanel.current=false; setMinimised(false); return; }
    if (active) {
      if (hiddenPanel.current) put({id,title,detail,active:true,progress,open:restore});
    } else if (wasActive.current) {
      if(hiddenPanel.current||retainResult)put({id,title,detail:error?'Open the result to retry. Your existing work is kept.':'Ready to review.',active:false,error,open:restore});
      else remove(id);
    }
    wasActive.current=active;
  },[active,title,detail,error,progress,enabled,retainResult,id,restore]);
  useEffect(() => () => remove(id),[id]);
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue=''; };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[active]);
  return { minimised, minimise: () => { hiddenPanel.current=true; setMinimised(true); put({id,title,detail:active?detail:error?'Open the result to retry. Your existing work is kept.':'Ready to review.',active,error,progress,open:restore}); }, restore };
}

export function AiActivityDock() {
  const activities = useSyncExternalStore(subscribe,() => snapshot,() => snapshot);
  const [compact,setCompact] = useState(false);
  const [destination,setDestination] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el) return;
    // A non-modal top-layer popover stays usable above an editor's native dialog.
    // It never makes the rest of the page inert or takes the teacher's focus.
    el.setAttribute('popover','manual');
    if (activities.length) { try { if (!el.matches(':popover-open')) el.showPopover?.(); } catch {} }
    else { try { el.hidePopover?.(); } catch {} setDestination(''); setCompact(false); }
  },[activities.length]);
  const active = activities.filter(a => a.active).length;
  useEffect(()=>{
    if(!active)return;
    const guard=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=(event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
      if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||url.pathname+url.search===location.pathname+location.search)return;
      event.preventDefault();event.stopPropagation();setDestination(url.href);setCompact(false);
    };
    document.addEventListener('click',guard,true);
    return()=>document.removeEventListener('click',guard,true);
  },[active]);
  useEffect(()=>{
    if(!active)return;
    const shrink=(event:FocusEvent)=>{
      if(innerWidth<=700&&(event.target as Element)?.matches('input,textarea,[contenteditable="true"]'))setCompact(true);
    };
    document.addEventListener('focusin',shrink);
    return()=>document.removeEventListener('focusin',shrink);
  },[active]);
  return <div ref={ref} className={'ai-activity-dock'+(!activities.length?' is-empty':'')} role="region" aria-label="AI activity">
    <header><AiMark active={active>0}/><strong>{active?'AI is working':'Ready to review'}</strong><button type="button" aria-label={compact?'Expand AI activity':'Minimise AI activity'} aria-expanded={!compact} onClick={() => setCompact(v=>!v)}>{compact?'+':'−'}</button></header>
    {!compact&&<>{destination&&<div className="ai-navigation-note" role="status"><strong>Keep this work open</strong><p>Open the other page in a new tab while this finishes.</p><a className="btn small-btn" href={destination} target="_blank" rel="noopener noreferrer">Open in a new tab</a><button type="button" className="btn link" onClick={()=>setDestination('')}>Keep working here</button></div>}<div className="ai-activity-list">{activities.map(a=><section key={a.id} className={'ai-activity-item'+(a.error?' has-error':'')}>
      <div><AiMark active={a.active}/><strong>{a.title}</strong>{!a.active&&<span className="ai-activity-state">{a.error?'Needs attention':'Ready'}</span>}</div>
      <p role="status">{a.error||a.detail}</p>
      {a.active&&a.progress!==undefined&&<progress aria-label={a.title+' progress'} max="1" value={Math.max(0,Math.min(1,a.progress))}/>}
      <div className="ai-activity-actions"><button type="button" className="btn small-btn" onClick={a.open}>{a.active?'Return to task':'Review result'}<span className="sr-only"> · {a.title}</span></button>{!a.active&&<button type="button" className="btn link" onClick={()=>remove(a.id)}>Dismiss<span className="sr-only"> · {a.title}</span></button>}</div>
    </section>)}</div>{active>0&&<p className="ai-activity-note">Keep this page open while the AI works.</p>}</>}
  </div>;
}
