import test from 'node:test';import assert from 'node:assert/strict';
import {editUntilReady} from '../../functions/ai/editorial.js';import {GenerationError} from '../../functions/ai/errors.js';
const usage={inputTokens:10,outputTokens:10},bad={checks:[{score:2}],criticalErrors:['Improve the task'],suggestions:[]},good={checks:[{score:4}],criticalErrors:[],suggestions:[]};
test('an invalid editorial patch is retried against the last valid draft before another review',async()=>{
 let reviews=0,repairs=0;const snapshots=[],original={text:'original'};
 const out=await editUntilReady({value:original,deadline:Date.now()+90000,reserve:async()=>{},checkpoint:async s=>snapshots.push(structuredClone(s)),review:async()=>({value:++reviews===1?bad:good,usage}),repair:async(value,feedback)=>{
 assert.deepEqual(value,original);if(++repairs===1){const error=new GenerationError('editorial_patch');error.usage=usage;throw error;}assert.match(feedback.criticalErrors.at(-1),/unchanged currentDraft/);return {value:{text:'improved'},usage};
 },check:()=>{}});
 assert.equal(reviews,2);assert.equal(out.repairs,2);assert.equal(out.usage.length,4);assert.deepEqual(original,{text:'original'});assert.equal(snapshots.at(-1).value.text,'improved');
});
test('invalid replacement content never overwrites the saved valid checkpoint',async()=>{
 const saved=[];await assert.rejects(editUntilReady({value:{text:'valid'},deadline:Date.now()+90000,reserve:async()=>{},checkpoint:async s=>saved.push(s.value),review:async()=>({value:bad,usage}),repair:async()=>({value:{text:'broken'},usage}),check:()=>{throw Error('invalid duration');}}),e=>e.reason==='editorial');
 assert.deepEqual(saved,[{text:'valid'}]);
});
test('provider failures do not trigger paid editorial repair retries',async()=>{
 let repairs=0;await assert.rejects(editUntilReady({value:{},deadline:Date.now()+90000,reserve:async()=>{},review:async()=>({value:bad,usage}),repair:async()=>{repairs++;throw new GenerationError('billing');},check:()=>{}}),e=>e.reason==='billing');assert.equal(repairs,1);
});
