import { prepareCommonsImage } from './commons.js';
import { generate } from './provider.js';
import { PILOT_MODEL } from './budget.js';
import { getAuth } from 'firebase-admin/auth';
import { usageContext, chargeFeature } from './feature-usage.js';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { generateSpeech } from '../speech/provider.js';
import { canPlan } from './contract.js';
import { mediaReservation, sameWords, wav } from './media-contract.js';
const key=defineSecret('OPENAI_API_KEY');
const PART=450*1024;
export async function savePrepared(db,classId,mediaId,bytes,meta){
 const col=db.collection(`classes/${classId}/media`);
 if(meta.kind==='image'){
  if(bytes.length>600*1024)throw Error('Image exceeds storage size.');
  await col.doc(mediaId).set({data:'data:image/jpeg;base64,'+bytes.toString('base64'),type:'image/jpeg',size:bytes.length,public:false,aiGenerated:!meta.credit,...(meta.credit?{credit:meta.credit}: {})});
 }else{
  for(let i=0;i<Math.ceil(bytes.length/PART);i++)await col.doc(`${mediaId}_p${i}`).set({part:i,data:bytes.subarray(i*PART,(i+1)*PART).toString('base64'),size:Math.min(PART,bytes.length-i*PART),public:false});
  await col.doc(mediaId).set({kind:'audio',type:'audio/wav',parts:Math.ceil(bytes.length/PART),size:0,title:meta.title+' · AI-generated audio',duration:(bytes.length-44)/48000,script:[],public:false,aiGenerated:true});
 }
}
export const prepareLessonMedia=onDocumentWritten({document:'aiPrivate/{uid}/jobs/{jobId}/media/{assetId}',region:'us-central1',secrets:[key],timeoutSeconds:540,memory:'512MiB',maxInstances:3,concurrency:1,retry:false},async event=>{
 if(event.data?.after.get('status')!=='queued')return;
 const db=getFirestore(),ref=event.data.after.ref,{uid,jobId,assetId}=event.params;
 let asset;
 try{
  const user=await getAuth().getUser(uid);
  const usagePolicy=await usageContext(db,{uid,token:{email:user.email,email_verified:user.emailVerified}});
  asset=await db.runTransaction(async tx=>{
   const snapshot=await tx.get(ref);if(snapshot.get('status')!=='queued')return null;
   const a=snapshot.data(),month=new Date().toISOString().slice(0,7),budget=db.doc(`${usagePolicy.isAdmin ? 'aiAdminBudgets' : 'aiBudgets'}/${month}`);
   const [b,p,account,cls,pilot]=await Promise.all([tx.get(budget),tx.get(db.doc(`users/${uid}`)),tx.get(db.doc(`accounts/${uid}`)),tx.get(db.doc(`classes/${a.classId}`)),tx.get(db.doc(`aiPilot/${uid}`))]);
   if(!canPlan(uid,p.data(),account.data(),cls.data())||pilot.get('enabled')!==true)throw Error('Teaching access changed.');
   await chargeFeature(tx,db,usagePolicy,a.kind==='image'?'lessonImage':'lessonAudio');
   const reservation=mediaReservation(a,b.get('committedMicroUsd')??0,Date.now(),usagePolicy.isAdmin);
   tx.set(budget,{committedMicroUsd:reservation.balance,limitMicroUsd:20000000,month},{merge:true});
   tx.update(ref,{status:'running',startedAt:Timestamp.now(),reservedMicroUsd:reservation.amount});return a;
  });
  if(!asset)return;
  const mediaId='ai_media_'+createHash('sha256').update(uid+jobId+assetId).digest('hex').slice(0,32);
  let bytes;
  if(asset.kind==='image'){
   if(asset.source==='commons') {
   const photo=await prepareCommonsImage(asset,{generate,apiKey:key.value(),model:PILOT_MODEL});
   bytes=photo.bytes;asset.credit=photo.credit;asset.alt=photo.alt;
   await ref.update({credit:photo.credit,alt:photo.alt,visualReview:photo.review});
   } else {
    const response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',signal:AbortSignal.timeout(180000),headers:{Authorization:`Bearer ${key.value()}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-image-2.5-flare',prompt:'Create one original classroom learning image. No text, labels, logos or watermarks. '+asset.prompt,n:1,size:'1024x1024',quality:'low',output_format:'jpeg',output_compression:65})});
    if(!response.ok)throw Error('Image generation failed.');
    const result=await response.json();if(!result.data?.[0]?.b64_json)throw Error('Missing image.');
    bytes=Buffer.from(result.data[0].b64_json,'base64');
    if(bytes.length<100||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid image.');
   }
  }else{
   const speakers=[...new Set(asset.lines.map(x=>x.speaker))],voices=['marin','cedar','coral','ash'];
   const chunks=[];
   // A line is checkpointed before the next provider call, so a retry retains completed takes.
   for(const [i,line] of asset.lines.entries()){
    const take=ref.collection('takes').doc(String(i)),old=await take.get();let pcm;
    if(!old.exists){
     const result=await generateSpeech(key.value(),{text:line.text,voice:voices[speakers.indexOf(line.speaker)%voices.length],accent:'',direction:'Natural conversational English for a classroom listening recording. Read only the supplied words.'});
     if(!sameWords(line.text,result.transcript))throw Error('The recording did not match its script.');
     pcm=Buffer.from(result.pcm,'base64');
     // Store large PCM in bounded documents; avoid a Firestore size failure after a paid take.
     const parts=Math.ceil(pcm.length/PART);
     for(let k=0;k<parts;k++)await take.collection('parts').doc(String(k)).set({data:pcm.subarray(k*PART,(k+1)*PART).toString('base64')});
     await take.set({parts});
    }
    if(old.exists){const parts=await Promise.all(Array.from({length:old.get('parts')},(_,k)=>take.collection('parts').doc(String(k)).get()));pcm=Buffer.concat(parts.map(p=>Buffer.from(p.get('data'),'base64')));}
    chunks.push(pcm,Buffer.alloc(12000));await ref.update({completedLines:i+1});
   }
   bytes=wav(Buffer.concat(chunks));
  }
  await savePrepared(db,asset.classId,mediaId,bytes,asset);
  await ref.update({status:'ready',mediaId,completedAt:Timestamp.now(),error:''});
 }catch(error){
  await ref.update({status:'failed',error:error instanceof Error && error.code==='resource-exhausted'?error.message:String(error.message).includes('allowance')?'Monthly AI allowance reached.':String(error.message).includes('script')?'Audio did not match the script. Retry this recording.':'Media could not be prepared. Retry this asset.',failedAt:Timestamp.now()});
 }
});
