import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedKey,hasAnswer,taskQuestions} from '../../functions/ai/task-keys.js';
test('keys fill missing answers without accepting out-of-range selections',()=>{
 assert.equal(hasAnswer({kind:'gap',answers:[]}),false);assert.equal(hasAnswer({kind:'gap',answers:['went']}),true);
 assert.deepEqual(checkedKey({type:'gap',attrs:{id:'g'}},{answers:[' went ','went']}),{kind:'gap',answers:['went']});
 assert.throws(()=>checkedKey({type:'choice',attrs:{id:'c',options:['a','b']}},{correct:2}));
 assert.deepEqual(checkedKey({type:'choice',attrs:{id:'c',options:['a','b']}},{correct:0}),{kind:'mcq',correct:0});
 assert.throws(()=>checkedKey({type:'writing',attrs:{id:'w'}},{model:''}));
});
test('nested inline questions are found and worked examples excluded',()=>{
 const q=taskQuestions({type:'doc',content:[{type:'subTask',content:[{type:'paragraph',content:[{type:'gap',attrs:{id:'g'}},{type:'gap',attrs:{id:'example',example:true}}]}]}]});
 assert.equal(q.has('g'),true);assert.equal(q.has('example'),false);
});
test('pack keys validate token and category bounds',()=>{
 assert.throws(()=>checkedKey({type:'pq',attrs:{kind:'highlight',data:{toks:['a','b']}}},{k:{groups:[[2]]}}));
 assert.throws(()=>checkedKey({type:'pq',attrs:{kind:'categorise',data:{items:['a'],cats:['noun']}}},{k:{map:[1]}}));
 assert.deepEqual(checkedKey({type:'pq',attrs:{kind:'categorise',data:{items:['a'],cats:['noun']}}},{k:{map:[0]}}),{kind:'pack',t:'categorise',k:{map:[0]}});
 assert.equal(hasAnswer({kind:'pack',t:'odd',k:{odd:0}}),true);
});
