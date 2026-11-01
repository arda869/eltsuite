import test from 'node:test';
import assert from 'node:assert/strict';
import {stageContract,allocateMinutes} from '../../functions/ai/sequence.js';
import {generateChecked} from '../../functions/ai/recovery.js';
import {planSchema,checkSequence} from '../../functions/ai/contract.js';
import {activitySchema,checkActivities} from '../../functions/ai/activities.js';
import {trainingActivitySchema} from '../../functions/ai/training.js';
import {describeFailure,GenerationError} from '../../functions/ai/errors.js';
const stages=[{id:'M7',title:'Discover',aim:'Notice language',minutes:7,interaction:'Pairs'},{id:'custom-id',title:'Use',aim:'Agree on a choice',minutes:13,interaction:'Pairs'}];
const sample=s=>s.type==='object'?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,sample(v)])):s.type==='array'?Array.from({length:s.minItems},()=>sample(s.items)):s.enum?s.enum[0]:s.type==='integer'?s.minimum:'Text';
test('plan slots preserve approved IDs, order, metadata and timings regardless of key order',()=>{
 const c=stageContract('plan',planSchema,{stages}), raw=sample(c.schema);
 raw.stages={stage_2:raw.stages.stage_2,stage_1:raw.stages.stage_1}; raw.learnerMaterials=[];
 const plan=c.decode(raw); checkSequence(plan,20);
 assert.deepEqual(plan.stages.map(({id,title,aim,minutes,interaction})=>({id,title,aim,minutes,interaction})),stages);
 delete raw.stages.stage_1; assert.throws(()=>c.decode(raw));
});
test('language and training activity slots allocate all approved minutes without losing tasks',()=>{
 for(const schema of [activitySchema,trainingActivitySchema]) {
  const c=stageContract('activities',schema,{stages}),raw=sample(c.schema);
  raw.tasks.stage_1.push(structuredClone(raw.tasks.stage_1[0]));
  for(const task of Object.values(raw.tasks).flat()) {task.format='reading';task.input='Read this original message.';task.blocks=[];task.definitions=[];task.mediaPlan=[];task.roles=[];task.versions=[];task.visuals=[];task.questions=[];task.subTasks=[];}
  const output=c.decode(raw); checkActivities(output,{stages},schema===trainingActivitySchema);
  assert.deepEqual(output.tasks.map(t=>t.stageId),['M7','M7','custom-id']);
  assert.deepEqual(output.tasks.map(t=>t.minutes),[4,3,13]);
  delete raw.tasks.stage_2;assert.throws(()=>c.decode(raw));
 }
});
test('minute allocation stays positive, deterministic and exact across lesson durations',()=>{
 for(let n=1;n<=12;n++)for(let total=n;total<=180;total++) {
  const result=allocateMinutes(Array.from({length:n},(_,i)=>i+1),total);
  assert.equal(result.reduce((a,b)=>a+b),total);assert.ok(result.every(v=>Number.isInteger(v)&&v>=1));
 }
});
test('one automatic content repair preserves and bills both successful provider passes',async()=>{
 let calls=0,reservations=0;
 const result=await generateChecked({args:{input:{brief:'approved'},instructions:'Rules'},generate:async args=>{calls++;if(calls===2){assert.equal(reservations,1);assert.equal(args.input.repair.issue,'Wrong key');}return {value:{valid:calls===2},usage:{inputTokens:1,outputTokens:2}}},decode:v=>v,check:v=>{if(!v.valid)throw Error('Wrong key');},reserveRepair:async()=>{reservations++}});
 assert.equal(calls,2);assert.equal(result.usage.length,2);assert.equal(result.value.valid,true);
});
test('repair is bounded; provider failures are not retried; activities errors are correctly identified',async()=>{
 let calls=0;
 const args={args:{input:{},instructions:''},decode:v=>v,check:()=>{throw Error('Wrong key')},reserveRepair:async()=>{}};
 await assert.rejects(generateChecked({...args,generate:async()=>{calls++;return {value:{},usage:{}}}}),e=>e.reason==='content');assert.equal(calls,2);
 calls=0;await assert.rejects(generateChecked({...args,generate:async()=>{calls++;throw new GenerationError('billing')}}));assert.equal(calls,1);
 assert.equal(describeFailure(new GenerationError('content'),'activities').phase,'activities');
});
