import test from 'node:test';
import assert from 'node:assert/strict';
import {compactSchema} from '../../functions/ai/compact-schema.js';
import {activitySchema} from '../../functions/ai/activities.js';
import {generationSchema} from '../../functions/ai/contract.js';
import {stageContract} from '../../functions/ai/sequence.js';
function expand(node,root=node){if(!node||typeof node!=='object')return node;if(node.$ref)return expand(root.$defs[node.$ref.slice(8)],root);return Array.isArray(node)?node.map(v=>expand(v,root)):Object.fromEntries(Object.entries(node).filter(([k])=>k!=='$defs').map(([k,v])=>[k,expand(v,root)]));}
test('compact activity schemas preserve every constraint including named stage references',()=>{
 const approved={stages:Array.from({length:9},(_,i)=>({id:String(i),title:'Stage',aim:'Use language',minutes:10,interaction:'pairs'}))};
 for(const source of [activitySchema,stageContract('activities',generationSchema(activitySchema),approved).schema]){
  const before=structuredClone(source),after=compactSchema(source);
  assert.deepEqual(expand(after),expand(source));assert.deepEqual(source,before);
  assert.ok(JSON.stringify(after).length<JSON.stringify(source).length*0.6);
  assert.deepEqual(expand(compactSchema(after)),expand(source));
 }
});
