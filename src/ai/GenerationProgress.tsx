import { useEffect, useState } from 'react';
import { StudioMark } from './StudioMark';

export function GenerationProgress({action,useEvidence,evidenceCount}:{action:string;useEvidence:boolean;evidenceCount:number}) {
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{setSeconds(0);const timer=window.setInterval(()=>setSeconds(s=>s+1),1000);return()=>window.clearInterval(timer);},[action]);
  const generating=['outline','plan','activities'].includes(action);
  const title=action==='context'?'Gathering your class context':action==='outline'?'Exploring ideas for your outline':action==='plan'?'Developing and reviewing your teaching plan':action==='activities'?'Building your class activities':action==='create'?'Creating your content in Classes':'Updating your private workspace';
  const detail=action==='context'?'Loading class settings, recent lessons and available learning evidence.':action==='outline'?'Shaping your brief into a sequence of purposeful learning stages.':action==='plan'?'Developing the stages, materials and teacher guidance, with an AI review.':action==='activities'?'Preparing instructions, task formats, answer keys and useful alternative versions.':action==='create'?'Saving editable activities, hidden from learners until you share them.':'Your existing work stays on this page.';
  return <aside className="ai-generation" aria-label="Creation status">
    <div className="ai-generation-mark" aria-hidden="true"><StudioMark/></div>
    <div><p className="ai-eyebrow">IN PROGRESS</p><h3 role="status">{title}…</h3><p>{detail}</p>
    {generating&&<p className="ai-generation-context">{useEvidence?evidenceCount>0?`Class history enabled · ${evidenceCount} recent items available`:'Class history enabled · no recent items in the current sample':'Class history turned off · using your brief and class profile'}</p>}
    <p className="ai-generation-time"><span aria-hidden="true">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} elapsed · </span>{generating?`Allow up to ${action==='plan'?'six':'three'} minutes. Keep this page open.`:'Please keep this page open.'}</p>
    {seconds>180&&generating&&<p>This is taking longer than usual. We’re still waiting for a response; you don’t need to submit again.</p>}</div>
  </aside>;
}
