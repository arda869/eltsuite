// Temporary, read-only production diagnosis. Never print prompts, scripts, tokens or credentials.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {GoogleAuth}=require('google-auth-library');
const WebSocket=require('ws');

initializeApp({projectId:'lesson-lit'});
const db=getFirestore();
const classId='uJlrPEXiArJiZda43ZGr';
const itemId='yKAYfEsnQ0YGbJv80VJf';
const cls=await db.doc(`classes/${classId}`).get();
if(!cls.exists)throw Error('B-019 class missing');
const uid=cls.get('teacherId');
if(typeof uid!=='string'||!uid)throw Error('B-019 class teacher missing');
const jobs=await db.collection(`aiPrivate/${uid}/jobs`).orderBy('createdAt','desc').limit(35).get();
let found=0;
for(const job of jobs.docs){
 const j=job.data();
 if(j.action!=='taskTools'||j.classId!==classId||j.itemId!==itemId)continue;
 if((j.createdAt?.toMillis?.()??0)<Date.parse('2026-11-15T07:30:00Z'))continue;
 found++;
 console.log('job',JSON.stringify({status:j.status,mode:j.mode,createdAt:j.createdAt?.toDate?.()?.toISOString(),error:j.error??''}));
 const media=await job.ref.collection('media').get();
 for(const asset of media.docs){
  const a=asset.data();
  console.log('media',JSON.stringify({status:a.status,kind:a.kind,source:a.source??'',error:a.error??'',completedLines:a.completedLines??0,lineCount:Array.isArray(a.lines)?a.lines.length:0,startedAt:a.startedAt?.toDate?.()?.toISOString(),retriedAt:a.retriedAt?.toDate?.()?.toISOString(),failedAt:a.failedAt?.toDate?.()?.toISOString()}));
 }
}
if(!found)console.log('No matching recent B-019 taskTools job in last 35 jobs.');
const attempts=await db.collection('aiCostAttempts').where('startedAt','>=',Date.parse('2026-11-15T07:38:00Z')).where('startedAt','<=',Date.parse('2026-11-15T07:50:00Z')).get();
let attemptCount=0;
for(const s of attempts.docs){const a=s.data();if(a.actorUid!==uid||a.feature!=='lessonAudio')continue;attemptCount++;console.log('audio_attempt',JSON.stringify({status:a.status,model:a.model,basis:a.basis,reason:a.reason??'',failureCode:a.failureCode??'',startedAt:new Date(a.startedAt).toISOString(),settledAt:a.settledAt?new Date(a.settledAt).toISOString():null}));}
if(!attemptCount)console.log('No B-019 lessonAudio cost attempt in interval.');

// Check the exact deployed secret binding and speech model through a non-generating API call.
const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
for(const group of ['aiCaptures','aiCaptureImages']){
 try{
  const url=`https://firestore.googleapis.com/v1/projects/lesson-lit/databases/(default)/collectionGroups/${group}/fields/expireAt`;
  const {data:field}=await client.request({url});
  console.log('ttl_policy',JSON.stringify({collectionGroup:group,field:'expireAt',state:field.ttlConfig?.state||'MISSING'}));
 }catch(error){
  console.log('ttl_policy',JSON.stringify({collectionGroup:group,field:'expireAt',state:'CHECK_FAILED',httpStatus:error.response?.status||null}));
 }
}
const {data:fn}=await client.request({url:'https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/prepareLessonMedia'});
const binding=fn.serviceConfig?.secretEnvironmentVariables?.find(value=>value.key==='OPENAI_API_KEY');
if(!binding?.secret||!binding.version)throw Error('Deployed media worker has no OpenAI binding');
const secret=`https://secretmanager.googleapis.com/v1/projects/${binding.projectId||'lesson-lit'}/secrets/${encodeURIComponent(binding.secret)}/versions/${encodeURIComponent(binding.version)}`;
const {data:metadata}=await client.request({url:secret});
if(metadata.state!=='ENABLED')throw Error('Deployed media worker binding is disabled');
const {data:access}=await client.request({url:`${secret}:access`});
const apiKey=Buffer.from(access.payload?.data||'','base64').toString('utf8').trim();
if(!apiKey)throw Error('Deployed media worker binding is empty');
const modelResponse=await fetch('https://api.openai.com/v1/models/gpt-realtime-2.1-mini',{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(30000)});
console.log('speech_model_check',JSON.stringify({deployedBinding:'enabled',model:'gpt-realtime-2.1-mini',httpStatus:modelResponse.status}));
await new Promise(resolve=>{
 const socket=new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini',{headers:{Authorization:`Bearer ${apiKey}`}});
 const timer=setTimeout(()=>{console.log('speech_session_check',JSON.stringify({result:'timeout'}));socket.terminate();resolve();},12000);
 let reported=false;
 const done=result=>{if(reported)return;reported=true;clearTimeout(timer);console.log('speech_session_check',JSON.stringify(result));socket.close();resolve();};
 socket.on('error',()=>done({result:'connection_error'}));
 socket.on('close',()=>done({result:'closed_before_session_update'}));
 socket.on('message',raw=>{
  let event;try{event=JSON.parse(raw.toString());}catch{return done({result:'invalid_event'});}
  if(event.type==='session.created')socket.send(JSON.stringify({type:'session.update',session:{type:'realtime',output_modalities:['audio'],instructions:'Read only the supplied words.',audio:{input:{turn_detection:null},output:{format:{type:'audio/pcm',rate:24000},voice:'marin'}}}}));
  if(event.type==='session.updated')done({result:'session_update_accepted'});
  if(event.type==='error')done({result:'provider_error',code:event.error?.code??'',type:event.error?.type??'',param:event.error?.param??'',message:String(event.error?.message??'').slice(0,180)});
 });
});

// B-020 uses a separate deployed callable. Verify its exact bound key and
// realtime session independently, without requesting any speech generation.
const {data:recordingFn}=await client.request({url:'https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/recordingSpeech'});
const recordingBinding=recordingFn.serviceConfig?.secretEnvironmentVariables?.find(value=>value.key==='OPENAI_API_KEY');
if(!recordingBinding?.secret||!recordingBinding.version)throw Error('Deployed recordingSpeech has no OpenAI binding');
const recordingSecret=`https://secretmanager.googleapis.com/v1/projects/${recordingBinding.projectId||'lesson-lit'}/secrets/${encodeURIComponent(recordingBinding.secret)}/versions/${encodeURIComponent(recordingBinding.version)}`;
const {data:recordingMetadata}=await client.request({url:recordingSecret});
if(recordingMetadata.state!=='ENABLED')throw Error('Deployed recordingSpeech binding is disabled');
const {data:recordingAccess}=await client.request({url:`${recordingSecret}:access`});
const recordingKey=Buffer.from(recordingAccess.payload?.data||'','base64').toString('utf8').trim();
if(!recordingKey)throw Error('Deployed recordingSpeech binding is empty');
const recordingModelResponse=await fetch('https://api.openai.com/v1/models/gpt-realtime-2.1-mini',{headers:{Authorization:`Bearer ${recordingKey}`},signal:AbortSignal.timeout(30000)});
console.log('recording_speech_model_check',JSON.stringify({deployedBinding:'enabled',model:'gpt-realtime-2.1-mini',httpStatus:recordingModelResponse.status,sameBindingAsMediaWorker:recordingSecret===secret}));
await new Promise(resolve=>{
 const socket=new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini',{headers:{Authorization:`Bearer ${recordingKey}`}});
 const timer=setTimeout(()=>{console.log('recording_speech_session_check',JSON.stringify({result:'timeout'}));socket.terminate();resolve();},12000);
 let reported=false;
 const done=result=>{if(reported)return;reported=true;clearTimeout(timer);console.log('recording_speech_session_check',JSON.stringify(result));socket.close();resolve();};
 socket.on('error',()=>done({result:'connection_error'}));
 socket.on('close',()=>done({result:'closed_before_session_update'}));
 socket.on('message',raw=>{
  let event;try{event=JSON.parse(raw.toString());}catch{return done({result:'invalid_event'});}
  if(event.type==='session.created')socket.send(JSON.stringify({type:'session.update',session:{type:'realtime',output_modalities:['audio'],instructions:'Read only the supplied words.',audio:{input:{turn_detection:null},output:{format:{type:'audio/pcm',rate:24000},voice:'marin'}}}}));
  if(event.type==='session.updated')done({result:'session_update_accepted'});
  if(event.type==='error')done({result:'provider_error',code:event.error?.code??'',type:event.error?.type??'',param:event.error?.param??'',message:String(event.error?.message??'').slice(0,180)});
 });
});

// B-030: inspect the existing QR grant for a hidden lesson and ask the deployed
// callable for the script anonymously. Never print grant IDs, scripts or URLs.
const qrItemId='zHSqDqT0842sWY40Oanu';
const qrItem=db.doc(`classes/${classId}/items/${qrItemId}`);
const [qrItemSnap,qrTasks]=await Promise.all([qrItem.get(),qrItem.collection('tasks').get()]);
console.log('qr_fixture',JSON.stringify({itemExists:qrItemSnap.exists,itemHidden:qrItemSnap.get('hidden')===true,itemLocked:qrItemSnap.get('locked')===true,taskCount:qrTasks.size}));
let qrMediaCount=0,qrGrantCount=0,qrDeniedCount=0;
for(const qrTask of qrTasks.docs){
 const task=qrTask.data();
 const content=task.restricted?(await qrTask.ref.collection('private').doc('body').get()).get('content'):task.content;
 const mediaIds=new Set();
 const visit=node=>{if(!node||typeof node!=='object')return;if(['media','inlineMedia'].includes(node.type)&&typeof node.attrs?.media==='string')mediaIds.add(node.attrs.media);if(Array.isArray(node.content))node.content.forEach(visit);};
 visit(content);
 for(const qrMediaId of mediaIds){
  qrMediaCount++;
  const key=[classId,qrItemId,qrTask.id,qrMediaId].join('/');
  const [grantQuery,publicMedia,privateScript]=await Promise.all([
   db.collection('mediaQrGrants').where('key','==',key).limit(1).get(),
   db.doc(`classes/${classId}/media/${qrMediaId}`).get(),
   db.doc(`classes/${classId}/mediaScripts/${qrMediaId}`).get(),
  ]);
  console.log('qr_placement',JSON.stringify({taskHidden:task.hidden===true,taskLocked:task.locked===true,existingGrant:!grantQuery.empty,publicMediaExists:publicMedia.exists,publicMediaContainsScript:publicMedia.data()&&Object.hasOwn(publicMedia.data(),'script')||false,privateScriptExists:privateScript.exists}));
  if(grantQuery.empty)continue;
  qrGrantCount++;
  const response=await fetch('https://us-central1-lesson-lit.cloudfunctions.net/mediaScriptAccess',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({data:{classId,itemId:qrItemId,taskId:qrTask.id,mediaId:qrMediaId,grant:grantQuery.docs[0].id,action:'read'}}),
   signal:AbortSignal.timeout(30000),
  });
  const result=await response.json();
  const denied=result.error?.status==='PERMISSION_DENIED';
  if(denied)qrDeniedCount++;
  console.log('qr_anonymous_read',JSON.stringify({httpStatus:response.status,errorStatus:result.error?.status||'',scriptLines:Array.isArray(result.result?.script)?result.result.script.length:null,denied}));
 }
}
console.log('qr_summary',JSON.stringify({mediaPlacements:qrMediaCount,existingGrants:qrGrantCount,deniedReads:qrDeniedCount}));
