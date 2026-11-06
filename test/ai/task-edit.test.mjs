import test from 'node:test';
import assert from 'node:assert/strict';
import {editableTaskFields,applyTaskTextEdits,editSchema} from '../../functions/ai/task-edit.js';
import {validate} from '../../functions/ai/contract.js';
import {activityMainInstruction} from '../../functions/ai/activities.js';
const source={id:'task',title:'Travel',instructions:'Complete.',notes:'Notes',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'I ___ to Paris.'},{type:'gap',attrs:{id:'g',answers:[]}}]},{type:'paragraph',content:[{type:'picture',attrs:{src:'media:photo',alt:'Paris'}}]}]},key:{g:{kind:'gap',answers:['went']}}};
const result={summary:'Clearer context',changes:[{path:'content/content/0/content/0/text',before:'I ___ to Paris.',after:'Last year I ___ to Paris.'}],answers:[{questionId:'g',answerJson:JSON.stringify({kind:'gap',answers:['went','travelled']})}]};
test('text edits preserve layout, ids, pictures, original data and update the private key',()=>{
 validate(editSchema,result);const edited=applyTaskTextEdits(source,result);
 assert.equal(edited.id,'task');assert.equal(edited.content.content[0].content[1].attrs.id,'g');assert.deepEqual(edited.content.content[1],source.content.content[1]);assert.deepEqual(edited.key.g.answers,['went','travelled']);assert.equal(source.content.content[0].content[0].text,'I ___ to Paris.');
 assert.ok(!editableTaskFields(source).some(f=>f.path.endsWith('/src')||f.path.endsWith('/id')||f.path.endsWith('/type')));
});
test('reject stale, duplicate, secret and prototype edits; reject missing or invalid keys',()=>{
 for(const changes of [[{...result.changes[0],before:'stale'}],[result.changes[0],result.changes[0]],[{path:'content/__proto__/polluted',before:'',after:'yes'}],[{path:'content/content/1/content/0/attrs/src',before:'media:photo',after:'https://evil.test'}]])assert.throws(()=>applyTaskTextEdits(source,{...result,changes}));
 assert.throws(()=>applyTaskTextEdits(source,{...result,answers:[]}));assert.throws(()=>applyTaskTextEdits(source,{...result,answers:[{questionId:'g',answerJson:'{"kind":"mcq","correct":0}'}]}));
});
test('optional answers remain empty for title-only edits; subtask main instructions are blank',()=>{
 const edited=applyTaskTextEdits(source,{summary:'Title',changes:[{path:'title',before:'Travel',after:'A journey to remember'}],answers:[]});assert.deepEqual(edited.key,source.key);
 assert.equal(activityMainInstruction({instructions:'Read.',subTasks:[{instructions:'Read and choose.'}]}),'');assert.equal(activityMainInstruction({instructions:'Read.',subTasks:[]}),'Read.');
});
