// Firestore/Auth emulators are real; paid provider responses are simulated.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Use an isolated emulator.');
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-ai-allowances'});const db=getFirestore();
const {withCosts}=await import('../../functions/costs/callable.js');
const {beginAttempt,settleAttempt,resolveOwner}=await import('../../functions/costs/ledger.js');
const {trackedFetch}=await import('../../functions/costs/fetch.js');
const {costAdmin}=await import('../../functions/costs/admin.js');
const owner={uid:'cost-admin',token:{email:'ardanurioglu@gmail.com',email_verified:true}};
await db.doc('users/cost-learner').set({role:'learner',classId:'cost-class'});
await db.doc('classes/cost-class').set({teacherId:'cost-teacher'});
await db.doc('classes/cost-class/members/cost-learner').set({learnerId:'l1'});
await db.doc('classes/other-class').set({teacherId:'wrong-teacher'});
assert.equal((await resolveOwner(db,'cost-learner','cost-class')).teacherUid,'cost-teacher');
assert.equal((await resolveOwner(db,'cost-learner','')).teacherUid,'cost-teacher');
assert.equal((await resolveOwner(db,'cost-learner','other-class')).teacherUid,null);
for(const auth of [null,{uid:'cost-teacher',token:{email:'t@example.test',email_verified:true}},{...owner,token:{...owner.token,email_verified:false}},{...owner,token:{...owner.token,proxyBy:'x'}}])await assert.rejects(costAdmin(db,auth,{action:'report'}),{code:'permission-denied'});
let paid=0;
const provider=async()=>{paid++;return new Response(JSON.stringify({id:'provider-test',status:'completed',model:'gpt-6.1-sol',usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:600}},output:[]}),{status:200});};
await withCosts({db,uid:'cost-learner',feature:'speakingFeedback',classId:'cost-class',operationId:'cost-test-success'},async()=>{
 await trackedFetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({model:'gpt-6.1-sol'})},provider);
});assert.equal(paid,1);
let a;
await withCosts({db,uid:'cost-teacher',feature:'song',operationId:'cost-test-dedup'},async()=>{
 a=await beginAttempt({provider:'google',model:'lyria-3.5',ceilingMicroUsd:80000});
 await Promise.all(Array.from({length:5},()=>settleAttempt(a,{usage:{songs:1},basis:'calculated_units'})));
});assert.equal((await a.ref.get()).get('costMicroUsd'),80000);
await assert.rejects(withCosts({db,uid:'cost-teacher',feature:'song',operationId:'cost-test-failed'},async()=>{
 await trackedFetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',body:JSON.stringify({model:'lyria-3.5'})},async()=>new Response(JSON.stringify({error:{message:'DO NOT STORE THIS SECRET PROMPT'}}),{status:503}));throw Error('Generation failed');
}));
let report=await costAdmin(db,owner,{action:'report'});assert.equal(report.features.length,21);assert.equal(report.invoiceConfirmedMicroUsd,null);
const recorded=report.records.find(r=>r.actorUid==='cost-learner');assert.equal(recorded.teacherUid,'cost-teacher');assert.equal(recorded.costMicroUsd,2860);
assert.ok(!JSON.stringify(report).includes('DO NOT STORE'));
const song=report.features.find(f=>f.id==='song');assert.ok(song.failed>=1);assert.ok(song.unknown>=1);assert.equal(song.recommendedCredits,null);
const initial=report.settings;
await costAdmin(db,owner,{action:'save',...initial,proposed:{song:32},dailyGlobalMicroUsd:1000000000,dailyTeacherMicroUsd:1000000,paused:false});
await assert.rejects(costAdmin(db,owner,{action:'save',...initial,proposed:{song:1}}),{code:'aborted'});
// Concurrent calls cannot overspend the same teacher reservation pool.
await db.doc('users/cost-limited').set({role:'teacher'});
const results=await Promise.allSettled(Array.from({length:5},(_,i)=>withCosts({db,uid:'cost-limited',feature:'song',operationId:'guard-'+i},()=>beginAttempt({provider:'google',model:'lyria-3.5',ceilingMicroUsd:800000}))));
assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
await costAdmin(db,owner,{action:'save',...(await costAdmin(db,owner,{action:'report'})).settings,dailyTeacherMicroUsd:250000000,paused:false});
// Server-side realtime usage: duplicate events do not double-charge; transcription is separate.
const {EventEmitter}=await import('node:events');
const {monitorSpeakingCosts}=await import('../../functions/costs/realtime.js');
let voice;
await withCosts({db,uid:'cost-learner',feature:'speakingPractice',classId:'cost-class',operationId:'cost-voice'},async()=>{voice=await beginAttempt({provider:'openai',model:'gpt-realtime-2.1-mini',ceilingMicroUsd:2000000});});
const callRef=db.doc('speakingCalls/cost-voice');await callRef.set({status:'closed'});
const event={type:'response.done',response:{id:'resp-dedup',usage:{input_token_details:{text_tokens:100,audio_tokens:200},output_token_details:{text_tokens:50,audio_tokens:300}}}};
class Socket extends EventEmitter{constructor(){super();queueMicrotask(()=>{this.emit('open');this.emit('message',Buffer.from(JSON.stringify(event)));this.emit('message',Buffer.from(JSON.stringify(event)));this.emit('message',Buffer.from(JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:'t1',content_index:0,transcript:'PRIVATE',usage:{type:'tokens',input_tokens:100,input_token_details:{audio_tokens:100,text_tokens:0},output_tokens:20}})));setTimeout(()=>this.emit('close'),100);});}close(){}}
await monitorSpeakingCosts({db,ref:callRef,data:{costAttemptId:voice.id,callId:'rtc_test',deadline:Date.now()+10000},key:'simulated',hangup:async()=>{},Socket});
assert.equal((await voice.ref.get()).get('costMicroUsd'),8180);
assert.equal((await db.doc('aiCostAttempts/'+voice.id+'_transcription').get()).get('costMicroUsd'),225);
assert.equal((await voice.ref.collection('events').get()).size,1);
const {expireCostAttempt}=await import('../../functions/costs/recovery.js');
let stale;await withCosts({db,uid:'cost-teacher',feature:'song',operationId:'cost-stale'},async()=>{stale=await beginAttempt({provider:'google',model:'lyria-3.5',ceilingMicroUsd:80000});});
await stale.ref.update({startedAt:Date.now()-90000000});assert.equal(await expireCostAttempt(db,stale.ref),true);assert.equal((await stale.ref.get()).get('costMicroUsd'),null);assert.equal((await stale.ref.get()).get('status'),'failed');
const rules=await import(process.env.AI_RULES_MODULE||'@firebase/rules-unit-testing'),client=await import(process.env.AI_FIRESTORE_MODULE||'firebase/firestore');
const env=await rules.initializeTestEnvironment({projectId:'demo-ai-allowances',firestore:{rules:readFileSync('firestore.rules','utf8')}});
try{for(const who of [owner,{uid:'cost-learner',token:{}}]){const c=env.authenticatedContext(who.uid,who.token).firestore();for(const col of ['aiCostAttempts','aiCostGenerations','aiCostSettings','aiCostGuards','aiCostSettingsAudit']){await rules.assertFails(client.getDoc(client.doc(c,col,'private')));await rules.assertFails(client.setDoc(client.doc(c,col,'forged'),{costMicroUsd:0}));}}}finally{await env.cleanup();await db.terminate();}
console.log('PASS: real Firestore ledger, provider usage capture, duplicate settlement, unknown failure, learner ownership, spoof denial, admin access, empty optional report fields, settings conflicts, spending race and private rules. Paid provider responses simulated.');
