import test from 'node:test';
import assert from 'node:assert/strict';
import {responseText,selectedMemories,collectMemories} from '../../functions/ai/memories.js';
test('off never reads learner answers, even with selected IDs',async()=>{
 assert.deepEqual(await selectedMemories({collection(){throw Error('Must not read');}},'c',false,['a:q']),[]);
});
test('rich answers include text, not attachment attributes or arbitrary objects',()=>{
 assert.equal(responseText({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'I visited Rome.'}]},{type:'image',attrs:{src:'secret'}}]}),'I visited Rome. ');
 assert.equal(responseText({password:'secret'}),'');
 assert.equal(responseText('x'.repeat(1000)).length,600);
});
test('selection is reloaded from this class and accepts only submitted writing',async()=>{
 const docs=[{id:'a',data:()=>({submittedAt:123,itemId:'i',taskId:'t',learnerId:'l',responses:{q:'I visited Rome last year.',gap:'I visited Paris last year.'}})}];
 const record=(data)=>({exists:true,get:k=>data[k],data:()=>data});
 const node=path=>({collection:n=>node(path+'/'+n),doc:n=>node(path+'/'+n),orderBy:()=>node(path),limit:()=>node(path),
 get:async()=>path.endsWith('/answers')?{docs}:path.endsWith('/learners/l')?record({displayName:'Alex'}):path.endsWith('/private/key')?record({q:{kind:'writing'},gap:{kind:'gap'}}):record({title:path.endsWith('/tasks/t')?'Travel stories':'Last week'})});
 const db={collection:n=>node(n)};
 const candidates=await collectMemories(db,'c');
 assert.equal(candidates.length,1);assert.equal(candidates[0].name,'Alex');
 assert.deepEqual(await selectedMemories(db,'c',true,['other:q']),[]);
 assert.equal((await selectedMemories(db,'c',true,['a:q']))[0].text,'I visited Rome last year.');
 await assert.rejects(()=>selectedMemories(db,'c',true,Array(6).fill('a:q')));
});
