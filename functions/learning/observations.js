import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {observedRevision} from './evidence.js';
export async function recordObservation(db,event) {
 const after=event.data?.after,before=event.data?.before;
 if(!after?.exists)return;
 const a=after.data(),b=before?.exists?before.data():{};
 if(!a.learnerUid||!a.taskId||!a.itemId)return;
 const delta=observedRevision(b,a);
 if(!delta.changedIds.length&&!delta.submitted&&!delta.resubmitted.length)return;
 const cls=db.collection('classes').doc(event.params.classId);
 const ref=cls.collection('learningEvidence').doc(event.params.answerId);
 const eventId=createHash('sha256').update(event.id).digest('hex');
 const receipt=ref.collection('events').doc(eventId);
 const at=after.updateTime??Timestamp.now();
 await db.runTransaction(async tx=>{
  const [seen,current]=await Promise.all([tx.get(receipt),tx.get(ref)]);if(seen.exists)return;
  const old=current.data()??{},questions={...(old.questions??{})};
  for(const id of new Set([...delta.changedIds,...delta.resubmitted])){
   const q=questions[id]??{savedRevisions:0,resubmissions:0};
   questions[id]={...q,savedRevisions:q.savedRevisions+(delta.revisionIds.includes(id)?1:0),resubmissions:q.resubmissions+(delta.resubmitted.includes(id)?1:0)};
  }
  tx.set(ref,{learnerUid:a.learnerUid,learnerId:a.learnerId??'',itemId:a.itemId,taskId:a.taskId,questions,submissions:(old.submissions??0)+(delta.submitted?1:0),observedSince:old.observedSince??at,updatedAt:Timestamp.now(),version:1});
  tx.create(receipt,{at,expiresAt:Timestamp.fromMillis(Date.now()+30*86400000)});
 });
}
export const observeLearnerResponses=onDocumentWritten({document:'classes/{classId}/answers/{answerId}',region:'us-central1',maxInstances:4,retry:true},event=>recordObservation(getFirestore(),event));
