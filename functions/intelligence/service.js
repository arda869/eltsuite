import {intelligencePatch} from './patch.js';
import {HttpsError} from 'firebase-functions/v2/https';
import {Timestamp} from 'firebase-admin/firestore';
import {intelligenceContext,digest} from './context.js';
import {actions,intelligenceSchema,intelligenceInstructions,checkAdvice,generatorBrief} from './contract.js';
import {generate} from '../ai/provider.js';
import {generateChecked} from '../ai/recovery.js';
import {reserveBudget,settleBudget,checkModel} from '../ai/budget.js';
import {usageContext,chargeFeature} from '../ai/feature-usage.js';
const id=v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v);
const fail=m=>{throw new HttpsError('failed-precondition',m);};
const message=e=>({rate_limit:'The AI service is busy. Wait a moment and try again. Your lesson is unchanged.',billing:'AI advice is unavailable because the API account has no credit. Your saved work is unchanged.',timeout:'The review took too long. Your saved work is unchanged; try a smaller scope.'}[e?.reason]??'We couldn’t finish this review. Your saved work is unchanged.');
export async function lessonIntelligence(req,{db,uid,cls,apiKey,model,generateImpl=generate}){
 const d=req.data;
 // Separate pilot gate permits rollback without disabling the established generator.
 const pilot=await db.doc('aiPilot/'+uid).get();if(pilot.get('lessonIntelligence')!==true)fail('Lesson Intelligence is not enabled for this pilot account. The original creation tools remain available.');
 for(const k of ['itemId','taskId'])if(d[k]&&!id(d[k]))fail('Choose an available lesson or activity.');
 if(['intelligenceProposeEdit','intelligenceApplyEdit','intelligenceUndoEdit'].includes(d.action))return intelligencePatch(req,{db,uid,cls,apiKey,model,generateImpl});
 const thread=db.doc(`aiPrivate/${uid}/intelligence/${cls.id}`);
 if(d.action==='intelligenceClear'){await thread.delete();return {cleared:true};}
 if(d.action==='intelligenceConfirmLesson'){
  if(!id(d.itemId)||typeof d.aims!=='string'||d.aims.length>2000||typeof d.note!=='string'||d.note.length>2000||!Array.isArray(d.coverage)||d.coverage.length>12||d.coverage.some(x=>typeof x.objective!=='string'||x.objective.length>300||!['introduced','practised','recycled','assessed'].includes(x.stage)))fail('Add the lesson aims and a short optional note.');
  if(!(await cls.ref.collection('items').doc(d.itemId).get()).exists)fail('This lesson is no longer available.');
  await cls.ref.collection('intelligenceLessons').doc(d.itemId).set({aims:d.aims,note:d.note,coverage:d.coverage.map(({objective,stage})=>({objective,stage})),completedAt:d.completed?Timestamp.now():null,confirmedBy:uid,updatedAt:Timestamp.now()});return {confirmed:true};
 }
 const context=await intelligenceContext(db,cls,{itemId:d.itemId??'',taskId:d.taskId??'',excluded:d.excluded??[]});
 if(d.action==='intelligenceContext'){const prior=(await thread.get()).data();return {context,conversation:prior?.turns??[],conversationVersion:prior?.sourceVersion??null};}
 if(d.action==='intelligenceBrief'){
  const prior=(await thread.get()).data(),turn=prior?.turns?.find(t=>t.id===d.turnId);if(!turn||!Number.isInteger(d.optionIndex)||!turn.response.options[d.optionIndex])fail('Choose a current recommendation.');
  if(turn.sourceVersion!==context.sourceVersion)fail('The class evidence changed. Refresh the recommendation before creating a lesson.');
  return {handoff:generatorBrief(turn.response.options[d.optionIndex],context)};
 }
 if(d.action!=='intelligenceAsk'||!actions.includes(d.mode)||!id(d.requestId))fail('Choose a Lesson Intelligence action.');
 if(['evaluateLesson','evaluateActivity','nextActivity'].includes(d.mode)&&!d.itemId)fail('Open a lesson first.');
 if(d.mode==='evaluateActivity'&&!d.taskId)fail('Select an activity first.');
 if(typeof d.question!=='string'||d.question.length>2000)fail('Keep your request within 2,000 characters.');
 if(!context.sources.length)fail('Include at least one source before asking for advice.');
 const job=db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`),existing=await job.get();
 const fingerprint=digest({mode:d.mode,classId:cls.id,itemId:d.itemId??'',taskId:d.taskId??'',question:d.question,sourceVersion:context.sourceVersion});
 if(existing.exists){if(existing.get('fingerprint')!==fingerprint)fail('Start a new request for changed context.');if(existing.get('status')==='completed')return existing.get('reply');if(existing.get('status')==='failed')return {error:existing.get('error')};fail('This request is still running. Check again shortly.');}
 const prior=(await thread.get()).data(),conversation=(prior?.turns??[]).filter(t=>t.sourceVersion===context.sourceVersion).slice(-4).map(t=>({question:t.question,summary:t.response.summary,scope:t.scope}));
 const input={mode:d.mode,question:d.question,context,conversation};
 if(Buffer.byteLength(JSON.stringify(input))>70000)fail('This lesson has more material than one review can read. Select an activity or exclude some older evidence.');
 checkModel(model);const policy=await usageContext(db,req.auth),month=new Date().toISOString().slice(0,7),budget=db.doc(`${policy.isAdmin?'aiAdminBudgets':'aiBudgets'}/${month}`);
 await db.runTransaction(async tx=>{const [j,b]=await Promise.all([tx.get(job),tx.get(budget)]);if(j.exists)fail('This request is already running.');const r=reserveBudget(b.get('committedMicroUsd')??0,1,policy.isAdmin);await chargeFeature(tx,db,policy,'coach');tx.set(budget,{committedMicroUsd:r.balance,month},{merge:true});tx.create(job,{action:'intelligence',fingerprint,classId:cls.id,status:'running',reserved:r.reserved,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});});
 let repairs=0;
 try{
  const result=await generateChecked({generate:generateImpl,args:{apiKey,model,schema:intelligenceSchema,name:'lesson_intelligence',input,instructions:intelligenceInstructions,timeoutMs:180000},decode:v=>v,check:v=>checkAdvice(v,context,d.mode),deadline:Date.now()+360000,reserveRepair:async()=>{repairs++;await db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);const r=reserveBudget(b.get('committedMicroUsd')??0,1,policy.isAdmin);tx.update(budget,{committedMicroUsd:r.balance});tx.update(job,{reserved:j.get('reserved')+r.reserved});});}});
  const turn={id:d.requestId,question:d.question,mode:d.mode,scope:context.scope,response:result.value,sourceVersion:context.sourceVersion,sources:context.sources.map(({data,...s})=>s),createdAt:Date.now()};
  const reply={turn,context};
  await db.runTransaction(async tx=>{const [b,j,t]=await Promise.all([tx.get(budget),tx.get(job),tx.get(thread)]);const settled=settleBudget(b.get('committedMicroUsd'),j.get('reserved'),result.usage);tx.update(budget,{committedMicroUsd:settled.balance});tx.update(job,{status:'completed',reply,completedAt:Timestamp.now()});tx.set(thread,{version:1,classId:cls.id,sourceVersion:context.sourceVersion,turns:[...(t.get('turns')??[]),turn].slice(-12),updatedAt:Timestamp.now()});});return reply;
 }catch(e){const error=message(e);if(!repairs&&['rate_limit','billing'].includes(e?.reason))await db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);if(!j.get('released')){tx.update(budget,{committedMicroUsd:b.get('committedMicroUsd')-j.get('reserved')});tx.update(job,{released:true});}});await job.update({status:'failed',error});return {error};}
}
