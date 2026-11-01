import { useEffect, useRef, useState } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createSpeech } from '../lib/speech';
import { encodeMp3 } from '../lib/audioEncode';
import { mediaInfo, saveAsset, videoCall } from './library';
import type { VideoAsset } from './model';
import { VIDEO_STYLES } from '../../functions/video/styles.js';
import { VideoButton } from './VideoButton';
import { AssetPreview } from './CharacterLibrary';
export type PlannedScene = {title:string;prompt:string;script:string;duration:number;question:string;answer:string;teacherNotes:string;image?:string;imageJob?:string;video?:string;videoJob?:string;audio?:string;status?:string};
export type ReadyScene = {video:VideoAsset;image:VideoAsset;audio?:VideoAsset;question:string};
type Plan = {title:string;learningAim:string;scenes:PlannedScene[]};
type Draft = {brief:string;audience:string;level:string;length:number;style:string;references:string[];plan:Plan|null;job:string;assembled:boolean};
const blank = ():Draft => ({brief:'',audience:'Young learners',level:'A1',length:30,style:'3d-cartoon',references:[],plan:null,job:'',assembled:false});
const asset = async (id:string) => {const s=await getDoc(doc(db,'videoAssets',id));if(!s.exists()||!s.data().ready)throw Error('A scene is still being saved. Continue again shortly.');return {...s.data(),id:s.id} as VideoAsset;};
export function VideoBrief({uid,ownerName,assets,enabled,plannerEnabled,onError,onAssemble}:{uid:string;ownerName:string;assets:VideoAsset[];enabled:boolean;plannerEnabled:boolean;onError:(s:string)=>void;onAssemble:(scenes:ReadyScene[],title:string)=>void}) {
  const key=`ll.videoBrief.${uid}`;
  const [draft,setDraft]=useState<Draft>(()=>{try{const d=JSON.parse(localStorage.getItem(key)||'null');return d&&typeof d.brief==='string'&&Array.isArray(d.references)&&(!d.plan||Array.isArray(d.plan.scenes))?{...blank(),...d}:blank();}catch{return blank();}});
  const current=useRef(draft),running=useRef(false),stop=useRef(false),alive=useRef(true);
  const [busy,setBusy]=useState(''), [editingBrief,setEditingBrief]=useState(false);
  const commit=(patch:Partial<Draft>)=>{current.current={...current.current,...patch};localStorage.setItem(key,JSON.stringify(current.current));if(alive.current)setDraft(current.current);};
  const changeScene=(i:number,patch:Partial<PlannedScene>)=>{const p=current.current.plan!;commit({assembled:false,plan:{...p,scenes:p.scenes.map((s,n)=>n===i?{...s,...patch}:s)}});};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true;};},[]);
  const plan = async (recover=false) => {
    if(running.current)return;running.current=true;setBusy('Drafting scenes and the complete script…');
    const id=recover?current.current.job:crypto.randomUUID();commit({job:id});
    try {
      const d=current.current;
      const r=await videoCall<{status:string;plan?:Plan;message?:string}>(recover?{action:'poll',jobId:id}:{action:'plan',requestId:id,brief:{brief:d.brief,audience:d.audience,level:d.level,length:d.length},visualStyle:d.style,references:d.references});
      if(r.plan){commit({plan:r.plan,job:'',assembled:false});setEditingBrief(false);}
      else if(r.status==='failed'){commit({job:''});throw Error(r.message||'The script could not be drafted. Your current script is kept.');}
      else onError('Your script is still being drafted. Use Recover script to check again.');
    }catch(e){onError((e as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}
  };
  const wait = async (id:string) => {
    while(!stop.current){const r=await videoCall<{status:string;assetId?:string;message?:string}>({action:'poll',jobId:id});if(r.assetId)return r.assetId;if(['failed','cancelled'].includes(r.status))throw Error(r.message||'A scene did not finish. Your completed media is kept.');await new Promise(r=>setTimeout(r,5000));}
    throw Error('Generation paused here. Submitted scenes continue in your library; Continue generation recovers them.');
  };
  const generate = async () => {
    if(running.current||!current.current.plan)return;running.current=true;stop.current=false;setBusy('Preparing your approved script…');
    try {
      const p=current.current.plan;
      if(p.scenes.some(s=>!s.prompt.trim()||s.script.trim().split(/\s+/).filter(Boolean).length>(s.duration===5?9:20)))throw Error('Keep narration to 9 words for 5 seconds or 20 words for 10 seconds. Edit the script before generating.');
      for(let i=0;i<p.scenes.length;i++) {
        if(stop.current)break;
        let s=current.current.plan!.scenes[i];
        if(s.status==='failed')changeScene(i,{videoJob:'',imageJob:s.image?'':undefined,status:''});
        s=current.current.plan!.scenes[i];
        if(!s.audio&&s.script.trim()) {
          setBusy(`Scene ${i+1}: recording the approved script…`);
          const take=await createSpeech({text:s.script,voice:'marin',accent:'British English',direction:'Narrate clearly and naturally for the selected learners. Read only the supplied words.'});
          const blob=await encodeMp3(take.samples,take.rate,'standard'), info=await mediaInfo(blob);
          const audio=await saveAsset(blob,{owner:uid,ownerName,name:`${s.title} · narration`,kind:'audio',duration:info.duration,description:s.script,voice:'marin',org:'',readers:[]});
          changeScene(i,{audio});
          if(info.duration>s.duration+.1)throw Error(`Scene ${i+1}'s narration is ${info.duration.toFixed(1)} seconds. Shorten its script or choose 10 seconds, then continue. The recording is kept.`);
        } else if(s.audio && (await asset(s.audio)).duration>s.duration+.1)throw Error(`Scene ${i+1}'s narration is longer than its video. Shorten its script or choose 10 seconds.`);
        if(stop.current)break;
        s=current.current.plan!.scenes[i];
        if(!s.image) {
          setBusy(`Scene ${i+1}: preparing the scene image…`);
          const id=s.imageJob||crypto.randomUUID();changeScene(i,{imageJob:id});
          const r=await videoCall<{assetId?:string}>({action:'scene',requestId:id,name:s.title,prompt:s.prompt,visualStyle:current.current.style,references:current.current.references});
          changeScene(i,{image:r.assetId||await wait(id)});
        }
        if(stop.current)break;
        s=current.current.plan!.scenes[i];
        if(!s.video) {
          setBusy(`Scene ${i+1}: creating video…`);
          const id=s.videoJob||crypto.randomUUID();changeScene(i,{videoJob:id,status:'working'});
          if(!s.videoJob)await videoCall({action:'generate',requestId:id,name:s.title,prompt:s.prompt,visualStyle:current.current.style,duration:s.duration,references:[s.image]});
          try{changeScene(i,{video:await wait(id),status:'complete'});}catch(e){if(!stop.current)changeScene(i,{status:'failed'});throw e;}
        }
      }
      const result=current.current.plan!;
      if(!stop.current && result.scenes.every(s=>s.video&&s.image)) {
        setBusy('Assembling scenes, narration and question cards…');
        const ready=await Promise.all(result.scenes.map(async s=>({video:await asset(s.video!),image:await asset(s.image!),audio:s.audio?await asset(s.audio):undefined,question:s.question})));
        onAssemble(ready,result.title);commit({assembled:true});
      }
    } catch(e){onError((e as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}
  };
  const update=(p:Partial<Draft>)=>commit(p);
  const total=draft.plan?.scenes.reduce((n,s)=>n+s.duration,0)||0;
  return <div className="vx-brief">
    <p className="vx-help">1 · Give a brief → 2 · Review the full script → 3 · Generate video</p>
    {!draft.plan || editingBrief ? <div className="vx-fields">
      <h3>1. Describe your classroom video</h3>
      <label>Your brief<textarea aria-label="Video brief" rows={5} maxLength={3000} value={draft.brief} disabled={!!busy} onChange={e=>update({brief:e.target.value})} placeholder="A short cartoon about two friends buying fruit. Practise ‘Can I have…?’ Include a moment for learners to answer." /></label>
      <label>Learners<select value={draft.audience} disabled={!!busy} onChange={e=>update({audience:e.target.value})}>{['Young learners','Teenagers','Adults'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>English level<select value={draft.level} disabled={!!busy} onChange={e=>update({level:e.target.value})}>{['Pre-A1','A1','A2','B1','B2','C1','C2'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Approximate length<select value={draft.length} disabled={!!busy} onChange={e=>update({length:Number(e.target.value)})}>{[20,30,40,60].map(x=><option key={x} value={x}>{x} seconds + question cards</option>)}</select></label>
      <label>Visual style<select value={draft.style} disabled={!!busy} onChange={e=>update({style:e.target.value})}>{VIDEO_STYLES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <fieldset disabled={!!busy}><legend>Reuse saved characters (optional)</legend>{assets.filter(a=>a.kind==='character').map(a=><label className="vx-ref" key={a.id}><input type="checkbox" checked={draft.references.includes(a.id)} onChange={e=>update({references:e.target.checked?[...draft.references,a.id].slice(0,12):draft.references.filter(id=>id!==a.id)})}/>{a.name}</label>)}</fieldset>
      <VideoButton icon="videoSparkles" disabled={!plannerEnabled||!!busy||!draft.brief.trim()||!!draft.job} onClick={()=>void plan()}>{draft.plan ? "Suggest a new script" : "Suggest scenes and script"}</VideoButton>
      {draft.plan&&<VideoButton disabled={!!busy} onClick={()=>setEditingBrief(false)}>Return to current script</VideoButton>}
      {!plannerEnabled&&<p className="vx-help">Script planning needs its server connection.</p>}
    </div> : <div className="vx-fields">
      <h3>2. Review every scene and spoken word</h3>
      <p className="vx-help">This is the full script. Edit it before generation. Question cards are silent; suggested answers and teacher notes stay here.</p>
      <label>Video title<input value={draft.plan.title} maxLength={100} disabled={!!busy} onChange={e=>update({plan:{...draft.plan!,title:e.target.value}})}/></label>
      <label>Learning aim<textarea value={draft.plan.learningAim} maxLength={500} disabled={!!busy} onChange={e=>update({plan:{...draft.plan!,learningAim:e.target.value}})}/></label>
      {draft.plan.scenes.map((s,i)=><section className="vx-scene" key={i}>
        <h4>Scene {i+1} · {s.title}</h4>
        <fieldset disabled={!!busy}>
          <label>Visual action<textarea aria-label={`Scene ${i+1} visual action`} value={s.prompt} rows={3} maxLength={2500} onChange={e=>changeScene(i,{prompt:e.target.value,image:'',imageJob:'',video:'',videoJob:'',status:''})}/></label>
          <label>Full spoken script<textarea aria-label={`Scene ${i+1} full spoken script`} value={s.script} rows={3} maxLength={1000} onChange={e=>changeScene(i,{script:e.target.value,audio:''})}/></label>
          <label>Scene length<select value={s.duration} onChange={e=>changeScene(i,{duration:Number(e.target.value),video:'',videoJob:'',status:''})}><option value={5}>5 seconds · up to 9 words</option><option value={10}>10 seconds · up to 20 words</option></select></label>
          <label>Pause-and-answer question (optional)<textarea value={s.question} maxLength={500} onChange={e=>changeScene(i,{question:e.target.value})}/></label>
          <label>Suggested answer · teacher only<textarea value={s.answer} maxLength={500} onChange={e=>changeScene(i,{answer:e.target.value})}/></label>
          <label>Interaction / teacher notes<textarea value={s.teacherNotes} maxLength={1000} onChange={e=>changeScene(i,{teacherNotes:e.target.value})}/></label>
          <div className="vx-actions"><VideoButton disabled={!i} onClick={()=>{const a=[...draft.plan!.scenes];[a[i-1],a[i]]=[a[i],a[i-1]];update({plan:{...draft.plan!,scenes:a},assembled:false});}}>Move scene earlier</VideoButton><VideoButton disabled={draft.plan!.scenes.length===1} onClick={()=>update({plan:{...draft.plan!,scenes:draft.plan!.scenes.filter((_,n)=>n!==i)},assembled:false})}>Remove scene</VideoButton></div>
        </fieldset>
        {s.video&&assets.find(a=>a.id===s.video)&&<AssetPreview asset={assets.find(a=>a.id===s.video)!}/>}
        {s.status&&<p role="status">{s.status==='complete'?'Scene ready':s.status==='working'?'Video submitted':'Scene needs another attempt'}</p>}
      </section>)}
      <h3>3. Create the approved video</h3>
      <p>{total} seconds of video · up to US${(total*.12).toFixed(2)} for video, plus scene images, script planning and narration. Saved scenes are reused when continuing.</p>
      <p className="vx-help">Scenes, narration and 3-second question cards will be placed in order on your timeline. Voice-over does not guarantee matching mouth movements.</p>
      <VideoButton icon="videoSparkles" disabled={!enabled||!!busy||draft.assembled} onClick={()=>void generate()}>{draft.assembled?'Added to your timeline':draft.plan.scenes.some(s=>s.videoJob||s.imageJob||s.audio)?'Continue generation':'Generate video from this script'}</VideoButton>
      {!enabled&&<p className="vx-help">Your script can be prepared now. Video generation needs the Runway connection.</p>}
      <VideoButton disabled={!!busy} onClick={()=>setEditingBrief(true)}>Back to brief</VideoButton>
    </div>}
    {!!draft.job&&<VideoButton disabled={!!busy} onClick={()=>void plan(true)}>Recover script</VideoButton>}
    {busy&&<p role="status">{busy}</p>}
    {busy&&!draft.job&&<VideoButton onClick={()=>{stop.current=true;}}>Pause generation after this step</VideoButton>}
  </div>;
}
