import test from 'node:test';
import assert from 'node:assert/strict';
import {senseCheckImport,importTaskHash} from '../../functions/ai/import-review.js';
import {importLesson,importElements,asImportModel} from './import-types-fixture.mjs';
const source={name:'Worksheet',text:'The capital of France is ___. Answer: Paris.',images:[],instructions:'',scope:'item'};
const lesson=()=>importLesson([{...importElements.gap,prompt:'The capital of France is ___.',data:{answers:['Paris']}}]);
const verdict=(tasks,issues=[])=>({value:{tasks:tasks.map(t=>({stageId:t.stageId,summary:issues.length?'Incorrect key compared with source.':'Instructions, native gap interaction and key match the source.',issues}))}});
test('each task is checked against the original including blank optional instructions',async()=>{
 const rebuilt=lesson();rebuilt.tasks.push({...structuredClone(rebuilt.tasks[0]),stageId:'second'});let calls=0;
 const r=await senseCheckImport({rebuilt,source,training:false,run:async o=>{calls++;assert.equal(o.name,'importSenseCheck');assert.equal(o.input.sourceText,source.text);assert.equal(o.input.teacherChanges,'');assert.equal(o.input.tasks.length,2);return verdict(o.input.tasks);}});
 assert.equal(calls,1);assert.ok(r.checks.every(c=>c.status==='passed'));assert.equal(r.checks[0].hash,importTaskHash(r.rebuilt.tasks[0]));
});
test('wrong answers are repaired from source and independently rechecked before being marked repaired',async()=>{
 const rebuilt=lesson();rebuilt.tasks[0].inlineElements[0].data.answers=['London'];const names=[];
 const r=await senseCheckImport({rebuilt,source,training:false,run:async o=>{names.push(o.name);if(o.name==='importRepair'){assert.equal(o.input.sourceIssues[0].sourceEvidence,'Answer: Paris.');return {value:asImportModel(lesson())};}return verdict(o.input.tasks,names.length===1?[{problem:'Wrong key.',sourceEvidence:'Answer: Paris.',improvement:'Use Paris.'}]:[]);}});
 assert.deepEqual(names,['importSenseCheck','importRepair','importSenseCheck']);assert.equal(r.checks[0].status,'repaired');assert.deepEqual(r.rebuilt.tasks[0].inlineElements[0].data.answers,['Paris']);assert.deepEqual(rebuilt.tasks[0].inlineElements[0].data.answers,['London']);
});
test('provider failures, incomplete verdict coverage and exhausted time never claim a passed check',async()=>{
 for(const run of [async()=>{throw Error('unavailable');},async()=>({value:{tasks:[]}})]){
  const r=await senseCheckImport({rebuilt:lesson(),source,training:false,run});assert.equal(r.checks[0].status,'needsReview');
 }
 let called=false;const r=await senseCheckImport({rebuilt:lesson(),source,training:false,deadline:0,run:async()=>{called=true;}});assert.equal(called,false);assert.equal(r.checks[0].status,'needsReview');
});
test('failed repair preserves original; a repair that fails recheck stays unresolved',async()=>{
 const issue={problem:'Unclear instruction.',sourceEvidence:'Complete the gap.',improvement:'Retain the original instruction.'};
 for(const fail of [true,false]){
  const r=await senseCheckImport({rebuilt:lesson(),source,training:false,run:async o=>{if(o.name==='importRepair'){if(fail)throw Error('bad response');return {value:asImportModel(lesson())};}return verdict(o.input.tasks,[issue]);}});
  assert.equal(r.checks[0].status,'needsReview');assert.equal(r.rebuilt.tasks.length,1);
 }
});
test('even a model pass cannot override missing source resources or classroom setup',async()=>{
 const rebuilt=importLesson([{...importElements.gap,needs:['recording']}]);
 const r=await senseCheckImport({rebuilt,source,training:false,run:async o=>verdict(o.input.tasks)});
 assert.equal(r.checks[0].status,'needsReview');assert.ok(r.checks[0].issues.some(i=>/recording/i.test(i.problem)));
});
test('review hashes ignore object key order and detect altered private answers',()=>{
 const a=lesson().tasks[0],b=Object.fromEntries(Object.entries(a).reverse());assert.equal(importTaskHash(a),importTaskHash(b));b.inlineElements=structuredClone(a.inlineElements);b.inlineElements[0].data.answers=['Rome'];assert.notEqual(importTaskHash(a),importTaskHash(b));
});
