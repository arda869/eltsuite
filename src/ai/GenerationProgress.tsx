import { useCallback, useEffect, useState } from 'react';
import { StudioMark } from './StudioMark';

export function GenerationProgress({action,useEvidence,evidenceCount,media=[],backHref}:{action:string;useEvidence:boolean;evidenceCount:number;backHref?:string;media?:{title:string;kind:string;status:string;completedLines:number;totalLines:number}[]}) {
  const [seconds,setSeconds]=useState(0);
  const focusOnMount=useCallback((element:HTMLElement|null)=>{element?.focus();},[]);
  useEffect(()=>{setSeconds(0);const timer=window.setInterval(()=>setSeconds(s=>s+1),1000);return()=>window.clearInterval(timer);},[action]);
  const generating=['outline','plan','activities'].includes(action);
  const title=action==='media'?'Preparing images and recordings':action==='context'?'Gathering your class context':action==='outline'?'Exploring ideas for your outline':action==='plan'?'Developing and reviewing your teaching plan':action==='activities'?'Building your class activities':action==='create'?'Creating your content in Classes':'Updating your private workspace';
  const detail=action==='media'?'Saving the media your activities need. Completed assets are kept if another needs a retry.':action==='context'?'Loading class settings, recent lessons and available learning evidence.':action==='outline'?'Shaping your brief into a sequence of purposeful learning stages.':action==='plan'?'Developing the stages, materials and teacher guidance, with an AI review.':action==='activities'?'Preparing instructions, task formats, answer keys and useful alternative versions.':action==='create'?'Saving editable activities, hidden from learners until you share them.':'Your existing work stays on this page.';
  return <aside className="ai-generation" role="dialog" aria-modal="true" aria-label="Creation status" tabIndex={-1} onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();e.currentTarget.querySelector('a')?.focus();}}} ref={focusOnMount}>
    <div className="ai-generation-mark" aria-hidden="true"><StudioMark/></div>
    <div><p className="ai-eyebrow">IN PROGRESS</p><h3 role="status">{title}…</h3><p>{detail}</p>
    {action==='media'&&<ol className="ai-media-checklist">{media.map((m,i)=><li key={i}><span>{m.status==='ready'?'✓':m.status==='failed'?'!':'○'}</span> {m.title} · {m.status==='ready'?'Saved':m.status==='failed'?'Needs retry':m.kind==='audio'&&m.completedLines?`${m.completedLines}/${m.totalLines} takes saved`:m.status==='running'?'Creating':'Queued'}</li>)}</ol>}{generating&&<p className="ai-generation-context">{useEvidence?evidenceCount>0?`Class history enabled · ${evidenceCount} recent items available`:'Class history enabled · no recent items in the current sample':'Class history turned off · using your brief and class profile'}</p>}
    <p className="ai-generation-time"><span aria-hidden="true">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} elapsed · </span>{generating?`Allow up to ${action==='plan'?'six':'three'} minutes. Keep this page open.`:action==='media'?'Media preparation continues on the server.':'Please keep this page open.'}</p>
    {seconds>180&&generating&&<p>This is taking longer than usual. We’re still waiting for a response; you don’t need to submit again.</p>}{backHref&&<a className="btn" href={backHref}>Back to class</a>}</div>
  </aside>;
}
