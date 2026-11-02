import {createHash} from 'node:crypto';
import {HttpsError} from 'firebase-functions/v2/https';
export function preparedScript(lines,durations){
 let at=0;
 return (lines??[]).map((line,i)=>{const seconds=durations?.[i];const timed=Number.isFinite(seconds)&&seconds>=0;const row={t:timed?at:null,text:String(line.text??'').trim(),...(line.speaker?{who:String(line.speaker)}:{}),...(timed?{e:at+seconds}:{})};if(timed)at+=seconds+.25;return row;}).filter(line=>line.text);
}
// Called only after lessonAssistant checks the caller's teaching access to the class.
// Recover supplied words from the matching saved generation, never transcribe or regenerate audio.
export async function restorePreparedScript(db,uid,classId,mediaId){
 if(!/^ai_media_[a-f0-9]{32}$/.test(mediaId??''))throw new HttpsError('failed-precondition','This recording has no recoverable generated script. Add its script in Recordings.');
 const ref=db.doc(`classes/${classId}/media/${mediaId}`),m=await ref.get();
 if(!m.exists||m.get('kind')!=='audio'||m.get('aiGenerated')!==true)throw new HttpsError('not-found','This generated recording is not available in the class.');
 if(m.get('script')?.some(l=>l.text?.trim()))return {restored:true};
 let asset;
 // Historical manifests have no source pointer. Match their deterministic ID using only
 // this teacher's job IDs in this class; private job payloads are not loaded or returned.
 let cursor;
 for(let page=0;page<10&&!asset;page++){
  let q=db.collection(`aiPrivate/${uid}/jobs`).where('classId','==',classId).select('classId').limit(100);if(cursor)q=q.startAfter(cursor);
  const jobs=await q.get();
  for(const job of jobs.docs){for(let task=0;task<20&&!asset;task++)for(let index=0;index<2&&!asset;index++){
   const assetId=`t${task}_m${index}`;
   if('ai_media_'+createHash('sha256').update(uid+job.id+assetId).digest('hex').slice(0,32)!==mediaId)continue;
   const candidate=await job.ref.collection('media').doc(assetId).get();
   if(candidate.get('classId')===classId&&candidate.get('kind')==='audio'&&candidate.get('mediaId')===mediaId&&candidate.get('status')==='ready')asset=candidate;
  }}
  if(jobs.size<100)break;cursor=jobs.docs.at(-1);
 }
 if(!asset)throw new HttpsError('not-found','The original script could not be located automatically. Add a transcript in Recordings; your audio is unchanged.');
 const lines=asset.get('lines')??[],durations=[];
 for(let i=0;i<lines.length;i++){
  const take=await asset.ref.collection('takes').doc(String(i)).get();
  const parts=take.get('parts');if(!Number.isInteger(parts)||parts<1||parts>100){durations.length=0;break;}
  const chunks=await take.ref.collection('parts').get();
  if(chunks.size!==parts){durations.length=0;break;}
  durations.push(chunks.docs.reduce((n,p)=>n+Buffer.byteLength(p.get('data')??'','base64'),0)/48000);
 }
 const script=preparedScript(lines,durations.length===lines.length?durations:undefined);
 if(!script.length)throw new HttpsError('not-found','This recording has no saved script. Add a transcript in Recordings.');
 await db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists)throw new HttpsError('not-found','The recording was removed.');if(!current.get('script')?.some(l=>l.text?.trim()))tx.update(ref,{script});});
 return {restored:true};
}
