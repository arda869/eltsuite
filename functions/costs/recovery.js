import {onSchedule} from 'firebase-functions/v2/scheduler';
import {getFirestore} from 'firebase-admin/firestore';
// A crash after dispatch is not evidence of zero provider spend. Keep the reservation.
export async function expireCostAttempt(db,ref,now=Date.now()) {
 return db.runTransaction(async tx=>{
  const a=await tx.get(ref);if(!a.exists||a.get('status')!=='pending'||now-a.get('startedAt')<86400000)return false;
  const gen=db.doc('aiCostGenerations/'+a.get('generationId')),g=await tx.get(gen);
  tx.update(ref,{status:'failed',basis:'unknown',costMicroUsd:null,failureCode:'completion_not_observed',finishedAt:now});
  if(g.exists&&g.get('status')==='pending')tx.update(gen,{status:'failed',finishedAt:now});
  return true;
 });
}
export const recoverAiCosts=onSchedule({schedule:'every 60 minutes',region:'us-central1',maxInstances:1,timeoutSeconds:300},async()=>{
 const db=getFirestore();let cursor;
 for(let page=0;page<50;page++){
  let q=db.collection('aiCostAttempts').where('status','==','pending').limit(200);if(cursor)q=q.startAfter(cursor);
  const s=await q.get();if(!s.size)break;
  for(const d of s.docs)if(Date.now()-d.get('startedAt')>=86400000)await expireCostAttempt(db,d.ref);
  cursor=s.docs.at(-1);if(s.size<200)break;
 }
});
