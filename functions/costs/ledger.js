import {getFirestore} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {HttpsError} from 'firebase-functions/v2/https';
import {costContext} from './context.js';
import {AI_FEATURES} from '../ai/features.js';
import {calculateCost} from './pricing.js';
const validId=v=>typeof v==='string'&&/^[\w-]{1,128}$/.test(v);
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function resolveOwner(db,uid,classId) {
 if(!validId(uid))throw Error('Missing cost actor');
 const p=await db.doc(`users/${uid}`).get();
 if(!validId(classId)&&validId(p.get('classId')))classId=p.get('classId');
 if(validId(classId)) {
  const [c,m]=await Promise.all([db.doc(`classes/${classId}`).get(),db.doc(`classes/${classId}/members/${uid}`).get()]);
  if(c.exists&&(c.get('teacherId')===uid||c.get(`coTeachers.${uid}.role`)==='co'||m.exists))return {teacherUid:c.get('teacherId'),classId,attribution:'class_owner'};
 }
 if(p.get('role')==='learner'||p.get('role')==='student')return {teacherUid:null,classId:null,attribution:'unresolved_learner'};
 return {teacherUid:uid,classId:null,attribution:'actor_account'};
}
export async function beginAttempt({provider,model,ceilingMicroUsd=5000000}) {
 const c=costContext.getStore();
 // Pure provider unit tests run without a request context. Production entrypoints all supply one.
 if(!c){if(process.env.K_SERVICE)throw new HttpsError('internal','AI cost context is missing.');return null;}
 if(!AI_FEATURES.some(f=>f.id===c.feature))throw new HttpsError('internal','AI cost tracking could not identify this feature. Your work is kept.');
 const db=c.db??getFirestore(),owner=await resolveOwner(db,c.uid,c.classId),day=new Date().toISOString().slice(0,10),now=Date.now();
 const generationId=hash(c.operationId+':'+c.feature),id=randomUUID(),ref=db.doc('aiCostAttempts/'+id),gen=db.doc('aiCostGenerations/'+generationId);
 const guardPaths=['aiCostGuards/global_'+day,'aiCostGuards/'+hash(owner.teacherUid??c.uid)+'_'+day];
 await db.runTransaction(async tx=>{
  const [g,settings,...guards]=await Promise.all([tx.get(gen),tx.get(db.doc('aiCostSettings/control')),...guardPaths.map(p=>tx.get(db.doc(p)))]);
  const limits=[settings.get('dailyGlobalMicroUsd')??1000000000,settings.get('dailyTeacherMicroUsd')??250000000];
  if(settings.get('paused')===true||guards.some((s,i)=>(s.get('committedMicroUsd')??0)+ceilingMicroUsd>limits[i]))throw new HttpsError('resource-exhausted','The AI service spending safeguard has been reached. Your work is kept; ask a super admin to review AI Cost Intelligence.');
  for(const [i,p] of guardPaths.entries())tx.set(db.doc(p),{committedMicroUsd:(guards[i].get('committedMicroUsd')??0)+ceilingMicroUsd,day},{merge:true});
  if(!g.exists)tx.create(gen,{actorUid:c.uid,...owner,feature:c.feature,startedAt:now,day,status:'pending',operationId:c.operationId});
  if(g.exists)tx.update(gen,{status:'pending',updatedAt:now});
  tx.create(ref,{generationId,actorUid:c.uid,...owner,feature:c.feature,provider,model,startedAt:now,day,status:'pending',basis:'unknown',costMicroUsd:null,ceilingMicroUsd,guardPaths,usage:{},pricingVersion:null});
 });
 c.generations.add(generationId);
 return {id,db,ref,generationId,model};
}
export async function settleAttempt(attempt,{usage={},status='success',providerRequestId=null,basis='provider_usage',failureCode=null,incomplete=false,extraGuardMicroUsd=0}={}) {
 if(!attempt)return;
 const price=calculateCost(attempt.model,usage,basis),{db,ref}=attempt;
 if(incomplete)Object.assign(price,{costMicroUsd:null,basis:'unknown',reason:'Only partial provider usage was observed'});
 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);if(!s.exists||s.get('settledAt'))return;
  const guards=await Promise.all(s.get('guardPaths').map(p=>tx.get(db.doc(p))));
  const charge=price.costMicroUsd===null||extraGuardMicroUsd===null?s.get('ceilingMicroUsd'):price.costMicroUsd+extraGuardMicroUsd;
  for(const [i,p] of s.get('guardPaths').entries())tx.update(db.doc(p),{committedMicroUsd:Math.max(0,(guards[i].get('committedMicroUsd')??0)-s.get('ceilingMicroUsd')+charge)});
  tx.update(ref,{...price,usage,status,providerRequestId:typeof providerRequestId==='string'?providerRequestId.slice(0,180):null,failureCode,settledAt:Date.now()});
 });
}
export async function finishContext(c,status) {
 const db=c.db??getFirestore();
 await Promise.all([...c.generations].filter(id=>!c.deferred.has(id)).map(id=>db.doc('aiCostGenerations/'+id).set({status:c.failed?'failed':status,finishedAt:Date.now()},{merge:true})));
}
// Async provider polling updates the original record, never creates another charge.
export async function finishAsyncAttempt(db,id,status) {
 if(!validId(id))return;
 const ref=db.doc('aiCostAttempts/'+id);
 await db.runTransaction(async tx=>{
  const a=await tx.get(ref);if(!a.exists||a.get('status')!=='pending')return;
  tx.update(ref,{status,finishedAt:Date.now(),...(status==='failed'?{costMicroUsd:null,basis:'unknown',reason:'Provider failure or cancellation; refund not confirmed'}:{})});
  tx.update(db.doc('aiCostGenerations/'+a.get('generationId')),{status,finishedAt:Date.now()});
 });
}
