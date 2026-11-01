// Disposable emulator + stubbed provider only. This is NOT a live AI image test.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-ai-access'});process.env.OPENAI_API_KEY='test-only';
const {designerImage}=await import('../../functions/designer/index.js');
const db=getFirestore(),fileId='designer-test';
for(const uid of ['designer-owner','designer-editor','designer-viewer','designer-stranger']){await db.doc('users/'+uid).set({role:'teacher'});await db.doc('accounts/'+uid).set({});}
await db.doc('sharedDocs/'+fileId).set({kind:'design',owner:'designer-owner',members:{'designer-editor':{role:'edit'},'designer-viewer':{role:'view'}},memberIds:['designer-editor','designer-viewer']});
let generations=0,probes=0;const fetchOriginal=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('/models/')){probes++;return {ok:true};}
 generations++;const body=JSON.parse(options.body);assert.ok(body.prompt);
 if(String(url).endsWith('/edits'))assert.match(body.images[0].image_url,/^data:image\/png;base64,/);
 return {ok:true,json:async()=>({data:[{b64_json:'aW1hZ2U='}]})};
};
const run=(uid,data,token={})=>designerImage.run({auth:{uid,token},data:{fileId,...data}});
try {
 for(const uid of ['designer-viewer','designer-stranger'])await assert.rejects(run(uid,{action:'connection'}));
 await assert.rejects(run('designer-owner',{action:'connection'},{proxyBy:'x'}));
 assert.equal(probes,0);
 assert.equal((await run('designer-owner',{action:'connection'})).ready,true);assert.equal(probes,1);assert.equal(generations,0);
 await assert.rejects(run('designer-owner',{action:'create',requestId:'empty',prompt:''}));assert.equal(generations,0);
 const data={action:'create',requestId:'original',prompt:'A blue chair'};
 const result=await run('designer-owner',data);assert.equal(result.status,'completed');
 assert.equal((await run('designer-owner',data)).resultId,result.resultId);assert.equal(generations,1);
 assert.equal((await run('designer-owner',{action:'status',requestId:'original'})).status,'completed');assert.equal(generations,1);
 await db.doc('sharedDocs/'+fileId+'/media/source').set({data:'data:image/png;base64,aW1hZ2U='});
 await assert.rejects(run('designer-editor',{action:'edit',requestId:'foreign',prompt:'Change it',imageId:'not-in-this-file'}));assert.equal(generations,1);
 assert.equal((await run('designer-editor',{action:'erase',requestId:'erased',prompt:'The chair',imageId:'source'})).status,'completed');assert.equal(generations,2);
 const original=(await db.doc('sharedDocs/'+fileId+'/media/source').get()).get('data');assert.equal(original,'data:image/png;base64,aW1hZ2U=');
 await db.doc('aiAllowances/designer-owner').set({limits:{designerImage:0}});
 await assert.rejects(run('designer-owner',{...data,requestId:'blocked'}));assert.equal(generations,2);
 console.log('Designer: access isolation, non-billable connection probe, empty prompt, idempotency, recovery, source preservation and allowance checks passed (mock provider).');
} finally {globalThis.fetch=fetchOriginal;}
