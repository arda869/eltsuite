import WebSocket from 'ws';
import {createHash} from 'node:crypto';
import {normaliseUsage} from './pricing.js';
import {settleAttempt} from './ledger.js';
// Runs inside the existing deadline watchdog, not a detached background promise.
// Client-reported tokens and transcripts are never used for billing.
export async function monitorSpeakingCosts({db,ref,data,key,hangup,Socket=WebSocket}) {
 const attemptRef=db.doc('aiCostAttempts/'+data.costAttemptId),snapshot=await attemptRef.get();
 if(snapshot.get('settledAt'))return;
 const attempt={db,ref:attemptRef,id:attemptRef.id,generationId:snapshot.get('generationId'),model:snapshot.get('model')};
 const socket=new Socket('wss://api.openai.com/v1/realtime?call_id='+encodeURIComponent(data.callId),{headers:{Authorization:'Bearer '+key}});
 let queue=Promise.resolve(),broken=false,opened=false,done=false,timer;
 await new Promise(resolve=>{
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);socket.close();resolve();};
  timer=setTimeout(async()=>{try{await hangup(data.callId);await ref.update({status:'closed'});}catch{broken=true;}setTimeout(finish,1500);},Math.max(1,Math.min(320000,data.deadline-Date.now())));
  socket.on('open',()=>{opened=true;queue=queue.then(()=>ref.update({costMonitorReady:true})).catch(()=>{broken=true;});});
  socket.on('message',raw=>{
   let e;try{e=JSON.parse(raw.toString());}catch{broken=true;return;}
   if(e.type==='response.done'){
    const r=e.response,id=r?.id;if(!id){broken=true;return;}
    const usage=normaliseUsage('gpt-realtime-2.1-mini',r);
    if(!Object.keys(usage).length)broken=true;
    const eventRef=attemptRef.collection('events').doc(createHash('sha256').update(id).digest('hex'));
    queue=queue.then(()=>db.runTransaction(async tx=>{if(!(await tx.get(eventRef)).exists)tx.create(eventRef,{usage,providerRequestId:id});})).catch(()=>{broken=true;});
   }
   // Transcription is billed separately. Preserve reported usage, without storing speech.
   if(e.type==='conversation.item.input_audio_transcription.completed'){
    const id=e.item_id;if(!id){broken=true;return;}
    const u=normaliseUsage('gpt-4o-mini-transcribe',{usage:e.usage});
    const eventRef=attemptRef.collection('transcription').doc(createHash('sha256').update(id+':'+e.content_index).digest('hex'));
    queue=queue.then(()=>db.runTransaction(async tx=>{if(!(await tx.get(eventRef)).exists)tx.create(eventRef,{usage:u});})).catch(()=>{broken=true;});
   }
  });
  socket.on('error',()=>{broken=true;finish();});
  socket.on('close',()=>finish());
 });
 await queue;
 const call=await ref.get();
 if(!opened||call.get('status')!=='closed')broken=true;
 const events=await attemptRef.collection('events').get(),usage={};
 for(const e of events.docs)for(const [k,v] of Object.entries(e.get('usage')??{}))usage[k]=(usage[k]??0)+v;

 // A separate cost record for the transcription model shares this generation.
 let extraGuardMicroUsd=0;
 const ts=await attemptRef.collection('transcription').get();
 if(ts.size){
  const {calculateCost}=await import('./pricing.js');let missing=false;const total={};
  for(const t of ts.docs){const u=t.get('usage');if(!Object.keys(u).length)missing=true;for(const [k,v] of Object.entries(u))total[k]=(total[k]??0)+v;}
  const price=calculateCost('gpt-4o-mini-transcribe',missing||broken?{}:total);extraGuardMicroUsd=price.costMicroUsd;
  await db.doc('aiCostAttempts/'+attempt.id+'_transcription').set({...snapshot.data(),model:'gpt-4o-mini-transcribe',...price,usage:total,status:broken?'failed':'success',settledAt:Date.now(),guardPaths:[],ceilingMicroUsd:0});
 }
 await settleAttempt(attempt,{usage,incomplete:broken,extraGuardMicroUsd,status:broken?'failed':'success',providerRequestId:data.callId,failureCode:broken?'incomplete_server_observation':null});
 await db.doc('aiCostGenerations/'+attempt.generationId).set({status:broken?'failed':'success',finishedAt:Date.now()},{merge:true});
}
