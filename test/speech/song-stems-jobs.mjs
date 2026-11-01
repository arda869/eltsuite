// Real Firestore/callables; source separation is deliberately simulated here.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const deps=createRequire(new URL('../../functions/package.json',import.meta.url));const {initializeApp}=deps('firebase-admin/app'),{getFirestore}=deps('firebase-admin/firestore');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Use the Firestore emulator.');initializeApp({projectId:'demo-song-stems'});const db=getFirestore();
const {prepareStems,recordingSongStems}=await import('../../functions/songs/stems.js');const {recordingSongResult}=await import('../../functions/songs/index.js');
const uid='stem-teacher',id='song-stems-12345678',ref=db.doc(`songPrivate/${uid}/jobs/${id}`),request=(uid,data)=>({auth:{uid,token:{}},data});
try{
 await db.doc('users/'+uid).set({role:'teacher'});await db.doc('users/other-stems').set({role:'teacher'});
 await ref.set({kind:'song',status:'complete',parts:1,mime:'audio/mpeg',createdAt:Date.now(),expiresAt:Date.now()+86400000});await ref.collection('parts').doc('0').set({bytes:Buffer.alloc(1500,1)});
 await assert.rejects(recordingSongStems.run({data:{id}}),e=>e.code==='unauthenticated');await assert.rejects(recordingSongStems.run(request('other-stems',{id})),e=>e.code==='not-found');
 let calls=0;const separate=async(bytes,progress)=>{calls++;assert.equal(bytes.length,1500);await progress(.5);await new Promise(r=>setTimeout(r,100));return {vocals:Buffer.alloc(3000,2),instrumental:Buffer.alloc(3100,3),mime:'audio/mpeg',duration:30};};
 await Promise.all([prepareStems(db,uid,id,separate),prepareStems(db,uid,id,separate)]);assert.equal(calls,1);
 const meta=await recordingSongResult.run(request(uid,{id,metaOnly:true}));assert.equal(meta.stems.status,'complete');assert.equal(meta.audio,undefined);
 for(const stem of ['vocals','instrumental']){const result=await recordingSongResult.run(request(uid,{id,stem}));assert.equal(Buffer.from(result.audio,'base64').length,stem==='vocals'?3000:3100);}
 const original=await recordingSongResult.run(request(uid,{id}));assert.equal(Buffer.from(original.audio,'base64').length,1500);
 await prepareStems(db,uid,id,separate);assert.equal(calls,1,'recovering complete tracks must not separate again');
 await assert.rejects(recordingSongResult.run(request('other-stems',{id,stem:'vocals'})),e=>e.code==='not-found');await assert.rejects(recordingSongResult.run(request(uid,{id,stem:'unknown'})),e=>e.code==='invalid-argument');
 await ref.update({stems:{status:'failed'}});await assert.rejects(prepareStems(db,uid,id,async()=>{throw Error('provider diagnostic must stay private');}),e=>e.code==='unavailable'&&!e.message.includes('provider diagnostic'));
 assert.equal((await recordingSongResult.run(request(uid,{id}))).status,'complete');await prepareStems(db,uid,id,separate);assert.equal(calls,2);
 await ref.update({stems:{status:'working',busyUntil:Date.now()-1}});assert.equal((await recordingSongResult.run(request(uid,{id,metaOnly:true}))).stems.status,'failed');await prepareStems(db,uid,id,separate);assert.equal(calls,3);
 await ref.update({expiresAt:Date.now()-1});await assert.rejects(prepareStems(db,uid,id,separate),e=>e.code==='not-found');
 console.log('Song stems: real auth, ownership, transactions, duplicate protection, progress, isolated tracks, original preservation, retry and expiry passed (separator simulated).');
}finally{await db.recursiveDelete(db.doc('songPrivate/'+uid));await db.terminate();}
