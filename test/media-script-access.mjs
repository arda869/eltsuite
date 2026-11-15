import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ts from 'typescript';
import { accessMediaScript, issueMediaQrGrantForTeacher, savedMediaMode } from '../functions/media/script-access.js';

if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('A disposable Firestore emulator is required.');
const projectId=process.env.GCLOUD_PROJECT || 'demo-ordinary-media-script-privacy';
const env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});
const deps=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=deps('firebase-admin/app');
const {getFirestore}=deps('firebase-admin/firestore');
const app=initializeApp({projectId});
const admin=getFirestore(app);
const classId='script-class',itemId='lesson',mediaId='recording';
const teacherId='script-teacher',recipientId='script-recipient',learnerId='script-learner',outsiderId='script-outsider';
const teacher=env.authenticatedContext(teacherId).firestore();
const recipient=env.authenticatedContext(recipientId).firestore();
const learner=env.authenticatedContext(learnerId).firestore();
const visitor=env.unauthenticatedContext().firestore();
const auth=uid=>({uid,token:{}});
const input=(taskId,extra={})=>({classId,itemId,taskId,mediaId,...extra});
const node=mode=>({type:'doc',content:[{type:'media',attrs:{media:mediaId,scriptMode:mode}}]});
const script=[{t:0,e:2,text:'The answer is the blue lantern.'}];
const seedTask=async (taskId,mode,extra={})=>admin.doc(`classes/${classId}/items/${itemId}/tasks/${taskId}`).set({kind:'task',hidden:false,locked:false,content:node(mode),...extra});
const denies=async promise=>assert.rejects(promise,error=>error?.code==='permission-denied');

try{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'users',teacherId),{role:'teacher'});
    await setDoc(doc(db,'users',recipientId),{role:'teacher'});
    await setDoc(doc(db,'users',learnerId),{role:'learner',classId});
    await setDoc(doc(db,'classes',classId),{teacherId,status:'active'});
    await setDoc(doc(db,'classes',classId,'members',learnerId),{learnerId:'L1'});
    await setDoc(doc(db,'classes',classId,'items',itemId),{hidden:false,locked:false,type:'lesson'});
  });
  await Promise.all(['karaoke','button','none','after'].map(mode=>seedTask(mode,mode)));
  await seedTask('locked','karaoke',{locked:true});
  await admin.doc(`classes/${classId}/media/${mediaId}`).set({kind:'audio',title:'Recording',size:0,public:true,duration:2,parts:1});
  await admin.doc(`classes/${classId}/media/${mediaId}_p0`).set({part:0,data:'YXVkaW8=',size:5,public:true});
  await admin.doc(`classes/${classId}/mediaScripts/${mediaId}`).set({script,aiGenerated:false,updatedAt:Date.now()});
  const publicManifest=await assertSucceeds(getDoc(doc(learner,`classes/${classId}/media/${mediaId}`)));
  assert.equal(publicManifest.data().script,undefined,'learner-readable manifest has no script');
  assert.ok((await assertSucceeds(getDoc(doc(visitor,`classes/${classId}/media/${mediaId}_p0`)))).data().data,'unsigned QR still loads audio bytes');
  await assertFails(getDoc(doc(learner,`classes/${classId}/mediaScripts/${mediaId}`)));
  await assertFails(getDoc(doc(visitor,`classes/${classId}/mediaScripts/${mediaId}`)));
  assert.deepEqual((await assertSucceeds(getDoc(doc(teacher,`classes/${classId}/mediaScripts/${mediaId}`)))).data().script,script);
  await assertFails(setDoc(doc(teacher,`classes/${classId}/media/new-public`),{kind:'audio',size:0,public:true,script}));

  await denies(accessMediaScript(admin,null,input('karaoke')));
  await denies(accessMediaScript(admin,auth(outsiderId),input('karaoke')));
  assert.deepEqual((await accessMediaScript(admin,auth(learnerId),input('karaoke'))).script,script);
  assert.deepEqual((await accessMediaScript(admin,auth(learnerId),input('button'))).script,script);
  assert.deepEqual((await accessMediaScript(admin,auth(learnerId),input('none'))).script,[]);
  await denies(accessMediaScript(admin,auth(learnerId),input('locked')));
  assert.equal(savedMediaMode({type:'doc',content:[node('karaoke'),node('none')]},mediaId),'none','strictest duplicate placement wins');

  const now=Date.now();
  const started=await accessMediaScript(admin,auth(learnerId),input('after',{action:'start'}),now);
  assert.ok(started.session);
  assert.equal(started.waitMs,2000);
  assert.deepEqual((await accessMediaScript(admin,auth(learnerId),input('after',{session:started.session,scriptMode:'karaoke'}),now+100)).script,[],'a changed requested mode cannot bypass the delay');
  assert.deepEqual((await accessMediaScript(admin,auth(learnerId),input('after',{session:started.session}),now+2100)).script,script);
  await denies(accessMediaScript(admin,auth(outsiderId),input('after',{session:started.session}),now+2100));

  const grant=(await issueMediaQrGrantForTeacher(admin,auth(teacherId),input('karaoke'))).grant;
  assert.ok(grant);
  assert.deepEqual((await accessMediaScript(admin,null,input('karaoke',{grant}))).script,script,'teacher-issued QR releases the saved visible mode');
  await denies(accessMediaScript(admin,null,input('button',{grant})));
  await admin.doc(`classes/${classId}/items/${itemId}/tasks/karaoke`).update({content:node('none')});
  assert.deepEqual((await accessMediaScript(admin,null,input('karaoke',{grant}))).script,[],'changing the task to Hidden revokes script access');
  await admin.doc(`classes/${classId}/items/${itemId}`).update({locked:true});
  await denies(issueMediaQrGrantForTeacher(admin,auth(teacherId),input('button')));
  await denies(accessMediaScript(admin,null,input('karaoke',{grant})));
  await admin.doc(`classes/${classId}/items/${itemId}`).update({locked:false});
  await admin.doc(`classes/${classId}/members/${learnerId}`).delete();
  await denies(accessMediaScript(admin,auth(learnerId),input('button')));
  await admin.doc(`classes/${classId}/members/${learnerId}`).set({learnerId:'L1'});
  await admin.doc(`accounts/${learnerId}`).set({suspended:true});
  await denies(accessMediaScript(admin,auth(learnerId),input('button')));
  await admin.doc(`accounts/${learnerId}`).delete();

  const offlineSource=readFileSync('src/offline/scriptPolicy.ts','utf8');
  const compiled=ts.transpileModule(offlineSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {offlineLearnerScript}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  assert.deepEqual(offlineLearnerScript('none',script),[],'offline Hidden payload contains no script');
  assert.deepEqual(offlineLearnerScript('after',script),[],'offline After payload contains no script before playback');
  assert.deepEqual(offlineLearnerScript('karaoke',script),script,'intentionally visible karaoke still works offline');
  assert.deepEqual(offlineLearnerScript('unexpected',script),[],'unknown offline modes fail closed');
  await admin.doc('shares/teacher-share').set({owner:teacherId,mode:'link',people:[],kind:'media',title:'Shared recording'});
  await admin.doc('shares/teacher-share/media/recording').set({kind:'audio',public:true,size:0,script});
  await assertFails(getDoc(doc(learner,'shares/teacher-share/media/recording')));
  await assertFails(getDoc(doc(visitor,'shares/teacher-share/media/recording')));
  assert.deepEqual((await assertSucceeds(getDoc(doc(teacher,'shares/teacher-share/media/recording')))).data().script,script,'teacher-to-teacher copies retain the editable transcript');
  assert.deepEqual((await assertSucceeds(getDoc(doc(recipient,'shares/teacher-share/media/recording')))).data().script,script,'a signed-in teacher can receive the shared transcript');

  const legacy=admin.doc(`classes/${classId}/media/legacy`);
  await legacy.set({kind:'link',size:0,public:true,script});
  const migrate=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/migrate-class-media-scripts.mjs',...args],{env:{...process.env,GCLOUD_PROJECT:projectId},encoding:'utf8',timeout:30000}));
  assert.equal(migrate().totals.legacyScripts,1);
  assert.deepEqual((await legacy.get()).get('script'),script,'dry run does not change production-shaped data');
  assert.throws(()=>migrate('--apply','--expected-legacy-count=2'),'changed preflight count blocks migration');
  assert.equal(migrate('--apply','--expected-legacy-count=1').totals.migrated,1);
  assert.equal((await legacy.get()).get('script'),undefined);
  assert.deepEqual((await admin.doc(`classes/${classId}/mediaScripts/legacy`).get()).get('script'),script);
  assert.equal(migrate().totals.legacyScripts,0,'migration is idempotent');
  console.log('Class scripts: anonymous and nonmember denial, QR audio and grant, delayed release, revocation, offline payload and migration passed.');
}finally{
  await admin.terminate();
  await deleteApp(app);
  await env.cleanup();
}
