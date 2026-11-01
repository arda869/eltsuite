// Actual callable handler + Firestore emulator. OpenAI HTTP is simulated, never billed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fields} from '../../functions/definitions/contract.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-teaching-help'});const db=getFirestore();
process.env.OPENAI_API_KEY='test-only';
const {teachingDefinition}=await import('../../functions/definitions/index.js');
for(const [uid,role]of [['def-teacher','teacher'],['def-learner','learner'],['def-viewer','teacher']])await db.doc('users/'+uid).set({role});
await db.doc('classes/def-class').set({teacherId:'def-teacher',level:'A1',learningProfile:{ageGroup:'Young learners'},langs:['Turkish'],coTeachers:{'def-viewer':{role:'viewer'}}});
await db.doc('classes/def-class/items/river').set({title:'A walk by the river'});
await db.doc('classes/def-class/items/river/tasks/read').set({order:0,title:'Read',instructions:'Read the story.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'We sat on the bank of the river.'}]}]}});
await db.doc('classes/def-class/items/river/tasks/read/private/key').set({privateAnswer:'MUST_NOT_BE_SENT'});
await db.doc('classes/def-class/learners/person').set({name:'MUST_NOT_BE_SENT'});
const request={word:'bank',context:'We sat on the bank of the river.',focus:'',level:'C2',classId:'def-class',lessonId:'river',requestId:'normal'};
let calls=0,imageCalls=0,failImage=false;const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)==='https://api.openai.com/v1/images/generations'){imageCalls++;if(failImage)throw Error('Simulated picture failure');const b=JSON.parse(options.body);assert(b.prompt.includes('Bright classroom illustration')||b.prompt.includes('Adult editorial illustration'));const bytes=Buffer.alloc(150);bytes[0]=255;bytes[1]=216;return {ok:true,json:async()=>({data:[{b64_json:bytes.toString('base64')}]})};}
 if(String(url)!=='https://api.openai.com/v1/responses')return oldFetch(url,options);
 calls++;const body=JSON.parse(options.body),input=JSON.parse(body.input);
 assert.equal(body.store,false);assert(!JSON.stringify(input).includes('MUST_NOT_BE_SENT'));
 if(input.lesson){assert.equal(input.learners.level,'A1');assert.equal(input.learners.ageGroup,'Young learners');assert(input.lesson.tasks[0].text.includes('river'));}
 const v={data:{...Object.fromEntries(fields.map(k=>[k,''])),meaning:'The land at the side of a river.',example:'We sat on the river bank.',pos:'noun'},illustration:{useful:input.word==='bank',prompt:'A grassy river bank beside flowing water.',alt:'A grassy bank beside a river.',reason:'The river sense is easy to show.'},translations:input.translationLanguages.includes('Turkish')?[{language:'Turkish',text:'nehir kıyısı'}]:[],needsContext:false,note:'The surrounding river sentence selects the intended meaning.'};
 return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:1000,output_tokens:500},output:[{content:[{type:'output_text',text:JSON.stringify(v)}]}]})};
};
const call=(data=request,uid='def-teacher',token={})=>teachingDefinition.run({auth:{uid,token},data});
try{
 await assert.rejects(teachingDefinition.run({data:request}));
 await assert.rejects(call(request,'def-learner'));await assert.rejects(call(request,'def-viewer'));await assert.rejects(call(request,'def-teacher',{proxyBy:'admin'}));
 await db.doc('classes/foreign').set({teacherId:'another-teacher'});await assert.rejects(call({...request,classId:'foreign'}));assert.equal(calls,0);
 const result=await call();assert.equal(result.picture.style,'bright');assert.equal(result.picture.status,'ready');assert.equal(imageCalls,1);assert.equal(result.level,'A1');assert.equal(result.data.meaning,'The land at the side of a river.');assert.deepEqual(await call(),result);assert.equal(calls,1,'Retry must reuse draft');
 assert.equal((await db.doc('aiFeatureUsage/def-teacher/days/'+new Date().toISOString().slice(0,10)).get()).get('counts.definitions'),1);
 const job=(await db.doc('aiPrivate/def-teacher/jobs/definition_normal').get()).data();assert.equal(job.action,'definition');assert(!Object.hasOwn(job,'context'));assert(!Object.hasOwn(job,'word'));assert(job.expiresAt);
 await assert.rejects(call({...request,word:'look after'}));
 assert.equal(imageCalls,1,'Cached retries must not regenerate a picture');
 await db.doc('classes/def-class').update({kind:'training'});const training=await call({...request,requestId:'training'});assert.equal(training.picture.style,'editorial');assert.equal(calls,2);
 await db.doc('classes/def-class').update({kind:'language'});
 await call({...request,classId:'',lessonId:'',level:'A2',context:'',focus:'',requestId:'standalone'});assert.equal(calls,3);
 const before=calls;
 const existing=await call({...request,hasImage:true,requestId:'existing'});assert.equal(existing.picture.status,'existing');
 const textOnly=await call({...request,word:'although',requestId:'abstract'});assert.equal(textOnly.picture.status,'not-needed');
 failImage=true;const failedRequest={...request,requestId:'failed-image'};const failed=await call(failedRequest);assert.equal(failed.picture.status,'failed');assert(failed.data.meaning);const imageAttempts=imageCalls;
 await call(failedRequest);assert.equal(imageCalls,imageAttempts,'Plain retries cannot repeat a failed paid picture');
 failImage=false;const retried=await call({...failedRequest,action:'picture'});assert.equal(retried.picture.status,'ready');assert.equal(calls,before+3,'Picture retry cannot redraft the definition');
 await db.doc('aiAllowances/def-teacher').set({limits:{designerImage:0}});const capped=await call({...request,requestId:'image-cap'});assert.equal(capped.picture.status,'failed');assert(capped.picture.error.includes('disabled'));assert(capped.data.meaning);
 const countAfter=calls;
 await db.doc('aiAllowances/def-teacher').set({limits:{definitions:0}});await assert.rejects(call({...request,requestId:'blocked'}));assert.equal(calls,countAfter);
 await db.doc('classes/def-class').update({teacherId:'someone-else'});await assert.rejects(call());assert.equal(calls,countAfter);
 console.log('PASS: real callable/database; teacher scope, proxy/learner/viewer/foreign rejection; A1 class overrides client C2; only learner-facing lesson context; blank optional focus; standalone; idempotency; usage block; revoked access. Model HTTP simulated.');
}finally{globalThis.fetch=oldFetch;await db.terminate();}
