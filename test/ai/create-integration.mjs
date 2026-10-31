// Runs only against a disposable Firestore emulator; never contacts the model provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore emulator required.');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-ai-access'});
process.env.ELT_AI_ENABLED='true';
const {lessonAssistant}=await import('../../functions/ai/assistant.js');
const db=getFirestore(),uid='studio-owner',classId='studio-class';
await Promise.all([db.doc(`users/${uid}`).set({role:'teacher'}),db.doc(`accounts/${uid}`).set({}),db.doc(`classes/${classId}`).set({teacherId:uid}),db.doc(`classes/studio-other`).set({teacherId:uid}),db.doc(`aiPilot/${uid}`).set({enabled:true})]);
const plan={mainAim:'Explain a choice',languageAnalysis:'Modal could',assessment:'Two reasons',stages:[{id:'s',minutes:15}]};
const activities={title:'Choose a trip',rationale:'Decision task',differentiation:'Optional scaffolding',recycling:'No history',tasks:[{stageId:'s',title:'Choose',format:'choice',teacherOnlyInput:'Private reference.',roles:[],minutes:15,instructions:'Choose.',input:'Travel plans.',questions:[{format:'choice',acceptedAnswers:[],prompt:'Which is an arrangement?',options:['I am flying tomorrow.','I flew yesterday.'],answer:'I am flying tomorrow.',explanation:'Future arrangement.'}],teacherNotes:'Check reasons.',support:'Consider the time reference.',challenge:'Explain another possible context.'}]};
activities.tasks[0].versions=[{label:'Supported',reason:'Recognition before recall',instructions:'Choose the reply.',input:'Travel plans.',visuals:[],questions:activities.tasks[0].questions},{label:'Stretch',reason:'Recall without choices',instructions:'Complete the reply.',input:'Travel plans.',visuals:[],questions:[{format:'gap',acceptedAnswers:[],prompt:'I ___ tomorrow.',options:[],answer:'am flying',explanation:'Future arrangement.'}]}];
const call=data=>lessonAssistant.run({auth:{uid,token:{}},data:{classId,...data}});
for(const creationType of ['lesson','exam','homework','practice']) {
 const sourceRequestId='create_'+creationType;
 await db.doc(`aiPrivate/${uid}/jobs/${sourceRequestId}`).set({status:'completed',action:'activities',classId,creationType,duration:15,sourcePlan:plan,result:{activities}});
 const first=await call({action:'create',sourceRequestId,createVariants:true});
 const again=await call({action:'create',sourceRequestId,createVariants:true});
 assert.equal(first.createdItemId,again.createdItemId);
 const ref=db.doc(`classes/${classId}/items/${first.createdItemId}`),item=await ref.get();
 assert.equal(item.get('type'),creationType);assert.equal(item.get('hidden'),true);
 const tasks=await ref.collection('tasks').get();assert.equal(tasks.size,creationType==='exam'?1:3);
 const main=await ref.collection('tasks').doc('activity_0').get();assert.equal(main.get('content').content[2].content[0].attrs.correct,-1);
 const key=await main.ref.collection('private').doc('key').get();assert.equal(key.get('q0_0.correct'),0);
 if(creationType==='exam')assert.equal(item.get('examReleased'),false);
 else {const support=await ref.collection('tasks').doc('activity_0_support').get();assert.equal(support.get('restricted'),true);assert.deepEqual(support.get('allowed'),[]);assert.equal(support.get('content'),null);const stretch=ref.collection('tasks').doc('activity_0_challenge');const stretchKey=await stretch.collection('private').doc('key').get();assert.equal(stretchKey.get('q0_0.kind'),'gap');assert.deepEqual(stretchKey.get('q0_0.answers'),['am flying']);const body=await stretch.collection('private').doc('body').get();assert.ok(!JSON.stringify(body.data()).includes('Extension:'));}
}
await assert.rejects(call({action:'create',classId:'studio-other',sourceRequestId:'create_lesson'}));
await db.doc(`aiPilot/${uid}`).update({enabled:false});
await assert.rejects(call({action:'create',sourceRequestId:'create_lesson'}));
console.log('All four creation modes, atomic retries, private keys, optional variants, class isolation and revoked access passed.');

await db.doc(`aiPilot/${uid}`).update({enabled:true});
await db.doc(`classes/${classId}`).update({kind:'training',level:'TKT'});
await db.doc(`aiPrivate/${uid}/jobs/create_training`).set({status:'completed',action:'activities',classId,creationType:'practice',duration:15,sourcePlan:plan,result:{activities:{...activities,tasks:activities.tasks.map(t=>({...t,trainingTool:'exam'}))}}});
const training=await call({action:'create',sourceRequestId:'create_training'});
const trainingTask=await db.doc(`classes/${classId}/items/${training.createdItemId}/tasks/activity_0`).get();
assert.ok(trainingTask.get('content').content.some(n=>n.type==='tt'&&n.attrs.kind==='exam'));
console.log('Training creation uses native trainer forms.');
