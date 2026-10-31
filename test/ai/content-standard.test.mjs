import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../../functions/ai/provider.js';
import { activityInstructions } from '../../functions/ai/activities.js';
import { contentStandards, youngLearnerStandards } from '../../functions/ai/pedagogy.js';
import { readFileSync } from 'node:fs';
const schema={type:'object',properties:{ok:{type:'string',minLength:1,maxLength:10}},required:['ok'],additionalProperties:false};
test('editorial standard reaches actual outline, plan and native-activity API requests',async()=>{
 for(const [name,level,instructions] of [['outline','A1',undefined],['plan','C1',undefined],['activities','B1',activityInstructions]]) {
  let sent;
  await generate({apiKey:'test',model:'gpt-6.1-sol',name,schema,input:{brief:{level}},...(instructions?{instructions}:{}),
   fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":"yes"}'}]}],usage:{input_tokens:10,output_tokens:10}})};}});
  assert.ok(sent.instructions.includes(contentStandards),name+' lost editorial standards');
  assert.equal(JSON.parse(sent.input).brief.level,level);
  if(name==='plan') assert.match(sent.instructions,/Preserve every stage ID/);
  if(name==='outline') { assert.match(sent.instructions,/OUTLINE ONLY/); assert.match(sent.instructions,/interaction is only the participation pattern/); }
 }
});
test('the existing advisory review evaluates learner material without another paid review step',()=>{
 const source=readFileSync(new URL('../../functions/ai/assistant.js',import.meta.url),'utf8');
 assert.match(source,/\$\{contentReviewStandard\}/);
 assert.equal((source.match(/name: 'review'/g)||[]).length,1);
});

test('young-learner standards follow the class profile through generation and review, not an A1 label',async()=>{
 for(const ageGroup of ['Young learners','Adults']) for(const name of ['outline','plan','activities','review']) {
  let sent;
  await generate({apiKey:'test',model:'gpt-6.1-sol',name,schema,input:{brief:{level:'A1'},classProfile:{ageGroup,needs:'Pre-readers; use oral responses.'}},
   ...(name==='activities'?{instructions:activityInstructions}:{}),
   fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":"yes"}'}]}],usage:{input_tokens:10,output_tokens:10}})};}});
  assert.equal(sent.instructions.includes(youngLearnerStandards),ageGroup==='Young learners',name);
  assert.equal(JSON.parse(sent.input).classProfile.ageGroup,ageGroup);
 }
 const source=readFileSync(new URL('../../functions/ai/assistant.js',import.meta.url),'utf8');
 assert.match(source,/classProfile: payload.classProfile/);
});

test('originality and distinct language/trainer standards reach every provider request',async()=>{
 const {originalityStandard,referenceLessonStandard,trainerSessionStandard}=await import('../../functions/ai/pedagogy.js');
 for(const training of [false,true]) for(const name of ['outline','plan','activities','review']) {
  let sent;
  await generate({apiKey:'test',model:'gpt-6.1-sol',name,schema,input:{trainingProfile:training?{programme:'CELTA'}:null},instructions:'Task-specific instructions',
   fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":"yes"}'}]}],usage:{input_tokens:10,output_tokens:10}})};}});
  assert.ok(sent.instructions.includes(originalityStandard));
  assert.equal(sent.instructions.includes(trainerSessionStandard),training);
  assert.equal(sent.instructions.includes(referenceLessonStandard),!training);
 }
});

test('lesson standards do not change the separate teaching-coach instructions',async()=>{
 let sent;
 await generate({apiKey:'test',model:'gpt-6.1-sol',name:'teaching_coach',schema,input:{},instructions:'Reflective coaching only.',
 fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":"yes"}'}]}],usage:{input_tokens:10,output_tokens:10}})};}});
 assert.equal(sent.instructions.trim(),'Reflective coaching only.');
});
