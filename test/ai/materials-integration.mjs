// Real callable + Firestore emulator; model HTTP is stubbed and never billed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {rebuilt} from './material-fixture.mjs';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-material-import'});process.env.ELT_AI_ENABLED='true';process.env.ELT_AI_MODEL='gpt-6.1-sol';process.env.OPENAI_API_KEY='test-only';
const db=getFirestore(),uid='import-teacher',classId='import-class';
await Promise.all([db.doc(`users/${uid}`).set({role:'teacher'}),db.doc(`accounts/${uid}`).set({}),db.doc(`classes/${classId}`).set({teacherId:uid}),db.doc(`aiPilot/${uid}`).set({enabled:true})]);
const {lessonAssistant}=await import('../../functions/ai/assistant.js');
let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url)!=='https://api.openai.com/v1/responses')return oldFetch(url,options);calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.ok(body.instructions.includes('Do not guess unreadable content'));return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:1000,output_tokens:1000},output:[{content:[{type:'output_text',text:JSON.stringify(rebuilt)}]}]})};};
const call=d=>lessonAssistant.run({auth:{uid,token:{}},data:{classId,...d}});
const source={name:'Original worksheet.txt',text:'Would you like to come on Saturday? Which day?',images:[],warnings:['No recording included.']};
const base={action:'rebuild',requestId:'one',scope:'item',creationType:'lesson',rightsAccepted:true,rightsVersion:'materials-2026-11-01',source};
try{
 await assert.rejects(call({...base,rightsAccepted:false}));assert.equal(calls,0);
 await assert.rejects(lessonAssistant.run({data:{classId,...base}}));assert.equal(calls,0);
 await db.doc('classes/other').set({teacherId:'someone-else'});await assert.rejects(call({...base,classId:'other'}));assert.equal(calls,0);
 for(const type of ['lesson','homework','exam','practice']){
  const requestId='mode_'+type,first=await call({...base,requestId,creationType:type}),again=await call({...base,requestId,creationType:type});assert.deepEqual(first,again);assert.ok(first.rebuilt.warnings.includes('No recording included.'));
  await assert.rejects(call({action:'importCreate',requestId,scope:'item',rebuilt:first.rebuilt,reviewed:false}));
  const reviewed=structuredClone(first.rebuilt);reviewed.title='Reviewed '+type;reviewed.tasks[0].instructions='Read the email carefully.';
  const saved=await call({action:'importCreate',requestId,scope:'item',rebuilt:reviewed,reviewed:true}),retry=await call({action:'importCreate',requestId,scope:'item',rebuilt:reviewed,reviewed:true});assert.deepEqual(saved,retry);
  const item=db.doc(`classes/${classId}/items/${saved.createdItemId}`),snap=await item.get();assert.equal(snap.get('type'),type);assert.equal(snap.get('hidden'),true);assert.equal(snap.get('title'),'Reviewed '+type);if(type==='exam')assert.equal(snap.get('examReleased'),false);
  const tasks=await item.collection('tasks').get();assert.equal(tasks.size,1);const t=tasks.docs[0];assert.equal(t.get('instructions'),'Read the email carefully.');assert.ok(t.get('content').content.some(n=>n.type==='table'));assert.ok(!JSON.stringify(t.get('content')).includes('Teacher key'));assert.deepEqual((await t.ref.collection('private').doc('key').get()).get('q0_0.answers'),['Saturday']);
  const status=await call({action:'rebuildStatus',requestId});assert.equal(status.createdItemId,saved.createdItemId);
 }
 assert.equal(calls,4,'Retry must reuse generated results');
 const target=db.doc(`classes/${classId}/items/existing`);await target.set({title:'Existing lesson',type:'homework',taskCount:1});await target.collection('tasks').doc('original').set({title:'Keep me',order:5,content:{type:'doc',content:[]}});
 const r=await call({...base,requestId:'task',scope:'task',creationType:'homework'});const saved=await call({action:'importCreate',requestId:'task',scope:'task',itemId:'existing',rebuilt:r.rebuilt,reviewed:true});await call({action:'importCreate',requestId:'task',scope:'task',itemId:'existing',rebuilt:r.rebuilt,reviewed:true});assert.equal((await target.collection('tasks').get()).size,2);assert.equal((await target.collection('tasks').doc('original').get()).get('title'),'Keep me');assert.equal((await target.collection('tasks').doc(saved.taskId).get()).get('order'),6);
 await assert.rejects(call({action:'importCreate',requestId:'task',scope:'item',rebuilt:r.rebuilt,reviewed:true}));
 const job=(await db.doc(`aiPrivate/${uid}/jobs/task`).get()).data();assert.equal(job.rightsVersion,base.rightsVersion);assert.ok(job.rightsAcceptedAt);assert.ok(!Object.hasOwn(job,'source'));
 await db.doc(`aiPilot/${uid}`).update({enabled:false});await assert.rejects(call({action:'rebuildStatus',requestId:'task'}));
 console.log('PASS: all four modes, blank optional instructions, rights enforcement, access checks, reviewed native output, private keys, atomic/idempotent saves, append-only task import, recovery and revoked access. Model calls stubbed.');
}finally{globalThis.fetch=oldFetch;await db.terminate();}
