import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';

if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('A disposable Firestore emulator is required.');
const projectId='demo-ai-media-script-privacy';
const env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});
const deps=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=deps('firebase-admin/app');
const {getFirestore}=deps('firebase-admin/firestore');
const app=initializeApp({projectId});
const admin=getFirestore(app);
const {savePrepared}=await import('../../functions/ai/media-worker.js');
const {restorePreparedScript}=await import('../../functions/ai/prepared-script.js');
const classId='privacy-class',teacherId='privacy-teacher',learnerId='privacy-learner';
const aiId='ai_media_1234567890abcdef1234567890abcdef';
const teacher=env.authenticatedContext(teacherId).firestore();
const learner=env.authenticatedContext(learnerId).firestore();
const visitor=env.unauthenticatedContext().firestore();
const mediaPath=id=>`classes/${classId}/media/${id}`;
const scriptPath=id=>`classes/${classId}/mediaScripts/${id}`;
try{
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'users',teacherId),{role:'teacher'});
  await setDoc(doc(db,'users',learnerId),{role:'learner',classId});
  await setDoc(doc(db,'classes',classId),{teacherId});
  await setDoc(doc(db,'classes',classId,'members',learnerId),{uid:learnerId});
 });
 const script=[{t:0,e:1,text:'The hidden listening answer is Tuesday.',who:'Speaker'}];
 await savePrepared(admin,classId,aiId,Buffer.alloc(48044),{kind:'audio',title:'Privacy test',script});
 const publicManifest=await assertSucceeds(getDoc(doc(learner,mediaPath(aiId))));
 assert.equal(publicManifest.data().script,undefined,'learner-readable manifest must contain no script');
 assert.equal(publicManifest.data().kind,'audio');
 assert.equal((await assertSucceeds(getDoc(doc(learner,mediaPath(`${aiId}_p0`))))).data().data.length>0,true,'audio bytes remain readable for playback');
 assert.deepEqual((await assertSucceeds(getDoc(doc(teacher,scriptPath(aiId))))).data().script,script);
 await assertFails(getDoc(doc(learner,scriptPath(aiId))));
 await assertFails(getDoc(doc(visitor,scriptPath(aiId))));
 await admin.doc(`aiPrivate/${teacherId}/jobs/private-listening`).set({mediaPlan:[{script:'The hidden listening answer is Tuesday.'}]});
 await assertFails(getDoc(doc(learner,`aiPrivate/${teacherId}/jobs/private-listening`)));
 await assertFails(setDoc(doc(teacher,mediaPath('new_ai_manifest')),{kind:'audio',aiGenerated:true,script,size:0,public:false}));
 await assertFails(updateDoc(doc(teacher,mediaPath(aiId)),{script}));
 await assertFails(setDoc(doc(learner,scriptPath('learner-write')),{script,aiGenerated:true,updatedAt:Date.now()}));

 // A previously generated recording is copied to private storage before its public
 // transcript is removed; the authorized teacher can still retrieve the same words.
 const oldId='ai_media_abcdef1234567890abcdef1234567890';
 await admin.doc(mediaPath(oldId)).set({kind:'audio',aiGenerated:true,public:false,size:0,script});
 const recovered=await restorePreparedScript(admin,teacherId,classId,oldId);
 assert.deepEqual(recovered.script,script);
 assert.equal((await admin.doc(mediaPath(oldId)).get()).get('script'),undefined);
 assert.deepEqual((await admin.doc(scriptPath(oldId)).get()).get('script'),script);
 await assertFails(getDoc(doc(learner,scriptPath(oldId))));
 const editedId='ai_media_0123456789abcdef0123456789abcdef';
 const edited=[{t:0,e:1,text:'Corrected teacher transcript.'}];
 await admin.doc(mediaPath(editedId)).set({kind:'audio',aiGenerated:true,public:false,size:0,script});
 await admin.doc(scriptPath(editedId)).set({script:edited,aiGenerated:true,updatedAt:Date.now()});
 assert.deepEqual((await restorePreparedScript(admin,teacherId,classId,editedId)).script,edited,'private teacher edit must win over older public copy');
 assert.equal((await admin.doc(mediaPath(editedId)).get()).get('script'),undefined);
 const migrationId='ai_media_fedcba9876543210fedcba9876543210';
 await admin.doc(mediaPath(migrationId)).set({kind:'audio',aiGenerated:true,public:false,size:0,script});
 const migration=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/migrate-ai-audio-scripts.mjs',...args],{
  env:{...process.env,GCLOUD_PROJECT:projectId},encoding:'utf8',timeout:30000,
 }));
 const dryRun=migration();
 assert.equal(dryRun.mode,'dry-run');
 assert.equal(dryRun.totals.legacyScripts,1);
 assert.deepEqual((await admin.doc(mediaPath(migrationId)).get()).get('script'),script,'dry run must not write');
 assert.throws(()=>migration('--apply','--expected-legacy-count=2'),'a changed count must block all writes');
 assert.deepEqual((await admin.doc(mediaPath(migrationId)).get()).get('script'),script);
 const applied=migration('--apply','--expected-legacy-count=1');
 assert.equal(applied.totals.migrated,1);
 assert.equal((await admin.doc(mediaPath(migrationId)).get()).get('script'),undefined);
 assert.deepEqual((await admin.doc(scriptPath(migrationId)).get()).get('script'),script);
 assert.equal(migration('--apply','--expected-legacy-count=0').totals.legacyScripts,0,'migration must be idempotent');
 console.log('AI media scripts: teacher-only transcript, learner audio playback, write denial and legacy recovery passed.');
}finally{
 await admin.terminate();
 await deleteApp(app);
 await env.cleanup();
}
