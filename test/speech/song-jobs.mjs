// Real callable handlers + real Firestore transactions. Only external paid providers are substituted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {unlink} from 'node:fs/promises';
import {build} from 'esbuild';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('This test requires the Firestore emulator.');
const deps=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=deps('firebase-admin/app'),{getFirestore}=deps('firebase-admin/firestore');
initializeApp({projectId:process.env.SONG_TEST_PROJECT||'demo-ai-access'});const db=getFirestore();
process.env.OPENAI_API_KEY='test-openai';process.env.GEMINI_API_KEY='test-gemini';
const output=new URL('../../functions/songs/.jobs-test.mjs',import.meta.url);
await build({entryPoints:[new URL('../../functions/songs/index.js',import.meta.url).pathname],outfile:output.pathname,bundle:true,platform:'node',format:'esm',packages:'external'});const originalFetch=globalThis.fetch;let musicCalls=0,lyricCalls=0,lastLyricInput,lyricRejectCode='';
globalThis.fetch=async(url,opts)=>{
 if(String(url).includes('generativelanguage.googleapis.com')){musicCalls++;return {ok:true,json:async()=>({steps:[{type:'model_output',content:[{type:'audio',data:Buffer.alloc(1000,1).toString('base64'),mime_type:'audio/mpeg'}]}]})};}
 if(String(url).includes('api.openai.com')){lyricCalls++;if(lyricRejectCode)return {ok:false,status:429,json:async()=>({error:{code:lyricRejectCode,message:'PRIVATE_PROVIDER_DETAIL'}})};lastLyricInput=JSON.parse(JSON.parse(opts.body).input);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({lyrics:'A fresh draft.\nSing along.'})}]}],usage:{input_tokens:100,output_tokens:30}})};}
 return originalFetch(url,opts);
};
try{
 const {recordingSong,recordingLyrics,recordingSongResult,recordingSongLesson}=await import(pathToFileURL(output.pathname).href);
 const uid='song-teacher-'+Date.now(),other=uid+'-other';
 for(const id of [uid,other])await db.doc('users/'+id).set({role:'teacher'});
 const brief={title:'Morning song',audience:'Adults',level:'A1',style:'Jazz',language:'English',delivery:'Solo singer',duration:60,focus:'Daily routines',prompt:'Waking up',lyrics:'  Wake up.\nLet’s go.  '};
 const request=(uid,data)=>({auth:{uid,token:{}},data});
 await assert.rejects(recordingSong.run({data:{}}),e=>e.code==='unauthenticated');
 await assert.rejects(recordingSong.run({auth:{uid,token:{proxyBy:'owner'}},data:{}}),e=>e.code==='unauthenticated');
 await db.doc('users/learner-song').set({role:'learner'});
 await assert.rejects(recordingSong.run(request('learner-song',{})),e=>e.code==='permission-denied');
 await assert.rejects(recordingSong.run(request(uid,{id:'song-first-12345678',brief,approved:false})),e=>e.code==='failed-precondition');
 const id='song-first-12345678';
 await Promise.all([recordingSong.run(request(uid,{id,brief,approved:true})),recordingSong.run(request(uid,{id,brief,approved:true}))]);
 assert.equal(musicCalls,1,'duplicate requests must not call the paid music provider twice');
 const result=await recordingSongResult.run(request(uid,{id}));assert.equal(result.status,'complete');assert.equal(Buffer.from(result.audio,'base64').length,1000);
 assert.equal((await db.doc(`songPrivate/${uid}/jobs/${id}`).get()).get('brief.lyrics'),brief.lyrics);
 await assert.rejects(recordingSongResult.run(request(other,{id})),e=>e.code==='not-found');
 await recordingSong.run(request(uid,{id,brief:{...brief,lyrics:'Changed'},approved:true}));assert.equal(musicCalls,1,'completed ID cannot regenerate');
 await recordingLyrics.run(request(uid,{id:'lyrics-first-12345678',brief}));assert.equal(lyricCalls,1);
 assert.equal((await recordingSongResult.run(request(uid,{id:'lyrics-first-12345678'}))).lyrics,'A fresh draft.\nSing along.');
 const classId='song-class-'+Date.now(),lesson={classId,itemId:'lesson-1'};
 await db.doc('classes/'+classId).set({teacherId:uid,status:'active',name:'Classroom',level:'A2',learningProfile:{ageGroup:'Young learners'}});
 await db.doc('classes/'+classId+'/items/lesson-1').set({type:'lesson',title:'Morning routines',speakingFocus:'Use the present simple for daily routines.'});
 await db.doc('classes/'+classId+'/items/lesson-1/tasks/task-1').set({order:1,title:'Daily verbs',instructions:'Talk about your day.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'wake up, eat breakfast, go to school'}]}]}});
 await db.doc('classes/'+classId+'/items/lesson-1/tasks/task-1/private/key').set({secret:'PRIVATE_ANSWER_KEY'});
 const linked=await recordingSongLesson.run(request(uid,{lesson}));assert.equal(linked.level,'A2');assert.match(linked.tasks[0].text,/eat breakfast/);assert.ok(!JSON.stringify(linked).includes('PRIVATE_ANSWER_KEY'));
 await assert.rejects(recordingSongLesson.run(request(other,{lesson})),e=>e.code==='permission-denied');
 await db.doc('classes/'+classId).update({coTeachers:{[other]:{role:'viewer'}}});
 await assert.rejects(recordingSongLesson.run(request(other,{lesson})),e=>e.code==='permission-denied');
 await db.doc('classes/'+classId).update({coTeachers:{[other]:{role:'co'}}});assert.equal((await recordingSongLesson.run(request(other,{lesson}))).title,'Morning routines');
 await recordingLyrics.run(request(uid,{id:'lyrics-linked-12345678',brief:{...brief,prompt:'',lesson}}));assert.equal(lastLyricInput.linkedLesson.title,'Morning routines');assert.match(lastLyricInput.linkedLesson.tasks[0].text,/wake up/);assert.equal(lastLyricInput.language,'English');
 lyricRejectCode='credit_balance_exhausted';const creditId='lyrics-credit-12345678';
 await assert.rejects(recordingLyrics.run(request(uid,{id:creditId,brief})),e=>e.code==='failed-precondition'&&e.message.includes('credit')&&!e.message.includes('PRIVATE_PROVIDER_DETAIL')&&!/OpenAI|ChatGPT/.test(e.message));
 const rejected=(await db.doc(`songPrivate/${uid}/jobs/${creditId}`).get()).data();assert.equal(rejected.failureReason,'billing');assert.equal(rejected.brief.lyrics,brief.lyrics);
 const callsBeforeRecovery=lyricCalls;const failedDraft=await recordingSongResult.run(request(uid,{id:creditId}));assert.equal(failedDraft.status,'failed');assert.match(failedDraft.error,/own lyrics/);assert.equal(lyricCalls,callsBeforeRecovery);lyricRejectCode='';
 await db.doc(`songPrivate/${uid}`).set({jobId:'another',busyUntil:Date.now()+60000});
 await assert.rejects(recordingSong.run(request(uid,{id:'song-locked-12345678',brief,approved:true})),e=>e.code==='resource-exhausted');
 await db.doc(`songPrivate/${uid}`).set({busyUntil:0});
 const day=new Date().toISOString().slice(0,10);await db.doc(`aiFeatureUsage/${uid}/days/${day}`).set({counts:{song:3}});
 await assert.rejects(recordingSong.run(request(uid,{id:'song-budget-12345678',brief,approved:true})),e=>e.code==='resource-exhausted');assert.equal(musicCalls,1);
 await db.doc(`songPrivate/${uid}/jobs/${id}`).update({expiresAt:Date.now()-1});
 await assert.rejects(recordingSongResult.run(request(uid,{id})),e=>e.code==='not-found');
 console.log('Song callable integration passed: auth, approval, real transaction deduplication, recovery, ownership, limits and expiration.');
}finally{globalThis.fetch=originalFetch;await unlink(output);await db.terminate();}
