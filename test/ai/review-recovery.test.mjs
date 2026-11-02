import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../../src/ai/reviewRecovery.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {withReviewRecovery}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('resumes a saved review once without replacing the original request',async()=>{
 const payload={requestId:'original',action:'plan'},seen=[];let notified=0;
 const result=await withReviewRecovery(async()=>{seen.push(payload);if(seen.length===1)throw {details:{resumable:true,phase:'review',reason:'editorial'}};return {plan:'reviewed'};},()=>notified++);
 assert.deepEqual(result,{plan:'reviewed'});assert.equal(seen.length,2);assert.equal(seen[0],seen[1]);assert.equal(notified,1);
});
test('does not loop or retry non-resumable, billing or unrelated operations',async()=>{
 for(const details of [{resumable:true,phase:'review',reason:'billing'},{resumable:false,phase:'review',reason:'editorial'},{resumable:true,phase:'activities',reason:'timeout'}]){let calls=0;await assert.rejects(withReviewRecovery(async()=>{calls++;throw {details};},()=>assert.fail('Unexpected retry')));assert.equal(calls,1);}
 let calls=0;await assert.rejects(withReviewRecovery(async()=>{calls++;throw {details:{resumable:true,phase:'review',reason:'editorial'}};},()=>{}));assert.equal(calls,2);
});
