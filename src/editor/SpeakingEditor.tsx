import { NSelect } from '../components/Select';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useEditorClass } from './context';
import { Grip } from './nodes';
import { speakingCall } from '../speaking/api';
import { SpeakingActivity } from '../speaking/SpeakingActivity';
import type { SpeakingConfig } from '../speaking/types';
export default function SpeakingEditor({node,updateAttributes,deleteNode,editor,getPos}:NodeViewProps){
  const {classId,classmates,lessonId,taskContext,taskTitle}=useEditorClass();const a=node.attrs as SpeakingConfig;
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[monitor,setMonitor]=useState(false),[preview,setPreview]=useState(false);
  const [lessonFocus,setLessonFocus]=useState(''),[focusDirty,setFocusDirty]=useState(false);
  useEffect(()=>{if(!classId||classId.includes(':'))return;return onSnapshot(doc(db,'classes',classId),s=>{const level=s.data()?.level;if(a.contextSeeded&&['A1','A2','B1','B2','C1','C2'].includes(level)&&!a.lessonId)updateAttributes({level,lessonId:lessonId||''});});},[classId,lessonId]);
  useEffect(()=>{if((a.feedbackMode==='lesson'||a.contextSeeded)&&!focusDirty&&lessonFocus&&a.focus!==lessonFocus)updateAttributes({focus:lessonFocus,feedbackMode:'lesson'});},[a.feedbackMode,lessonFocus,focusDirty]);
  useEffect(()=>{if(!classId||!lessonId)return;return onSnapshot(doc(db,'classes',classId,'items',lessonId),s=>setLessonFocus(s.data()?.speakingFocus||''));},[classId,lessonId]);
  useEffect(()=>{if(a.contextSeeded&&!a.contextApplied)updateAttributes({contextApplied:true,scenario:[taskContext,a.scenario].filter(Boolean).join('\n\n').slice(0,1500),...(taskTitle?{title:taskTitle.slice(0,120)}:{})});},[a.contextSeeded,a.contextApplied,taskContext,taskTitle]);
  const change=(patch:Partial<SpeakingConfig>)=>{updateAttributes({...patch,contextSeeded:false});setMessage('Save these changes to update the learner task.');};
  const save=async(enabled=true)=>{setBusy(true);setMessage('');try{await speakingCall({action:'configure',classId,activityId:a.id,config:{...a,lessonId:lessonId||a.lessonId||''},enabled});setFocusDirty(false);setMessage(enabled?'AI conversation saved and ready for learners.':'New attempts paused.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  return <NodeViewWrapper className="block-node speaking-node" contentEditable={false}>
    <div className="mcq-tools"><Grip editor={editor} getPos={getPos}/><span className="block-label">AI conversation</span><button type="button" className="remove" onClick={deleteNode}>Remove</button></div>
    <section className="speak-setup"><div className="speak-heading"><span className="speak-kicker">A CONVERSATION FOR EVERY LEARNER</span><span className="speak-duration">AI partner</span></div><h3>Give them a reason to speak.</h3><p>The activity supplies the situation. Review the roles and lesson focus, then let everyone practise at once.</p>
      <label>Task title<input value={a.title} maxLength={120} onChange={e=>change({title:e.target.value})}/></label>
      <label>The situation<textarea aria-label="The situation" value={a.scenario} maxLength={1500} rows={3} onChange={e=>change({scenario:e.target.value})}/></label>
      <div className="speak-setup-grid"><label>Learner’s role<input value={a.learnerRole} maxLength={200} onChange={e=>change({learnerRole:e.target.value})}/></label><label>AI partner’s role<input value={a.partnerRole} maxLength={200} onChange={e=>change({partnerRole:e.target.value})}/></label></div>
      <label>Who chooses the feedback focus?<NSelect aria-label="Feedback focus source" value={a.feedbackMode||'task'} onChange={e=>change({feedbackMode:e.target.value as SpeakingConfig['feedbackMode'],lessonId:lessonId||'',...(e.target.value==='lesson'?{focus:lessonFocus}:{})})}><option value="lesson" disabled={!lessonId}>Use the lesson’s focus</option><option value="task">Set a focus for this activity</option><option value="learner">Let the learner choose</option></NSelect></label>
      {a.feedbackMode==='learner'?<div className="speak-focus-options"><p>Offer up to four development areas. Learners choose one before they start.</p>{(a.focusOptions||[]).map((option,i)=><div key={i}><label>Option {i+1}<input aria-label={'Feedback option '+(i+1)} value={option} maxLength={300} onChange={e=>change({focusOptions:(a.focusOptions||[]).map((s,j)=>j===i?e.target.value:s)})}/></label><button type="button" className="btn" aria-label={'Remove feedback option '+(i+1)} onClick={()=>change({focusOptions:a.focusOptions?.filter((_,j)=>j!==i)})}>Remove</button></div>)}<button type="button" className="btn" disabled={(a.focusOptions?.length||0)>=4} onClick={()=>change({focusOptions:[...(a.focusOptions||[]),'']})}>+ Feedback option</button></div>:<label>{a.feedbackMode==='lesson'?'Shared lesson focus':'Feedback priority for this activity'}<textarea aria-label={a.feedbackMode==='lesson'?'Shared lesson focus':'Feedback priority for this activity'} value={a.focus} maxLength={1000} rows={2} onChange={e=>{setFocusDirty(true);change({focus:e.target.value});}} placeholder="e.g. Ask for clarification and check you understood: Could you explain…? So you mean…?"/>{a.feedbackMode==='lesson'&&<small>Saving updates the shared focus for speaking activities in this lesson.</small>}</label>}
      <div className="speak-setup-grid"><label>English level<NSelect aria-label="Speaking level" value={a.level} onChange={e=>change({level:e.target.value})}>{['A1','A2','B1','B2','C1','C2'].map(l=><option key={l}>{l}</option>)}</NSelect></label><label>Speaking time<NSelect aria-label="Speaking duration" value={a.seconds} onChange={e=>change({seconds:Number(e.target.value)})}>{[60,120,180,240,300].map(n=><option key={n} value={n}>{n/60} {n===60?'minute':'minutes'}</option>)}</NSelect></label></div>
      <p className="speak-note">The partner begins wrapping up before time runs out, with up to 10 seconds to finish naturally. Feedback prioritises this lesson’s focus.</p>
      <div className="speak-controls"><button type="button" className="speak-start" disabled={busy||!classId||classId.includes(':')} onClick={()=>void save()}>Save AI conversation</button><button type="button" className="btn" disabled={busy||!classId||classId.includes(':')} onClick={()=>void save(false)}>Pause new attempts</button><button type="button" className="btn" onClick={()=>setPreview(!preview)}>{preview?'Close preview':'Try task'}</button><button type="button" className="btn" onClick={()=>setMonitor(!monitor)}>{monitor?'Hide class view':'Monitor learners'}</button></div>
      {(!classId||classId.includes(':'))&&<p className="speak-note">Add this task to a class lesson to enable speaking practice.</p>}{message&&<p role="status" className="speak-note">{message}</p>}
    </section>
    {preview&&classId&&<SpeakingActivity config={a} classId={classId} preview/>}
    {monitor&&classId&&<SpeakingActivity config={a} classId={classId} teacher classmates={classmates}/>}
  </NodeViewWrapper>;
}
