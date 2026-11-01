import { usageContext, chargeFeature } from './feature-usage.js';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { materialSource,checkRebuild,rebuildSchema,rebuildInstructions,RIGHTS_VERSION } from './material-contract.js';
import { activityInstructions,nativeTask } from './activities.js';
import { generate } from './provider.js';
import { reserveBudget,settleBudget,checkModel } from './budget.js';
import { dailyGlobalUsage } from './allowance.js';
import { encodeGenerationResult,readGenerationResult } from './storage.js';
import { canPlan } from './contract.js';
const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const bad=m=>{throw new HttpsError('invalid-argument',m);};
export async function rebuildMaterials(req,{db,uid,cls,apiKey,model}) {
  const d=req.data;if(!valid(d.requestId))bad('Choose an import request.');
  const job=db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
  if(d.action==='rebuildStatus'){
    const j=await job.get();if(!j.exists||j.get('classId')!==d.classId||j.get('action')!=='rebuild')bad('That import is not available.');
    return {status:j.get('status'),...(j.get('status')==='completed'?readGenerationResult(j.data()):{}),createdItemId:j.get('createdItemId')??'',taskId:j.get('taskId')??''};
  }
  if(d.action==='importCreate'){
    if(d.reviewed!==true)bad('Review the rebuilt materials and answer keys first.');
    let rebuilt;try{rebuilt=checkRebuild(d.rebuilt,d.scope);}catch(e){bad(e.message);}
    const targetId=d.scope==='task'?d.itemId:'import_'+createHash('sha256').update(uid+':'+d.requestId).digest('hex').slice(0,32);
    if(!valid(targetId))bad('Choose a destination.');
    const item=cls.ref.collection('items').doc(targetId),taskId='import_'+createHash('sha256').update(uid+':'+d.requestId).digest('hex').slice(0,24);
    await db.runTransaction(async tx=>{
      const [j,c,p,a,g,old,last]=await Promise.all([tx.get(job),tx.get(cls.ref),tx.get(db.doc(`users/${uid}`)),tx.get(db.doc(`accounts/${uid}`)),tx.get(db.doc(`aiPilot/${uid}`)),tx.get(item),tx.get(d.scope==='task'?item.collection('tasks').orderBy('order','desc').limit(1):cls.ref.collection('items').orderBy('order','desc').limit(1))]);
      if(!canPlan(uid,p.data(),a.data(),c.data())||g.get('enabled')!==true)throw new HttpsError('permission-denied','Your teaching access changed.');
      if(j.get('status')!=='completed'||j.get('classId')!==d.classId||j.get('action')!=='rebuild'||j.get('scope')!==d.scope)bad('Rebuild the materials before adding them.');
      if(j.get('createdItemId')){if(j.get('createdItemId')!==targetId)bad('This import was already added elsewhere.');return;}
      if(d.scope==='task'&&!old.exists)bad('That lesson no longer exists.');
      if(d.scope!=='task')tx.create(item,{type:j.get('creationType'),title:rebuilt.title,topicId:null,order:(last.docs[0]?.get('order')??-1)+1,hidden:true,locked:false,taskCount:rebuilt.tasks.length,createdAt:Timestamp.now(),...(j.get('creationType')==='exam'?{examReleased:false}:{})});
      rebuilt.tasks.forEach((task,i)=>{const native=nativeTask(task,i),ref=item.collection('tasks').doc(taskId+'_'+i);tx.create(ref,{kind:'task',title:task.title,instructions:task.instructions,content:native.content,layout:task.layout==='columns'?'two':'single',order:d.scope==='task'?(last.docs[0]?.get('order')??-1)+1+i:i,hidden:false,locked:false,afterCheck:j.get('creationType')==='exam'?'reveal':'retry',createdAt:Timestamp.now()});tx.create(ref.collection('private').doc('key'),native.key);tx.create(ref.collection('private').doc('notes'),{text:[`Imported from: ${j.get('sourceName')}`,native.notes,'Import review notes:',...rebuilt.warnings].join('\n\n'),updatedAt:Timestamp.now()});});
      if(d.scope==='task')tx.update(item,{taskCount:(old.get('taskCount')??0)+rebuilt.tasks.length});
      tx.update(job,{createdItemId:targetId,taskId:taskId+'_0',reviewedAt:Timestamp.now()});
    });return {createdItemId:targetId,taskId:taskId+'_0'};
  }
  let source;try{source=materialSource(d);checkModel(model);}catch(e){bad(e.message);}
  const {images,...input}=source;
  const fingerprint=createHash('sha256').update(JSON.stringify({classId:d.classId,source})).digest('hex');
  const usagePolicy=await usageContext(db,req.auth);
  const day=new Date().toISOString().slice(0,10),month=day.slice(0,7),quota=db.doc(`aiPrivate/${uid}/usage/${day}`),global=db.doc(`aiUsage/${day}`),budget=db.doc(`${usagePolicy.isAdmin ? 'aiAdminBudgets' : 'aiBudgets'}/${month}`),admin=usagePolicy.isAdmin;
  const existing=await db.runTransaction(async tx=>{const [j,q,g,b]=await Promise.all([tx.get(job),tx.get(quota),tx.get(global),tx.get(budget)]);if(j.exists){if(j.get('fingerprint')!==fingerprint)bad('Start a new import for changed materials.');if(j.get('status')==='completed')return readGenerationResult(j.data());throw new HttpsError('failed-precondition',j.get('status')==='running'?'This import is still running. Check its status shortly.':'The import did not finish. Start a new import.');}
    await chargeFeature(tx,db,usagePolicy,'materialImport');let reservation;try{reservation=reserveBudget(b.get('committedMicroUsd')??0,1,usagePolicy.isAdmin);}catch(e){throw new HttpsError('resource-exhausted',e.message);}
    tx.set(budget,{committedMicroUsd:reservation.balance,month},{merge:true});tx.set(quota,{calls:(q.get('calls')??0)+1});tx.set(global,dailyGlobalUsage(g.data(),1,admin),{merge:true});tx.create(job,{action:'rebuild',classId:d.classId,status:'running',fingerprint,scope:source.scope,creationType:source.creationType,sourceName:source.name,rightsVersion:RIGHTS_VERSION,rightsAcceptedAt:Timestamp.now(),reservedMicroUsd:reservation.reserved,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});return null;});
  if(existing)return existing;
  try{
    const r=await generate({apiKey,model,schema:rebuildSchema,name:'rebuild',input,sourceImages:images,instructions:activityInstructions+'\nREBUILDING OVERRIDE — the following source-preservation rules take precedence over general original-lesson/media-generation rules:\n'+rebuildInstructions});
    checkRebuild(r.value,source.scope);
    r.value.warnings=[...new Set([...source.extractionWarnings,...r.value.warnings])];
    checkRebuild(r.value,source.scope);
    const result={rebuilt:r.value};
    await db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);if(j.get('status')!=='running')throw Error('Import was already settled.');const settled=settleBudget(b.get('committedMicroUsd'),j.get('reservedMicroUsd'),[r.usage]);tx.update(budget,{committedMicroUsd:settled.balance});tx.update(job,{status:'completed',...encodeGenerationResult(result),costMicroUsd:settled.cost});});return result;
  }catch(e){await job.update({status:'failed'});throw new HttpsError('unavailable','We couldn’t rebuild those materials. Your original and existing work are unchanged. Try fewer pages or clearer text.');}
}
