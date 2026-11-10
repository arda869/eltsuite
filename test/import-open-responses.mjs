import assert from 'node:assert/strict';
import test from 'node:test';
import {fromImportModel} from '../functions/ai/import-model.js';
import {nativeImportedElements} from '../functions/ai/import-elements.js';

const modelElement=(answer)=>({kind:'shortAnswer',prompt:'Write two things the customer could say.',selectionReason:'A short worksheet answer.',feedback:'Check both are polite requests.',example:false,needs:[],answers:[answer]});
const convert=answer=>fromImportModel({tasks:[{inlineElements:[modelElement(answer)],subTasks:[]}]}).tasks[0].inlineElements[0];

test('teacher-review labels produce an unscored written response, not a literal correct answer',()=>{
 const element=convert('Open answer.');
 assert.equal(element.kind,'writing');
 const native=nativeImportedElements([element]);
 assert.equal(native.content.at(-1).type,'writing');
 assert.equal(native.content.at(-1).attrs.minWords,null);
 assert.equal(native.content.at(-1).attrs.maxWords,null);
 assert.ok(!JSON.stringify(native.key).includes('Open answer'));
});

test('real short answers remain automatically checkable',()=>{
 const element=convert('three apples');
 assert.equal(element.kind,'shortAnswer');
 const native=nativeImportedElements([element]);
 assert.equal(native.content.at(-1).content[0].text,'Write two things the customer could say. ');
 assert.ok(JSON.stringify(native.key).includes('three apples'));
});
