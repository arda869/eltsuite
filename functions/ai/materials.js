import {pictureRecipe} from './import-picture-job.js';
import {importPicturePlans,resolveImportPictures,taskPictureIds} from './import-pictures.js';
import {senseCheckImport,importTaskHash} from './import-review.js';
import {meteredImportReview,readImportSource} from './import-review-job.js';
import {importModelSchema,fromImportModel} from './import-model.js';
import { usageContext, chargeFeature } from './feature-usage.js';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { materialSource,checkRebuild,nativeImportInstructions,RIGHTS_VERSION } from './material-contract.js';
import { nativeTask } from './activities.js';
import { importRequirements } from './import-elements.js';
import { generate } from './provider.js';
import { reserveBudget,settleBudget,checkModel } from './budget.js';
import { dailyGlobalUsage } from './allowance.js';
import { encodeGenerationResult,readGenerationResult } from './storage.js';
import { canPlan } from './contract.js';
const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const bad=m=>{const message=String(m).replace(/output\.tasks\[(\d+)\]/g,(_,i)=>'Task '+(Number(i)+1)).replace(/\.inlineElements\[(\d+)\]/g,(_,i)=>' · Inline task '+(Number(i)+1)).replace(/\.subTasks\[(\d+)\]/g,(_,i)=>' · Part '+(Number(i)+1)).replace(/\.data\./g,' · ').replace(/\[(\d+)\]/g,(_,i)=>' '+(Number(i)+1));throw new HttpsError('invalid-argument',message);};
export async function rebuildMaterials(req,{db,uid,cls,apiKey,model}) {
  const deadline=Date.now()+370000;
  const d=req.data;if(!valid(d.requestId))bad('Choose an import request.');
  const job=db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
  if(d.action==='rebuildStatus'){
    const j=await job.get();if(!j.exists||j.get('classId')!==d.classId||j.get('action')!=='rebuild')bad('That import is not available.');
    if(j.get('expiresAt')?.toMillis()<Date.now()&&!j.get('createdItemId'))throw new HttpsError('failed-precondition','This temporary import has expired. Start a new import from the original.');
    const original=j.get('createdItemId')?null:await readImportSource(job);
    return {sourcePreviews:original?.images??[],status:j.get('status'),...(j.get('status')==='completed'?readGenerationResult(j.data()):{}),createdItemId:j.get('createdItemId')??'',taskId:j.get('taskId')??''};
  }
  if(d.action==='importCreate'){
    if(d.reviewed!==true)bad('Review the rebuilt materials and answer keys first.');
    let rebuilt;try{rebuilt=checkRebuild(d.rebuilt,d.scope,{training:cls.get('kind')==='training'});}catch(e){bad(e.message);}
    const plans=importPicturePlans(rebuilt);if(plans.some(p=>p.asset&&pictureRecipe(p).id!==p.asset))bad('The illustration settings changed. Recreate it from the updated source crop before saving.');
    const before=await job.get();
    if(before.get('expiresAt')?.toMillis()<Date.now())throw new HttpsError('failed-precondition','This temporary import has expired. Start a new import from the original.');
    if(before.get('status')!=='completed'||before.get('classId')!==d.classId||before.get('scope')!==d.scope)bad('Rebuild the materials before adding them.');
    let trusted=readGenerationResult(before.data());
    const matches=result=>result?.checks?.length===rebuilt.tasks.length&&rebuilt.tasks.every(t=>result.checks.some(c=>c.stageId===t.stageId&&c.hash===importTaskHash(t)));
    if(!before.get('createdItemId')&&!matches(trusted)){
      const original=await readImportSource(job);
      if(!original)throw new HttpsError('failed-precondition','This older import has no source available for the new sense check. Start a new import from the original.');
      const lock=createHash('sha256').update(JSON.stringify(rebuilt)+Date.now()).digest('hex');
      await db.runTransaction(async tx=>{const j=await tx.get(job);if(j.get('createdItemId'))throw new HttpsError('failed-precondition','This import was already added. Check its saved destination.');if((j.get('reviewLockedUntil')??0)>Date.now())throw new HttpsError('failed-precondition','A source check is already running. Check the saved import shortly.');tx.update(job,{reviewLock:lock,reviewLockedUntil:Date.now()+390000});});
      try{
        const policy=await usageContext(db,req.auth),month=new Date().toISOString().slice(0,7),budget=db.doc((policy.isAdmin?'aiAdminBudgets/':'aiBudgets/')+month);
        trusted=await senseCheckImport({rebuilt,source:original,training:cls.get('kind')==='training',deadline,run:meteredImportReview({db,budget,job,isAdmin:policy.isAdmin,apiKey,model})});
        await db.runTransaction(async tx=>{const j=await tx.get(job);if(j.get('reviewLock')!==lock||j.get('createdItemId'))throw new HttpsError('aborted','The saved import changed. Check it again.');tx.update(job,{...encodeGenerationResult(trusted),reviewLockedUntil:0});});
        return {...trusted,needsReview:true};
      }catch(e){await job.update({reviewLockedUntil:0});throw e;}
    }
    const targetId=d.scope==='task'?d.itemId:'import_'+createHash('sha256').update(uid+':'+d.requestId).digest('hex').slice(0,32);
    if(!valid(targetId))bad('Choose a destination.');
    const pictureIds=[...new Set(plans.map(p=>p.asset).filter(Boolean))];
    const item=cls.ref.collection('items').doc(targetId),taskId='import_'+createHash('sha256').update(uid+':'+d.requestId).digest('hex').slice(0,24);
    await db.runTransaction(async tx=>{
      const [j,c,p,a,g,old,last]=await Promise.all([tx.get(job),tx.get(cls.ref),tx.get(db.doc(`users/${uid}`)),tx.get(db.doc(`accounts/${uid}`)),tx.get(db.doc(`aiPilot/${uid}`)),tx.get(item),tx.get(d.scope==='task'?item.collection('tasks').orderBy('order','desc').limit(1):cls.ref.collection('items').orderBy('order','desc').limit(1))]);
      const pictureDocs=await Promise.all(pictureIds.map(id=>tx.get(job.collection('pictures').doc(id))));
      const pictureData=Object.fromEntries(pictureDocs.map(pic=>{if(!pic.exists||pic.get('status')!=='ready'||typeof pic.get('jpeg')!=='string')bad('Recreate the source illustration before adding this import.');return [pic.id,pic.data()];}));
      const mediaByAsset=Object.fromEntries(pictureIds.map(id=>[id,'media:import_'+createHash('sha256').update(uid+':'+d.requestId+':'+id).digest('hex').slice(0,32)]));
      if(!canPlan(uid,p.data(),a.data(),c.data())||g.get('enabled')!==true)throw new HttpsError('permission-denied','Your teaching access changed.');
      if(j.get('status')!=='completed'||j.get('classId')!==d.classId||j.get('action')!=='rebuild'||j.get('scope')!==d.scope)bad('Rebuild the materials before adding them.');
      if(j.get('createdItemId')){if(j.get('createdItemId')!==targetId)bad('This import was already added elsewhere.');return;}
      if(!matches(readGenerationResult(j.data())))throw new HttpsError('failed-precondition','These edits need a fresh source check. Check the saved import and try again.');
      if(d.scope==='task'&&!old.exists)bad('That lesson no longer exists.');
      if(d.scope!=='task')tx.create(item,{type:j.get('creationType'),title:rebuilt.title,topicId:null,order:(last.docs[0]?.get('order')??-1)+1,hidden:true,locked:false,taskCount:rebuilt.tasks.length,createdAt:Timestamp.now(),...(j.get('creationType')==='exam'?{examReleased:false}:{})});
      for(const id of pictureIds){const mediaId=mediaByAsset[id].slice(6),jpeg=pictureData[id].jpeg;tx.create(cls.ref.collection('media').doc(mediaId),{data:jpeg,type:'image/jpeg',size:Buffer.from(jpeg.split(',')[1],'base64').length,public:false,aiGenerated:true});}
      rebuilt.tasks.forEach((task,i)=>{const native=nativeTask(task,i,taskId),ref=item.collection('tasks').doc(taskId+'_'+i);tx.create(ref,{kind:'task',title:task.title,instructions:task.instructions,content:resolveImportPictures(native.content,plans,mediaByAsset),layout:task.layout==='columns'?'two':'single',order:d.scope==='task'?(last.docs[0]?.get('order')??-1)+1+i:i,hidden:taskPictureIds(task,plans).some(id=>!pictureData[id]?.qualityPassed)||trusted.checks.find(c=>c.stageId===task.stageId)?.status==='needsReview'||[task,...task.subTasks].some(b=>importRequirements(b.inlineElements??[]).length>0),locked:false,afterCheck:j.get('creationType')==='exam'?'reveal':'retry',createdAt:Timestamp.now()});tx.create(ref.collection('private').doc('key'),native.key);tx.create(ref.collection('private').doc('notes'),{text:[`Imported from: ${j.get('sourceName')}`,native.notes,'Automatic source check: '+trusted.checks.find(c=>c.stageId===task.stageId)?.summary,...(trusted.checks.find(c=>c.stageId===task.stageId)?.issues??[]).map(issue=>issue.problem+' — '+issue.improvement),'Import review notes:',...rebuilt.warnings].join('\n\n'),updatedAt:Timestamp.now()});});
      if(d.scope==='task')tx.update(item,{taskCount:(old.get('taskCount')??0)+rebuilt.tasks.length});
      tx.update(job,{createdItemId:targetId,taskId:taskId+'_0',reviewedAt:Timestamp.now()});
    });return {createdItemId:targetId,taskId:taskId+'_0'};
  }
  let source;try{source=materialSource(d);checkModel(model);}catch(e){bad(e.message);}
  const {images,...sourceInput}=source;
  const input={...sourceInput,classKind:cls.get('kind')??'language'};
  const fingerprint=createHash('sha256').update(JSON.stringify({classId:d.classId,source})).digest('hex');
  const usagePolicy=await usageContext(db,req.auth);
  const day=new Date().toISOString().slice(0,10),month=day.slice(0,7),quota=db.doc(`aiPrivate/${uid}/usage/${day}`),global=db.doc(`aiUsage/${day}`),budget=db.doc(`${usagePolicy.isAdmin ? 'aiAdminBudgets' : 'aiBudgets'}/${month}`),admin=usagePolicy.isAdmin;
  const existing=await db.runTransaction(async tx=>{const [j,q,g,b]=await Promise.all([tx.get(job),tx.get(quota),tx.get(global),tx.get(budget)]);if(j.exists){if(j.get('fingerprint')!==fingerprint)bad('Start a new import for changed materials.');if(j.get('status')==='completed')return readGenerationResult(j.data());throw new HttpsError('failed-precondition',j.get('status')==='running'?'This import is still running. Check its status shortly.':'The import did not finish. Start a new import.');}
    await chargeFeature(tx,db,usagePolicy,'materialImport');let reservation;try{reservation=reserveBudget(b.get('committedMicroUsd')??0,1,usagePolicy.isAdmin);}catch(e){throw new HttpsError('resource-exhausted',e.message);}
    tx.set(budget,{committedMicroUsd:reservation.balance,month},{merge:true});tx.set(quota,{calls:(q.get('calls')??0)+1});tx.set(global,dailyGlobalUsage(g.data(),1,admin),{merge:true});tx.create(job,{action:'rebuild',classId:d.classId,status:'running',fingerprint,scope:source.scope,creationType:source.creationType,sourceName:source.name,rightsVersion:RIGHTS_VERSION,rightsAcceptedAt:Timestamp.now(),reservedMicroUsd:reservation.reserved,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});tx.create(job.collection('source').doc('original'),{sourceJson:JSON.stringify({...source,images:[]})});images.forEach((jpeg,i)=>tx.create(job.collection('sourceImages').doc(String(i)),{jpeg}));return null;});
  if(existing)return existing;
  try{
    const r=await generate({apiKey,model,schema:importModelSchema(cls.get('kind')==='training'),name:'rebuild',input,sourceImages:images,instructions:nativeImportInstructions});
    try{r.value=checkRebuild(fromImportModel(r.value),source.scope,{training:cls.get('kind')==='training'});}catch(validationError){
      const repaired=await meteredImportReview({db,budget,job,isAdmin:admin,apiKey,model})({name:'importRepair',schema:importModelSchema(cls.get('kind')==='training'),instructions:nativeImportInstructions+'\nRepair the structural task problem against the original. Keep all correct source questions and stage IDs. Do not invent missing evidence.',input:{...input,generated:r.value,validationIssue:validationError.message},sourceImages:images,timeoutMs:Math.min(70000,Math.max(1000,deadline-Date.now()-5000))});
      r.value=checkRebuild(fromImportModel(repaired.value),source.scope,{training:cls.get('kind')==='training'});
    }
    r.value.warnings=[...new Set([...source.extractionWarnings,...r.value.warnings])];
    r.value=checkRebuild(r.value,source.scope,{training:cls.get('kind')==='training'});
    const result=await senseCheckImport({rebuilt:r.value,source,training:cls.get('kind')==='training',deadline,run:meteredImportReview({db,budget,job,isAdmin:admin,apiKey,model})});
    await db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);if(j.get('status')!=='running')throw Error('Import was already settled.');const settled=settleBudget(b.get('committedMicroUsd'),j.get('reservedMicroUsd'),[r.usage]);tx.update(budget,{committedMicroUsd:settled.balance});tx.update(job,{status:'completed',...encodeGenerationResult(result),costMicroUsd:settled.cost});});return result;
  }catch(e){await job.update({status:'failed'});throw new HttpsError('unavailable','We couldn’t rebuild those materials. Your original and existing work are unchanged. Try fewer pages or clearer text.');}
}
