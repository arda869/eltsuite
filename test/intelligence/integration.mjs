// Actual callable, Firestore emulator and mock model. Never production or billable.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator required');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
initializeApp({projectId:'demo-ai-access'});process.env.ELT_AI_ENABLED='true';process.env.ELT_AI_MODEL='gpt-6.1-sol';process.env.OPENAI_API_KEY='test-only';
const {lessonAssistant}=await import('../../functions/ai/assistant.js');
const db=getFirestore(),uid='intelligence-teacher',classId='intelligence-class';
await db.doc('users/'+uid).set({role:'teacher'});await db.doc('accounts/'+uid).set({});await db.doc('aiPilot/'+uid).set({enabled:true,lessonIntelligence:true});
const cls=db.doc('classes/'+classId);await cls.set({teacherId:uid,name:'A1 introduction',level:'A1',learningProfile:{ageGroup:'Young learners',courseType:'General English',goals:'Ask about familiar objects.',needs:''}});
await cls.collection('learners').doc('private-learner').set({authUid:'private-uid',displayName:'PRIVATE_LEARNER_NAME'});
const call=data=>lessonAssistant.run({auth:{uid,token:{}},data:{classId,question:'',excluded:[],...data}});
let calls=0,lastInput,lastFormat;const originalFetch=globalThis.fetch;
const option={title:'Find a shared interest',objectives:'Ask and answer about preferences.',activityType:'Speaking information gap',learnerAction:'Ask a partner and choose one shared interest.',interaction:'Pairs',minutes:45,sequence:['Meet each other','Ask about interests','Make a shared choice'],rationale:'A social first lesson.',differentiation:'Optional visual prompts.',transition:'Use the example exchange.',evidenceIds:['class']};
globalThis.fetch=async(_url,options)=>{calls++;const request=JSON.parse(options.body);lastInput=JSON.parse(request.input);lastFormat=request.text.format.name;const value=lastFormat==='lesson_intelligence_patch'?{...lastInput.before,instructions:'Ask your partner, then agree on one shared choice.',reason:'Give the exchange a concrete outcome.'}:{summary:'No evidence of mastery is inferred.',findings:[{title:'Recorded context',kind:'unknown',observation:'Use an informal diagnostic.',reasoning:'Missing work is unknown.',evidenceIds:['class'],confidence:'tentative'}],options:[option,{...option,title:'Choose a group challenge'}],limitations:['No reliable learner-level judgement.']};return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]})};};
try{
 await assert.rejects(call({action:'intelligenceContext',classId:'another-class'}));assert.equal(calls,0);
 const initial=await call({action:'intelligenceContext'});assert.equal(initial.context.completedLessons,0);assert.ok(!JSON.stringify(initial).includes('PRIVATE_LEARNER_NAME'));
 const first=await call({action:'intelligenceAsk',mode:'nextLesson',requestId:'first'});assert.equal(first.turn.response.options.length,2);assert.equal(lastInput.context.completedLessons,0);assert.equal(lastInput.context.sources[0].data.profile.ageGroup,'Young learners');assert.equal(lastFormat,'lesson_intelligence');
 await call({action:'intelligenceAsk',mode:'nextLesson',requestId:'first'});assert.equal(calls,1,'Exact retry must not bill again');
 const brief=await call({action:'intelligenceBrief',turnId:'first',optionIndex:0});assert.equal(brief.handoff.brief.duration,45);assert.equal(brief.handoff.classId,classId);
 for(let i=0;i<7;i++){
 const item=cls.collection('items').doc('lesson'+i);await item.set({title:'Lesson '+i,createdAt:Timestamp.now()});await item.collection('tasks').doc('task').set({kind:'task',title:'Compare',instructions:'Talk together.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Choose a place.'}]}]},order:0});
 await call({action:'intelligenceConfirmLesson',itemId:item.id,aims:'Ask about places '+i,note:'',coverage:[{objective:'Ask about places',stage:i?'recycled':'introduced'}],completed:true});
 }
 await assert.rejects(call({action:'intelligenceBrief',turnId:'first',optionIndex:0}),/changed/);
 const next=await call({action:'intelligenceAsk',mode:'nextLesson',requestId:'after-seven'});assert.equal(next.context.completedLessons,7);assert.equal(lastInput.conversation.length,0,'Stale context cannot leak through conversation');assert.ok(lastInput.context.sources.some(s=>s.id==='lesson:lesson6'));
 await call({action:'intelligenceAsk',mode:'nextLesson',requestId:'excluded',excluded:['lesson:lesson6']});assert.ok(!lastInput.context.sources.some(s=>s.id==='lesson:lesson6'));assert.equal(lastInput.conversation.length,0);
 const task=cls.collection('items').doc('lesson0').collection('tasks').doc('task'),original=(await task.get()).data();
 const proposal=await call({action:'intelligenceProposeEdit',itemId:'lesson0',taskId:'task',requestId:'edit',question:'Make the instruction purposeful.'});assert.equal((await task.get()).get('instructions'),'Talk together.');assert.equal(proposal.proposal.after.instructions,'Ask your partner, then agree on one shared choice.');
 await call({action:'intelligenceApplyEdit',itemId:'lesson0',taskId:'task',requestId:'edit'});assert.deepEqual((await task.get()).get('content'),original.content);assert.equal((await cls.collection('items').doc('lesson1').collection('tasks').doc('task').get()).get('instructions'),'Talk together.');
 await call({action:'intelligenceUndoEdit',itemId:'lesson0',taskId:'task',requestId:'edit'});assert.deepEqual((await task.get()).data(),original);assert.equal((await task.collection('private').doc('notes').get()).exists,false);
 await call({action:'intelligenceProposeEdit',itemId:'lesson0',taskId:'task',requestId:'stale',question:'Clarify the instruction.'});await task.update({instructions:'Teacher’s newer instruction.'});await assert.rejects(call({action:'intelligenceApplyEdit',itemId:'lesson0',taskId:'task',requestId:'stale'}),/changed/);assert.equal((await task.get()).get('instructions'),'Teacher’s newer instruction.');
 await db.doc('aiPilot/'+uid).update({lessonIntelligence:false});await assert.rejects(call({action:'intelligenceContext'}),/not enabled/);await assert.rejects(call({action:'intelligenceUndoEdit',itemId:'lesson0',taskId:'task',requestId:'edit'}),/not enabled/);
 await db.doc('aiPilot/'+uid).update({lessonIntelligence:true});await db.doc('accounts/'+uid).set({suspended:true});await assert.rejects(call({action:'intelligenceContext'}));
 console.log('Lesson Intelligence callable/emulator: access, pilot rollback, blank optional fields, young-learner first lesson, seven confirmed lessons, source exclusion, stale adapter protection, idempotency, scoped preview/apply/undo and concurrent-edit preservation passed. Model responses are mocked.');
}finally{globalThis.fetch=originalFetch;}
