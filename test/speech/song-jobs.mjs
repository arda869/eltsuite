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
await build({entryPoints:[new URL('../../functions/songs/index.js',import.meta.url).pathname],outfile:output.pathname,bundle:true,platform:'node',format:'esm',packages:'external'});const originalFetch=globalThis.fetch;let musicCalls=0,lyricCalls=0;
globalThis.fetch=async(url,opts)=>{
 if(String(url).includes('generativelanguage.googleapis.com')){musicCalls++;return {ok:true,json:async()=>({steps:[{type:'model_output',content:[{type:'audio',data:Buffer.alloc(1000,1).toString('base64'),mime_type:'audio/mpeg'}]}]})};}
 if(String(url).includes('api.openai.com')){lyricCalls++;return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({lyrics:'A fresh draft.\nSing along.'})}]}],usage:{input_tokens:100,output_tokens:30}})};}
 return originalFetch(url,opts);
};
try{
 const {recordingSong,recordingLyrics,recordingSongResult}=await import(pathToFileURL(output.pathname).href);
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
 await db.doc(`songPrivate/${uid}`).set({jobId:'another',busyUntil:Date.now()+60000});
 await assert.rejects(recordingSong.run(request(uid,{id:'song-locked-12345678',brief,approved:true})),e=>e.code==='resource-exhausted');
 await db.doc(`songPrivate/${uid}`).set({busyUntil:0});
 const day=new Date().toISOString().slice(0,10);await db.doc(`songUsage/${day}/teachers/${uid}`).set({song:3});
 await assert.rejects(recordingSong.run(request(uid,{id:'song-budget-12345678',brief,approved:true})),e=>e.code==='resource-exhausted');assert.equal(musicCalls,1);
 await db.doc(`songPrivate/${uid}/jobs/${id}`).update({expiresAt:Date.now()-1});
 await assert.rejects(recordingSongResult.run(request(uid,{id})),e=>e.code==='not-found');
 console.log('Song callable integration passed: auth, approval, real transaction deduplication, recovery, ownership, limits and expiration.');
}finally{globalThis.fetch=originalFetch;await unlink(output);await db.terminate();}
