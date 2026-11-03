// Explicit, bounded production probe. Run only for a release marked [verify-ai-costs].
// Creates a dedicated verification identity; never impersonates a real user.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
if(process.env.AI_COST_LIVE_VERIFY!=='true')throw Error('Explicit live-verification flag required.');
initializeApp({credential:applicationDefault(),projectId:'lesson-lit'});const db=getFirestore(),auth=getAuth();
const run=process.env.GITHUB_RUN_ID??'manual',uid='cost-verification-'+run,email=uid+'@eltsuite.invalid',marker='ai-cost-intelligence-v1';
const apiKey=readFileSync('src/lib/firebaseConfig.ts','utf8').match(/apiKey:\s*"([^"]+)"/)[1]; // Public Firebase web configuration.
let browser;const profile=db.doc('users/'+uid),grant=db.doc('superAdmins/'+email),probe=db.doc('aiCostVerification/'+run);
async function call(token,name,data){const r=await fetch('https://us-central1-lesson-lit.cloudfunctions.net/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(550000)});const b=await r.json();if(!r.ok||b.error){const e=Error(name+': '+(b.error?.message??r.status));e.status=b.error?.status;throw e;}return b.result??b.data;}
try{
 if((await probe.get()).get('complete')){console.log('This release probe already completed. No generation repeated.');process.exit(0);}
 const prior=await profile.get();if(prior.exists&&prior.get('_verification')!==marker)throw Error('Verification identity collision.');
 let u;try{u=await auth.getUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
 if(!u)await auth.createUser({uid,email,emailVerified:true,displayName:'AI cost verification'});else if(u.email!==email)throw Error('Verification identity collision.');
 await auth.updateUser(uid,{disabled:false});await profile.set({role:'teacher',displayName:'AI cost verification',email,_verification:marker});
 const custom=await auth.createCustomToken(uid);
 const sign=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
 if(!sign.ok)throw Error('Verification sign-in failed.');const {idToken}=await sign.json();
 await assert.rejects(call('', 'adminAiCosts',{action:'report'}));
 await assert.rejects(call(idToken,'adminAiCosts',{action:'report'}),e=>e.status==='PERMISSION_DENIED');
 await grant.set({_verification:marker,name:'Temporary release verification'});
 const initial=await call(idToken,'adminAiCosts',{action:'report'});assert.equal(initial.features.length,21);assert.equal(initial.invoiceConfirmedMicroUsd,null);
 const brief={title:'An ordinary day, a small surprise',audience:'Adults',level:'A1',style:'Gentle acoustic pop',delivery:'Solo singer',duration:30,focus:'',prompt:'',lyrics:''};
 const lyricId='lyrics-cost-'+run,songId='song-cost-'+run;
 let draft=await call(idToken,'recordingLyrics',{id:lyricId,brief});if(!draft.lyrics)draft=await call(idToken,'recordingSongResult',{id:lyricId});assert.ok(draft.lyrics?.trim());
 console.log('LIVE PASS: lyric draft with optional focus, prompt and lesson blank.');
 // Review the returned text before accepting it. Preserve it exactly for song generation.
 assert.ok(draft.lyrics.length<=6000);const accepted=draft.lyrics;
 await call(idToken,'recordingSong',{id:songId,brief:{...brief,lyrics:accepted},approved:true});
 const song=await call(idToken,'recordingSongResult',{id:songId});assert.equal(song.status,'complete');assert.ok(song.audio?.length>1000);
 browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();
 const playback=await page.evaluate(async({audio,mime})=>{const bytes=Uint8Array.from(atob(audio),c=>c.charCodeAt(0)),ctx=new AudioContext();const decoded=await ctx.decodeAudioData(bytes.buffer.slice(0));const player=new Audio(URL.createObjectURL(new Blob([bytes],{type:mime})));await player.play();await new Promise(r=>setTimeout(r,1200));const result={duration:decoded.duration,advanced:player.currentTime>0,playing:!player.paused};player.pause();await ctx.close();return result;},{audio:song.audio,mime:song.mime});assert.ok(playback.duration>5&&playback.advanced&&playback.playing);
 console.log('LIVE PASS: approved lyrics → music generation → result recovery → browser audio decoding and playback.');
 // Reopening an existing song must not add another cost attempt.
 const before=await db.collection('aiCostAttempts').where('actorUid','==',uid).get();await call(idToken,'recordingSong',{id:songId,brief:{...brief,lyrics:accepted},approved:true});await call(idToken,'recordingSongResult',{id:songId});const after=await db.collection('aiCostAttempts').where('actorUid','==',uid).get();assert.equal(before.size,after.size);
 const records=after.docs.map(d=>d.data());for(const feature of ['lyrics','song']){const rows=records.filter(r=>r.feature===feature);assert.ok(rows.length);assert.ok(rows.every(r=>r.teacherUid===uid&&r.status==='success'));assert.ok(rows.every(r=>Number.isSafeInteger(r.costMicroUsd)&&r.costMicroUsd>0));assert.ok(rows.every(r=>r.basis!=='invoice_confirmed'));}
 const report=await call(idToken,'adminAiCosts',{action:'report'});assert.ok(report.attempts>=records.length);
 await probe.set({complete:true,verifiedAt:Date.now(),actorUid:uid,checks:['unauthenticated rejection','teacher rejection','21-feature report with defaults','live lyrics','approved lyrics','live song','recovery','browser playable audio','duplicate request does not add costs','provider usage and calculated costs'],records:records.map(r=>({feature:r.feature,provider:r.provider,model:r.model,costMicroUsd:r.costMicroUsd,basis:r.basis}))});
 console.log('LIVE PASS: cost ledger, teacher attribution, admin report and duplicate protection. No credit deductions or payments.');
 mkdirSync('outputs/ai-costs',{recursive:true});writeFileSync('outputs/ai-costs/live-verification.json',JSON.stringify({run,checks:(await probe.get()).get('checks'),playback,costs:records.map(r=>({feature:r.feature,provider:r.provider,model:r.model,costMicroUsd:r.costMicroUsd,basis:r.basis}))},null,2));
}finally{
 await browser?.close();
 if((await grant.get()).get('_verification')===marker)await grant.delete();
 try{if((await auth.getUser(uid)).email===email){await auth.revokeRefreshTokens(uid);await auth.updateUser(uid,{disabled:true});}}catch{}
 await db.terminate();
}
