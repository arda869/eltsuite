// Emulator + mock provider: no paid generation and no production writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-ai-access'});
process.env.ELT_AI_ENABLED='true';process.env.ELT_AI_MODEL='gpt-6.1-sol';process.env.OPENAI_API_KEY='test-only';
const {lessonAssistant}=await import('../../functions/ai/assistant.js');
const db=getFirestore(),uid='tools-teacher',classId='tools-class',itemId='lesson';
await db.doc('users/'+uid).set({role:'teacher'});await db.doc('accounts/'+uid).set({});await db.doc('aiPilot/'+uid).set({enabled:true});
await db.doc('classes/'+classId).set({teacherId:uid,level:'A2'});
const item=db.doc(`classes/${classId}/items/${itemId}`);await item.set({title:'Yesterday',type:'lesson',taskCount:1});
const source=item.collection('tasks').doc('first');const content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Yesterday I '},{type:'gap',attrs:{id:'missing',answers:[]}},{type:'text',text:' to the park.'}]},{type:'paragraph',content:[{type:'gap',attrs:{id:'kept',answers:[]}}]}]};
await source.set({kind:'task',title:'Complete',instructions:'Complete the sentence.',content,order:0,hidden:false,locked:false});await source.collection('private').doc('key').set({missing:{kind:'gap',answers:[]},kept:{kind:'gap',answers:['already correct']}});
const call=data=>lessonAssistant.run({auth:{uid,token:{}},data:{classId,itemId,taskId:'first',direction:'',step:'generate',mode:'answers',...data}});
let calls=0;const fetchOriginal=globalThis.fetch;
const body={blocks:[],definitions:[],structures:[],subTasks:[],visuals:[],input:'Yesterday we visited a park.',questions:[{format:'choice',acceptedAnswers:[],prompt:'Yesterday I ___ to the park.',options:['went','go'],answer:'went',explanation:'Yesterday is in the past.'}]};
const activity={stageId:'tool',title:'Yesterday in the park',format:'choice',mediaPlan:[],layout:'stacked',imageLayout:'row',teacherOnlyInput:'',roles:[],minutes:10,instructions:'Choose the correct word.',...body,versions:[],teacherNotes:'Check the past form.',support:'',challenge:''};
globalThis.fetch=async(url,options)=>{calls++;const req=JSON.parse(options.body);let value;if(req.text.format.name==='task_keys')value={entries:[{taskId:'first',questionId:'missing',answerJson:JSON.stringify({answers:['went']}),reason:'The sentence refers to yesterday.'}],issues:[]};else if(req.text.format.name==='task_ideas')value={ideas:[{title:'Add choices',reason:'Recognition reduces recall demand.',direction:'Change the gap to two choices.',kind:'support'},{title:'Remove support',reason:'Recall the form independently.',direction:'Use an open gap.',kind:'challenge'}]};else value={title:'Yesterday',rationale:'Practice',differentiation:'Recognition',recycling:'Past time',tasks:[activity]};return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]})};};
try {
 const result=await call({action:'taskTools',requestId:'keys'});assert.equal(result.result.entries.length,1);
 await call({action:'taskToolsApply',requestId:'keys'});await call({action:'taskToolsApply',requestId:'keys'});
 assert.deepEqual((await source.collection('private').doc('key').get()).get('kept.answers'),['already correct']);assert.deepEqual((await source.collection('private').doc('key').get()).get('missing.answers'),['went']);assert.deepEqual((await source.get()).get('content'),content);assert.equal(calls,1);
 const ideas=await call({action:'taskTools',mode:'differentiate',step:'ideas',requestId:'ideas'});assert.equal(ideas.result.ideas.length,2);
 await call({action:'taskTools',mode:'differentiate',requestId:'variant',variantLabel:'Supported',direction:'Add choices.'});
 await db.doc('aiPrivate/'+uid+'/jobs/variant/media/image-proof').set({kind:'image',title:'Reference image',alt:'A park',credit:'Original photographer · CC BY 4.0',mediaId:'stored-test',status:'ready'});
 const preview=await call({action:'taskToolsStatus',requestId:'variant'});assert.ok(JSON.stringify(preview.result.native.content).includes('Original photographer · CC BY 4.0'));
 const applied=await call({action:'taskToolsApply',requestId:'variant'});assert.equal(applied.taskId,'tool_variant');
 const variant=await item.collection('tasks').doc(applied.taskId).get();assert.equal(variant.get('family'),'first');assert.equal(variant.get('restricted'),true);assert.equal(variant.get('content'),null);assert.equal((await variant.ref.collection('private').doc('key').get()).get('q0_0.correct'),0);
 await call({action:'taskToolsApply',requestId:'variant'});assert.equal((await item.collection('tasks').get()).size,2);
 await call({action:'taskTools',mode:'next',requestId:'next',direction:'Another practice activity.'});await call({action:'taskToolsApply',requestId:'next'});assert.equal((await item.collection('tasks').doc('tool_next').get()).get('order'),1);
 await call({action:'taskTools',mode:'differentiate',requestId:'stale',direction:'Add choices.'});await source.update({instructions:'New teacher instruction'});await assert.rejects(call({action:'taskToolsApply',requestId:'stale'}),/changed/);
 await db.doc('classes/other-tools-class').set({teacherId:'other'});await assert.rejects(call({action:'taskTools',requestId:'denied',classId:'other-tools-class'}));
 console.log('Lesson tools: private missing keys, preserved existing keys/content, linked variants, append ordering, idempotency, stale-edit protection and class access passed (mock provider).');
} finally {globalThis.fetch=fetchOriginal;}
