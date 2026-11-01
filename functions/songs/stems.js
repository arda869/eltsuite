import { onCall,HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { authorizeTeacher } from '../speech/access.js';
import { separateSong } from './separate.js';
export const PART_SIZE=450*1024;
export async function readSongParts(ref,count){
 if(!Number.isInteger(count)||count<1||count>27)throw new HttpsError('unavailable','The stored audio is incomplete. Your original song is kept.');
 const parts=await Promise.all(Array.from({length:count},(_,i)=>ref.doc(String(i)).get()));
 if(parts.some(p=>!p.exists||!Buffer.isBuffer(p.get('bytes'))))throw new HttpsError('unavailable','The stored audio is incomplete. Your original song is kept.');
 return Buffer.concat(parts.map(p=>p.get('bytes')));
}
export async function prepareStems(db,uid,id,separate=separateSong){
 const ref=db.doc(`songPrivate/${uid}/jobs/${id}`),lease=randomUUID();
 const reserved=await db.runTransaction(async tx=>{
  const d=(await tx.get(ref)).data();
  if(!d||d.expiresAt<Date.now())throw new HttpsError('not-found','This temporary song has expired. Saved recordings are unaffected.');
  if(d.kind!=='song'||d.status!=='complete')throw new HttpsError('failed-precondition','Finish creating your song before preparing sing-along tracks.');
  if(d.stems?.status==='complete'||d.stems?.status==='working'&&d.stems.busyUntil>Date.now())return null;
  tx.update(ref,{stems:{status:'working',progress:0,lease,busyUntil:Date.now()+1830000}});return d;
 });
 if(!reserved)return {status:(await ref.get()).get('stems.status')};
 try{
  const audio=await readSongParts(ref.collection('parts'),reserved.parts);
  const result=await separate(audio,async progress=>{await ref.update({'stems.progress':Math.min(.95,progress*.95)});});
  const counts={};
  for(const stem of ['vocals','instrumental']){
   const bytes=result[stem];if(!Buffer.isBuffer(bytes)||bytes.length<1000||bytes.length>12*1024*1024)throw Error('Incomplete stem');
   counts[stem]=Math.ceil(bytes.length/PART_SIZE);
   await Promise.all(Array.from({length:counts[stem]},(_,i)=>ref.collection(stem).doc(String(i)).set({bytes:bytes.subarray(i*PART_SIZE,(i+1)*PART_SIZE)})));
  }
  await ref.update({stems:{status:'complete',progress:1,parts:counts,mime:result.mime,duration:result.duration}});return {status:'complete'};
 }catch(e){
  const error='Sing-along tracks could not be prepared. Your original song is ready to use; retry without creating it again.';
  await ref.update({stems:{status:'failed',error,progress:0}});throw new HttpsError('unavailable',error);
 }
}
// One logical song allowance covers its vocal/backing preparation and recovery, too.
// A long HTTP worker keeps generation independent; the UI polls the saved job progress.
export const recordingSongStems=onCall({region:'us-central1',memory:'8GiB',cpu:2,concurrency:1,maxInstances:2,timeoutSeconds:1800},async req=>{
 const uid=await authorizeTeacher(req),id=req.data?.id;
 if(typeof id!=='string'||!/^song-[\w-]{8,100}$/.test(id))throw new HttpsError('invalid-argument','Choose a generated song.');
 return prepareStems(getFirestore(),uid,id);
});
