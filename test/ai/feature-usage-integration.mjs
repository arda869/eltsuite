// Real Auth + Firestore emulators and callable handlers. Paid provider HTTP is mocked.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Both isolated emulators are required.');
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const projectId='demo-ai-allowances';initializeApp({projectId});const db=getFirestore(),auth=getAuth();
const {AI_FEATURES,usageContext,chargeFeature,reserveFeature}=await import('../../functions/ai/feature-usage.js');
const {adminAiUsage}=await import('../../functions/ai/admin-usage.js');
const {reserveSpeech}=await import('../../functions/speech/access.js');
const {recordingSong,recordingLyrics,recordingSongResult}=await import('../../functions/songs/index.js');
process.env.VIDEO_AI_ENABLED='true';process.env.RUNWAYML_API_SECRET='test-only';process.env.GEMINI_API_KEY='test-only';process.env.OPENAI_API_KEY='test-only';
const {videoStudio}=await import('../../functions/video/index.js');
const person=(uid,email,verified=true)=>({uid,token:{email,email_verified:verified}});
const owner=person('owner','ardanurioglu@gmail.com'),teacher=person('teacher','teacher@example.test'),learner=person('learner','learner@example.test'),superUser=person('super','super@example.test');
for(const p of [owner,teacher,learner,superUser]){try{await auth.deleteUser(p.uid);}catch{}await auth.createUser({uid:p.uid,email:p.token.email,emailVerified:true});await db.doc('users/'+p.uid).set({role:p===learner?'learner':'teacher'});}
await db.doc('superAdmins/super@example.test').set({name:'Super'});
const day=new Date().toISOString().slice(0,10),call=(who,data)=>adminAiUsage.run({auth:who,data});
await assert.rejects(call(teacher,{action:'get',uid:'teacher'}),{code:'permission-denied'});
await assert.rejects(call({...owner,token:{...owner.token,email_verified:false}},{action:'get',uid:'teacher'}),{code:'permission-denied'});
await assert.rejects(call({...owner,token:{...owner.token,proxyBy:'teacher'}},{action:'get',uid:'teacher'}),{code:'permission-denied'});
let settings=await call(owner,{action:'get',uid:'teacher'});assert.equal(settings.isAdmin,false);assert.equal(settings.features.length,18);
await call(owner,{action:'save',uid:'teacher',version:0,limits:{song:1,lyrics:0,videoScene:null}});
await assert.rejects(call(owner,{action:'save',uid:'teacher',version:0,limits:{song:99}}),{code:'aborted'});
await assert.rejects(call(owner,{action:'save',uid:'teacher',version:1,limits:{song:-1}}),{code:'invalid-argument'});
assert.equal((await call(owner,{action:'get',uid:'owner'})).isAdmin,true);
await assert.rejects(call(owner,{action:'save',uid:'owner',version:0,limits:{song:0}}),{code:'failed-precondition'});
// Atomic last-use contention; exactly one admitted. Rejections never write counters.
const results=await Promise.allSettled(Array.from({length:8},()=>reserveFeature(db,teacher,'song')));
assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
assert.equal((await db.doc(`aiFeatureUsage/teacher/days/${day}`).get()).get('counts.song'),1);
for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.code,'resource-exhausted');
await assert.rejects(reserveFeature(db,teacher,'lyrics'),e=>e.code==='resource-exhausted'&&/disabled/.test(e.message));
settings=await call(owner,{action:'get',uid:'teacher'});
await call(superUser,{action:'save',uid:'teacher',version:settings.version,limits:{song:null,lyrics:0,videoScene:null}});
await reserveFeature(db,teacher,'song');
// Every catalog entry honours a block and the verified super-admin exemption, even above old caps.
await db.doc('aiAllowances/learner').set({limits:Object.fromEntries(AI_FEATURES.map(f=>[f.id,0]))});
for(const f of AI_FEATURES)await assert.rejects(reserveFeature(db,learner,f.id),{code:'resource-exhausted'});
for(const who of [owner,superUser]){
 await db.doc('aiAllowances/'+who.uid).set({limits:Object.fromEntries(AI_FEATURES.map(f=>[f.id,0]))});
 await db.doc(`aiFeatureUsage/${who.uid}/days/${day}`).set({counts:Object.fromEntries(AI_FEATURES.map(f=>[f.id,100000]))});
 for(const f of AI_FEATURES)await reserveFeature(db,who,f.id);
}
// A later transaction failure cannot consume a use.
const before=(await db.doc(`aiFeatureUsage/owner/days/${day}`).get()).get('counts.song');
const context=await usageContext(db,owner);
await assert.rejects(db.runTransaction(async tx=>{await chargeFeature(tx,db,context,'song');throw Error('Budget/job validation failed');}));
assert.equal((await db.doc(`aiFeatureUsage/owner/days/${day}`).get()).get('counts.song'),before);
// Revoking a protected registry grant takes effect on the next request.
await db.doc('superAdmins/super@example.test').delete();
await assert.rejects(reserveFeature(db,superUser,'song'),{code:'resource-exhausted'});
// Speech no longer has an unrelated shared hard cap. It uses the requesting user's feature policy.
await db.doc('speechUsage/'+day).set({count:999999});
await reserveSpeech(owner,'speech');
await assert.rejects(reserveSpeech(learner,'speech'),{code:'resource-exhausted'});
let music=0,drafts=0,videos=0;const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{
 if(String(url).includes('generativelanguage.googleapis.com')){music++;return {ok:true,json:async()=>({steps:[{type:'model_output',content:[{type:'audio',data:Buffer.alloc(1000,1).toString('base64'),mime_type:'audio/mpeg'}]}]})};}
 if(String(url).includes('api.openai.com/v1/images/'))return {ok:true,json:async()=>({data:[{b64_json:Buffer.concat([Buffer.from([255,216]),Buffer.alloc(200)]).toString('base64')}]})};
 if(String(url).includes('api.openai.com')){const name=JSON.parse(opts.body).text?.format?.name;if(['outline','help_selection'].includes(name)){const value=name==='outline'?{title:'Choose a trip',outcomes:['Compare options'],methodology:'Task-based',rationale:'A practical decision drives language use.',stages:[{id:'task',title:'Choose',aim:'Agree on a trip',minutes:60,interaction:'Pairs'}]}:{articleIds:[]};return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:30}})};}drafts++;return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({lyrics:'Head and shoulders.\nSing together.'})}]}],usage:{input_tokens:100,output_tokens:30}})};}
 if(String(url).includes('api.dev.runwayml.com')){videos++;return {ok:true,json:async()=>({id:'mock-render-'+videos})};}
 return originalFetch(url,opts);
};
try{
 const brief={title:'Parts of the body',audience:'Young learners',level:'A1',style:'Pop',language:'English',delivery:'Solo singer',duration:30,focus:'',prompt:'Parts of the body',lyrics:'Head and shoulders.\nSing together.'};
 await db.doc(`songUsage/${day}`).set({song:99999,lyrics:99999});await db.doc(`songUsage/${day}/teachers/owner`).set({song:99999,lyrics:99999});
 const lyricId='lyrics-admin-12345678',songId='song-admin-12345678';
 await recordingLyrics.run({auth:owner,data:{id:lyricId,brief}});assert.equal(drafts,1);
 assert.match((await recordingSongResult.run({auth:owner,data:{id:lyricId}})).lyrics,/Head/);
 await recordingSong.run({auth:owner,data:{id:songId,brief,approved:true}});assert.equal(music,1);
 const result=await recordingSongResult.run({auth:owner,data:{id:songId}});assert.equal(result.status,'complete');assert.ok(result.audio);
 await recordingSong.run({auth:owner,data:{id:songId,brief,approved:true}});assert.equal(music,1);
 assert.equal((await db.doc(`aiFeatureUsage/owner/days/${day}`).get()).get('counts.song'),before+1,'recovery and duplicate ID do not consume a second use');
 await assert.rejects(recordingLyrics.run({auth:teacher,data:{id:'lyrics-blocked-12345678',brief}}),{code:'resource-exhausted'});assert.equal(drafts,1);
 await db.doc(`videoUsage/${day}`).set({seconds:99999,images:99999,plans:99999});await db.doc(`videoUsage/${day}/teachers/owner`).set({seconds:99999,images:99999,plans:99999});
 const video={action:'generate',requestId:'admin-scene-12345678',prompt:'A friendly original cartoon robot waves.',name:'',duration:5,references:[],visualStyle:'cartoon3d',voice:''};
 await videoStudio.run({auth:owner,data:video});assert.equal(videos,1);
 await videoStudio.run({auth:owner,data:video});assert.equal(videos,1,'duplicate scene never starts a second render');
 await db.doc('aiAllowances/teacher').set({limits:{videoScene:0}});
 await assert.rejects(videoStudio.run({auth:teacher,data:{...video,requestId:'blocked-scene-12345678'}}),{code:'resource-exhausted'});assert.equal(videos,1);
 // Exercise real text and background-media reservation/settlement above both monthly caps.
 process.env.ELT_AI_ENABLED='true';process.env.ELT_AI_MODEL='gpt-6.1-sol';
 const {lessonAssistant}=await import('../../functions/ai/assistant.js'),{helpAssistant}=await import('../../functions/help/index.js'),{prepareLessonMedia}=await import('../../functions/ai/media-worker.js');
 const month=day.slice(0,7);
 for(const col of ['aiBudgets','aiAdminBudgets','helpBudgets','helpAdminBudgets'])await db.doc(col+'/'+month).set({committedMicroUsd:80000000});
 await db.doc('classes/allowance-class').set({teacherId:'owner'});await db.doc('aiPilot/owner').set({enabled:true});
 const lessonBrief={topic:'',objectives:'Compare two travel options and agree on a choice.',context:'Adult group, pairs, board available.',level:'B1',methodology:'Task-based',duration:60};
 const outline=await lessonAssistant.run({auth:owner,data:{action:'outline',requestId:'admin-outline-12345678',classId:'allowance-class',brief:lessonBrief}});assert.equal(outline.outline.title,'Choose a trip');
 await helpAssistant.run({auth:owner,data:{question:'How do I create a recording?'}});
 assert.ok((await db.doc('aiAdminBudgets/'+month).get()).get('committedMicroUsd')>80000000);
 assert.equal((await db.doc('aiBudgets/'+month).get()).get('committedMicroUsd'),80000000,'super admin does not consume ordinary shared budget');
 assert.equal((await db.doc('helpBudgets/'+month).get()).get('committedMicroUsd'),80000000);
 const media=db.doc('aiPrivate/owner/jobs/admin-media/media/picture');await media.set({status:'queued',kind:'image',classId:'allowance-class',title:'Test image',prompt:'An original cartoon robot'});
 await prepareLessonMedia.run({data:{after:await media.get()},params:{uid:'owner',jobId:'admin-media',assetId:'picture'}});
 assert.equal((await media.get()).get('status'),'ready');
}finally{globalThis.fetch=originalFetch;}
// Client rules: even an admin cannot forge usage or bypass the audited callable to write policy.
const rules=await import(process.env.AI_RULES_MODULE||'@firebase/rules-unit-testing');
const client=await import(process.env.AI_FIRESTORE_MODULE||'firebase/firestore');
const env=await rules.initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});
try{
 for(const who of [owner,teacher,learner]){
  const c=env.authenticatedContext(who.uid,who.token).firestore();
  await rules.assertFails(client.setDoc(client.doc(c,'aiAllowances',who.uid),{limits:{song:null}}));
  await rules.assertFails(client.setDoc(client.doc(c,'aiFeatureUsage',who.uid,'days',day),{counts:{song:0}}));
  if(who===owner)await rules.assertSucceeds(client.getDoc(client.doc(c,'aiAllowances','teacher')));
  else await rules.assertFails(client.getDoc(client.doc(c,'aiAllowances','teacher')));
 }
}finally{await env.cleanup();await db.terminate();}
console.log('PASS: 18 features, admin controls + version conflicts, zero/custom/unlimited, last-use concurrency, rollback, revocation, protected rules, real song/video/text/help callables, background media above monthly budgets + dedup and recovery. Provider responses mocked; no billable generation.');
