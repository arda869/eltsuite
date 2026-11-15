// Temporary, read-only production diagnosis. Never print prompts, scripts, tokens or credentials.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {GoogleAuth}=require('google-auth-library');

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
