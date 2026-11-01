import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { authorizeTeacher } from '../speech/access.js';
import { generate } from '../ai/provider.js';
import { validateBrief, lyricSchema, lyricInstructions } from './contract.js';
import { generateSong, SongCreationError } from './provider.js';
const openai = defineSecret('OPENAI_API_KEY'), gemini = defineSecret('GEMINI_API_KEY');
const options = {region:'us-central1',maxInstances:2,concurrency:2,memory:'512MiB'};
async function reserve(uid, kind, jobId, brief) {
  const db=getFirestore(),day=new Date().toISOString().slice(0,10),ref=db.doc(`songPrivate/${uid}/jobs/${jobId}`);
  return db.runTransaction(async tx=>{
    const prior=await tx.get(ref);
    if(prior.exists) return {ref,created:false};
    const own=db.doc(`songUsage/${day}/teachers/${uid}`),all=db.doc(`songUsage/${day}`),lock=db.doc(`songPrivate/${uid}`);
    const [a,b,c]=await Promise.all([tx.get(own),tx.get(all),tx.get(lock)]);
    if(c.get('busyUntil')>Date.now())throw new HttpsError('resource-exhausted','A song or lyric draft is already being created. Recover it before starting another.');
    const limit=kind==='song'?3:10,globalLimit=kind==='song'?50:300;
    if((a.get(kind)??0)>=limit || (b.get(kind)??0)>=globalLimit)throw new HttpsError('resource-exhausted','Today’s song creation allowance has been used. Your recordings and lyrics are kept.');
    tx.set(own,{[kind]:(a.get(kind)??0)+1},{merge:true});tx.set(all,{[kind]:(b.get(kind)??0)+1},{merge:true});
    tx.set(lock,{jobId,busyUntil:Date.now()+540000});
    tx.set(ref,{kind,brief,status:'working',createdAt:Date.now(),expiresAt:Date.now()+86400000});
    return {ref,created:true};
  });
}
async function finish(uid, ref, patch) {
  const db=getFirestore(),lock=db.doc(`songPrivate/${uid}`);
  await db.runTransaction(async tx=>{const s=await tx.get(lock);tx.update(ref,patch);if(s.get('jobId')===ref.id)tx.set(lock,{busyUntil:0},{merge:true});});
}
export const recordingLyrics=onCall({...options,secrets:[openai],timeoutSeconds:240},async req=>{
  const uid=await authorizeTeacher(req);let brief;
  try{brief=validateBrief(req.data?.brief);}catch(e){throw new HttpsError('invalid-argument',e.message);}
  const id=req.data?.id;
  if(typeof id!=='string'||!/^lyrics-[\w-]{8,100}$/.test(id))throw new HttpsError('invalid-argument','Start a new lyric draft.');
  const job=await reserve(uid,'lyrics',id,brief);
  if(!job.created)return {id,status:(await job.ref.get()).get('status')};
  try{
    const {value}=await generate({apiKey:openai.value(),model:'gpt-6.1-sol',schema:lyricSchema,name:'song_lyrics',input:brief,instructions:lyricInstructions});
    await finish(uid,job.ref,{status:'complete',lyrics:value.lyrics});return {id,status:'complete',lyrics:value.lyrics};
  }catch{await finish(uid,job.ref,{status:'failed',error:'The lyrics could not be drafted. Your existing words are kept.'});throw new HttpsError('unavailable','The lyrics could not be drafted. Your existing words are kept.');}
});
export const recordingSong=onCall({...options,secrets:[gemini],timeoutSeconds:540},async req=>{
  const uid=await authorizeTeacher(req);let brief;
  try{brief=validateBrief(req.data?.brief,true);}catch(e){throw new HttpsError('invalid-argument',e.message);}
  if(req.data?.approved!==true)throw new HttpsError('failed-precondition','Review and approve the lyrics before creating a song.');
  const id=req.data?.id;
  if(typeof id!=='string'||!/^song-[\w-]{8,100}$/.test(id))throw new HttpsError('invalid-argument','Start a new song.');
  const job=await reserve(uid,'song',id,brief);
  if(!job.created)return {id,status:(await job.ref.get()).get('status')};
  try{
    const result=await generateSong(gemini.value(),brief),partSize=450*1024,parts=Math.ceil(result.bytes.length/partSize);
    // Match the app's existing audio storage architecture, under server-only job paths.
    await Promise.all(Array.from({length:parts},(_,i)=>job.ref.collection('parts').doc(String(i)).set({bytes:result.bytes.subarray(i*partSize,(i+1)*partSize)})));
    await finish(uid,job.ref,{status:'complete',parts,mime:result.mime,providerLyrics:result.providerLyrics});
    return {id,status:'complete'};
  }catch(e){const error=e instanceof SongCreationError?e.message:['TimeoutError','AbortError'].includes(e.name)?'The music service took too long. Your lyrics are kept.':'The song could not be completed. Your lyrics are kept.';await finish(uid,job.ref,{status:'failed',error});throw new HttpsError('unavailable',error);}
});
// Poll/recover separately: reading a result never starts another paid generation.
export const recordingSongResult=onCall({...options,timeoutSeconds:60},async req=>{
  const uid=await authorizeTeacher(req),id=req.data?.id;
  if(typeof id!=='string'||!/^(song|lyrics)-[\w-]{8,100}$/.test(id))throw new HttpsError('invalid-argument','Choose a song or lyric draft.');
  const ref=getFirestore().doc(`songPrivate/${uid}/jobs/${id}`),s=await ref.get(),d=s.data();
  if(!d || d.expiresAt<Date.now())throw new HttpsError('not-found','This temporary result has expired. Saved recordings are unaffected.');
  if(d.status==='working'&&Date.now()-d.createdAt>540000)return {status:'failed',error:'This attempt did not finish. Your words are kept; you can start a new attempt.'};
  if(d.status!=='complete')return {status:d.status,error:d.error??''};
  if(d.kind==='lyrics')return {status:'complete',lyrics:d.lyrics};
  if(!Number.isInteger(d.parts)||d.parts<1||d.parts>27)throw new HttpsError('unavailable','The stored song is incomplete. Your lyrics are kept.');
  const chunks=await Promise.all(Array.from({length:d.parts},(_,i)=>ref.collection('parts').doc(String(i)).get()));
  if(chunks.some(c=>!c.exists||!Buffer.isBuffer(c.get('bytes'))))throw new HttpsError('unavailable','The stored song is incomplete. Your lyrics are kept.');
  const bytes=Buffer.concat(chunks.map(c=>c.get('bytes')));
  return {status:'complete',audio:bytes.toString('base64'),mime:d.mime,providerLyrics:d.providerLyrics};
});
