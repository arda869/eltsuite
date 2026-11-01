import { usageContext, chargeFeature } from '../ai/feature-usage.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { validateActivity, selectFocus, roleplayInstructions, feedbackSchema, feedbackInstructions, validateTurns } from './contract.js';
import { generate } from '../ai/provider.js';
const key=defineSecret('OPENAI_API_KEY');
const valid = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
const options={region:'us-central1',secrets:[key],maxInstances:5,concurrency:20,timeoutSeconds:240,memory:'512MiB'};
async function context(req) {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated','Sign in with your own account.');
  const d=req.data ?? {}, uid=req.auth.uid;
  if (!valid(d.classId) || !valid(d.activityId)) throw new HttpsError('invalid-argument','Open a speaking task inside a class.');
  const db=getFirestore(), cls=db.doc(`classes/${d.classId}`);
  const [c,member,profile]=await Promise.all([cls.get(),cls.collection('members').doc(uid).get(),db.doc(`users/${uid}`).get()]);
  const teacher=c.get('teacherId')===uid || c.get(`coTeachers.${uid}.role`)==='co';
  if (!c.exists || (!teacher && !member.exists)) throw new HttpsError('permission-denied','This speaking task belongs to another class.');
  const account=await db.doc(`accounts/${c.get('teacherId')}`).get();
  if (account.get('suspended')===true || account.get('over')===true) throw new HttpsError('permission-denied','This class cannot start AI speaking tasks right now.');
  return {db,uid,d,teacher,owner:c.get('teacherId'),name:profile.get('displayName') || 'Learner', activity:cls.collection('speakingActivities').doc(d.activityId)};
}
async function hangup(callId) {
  if (!callId) return;
  const r=await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`,{method:'POST',headers:{Authorization:`Bearer ${key.value()}`},signal:AbortSignal.timeout(15000)});
  if (!r.ok && r.status!==404 && r.status!==409) throw Error('Could not close the voice session.');
}
export const speakingTask = onCall(options,async req=>{
  const c=await context(req), {db,uid,d,teacher,activity}=c;
  if (d.action==='configure') {
    if (!teacher) throw new HttpsError('permission-denied','Only the class teacher can set up this task.');
    let config; try {config=validateActivity(d.config);} catch(e){throw new HttpsError('invalid-argument',e.message);}
    const batch=db.batch();
    if(config.feedbackMode==='lesson') {
      const lesson=db.doc(`classes/${d.classId}/items/${config.lessonId}`);
      if(!(await lesson.get()).exists)throw new HttpsError('not-found','This lesson no longer exists.');
      batch.update(lesson,{speakingFocus:config.focus});
    }
    batch.set(activity,{...config,enabled:d.enabled!==false,updatedAt:Date.now(),updatedBy:uid});await batch.commit();return {saved:true};
  }
  const snap=await activity.get();
  if (!snap.exists) throw new HttpsError('failed-precondition','Your teacher needs to save this speaking task first.');
  if (d.action==='start') {
    if (!snap.get('enabled')) throw new HttpsError('failed-precondition','Your teacher has paused this speaking task.');
    if (typeof d.sdp!=='string' || d.sdp.length>30000 || !d.sdp.startsWith('v=')) throw new HttpsError('invalid-argument','The microphone connection could not be prepared.');
    if(d.preview===true&&!teacher)throw new HttpsError('permission-denied','Only teachers can preview a speaking task.');
    const config=validateActivity(snap.data()), day=new Date().toISOString().slice(0,10);
    const lesson=config.lessonId?await db.doc(`classes/${d.classId}/items/${config.lessonId}`).get():null;
    if(!teacher&&lesson&&(!lesson.exists||lesson.get('hidden')===true||lesson.get('locked')===true))throw new HttpsError('permission-denied','This lesson is not available for speaking practice.');
    const lessonFocus=lesson?.get('speakingFocus');
    try{config.focus=selectFocus(config,d.focusChoice,lessonFocus);}catch(e){throw new HttpsError('failed-precondition',e.message);}
    const usagePolicy=await usageContext(db,req.auth);
    const limit=db.doc(`speakingAttempts/${day}/users/${uid}`);
    const session=activity.collection('sessions').doc();
    await db.runTransaction(async tx=>{const a=await tx.get(limit);await chargeFeature(tx,db,usagePolicy,'speakingPractice');tx.set(limit,{count:(a.get('count')??0)+1});});
    const form=new FormData();form.set('sdp',d.sdp);form.set('session',JSON.stringify({type:'realtime',model:'gpt-realtime-2.1-mini',instructions:roleplayInstructions(config),output_modalities:['audio'],max_output_tokens:250,audio:{input:{transcription:{model:'gpt-4o-mini-transcribe',language:'en'},turn_detection:{type:'semantic_vad',eagerness:'medium',create_response:true,interrupt_response:true}},output:{voice:'marin'}}}));
    const result=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${key.value()}`,'OpenAI-Safety-Identifier':createHash('sha256').update(uid).digest('hex')},body:form,signal:AbortSignal.timeout(30000)});
    if(!result.ok)throw new HttpsError('unavailable','The conversation could not connect. Please try again.');
    const sdp=await result.text(), callId=result.headers.get('location')?.split('/').pop();
    if(!callId)throw new HttpsError('unavailable','The voice service did not return a session identifier.');
    const startedAt=Date.now(), deadline=startedAt+config.seconds*1000;
    try {
      await session.set({uid,name:c.name,preview:d.preview===true,status:'connecting',startedAt,deadline,updatedAt:startedAt,config,turns:[],help:false});
      await db.doc(`speakingCalls/${session.id}`).set({callId,sessionPath:session.path,deadline:deadline+10000,status:'open'});
    } catch(e){await hangup(callId).catch(()=>{});throw e;}
    return {sdp,sessionId:session.id,deadline,seconds:config.seconds,focus:config.focus};
  }
  if(!valid(d.sessionId))throw new HttpsError('invalid-argument','Choose a speaking attempt.');
  const ref=activity.collection('sessions').doc(d.sessionId), session=await ref.get();
  if(!session.exists || (session.get('uid')!==uid && !teacher))throw new HttpsError('permission-denied','You cannot open this attempt.');
  if(d.action==='progress') {
    if(session.get('uid')!==uid)throw new HttpsError('permission-denied','Only the learner can update their conversation.');
    if(['complete','ended'].includes(session.get('status')))return {saved:false};
    let turns;try{turns=validateTurns(d.turns);}catch(e){throw new HttpsError('invalid-argument',e.message);}
    if(turns.length < (session.get('turns')?.length??0))return {saved:false};
    await ref.update({turns,status:['listening','speaking','wrapping-up','disconnected'].includes(d.status)?d.status:'listening',help:d.help===true,updatedAt:Date.now()});return {saved:true};
  }
  if(d.action==='finish') {
    const callRef=db.doc(`speakingCalls/${d.sessionId}`),call=await callRef.get();
    // Leave the watchdog armed if a transient failure prevents closing the call.
    try{await hangup(call.get('callId'));if(call.exists)await callRef.update({status:'closed'});}catch{}
    if(session.get('feedback'))return {feedback:session.get('feedback')};
    let turns=session.get('turns')??[];
    if(session.get('uid')===uid && d.turns)try{turns=validateTurns(d.turns);}catch(e){throw new HttpsError('invalid-argument',e.message);}
    const usagePolicy=await usageContext(db,req.auth);
    const reserved=await db.runTransaction(async tx=>{const s=await tx.get(ref);if((s.get('feedbackState')==='pending'&&Date.now()-(s.get('feedbackStartedAt')??0)<240000)||s.get('feedback'))return false;await chargeFeature(tx,db,usagePolicy,'speakingFeedback');tx.update(ref,{status:'ended',endedAt:Date.now(),turns,feedbackState:'pending',feedbackStartedAt:Date.now(),updatedAt:Date.now()});return true;});
    if(!reserved)return {pending:true};
    try {
      const {value}=await generate({apiKey:key.value(),model:'gpt-6.1-sol',schema:feedbackSchema,name:'speaking_feedback',instructions:feedbackInstructions,input:{lesson:session.get('config'),turns}});
      await ref.update({feedback:value,feedbackState:'complete',status:'complete',updatedAt:Date.now()});return {feedback:value};
    } catch {await ref.update({feedbackState:'error'});throw new HttpsError('unavailable','Your conversation is saved. Feedback is temporarily unavailable; try again.');}
  }
  throw new HttpsError('invalid-argument','Unknown speaking action.');
});
// Enforce the deadline independently of a phone tab, including backgrounded/offline clients.
export const closeSpeakingAtDeadline = onDocumentCreated({document:'speakingCalls/{id}',region:'us-central1',secrets:[key],maxInstances:5,concurrency:80,timeoutSeconds:360,memory:'256MiB',retry:true},async event=>{
  const data=event.data?.data();if(!data)return;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Math.min(320000,data.deadline-Date.now()))));
  const fresh=await event.data.ref.get();if(fresh.get('status')==='closed')return;
  await hangup(data.callId);
  await event.data.ref.update({status:'closed'});
  const session=getFirestore().doc(data.sessionPath),s=await session.get();
  if(!['complete','ended'].includes(s.get('status')))await session.update({status:'ended',endedAt:Date.now(),updatedAt:Date.now()});
});
